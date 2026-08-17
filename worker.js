/**
 * ficha-uss-proxy — Cloudflare Worker
 *
 * Hace dos cosas:
 *   1. POST /          → proxy de la API de Anthropic. Único punto que conoce
 *                        la clave; nunca viaja al navegador del estudiante.
 *   2. /entregas       → recibe el registro que el estudiante envía al docente
 *                        y permite al docente consultarlo.
 *
 * ── DESPLIEGUE ───────────────────────────────────────────────────────────
 *   1. npm install -g wrangler
 *   2. Editar ORIGENES más abajo con la URL real donde se publica la ficha.
 *   3. Crear el almacenamiento de entregas:
 *        wrangler kv namespace create ENTREGAS
 *      Copiar el id que devuelve al wrangler.toml (ejemplo al final).
 *   4. wrangler deploy
 *   5. Cargar los dos secretos:
 *        wrangler secret put ANTHROPIC_API_KEY   → la clave de Anthropic
 *        wrangler secret put DOCENTE_TOKEN       → una clave que inventes tú;
 *          es la que se pide en la página de entregas. Trátala como una
 *          contraseña: quien la tenga puede leer todos los registros.
 *
 * Sin el namespace ENTREGAS el proxy de IA sigue funcionando; solo queda
 * desactivada la recepción de entregas.
 *
 * ── wrangler.toml de ejemplo ─────────────────────────────────────────────
 *   name = "ficha-uss-proxy"
 *   main = "worker.js"
 *   compatibility_date = "2026-01-01"
 *
 *   [[kv_namespaces]]
 *   binding = "ENTREGAS"
 *   id = "pegar-aqui-el-id-que-devolvio-wrangler"
 *
 *   [[kv_namespaces]]
 *   binding = "LIMITES"
 *   id = "opcional, para el limite de peticiones"
 */

// ── Configuración ────────────────────────────────────────────────────────
const ORIGENES = [
  'https://arcoapp21.github.io',   // ← reemplazar por la URL de publicación
  'http://localhost:8000'               // para probar en tu computador
];

const MODELO = 'claude-sonnet-5';   // alternativa más barata: 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 1200;            // techo de salida, sin importar lo que pida el módulo
const MAX_CARACTERES = 24000;       // techo de entrada por petición a la IA
const LIMITE_HORA = 80;             // peticiones de IA por IP por hora (requiere KV LIMITES)

const MAX_ENTREGA = 900000;         // ~900 KB por entrega; las imágenes no se envían
const LIMITE_ENTREGAS_HORA = 10;    // entregas por IP por hora
const DIAS_RETENCION = 240;         // las entregas se borran solas pasado este plazo

const UPSTREAM = 'https://api.anthropic.com/v1/messages';

// ── Utilidades ───────────────────────────────────────────────────────────
function cabecerasCors(origen) {
  return {
    'Access-Control-Allow-Origin': origen,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Docente-Token',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function respuestaJson(objeto, estado, cors) {
  return new Response(JSON.stringify(objeto), {
    status: estado,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors)
  });
}

async function dentroDelLimite(kv, ip, tope, etiqueta) {
  if (!kv) return true;                        // sin KV configurado, no se limita
  const bloque = Math.floor(Date.now() / 3600000);
  const clave = `${etiqueta}:${ip}:${bloque}`;
  const usadas = parseInt((await kv.get(clave)) || '0', 10);
  if (usadas >= tope) return false;
  await kv.put(clave, String(usadas + 1), { expirationTtl: 3900 });
  return true;
}

/* Comparación en tiempo constante, para no filtrar el token carácter a carácter */
function tokenValido(recibido, esperado) {
  if (!esperado || typeof recibido !== 'string') return false;
  if (recibido.length !== esperado.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= recibido.charCodeAt(i) ^ esperado.charCodeAt(i);
  return dif === 0;
}

function textoPlano(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max || 120);
}

// ── 1. Proxy de la API ───────────────────────────────────────────────────
async function proxyIA(request, env, cors) {
  if (!env.ANTHROPIC_API_KEY) {
    return respuestaJson({ error: 'Falta configurar ANTHROPIC_API_KEY en el Worker.' }, 500, cors);
  }
  const ip = request.headers.get('CF-Connecting-IP') || 'anon';
  if (!(await dentroDelLimite(env.LIMITES, ip, LIMITE_HORA, 'ia'))) {
    return respuestaJson({ error: 'Límite de uso por hora alcanzado. Intenta más tarde.' }, 429, cors);
  }

  let cuerpo;
  try { cuerpo = await request.json(); }
  catch (e) { return respuestaJson({ error: 'Cuerpo JSON inválido.' }, 400, cors); }

  if (!Array.isArray(cuerpo.messages) || cuerpo.messages.length === 0) {
    return respuestaJson({ error: 'Falta el arreglo messages.' }, 400, cors);
  }

  let caracteres = 0;
  const mensajes = [];
  for (const m of cuerpo.messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') {
      return respuestaJson({ error: 'Formato de mensaje no admitido.' }, 400, cors);
    }
    caracteres += m.content.length;
    mensajes.push({ role: m.role, content: m.content });
  }
  if (typeof cuerpo.system === 'string') caracteres += cuerpo.system.length;
  if (caracteres > MAX_CARACTERES) {
    return respuestaJson({ error: 'La petición es demasiado extensa.' }, 413, cors);
  }

  // Se reconstruye el cuerpo desde cero: nada que venga del navegador
  // (modelo, herramientas, mcp_servers, stream) llega a la API.
  const carga = {
    model: MODELO,
    max_tokens: Math.min(parseInt(cuerpo.max_tokens, 10) || 800, MAX_TOKENS),
    messages: mensajes
  };
  if (typeof cuerpo.system === 'string') carga.system = cuerpo.system;

  let arriba;
  try {
    arriba = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(carga)
    });
  } catch (e) {
    return respuestaJson({ error: 'No se pudo contactar la API.' }, 502, cors);
  }

  const texto = await arriba.text();
  return new Response(texto, {
    status: arriba.status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors)
  });
}

// ── 2. Entregas ──────────────────────────────────────────────────────────
async function recibirEntrega(request, env, cors) {
  if (!env.ENTREGAS) {
    return respuestaJson({ error: 'La recepción de entregas no está configurada en el Worker.' }, 501, cors);
  }
  const ip = request.headers.get('CF-Connecting-IP') || 'anon';
  if (!(await dentroDelLimite(env.LIMITES, ip, LIMITE_ENTREGAS_HORA, 'entrega'))) {
    return respuestaJson({ error: 'Demasiadas entregas seguidas. Espera un momento.' }, 429, cors);
  }

  const crudo = await request.text();
  if (crudo.length > MAX_ENTREGA) {
    return respuestaJson({ error: 'La entrega es demasiado extensa.' }, 413, cors);
  }

  let cuerpo;
  try { cuerpo = JSON.parse(crudo); }
  catch (e) { return respuestaJson({ error: 'Cuerpo JSON inválido.' }, 400, cors); }

  const estudiante = textoPlano(cuerpo.estudiante, 80);
  const caso = textoPlano(cuerpo.caso, 60);
  if (!estudiante || !caso) {
    return respuestaJson({ error: 'Falta el nombre del estudiante o el código del caso.' }, 400, cors);
  }

  const ahora = new Date();
  const id = ahora.toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(36).slice(2, 8);

  const registro = {
    id,
    recibido: ahora.toISOString(),
    estudiante,
    caso,
    asignatura: textoPlano(cuerpo.asignatura, 80) || 'Introducción a la Clínica',
    contenido: cuerpo.contenido || {},
    markdown: typeof cuerpo.markdown === 'string' ? cuerpo.markdown.slice(0, 400000) : ''
  };

  await env.ENTREGAS.put('entrega:' + id, JSON.stringify(registro), {
    expirationTtl: DIAS_RETENCION * 86400,
    metadata: { estudiante, caso, recibido: registro.recibido }
  });

  return respuestaJson({ ok: true, id, recibido: registro.recibido }, 200, cors);
}

async function listarEntregas(request, env, cors) {
  if (!env.ENTREGAS) {
    return respuestaJson({ error: 'La recepción de entregas no está configurada.' }, 501, cors);
  }
  const url = new URL(request.url);
  const token = request.headers.get('X-Docente-Token') || url.searchParams.get('token');
  if (!tokenValido(token, env.DOCENTE_TOKEN)) {
    return respuestaJson({ error: 'Clave de acceso incorrecta.' }, 403, cors);
  }

  const id = url.searchParams.get('id');
  if (id) {
    const dato = await env.ENTREGAS.get('entrega:' + id);
    if (!dato) return respuestaJson({ error: 'Entrega no encontrada.' }, 404, cors);
    return new Response(dato, { headers: Object.assign({ 'Content-Type': 'application/json' }, cors) });
  }

  const lista = await env.ENTREGAS.list({ prefix: 'entrega:', limit: 1000 });
  const entregas = lista.keys.map(k => ({
    id: k.name.replace('entrega:', ''),
    estudiante: (k.metadata && k.metadata.estudiante) || '',
    caso: (k.metadata && k.metadata.caso) || '',
    recibido: (k.metadata && k.metadata.recibido) || ''
  })).sort((a, b) => (b.recibido || '').localeCompare(a.recibido || ''));

  return respuestaJson({ ok: true, total: entregas.length, entregas }, 200, cors);
}

// ── Enrutador ────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const origen = request.headers.get('Origin') || '';
    const autorizado = ORIGENES.includes(origen);
    const cors = cabecerasCors(autorizado ? origen : ORIGENES[0]);
    const ruta = new URL(request.url).pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (!autorizado) {
      return respuestaJson({ error: 'Origen no autorizado.' }, 403, cors);
    }

    if (ruta === '/entregas') {
      if (request.method === 'POST') return recibirEntrega(request, env, cors);
      if (request.method === 'GET') return listarEntregas(request, env, cors);
      return respuestaJson({ error: 'Método no admitido en /entregas.' }, 405, cors);
    }

    if (ruta === '/') {
      if (request.method !== 'POST') {
        return respuestaJson({ error: 'Solo se acepta POST.' }, 405, cors);
      }
      return proxyIA(request, env, cors);
    }

    return respuestaJson({ error: 'Ruta no encontrada.' }, 404, cors);
  }
};
