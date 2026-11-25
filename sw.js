/* LEXIKON 5.0 – SERVICE WORKER: eigener Cache-Präfix, löscht nur eigene Caches */
const PREFIX = "lexikon-hybrid-", CACHE = PREFIX + "v2";
const FILES = ["./", "index.html", "styles.css", "search.js", "terminal.js", "app.js", "icon.png"];
const CDN = ["cdnjs.cloudflare.com"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(FILES.map(f => c.add(f)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x.startsWith(PREFIX) && x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET") return;
  const cdn = CDN.includes(u.hostname);
  if (!cdn && u.origin !== location.origin) return;
  if (cdn) {            // Bibliotheken: Cache zuerst, beim ersten Online-Start gespeichert
    e.respondWith(caches.match(r).then(h => h || fetch(r).then(n => { const c = n.clone(); caches.open(CACHE).then(x => x.put(r, c)); return n; })));
  } else {              // eigene Dateien: Netz zuerst, bei Fehlen Cache
    e.respondWith(fetch(r).then(n => { const c = n.clone(); caches.open(CACHE).then(x => x.put(r, c)); return n; }).catch(() => caches.match(r).then(h => h || caches.match("index.html"))));
  }
});
