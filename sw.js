// App-shell caching only (index.html/manifest.json), so the site still opens
// with no signal. Everything cross-origin (Sheets gviz fetches, fonts, Drive
// file links) is left alone — an earlier version of this file also tried to
// proxy cached Drive files for offline viewing; that approach was retired
// (see Claude.md's Files section for why) in favor of the Drive app's own
// "Available offline" feature, which needs no help from this service worker.
const SHELL_CACHE = "sg2026-shell-v2";
const SHELL_ASSETS = ["./", "./index.html", "./manifest.json"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== SHELL_CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // never touch Sheets/Drive/fonts

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(SHELL_CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
