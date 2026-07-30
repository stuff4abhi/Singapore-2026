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
- **Itinerary** — day-by-day timeline with time, activity, location (tap-to-maps), notes
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
- Optimized single-file design (no build step, no dependencies)
- Fast on mobile networks

### Key fixes applied (in order)

- Resolved Eat & Drink header-as-data bug — gviz sometimes fails to detect headers; added safety net to promote real header row if needed
- Added restaurant map links — address field combines name + address + Singapore for strongest Maps match

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
- **Rendering:** `renderFiles()` in `index.html` groups rows by Category, shows a 📌 badge for `Essential = Yes` rows, and always renders a plain "Open in Drive" link that works with zero JS dependency.
- **Offline access: use the Google Drive app's own "Available offline," not in-site caching.** Three in-browser attempts to cache Drive files for offline use were tried and retired — see "Retired: in-browser offline pinning" below for why. The hint text under the Files tab tells each family member to install the Drive app, sign in with the account this folder is shared with, open each 📌 Essential file once, then tap ⋮ → **Make available offline**. This works identically for images, PDFs, and spreadsheets, is properly authenticated (so restricted sharing is preserved), and isn't subject to browser cache-eviction quirks (Safari clears Cache Storage after ~7 days of no interaction; the Drive app's own offline files aren't affected).
- **Retired: in-browser offline pinning.** Do not re-attempt this without adding real OAuth first — three different serving mechanisms were tried (reading the response as a blob for a link, serving it via a service-worker proxy for a full navigation, serving it via a service-worker proxy for an `<img>` subresource) and all three failed, each in a different way, for the same root cause: the pinning fetch (`fetch(driveUrl, {mode:"no-cors", credentials:"include"})`) runs **unauthenticated** on iOS, because Safari's ITP blocks the cross-site Google auth cookie regardless of `credentials:"include"`. Since the target file is restricted (not "anyone with the link"), Drive's server almost certainly returned a login/permission HTML page instead of the actual file bytes — and because the fetch used `mode:"no-cors"`, the response is "opaque," so page script can never inspect what was actually cached to detect this. That's why each fix "worked" in isolation (fixed a real bug in *how* the cached response was served) while the underlying cached content was never the real file to begin with. The only way to get real, readable bytes from a restricted Drive file in a static site with no backend is a proper OAuth flow (Google Identity Services token model + Drive API v3, `drive.readonly` scope, Testing-mode consent screen with the family added as test users) — viable, but a real added scope (GCP project setup, ~150 lines, family clicks through an "unverified app" warning once) that hasn't been built. If revisited, do it that way, not by patching the no-cors approach further.
- **PWA foundation shipped:** minimal `manifest.json` + `sw.js` at repo root (app-shell caching + installability only — the retired offline-file proxy route has been removed). The full `css/`+`js/` module refactor described below under "Recommended for scaling" has **not** been done and remains future work if the project grows further.

## Upgrade plan (parked for later)

Two phases proposed, each incrementally adding capability while maintaining the static-site + free model:

### Phase 2 — "Around You Now" — contextual discovery
- Uses free OpenStreetMap Overpass API + Wikipedia GeoSearch (no keys, no cost)
- Finds your current/next itinerary location, surfaces nearby cafés, attractions, landmarks within a configurable radius
- Optional live GPS mode (with permission prompt) so it keys off actual position
- Caches results for offline use

### Phase 3 — Shared Trip Journal via Google Form
- Family writes notes, uploads photos via a native Google Form (mobile-friendly, Drive upload built-in)
- Form responses auto-append to a `Journal` sheet tab the site reads
- Site renders a warm, chronological feed of memories — author, note, timestamp, photo gallery
- You can moderate by editing/deleting rows; everything stays in your Sheet

### Foundation for these remaining phases: PWA + offline
- A **minimal** service worker + manifest already ship as part of the Files feature above (app-shell caching + installability only) — this section is about the fuller version needed for Phases 2/3
- Refactor single file into organized modules (config, cache, sheets, sections, etc.) — still not done
- Implement localStorage caching of Sheet data (all tabs, not just the app shell) so the site opens instantly and works fully offline
- Show "Updated 2 min ago / offline — showing saved copy" timestamp for Sheet data freshness (the Files section already has its own narrower offline messaging; this would extend the idea site-wide)
- Makes travel truly work — bad hotel wifi? App opens instantly and works anyway

---

## Architecture & structure

**Current (Phase 0 — what's live now):**
```
index.html (single file, ~950 lines)
├── inline CSS (design system)
├── inline JavaScript
└── inline HTML (markup shell)
```

**Recommended for scaling (if Phase 0 refactor is done):**
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
    ├── files.js        ← Phase 1
    ├── nearby.js       ← Phase 2
    ├── journal.js      ← Phase 3
    └── app.js          ← boot, nav, routing
```

---

## Current risks & mitigations

### Risk: Linking the Google Sheet directly in footer
**The problem:** If you link the Sheet publicly, *all tabs become visible* — not just the Journal. Visitors see:
- Flight PNRs, seat assignments
- Hotel confirmation numbers
- Full itinerary (dates, times, places)
- Booking refs for attractions
- Your Trip Config (family name, exact dates, party size)

Anyone could screenshot the entire plan and know exactly where you are, when, with what confirmations.

**Mitigation (recommended):** 
- Keep the Sheet **private** (shared only with core organizers via email)
- Link only the **Google Form** in the footer (➕ "Add a note or photo")
- Users contribute via the Form (the intended flow), not by browsing the Sheet
- Data stays secure; you moderate via the Sheet (which only you/organizers see)

---

## What's ready to deploy

✅ One HTML file with all features  
✅ Tested on mobile (390px) and desktop  
✅ Data lives in your Google Sheet (you control it, no backend)  
✅ Live refresh (family edits Sheet → site updates on next open)  
✅ Graceful fallbacks (no spinners, no broken states)  
✅ One shareable link gets everyone on the same page  

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
