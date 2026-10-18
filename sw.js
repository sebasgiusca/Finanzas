const CACHE = "finanzas-v2";
const ASSETS = ["./", "./index.html", "./style.css", "./app.js", "./core.js", "./catalogo.js", "./manifest.json",
  "./icons/icon-192.png", "./icons/icon-512.png", "./vendor/pdf.min.js", "./vendor/pdf.worker.min.js", "./vendor/exceljs.min.js", "./excel.js"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Red primero (para recibir versiones nuevas), cache si no hay conexion
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
