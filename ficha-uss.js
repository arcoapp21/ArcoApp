/**
 * ficha-uss.js — Guardado automático de la Ficha Clínica Adulto USS
 *
 * Se incluye al final de cada módulo con:  <script src="ficha-uss.js"></script>
 *
 * Qué hace:
 *  · Guarda en el navegador todo lo que el estudiante escribe, a medida que lo escribe.
 *  · Restaura los datos al volver a abrir el módulo.
 *  · Expone window.FichaUSS para que index.html pueda leer el estado y exportar el caso.
 *
 * Dónde se guarda: localStorage del navegador, bajo la clave fichaUSS:v6:<modulo>.
 * Los datos no salen del computador. Se pierden si se limpia el navegador o se usa
 * modo incógnito: por eso el índice ofrece exportar el caso a un archivo .json.
 */
(function () {
  'use strict';

  var VERSION = 'v6';
  var PREFIX = 'fichaUSS:' + VERSION + ':';
  var MODULO = (location.pathname.split('/').pop() || 'modulo').replace(/\.html?$/i, '') || 'modulo';
  var KEY = PREFIX + MODULO;

  var restaurando = false;
  var timer = null;

  // ── Identificación estable de cada campo ───────────────────────────────
  function ruta(el) {
    var partes = [];
    var n = el;
    while (n && n.nodeType === 1 && n !== document.body) {
      var padre = n.parentNode;
      if (!padre) break;
      var idx = Array.prototype.indexOf.call(padre.children, n);
      partes.unshift(n.tagName + idx);
      if (padre.id) { partes.unshift('#' + padre.id); break; }
      n = padre;
    }
    return partes.join('>');
  }

  function clave(el) {
    if (el.type === 'radio') return 'r|' + (el.name || ruta(el));
    if (el.type === 'checkbox') return 'c|' + (el.id || (el.name || ruta(el)) + '|' + el.value);
    return 'v|' + (el.id || ruta(el));
  }

  // ── Recolección ────────────────────────────────────────────────────────
  function recolectar() {
    var datos = {};
    document.querySelectorAll('input, select, textarea').forEach(function (el) {
      if (el.type === 'file' || el.disabled) return;
      var k = clave(el);
      if (el.type === 'radio') { if (el.checked) datos[k] = el.value; }
      else if (el.type === 'checkbox') { if (el.checked) datos[k] = true; }
      else if (el.value !== '') { datos[k] = el.value; }
    });
    document.querySelectorAll('img[id]').forEach(function (img) {
      if (img.src && img.src.indexOf('data:') === 0) datos['img|' + img.id] = img.src;
    });
    // Filas creadas dinámicamente (plan de tratamiento por fases)
    document.querySelectorAll('[id^="tbody-"]').forEach(function (tb) {
      datos['rows|' + tb.id] = tb.children.length;
    });
    return datos;
  }

  // ── Guardado ───────────────────────────────────────────────────────────
  function guardar() {
    if (restaurando) return;
    try {
      var datos = recolectar();
      localStorage.setItem(KEY, JSON.stringify({ actualizado: new Date().toISOString(), datos: datos }));
      avisoGuardado();
    } catch (e) {
      if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
        avisoError('No hay espacio para guardar. Quita alguna fotografía o exporta el caso desde el índice.');
      }
    }
  }

  function guardarDiferido() {
    clearTimeout(timer);
    timer = setTimeout(guardar, 400);
  }

  // ── Restauración ───────────────────────────────────────────────────────
  function mostrarFoto(img) {
    img.classList.remove('hidden');
    var zona = img.closest('.upload-zone');
    if (!zona) return;
    zona.classList.add('has-image');
    var ph = zona.querySelector('.upload-ph, [id^="uploadPlaceholder"], #uploadPlaceholder');
    if (ph) ph.classList.add('hidden');
    var rm = zona.querySelector('.remove-btn');
    if (rm) rm.classList.remove('hidden');
  }

  function restaurar() {
    var crudo;
    try { crudo = localStorage.getItem(KEY); } catch (e) { return; }
    if (!crudo) return;

    var guardado;
    try { guardado = JSON.parse(crudo); } catch (e) { return; }
    var datos = (guardado && guardado.datos) || {};

    restaurando = true;

    // Recrear filas dinámicas antes de rellenarlas
    Object.keys(datos).forEach(function (k) {
      if (k.indexOf('rows|tbody-') !== 0) return;
      var tbodyId = k.slice(5);
      var tb = document.getElementById(tbodyId);
      if (!tb || typeof window.addProc !== 'function') return;
      var faseId = tbodyId.replace('tbody-', '');
      var faltan = datos[k] - tb.children.length;
      for (var i = 0; i < faltan; i++) { try { window.addProc(faseId); } catch (e) { break; } }
    });

    document.querySelectorAll('input, select, textarea').forEach(function (el) {
      if (el.type === 'file' || el.disabled) return;
      var k = clave(el);
      if (!(k in datos)) return;
      if (el.type === 'radio') { el.checked = (datos[k] === el.value); }
      else if (el.type === 'checkbox') { el.checked = !!datos[k]; }
      else { el.value = datos[k]; }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });

    document.querySelectorAll('img[id]').forEach(function (img) {
      var k = 'img|' + img.id;
      if (!datos[k]) return;
      img.src = datos[k];
      mostrarFoto(img);
    });

    restaurando = false;
    avisoRestaurado(guardado.actualizado);
  }

  // ── Indicador de estado ────────────────────────────────────────────────
  var aviso;
  function crearAviso() {
    aviso = document.createElement('div');
    aviso.setAttribute('role', 'status');
    aviso.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:9999;font-family:inherit;' +
      'font-size:12px;padding:7px 13px;border-radius:20px;background:#1A5C3A;color:#fff;' +
      'box-shadow:0 2px 10px rgba(0,0,0,0.18);opacity:0;transition:opacity .25s;pointer-events:none;';
    document.body.appendChild(aviso);
  }
  function mostrarAviso(texto, color, ms) {
    if (!aviso) crearAviso();
    aviso.textContent = texto;
    aviso.style.background = color;
    aviso.style.opacity = '1';
    clearTimeout(aviso._t);
    aviso._t = setTimeout(function () { aviso.style.opacity = '0'; }, ms || 1600);
  }
  function avisoGuardado() {
    var h = new Date();
    var hh = String(h.getHours()).padStart(2, '0') + ':' + String(h.getMinutes()).padStart(2, '0');
    mostrarAviso('Guardado ' + hh, '#1A5C3A');
  }
  function avisoRestaurado(iso) {
    if (!iso) return;
    var f = new Date(iso);
    mostrarAviso('Datos recuperados — ' + f.toLocaleDateString('es-CL') + ' ' +
      f.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }), '#1D3A6B', 2600);
  }
  function avisoError(texto) { mostrarAviso(texto, '#8B1A1A', 5000); }

  // ── Aviso si el asistente no está conectado ────────────────────────────
  /* El proxy es lo único que conoce la clave de la API. Si quedó sin
     configurar, los módulos con IA fallarían sin explicación: mejor decirlo. */
  function avisoProxy() {
    if (window.FICHA_USS_API_CONFIGURADA !== false) return;
    if (!/api.anthropic|FICHA_USS_API/.test(document.documentElement.innerHTML)) return;
    var main = document.querySelector('main');
    if (!main) return;
    var d = document.createElement('div');
    d.style.cssText = 'background:#FFF4E0;border:1px solid #e8d99a;border-radius:8px;padding:11px 14px;' +
      'margin-bottom:16px;font-size:12.5px;color:#7A4A00;line-height:1.6;';
    d.textContent = 'El asistente todavía no está conectado: falta poner la dirección del Worker en ' +
      'config-uss.js. Todo lo demás del módulo funciona y se guarda con normalidad.';
    main.insertBefore(d, main.firstChild);
  }

  // ── Botón de vuelta al índice ──────────────────────────────────────────
  /* Solo aparece cuando el módulo corre dentro del índice. No guarda nada
     al pulsarlo porque el guardado ya ocurrió: solo cambia la vista. */
  function botonVolver() {
    if (window.parent === window) return;   // abierto suelto, no hay índice al que volver
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = '\u2190 Volver al índice';
    b.setAttribute('aria-label', 'Volver al índice de la ficha');
    b.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:9998;font-family:inherit;' +
      'font-size:12.5px;font-weight:500;padding:9px 15px;border-radius:20px;border:1px solid #C8C3B8;' +
      'background:#fff;color:#1D3A6B;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,0.12);';
    b.addEventListener('mouseenter', function () { b.style.background = '#EAF0FA'; });
    b.addEventListener('mouseleave', function () { b.style.background = '#fff'; });
    b.addEventListener('click', function () {
      guardar();
      try { window.parent.postMessage({ fichaUSS: 'volver-al-indice' }, '*'); } catch (e) {}
    });
    document.body.appendChild(b);
  }

  // ── API pública ────────────────────────────────────────────────────────
  window.FichaUSS = {
    modulo: MODULO,
    guardar: guardar,
    leer: function () { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } },
    borrar: function () { try { localStorage.removeItem(KEY); } catch (e) {} }
  };

  // ── Arranque ───────────────────────────────────────────────────────────
  function iniciar() {
    restaurar();
    document.addEventListener('input', guardarDiferido, true);
    document.addEventListener('change', guardarDiferido, true);
    window.addEventListener('beforeunload', guardar);
    botonVolver();
    avisoProxy();
    // Segunda pasada para módulos que construyen campos después de cargar
    setTimeout(restaurar, 600);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
