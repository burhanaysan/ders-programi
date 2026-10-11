/* tarafından üretilir: iphone-web/derle.mjs — elle değiştirmeyin. */
const ONBELLEK = "dersprogrami-a8ab04fb909d";
const DOSYALAR = ["css/tema.css","fonts/OFL.txt","fonts/Rajdhani-Bold.ttf","fonts/Rajdhani-Medium.ttf","fonts/Rajdhani-Regular.ttf","fonts/Rajdhani-SemiBold.ttf","index.html","ios.css","js/app.js","js/ayikla.js","js/durum.js","js/duzenle.js","js/pdfOku.js","js/plan.js","js/tatil.js","kayit.js","manifest.webmanifest","pdfjs/LICENSE.txt","pdfjs/pdf.min.mjs","pdfjs/pdf.worker.min.mjs","simge-180.png","simge-192.png","simge-512.png","surum.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(ONBELLEK).then((c) =>
    Promise.all(DOSYALAR.map((f) => c.add(new Request(f, { cache: "reload" }))))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((a) => a !== ONBELLEK).map((a) => caches.delete(a))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const q = e.request;
  if (q.method !== "GET") return;
  const url = new URL(q.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(ONBELLEK);
    // Sayfa gezintisi her zaman önbellekteki index.html'e düşer (alt dizin ve "?..." farkı önemsiz)
    const bulunan = q.mode === "navigate" ? await c.match("index.html") : await c.match(q, { ignoreSearch: true });
    if (bulunan) return bulunan;
    try { return await fetch(q); } catch (h) { return new Response("Çevrimdışı ve önbellekte yok.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }); }
  })());
});
