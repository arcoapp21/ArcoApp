/**
 * ficha-uss-proxy — Cloudflare Worker
 *
 * Hace tres cosas:
 *   1. POST /          → proxy de la API de Anthropic. Único punto que conoce
 *                        la clave; nunca viaja al navegador del estudiante.
 *   2. /entregas       → recibe el registro que el estudiante envía al docente
 *                        y permite al docente consultarlo.
 *   3. correo          → al recibir una entrega, envía por Resend el informe
 *                        del caso en PDF a la casilla interna del proyecto.
 *                        El envío es un efecto de la entrega, no una ruta
 *                        aparte: si el correo falla, la entrega igual queda
 *                        guardada en KV y el estudiante recibe el aviso.
 *
 * ── DESPLIEGUE ───────────────────────────────────────────────────────────
 *   1. npm install -g wrangler
 *   2. Editar ORIGENES más abajo con la URL real donde se publica la ficha.
 *   3. Crear el almacenamiento de entregas:
 *        wrangler kv namespace create ENTREGAS
 *      Copiar el id que devuelve al wrangler.toml (ejemplo al final).
 *   4. wrangler deploy
 *   5. Cargar los tres secretos:
 *        wrangler secret put ANTHROPIC_API_KEY   → la clave de Anthropic
 *        wrangler secret put DOCENTE_TOKEN       → una clave que inventes tú;
 *          es la que se pide en la página de entregas. Trátala como una
 *          contraseña: quien la tenga puede leer todos los registros.
 *        wrangler secret put RESEND_API_KEY      → la clave de Resend, para
 *          el envío del informe en PDF. Sin ella todo lo demás funciona:
 *          la entrega se guarda igual y el correo queda marcado como no
 *          enviado.
 *
 * Sin el namespace ENTREGAS el proxy de IA sigue funcionando; solo queda
 * desactivada la recepción de entregas.
 *
 * ── SOBRE EL REMITENTE DE RESEND ─────────────────────────────────────────
 * Mientras no haya un dominio verificado en Resend, el único remitente
 * admitido es onboarding@resend.dev y el único destinatario admitido es el
 * correo con que se creó la cuenta. Por eso REMITENTE apunta a resend.dev y
 * DESTINO apunta a la misma casilla de la cuenta. Al verificar un dominio
 * propio basta cambiar la variable REMITENTE_CORREO en wrangler.toml.
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

const MAX_ENTREGA = 3500000;        // ~3,5 MB por entrega, contando el PDF en base64
const MAX_PDF = 2600000;            // ~2,6 MB de base64 ≈ 1,9 MB de PDF
const LIMITE_ENTREGAS_HORA = 10;    // entregas por IP por hora
const DIAS_RETENCION = 240;         // las entregas se borran solas pasado este plazo

const UPSTREAM = 'https://api.anthropic.com/v1/messages';

// ── Correo (Resend) ──────────────────────────────────────────────────────
/* Casilla interna del proyecto. Es la misma cuenta con que se creó Resend:
   sin dominio verificado, es el único destinatario que el servicio acepta. */
const DESTINO = 'arcoapp.21@gmail.com';
const REMITENTE = 'ArcoApp <onboarding@resend.dev>';
const ASIGNATURA = 'Introducción a la Clínica';
const RESEND_URL = 'https://api.resend.com/emails';
const ESPERA_CORREO = 15000;        // ms antes de darse por vencido con Resend

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

function escaparHtml(v) {
  return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

/* Nombre de archivo seguro: sin espacios, acentos ni signos raros. */
function nombreArchivo(base) {
  return String(base || 'caso')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
    .slice(0, 60) || 'caso';
}

/* btoa solo entiende bytes; el texto de la ficha lleva acentos. */
function base64Utf8(texto) {
  const bytes = new TextEncoder().encode(String(texto || ''));
  let binario = '';
  const paso = 0x8000;
  for (let i = 0; i < bytes.length; i += paso) {
    binario += String.fromCharCode.apply(null, bytes.subarray(i, i + paso));
  }
  return btoa(binario);
}

/* Métricas de uso: se aceptan solo las claves conocidas y solo números.
   Nada de lo que llegue del navegador se guarda tal cual. */
function limpiarUso(u) {
  if (!u || typeof u !== 'object') return null;
  const num = function (v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  };
  const limpio = {
    consultasIA: num(u.consultasIA),
    minutos: num(u.minutos),
    modulosVisitados: num(u.modulosVisitados),
    modulosConDatos: num(u.modulosConDatos),
    camposCompletados: num(u.camposCompletados),
    imagenes: num(u.imagenes),
    sellosParciales: num(u.sellosParciales),
    selloIntegral: !!u.selloIntegral,
    alertasCoherencia: num(u.alertasCoherencia),
    primeraActividad: textoPlano(u.primeraActividad, 40),
    ultimaActividad: textoPlano(u.ultimaActividad, 40),
    navegador: textoPlano(u.navegador, 140),
    porModulo: {}
  };
  if (u.porModulo && typeof u.porModulo === 'object') {
    Object.keys(u.porModulo).slice(0, 40).forEach(function (k) {
      const m = u.porModulo[k] || {};
      limpio.porModulo[textoPlano(k, 60)] = {
        aperturas: num(m.aperturas),
        consultasIA: num(m.consultasIA),
        minutos: num(m.minutos)
      };
    });
  }
  return limpio;
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

// ── 2. Correo del informe (Resend) ───────────────────────────────────────
function cuerpoCorreo(registro) {
  const u = registro.uso || {};
  const fila = function (k, v) {
    return '<tr><td style="padding:5px 14px 5px 0;color:#5C5849;font-size:13px;">' + escaparHtml(k) +
      '</td><td style="padding:5px 0;color:#1A1814;font-size:13px;font-weight:500;">' + escaparHtml(v) + '</td></tr>';
  };
  const porModulo = Object.keys(u.porModulo || {})
    .filter(function (k) { return u.porModulo[k].consultasIA || u.porModulo[k].minutos; })
    .sort(function (a, b) { return (u.porModulo[b].consultasIA || 0) - (u.porModulo[a].consultasIA || 0); })
    .map(function (k) {
      const m = u.porModulo[k];
      return '<tr><td style="padding:3px 14px 3px 0;font-size:12px;color:#5C5849;">' + escaparHtml(k) +
        '</td><td style="padding:3px 14px 3px 0;font-size:12px;">' + (m.consultasIA || 0) + ' consultas</td>' +
        '<td style="padding:3px 0;font-size:12px;">' + (m.minutos || 0) + ' min</td></tr>';
    }).join('');

  return '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:640px;">' +
    '<div style="background:#1D3A6B;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;">' +
      '<div style="font-size:15px;font-weight:600;">Cierre de caso — ArcoApp</div>' +
      '<div style="font-size:12px;opacity:.7;margin-top:2px;">Ficha Clínica Adulto 2026 · Universidad San Sebastián</div>' +
    '</div>' +
    '<div style="border:1px solid #E2DED6;border-top:none;border-radius:0 0 8px 8px;padding:18px 20px;">' +
      '<table style="border-collapse:collapse;">' +
        fila('Caso', registro.caso) +
        fila('Estudiante', registro.estudiante) +
        fila('Asignatura', registro.asignatura) +
        fila('Recibido', registro.recibido) +
        fila('Identificador de la entrega', registro.id) +
        fila('Origen del envío', registro.origen === 'cierre' ? 'Cierre del caso' : 'Envío manual') +
      '</table>' +
      '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#9C9688;margin:18px 0 6px;">Uso de la aplicación</div>' +
      '<table style="border-collapse:collapse;">' +
        fila('Consultas al asistente', String(u.consultasIA == null ? '—' : u.consultasIA)) +
        fila('Tiempo estimado de trabajo', u.minutos ? u.minutos + ' min' : '—') +
        fila('Módulos con datos', String(u.modulosConDatos == null ? '—' : u.modulosConDatos)) +
        fila('Campos completados', String(u.camposCompletados == null ? '—' : u.camposCompletados)) +
        fila('Fundamentaciones selladas', String(u.sellosParciales == null ? '—' : u.sellosParciales) +
          (u.selloIntegral ? ' + integral' : '')) +
        fila('Imágenes cargadas (no se envían)', String(u.imagenes == null ? '—' : u.imagenes)) +
      '</table>' +
      (porModulo ? '<table style="border-collapse:collapse;margin-top:10px;">' + porModulo + '</table>' : '') +
      '<p style="font-size:12px;color:#5C5849;line-height:1.6;margin-top:18px;">' +
        'Se adjunta el informe del caso en PDF y su versión en Markdown. Las fotografías y ' +
        'radiografías no se envían: quedan en el computador del estudiante.</p>' +
      '<p style="font-size:11px;color:#9C9688;line-height:1.6;margin-top:10px;">' +
        'Correo automático generado al cerrar el caso. Copia interna del proyecto para el ' +
        'seguimiento del uso de la aplicación y del desempeño con el asistente.</p>' +
    '</div></div>';
}

/* Devuelve siempre un objeto de estado: nunca lanza. Un correo que falla no
   puede hacer perder la entrega del estudiante. */
async function enviarCorreo(env, registro, pdfBase64, markdown) {
  if (!env.RESEND_API_KEY) {
    return { enviado: false, error: 'RESEND_API_KEY no configurada en el Worker.' };
  }
  const destino = textoPlano(env.DESTINO_CORREO, 120) || DESTINO;
  const remitente = textoPlano(env.REMITENTE_CORREO, 140) || REMITENTE;
  const base = 'caso_' + nombreArchivo(registro.caso) + '_' + registro.recibido.slice(0, 10);

  const adjuntos = [];
  if (pdfBase64) adjuntos.push({ filename: base + '.pdf', content: pdfBase64 });
  if (markdown) adjuntos.push({ filename: base + '.md', content: base64Utf8(markdown) });

  const carga = {
    from: remitente,
    to: [destino],
    subject: '[ArcoApp] Caso ' + registro.caso + ' · ' + registro.estudiante +
      ' · ' + registro.recibido.slice(0, 10),
    html: cuerpoCorreo(registro),
    attachments: adjuntos
  };

  try {
    const respuesta = await Promise.race([
      fetch(RESEND_URL, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + env.RESEND_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(carga)
      }),
      new Promise(function (_, rechazar) {
        setTimeout(function () { rechazar(new Error('El servicio de correo no respondió a tiempo.')); }, ESPERA_CORREO);
      })
    ]);

    let datos = {};
    try { datos = await respuesta.json(); } catch (e) { datos = {}; }

    if (!respuesta.ok) {
      return {
        enviado: false,
        destinatario: destino,
        error: textoPlano(datos.message || ('Resend respondió ' + respuesta.status), 200)
      };
    }
    return {
      enviado: true,
      destinatario: destino,
      idCorreo: textoPlano(datos.id, 80),
      conPdf: !!pdfBase64
    };
  } catch (e) {
    return { enviado: false, destinatario: destino, error: textoPlano(e.message, 200) || 'Error de red.' };
  }
}

// ── 3. Entregas ──────────────────────────────────────────────────────────
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
  const markdown = typeof cuerpo.markdown === 'string' ? cuerpo.markdown.slice(0, 400000) : '';

  /* El PDF viaja en base64 y no se guarda en KV: se adjunta al correo y se
     descarta. Guardarlo multiplicaría por veinte el peso de cada entrega
     sin agregar nada que el Markdown no tenga. */
  let pdfBase64 = '';
  if (typeof cuerpo.pdf === 'string' && cuerpo.pdf) {
    const limpio = cuerpo.pdf.replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
    if (limpio.length <= MAX_PDF && /^[A-Za-z0-9+/]+={0,2}$/.test(limpio)) pdfBase64 = limpio;
  }

  const registro = {
    id,
    recibido: ahora.toISOString(),
    estudiante,
    caso,
    asignatura: textoPlano(cuerpo.asignatura, 80) || ASIGNATURA,
    origen: cuerpo.origen === 'cierre' ? 'cierre' : 'manual',
    contenido: cuerpo.contenido || {},
    markdown,
    uso: limpiarUso(cuerpo.uso)
  };

  /* Primero el correo, después el guardado, para que el registro que queda
     en KV incluya el resultado del envío en una sola escritura. La función
     de correo no lanza: si algo falla, devuelve el motivo. */
  registro.correo = await enviarCorreo(env, registro, pdfBase64, markdown);

  await env.ENTREGAS.put('entrega:' + id, JSON.stringify(registro), {
    expirationTtl: DIAS_RETENCION * 86400,
    metadata: {
      estudiante,
      caso,
      recibido: registro.recibido,
      origen: registro.origen,
      correo: !!registro.correo.enviado
    }
  });

  return respuestaJson({
    ok: true,
    id,
    recibido: registro.recibido,
    correo: registro.correo
  }, 200, cors);
}

/* Prueba del correo, para el docente: confirma que Resend está bien
   configurado sin tener que inventar una entrega falsa. */
async function probarCorreo(request, env, cors) {
  const token = request.headers.get('X-Docente-Token') ||
    new URL(request.url).searchParams.get('token');
  if (!tokenValido(token, env.DOCENTE_TOKEN)) {
    return respuestaJson({ error: 'Clave de acceso incorrecta.' }, 403, cors);
  }
  const ahora = new Date();
  const resultado = await enviarCorreo(env, {
    id: 'prueba-' + ahora.getTime(),
    recibido: ahora.toISOString(),
    estudiante: 'Prueba de configuración',
    caso: 'PRUEBA',
    asignatura: ASIGNATURA,
    origen: 'manual',
    uso: null
  }, '', 'Correo de prueba de ArcoApp. Si lo recibes, el envío está bien configurado.');
  return respuestaJson({ ok: !!resultado.enviado, correo: resultado }, resultado.enviado ? 200 : 502, cors);
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
    recibido: (k.metadata && k.metadata.recibido) || '',
    origen: (k.metadata && k.metadata.origen) || '',
    correo: k.metadata && typeof k.metadata.correo === 'boolean' ? k.metadata.correo : null
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

    if (ruta === '/correo-prueba') {
      if (request.method !== 'POST') {
        return respuestaJson({ error: 'Solo se acepta POST.' }, 405, cors);
      }
      return probarCorreo(request, env, cors);
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
