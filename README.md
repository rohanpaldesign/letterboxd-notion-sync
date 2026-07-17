# letterboxd-notion-sync

Automatically pull everything you log on **Letterboxd** into your **Notion** movie database — for
free, on a daily schedule, with no stored passwords.

It's **one-way** (Letterboxd → Notion) on purpose: Letterboxd has no public write API, so the only
free and reliable direction is *in*. Films you add in Notion first stay yours to log on Letterboxd
manually — the `LB Recommended` field tells you exactly which star to give.

## What syncs

For each film in your Letterboxd RSS diary feed, the job creates or updates a Notion row and sets:

| Notion field | From Letterboxd |
|---|---|
| `Status` | → `Watched` |
| `Last Watched` | diary watched date (most recent) |
| `LB Rating` | your Letterboxd star (0.5–5) |
| `Year` | film release year |
| `LB URL` | canonical film link (also the dedup key) |
| `Public Review` | your review text — **only if the Notion field is empty** (never clobbers your edits) |
| `Name`, `Type` | on **create** only (`Type` defaults to `Movie`) |

It never touches your factor ratings, `Rating`, `LB Recommended`, `Feels`, `Country`, or
`Private Notes`. Re-runs match on `LB URL` → normalized title+year → title, so rows are **updated,
never duplicated** (a Watchlist row you already had flips to Watched instead of doubling up).

Not covered by design: TV/web series (not on Letterboxd), your Letterboxd *watchlist* (the diary feed
only carries watched/rated films), and pushing anything back to Letterboxd.

## One-time setup

**1. Create a Notion integration**
- Go to https://www.notion.so/my-integrations → **New integration** (internal). Copy the token.
- Open the **To Watch** database in Notion → `•••` menu → **Connections** → add your integration.

**2. Finish the `LB Recommended` formula (30 seconds)**
The setup created `LB Recommended` as a blank placeholder (the Notion API can't write a formula that
references another formula). In Notion, edit the `LB Recommended` property → **Edit formula** → paste:
```
if(prop("Rating") > 0, format(round(prop("Rating")) / 2), "")
```
This converts your /10 score to a 0.5–5 star suggestion (7 → 3.5, 8 → 4, 9 → 4.5). Blank until you
fill in your factor ratings.

**3. Add GitHub Actions secrets**
Repo → **Settings → Secrets and variables → Actions → New repository secret**:
- `NOTION_TOKEN` — the integration token from step 1
- `LETTERBOXD_USERNAME` — your Letterboxd handle (from `letterboxd.com/<handle>`)

**4. Run it**
Repo → **Actions → Letterboxd → Notion sync → Run workflow**. After the first green run it also runs
itself daily. Nothing to install — the workflow handles dependencies.

## Manual history backfill

The RSS feed only carries your ~50 most recent entries, so it won't import your whole back-catalog.
For older films you've already rated in Notion, read the `LB Recommended` star and log each on
Letterboxd yourself (`letterboxd.com/film/<name>/` → set the rating). Going forward, new logs sync
automatically.

## Local run (optional)

```bash
npm install
cp .env.example .env   # fill in your values; .env is git-ignored
node src/sync.js
```

## How it works

`src/letterboxd.js` fetches and parses the RSS feed; `src/notion.js` indexes existing rows and
upserts; `src/sync.js` ties them together. See `CLAUDE.md` for internals.
