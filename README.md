# Ficha Clínica Adulto con Asistencia de IA — Universidad San Sebastián

Ficha clínica digital para la asignatura Introducción a la Clínica de la carrera
de Odontología. El asistente no resuelve el caso: exige al estudiante registrar y
fundamentar su hipótesis antes de responder, y responde con preguntas.

## Estructura

    /                    sitio publicable — se sube tal cual al hosting
      index.html         índice navegable
      *_uss.html         módulos de la ficha y páginas de cierre
      config-uss.js      dirección del Worker (editar antes de publicar)
      ficha-uss.js       guardado automático
      coherencia-uss.js  verificación de coherencia entre secciones
      preguntas-uss.js   preguntas de razonamiento
      sello-uss.js       fundamentación bloqueada de diagnósticos parciales
      LEEME.txt          documentación de uso

    /worker              NO se publica: se despliega en Cloudflare
      worker.js          proxy de la API y recepción de entregas
      wrangler.toml      configuración del despliegue

## Publicar el sitio

Cualquier hosting estático sirve. Los archivos de la raíz deben quedar juntos y
en la misma carpeta; abrir `index.html` con doble clic **no funciona**, porque
los navegadores bloquean los iframes entre archivos locales.

Con GitHub Pages: Settings → Pages → Deploy from a branch → rama `main`,
carpeta `/ (root)`.

Para probar en local:

    python3 -m http.server 8000

## Desplegar el Worker

    cd worker
    wrangler kv namespace create ENTREGAS
    # pegar el id devuelto en wrangler.toml
    wrangler deploy
    wrangler secret put ANTHROPIC_API_KEY
    wrangler secret put DOCENTE_TOKEN

Antes de desplegar, editar en `worker/worker.js` el arreglo `ORIGENES` con la URL
real de publicación. Si el origen no coincide, el navegador bloquea las llamadas.
Después del despliegue, poner la URL del Worker en `config-uss.js`.

## Qué nunca se sube al repositorio

La clave de Anthropic y la clave docente viven como secretos en Cloudflare, no en
el código. Tampoco se suben casos exportados: contienen datos de pacientes y de
estudiantes. El `.gitignore` los excluye.

`config-uss.js` sí se sube: contiene solo la URL del Worker, que de todos modos
es visible en el navegador de cualquier usuario.
