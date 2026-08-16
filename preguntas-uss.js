/**
 * preguntas-uss.js — Preguntas de razonamiento de la Ficha Clínica Adulto USS
 *
 * Se incluye después de ficha-uss.js:  <script src="preguntas-uss.js"></script>
 *
 * Qué hace:
 *  · Inserta al final de cada módulo una tarjeta con la pregunta de anticipación
 *    de esa sección y las tres preguntas de cierre, que son las mismas en todas.
 *  · Las respuestas las guarda ficha-uss.js junto con el resto del módulo.
 *  · En el módulo de razonamiento diagnóstico, muestra reunidas las respuestas
 *    de todas las secciones anteriores antes de que el estudiante escriba su
 *    hipótesis.
 *
 * El asistente de IA nunca responde estas preguntas ni las ve: son el registro
 * del razonamiento propio del estudiante.
 *
 * ── PARA EDITAR LOS TEXTOS ──────────────────────────────────────────────
 * Las preguntas de cierre se editan una sola vez en CIERRE, más abajo, y el
 * cambio aplica a todas las secciones. Manténganlas idénticas entre secciones:
 * es lo que permite puntuarlas con una misma rúbrica.
 * La pregunta de anticipación de cada sección se edita en SECCIONES.
 */
(function () {
  'use strict';

  // ── Las tres preguntas de cierre, iguales en toda la ficha ─────────────
  var CIERRE = [
    { id: 'pq-clave',        rows: 2, label: '¿Cuál es el hallazgo más relevante de esta sección?',
      ayuda: 'Uno, no una lista. Si registraste varios, decide cuál pesa más en este caso.',
      ph: 'Ej: Sangrado al sondaje generalizado con pérdida de inserción interproximal.' },
    { id: 'pq-consecuencia', rows: 3, label: '¿Qué cambia en la atención de este paciente por ese hallazgo?',
      ayuda: 'Qué se modifica: el riesgo, una precaución, una derivación, el orden del tratamiento. Si no cambia nada, dilo y explica por qué.',
      ph: 'Ej: Obliga a completar periodontograma antes de cualquier procedimiento restaurador, y adelanta la fase higiénica.' },
    { id: 'pq-pendiente',    rows: 2, label: '¿Qué te falta confirmar antes de sostener una hipótesis?',
      ayuda: 'Exámenes, datos del paciente o maniobras que aún no tienes. Declarar la incertidumbre es parte del registro.',
      ph: 'Ej: Falta radiografía bitewing para distinguir lesión activa de restauración desadaptada en 3.6.' },
  ];

  // ── Pregunta de anticipación de cada sección ───────────────────────────
  var SECCIONES = {
    'identificacion_antecedentes_uss': {
      titulo: 'Identificación y antecedentes',
      anticipacion: 'A partir del motivo de consulta y de los antecedentes, ¿qué esperas encontrar en el examen y qué vas a buscar de forma dirigida?'
    },
    'asistente_farmacos_uss': {
      titulo: 'Fármacos',
      anticipacion: '¿Cuál de los fármacos que usa este paciente podría modificar la atención odontológica, y por qué vía —sangrado, cicatrización, xerostomía, interacción con el anestésico?'
    },
    'examen_fisico_general_uss': {
      titulo: 'Examen físico general',
      anticipacion: '¿Qué signos vitales o hallazgos generales podrían contraindicar o postergar un procedimiento en este paciente?'
    },
    'examen_extraoral_uss': {
      titulo: 'Examen extraoral',
      anticipacion: '¿Qué estructuras extraorales vas a examinar con más atención dado lo que ya sabes del caso, y qué esperas encontrar?'
    },
    'examen_intraoral_uss': {
      titulo: 'Examen intraoral',
      anticipacion: '¿Qué esperas encontrar en boca según el motivo de consulta y los antecedentes? Escríbelo antes de mirar, para poder contrastarlo después.'
    },
    'odontograma_uss': {
      titulo: 'Odontograma',
      anticipacion: '¿Qué patrón esperas en el odontograma —sectores comprometidos, tipo de lesión, distribución— y qué lo haría distinto de lo que anticipas?'
    },
    'examenes_periodontales_uss': {
      titulo: 'Exámenes periodontales',
      anticipacion: '¿Qué esperas del examen periodontal según la edad, los hábitos y los antecedentes sistémicos de este paciente?'
    },
    'examenes_complementarios_uss': {
      titulo: 'Exámenes complementarios',
      anticipacion: '¿Qué pregunta clínica concreta busca responder cada examen que solicitaste? Si no puedes formularla, revisa si el examen es necesario.'
    },
    'situaciones_relevantes_uss': {
      titulo: 'Situaciones relevantes',
      anticipacion: '¿Qué condición de este paciente obliga a modificar el manejo clínico habitual, y en qué momento de la atención se vuelve crítica?'
    },
    'diagnostico_plan_pronostico_uss': {
      titulo: 'Diagnóstico, plan y pronóstico',
      anticipacion: '¿Qué hallazgo de todo el examen sostiene con más fuerza tu diagnóstico, y cuál lo debilita?'
    },
  };

  var MODULO = (location.pathname.split('/').pop() || '').replace(/\.html?$/i, '');
  var PREFIX = 'fichaUSS:v6:';

  // ── Estilos ────────────────────────────────────────────────────────────
  var CSS =
    '.pq-card{background:var(--surface,#fff);border:1px solid var(--border,#E2DED6);' +
      'border-left:3px solid var(--accent-mid,#4A6FA5);border-radius:var(--radius,10px);' +
      'padding:20px;margin:22px 0 8px;}' +
    '.pq-eyebrow{font-family:"DM Mono",monospace;font-size:10px;text-transform:uppercase;' +
      'letter-spacing:.09em;color:var(--accent,#1D3A6B);}' +
    '.pq-h{font-size:16px;font-weight:600;letter-spacing:-.01em;margin:5px 0 4px;color:var(--text,#1A1814);}' +
    '.pq-lead{font-size:12.5px;color:var(--text-2,#5C5849);line-height:1.6;margin-bottom:16px;}' +
    '.pq-ant{background:var(--surface-2,#F9F8F5);border:1px solid var(--border,#E2DED6);' +
      'border-radius:var(--radius-sm,6px);padding:13px 15px;margin-bottom:16px;}' +
    '.pq-ant-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;' +
      'color:var(--text-3,#9C9688);margin-bottom:6px;}' +
    '.pq-ant-q{font-size:13.5px;color:var(--text,#1A1814);line-height:1.55;margin-bottom:9px;}' +
    '.pq-f{display:flex;flex-direction:column;gap:5px;margin-bottom:15px;}' +
    '.pq-f:last-of-type{margin-bottom:0;}' +
    '.pq-q{font-size:13.5px;font-weight:600;color:var(--text,#1A1814);line-height:1.5;display:flex;gap:9px;}' +
    '.pq-n{font-family:"DM Mono",monospace;font-size:11px;color:var(--accent-mid,#4A6FA5);' +
      'border:1px solid var(--border,#E2DED6);border-radius:4px;padding:1px 6px;height:20px;flex-shrink:0;}' +
    '.pq-help{font-size:12px;color:var(--text-3,#9C9688);line-height:1.55;padding-left:31px;}' +
    '.pq-card textarea{width:100%;border:1px solid var(--border,#E2DED6);border-radius:var(--radius-sm,6px);' +
      'padding:9px 12px;font-family:inherit;font-size:14px;color:var(--text,#1A1814);' +
      'background:var(--surface-2,#F9F8F5);outline:none;resize:vertical;line-height:1.55;}' +
    '.pq-card textarea:focus{border-color:var(--accent-mid,#4A6FA5);' +
      'box-shadow:0 0 0 3px rgba(74,111,165,.12);background:#fff;}' +
    '.pq-card textarea::placeholder{color:var(--text-3,#9C9688);}' +
    /* Panel agregado en el módulo de razonamiento */
    '.pqr-card{background:var(--surface,#fff);border:1px solid var(--border,#E2DED6);' +
      'border-radius:var(--radius,10px);padding:20px;margin-bottom:16px;}' +
    '.pqr-sec{border-top:1px solid var(--border,#E2DED6);padding:13px 0;}' +
    '.pqr-sec:first-of-type{border-top:none;padding-top:4px;}' +
    '.pqr-t{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;' +
      'color:var(--accent,#1D3A6B);margin-bottom:7px;}' +
    '.pqr-r{display:grid;grid-template-columns:104px 1fr;gap:12px;padding:3px 0;font-size:13px;line-height:1.55;}' +
    '.pqr-k{color:var(--text-3,#9C9688);}' +
    '.pqr-v{color:var(--text,#1A1814);}' +
    '.pqr-empty{font-size:13px;color:var(--text-3,#9C9688);line-height:1.6;}' +
    '.pqr-pend{background:#FFF4E0;border-left:3px solid #7A4A00;border-radius:0 6px 6px 0;' +
      'padding:12px 15px;margin-top:14px;font-size:13px;color:#7A4A00;line-height:1.6;}' +
    '.pqr-pend strong{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;}' +
    '.pqr-pend ul{margin:0;padding-left:17px;}' +
    '@media(max-width:640px){.pqr-r{grid-template-columns:1fr;gap:2px;}}';

  function inyectarEstilos() {
    var s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ── Tarjeta de preguntas de la sección ─────────────────────────────────
  function render(cfg) {
    var main = document.querySelector('main') || document.body;
    var card = document.createElement('div');
    card.className = 'pq-card';
    card.id = 'pqCard';
    card.innerHTML =
      '<div class="pq-eyebrow">Razonamiento clínico</div>' +
      '<div class="pq-h">Antes de cerrar esta sección</div>' +
      '<div class="pq-lead">Responde con tus palabras. El asistente no ve ni completa estas respuestas: ' +
        'son tu registro de razonamiento y viajan contigo al módulo de diagnóstico.</div>' +
      (cfg.anticipacion ?
        '<div class="pq-ant">' +
          '<div class="pq-ant-label">Antes de examinar</div>' +
          '<div class="pq-ant-q">' + cfg.anticipacion + '</div>' +
          '<textarea id="pq-anticipacion" rows="2" placeholder="Escríbelo antes de registrar los hallazgos."></textarea>' +
        '</div>' : '') +
      CIERRE.map(function (q, i) {
        return '<div class="pq-f">' +
          '<div class="pq-q"><span class="pq-n">' + (i + 1) + '</span><span>' + q.label + '</span></div>' +
          '<div class="pq-help">' + q.ayuda + '</div>' +
          '<textarea id="' + q.id + '" rows="' + q.rows + '" placeholder="' + q.ph + '"></textarea>' +
        '</div>';
      }).join('');
    main.appendChild(card);
  }

  // ── Panel agregado para el módulo de razonamiento ──────────────────────
  function leer(mod) {
    try {
      var crudo = localStorage.getItem(PREFIX + mod);
      if (!crudo) return null;
      return (JSON.parse(crudo).datos) || null;
    } catch (e) { return null; }
  }

  function escapar(t) {
    return String(t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function renderPanel() {
    var ancla = document.getElementById('rzStep1');
    if (!ancla) return;
    var destino = ancla.closest('.card') || ancla.parentNode;

    var secciones = [], pendientes = [];

    Object.keys(SECCIONES).forEach(function (mod) {
      if (mod === MODULO) return;
      var d = leer(mod);
      if (!d) return;
      var filas = [];
      var clave = d['v|pq-clave'], cons = d['v|pq-consecuencia'], pend = d['v|pq-pendiente'];
      if (clave) filas.push(['Hallazgo clave', clave]);
      if (cons) filas.push(['Consecuencia', cons]);
      if (pend) { filas.push(['Por confirmar', pend]); pendientes.push([SECCIONES[mod].titulo, pend]); }
      if (filas.length) secciones.push([SECCIONES[mod].titulo, filas]);
    });

    var card = document.createElement('div');
    card.className = 'pqr-card';
    card.innerHTML =
      '<div class="pq-eyebrow">Tus notas de las secciones anteriores</div>' +
      '<div class="pq-h">Lo que declaraste relevante en cada sección</div>' +
      '<div class="pq-lead">Tu hipótesis tiene que dar cuenta de esto. Si algún hallazgo que registraste ' +
        'como relevante no aparece en tu fundamentación, explica por qué lo dejaste fuera.</div>' +
      (secciones.length
        ? secciones.map(function (s) {
            return '<div class="pqr-sec"><div class="pqr-t">' + escapar(s[0]) + '</div>' +
              s[1].map(function (f) {
                return '<div class="pqr-r"><span class="pqr-k">' + f[0] + '</span>' +
                  '<span class="pqr-v">' + escapar(f[1]) + '</span></div>';
              }).join('') + '</div>';
          }).join('')
        : '<div class="pqr-empty">Todavía no has respondido las preguntas de cierre de las secciones ' +
          'anteriores. Vuelve a los módulos del examen y complétalas: son la base sobre la que se ' +
          'evalúa tu fundamentación.</div>') +
      (pendientes.length
        ? '<div class="pqr-pend"><strong>Quedó por confirmar</strong><ul>' +
            pendientes.map(function (p) {
              return '<li>' + escapar(p[0]) + ': ' + escapar(p[1]) + '</li>';
            }).join('') + '</ul></div>'
        : '');

    destino.parentNode.insertBefore(card, destino);
  }

  // ── Arranque ───────────────────────────────────────────────────────────
  inyectarEstilos();

  if (SECCIONES[MODULO]) {
    render(SECCIONES[MODULO]);
  } else if (MODULO.indexOf('razonamiento') !== -1) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { setTimeout(renderPanel, 700); });
    } else {
      setTimeout(renderPanel, 700);
    }
  }
})();
