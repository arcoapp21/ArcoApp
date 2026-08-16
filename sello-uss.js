/**
 * sello-uss.js — Fundamentación bloqueada de los diagnósticos parciales
 *
 * Da a cada diagnóstico parcial el mismo flujo que el diagnóstico integral:
 * el estudiante registra y fundamenta su hipótesis, esa fundamentación queda
 * sellada e ineditable, y solo entonces el asistente responde — y responde
 * con preguntas, nunca con el diagnóstico.
 *
 * Se incluye después de ficha-uss.js:  <script src="sello-uss.js"></script>
 * Requiere coherencia-uss.js para el contraste entre secciones (opcional).
 *
 * Mientras la fundamentación no esté sellada, los botones de IA del módulo
 * quedan inhabilitados: es la condición del OE1, que el asistente no responda
 * antes de que el estudiante haya razonado.
 *
 * ── PARA AGREGAR O EDITAR UN DIAGNÓSTICO PARCIAL ──────────────────────────
 * Añade una entrada a DIAGNOSTICOS con la clave del módulo (nombre del
 * archivo sin extensión). Los textos de los campos y del prompt se editan
 * ahí mismo, sin tocar el módulo.
 */
(function () {
  'use strict';

  var PREFIX = 'fichaUSS:v6:';
  var API_URL = (window.FICHA_USS_API || 'https://api.anthropic.com/v1/messages');
  var MODULO = (location.pathname.split('/').pop() || '').replace(/\.html?$/i, '');

  // ── Configuración de cada diagnóstico parcial ──────────────────────────
  var DIAGNOSTICOS = {

    'odontograma_uss': {
      titulo: 'Diagnóstico de caries',
      intro: 'Registra tu diagnóstico de tejidos duros y en qué te apoyas, antes de consultar al asistente. ' +
             'No basta con listar las piezas: lo que se evalúa es cómo distingues una lesión activa de una detenida ' +
             'y una lesión de una restauración desadaptada.',
      campos: [
        { id: 'sdDx', tipo: 'text', label: 'Diagnóstico de tejidos duros',
          ph: 'Ej: Enfermedad de caries activa, con lesiones dentinarias en sectores posteriores' },
        { id: 'sdPiezas', tipo: 'ta', rows: 2, label: 'Piezas comprometidas y código ICDAS de cada lesión',
          ph: 'Ej: 1.6 oclusal ICDAS 4; 3.6 oclusal ICDAS 5; 4.7 mesial ICDAS 3' },
        { id: 'sdActividad', tipo: 'ta', rows: 3, label: '¿En qué te basas para decir que están activas o detenidas?',
          ayuda: 'Textura al paso de la sonda, color, brillo, presencia de biofilm, ubicación respecto de zonas de retención.',
          ph: 'Ej: superficie rugosa y opaca al paso suave de la sonda, con biofilm retenido en el margen, en un paciente con higiene deficiente.' },
        { id: 'sdDistincion', tipo: 'ta', rows: 2, label: '¿Cómo distinguiste lesión de caries de restauración desadaptada o defecto de desarrollo?',
          ph: 'Ej: en 2.5 hay una restauración con brecha marginal sin reblandecimiento adyacente, que registro como desadaptada y no como lesión activa.' }
      ],
      diferencial: {
        label: '¿Qué otra cosa podría explicar lo que estás viendo, y por qué la descartas?',
        ph: 'Ej: consideré hipomineralización molar, pero el patrón no es simétrico ni afecta incisivos, y las lesiones se ubican en zonas de retención de biofilm.'
      },
      contexto: function (f) {
        return [
          f('examenes_complementarios_uss', 'r|riesgoCaries') && 'Riesgo cariogénico determinado: ' + f('examenes_complementarios_uss', 'r|riesgoCaries'),
          f('examenes_periodontales_uss', 'r|tipoHigiene') && 'Higiene oral: ' + f('examenes_periodontales_uss', 'r|tipoHigiene'),
          f('situaciones_relevantes_uss', 'c|habAzucar') && 'Consumo frecuente de azúcares registrado'
        ].filter(Boolean);
      }
    },

    'examenes_periodontales_uss': {
      titulo: 'Diagnóstico periodontal',
      intro: 'Registra tu diagnóstico periodontal y fundaméntalo por partes. El estadio, el grado y la extensión ' +
             'se apoyan en datos distintos: no basta con nombrar el diagnóstico completo.',
      campos: [
        { id: 'spDx', tipo: 'text', label: 'Diagnóstico periodontal',
          ph: 'Ej: Periodontitis estadio III grado B generalizada' },
        { id: 'spSaludEnfermedad', tipo: 'ta', rows: 2, label: '¿Cómo distingues gingivitis de periodontitis en este paciente?',
          ayuda: 'Lo que define la periodontitis es la pérdida de inserción interproximal, no la profundidad al sondaje.',
          ph: 'Ej: hay pérdida de inserción interproximal de 4 mm en 3.6 y 3.7, no solo profundidad aumentada, lo que descarta un agrandamiento gingival.' },
        { id: 'spEstadio', tipo: 'ta', rows: 2, label: 'Estadio — ¿en qué dato lo sostienes?',
          ph: 'Nivel de inserción del sitio más afectado, pérdida ósea radiográfica, pérdida dentaria por causa periodontal.' },
        { id: 'spGrado', tipo: 'ta', rows: 2, label: 'Grado — ¿en qué dato lo sostienes?',
          ayuda: 'Relación entre porcentaje de pérdida ósea y edad, más los modificadores: tabaquismo y diabetes.',
          ph: 'Ej: pérdida ósea del 25% a los 32 años, razón 0,78; sin tabaquismo ni diabetes que desplacen el grado.' },
        { id: 'spExtension', tipo: 'ta', rows: 2, label: 'Extensión y distribución — ¿en qué dato las sostienes?',
          ph: 'Porcentaje de sitios comprometidos y sectores en que se concentra el compromiso.' }
      ],
      diferencial: {
        label: '¿Qué otra explicación consideraste y por qué la descartaste?',
        ph: 'Ej: consideré periodontitis como manifestación de enfermedad sistémica, pero no hay antecedentes de diabetes ni discrasias.'
      },
      contexto: function (f) {
        return [
          f('examenes_periodontales_uss', 'v|sitiosPS4') && 'Sitios con sondaje ≥ 4 mm registrados: ' + f('examenes_periodontales_uss', 'v|sitiosPS4'),
          f('examenes_periodontales_uss', 'v|nicMaximo') && 'Nivel de inserción del sitio más afectado: ' + f('examenes_periodontales_uss', 'v|nicMaximo') + ' mm',
          f('examenes_periodontales_uss', 'v|perdidaOsea') && 'Pérdida ósea radiográfica: ' + f('examenes_periodontales_uss', 'v|perdidaOsea'),
          f('situaciones_relevantes_uss', 'c|habTabaco') && 'Consumo de tabaco registrado'
        ].filter(Boolean);
      }
    },

    'examenes_complementarios_uss': {
      titulo: 'Riesgo cariogénico',
      intro: 'El riesgo no se declara, se argumenta. Registra la categoría que asignaste y los factores que la ' +
             'sostienen, distinguiendo los de riesgo de los protectores, antes de consultar al asistente.',
      campos: [
        { id: 'srCategoria', tipo: 'text', label: 'Categoría de riesgo asignada',
          ph: 'Ej: Alto riesgo cariogénico' },
        { id: 'srFactores', tipo: 'ta', rows: 3, label: 'Factores de riesgo presentes en este paciente',
          ayuda: 'Experiencia de caries, higiene, dieta, flujo salival, fármacos xerostomizantes, exposición a flúor, factores sociales.',
          ph: 'Ej: cuatro lesiones activas en el último año, higiene deficiente con IHO 2,3, consumo de bebidas azucaradas entre comidas.' },
        { id: 'srProtectores', tipo: 'ta', rows: 2, label: 'Factores protectores presentes',
          ph: 'Ej: uso de pasta fluorada dos veces al día, agua potable fluorada, controles odontológicos regulares.' },
        { id: 'srBalance', tipo: 'ta', rows: 2, label: '¿Cuál de esos factores pesa más y por qué esa categoría y no la contigua?',
          ayuda: 'Esta es la pregunta que separa un riesgo argumentado de uno declarado.',
          ph: 'Ej: la experiencia de caries reciente es el predictor de mayor peso y no está compensada por los protectores, por eso alto y no moderado.' }
      ],
      diferencial: {
        label: '¿Qué tendría que cambiar en este paciente para que la categoría bajara?',
        ph: 'Ej: ausencia de lesiones nuevas en un año de control, con higiene mantenida y sin consumo de azúcares entre comidas.'
      },
      contexto: function (f) {
        return [
          f('examenes_periodontales_uss', 'r|tipoHigiene') && 'Higiene oral registrada: ' + f('examenes_periodontales_uss', 'r|tipoHigiene'),
          f('situaciones_relevantes_uss', 'c|habAzucar') && 'Consumo frecuente de azúcares registrado',
          f('examenes_complementarios_uss', 'r|riesgoCaries') && 'Categoría marcada en la ficha: ' + f('examenes_complementarios_uss', 'r|riesgoCaries')
        ].filter(Boolean);
      }
    }
  };

  var CFG = DIAGNOSTICOS[MODULO];
  if (!CFG) return;

  var KEY = PREFIX + 'sello-' + MODULO;
  var ESTADO = { sellado: false };

  // ── Acceso a datos de otros módulos ────────────────────────────────────
  function dato(mod, clave) {
    try {
      var crudo = localStorage.getItem(PREFIX + mod);
      if (!crudo) return '';
      var v = (JSON.parse(crudo).datos || {})[clave];
      if (v === true) return 'sí';
      return v == null ? '' : String(v).trim();
    } catch (e) { return ''; }
  }

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  // ── Estilos ────────────────────────────────────────────────────────────
  var CSS =
    '.sl-card{background:var(--surface,#fff);border:1px solid var(--border,#E2DED6);' +
      'border-left:3px solid var(--accent,#1D3A6B);border-radius:10px;padding:20px;margin:22px 0 8px;}' +
    '.sl-eyebrow{font-family:"DM Mono",monospace;font-size:10px;text-transform:uppercase;' +
      'letter-spacing:.09em;color:var(--accent,#1D3A6B);}' +
    '.sl-h{font-size:16px;font-weight:600;letter-spacing:-.01em;margin:5px 0 4px;}' +
    '.sl-lead{font-size:12.5px;color:var(--text-2,#5C5849);line-height:1.6;margin-bottom:16px;}' +
    '.sl-step{border:1px solid var(--border,#E2DED6);border-radius:8px;padding:15px 16px;' +
      'margin-bottom:12px;background:var(--surface-2,#F9F8F5);}' +
    '.sl-step.pending{opacity:.45;pointer-events:none;}' +
    '.sl-step.done{border-color:#bfe0cd;background:#F6FBF8;}' +
    '.sl-head{display:flex;align-items:center;gap:9px;margin-bottom:10px;}' +
    '.sl-num{width:21px;height:21px;border-radius:50%;background:var(--accent,#1D3A6B);color:#fff;' +
      'font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0;}' +
    '.sl-title{font-size:13.5px;font-weight:600;}' +
    '.sl-f{margin-bottom:12px;}' +
    '.sl-l{font-size:12.5px;font-weight:500;color:var(--text,#1A1814);margin-bottom:4px;line-height:1.5;}' +
    '.sl-help{font-size:11.5px;color:var(--text-3,#9C9688);line-height:1.5;margin-bottom:5px;}' +
    '.sl-card input[type=text],.sl-card textarea{width:100%;border:1px solid var(--border,#E2DED6);' +
      'border-radius:6px;padding:8px 11px;font-family:inherit;font-size:13.5px;background:#fff;' +
      'outline:none;resize:vertical;line-height:1.55;color:var(--text,#1A1814);}' +
    '.sl-card input:focus,.sl-card textarea:focus{border-color:var(--accent-mid,#4A6FA5);' +
      'box-shadow:0 0 0 3px rgba(74,111,165,.12);}' +
    '.sl-card input[readonly],.sl-card textarea[readonly]{background:#F2F0EB;color:var(--text-2,#5C5849);}' +
    '.sl-btn{height:36px;padding:0 15px;background:var(--accent,#1D3A6B);color:#fff;border:none;' +
      'border-radius:6px;font-family:inherit;font-size:13px;font-weight:500;cursor:pointer;' +
      'display:inline-flex;align-items:center;gap:7px;}' +
    '.sl-btn:hover{background:#162d54;} .sl-btn:disabled{background:#9C9688;cursor:not-allowed;}' +
    '.sl-warn{background:#FDEAEA;border:1px solid #e0b4b4;color:#8B1A1A;border-radius:6px;' +
      'padding:10px 13px;font-size:12.5px;line-height:1.55;margin-bottom:10px;}' +
    '.sl-stamp{display:flex;align-items:center;gap:7px;background:#E8F5EE;border:1px solid #bfe0cd;' +
      'color:#1A5C3A;border-radius:6px;padding:9px 13px;font-family:"DM Mono",monospace;' +
      'font-size:11.5px;margin-top:10px;}' +
    '.sl-q{font-size:13.5px;line-height:1.6;color:var(--text,#1A1814);padding:9px 0 9px 15px;' +
      'position:relative;border-bottom:1px solid var(--border,#E2DED6);}' +
    '.sl-q:last-child{border-bottom:none;}' +
    '.sl-q::before{content:"?";position:absolute;left:0;color:var(--accent-mid,#4A6FA5);font-weight:700;}' +
    '.sl-coh{border:1px solid #e8d99a;background:#fffdf5;border-radius:8px;padding:13px 15px;margin-bottom:10px;}' +
    '.sl-coh.alta{border-color:#e0b4b4;background:#fdf6f6;}' +
    '.sl-coh-t{font-size:12.5px;font-weight:600;color:#7A4A00;margin-bottom:7px;}' +
    '.sl-coh.alta .sl-coh-t{color:#8B1A1A;}' +
    '.sl-coh-d{font-size:12px;color:var(--text-2,#5C5849);line-height:1.55;padding-left:13px;' +
      'position:relative;margin-bottom:3px;}' +
    '.sl-coh-d::before{content:"·";position:absolute;left:3px;font-weight:700;}' +
    '.sl-coh-q{font-size:13px;line-height:1.6;margin-top:8px;padding-top:8px;border-top:1px solid rgba(0,0,0,.07);}' +
    '.sl-spin{width:13px;height:13px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;' +
      'border-radius:50%;animation:slspin .7s linear infinite;}' +
    '@keyframes slspin{to{transform:rotate(360deg);}}' +
    '.sl-gate{background:#FFF4E0;border:1px solid #e8d99a;color:#7A4A00;border-radius:6px;' +
      'padding:11px 14px;font-size:12.5px;line-height:1.6;margin-bottom:14px;}';

  function inyectarEstilos() {
    var s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ── Render ─────────────────────────────────────────────────────────────
  function campoHTML(c) {
    var control = c.tipo === 'text'
      ? '<input type="text" id="' + c.id + '" placeholder="' + esc(c.ph || '') + '">'
      : '<textarea id="' + c.id + '" rows="' + (c.rows || 2) + '" placeholder="' + esc(c.ph || '') + '"></textarea>';
    return '<div class="sl-f"><div class="sl-l">' + esc(c.label) + '</div>' +
      (c.ayuda ? '<div class="sl-help">' + esc(c.ayuda) + '</div>' : '') + control + '</div>';
  }

  function render() {
    var main = document.querySelector('main') || document.body;
    var card = document.createElement('div');
    card.className = 'sl-card';
    card.id = 'slCard';
    card.innerHTML =
      '<div class="sl-eyebrow">Fundamentación bloqueada</div>' +
      '<div class="sl-h">' + esc(CFG.titulo) + '</div>' +
      '<div class="sl-lead">' + esc(CFG.intro) + '</div>' +

      '<div class="sl-step" id="slStep1">' +
        '<div class="sl-head"><span class="sl-num">1</span><span class="sl-title">Tu razonamiento, antes del asistente</span></div>' +
        CFG.campos.map(campoHTML).join('') +
        campoHTML({ id: 'slDiferencial', tipo: 'ta', rows: 3, label: CFG.diferencial.label, ph: CFG.diferencial.ph }) +
        '<div class="sl-warn" id="slWarn" style="display:none;">Completa el diagnóstico, al menos una fundamentación y el diferencial antes de registrar.</div>' +
        '<button class="sl-btn" id="slBtn">Registrar y consultar al asistente</button>' +
        '<div class="sl-stamp" id="slStamp" style="display:none;"></div>' +
      '</div>' +

      '<div class="sl-step pending" id="slStep2">' +
        '<div class="sl-head"><span class="sl-num">2</span><span class="sl-title">Contradicciones y preguntas</span></div>' +
        '<div class="sl-help" style="margin-bottom:10px;">El asistente no entrega el diagnóstico. Señala lo que no calza y pregunta.</div>' +
        '<div id="slCoherencia"></div><div id="slPreguntas"></div>' +
      '</div>' +

      '<div class="sl-step pending" id="slStep3">' +
        '<div class="sl-head"><span class="sl-num">3</span><span class="sl-title">Tu revisión</span></div>' +
        campoHTML({ id: 'slRevision', tipo: 'ta', rows: 4,
          label: '¿Qué mantienes y qué modificas de tu razonamiento, y por qué?',
          ayuda: 'Mantener una hipótesis es válido si la fundamentas. Lo que no se evalúa como logro es cambiarla sin explicar el motivo.',
          ph: 'Ej: mantengo el diagnóstico de lesiones activas porque la textura al sondaje lo sostiene, pero corrijo el ICDAS de 4.7 de 3 a 4 tras revisar la radiografía.' }) +
      '</div>';
    main.appendChild(card);
    document.getElementById('slBtn').addEventListener('click', registrar);
  }

  // ── Bloqueo de los botones de IA del módulo antes del sello ────────────
  var botonesIA = [];
  function bloquearIA() {
    var todos = Array.prototype.slice.call(document.querySelectorAll('button'));
    botonesIA = todos.filter(function (b) {
      if (b.id && b.id.indexOf('sl') === 0) return false;
      var oc = b.getAttribute('onclick') || '';
      return /redactar|generar|sugerir|analizar/i.test(oc) || /con IA|asistente/i.test(b.textContent || '');
    });
    botonesIA.forEach(function (b) {
      b.dataset.slOnclick = b.getAttribute('onclick') || '';
      b.removeAttribute('onclick');
      b.addEventListener('click', avisoBloqueo);
      b.style.opacity = '.55';
      b.title = 'Disponible después de registrar tu fundamentación';
    });
    if (botonesIA.length) {
      var aviso = document.createElement('div');
      aviso.className = 'sl-gate';
      aviso.id = 'slGate';
      aviso.textContent = 'El asistente de este módulo se habilita cuando registres tu fundamentación del ' +
        CFG.titulo.toLowerCase() + ', más abajo. Primero razonas tú.';
      var main = document.querySelector('main');
      if (main && main.firstChild) main.insertBefore(aviso, main.firstChild);
    }
  }
  function avisoBloqueo(e) {
    e.preventDefault();
    var card = document.getElementById('slCard');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function liberarIA() {
    botonesIA.forEach(function (b) {
      b.removeEventListener('click', avisoBloqueo);
      if (b.dataset.slOnclick) b.setAttribute('onclick', b.dataset.slOnclick);
      b.style.opacity = '';
      b.title = '';
    });
    var g = document.getElementById('slGate');
    if (g) g.remove();
  }

  // ── Coherencia ─────────────────────────────────────────────────────────
  function mostrarCoherencia() {
    var cont = document.getElementById('slCoherencia');
    if (!cont || typeof CoherenciaUSS === 'undefined') return [];
    var alertas = [];
    try { alertas = CoherenciaUSS.evaluar(); } catch (e) { alertas = []; }
    if (!alertas.length) { cont.innerHTML = ''; return []; }
    cont.innerHTML = alertas.map(function (a) {
      return '<div class="sl-coh ' + esc(a.gravedad) + '">' +
        '<div class="sl-coh-t">' + esc(a.titulo) + '</div>' +
        (a.dato_a ? '<div class="sl-coh-d">' + esc(a.dato_a) + '</div>' : '') +
        (a.dato_b ? '<div class="sl-coh-d">' + esc(a.dato_b) + '</div>' : '') +
        '<div class="sl-coh-q">' + esc(a.pregunta) + '</div></div>';
    }).join('');
    return alertas.map(function (a) { return a.id; });
  }

  // ── Sellado ────────────────────────────────────────────────────────────
  function guardar(paquete) {
    try { localStorage.setItem(KEY, JSON.stringify(paquete)); } catch (e) {}
  }

  function aplicarBloqueo(sello) {
    ESTADO.sellado = true;
    CFG.campos.concat([{ id: 'slDiferencial' }]).forEach(function (c) {
      var el = document.getElementById(c.id);
      if (el) el.readOnly = true;
    });
    document.getElementById('slStep1').classList.add('done');
    document.getElementById('slBtn').style.display = 'none';
    var st = document.getElementById('slStamp');
    st.textContent = '✓ Fundamentación registrada y bloqueada — ' + sello;
    st.style.display = 'flex';
    document.getElementById('slStep2').classList.remove('pending');
    document.getElementById('slStep3').classList.remove('pending');
    liberarIA();
  }

  async function registrar() {
    var dx = val(CFG.campos[0].id);
    var justificaciones = CFG.campos.slice(1).map(function (c) { return val(c.id); }).filter(Boolean);
    var dif = val('slDiferencial');
    var warn = document.getElementById('slWarn');

    if (!dx || !justificaciones.length || !dif) { warn.style.display = 'block'; return; }
    warn.style.display = 'none';

    var sello = new Date().toLocaleString('es-CL');
    var paquete = { modulo: MODULO, titulo: CFG.titulo, sello: sello, diferencial: dif };
    CFG.campos.forEach(function (c) { paquete[c.id] = val(c.id); });

    aplicarBloqueo(sello);
    paquete.coherencia = mostrarCoherencia();
    paquete.alertas = (document.getElementById('slCoherencia') || {}).innerHTML || '';
    guardar(paquete);

    var cont = document.getElementById('slPreguntas');
    var btn = document.getElementById('slBtn');
    cont.innerHTML = '<div class="sl-help">Consultando al asistente…</div>';

    var contexto = [];
    try { contexto = CFG.contexto(dato) || []; } catch (e) { contexto = []; }

    var registro = CFG.campos.map(function (c) { return c.label + ': ' + (val(c.id) || '(en blanco)'); })
      .concat(['Diferencial: ' + dif]).join('\n');

    try {
      var resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 700,
          messages: [{ role: 'user', content:
'Eres docente de clínica odontológica en una universidad chilena, supervisando a un estudiante de pregrado.\n\n' +
'El estudiante registró esta fundamentación para el ' + CFG.titulo.toLowerCase() + ':\n\n' + registro +
(contexto.length ? '\n\nOtros datos ya registrados en su ficha:\n' + contexto.join('\n') : '') +
'\n\nFormula exactamente tres preguntas que pongan a prueba su razonamiento. Reglas estrictas:\n' +
'- No entregues el diagnóstico, ni lo corrijas, ni insinúes cuál sería el correcto.\n' +
'- No uses lenguaje que revele la respuesta esperada.\n' +
'- Cada pregunta debe referirse a datos concretos de este caso, no a generalidades.\n' +
'- Una pregunta debe confrontar la correspondencia entre lo que registró en la ficha y lo que invoca como fundamento.\n' +
'- Una debe poner a prueba la suficiencia del descarte del diferencial.\n' +
'- Una debe apuntar a qué información adicional cambiaría su confianza en la hipótesis.\n' +
'Escribe en segunda persona, breve. Una pregunta por línea, sin numeración ni preámbulo.' }]
        })
      });
      var data = await resp.json();
      var texto = data.content.map(function (b) { return b.text || ''; }).join('').trim();
      paquete.preguntas = texto;
      var lineas = texto.split('\n').map(function (l) { return l.replace(/^[-•\d.\s]+/, '').trim(); }).filter(Boolean);
      cont.innerHTML = lineas.map(function (l) { return '<div class="sl-q">' + esc(l) + '</div>'; }).join('');
    } catch (err) {
      paquete.preguntas = '(sin conexión con el asistente)';
      cont.innerHTML = '<div class="sl-warn">No fue posible conectar con el asistente. Tu fundamentación quedó ' +
        'registrada igualmente; continúa con el paso 3 revisando las contradicciones señaladas arriba.</div>';
    }
    paquete.preguntasHTML = cont.innerHTML;
    guardar(paquete);
    if (btn) btn.disabled = false;
  }

  // ── Restauración ───────────────────────────────────────────────────────
  function restaurar() {
    var d;
    try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { return; }
    if (!d || !d.sello) return;
    CFG.campos.forEach(function (c) {
      var el = document.getElementById(c.id);
      if (el) el.value = d[c.id] || '';
    });
    var dif = document.getElementById('slDiferencial');
    if (dif) dif.value = d.diferencial || '';
    aplicarBloqueo(d.sello);
    if (d.alertas) document.getElementById('slCoherencia').innerHTML = d.alertas;
    if (d.preguntasHTML) document.getElementById('slPreguntas').innerHTML = d.preguntasHTML;
  }

  // ── Arranque ───────────────────────────────────────────────────────────
  inyectarEstilos();
  render();
  bloquearIA();
  window.addEventListener('load', function () { setTimeout(restaurar, 700); });
})();
