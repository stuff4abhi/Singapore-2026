// App-shell caching (index.html/manifest.json) so the site still opens with
// no signal, PLUS the /offline-file/ proxy route below, which is the only
// way pinned Drive files can actually be opened offline — see that route's
// comment for why. Everything else cross-origin (Sheets gviz fetches, fonts,
// the real drive.google.com requests) is left alone.
const SHELL_CACHE = "sg2026-shell-v1";
const SHELL_ASSETS = ["./", "./index.html", "./manifest.json"];

// Must match FILES_CACHE in index.html — both read/write the same Cache
// Storage bucket (pinning happens page-side; only serving happens here).
const FILES_CACHE = "sg2026-files-v1";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  const keep = [SHELL_CACHE, FILES_CACHE];
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // never touch Sheets/Drive/fonts

  // Same-origin proxy for pinned Drive files, e.g. "./offline-file/?src=<drive url>".
  // A cached opaque (no-cors) cross-origin response can never have its body
  // read by page script — that's what "opaque" means, a deliberate Fetch API
  // restriction, not a bug to work around client-side. The only way to
  // actually use it is to have the browser consume it directly as a real
  // navigation response, which IS allowed even though script can't inspect
  // it. So renderFiles() points the "Open saved copy" link at this
  // same-origin path instead of a blob: URL, and we answer it here straight
  // from the cache that pinEssentialFiles() (in index.html) already filled.
  if (url.pathname.endsWith("/offline-file/")) {
    const src = url.searchParams.get("src");
    e.respondWith(
      (src ? caches.open(FILES_CACHE).then(c => c.match(src)) : Promise.resolve(null))
        .then(hit => hit || new Response("Not saved for offline use yet — open it once while online first.", { status: 404 }))
    );
    return;
  }

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
