/* Service worker minimo: cachea el armazon de la aplicacion para uso sin conexion.
   El runtime de MediaPipe y el modelo se cachean por separado la primera vez. */

const CACHE = "mirame-v1";
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
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia)).catch(() => {});
          return res;
        })
    )
  );
});
