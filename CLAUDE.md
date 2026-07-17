# letterboxd-notion-sync — project context

One-way sync: **Letterboxd diary + ratings -> Notion** movie database. Runs free on a GitHub
Actions cron. No Letterboxd credentials are ever stored (uses the public RSS feed).

## Why one-way
Letterboxd has **no public write API**. The only free, reliable, zero-maintenance direction is
Letterboxd -> Notion via the public RSS diary feed (`letterboxd.com/<user>/rss/`, no auth/key).
Notion -> Letterboxd is intentionally **not** automated; Rohan reads the `LB Recommended` field and
enters ratings on Letterboxd manually.

## Key facts
- Letterboxd is **films-only** — TV/web series never appear in the feed.
- RSS carries only the ~50 most recent diary entries. Full-history backfill is manual.
- Notion's `Rating` is a formula (/10) from 5 weighted factor selects. Letterboxd has a single
  0.5–5 star. Mapping: `LB Recommended = round(Rating) / 2` (10 integer points <-> 10 half-stars).

## Notion database ("To Watch")
- Database id: `3601a6b9-4cec-4e5f-8571-8603dc40f74b`
- Data source: `collection://2e460482-cf58-4c97-a420-dc0ee258264e`
- Fields written by the sync: `Status` (-> Watched), `Last Watched`, `LB Rating` (raw LB star),
  `Year`, `LB URL`, `Public Review` (only if empty), and on create only `Name` + `Type`=Movie.
- Never touched: factor selects, `Rating`, `LB Recommended`, `Feels`, `Country`, `Private Notes`.

## Layout
- `src/letterboxd.js` — RSS fetch/parse + title normalization + per-film aggregation.
- `src/notion.js` — Notion client, row indexing, match (LB URL -> title+year -> title), upsert.
- `src/sync.js` — entry point.
- `.github/workflows/sync.yml` — daily cron + manual dispatch.

## Secrets (GitHub repo Settings -> Secrets and variables -> Actions)
- `NOTION_TOKEN` — internal integration token; the "To Watch" DB must be shared with it.
- `LETTERBOXD_USERNAME` — the Letterboxd handle whose RSS feed is read.
- `NOTION_DATABASE_ID` — optional; defaults in code.

## Manual step the API can't do
`LB Recommended` was created as a placeholder empty formula (the API rejects formulas that reference
another formula property). Set its expression in the Notion UI to:
`if(prop("Rating") > 0, format(round(prop("Rating")) / 2), "")`
