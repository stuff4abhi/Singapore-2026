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
   a tab called "Around you *now*" cannot. Read a fresh `new Date()` when resolving the anchor.

### Privacy

Coordinates are sent to three third parties (Overpass, Wikipedia, Nominatim) as query parameters.
**Round to 3 decimal places (~110 m) before sending anything.** That is far more precision than a
walking-radius search needs, and it raises the cache hit rate as a side effect. GPS is opt-in
behind an explicit tap and is never stored.

Nothing in this phase touches Google Drive. All three APIs are open and CORS-enabled, unlike the
restricted Drive files that defeated the retired offline-pinning work — see the
"Retired: in-browser offline pinning" section of `Claude.md`.

---

## Feature 1 — Anchor resolution

Where is "here"? Resolved in this order, with the user able to override at any time:

1. **GPS** — only after an explicit tap on **📍 Use my location**. Never auto-prompt on tab open.
2. **The itinerary item covering now**, else the nearest upcoming one. Source this from the
   existing `collectDatedItems()` (`index.html:954–980`), which already returns
   `{section, dt, endDt, title, time, loc, locKey}` per item, sorted. **Reuse it — do not write a
   second collector.**
3. **Manual picker** — a `<select>` of every distinct itinerary location, so the tab works
   pre-trip and for planning tomorrow from tonight's hotel.
4. **Nothing resolvable** → a `.state` block explaining why, with the GPS button offered.

### Text → coordinates, first hit wins

**1. `Lat`/`Lng` columns.** Columns on the Itinerary row matching `/^lat/i` and `/^(lng|lon)/i`.

**2. Plus Code.** A column matching `/plus.?code|olc/i`, or a Plus Code found anywhere inside the
location text via:

```js
/\b[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\b/i
```

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

One Overpass union query per (anchor, radius, category set). `POST` to
`https://overpass-api.de/api/interpreter`, falling back to `overpass.kumi.systems` then
`overpass.private.coffee` on timeout or 5xx.

```
[out:json][timeout:25];
(
  nwr(around:R,LAT,LON)[amenity~"^(restaurant|cafe|fast_food|bar|ice_cream)$"][name];
  nwr(around:R,LAT,LON)[tourism~"^(attraction|museum|artwork|viewpoint|gallery)$"][name];
  ...
);
out center tags 60;
```

`nwr` matches nodes, ways and relations in one clause; `out center` returns a centroid for the
non-node results, so a single query covers pin-drops, buildings and parks alike. `[name]` is
required on every clause — unnamed nodes are pure noise in a list like this.

### Categories

Chips, multi-select, **Eat + Sights** on by default:

| Chip | OSM filter |
|---|---|
| 🍜 Eat | `amenity=restaurant/fast_food/food_court`, `shop=bakery` |
| ☕ Coffee | `amenity=cafe`, `shop=coffee` |
| 🏛 Sights | `tourism=attraction/museum/artwork/viewpoint`, `historic=*` |
| 🛍 Shops | `shop=mall/department_store/supermarket` |
| 🚻 Practical | `amenity=toilets/atm/pharmacy/drinking_water`, `shop=convenience` |
| 🚇 Transit | `railway=station`, `station=subway`, `highway=bus_stop` |

Radius chips: **500 m / 1 km / 2 km**, default 1 km.

### Presentation

Sort by haversine distance. Show `320 m · 4 min walk` (80 m/min). Per result, reuse the existing
`.card` / `.card-top` / `.card-title` / `.rows` / `.note` classes (`index.html:310–332`) — **no new
card system**. The secondary line carries cuisine, `opening_hours` verbatim, and phone through the
existing `tel:` treatment.

Primary action is **Walk there ↗**:

```
https://www.google.com/maps/dir/?api=1&destination=<lat>,<lon>&travelmode=walking
```

Coordinates, not a name search — it cannot mismatch, unlike the name-based maps links elsewhere on
the site.

---

## Feature 3 — Stories nearby

A separate, collapsed block below the places list.

```
https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*
  &generator=geosearch&ggscoord=LAT|LON&ggsradius=1000&ggslimit=10
  &prop=extracts|pageimages&exintro=1&explaintext=1&exsentences=2
```

`origin=*` is required for CORS. Render title + two-sentence extract + link.

**Failure here is silent.** It's a bonus layer; it must never block or degrade the places list.

---

## Cache helper

~25 lines, generic, `localStorage`-backed:

```js
cacheGet(key)              // → value, or null if absent/expired
cacheSet(key, value, ttlMs)
```

- Envelope `{v, exp}`, keys namespaced `sg2026:`.
- On `QuotaExceededError`, evict the oldest `sg2026:` entries and retry once.
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
| `index.html:478–488` (`SECTIONS`) | Insert after `events`: `{ id:"nearby", label:"Nearby", icon:"🧿", group:"Explore", dated:"none", virtual:true }` |
| `index.html:1199` (`boot`) | `SECTIONS.filter(s=>!s.virtual).map(loadSection)`, then call `initNearby()` after the `Promise.all` resolves |
| `index.html:1075` (`buildOverview`) | `SECTIONS.filter(s=>s.id!=="overview" && !s.virtual)` — **without this, a "0 Nearby" count tile renders** in the Overview grid, since the section has no sheet rows |
| `index.html:954–980` (`collectDatedItems`) | No change — line 957 already skips `dated:"none"` |
| `index.html:921–924` (renderer dispatch) | No change — `loadSection` never runs for a virtual section |
| `index.html:1189–1197` (panel builder) | No change — the panel, `.sec-head`, `#count-nearby` and skeleton are all generated from `NAV` |
| `sw.js` | **No change.** Line 27 deliberately bails on cross-origin requests; Overpass/Wikipedia/Nominatim stay out of Cache Storage and `localStorage` handles offline |

Populate `#count-nearby` with the result count — the `.sec-head` count span already exists.

New CSS covers the anchor bar, chip row and result meta only. Use the existing custom properties
(`index.html:20–50`) — **no new colours**. Chips inherit the `nav button` treatment
(`index.html:190–215`).

---

## Build order

1. `cacheGet` / `cacheSet` helper.
2. `SECTIONS` entry + the three one-line integration edits → empty tab renders, nav correct.
3. Coordinate resolution: `Lat`/`Lng` columns → Plus Code decoder → Nominatim, plus the anchor
   logic and location picker. The decoder is self-contained; verify it by hand against known
   Singapore pins before wiring anything else to it.
4. Overpass fetch, parse, haversine sort, card rendering, mirror fallback.
5. Category + radius chips wired into the cache key.
6. GPS opt-in button.
7. Wikipedia "Stories nearby" block.
8. *(Optional)* "Save nearby for offline" — pre-fetch around every itinerary location while on wifi.

**Steps 1–4 are the shippable core.**

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

Serve over `python3 -m http.server` — `file://` breaks `fetch` and trips the `TypeError` branch at
`index.html:930`.

1. **Nav** — Explore pill shows three sub-tabs (Eat & Drink, Event info, Nearby); row 1 still fits
   at 390 px. Overview shows **no** "0 Nearby" tile.
2. **Plus Code decoder** — decode a known full code and a short code (`8QJ8+5W Singapore`) and
   confirm both land within ~15 m of the real pin in Google Maps.
3. **Anchor** — with a future-dated itinerary, confirm the tab anchors to the nearest upcoming
   item; switch via the picker and confirm results change.
4. **GPS** — override geolocation to Singapore (1.2834, 103.8607) via DevTools → Sensors, tap
   **Use my location**, confirm the anchor switches and results are plausible.
5. **Offline** — load once, then DevTools → Network → Offline, reload the tab: cached results
   render with the "saved copy from …" banner rather than an error.
6. **Overpass failure** — block `overpass-api.de` in DevTools → Network request blocking; confirm
   the mirror is tried, then the stale cache, then a `.state.err` with a working retry.