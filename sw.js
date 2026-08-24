/* Service worker.
 *
 * Estrategia: red primero, cache como respaldo.
 *
 * La alternativa -cache primero- deja al usuario con una version vieja despues
 * de cada despliegue, que es justo el problema que aparece mientras el proyecto
 * esta en desarrollo activo. Con red primero se paga una latencia minima
 * estando en linea y se conserva el funcionamiento sin conexion, que es lo que
 * exige el RNF-05. */

const CACHE = "mirame-v15";
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
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon-maskable-512.png",
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
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || Promise.reject(new Error("sin red y sin cache"))))
  );
});
