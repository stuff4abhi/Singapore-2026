# Phase 4 — Share to Instagram

Lets each family member push a journal entry to **their own** Instagram account from the trip
feed, and keeps the feed honest about what has and hasn't been mirrored over there.

**Status:** planned, not started
**Prerequisite:** Phase 3 (Shared Trip Journal) must ship first — there is no feed to post from yet.

---

## Design decisions (locked)

| Decision | Choice | Why |
|---|---|---|
| Publishing mechanism | **Assisted share** via Web Share API → the Instagram app | Keeps the zero-backend, zero-cost, zero-secrets model intact |
| Target account | **Each user's own personal account**, whichever is signed into their Instagram app | No shared trip account to create, no tokens, no 60-day expiry, no per-user OAuth |
| Who can post | Anyone using the site — the Instagram app itself is the auth gate | Nothing is posted without the user tapping through Instagram's own composer |
| Edit / delete sync | **Status flags + manual nudge**, not API calls | See "The hard constraint" below |

---

## The hard constraint

Instagram has no web-accessible publishing path. The Content Publishing API requires a
Business/Creator account, a Facebook Page link, and a **secret** long-lived access token —
which cannot live in `index.html` on a public GitHub Pages site without handing publish rights
to anyone who views source. Choosing personal accounts rules the API out entirely; it only ever
worked for Business/Creator.

Three things follow, and the whole design bends around them:

1. **"Single click" is realistically two or three taps.** One tap in our feed hands off to the OS
   share sheet; the user picks Instagram and taps through Instagram's own composer. We cannot
   post silently on their behalf, and shouldn't want to.
2. **Instagram drops the caption.** The share sheet carries the image; the `text` field is ignored
   by Instagram's share extension. Workaround: copy the caption to the clipboard in the same tap
   so the user pastes it into the composer. This is the standard approach and works on both platforms.
3. **We never learn what happened.** No callback, no post ID, no confirmation. Every "Instagram
   status" the site shows is something we recorded locally because the user told us, not something
   we observed. All copy must reflect that — "marked as posted," never "posted."

---

## Feature 1 — Post to Instagram

### Flow

```
[journal card] → tap "Share to Instagram"
     ↓
caption copied to clipboard + toast: "Caption copied — paste it in Instagram"
     ↓
OS share sheet opens with the photo attached
     ↓
user picks Instagram → Instagram composer opens → user pastes caption → posts
     ↓
back in the feed: "Did it post?" → [Yes, mark as posted] [Not yet]
     ↓
optional: "Paste the Instagram link" (enables the delete deep-link later)
```

### Which photo gets shared

Phase 3 photos arrive via Google Form upload and land in Google Drive. **Do not attempt to
`fetch()` those Drive files into a `File` object for `navigator.share()`.** That is the exact
pattern that failed three times during the Files work — Safari's ITP blocks the cross-site Google
auth cookie, so the fetch runs unauthenticated against a restricted file and returns a login page
as an opaque response the page can never inspect. See the "Retired: in-browser offline pinning"
section of `CLAUDE.md`.

Primary path instead: **the sharer picks the photo from their own camera roll.** The person
posting is almost always the person who took the photo, so it's already on their device. Our tap
copies the caption and opens the share sheet from the journal entry; if we can't attach the photo,
we open Instagram and let them select it. Zero Drive dependency.

Secondary path (nice-to-have, needs a spike): if the journal photo folder is set to
"anyone with the link" — defensible for holiday snaps, unlike passport scans — check whether the
`lh3.googleusercontent.com` thumbnail URL serves with permissive CORS headers. If it does, we can
fetch real bytes and attach the file properly. **Verify before building on it**; do not assume.

### Implementation notes

- Feature-detect with `navigator.canShare({ files: [...] })`, not `navigator.share` alone.
- iOS requires `navigator.share()` to be invoked directly inside the user gesture — an intervening
  `await` throws `NotAllowedError`. Fire the clipboard write without awaiting it, then call `share()`
  synchronously. If that proves flaky, fall back to an explicit two-button UI
  ("Copy caption" → "Open Instagram").
- Desktop has no Instagram app and patchy Web Share support: degrade to "Copy caption" plus
  "Open the photo" and a line explaining Instagram posting is mobile-only.
- Caption template, editable in `Trip Config`:
  `{note}\n\n📍 {location} · Day {n} of Singapore 2026\n#Singapore2026`

---

## Feature 2 — "Instagram: update pending" on edit

The site can't hook Sheet edits, so don't try to detect the edit event. Detect **drift** instead.

At mark-as-posted time, store a hash of the entry's shared content (note text + photo link).
On every render, re-hash the current row and compare:

| Condition | Badge |
|---|---|
| No posted record | *(none)* |
| Hash matches | `📷 On Instagram` (grey, quiet) |
| Hash differs | `📷 Instagram: update pending` (amber) |

The amber badge carries a `Re-share` action (same flow as Feature 1, re-copies the new caption)
and a `Mark as updated` action that re-hashes and clears the badge.

Amber is already the "up next / needs attention" colour in the existing status system, so this
inherits the visual language rather than adding a new one.

---

## Feature 3 — "Also delete on Instagram?" on delete

Deleting a row directly in the Sheet makes it vanish with no chance to prompt, so **deletion has to
be initiated from the site** to satisfy this requirement. The site's delete is a soft-delete: it
flags the row rather than removing it, and hidden rows can be cleaned up in the Sheet later.

```
[journal card] → Delete
     ↓
"Delete this entry?"
     ↓
if the entry is marked as posted, also:
"This was shared to your Instagram. Delete it there too?"
    [Open Instagram to delete] [Keep it on Instagram] [Cancel]
     ↓
"Open Instagram" → deep-links to the stored permalink if we have one,
                   otherwise to instagram://user?username= / the profile page
     ↓
entry soft-deleted in the feed either way
```

If no permalink was saved, we can only drop them at their profile — worth saying so in the copy
rather than implying we'll find the post for them.

---

## Data model

Phase 4 adds columns to the right of Phase 3's Form-owned columns. Google Forms appends rows and
leaves trailing columns intact, so this is safe.

`Journal` tab:

```
[ Form-owned:  Timestamp | Author | Note | Photo | Location ]
[ Phase 4:     IG Status | IG Posted At | IG Permalink | IG Content Hash | Deleted ]
```

- `IG Status` — `` (blank) | `posted` | `update-pending` | `removed`
- `IG Permalink` — optional, pasted by the user after posting
- `IG Content Hash` — snapshot hash from the last share
- `Deleted` — soft-delete flag, `TRUE` / blank

### Open decision: how status gets written back

The site currently reads the Sheet through gviz and has **no write path**. Three options:

1. **Google Apps Script Web App** *(recommended)* — a ~30-line script bound to the same Sheet,
   deployed as a web app, `POST`ed to from the page. No new service, no new account, no secrets in
   HTML, free. It is technically a backend, but a Google-native one living inside the Sheet you
   already own. This is the only option where the whole family sees consistent status.
2. **localStorage only** — zero setup, but status is per-device. Arguably coherent given each person
   posts to their own account ("did *I* post this?" is a personal question), and it degrades
   gracefully. Loses everything on a device change or cache clear.
3. **A second Google Form** for status updates — works, but clumsy UX.

**Assumption if unresolved:** build option 2 first (it needs no infrastructure and unblocks the
whole feature), structured behind a small `journalStore` interface so option 1 can replace it
without touching the UI.

---

## Build order

1. Ship Phase 3. Nothing here works without a feed.
2. `journalStore` abstraction — read status, write status, hash content. localStorage-backed.
3. Share button + clipboard caption + Web Share handoff + "did it post?" confirm.
4. Drift detection and the `update pending` badge.
5. Soft-delete with the Instagram prompt.
6. *(Optional)* Spike the `lh3.googleusercontent.com` CORS question; attach real photo files if it pans out.
7. *(Optional)* Swap `journalStore` to the Apps Script backend for shared status.

Steps 2–5 are the core and are self-contained.

---

## Risks

| Risk | Mitigation |
|---|---|
| Drive photo fetch fails exactly as offline-pinning did | Don't depend on it — camera-roll path is primary. Spike before committing. |
| Instagram's share extension changes behaviour | Fallback two-button UI (copy caption / open Instagram) has no dependency on share-sheet internals. |
| Users forget to confirm "yes I posted", so status drifts | Status is advisory. Nothing breaks; badge just stays blank. Don't over-engineer. |
| Someone deletes a row in the Sheet directly, skipping the prompt | Document it. Route family to the site's delete button in the Phase 3 hint text. |
| Clipboard write blocked (non-secure context, permissions) | Show the caption in a selectable text box as fallback. |

---

## Explicitly out of scope

- Instagram Graph API, Business/Creator accounts, access tokens, OAuth — all ruled out by the
  personal-account decision.
- Reading likes, comments, or any Instagram data back into the feed.
- Auto-posting. Every post is an explicit, per-entry, user-initiated action.
- Stories, Reels, carousels — single photo posts only.

### Upgrade path, if one-click ever becomes worth it

Phase 4b would be: one shared trip Business account + a Cloudflare Worker holding the token as a
secret with scheduled refresh. That buys genuine one-click posting *and* real delete support, at
the cost of a shared account identity, a free Cloudflare account, and token upkeep. The data model
above is deliberately compatible — `IG Permalink` would simply get populated by the API instead of
by hand.
