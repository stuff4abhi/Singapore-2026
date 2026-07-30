// App-shell-only service worker: caches index.html/manifest.json so the site
// still opens with no signal. It deliberately ignores every cross-origin
// request (Google Sheets gviz fetches, fonts, Drive file links) — those are
// left to succeed or fail on their own. Offline pinning of individual Drive
// files is handled separately, page-side, via the Cache Storage API directly
// (see pinEssentialFiles() in index.html) because a service worker registered
// on this origin can never intercept navigations to drive.google.com anyway.
const SHELL_CACHE = "sg2026-shell-v1";
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
