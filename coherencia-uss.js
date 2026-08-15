/**
 * coherencia-uss.js — Verificación de coherencia entre secciones
 *
 * Compara datos que el estudiante registró en módulos distintos y detecta
 * contradicciones. No corrige ni indica cuál de los dos datos es el correcto:
 * expone el conflicto como pregunta y deja que el estudiante lo resuelva.
 *
 * Se usa después del sello, en el paso 2 del módulo de razonamiento, para no
 * intervenir en la fundamentación inicial.
 *
 * Uso:  const alertas = CoherenciaUSS.evaluar();
 *       // [{ id, titulo, dato_a, dato_b, pregunta, gravedad }]
 *
 * ── PARA AGREGAR UNA REGLA ────────────────────────────────────────────────
 * Añade un objeto a REGLAS con una función `evaluar(f)` que devuelva null
 * cuando no hay conflicto, o el objeto de la alerta cuando lo hay. `f` da
 * acceso a los datos: f.val('modulo','campo'), f.radio('modulo','nombre'),
 * f.check('modulo','id'), f.num('modulo','campo'), f.sas().
 * Si falta el dato necesario, la regla debe devolver null: nunca se alerta
 * por información que el estudiante todavía no ha registrado.
 */
(function () {
  'use strict';

  var PREFIX = 'fichaUSS:v6:';

  var M = {
    ident:    'identificacion_antecedentes_uss',
    fisico:   'examen_fisico_general_uss',
    extra:    'examen_extraoral_uss',
    intra:    'examen_intraoral_uss',
    odonto:   'odontograma_uss',
    perio:    'examenes_periodontales_uss',
    comp:     'examenes_complementarios_uss',
    situ:     'situaciones_relevantes_uss',
    diag:     'diagnostico_razonamiento_guiado_uss',
    rz:       'diagnostico_razonamiento_guiado_uss'
  };

  // ── Acceso a los datos guardados ───────────────────────────────────────
  var cache = {};
  function datos(mod) {
    if (mod in cache) return cache[mod];
    try {
      var crudo = localStorage.getItem(PREFIX + mod);
      cache[mod] = crudo ? (JSON.parse(crudo).datos || {}) : {};
    } catch (e) { cache[mod] = {}; }
    return cache[mod];
  }

  var f = {
    val:   function (mod, id) { var v = datos(mod)['v|' + id]; return v == null ? '' : String(v).trim(); },
    sas:   function () {
             var sit = parseFloat(datos(M.perio)['v|sangSitios']);
             var tot = parseFloat(datos(M.perio)['v|sangTotal']);
             if (isNaN(sit) || isNaN(tot) || tot === 0) return null;
             return Math.round((sit / tot) * 1000) / 10;
           },
    num:   function (mod, id) { var v = parseFloat(datos(mod)['v|' + id]); return isNaN(v) ? null : v; },
    radio: function (mod, name) { var v = datos(mod)['r|' + name]; return v == null ? '' : String(v).trim(); },
    check: function (mod, id) { return datos(mod)['c|' + id] === true; },
    sello: function () { try { return JSON.parse(localStorage.getItem(PREFIX + 'rz-sello')); } catch (e) { return null; } }
  };

  function contiene(texto, palabras) {
    var t = (texto || '').toLowerCase();
    return palabras.some(function (p) { return t.indexOf(p.toLowerCase()) !== -1; });
  }

  /* Texto completo de la hipótesis sellada, para buscar menciones */
  function hipotesisTexto() {
    var s = f.sello();
    if (s) {
      return [s.perioDx, s.perioEstadio, s.perioGrado, s.perioExtension,
              s.durosDx, s.durosJust, s.otrosDx, s.otrosJust, s.diferencial,
              s.hipotesis, s.evidencia].filter(Boolean).join(' ');
    }
    var d = datos(M.rz);
    return Object.keys(d).filter(function (k) { return k.indexOf('v|rz') === 0; })
      .map(function (k) { return d[k]; }).join(' ');
  }

  /* Piezas mencionadas con notación FDI, para cruzar odontograma con plan */
  function piezasFDI(texto) {
    var m = (texto || '').match(/\b[1-4]\.?[1-8]\b/g) || [];
    return m.map(function (p) { return p.replace('.', ''); });
  }

  // ── Reglas ─────────────────────────────────────────────────────────────
  var REGLAS = [

    { id: 'perio-gingivitis-sacos', evaluar: function (f) {
        var dx = f.val(M.perio, 'diagPerio');
        var sitios = f.num(M.perio, 'sitiosPS4');
        if (!dx || sitios === null) return null;
        if (!contiene(dx, ['gingivitis', 'salud periodontal']) || sitios <= 0) return null;
        return {
          titulo: 'Diagnóstico gingival frente a las profundidades registradas',
          dato_a: 'En el examen periodontal registraste ' + sitios + ' sitio(s) con profundidad al sondaje de 4 mm o más' +
                  (f.val(M.perio, 'piezasPS4') ? ' (' + f.val(M.perio, 'piezasPS4') + ')' : '') + '.',
          dato_b: 'Tu diagnóstico periodontal es «' + dx + '».',
          pregunta: '¿Cómo concilias esas profundidades con este diagnóstico? Para decidirlo necesitas distinguir si son sacos verdaderos con pérdida de inserción o pseudobolsas. ¿Registraste el nivel de inserción clínica de esos sitios?',
          gravedad: 'alta'
        };
      }
    },

    { id: 'perio-periodontitis-sin-sacos', evaluar: function (f) {
        var dx = f.val(M.perio, 'diagPerio');
        var sitios = f.num(M.perio, 'sitiosPS4');
        if (!dx || sitios === null) return null;
        if (dx.toLowerCase().indexOf('periodontitis') === -1 || sitios > 0) return null;
        return {
          titulo: 'Diagnóstico de periodontitis sin sitios profundos registrados',
          dato_a: 'Registraste 0 sitios con profundidad al sondaje de 4 mm o más.',
          dato_b: 'Tu diagnóstico periodontal es «' + dx + '».',
          pregunta: 'La periodontitis se define por pérdida de inserción, no por profundidad al sondaje: puede haber pérdida de inserción con sondaje somero si hay recesión. ¿En qué dato apoyas el diagnóstico y por qué no aparece en el registro?',
          gravedad: 'alta'
        };
      }
    },

    { id: 'atm-sin-ruidos', evaluar: function (f) {
        var der = f.val(M.extra, 'ruidosDer'), izq = f.val(M.extra, 'ruidosIzq');
        if (!der && !izq) return null;
        var sinRuidos = (!der || der === 'Sin ruidos') && (!izq || izq === 'Sin ruidos');
        if (!sinRuidos) return null;
        var dxTTM = f.val(M.diag, 'diagTTM') + ' ' + hipotesisTexto();
        if (!contiene(dxTTM, ['reducción', 'reduccion', 'desplazamiento discal', 'desplazamiento del disco'])) return null;
        return {
          titulo: 'Examen de ATM frente al diagnóstico articular',
          dato_a: 'En el examen de ATM consignaste ausencia de ruidos articulares en ambos lados.',
          dato_b: 'Tu diagnóstico incorpora un desplazamiento discal con reducción.',
          pregunta: 'La reducción del disco se define por el chasquido. O el examen quedó incompleto o el diagnóstico no corresponde: ¿cuál de los dos vas a corregir, y con qué maniobra lo comprobarías?',
          gravedad: 'alta'
        };
      }
    },

    { id: 'asa-vs-sistemico', evaluar: function (f) {
        var asa = f.radio(M.fisico, 'asa');
        if (asa !== 'ASA I') return null;
        var control = f.val(M.situ, 'sisControl');
        var poli = f.val(M.situ, 'sisPolifarmacia');
        var pistas = [];
        if (control && control.toLowerCase().indexOf('no aplica') === -1 && control.toLowerCase().indexOf('sin patolog') === -1) {
          pistas.push('control de la patología sistémica: ' + control);
        }
        if (poli && poli.toLowerCase().indexOf('no') !== 0 && poli.toLowerCase().indexOf('sin') === -1) {
          pistas.push('polifarmacia: ' + poli);
        }
        if (!pistas.length) return null;
        return {
          titulo: 'Clasificación ASA frente a las condicionantes sistémicas',
          dato_a: 'Clasificaste al paciente como ASA I, que corresponde a un paciente sano sin enfermedad sistémica.',
          dato_b: 'En situaciones relevantes registraste ' + pistas.join('; ') + '.',
          pregunta: 'Si hay una patología sistémica en seguimiento o consumo habitual de fármacos, la clasificación ASA I no corresponde. ¿Cuál de los dos registros vas a corregir?',
          gravedad: 'media'
        };
      }
    },

    { id: 'tabaco-sangrado', evaluar: function (f) {
        if (!f.check(M.situ, 'habTabaco')) return null;
        var sas = f.sas();
        if (sas === null || sas >= 20) return null;
        return {
          titulo: 'Tabaquismo frente al índice de sangrado',
          dato_a: 'Registraste consumo de tabaco en los hábitos del paciente.',
          dato_b: 'El sangrado al sondaje es de ' + sas + '%.',
          pregunta: 'El tabaco produce vasoconstricción y reduce el sangrado al sondaje, de modo que este porcentaje puede estar subestimando la inflamación real. ¿En qué otro parámetro te apoyas para valorar la actividad de la enfermedad?',
          gravedad: 'media'
        };
      }
    },

    { id: 'tabaco-grado', evaluar: function (f) {
        if (!f.check(M.situ, 'habTabaco')) return null;
        var dx = f.val(M.perio, 'diagPerio');
        if (dx.toLowerCase().indexOf('periodontitis') === -1) return null;
        if (dx.indexOf('grado A') === -1) return null;
        return {
          titulo: 'Tabaquismo frente al grado periodontal',
          dato_a: 'Registraste consumo de tabaco.',
          dato_b: 'Asignaste grado A al diagnóstico periodontal.',
          pregunta: 'El tabaquismo es un modificador de grado y desplaza el grado hacia B o C según el consumo. ¿Cuántos cigarrillos diarios registraste y cómo entraron en la asignación del grado?',
          gravedad: 'media'
        };
      }
    },

    { id: 'riesgo-caries-omitido', evaluar: function (f) {
        var riesgo = f.radio(M.comp, 'riesgoCaries');
        if (riesgo.toLowerCase().indexOf('alto') === -1) return null;
        var situ = [f.val(M.situ, 'sintesisFinal'), f.val(M.situ, 'obsOdonto'), f.val(M.situ, 'enunciadoProblema')].join(' ');
        if (contiene(situ, ['riesgo cariogénico', 'riesgo cariogenico', 'alto riesgo', 'caries'])) return null;
        if (!situ.trim()) return null;
        return {
          titulo: 'Riesgo cariogénico frente a la síntesis del problema',
          dato_a: 'Determinaste alto riesgo cariogénico en los exámenes complementarios.',
          dato_b: 'La síntesis del problema no lo menciona.',
          pregunta: 'Si el riesgo es alto, condiciona la frecuencia de controles, las medidas preventivas y el pronóstico. ¿Por qué quedó fuera de la síntesis, o corresponde incorporarlo?',
          gravedad: 'media'
        };
      }
    },

    { id: 'caries-fuera-del-plan', evaluar: function (f) {
        var odonto = [f.val(M.odonto, 'cuad1'), f.val(M.odonto, 'cuad2'), f.val(M.odonto, 'cuad3'),
                      f.val(M.odonto, 'cuad4'), f.val(M.odonto, 'obsOdontograma')].join(' ');
        var plan = f.val(M.diag, 'planFinal');
        if (!odonto.trim() || !plan.trim()) return null;

        var conCaries = [];
        odonto.split(/(?=\b[1-4]\.[1-8]\b)/).forEach(function (frag) {
          if (!contiene(frag, ['caries', 'icdas'])) return;
          var p = frag.match(/\b[1-4]\.[1-8]\b/);
          if (p) conCaries.push(p[0]);
        });
        if (!conCaries.length) return null;

        var enPlan = piezasFDI(plan);
        var faltan = conCaries.filter(function (p) { return enPlan.indexOf(p.replace('.', '')) === -1; });
        faltan = faltan.filter(function (p, i) { return faltan.indexOf(p) === i; });
        if (!faltan.length) return null;

        return {
          titulo: 'Lesiones de caries que no aparecen en el plan',
          dato_a: 'En el odontograma registraste lesiones de caries en ' + faltan.join(', ') + '.',
          dato_b: 'Esas piezas no aparecen mencionadas en el plan de tratamiento.',
          pregunta: '¿Quedaron fuera del plan por una decisión clínica —por ejemplo, lesiones inactivas que solo requieren control— o por omisión? Si es una decisión, corresponde dejarla escrita.',
          gravedad: 'alta'
        };
      }
    },

    { id: 'indentaciones-sin-desgaste', evaluar: function (f) {
        var bordes = f.val(M.intra, 'bordesLinguales');
        if (!bordes || !contiene(bordes, ['indentaciones'])) return null;
        var texto = [f.val(M.odonto, 'cuad1'), f.val(M.odonto, 'cuad2'),
                     f.val(M.odonto, 'cuad3'), f.val(M.odonto, 'cuad4'),
                     f.val(M.odonto, 'obsOdontograma'), f.val(M.diag, 'diagDesgaste'),
                     hipotesisTexto()].join(' ');
        if (!texto.trim()) return null;   // sin odontograma todavía, no se alerta
        if (contiene(texto, ['desgaste', 'atrición', 'atricion', 'faceta', 'abfracción',
                             'abfraccion', 'bruxismo', 'parafunción', 'parafuncion'])) return null;
        return {
          titulo: 'Indentaciones linguales sin desgaste consignado',
          dato_a: 'En el examen intraoral registraste indentaciones por impresión dentaria en los bordes laterales de la lengua.',
          dato_b: 'Ni el odontograma ni el diagnóstico mencionan desgaste, facetas ni parafunción.',
          pregunta: 'Las indentaciones son un signo de presión lingual mantenida. ¿Buscaste facetas de desgaste en las superficies oclusales e incisales? Si las buscaste y no las hay, conviene dejarlo escrito, porque cambia la lectura del hallazgo.',
          gravedad: 'media'
        };
      }
    },

    { id: 'hiposalivacion-vs-riesgo', evaluar: function (f) {
        var flujo = f.val(M.intra, 'flujoSalival');
        var riesgo = f.radio(M.comp, 'riesgoCaries');
        if (!flujo || !riesgo) return null;
        if (!contiene(flujo, ['hiposalivación', 'hiposalivacion', 'xerostomía', 'xerostomia'])) return null;
        if (riesgo.toLowerCase().indexOf('bajo') === -1) return null;
        var causas = [];
        if (f.check(M.intra, 'xeroFarmacos'))  causas.push('fármacos xerostomizantes');
        if (f.check(M.intra, 'xeroSistemico')) causas.push('una condición sistémica asociada');
        if (f.check(M.intra, 'xeroRadio'))     causas.push('antecedente de radioterapia de cabeza y cuello');
        return {
          titulo: 'Flujo salival disminuido frente al riesgo cariogénico',
          dato_a: 'En el examen intraoral consignaste ' + flujo.toLowerCase() +
                  (causas.length ? ', asociada a ' + causas.join(' y ') : '') + '.',
          dato_b: 'Clasificaste al paciente como de bajo riesgo cariogénico.',
          pregunta: 'La saliva es el principal factor protector frente a la caries. ¿Qué otros factores compensan la disminución del flujo en este paciente, o corresponde revisar la clasificación de riesgo?',
          gravedad: 'alta'
        };
      }
    },

    { id: 'higiene-vs-riesgo', evaluar: function (f) {
        var iho = f.radio(M.perio, 'tipoHigiene');
        var riesgo = f.radio(M.comp, 'riesgoCaries');
        if (!iho || !riesgo) return null;
        if (iho.toLowerCase().indexOf('deficiente') === -1) return null;
        if (riesgo.toLowerCase().indexOf('bajo') === -1) return null;
        return {
          titulo: 'Índice de higiene frente al riesgo cariogénico',
          dato_a: 'Clasificaste la higiene oral del paciente como ' + iho.toLowerCase() + '.',
          dato_b: 'Clasificaste al paciente como de bajo riesgo cariogénico.',
          pregunta: 'La cantidad de biofilm es uno de los determinantes del riesgo. ¿Qué factores protectores compensan la higiene deficiente en este paciente, o corresponde revisar la clasificación de riesgo?',
          gravedad: 'media'
        };
      }
    },

    { id: 'sin-diferencial', evaluar: function (f) {
        var s = f.sello();
        if (!s) return null;
        var dif = (s.diferencial || '').trim();
        if (dif.length > 40 && !contiene(dif, ['no considero', 'ninguna', 'no aplica', 'no refiere'])) return null;
        return {
          titulo: 'Diagnóstico diferencial',
          dato_a: 'No registraste una explicación alternativa, o la dejaste enunciada sin fundamento.',
          dato_b: '',
          pregunta: 'Toda hipótesis compite con al menos otra. ¿Qué otra condición podría producir los mismos hallazgos en este paciente, y qué dato del examen te permite descartarla?',
          gravedad: 'media'
        };
      }
    }
  ];

  // ── API pública ────────────────────────────────────────────────────────
  window.CoherenciaUSS = {
    evaluar: function () {
      cache = {};
      var alertas = [];
      REGLAS.forEach(function (r) {
        var res;
        try { res = r.evaluar(f); } catch (e) { res = null; }
        if (res) { res.id = r.id; alertas.push(res); }
      });
      alertas.sort(function (a, b) { return (a.gravedad === 'alta' ? 0 : 1) - (b.gravedad === 'alta' ? 0 : 1); });
      return alertas;
    },
    reglas: REGLAS.length
  };
})();
