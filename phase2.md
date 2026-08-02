# Phase 2 — Around You Now

A **Nearby** tab that answers "what's worth walking to from where I am (or where I'm headed
next)?" — cafés, sights, toilets, MRT stops — plus a quiet layer of Wikipedia stories about the
ground you're standing on.

**Status:** planned, not started
**Prerequisite:** none. This phase is independent of Phases 3 and 4.

---

## Design decisions (locked)

| Decision | Choice | Why |
|---|---|---|
| Places data | **OpenStreetMap Overpass API** | Free, no key, no quota tier, worldwide coverage, CORS-enabled |
| Context layer | **Wikipedia GeoSearch** | Free, no key, gives a sense of place that a POI list can't |
| Coordinates | `Lat`/`Lng` columns → **Plus Code** → **Nominatim** geocoding, cached forever | The Sheet has no coordinates today; this gets them with zero family effort but leaves two manual overrides |
| Nav placement | **Sub-tab under the existing Explore group** | Row 1 stays at 5 pills; sits beside Eat & Drink and Event info where it belongs |
| Offline | **Small generic `localStorage` TTL helper**, used by Nearby only this phase | The site has no persistence layer at all today; build the minimum, shaped so Phase 3 can adopt it |
| File layout | **Stay single-file** | Deploy stays drag-and-drop; the `js/` refactor is a separate decision, not a prerequisite |

---

## The hard constraints

Five things shape the whole design. Read these before changing anything.

1. **No coordinates exist anywhere in the Sheet.** Itinerary locations are free text.
   `renderTimeline` (`index.html:868–908`) resolves a location column by regex
   (`lK = /location|venue|place|address/i`, line 874) and never normalises the value. Resolving
   text to a point is therefore a hard prerequisite of this phase, not an implementation detail.

2. **Nominatim's usage policy is the binding limit** — max 1 request/second, absolutely no bulk
   geocoding. What keeps us inside it is that we geocode ~15 itinerary rows *on demand* and cache
   each result permanently. **The cache is a compliance mechanism, not a performance optimisation.**
   Do not "simplify" it away, and never geocode the whole itinerary in a loop on page load.

3. **Public Overpass instances return 503 under load.** This is normal, not exceptional. Every code
   path must assume it: 25 s timeout, fall through to a mirror, serve the stale cache, show a retry
   button. Never a spinner that never resolves.

4. **`opening_hours` is not parseable in scope.** OSM's syntax (`Mo-Fr 08:00-22:00; PH off`) needs
   a ~100 KB library to evaluate correctly. Display the raw string verbatim. **Never compute or
   display "open now"** — a wrong "open" sends someone on a wasted walk in 32°C heat.

5. **`NOW` is frozen at page load** (`index.html:491`). The Overview dashboard can live with that;
   a tab called "Around you *now*" cannot. Read a fresh `new Date()` when resolving the anchor —
   and re-resolve it on every `activate("nearby")` and on `document.visibilitychange` when the page
   becomes visible again, not just once during boot. Otherwise a phone left open from breakfast
   through dinner keeps showing the morning's anchor.

### Privacy

Coordinates are sent to three third parties (Overpass, Wikipedia, Nominatim) as query parameters.
**Round to 3 decimal places (~110 m) before sending anything** — but only the copy that goes out as
an API query parameter (Overpass `around:`, Wikipedia `ggscoord`, Nominatim `q`). Keep full
precision in memory for haversine sorting and for the "Walk there" destination link, neither of
which leaves the device — rounding those too would land the primary action up to 110 m from the
actual café and make the `320 m · 4 min walk` label off by roughly a third of its own value. The
privacy goal (third parties see ~110 m, never more) and the cache-hit-rate benefit both hold either
way. GPS is opt-in behind an explicit tap and is never stored.

Nothing in this phase touches Google Drive. All three APIs are open and CORS-enabled, unlike the
restricted Drive files that defeated the retired offline-pinning work — see the
"Retired: in-browser offline pinning" section of `Claude.md`.

---

## Feature 1 — Anchor resolution

Where is "here"? Resolved in this order, with the user able to override at any time:

1. **GPS** — only after an explicit tap on **📍 Use my location**. Never auto-prompt on tab open.
2. **The itinerary item covering now, else the nearest upcoming one — with an explicit rule**,
   since `endDt` is only ever populated for `dated:"range"` sections and every itinerary row is
   `dated:"single"`, so there is no `endDt` to test "covering" against:
   - Take the most recent item with `dt <= now`; treat it as current if `now - dt <= 3h`.
   - Otherwise, the nearest item with `dt > now`.
   - Otherwise, **fall back to the hotel section** — hotels *do* have a real `endDt`, so "which
     stay covers today" is answerable, and "near my hotel" is the right default for an evening with
     nothing scheduled. ~4 lines, and it beats the empty state.

   Source items from the existing `collectDatedItems()` (`index.html:954–980`), which returns
   `{section, dt, endDt, title, time, loc, locKey}` per item, sorted — **plus one added field, `row`
   (the underlying sheet row)**, since coordinate resolution (below) needs to read `Lat`/`Lng`/Plus
   Code columns off the raw row, which the existing projection discards. **Reuse the collector, add
   the one field — do not write a second collector.**
3. **Manual picker** — a `<select>` of every distinct itinerary location, so the tab works
   pre-trip and for planning tomorrow from tonight's hotel.
4. **Nothing resolvable** → a `.state` block explaining why, with the GPS button offered.

### Text → coordinates, first hit wins

**1. `Lat`/`Lng` columns.** Columns on the Itinerary row matching `/^lat/i` and `/^(lng|lon)/i`.

**2. Plus Code.** A column matching `/plus.?code|olc/i`, or a Plus Code found anywhere inside the
location text via:

```js
/\b(?:[23456789CFGHJMPQRVWX]{2}){2,4}\+[23456789CFGHJMPQRVWX]{2,3}\b/i
```

OLC characters before the `+` always come in pairs — a bare `{4,8}` would also accept malformed
5- or 7-character prefixes that decode to a plausible-looking but wrong point. The decoder must
re-validate parity again before returning, for the same reason.

This is the practical override: a family member long-presses a pin in Google Maps and pastes
exactly what it hands them (`8QJ8+5W Singapore`) — no hunting through menus for decimal
coordinates.

**3. Nominatim.**

```
https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=sg&q=<venue>, Singapore
```

CORS-enabled, no key. The `countrycodes=sg` bias is the same instinct as `smartValue`'s
`", Singapore"` maps bias (`index.html:698–705`) — it's why the site finds the right Oceanarium.

Cache every resolved coordinate under `sg2026:geo:<normalised query>` with **no expiry**.
Serialise Nominatim requests ≥1 s apart; steps 1 and 2 are pure local computation and need no
throttle.

Nominatim's policy requires an identifying `User-Agent` **or** `Referer`. `fetch` cannot set
`User-Agent` — it's a forbidden header name — so compliance rests entirely on the browser sending
`Referer`, which requires a real origin. This is a second, non-obvious reason the site must not be
tested from `file://` (see Verification).

### Plus Code decoding — build it, don't fetch it

There is no decoder to import here (single-file, no build step) and no free API that decodes Plus
Codes — **Nominatim does not support them**. Write a ~40-line decode-only Open Location Code
function inline:

- Alphabet `23456789CFGHJMPQRVWX` (base 20). Character pairs alternate latitude/longitude at
  resolutions 20°, 1°, 1/20°, 1/400°, 1/8000°.
- Decode the **10-character prefix** and return the cell centre. **Ignore trailing
  grid-refinement characters** (the `FG` in `8QJ8+5WFG`): the 10-character cell is ~14 m, and we
  round to 3 dp (~110 m) before sending anything to an API anyway, so that precision is discarded
  downstream. The extra base-4×5 code path buys nothing.
- **Short codes need recovery.** `8QJ8+5W` has fewer than 8 characters before the `+`, so it is
  relative to somewhere. Implement the standard `recoverNearest` against a Singapore reference
  point (**1.3521, 103.8198**): snap the reference to the missing prefix's resolution, decode, then
  shift by ±one resolution unit if the result lands more than half a unit from the reference.
- **Do not hardcode a Singapore prefix string.** Singapore spans the 103°/104° longitude cell
  boundary, so a fixed prefix silently breaks for Changi and the east coast. `recoverNearest`
  handles the boundary; a hardcoded prefix does not.
- Strip any trailing locality (`8QJ8+5W Singapore`) before decoding.
- On any validation failure, **fall through to Nominatim** rather than returning a
  plausible-but-wrong point.

Decode-only. We never need to encode.

---

## Feature 2 — Nearby places

One Overpass request per (anchor, radius, category set), but **one clause set per selected
category, each with its own `out` limit** — not one union with a single `out 60`. Overpass applies
`out` server-side before anything is sorted, and it has no distance ordering, so a single shared cap
returns 60 arbitrary POIs (in central Singapore, restaurant/cafe/fast_food alone runs into the
hundreds at 1 km, thousands at 2 km) — an effectively random subset that only *looks* sorted once
haversine runs over it, and the café across the street is routinely missing. Per-category `out` is
also what makes the "per-category caps" mitigation in Risks actually true, instead of one category
crowding out the rest. `POST` to `https://overpass-api.de/api/interpreter`, falling back to
`overpass.kumi.systems` then `overpass.private.coffee`.

```
[out:json][timeout:25];
nwr(around:R,LAT,LON)[amenity~"^(restaurant|fast_food|food_court)$"][name]; out center tags 25;
nwr(around:R,LAT,LON)[shop=bakery][name];                                  out center tags 25;
nwr(around:R,LAT,LON)[amenity=cafe][name];                                 out center tags 25;
... one pair of lines per category in CATEGORIES ...
```

`nwr` matches nodes, ways and relations in one clause; `out center` returns a centroid for the
non-node results, so pin-drops, buildings and parks are all covered. `[name]` is required on every
clause — unnamed nodes are pure noise in a list like this. Still one HTTP request and one parse.
Cap the radius at 1 km by default; note in the UI that 2 km results are best-effort.

**Failure detection must not key on status code alone.** Overpass's most common failure is HTTP 200
with an error in the body — `{"elements": [], "remark": "runtime error: Query timed out..."}` — which
a status check treats as a valid empty result, caches for 24h, and shows "nothing nearby": silent,
sticky, wrong. Three parts:
- Treat a present `remark` containing `error` or `timed out` as a failure → try the next mirror,
  and **never cache it**.
- `fetch` has no timeout option; `[timeout:25]` only bounds Overpass's *server-side* work, not a
  hung socket — wrap the call in an `AbortController` + `setTimeout(25000)`.
- A CORS rejection or dropped connection surfaces as a `TypeError`, not a status — include it in the
  mirror-fallback trigger (the file already leans on this distinction at `:930`).

### Categories

Chips, multi-select, **Eat + Sights** on by default. Defined **once**, as a single `CATEGORIES`
object that generates both the chip row and the Overpass clauses — a hand-written example query and
a separately hand-written chip table drift apart the moment either changes:

| Chip | OSM filter |
|---|---|
| 🍜 Eat | `amenity=restaurant/fast_food/food_court`, `shop=bakery` |
| ☕ Coffee | `amenity=cafe`, `shop=coffee` |
| 🏛 Sights | `tourism=attraction/museum/artwork/viewpoint`, `historic~"^(monument\|memorial\|ruins\|castle\|temple\|archaeological_site)$"` |
| 🛍 Shops | `shop=mall/department_store/supermarket` |
| 🚻 Practical | `amenity=toilets/atm/pharmacy/drinking_water`, `shop=convenience` |
| 🚇 Transit | `railway=station`, `station=subway`, `highway=bus_stop` |

`historic=*` unqualified pulls in every named plaque, memorial stone and boundary marker — noisy in
a heavily-tagged city, and the most expensive clause in the union — hence the narrower list above.

Radius chips: **500 m / 1 km / 2 km**, default 1 km.

**Accessibility.** Category chips are multi-select toggles → `aria-pressed`. Radius chips are
single-select → a `radiogroup` or a plain `<select>`, not another chip row with the same visual
pattern but different semantics. The results container updates without a page navigation →
`aria-live="polite"` on it. The file has almost no ARIA today (6 occurrences), so this is a net
improvement, and new interactive controls are the cheapest place to add it.

### Presentation

Sort by haversine distance, computed from the **full-precision** anchor (see Privacy — the rounded
copy only ever goes out over the network). Show `320 m · 4 min walk` (80 m/min). Per result, reuse
the existing `.card` / `.card-top` / `.card-title` / `.rows` / `.note` classes (`index.html:310–332`)
— **no new card system**. The secondary line carries cuisine, `opening_hours` verbatim, and phone
through the existing `tel:` treatment.

**Escaping.** OSM tags, Wikipedia titles and Nominatim display names are world-writable — every
existing renderer in this file routes untrusted text through `esc()` (`:549`, `:861–864`,
`:898–904`); this feature must too. Every OSM/Wikipedia/Nominatim string goes through `esc()` before
insertion; every coordinate or name interpolated into an `href` goes through
`encodeURIComponent`. `explaintext=1` (Feature 3) returns plain text, not safe HTML — it still needs
`esc()`.

Primary action is **Walk there ↗**, built from the full-precision (unrounded) anchor:

```
https://www.google.com/maps/dir/?api=1&destination=<lat>,<lon>&travelmode=walking
```

Coordinates, not a name search — it cannot mismatch, unlike the name-based maps links elsewhere on
the site. (This only holds because the destination coordinates are never rounded — see Privacy.)

---

## Feature 3 — Stories nearby

A separate, collapsed block below the places list.

```
https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*
  &generator=geosearch&ggscoord=LAT|LON&ggsradius=1000&ggslimit=10
  &prop=extracts|pageimages&exintro=1&explaintext=1&exsentences=2
  &exlimit=10&pilimit=10&piprop=thumbnail&pithumbsize=120
```

`prop=extracts` (TextExtracts) and `prop=pageimages` default to `exlimit=1`/`pilimit=1` — with
`ggslimit=10` and no override, nine of the ten results come back title-only and the block looks
broken. `&exlimit=10&pilimit=10` fix it; `&piprop=thumbnail&pithumbsize=120` is needed for a usable
image, since the default thumbnail is too small to render. `exsentences` is best-effort — it
degrades on pages with unusual intro markup — so truncate the extract client-side as a backstop.
`origin=*` is required for CORS. Render title + two-sentence extract + link, all through `esc()`.

**Failure here is silent.** It's a bonus layer; it must never block or degrade the places list.

---

## Cache helper

~30 lines, generic, `localStorage`-backed:

```js
cacheGet(key)              // → { value, stale: boolean } | null (null only if never cached)
cacheSet(key, value, ttlMs)
```

The return shape must distinguish "never cached" from "cached, expired, and exactly what the
offline fallback needs" — a bare `value | null` can't express that, since `null` collapses both
cases. Callers that only want fresh data check `.stale`; the offline path reads `.value` regardless
and shows the banner when `.stale` is true.

- Envelope `{v, exp, ts}` — `ts` is the insertion time, needed because eviction (below) has to sort
  by *something*, and `exp` alone can't do it. Keys namespaced `sg2026:`.
- On `QuotaExceededError`, evict the oldest `sg2026:` entries **by `ts` ascending**, retry once, and
  **hard-exclude the `sg2026:geo:` prefix from eviction** — geocodes never expire (no meaningful
  `exp` to sort by, so a naive `exp`-based eviction either throws on `undefined` or evicts them
  first) and they're the one cache that's a compliance mechanism, not a convenience (constraint 2).
  They're also tiny — two floats per itinerary row, ~15 rows — so excluding them costs nothing.
- Wrap **reads** as well as writes: `localStorage` can throw `SecurityError` (Safari with storage
  blocked, some embedded webviews), not just `QuotaExceededError`. Degrade to an in-memory `Map` for
  the session if either throws.
- TTLs: Overpass and Wikipedia results **24 h**; geocodes **never expire**.
- Cache key includes the rounded anchor + radius + sorted category set.
- **On a cache miss with no network, fall back to the *expired* entry** and show the offline
  banner. Stale results beat a dead tab — bad hotel wifi is exactly the scenario this tab is for.

Phase 3 and the parked site-wide Sheet cache (`Claude.md:128–133`) should adopt this helper rather
than adding a second one.

---

## Integration points

Exact, so implementation is mechanical.

| File / line | Change |
|---|---|
| `index.html:478–488` (`SECTIONS`) | Insert after `events`: `{ id:"nearby", label:"Nearby", icon:"📌", group:"Explore", dated:"none", virtual:true }` — `📌` rather than `🧿` (which reads as a nazar amulet, not a place marker); `📍` is already Event info and `🧭` is the Travel group |
| `index.html:1199` (`boot`) | `SECTIONS.filter(s=>!s.virtual).map(loadSection)`. **Do not** hang `initNearby()` off the `Promise.all` — see the `activate()` row below |
| `index.html:1075` (`buildOverview`) | `SECTIONS.filter(s=>s.id!=="overview" && !s.virtual)` — **without this, a "0 Nearby" count tile renders** in the Overview grid, since the section has no sheet rows |
| `index.html:954–980` (`collectDatedItems`) | **One-line change, not zero**: add `row: r` to the pushed object (`out.push({ section: sec, row: r, dt, endDt, title, time, loc, locKey })`) — coordinate resolution needs `Lat`/`Lng`/Plus Code columns off the raw row, which the existing projection discards. Line 957 already skips `dated:"none"`, unaffected |
| `index.html:921–924` (renderer dispatch) | No change — `loadSection` never runs for a virtual section |
| `index.html:1189–1197` (panel builder) | Build the static Nearby UI (anchor bar, chips, empty state) synchronously right here, replacing the skeleton immediately — don't leave the two `.skeleton` divs showing for a tab whose data never streams in on boot |
| `index.html:1118` (`activate()`) | **New integration point.** On `activate("nearby")`: re-resolve the anchor with a fresh `new Date()`, and fire the first Overpass/Wikipedia query only now — not on boot. Querying a donated community Overpass instance on every page load (most of which never open this tab) is exactly the load pattern constraint 3 is built around. Also re-resolve on `document.visibilitychange` (see hard constraint 5) |
| `sw.js` | **No change.** Line 27 deliberately bails on cross-origin requests; Overpass/Wikipedia/Nominatim stay out of Cache Storage and `localStorage` handles offline |

Populate `#count-nearby` with the result count — the `.sec-head` count span already exists.

New CSS covers the anchor bar, chip row and result meta only. Use the existing custom properties
(`index.html:20–50`) — **no new colours**. Chips inherit the `nav button` treatment
(`index.html:190–215`).

---

## Build order

1. `cacheGet` / `cacheSet` helper — decide the **full envelope now** (`{v, exp, ts}`, eviction that
   excludes `sg2026:geo:`, the `{value, stale}` read shape). Every later step persists against this
   shape, and Phase 3 is expected to adopt it, so getting it right here is cheaper than migrating it
   later.
2. `SECTIONS` entry + the integration edits → empty tab renders, nav correct, static Nearby UI
   (anchor bar, chips, empty state) visible with no skeleton.
3. **Hardcoded-anchor spike** — wire the Overpass request (per-category clauses, mirror fallback,
   `remark`-based failure detection) against a fixed anchor (`1.2834, 103.8607`) *before* the
   coordinate-resolution layer exists. The per-category-cap and failure-detection issues surface in
   the first ten minutes of real Overpass traffic and have nothing to do with Plus Codes — finding
   them here is far cheaper than finding them after the display layer is built on top of a committed
   geocoder.
4. Coordinate resolution: `Lat`/`Lng` columns → Plus Code decoder → Nominatim, plus the anchor
   logic and location picker. The decoder is self-contained; verify it by hand against known
   Singapore pins before wiring anything else to it. Swap the spike's hardcoded anchor for the
   resolved one.
5. Haversine sort (full-precision anchor), card rendering (with `esc()` on every OSM string),
   remaining mirror-fallback polish.
6. Category + radius chips wired into the cache key (driven by the single `CATEGORIES` object).
7. GPS opt-in button.
8. Wikipedia "Stories nearby" block.
9. *(Optional)* "Save nearby for offline" — pre-fetch around every itinerary location while on wifi.

**Steps 1–5 are the shippable core.**

---

## Risks

| Risk | Mitigation |
|---|---|
| Overpass 503 or slow | 25 s timeout, two mirrors, serve stale cache, retry button |
| Nominatim mismatches a venue | `Lat`/`Lng` or Plus Code override; display the matched name so a wrong hit is visible |
| Plus Code decoder subtly wrong | Decode-only, no encode; verify against known Singapore pins (Marina Bay Sands, Changi T3); invalid input falls through to Nominatim rather than returning a plausible-but-wrong point |
| Nominatim policy breach | On demand only, ≥1 s apart, permanent cache, never bulk-geocode on load |
| `localStorage` full | Evict oldest `sg2026:` keys, retry once, then degrade to session-only |
| GPS denied or inaccurate indoors | Never auto-prompt; the itinerary anchor is the default path, GPS is additive |
| Results feel like noise | `[name]` required, per-category caps, distance-sorted, two categories on by default |

---

## Explicitly out of scope

- **Open-now computation.** See hard constraint 4.
- **Ratings, reviews, photos.** OSM has none; Google Places costs money and needs a key.
- **Turn-by-turn routing** beyond the Google Maps hand-off.
- **Writing discoveries back into the Sheet.** The site has no write path (see `phase4.md`'s
  "how status gets written back").
- **Any API requiring a key, an account, or a backend.** The zero-cost static model holds.

---

## Verification

Serve over `python3 -m http.server` — `file://` breaks `fetch`, trips the `TypeError` branch at
`index.html:930`, and defeats the `Referer`-based Nominatim compliance check below. Have DevTools
Network + Console open throughout, and a known Google Maps pin (Marina Bay Sands, Changi T3) on
hand for cross-checks.

### Nav & layout regression

1. Explore pill shows **three** sub-tabs: Eat & Drink, Event info, Nearby; row 1 still fits at
   390 px.
2. Overview shows **no** "0 Nearby" count tile.
3. Opening Nearby renders the anchor bar, chips and empty state immediately — no lingering
   skeleton placeholders.

### Anchor resolution

1. **Current window** — set the clock so `now` is within 3h after an itinerary item's time:
   confirm that item is picked as "current," not the next upcoming one.
2. **Upcoming** — set the clock so nothing is within the 3h window: confirm the nearest future
   item is picked.
3. **Hotel fallback** — set the clock so nothing is current or upcoming (e.g. late night, day's
   items done): confirm it falls back to the active hotel stay, not the empty state.
4. **Manual picker** — confirm it lists every distinct itinerary location; selecting one refreshes
   results for that location.
5. **Nothing resolvable** — no itinerary rows in range and no active hotel: confirm a `.state`
   block explains why, with the GPS button offered, rather than a blank panel.
6. **Stale-anchor regression** — open the tab, advance the clock past a time boundary, switch away
   and back (`activate("nearby")`): confirm the anchor re-resolves rather than staying frozen from
   first load.
7. **Visibility change** — background the tab, change the clock, foreground it again: confirm
   `document.visibilitychange` triggers a re-resolve.

### Coordinate resolution

1. **Lat/Lng columns** — a test row with explicit `Lat`/`Lng`: confirm those are used directly and
   no Nominatim request fires.
2. **Plus Code, full** — decode a known full code (`8QJ8+5W Singapore` with locality) and a short
   code (bare `8QJ8+5W`): confirm both land within ~15 m of the real pin.
3. **Plus Code, malformed** — feed a 5- or 7-character prefix before the `+`: confirm it's
   rejected (falls through to Nominatim), not decoded into a plausible-but-wrong point.
4. **Nominatim fallback** — a venue name with no Lat/Lng/Plus Code: confirm exactly one request
   fires, biased with `countrycodes=sg`, and the matched name is displayed so a wrong hit is
   visible.
5. **Nominatim throttle** — trigger two geocode lookups back-to-back: confirm Network-tab timing
   shows requests actually ≥1 s apart, not just nominally serialised in code.
6. **Referer** — inspect the Nominatim request headers: confirm `Referer` is present (only works
   served over http(s), per finding 14).
7. **Geocode cache** — repeat the same lookup: confirm no second Nominatim request fires
   (`sg2026:geo:` cache hit).

### Overpass places

1. **Per-category caps** — enable only "Eat": confirm the count is bounded per-category (~25),
   not a shared 60-item pool one category can dominate.
2. **Sort correctness** — confirm the nearest known café/restaurant to the test anchor actually
   appears in the list (the bug per-category `out` fixes: an unsorted shared cap can omit the
   closest place entirely).
3. **Radius chips** — switch 500 m → 1 km → 2 km: results refire and change; UI notes 2 km as
   best-effort.
4. **Chip/category parity** — toggle every chip on/off: each maps to exactly the OSM filters in
   the Categories table, no more, no fewer.
5. **Escaping** — an OSM result with `<` or `<script>` in its name renders as literal text, never
   executed markup.
6. **Failure — timeout** — throttle past 25 s or block `overpass-api.de` via DevTools → Network
   request blocking: confirm mirror → stale cache → `.state.err` with a working retry, never an
   infinite spinner.
7. **Failure — remark-in-200** — stub a `{"elements":[],"remark":"...timed out"}` body with HTTP
   200: confirm it's treated as a failure (mirror tried, never cached), not silently rendered as
   "nothing nearby."
8. **CORS/TypeError path** — simulate a dropped connection: confirm it's routed into the same
   mirror-fallback trigger as timeouts.
9. **Walk-there precision** — tap the link and confirm the destination lands exactly on the venue,
   not up to 110 m off (i.e. it used the full-precision anchor, not the rounded one).

### Wikipedia stories

1. Confirm **more than one** of the 10 results shows an extract (regression check for the
   `exlimit=1`/`pilimit=1` default).
2. Confirm thumbnails render at a legible size.
3. Block the Wikipedia domain: the places list still renders fully — this layer fails silently
   with zero effect on Feature 2.
4. Confirm extract text is escaped — no raw HTML from `explaintext=1` executes.

### Cache & offline

1. **Offline** — load once, then DevTools → Network → Offline, reload the tab: cached results
   render with a "saved copy from …" banner rather than an error.
2. **Eviction** — force `QuotaExceededError`: confirm oldest non-geocode entries evict first
   (by `ts`) and a retry succeeds.
3. **Geocode survival** — confirm `sg2026:geo:` entries are never evicted even under quota
   pressure (re-query and confirm no new Nominatim call fires).
4. **SecurityError** — stub `localStorage` to throw (or use a restricted context): confirm the app
   degrades to an in-memory `Map` for the session rather than crashing.

### Accessibility

1. Category chips: `aria-pressed` toggles correctly via keyboard/screen reader.
2. Radius control: announced as single-choice (`radiogroup`/`<select>`), not independent toggles.
3. Results container: screen reader announces updates (`aria-live="polite"`) on chip/radius change.

### Privacy

1. Inspect the actual Overpass/Wikipedia/Nominatim request URLs: coordinates are rounded to 3
   decimal places there.
2. Confirm the displayed distance (`320 m · 4 min walk`) and the Walk-there link both use
   full, unrounded precision (cross-check against a known measurement).

### GPS

1. DevTools → Sensors → override location to `1.2834, 103.8607`, tap **Use my location**: anchor
   switches, results are plausible.
2. No GPS prompt appears automatically on tab open — only after the explicit tap.