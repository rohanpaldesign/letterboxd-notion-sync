# Changelog - initial build (2026-07-17 / 18)

Everything was built and verified in one session. Listed in the order it happened.

## Iteration 1 - diary sync (Letterboxd -> Notion)

- Added six fields to the Notion "To Watch" database: `LB Rating`, `LB Recommended`, `Year`, `LB URL`,
  `Public Review`, `Private Notes`.
- `LB Recommended` formula (Notion /10 -> 0.5-5 star) set by hand in the Notion UI, because the API
  can't create a formula that references another formula property.
- Built `src/letterboxd.js` (RSS fetch/parse + per-film aggregation), `src/notion.js` (load + upsert),
  and `src/sync.js` (entry point).
- GitHub Actions cron + manual dispatch.

## Iteration 2 - watchlist sync

- Discovered the diary RSS carries only watched/rated films and there is no watchlist RSS (403), so the
  watchlist is scraped from the public HTML pages.
- Added `src/watchlist.js` (`fetchWatchlist`, paginated) and `upsertWatchlistFilm` (create-if-absent;
  never downgrades a `Watched` row; only backfills `LB URL` / `Year` on existing rows).
- Verified the scraper against a large public watchlist (601 films, all pages, titles + years parsed).

## Iteration 3 - duplicate-safety + Alki review queue

- Split the matching logic into `src/match.js` (dependency-free, unit-testable) and added
  `classifyMatch` returning `confident` / `uncertain` / `new`.
- Uncertain films (fuzzy near-title, year conflict, or ambiguous title) are no longer written; they are
  collected and POSTed to Alki OS.
- In the `alki-os` repo: added the `WatchingReview` Prisma model, `/api/watching/migrate`,
  `/api/watching/ingest`, the `/watching/update` page, and a home dashboard card. RLS enabled on the new
  table. Shipped via PRs, merged on green Vercel previews.
- Verified all six classification cases behave correctly.

## Maintenance bundled in

- Bumped `actions/checkout` and `actions/setup-node` to `@v5` and Node to 22 (fixed the Node 20
  deprecation warning).
- Moved the cron to `0 12 * * *` (4 AM PST).
- Renamed Notion titles to Letterboxd-canonical form (Dune: Part Two, Captain Phillips, F1, Grave of the
  Fireflies, What Dreams May Come, The Killing of a Sacred Deer, and the Diabel entry).

## Token wiring (the tricky bit)

- Alki's shared `ALKI_INGEST_TOKEN` is a Vercel *sensitive* variable (unreadable) and is used by other
  integrations, so it could not be reused or safely rotated.
- Added a dedicated `ALKI_WATCHING_TOKEN` to the two `watching` endpoints (falls back to
  `ALKI_INGEST_TOKEN`), generated a fresh value, and wired it into Alki's Vercel env + this repo's
  secrets.
- A Windows carriage-return (`\r`) had corrupted the token during setup, producing a `400 Bad Request`
  (a CR in an HTTP header is invalid). Cleaned it everywhere and redeployed.

## First live run (verified green)

```
Feed contained 2 entries across 2 films.
Diary done. Created 0, updated 2, uncertain 0, failed 0.
Watchlist contained 0 films.
Uploading 0 review item(s) to Alki.
Alki review upload: HTTP 200 {"ok":true,"received":0,"autoClosed":0,"open":0}
```

Two backfilled films matched existing Notion rows and updated them (no duplicates), and the Alki review
endpoint returned 200 - the full loop works end to end.
