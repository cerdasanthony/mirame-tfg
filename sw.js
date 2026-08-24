/* Service worker.
 *
 * Estrategia: red primero, cache como respaldo.
 *
 * La alternativa -cache primero- deja al usuario con una version vieja despues
 * de cada despliegue, que es justo el problema que aparece mientras el proyecto
 * esta en desarrollo activo. Con red primero se paga una latencia minima
 * estando en linea y se conserva el funcionamiento sin conexion, que es lo que
 * exige el RNF-05. */

const CACHE = "mirame-v27";
const ARMAZON = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/app.js",
  "./js/face.js",
  "./js/features.js",
  "./js/classifier.js",
  "./js/storage.js",
  "./js/board.js",
  "./js/speech.js",
  "./js/segunda-opinion.js",
  "./js/heuristica.js",
  "./js/facs.js",
  "./js/microexpresiones.js",
  "./js/pictogramas.js",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon-maskable-512.png",
  /* Pictogramas: sin ellos el tablero es inutilizable sin conexion. */
  "./assets/pictogramas/abrazo.png",
  "./assets/pictogramas/afuera.png",
  "./assets/pictogramas/agua.png",
  "./assets/pictogramas/ayuda.png",
  "./assets/pictogramas/bano.png",
  "./assets/pictogramas/comer.png",
  "./assets/pictogramas/dormir.png",
  "./assets/pictogramas/jugar.png",
  "./assets/pictogramas/mas.png",
  "./assets/pictogramas/musica.png",
  "./assets/pictogramas/no.png",
  "./assets/pictogramas/termine.png",
];

/* Precarga tolerante a fallos individuales.
 *
 * `cache.addAll()` es atomico: si UNO de los recursos devuelve 404, rechaza
 * entero y el service worker no llega a instalarse, con lo que se pierde el
 * funcionamiento sin conexion completo por culpa de un solo archivo ausente.
 * Un icono que todavia no se subio no deberia costar el RNF-05.
 *
 * Se cachea recurso por recurso y se deja constancia de los que fallaron, en
 * lugar de perderlo todo en silencio. */
async function precargar() {
  const c = await caches.open(CACHE);
  const fallidos = [];
  await Promise.all(ARMAZON.map((u) => c.add(u).catch(() => fallidos.push(u))));
  if (fallidos.length) console.warn("[sw] recursos no cacheados:", fallidos);
}

self.addEventListener("install", (e) => {
  e.waitUntil(precargar());
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  /* «Red primero» no bastaba, y por un motivo que no estaba a la vista: la CACHE
     HTTP DEL NAVEGADOR se interpone ANTES que este trabajador. Un `fetch` normal
     puede resolverse contra esa cache y devolver un archivo viejo sin llegar a
     tocar la red, de modo que la estrategia decia red primero pero servia lo
     mismo que cache primero.
     Ocurrio dos veces en desarrollo: la aplicacion quedaba con el JavaScript
     nuevo y la hoja de estilos vieja, una combinacion que no existe en ningun
     despliegue y que produce fallos imposibles de reproducir. Un tablero entero
     con los discos vacios salio de ahi.
     Con `cache: "reload"` la peticion salta la cache HTTP y va a la red de
     verdad. Se limita al propio origen: los recursos de CDN, que estan
     versionados y no cambian, se siguen aprovechando de la cache. */
  const mismoOrigen = new URL(e.request.url).origin === location.origin;
  const peticion = mismoOrigen
    ? new Request(e.request, { cache: "reload" })
    : e.request;

  e.respondWith(
    fetch(peticion)
      .then((res) => {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || Promise.reject(new Error("sin red y sin cache"))))
  );
});
