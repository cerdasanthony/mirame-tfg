/* Service worker.
 *
 * Estrategia: red primero, cache como respaldo.
 *
 * La alternativa -cache primero- deja al usuario con una version vieja despues
 * de cada despliegue, que es justo el problema que aparece mientras el proyecto
 * esta en desarrollo activo. Con red primero se paga una latencia minima
 * estando en linea y se conserva el funcionamiento sin conexion, que es lo que
 * exige el RNF-05. */

const CACHE = "mirame-v13";
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
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARMAZON)));
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
