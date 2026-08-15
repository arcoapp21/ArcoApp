/**
 * ficha-uss-proxy — Cloudflare Worker
 *
 * Único punto del sistema que conoce la clave de la API. Los módulos de la
 * ficha llaman aquí; este Worker agrega la clave y reenvía a Anthropic.
 * La clave nunca viaja al navegador del estudiante.
 *
 * DESPLIEGUE
 *   1. npm install -g wrangler   (o usar el editor web de Cloudflare)
 *   2. wrangler deploy
 *   3. wrangler secret put ANTHROPIC_API_KEY
 *      → pega la clave cuando la pida; queda cifrada y no aparece en el código
 *
 * ANTES DE DESPLEGAR: edita ORIGENES con la URL real donde vas a publicar
 * la ficha. Si dejas un origen incorrecto, el navegador bloqueará las
 * llamadas; si dejas '*', cualquiera en internet podría gastar tu cuota.
 */
 
// ── Configuración ────────────────────────────────────────────────────────
const ORIGENES = [
  'https://TU-USUARIO.github.io',   // ← reemplazar por la URL de publicación
  'http://localhost:8000'           // para probar en tu computador
];
 
const MODELO = 'claude-sonnet-5';   // alternativa más barata: 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 1200;            // techo de salida, sin importar lo que pida el módulo
const MAX_CARACTERES = 24000;       // techo de entrada por petición
const LIMITE_HORA = 80;             // peticiones por IP por hora (requiere KV, ver README)
 
const UPSTREAM = 'https://api.anthropic.com/v1/messages';
 
// ── Utilidades ───────────────────────────────────────────────────────────
function cabecerasCors(origen) {
  return {
    'Access-Control-Allow-Origin': origen,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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
 
async function dentroDelLimite(env, ip) {
  if (!env.LIMITES) return true;              // sin KV configurado, no se limita
  const bloque = Math.floor(Date.now() / 3600000);
  const clave = `${ip}:${bloque}`;
  const usadas = parseInt((await env.LIMITES.get(clave)) || '0', 10);
  if (usadas >= LIMITE_HORA) return false;
  await env.LIMITES.put(clave, String(usadas + 1), { expirationTtl: 3900 });
  return true;
}
 
// ── Worker ───────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const origen = request.headers.get('Origin') || '';
    const autorizado = ORIGENES.includes(origen);
    const cors = cabecerasCors(autorizado ? origen : ORIGENES[0]);
 
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return respuestaJson({ error: 'Solo se acepta POST.' }, 405, cors);
    }
    if (!autorizado) {
      return respuestaJson({ error: 'Origen no autorizado.' }, 403, cors);
    }
    if (!env.ANTHROPIC_API_KEY) {
      return respuestaJson({ error: 'Falta configurar ANTHROPIC_API_KEY en el Worker.' }, 500, cors);
    }
 
    const ip = request.headers.get('CF-Connecting-IP') || 'anon';
    if (!(await dentroDelLimite(env, ip))) {
      return respuestaJson(
        { error: 'Límite de uso por hora alcanzado. Intenta más tarde.' }, 429, cors);
    }
 
    // ── Validación del cuerpo ────────────────────────────────────────────
    let cuerpo;
    try {
      cuerpo = await request.json();
    } catch (e) {
      return respuestaJson({ error: 'Cuerpo JSON inválido.' }, 400, cors);
    }
 
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
 
    // ── Reenvío ──────────────────────────────────────────────────────────
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
};
 