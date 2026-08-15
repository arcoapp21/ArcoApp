# Publicar el Asistente Digital para los estudiantes

Todo el paquete queda en un link público. Los estudiantes no necesitan cuenta
de nada, no instalan nada y no ven ninguna clave.

```
navegador del estudiante  →  Cloudflare Worker (tiene la clave)  →  API de Claude
```

---

## Paso 1 — Desplegar el Worker

1. Crear cuenta gratuita en <https://dash.cloudflare.com> → **Workers & Pages** →
   **Create** → **Worker** → nombre `ficha-uss-proxy` → **Deploy**.
2. **Edit code**: borrar el contenido y pegar `worker.js` completo. **Deploy**.
3. **Settings › Variables and Secrets** → **Add** → tipo **Secret** →
   nombre `ANTHROPIC_API_KEY` → pegar la clave de la consola de Anthropic.
   Queda cifrada: no aparece en el código ni en el navegador.
4. Copiar la URL que quedó, del tipo
   `https://ficha-uss-proxy.tu-cuenta.workers.dev`.

La clave se saca en <https://console.anthropic.com> → API Keys. Conviene crear
una clave **exclusiva para este piloto**, para poder revocarla sin afectar nada
más, y fijar un límite de gasto mensual en Billing › Limits.

## Paso 2 — Publicar los archivos

Con GitHub Pages (gratuito y estable):

1. Crear un repositorio, por ejemplo `ficha-uss`.
2. Subir **todos** los archivos de esta carpeta (menos `worker.js` y este
   `LEEME.md`), sin subcarpetas: los módulos se referencian entre sí por
   nombre de archivo.
3. **Settings › Pages** → Source: `main`, carpeta `/ (root)` → **Save**.
4. En un par de minutos queda en
   `https://tu-usuario.github.io/ficha-uss/`.

Alternativa sin Git: <https://app.netlify.com/drop>, arrastrando la carpeta.

## Paso 3 — Conectar las dos partes

1. En `config-uss.js`, reemplazar la URL por la del Worker del paso 1.
2. En `worker.js`, en `ORIGENES`, poner el origen real de publicación
   (`https://tu-usuario.github.io`, **sin** la ruta del repositorio) y volver a
   desplegar. Ese arreglo es lo que impide que otro sitio use tu cuota.

## Paso 4 — Probar antes de repartir

Abrir un módulo, escribir algo y pulsar un botón de IA. Si no responde, abrir
la consola del navegador (F12):

| Mensaje | Causa |
|---|---|
| `CORS` / `blocked by policy` | el origen de `ORIGENES` no coincide con el real |
| `403 Origen no autorizado` | igual que el anterior |
| `500 Falta configurar ANTHROPIC_API_KEY` | el secreto no quedó guardado |
| `404` en `config-uss.js` | falta ese archivo en la raíz del sitio |

---

## Lo que cambié respecto de tus archivos originales

- **Modelo actualizado.** Todos los llamados a la API apuntaban a
  `claude-sonnet-4-20250514`, un modelo retirado de la API el 15 de junio de
  2026: hoy devolvería error en todos los módulos. Quedaron en
  `claude-sonnet-5`. El Worker impone el modelo, así que para cambiarlo (por
  ejemplo a `claude-haiku-4-5-20251001`, bastante más barato) se edita una sola
  línea en `worker.js`.
- **Un solo punto de configuración.** Cada HTML tenía su propia constante
  `API_URL`. Ahora todos leen `window.FICHA_USS_API` desde `config-uss.js`.
- **Scripts enganchados.** `ficha-uss.js`, `coherencia-uss.js` y `sello-uss.js`
  no estaban incluidos en ningún módulo: el autoguardado, la verificación de
  coherencia y el sello de fundamentación no se ejecutaban. Quedaron cargados
  en los once módulos, en ese orden. `sello-uss.js` se activa solo en los tres
  módulos que tiene configurados y se ignora en el resto.
- **Módulo duplicado eliminado.** `diagnostico_plan_pronostico_uss.html` era la
  versión sin flujo de fundamentación previa, con el mismo título y estructura
  que `diagnostico_razonamiento_guiado_uss.html`. No está en este paquete: tener
  ambas visibles habría hecho imposible atribuir las diferencias al OE1. El
  archivo original sigue en el proyecto por si lo necesitas.

## Advertencias para el uso en clínica

- **Los datos viven en el navegador del computador donde se escribieron**
  (`localStorage`). Si los estudiantes usan equipos compartidos de la clínica,
  todos los que usen ese equipo verán la ficha del anterior, y basta con que
  alguien limpie el historial para perderlo todo. Antes del piloto conviene
  definir si cada estudiante trabaja en su propio equipo o si se exporta el
  caso al terminar cada sesión.
- **Modo incógnito borra todo al cerrar.** Vale la pena decírselo explícitamente.
- **Datos de pacientes reales.** El texto que el estudiante escribe en los
  campos con botón de IA sí sale del computador y llega a la API. Si se van a
  usar pacientes reales, esto debería pasar por el comité de ética y los
  estudiantes deberían trabajar con iniciales o código de ficha, nunca con
  nombre y RUT.
- **Falta el índice.** `ficha-uss.js` menciona un `index.html` que ofrece
  exportar el caso a `.json`, y no está entre los archivos del proyecto. Sin él
  los estudiantes tienen que navegar módulo por módulo y no hay forma de
  exportar el caso completo.

---

## `index.html` — el índice

Es la puerta de entrada: al publicar el sitio, `https://.../ficha-uss/` abre
directamente este archivo. Muestra los once módulos en orden clínico, con el
estado de cada uno leído del propio navegador (campos registrados, fotografías,
fundamentación sellada, hora de la última edición) y tres acciones sobre el caso:

- **Exportar caso** → descarga un `.json` con todo, nombrado
  `caso_INICIALES_AAAA-MM-DD.json`. Es el respaldo y la forma de mover el caso
  de un computador a otro, o de entregarlo al tutor.
- **Importar** → repone un caso exportado. Avisa antes de sobrescribir.
- **Cerrar caso** → borra todos los datos del equipo. Pensado para los
  computadores compartidos de la clínica: el estudiante exporta y cierra antes
  de dejar el puesto.

No mide porcentaje de avance a propósito. Varios módulos generan campos de forma
dinámica y muchos son condicionales, así que un «68 % completado» sería inventado.
Muestra el dato verificable: cuántos campos tienen contenido.

El índice no carga `ficha-uss.js` — no es un formulario y no debe crear su propia
entrada en el almacenamiento.

---

## Correcciones al flujo de razonamiento (fase 2)

Al revisar por qué el módulo de diagnóstico y el documento de corrección no
funcionaban, apareció que los tres archivos se comunican por unas claves de
almacenamiento que nadie escribía.

**El sello no se guardaba.** En `diagnostico_razonamiento_guiado_uss.html`, la
fundamentación sellada vivía en un objeto `RZ` en memoria. Al recargar la
página, el bloqueo, la marca de tiempo y el botón «Registrar» volvían al estado
inicial: el estudiante podía reescribir su hipótesis después de haber leído las
preguntas del asistente. El sello era decorativo. Ahora se persiste en
`fichaUSS:v6:rz-sello` al momento de sellar, y se restaura con el bloqueo
aplicado al volver a abrir el módulo.

**El documento de corrección leía módulos inexistentes.**
`registro_razonamiento_uss.html` recorría `examen_intraoral_uss`, que no existe
en el proyecto, y `diagnostico_plan_pronostico_uss`, que se eliminó. Corregido.
Lo mismo en el mapa de módulos de `coherencia-uss.js`.

**Faltaban los datos del encabezado.** La pauta muestra «Estudiante» y «Código
del caso» leyéndolos de `fichaUSS:v6:_meta`, que nadie escribía. El índice ahora
tiene esos dos campos y los guarda ahí; viajan dentro del `.json` exportado.

### Preguntas de cierre (fase 3)

Ya están insertadas en las siete secciones de examen: identificación, físico
general, extraoral, odontograma, periodontales, complementarios y situaciones
relevantes. En cada una, la pregunta de anticipación abre el módulo —arriba de
todo, antes del primer campo— y las tres preguntas evaluadas cierran la página.

| `id` del campo | Dónde | Criterio |
| --- | --- | --- |
| `pq-anticipacion` | inicio del módulo | Anexo · no puntúa |
| `pq-clave` | cierre | 1 · Jerarquización del hallazgo |
| `pq-consecuencia` | cierre | 2 · Consecuencia clínica |
| `pq-pendiente` | cierre | 3 · Reconocimiento de la incertidumbre |

Los estilos van en un bloque `.pq-*` propio dentro de cada módulo y usan las
variables de color que ya define cada archivo, así que la redacción se edita
directamente en el HTML sin tocar nada más. El texto es idéntico en las siete
secciones a propósito: el documento de corrección compara las respuestas entre
secciones, y eso solo tiene sentido si la pregunta fue la misma.

El asistente de fármacos y el módulo de diagnóstico quedaron fuera: el primero
es una herramienta de consulta que no guarda datos del caso, y el segundo aporta
los criterios 4 a 6 por la vía de la fundamentación sellada. El denominador del
encabezado de la pauta se ajustó a siete secciones.

---

## Módulo de examen intraoral (fase 4)

`examen_intraoral_uss.html` es nuevo. El corrector y `coherencia-uss.js` ya lo
referenciaban desde el principio —estaba planificado y nunca construido—, así
que la única pieza que faltaba era el archivo.

Cinco pestañas y un resumen: labios y mucosas, lengua y piso de boca, paladar y
orofaringe, glándulas salivales, y lesiones de mucosa. Hereda el CSS del módulo
extraoral, así que es visualmente idéntico al resto, y trae las cuatro preguntas
de la pauta en la misma posición que las otras secciones.

Dos apoyos de IA:

- **Redactar con IA** en labios y mucosas, igual que en los demás módulos:
  convierte los campos en un párrafo clínico.
- **Ordenar descripción** en el registro de lesiones. El prompt le prohíbe
  explícitamente nombrar patologías, proponer diagnóstico o escribir
  «compatible con»: solo reordena lo que el estudiante observó en secuencia
  semiológica —localización, lesión elemental, tamaño, color, bordes,
  superficie, consistencia, evolución, sintomatología— y termina listando los
  atributos que el estudiante no consignó. Es la misma lógica del sello: el
  asistente muestra el vacío, no lo rellena.

La pestaña de lesiones incluye fotografía clínica, que se guarda como el resto
de las imágenes y se exporta dentro del `.json`. Hay un recordatorio de
consentimiento a la vista, pero la autorización del paciente para el registro
fotográfico es responsabilidad del protocolo de la clínica, no del software.

El índice pasó a once módulos y el examen intraoral quedó en la posición 4,
entre el extraoral y el odontograma. El documento de corrección ahora recorre
ocho secciones.

### Dos reglas de coherencia nuevas

`coherencia-uss.js` pasó de diez a doce reglas. Las dos nuevas cruzan el módulo
intraoral con el resto de las secciones:

- **`indentaciones-sin-desgaste`** — si registraste indentaciones en los bordes
  laterales de la lengua y ni el odontograma ni el diagnóstico mencionan
  desgaste, facetas o parafunción, pregunta si buscaste facetas de desgaste. No
  alerta si el odontograma todavía está vacío.
- **`hiposalivacion-vs-riesgo`** — si consignaste hiposalivación o xerostomía y
  clasificaste al paciente como de bajo riesgo cariogénico, pregunta qué factores
  protectores compensan. Gravedad alta. Si marcaste alguna causa (fármacos,
  condición sistémica, radioterapia), la nombra en el texto de la alerta.

Como todas las demás, no corrigen ni dicen cuál de los dos datos está mal:
exponen el conflicto como pregunta.
