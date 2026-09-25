/* Service worker – cachuje jen statický shell appky (HTML/CSS/JS/ikony).
   Data z Google Sheets se NEcachují: offline se ukáže rozhraní a hláška,
   že se nedá synchronizovat.

   Když appku změníš, zvyš CACHE_VERSION – jinak si telefony můžou držet
   starou verzi. */

var CACHE_VERSION = "najem-v1";

var SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./config.js",
  "./sheets.js",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_VERSION) return caches.delete(k);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;

  // Cizí domény (Google API, GIS, fonty) nechme vždy na síti.
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  // Navigace: nejdřív síť (kvůli aktualizacím), offline ze cache.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(function () {
        return caches.match("./index.html");
      })
    );
    return;
  }

  // Ostatní shell soubory: cache, na pozadí se osvěží.
  event.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    })
  );
});
