/**
 * config-uss.js — único lugar donde se define a dónde llaman los módulos.
 *
 * Reemplaza la URL por la de tu Worker una vez desplegado. Todos los módulos
 * la leen desde aquí: no hay que tocar ningún HTML.
 */
window.FICHA_USS_API = "https://ficha-uss-proxy.arcoapp-21.workers.dev";

/* Marca si la URL sigue con el valor de ejemplo. Los módulos la usan para
   avisar en pantalla en vez de fallar en silencio. */
window.FICHA_USS_API_CONFIGURADA = !/TU-SUBDOMINIO|TU-USUARIO|ejemplo/i.test(window.FICHA_USS_API || '');
