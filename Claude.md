# Singapore 2026 Trip Hub — Project Summary

## What was built

A fully functional, mobile-first **trip planning hub** for your Singapore 2026 family trip. Single static HTML file, live data from Google Sheets, zero backend/cost.

---

## Core features delivered

### Overview tab
- **Countdown** — auto-calculates days to go, current day number during trip, or "trip complete" after
- **What's next** — the single nearest upcoming thing across all sections (flight, hotel, itinerary, booking)
- **Today's plan** — only appears during the trip; lists that day's itinerary items by time
- **Quick counts** — tiles showing 2 Tickets · 1 Hotels · 3 Itinerary items, etc., each tappable to jump to that section

### Five data sections (all live from Google Sheet)
- **Tickets** — flights with PNR, seat, status
- **Hotels** — check-in/out, address, booking ref, phone tap-to-call
- **Itinerary** — day-by-day timeline with time, activity, location (tap-to-maps), notes. A **day selector** (calendar tiles, one per trip day, plus "All") shows one day at a time; see "Itinerary day selector" below
- **Bookings** — event name, date, confirmation number
- **Event Info** — venue, timings, description, tips

### Status system (auto-calculated)
- **Done** (grey) — dates in the past
- **Up Next** (amber) — the single nearest upcoming thing, highlighted with a glow
- **Later** (teal) — everything else ahead
- Applied to cards, timeline dots, and day badges

### Navigation & discoverability
- **Sticky tab bar** with smooth scrolling
- **Scroll affordances** — right-edge fade + animated chevron when tabs overflow, auto-hides at the end
- **Active tab auto-scrolls into view** — so if someone deep-links to "Event Info," it centers itself
- **Legend** always visible — "Done · Up next · Later"

### Trip Config (editable from Sheet)
- Reads `Trip Config` tab with rows: "Trip name," "Dates," "Party size"
- Updates hero heading, footer brand dynamically
- Family edits these cells on their phone; no code required

### Smart linking
- **Phone numbers** — tap-to-call
- **Addresses & venues** — tap-to-open Google Maps
- **Automatic Singapore bias** — venue searches get ", Singapore" appended so "Oceanarium" finds the right one, not a different country

### Design
- **Hero image** — real Merlion at night photo (Jayjayli, Unsplash License)
- **Color palette** — petrol ink + jade + warm porcelain; status colors (amber/jade/stone) are the *only* accents so "up next" pops
- **Peranakan tile motif** — pure CSS ornamental band under hero and above footer, uniquely Singapore
- **Typography** — Fraunces serif for headlines (botanical, intentional), Outfit sans for data (clean, readable)
- **Mobile-first** — tested at 390px width; scales gracefully to desktop

### Offline & performance
- Data loads from Google Sheets via gviz API; graceful fallback if sheet fails
- **Sheet data cached (stale-while-revalidate)** — each tab's parsed rows are cached in localStorage; sections render instantly from the last cached copy while a fresh fetch runs underneath, so revisits don't sit on skeletons waiting for Google. First-ever visit is unaffected (no cache yet)
- **Per-tab fetch dedup** — sections that read the same tab (Contacts/Others both read "Essentials") share one in-flight request instead of firing it twice
- **Hero video deferred + connection-aware** — the ~14MB clip ships with no `src` and only attaches one on `window.load`, so it never competes with Sheet fetches for bandwidth on first paint; skipped entirely on `navigator.connection.saveData`, 2G-class connections, or `prefers-reduced-motion` (poster frame stands in)
- Optimized single-file design (no build step, no dependencies)
- Fast on mobile networks

### Key fixes applied (in order)

- Resolved Eat & Drink header-as-data bug — gviz sometimes fails to detect headers; added safety net to promote real header row if needed
- Added restaurant map links — address field combines name + address + Singapore for strongest Maps match
- Performance pass — Sheet-tab caching + fetch dedup, deferred/connection-aware hero video load (see "Offline & performance" above)

### Data structure (Google Sheet)

- **Tabs:** Trip Config, Tickets/Flights, Hotels/Stays, Itinerary, Bookings/Activities, Event Info, Eat & Drink, Essentials, Files
- **Data flow:** gviz API → parsed into SECTION_DATA cache → rendered as cards/timeline/reference lists
- **Live editing:** family updates the Sheet; site refreshes on next page open to show changes

---

### What works now

✅ Mobile view (confirmed great)  
✅ Desktop view (unified hero, no split rendering)  
✅ Live Sheet data  
✅ Status auto-calculation  
✅ Smart linking (maps, phone, URLs)  
✅ Responsive nav with grouping  
✅ Bounded, proportional hero banner  
✅ Moving water background (nighttime skyline video)
---

## How to use right now

1. **Open the file:** `/mnt/user-data/outputs/index.html`
2. **Host it:** Drag into [Netlify Drop](https://app.netlify.com/drop) or push to GitHub Pages — get one live link in seconds
3. **Share the link** with your family
4. **They edit the Sheet** (Tickets, Hotels, Itinerary, Bookings, Trip Config tabs) from their phones
5. **Changes appear on the site** within seconds on next refresh

No backend, no code editing, no API keys. One Google Sheet + one HTML file = shared trip hub.

---

## Files feature (shipped)

Personal documents (passport/visa scans, tickets, hotel vouchers) used to be committed directly into this repo under `files/` — since this repo is served publicly via GitHub Pages, that leaked passport and visa scans to anyone with the site URL. Those files have been removed from the repo entirely and replaced with a **Files** tab in the Sheet:

- **Schema:** `Category | Name | Person | Drive Link | Essential | Notes` — files live in a Google Drive folder shared in **restricted** mode (requires an authorized Google account, not "anyone with the link"). This is a deliberate departure from the original "anyone with link" idea, chosen for privacy.
- **Rendering:** `renderFiles()` in `index.html` groups rows by Category and always renders a plain "Open in Drive" link that works with zero JS dependency.
- **Offline access: use the Google Drive app's own "Available offline," not in-site caching.** Three in-browser attempts to cache Drive files for offline use were tried and retired — see "Retired: in-browser offline pinning" below for why. The hint text under the Files tab tells each family member to install the Drive app, sign in with the account this folder is shared with, open each 📌 Essential file once, then tap ⋮ → **Make available offline**. This works identically for images, PDFs, and spreadsheets, is properly authenticated (so restricted sharing is preserved), and isn't subject to browser cache-eviction quirks (Safari clears Cache Storage after ~7 days of no interaction; the Drive app's own offline files aren't affected).
- **Retired: in-browser offline pinning.** Do not re-attempt this without adding real OAuth first — three different serving mechanisms were tried (reading the response as a blob for a link, serving it via a service-worker proxy for a full navigation, serving it via a service-worker proxy for an `<img>` subresource) and all three failed, each in a different way, for the same root cause: the pinning fetch (`fetch(driveUrl, {mode:"no-cors", credentials:"include"})`) runs **unauthenticated** on iOS, because Safari's ITP blocks the cross-site Google auth cookie regardless of `credentials:"include"`. Since the target file is restricted (not "anyone with the link"), Drive's server almost certainly returned a login/permission HTML page instead of the actual file bytes — and because the fetch used `mode:"no-cors"`, the response is "opaque," so page script can never inspect what was actually cached to detect this. That's why each fix "worked" in isolation (fixed a real bug in *how* the cached response was served) while the underlying cached content was never the real file to begin with. The only way to get real, readable bytes from a restricted Drive file in a static site with no backend is a proper OAuth flow (Google Identity Services token model + Drive API v3, `drive.readonly` scope, Testing-mode consent screen with the family added as test users) — viable, but a real added scope (GCP project setup, ~150 lines, family clicks through an "unverified app" warning once) that hasn't been built. If revisited, do it that way, not by patching the no-cors approach further.
- **PWA foundation shipped:** minimal `manifest.json` + `sw.js` at repo root (app-shell caching + installability only — the retired offline-file proxy route has been removed). The full `css/`+`js/` module refactor described below under "Recommended for scaling" has **not** been done and remains future work if the project grows further.

## Phase 2 — "Around You Now" (shipped)

✅ **Contextual discovery** — full implementation details in [`phase2.md`](phase2.md)
- **Nearby tab** (sub-tab under Explore) surfaces cafés, sights, practical amenities, transit, and shops within a 500m–2km radius
- **Anchor resolution:** auto-picks your current/next itinerary location (3-hour "covering now" window) or lets you pick manually; GPS override available
- **Coordinate resolution:** Lat/Lng columns → Plus Code (decode-only, with short-code recovery for `8QJ8+5W`-style codes) → Nominatim fallback, each cached permanently
- **Places from Overpass:** per-category result caps (25 each), haversine distance sorting, privacy-rounded coordinates (3 decimal places to APIs, full precision for maps/distance)
- **Bonus: Wikipedia stories** — collapsible "Stories nearby" block below the places list
- **Offline-ready:** `localStorage` cache with stale fallback, eviction that protects geocodes, mirror fallback (3 public Overpass instances)
- **Live-tested:** verified with real Overpass outages, plus-code cross-checked against Google's decoder, all features working at 390px and desktop

## Phase 3 — Shared Trip Journal (shipped)

✅ **Family-contributed notes and photos** — full implementation details in [`phase3_plan.md`](phase3_plan.md)
- A Google Form (name, note/memory, optional multi-photo upload) feeds a **dedicated Journal spreadsheet** (`JOURNAL_SHEET_ID`) — deliberately *not* a new tab on the main trip sheet (`SHEET_ID`). Two reasons: it scopes the Timestamp-format/timezone fix (Forms stamps in spreadsheet-local time; ISO format + `Asia/Singapore` timezone matter only for correct sort order) to a file with zero blast radius on Tickets/Hotels/Itinerary, and it keeps the one new link-viewable resource this phase introduces narrow — names/notes/photo links only, never PNRs or confirmation numbers.
- **New top-level "Journal" nav pill**, peer to Travel/Do/Explore/Essentials — user-generated content gets equal billing, not a buried sub-tab. Single-item group correctly renders no redundant row-2 subnav (`renderSubnav`'s existing `< 2` items guard, same path Overview already exercised).
- **Renderer** (`renderJournal`) shows entries newest-first with a thumbnail gallery. Drive file IDs are extracted by anchoring on `/file/d/` or `id=` in the URL — not by matching a bare token — because a stock phone filename can itself be a 25+ char token and would otherwise be picked up as a fake ID. Thumbnails use the undocumented `drive.google.com/thumbnail?id=` endpoint (not `uc?export=view`) because it transcodes, which is the only reason HEIC (iPhone) uploads render in an `<img>` at all; a broken/blocked thumbnail degrades via `onerror` to a plain "Open ↗" link rather than a broken-image glyph.
- **`gvizURL`/`fetchTabRaw` generalized** to accept a per-section `sheetId` (defaulting to `SHEET_ID`) — the only wiring change beyond the new `SECTIONS` entry, needed because the app now reads from two spreadsheets instead of one.
- Footer now links the Journal Form ("➕ Add a note or photo") instead of a bare "edit the sheet on your phone" instruction — see "Current risks & mitigations" below for why this is a UX choice, not a security control.
- **Explicit non-goals kept for v1:** no in-app add/edit/delete UI (moderate by editing the Journal sheet directly, like every other section — and remember deleting a row does *not* delete the Drive photo, that's a separate manual step); no offline photo caching (Drive `<img>` loads are plain cross-origin, `sw.js`'s cross-origin bailout is untouched); no lightbox/zoom (click-through to Drive's own viewer); no approval queue (submission is already gated by restricting who can access the Form).
- **Passcode gate on the Journal panel** (`journalUnlocked`/`renderJournalLock`/`wireJournalLock`): the rendered feed is hidden behind a passcode prompt; entering the right code sets a `localStorage` flag so it's remembered on future visits. The passcode itself is never stored in plaintext — `JOURNAL_PASSCODE_HASH` is `SHA-256(JOURNAL_PASSCODE_SALT + passcode)`, computed via the Web Crypto API. **Be precise about what this is:** it's a soft UI deterrent against casual browsing (randoms who land on the link, search crawlers, forwarded links without context), not real access control. There's no backend, so anyone who opens dev tools can read the salt+hash directly out of the page and, with enough motivation, brute-force a short human-shareable passcode offline (no rate-limiting is possible client-side). It does not gate the underlying data fetch — `loadSection("journal")` still fetches and caches the real rows in the background regardless of lock state, same as the Sheet/Drive URLs remain exactly as reachable as before; only the *rendering* is withheld. If real per-account security is ever wanted, the only genuine options are (a) a Google Apps Script Web App that checks the passcode server-side — the first real backend piece this project would ever have — or (b) full OAuth (see "Retired: in-browser offline pinning" above for why that's the only real fix for the analogous Files-restriction problem). To change the passcode: generate a new random salt, compute `SHA-256(salt + newPasscode)`, and replace both constants — the plaintext should never be committed to the repo or written to this file.

## Future phases (parked)

### Phase 4 — Share to Instagram — full plan in [`phase4.md`](phase4.md)
- Each family member shares a journal entry to **their own** Instagram via the OS share sheet (no API, no tokens, no shared account)
- Hard prerequisite (now met): Phase 3 has shipped, so there is a feed to post from
- Instagram has no web publishing path for personal accounts, so edit/delete "sync" is local status tracking plus a nudge, never real sync
- Do not fetch Drive photos into the share — that's the same pattern that failed in the retired offline-pinning work


### Foundation for Phases 3/4: PWA + offline + refactor
- A **minimal** service worker + manifest already ship as part of the Files feature (app-shell caching + installability only)
- Refactor single file into organized modules (config.js, cache.js, nearby.js, journal.js, etc.) — still not done, but Phase 2 proves it's structurally feasible
- ~~Implement localStorage caching of Sheet data (all tabs, not just the app shell)~~ — **done**: stale-while-revalidate cache per tab, see "Offline & performance" above. Still open: this caches for instant *render*, not full offline-first (no fallback UI yet if the very first load has no network and no cache)
- Show "Updated 2 min ago / offline — showing saved copy" timestamp for Sheet data freshness (Files and Nearby sections already have narrower offline messaging; this would extend site-wide)
- Makes travel truly work — bad hotel wifi? App opens instantly and works anyway

---

## Architecture & structure

**Current (Phase 0 + Phase 2 + Phase 3 — what's live now):**
```
index.html (single file, ~2200 lines)
├── inline CSS (design system + Nearby UI + day selector + Journal gallery)
├── inline JavaScript
│   ├── cache helper (localStorage + stale fallback)
│   ├── OLC Plus Code decoder (decode-only)
│   ├── Overpass/Wikipedia fetchers (mirror fallback, 3 instances)
│   ├── anchor resolution (itinerary/GPS/manual picker)
│   ├── haversine distance + card rendering
│   ├── itinerary day model + day selector
│   └── Journal renderer (Drive ID extraction, thumbnail gallery)
└── inline HTML (markup shell + Nearby panel)
```
Two spreadsheets now feed the site: `SHEET_ID` (main trip logistics) and
`JOURNAL_SHEET_ID` (Journal, its own dedicated sheet — see Phase 3 above for
why). `gvizURL`/`fetchTabRaw` take an optional `sheetId`, defaulting to
`SHEET_ID`, so every other section is unaffected.

### Itinerary day selector

The itinerary runs ~53 rows across 6 days, which was one long scroll on a
phone. It now shows **one day at a time**, chosen from a wrapping strip of
calendar tiles (weekday / date / month + a status dot), with an "All" tile to
get the full timeline back. The header count tracks what's on screen.

- **Default day** — `resolveDefaultDayKey()`: today if it's a trip day and
  anything on it is still upcoming; otherwise the nearest upcoming day
  (pre-trip → day 1, today-but-finished → tomorrow, post-trip → last day).
- **`buildItineraryDays()`** groups rows by `startOfDay(parsedDate).getTime()`,
  not the raw cell text, so two spellings of the same date can't split a day.
- **The constraint that matters:** `computeLinearStatuses` runs over the *full*
  row list, so "Up next" stays the one genuinely-next thing on the whole trip.
  Filtering happens on the grouped `days`, **never on `rows`** — filtering rows
  first would make "Up next" appear on the first item of whatever day is
  selected. Verified: summing the per-day views yields exactly one "Up next".
- Each item carries a `dt` alongside its `status`, because the default-day
  resolver has to compare against a *fresh* clock while `status` is baked
  against the page-load `NOW`. Reusing `status` there meant a phone left open
  overnight never advanced the day.
- Rows with an unparseable time (a bare `8:30` with no AM/PM) sort to the end of
  their own day for status purposes rather than to midnight, so they can't
  wrongly outrank a real morning item. Display order stays sheet order.
- Rows with nothing renderable (date only, no activity/location/note) are
  dropped — they used to draw a bare, textless timeline dot.
- **The strip wraps; it does not scroll.** A horizontal scroller was tried first
  and rejected: the last tile sat under the fade, and `scrollLeft` could not
  reliably bring it back (Chrome's `scrollWidth` over-reported the strip's
  overflow, so the computed centre was a position the strip would not honour).
  Wrapping means nothing is ever off-screen and deletes the whole problem.
  Tile sizing is tuned so all 6 days + "All" fit one row at 390px (~8px slack).
- Session-only state (`ITIN_STATE`), no localStorage or URL hash — a reload
  should re-resolve to today, not restore a day already travelled past.
  `userPicked` suppresses the `visibilitychange` auto-advance once the user has
  chosen a day manually, so the view is never yanked out from under them.

**Recommended for scaling (if Phase 3/4 is added and js/ refactor is done):**
```
singapore-2026/
├── index.html          ← markup shell only
├── manifest.json       ← installable app metadata
├── sw.js               ← service worker (offline + pinned files)
├── css/styles.css      ← design system
└── js/
    ├── config.js       ← SHEET_ID, tab names, ONE place to configure
    ├── cache.js        ← localStorage + freshness
    ├── sheet.js        ← gviz fetch/parse (cache-aware)
    ├── sections.js     ← renderers (tickets, hotels, etc.)
    ├── overview.js     ← countdown/up-next/today
    ├── files.js        ← Phase 1 (Files tab)
    ├── nearby.js       ← Phase 2 (Nearby tab) — extractable, but working inline now
    ├── journal.js      ← Phase 3 (future)
    └── app.js          ← boot, nav, routing
```

---

## Current risks & mitigations

### Risk: both Sheets are link-viewable — the deployed site URL is the actual secret
**The real posture, stated plainly (this replaces an earlier, incorrect framing):**
the gviz endpoint this site uses can only read a spreadsheet that is shared
"Anyone with the link — Viewer" (`index.html`'s `fetchTabRaw` raises exactly
that as its failure hint if it isn't). That means, right now, **two**
spreadsheet URLs are link-viewable, not zero:

- **`SHEET_ID`** (main trip sheet) — pre-existing, unaffected by Phase 3. It
  has PNRs, seat assignments, hotel and booking confirmation numbers, the full
  itinerary, and Trip Config. `SHEET_ID` is a plain constant in `index.html`'s
  page source, so anyone who views source on the public GitHub Pages site can
  reconstruct this URL in seconds and read every tab.
- **`JOURNAL_SHEET_ID`** (Journal, added in Phase 3) — narrower by design: only
  names, notes, and photo links, never PNRs/confirmations. Same page-source
  exposure, smaller blast radius.

**Not linking either Sheet in the footer never protected either of them** —
that only changes whether a casual visitor is *pointed at* the Sheet, not
whether the Sheet is reachable. Genuinely fixing this needs a different
architecture (a proxy, or real OAuth), not a footer edit — out of scope for
now, but real, and should not be mistaken for solved.

**What Phase 3's footer link actually is:** a **UX** choice — steer
contributors to the Journal Form (➕ "Add a note or photo") instead of asking
them to find and edit a raw Sheet tab, same as every other section is
moderated by editing the Sheet directly. It is not, and was never, a security
control.

---

## What's ready to deploy

✅ One HTML file with all features  
✅ Tested on mobile (390px) and desktop  
✅ Data lives in your Google Sheet (you control it, no backend)  
✅ Live refresh (family edits Sheet → site updates on next open)  
✅ Graceful fallbacks (no spinners, no broken states)  
✅ One shareable link gets everyone on the same page  
✅ **Phase 2: Nearby places** (cafés, sights, transit within walking distance)  
✅ **Phase 3: Shared Trip Journal** (Form-fed notes/photos, own dedicated sheet)  

---

## Next steps

**To go live immediately:**
1. Copy `/mnt/user-data/outputs/index.html`
2. Drag into [Netlify Drop](https://app.netlify.com/drop) → get a live URL in 10 seconds
3. Share the link with your family
4. They start editing the Google Sheet; you refresh the site to see changes

**To add features later (parked plan):**
- Choose which phase (Files / Around You / Journal) you want
- I'll build it with the same static, free, no-backend approach
- The full PWA refactor (Phase 0 foundation) should happen first if you want offline + fast performance

---

## File location

- **Live site:** `/mnt/user-data/outputs/index.html`
- **Google Sheet:** `https://docs.google.com/spreadsheets/d/14g3BlnqTN7z8lzcNlmtB9sPPDRKIY238NoLpiT8pels/`
- **This summary:** `/mnt/user-data/outputs/claude.md`

---

**Built with:** pure HTML/CSS/JavaScript, zero dependencies, free Google APIs, designed by Claude (AI).  
**License:** yours to keep, edit, deploy however you like.  
**Cost to host:** free (Netlify Drop) or ~$0/month (GitHub Pages).
