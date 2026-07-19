# letterboxd-notion-sync

Automatically pull everything you log on **Letterboxd** into a **Notion** database — for free, on a
daily schedule, with no server and no stored passwords. Runs entirely on GitHub Actions.

It's **one-way** (Letterboxd → Notion) by design: Letterboxd has no public write API, so the only free
and reliable direction is *in*. You log and rate films on Letterboxd; they show up in Notion.

## Features

- **Diary → Notion** — every film you log on Letterboxd becomes a `Watched` row with your star rating,
  watched date, review, year, and a link.
- **Watchlist → Notion** — your public Letterboxd watchlist is mirrored as `Watchlist` rows.
- **No duplicates** — re-runs match on the film link → title+year → title, so rows are updated, never
  doubled. A watchlist row flips to Watched when you log the film.
- **Duplicate-safety** — when it *can't* confidently tell whether a film matches an existing row, it
  writes nothing and flags it for review instead of guessing (see [below](#optional-flag-uncertain-matches)).
- **Free & hands-off** — a daily GitHub Actions cron plus a manual "Run workflow" button. No server, no
  database of its own, no Letterboxd credentials stored anywhere.

Not covered by design: TV / web series (Letterboxd is films-only) and pushing anything back to
Letterboxd (no write API).

## Requirements

- A **Notion** database with the properties in [the table below](#notion-database).
- A **Letterboxd** account with a **public** profile.
- A **GitHub** account (to fork and run the Action).

## Notion database

The sync reads and writes properties **by name**, so your database needs these exact property names and
types (or edit the names in `src/notion.js`). Notion auto-creates missing *select options* (like
`Watched`, `Watchlist`, `Movie`) the first time they're written — you only need to create the
properties themselves.

### Required

| Property | Type | Notes |
|---|---|---|
| `Name` | Title | The film title (every Notion DB has a title property; name it `Name`). |
| `Status` | Select | The sync writes `Watched` or `Watchlist`. |
| `Type` | Select | Defaults to `Movie` on newly created rows. |
| `LB Rating` | Number | Your Letterboxd star (0.5–5). |
| `Year` | Number | Release year. |
| `LB URL` | URL | Canonical film link; also the dedup key. |
| `Public Review` | Text | Your review text (written only if the field is empty, so it never clobbers edits). |
| `Last Watched` | Date | Most recent watched date. |

### Optional — a personal rating workflow

If you rate films with your own scoring system in Notion, you can add a field that converts your score
to the 0.5–5 star to enter on Letterboxd:

| Property | Type | Notes |
|---|---|---|
| `Rating` | Formula/Number | Your own overall score on a 0–10 scale. |
| `LB Recommended` | Formula | `round(Rating) / 2` → the suggested Letterboxd star (7→3.5, 8→4, 9→4.5). |
| `Private Notes` | Text | Notes that never sync anywhere. |

The sync **never** touches `Rating`, `LB Recommended`, or `Private Notes` — they're yours.

## Fork & set up (~10 minutes)

**1. Fork this repo** (top-right **Fork** button).

**2. Create your Notion database** with the [Required properties](#required) above.

**3. Create a Notion integration and connect it**
- Go to https://www.notion.so/my-integrations → **New integration** (internal) → copy the token.
- Open your database in Notion → **•••** menu → **Connections** → add your integration.

**4. Add GitHub Actions secrets**
In your fork: **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `NOTION_TOKEN` | The integration token from step 3. |
| `LETTERBOXD_USERNAME` | Your Letterboxd handle (the `<name>` in `letterboxd.com/<name>`). |
| `NOTION_DATABASE_ID` | Your database's id — the 32-char id in its URL (`notion.so/<workspace>/<THIS_PART>?v=…`). |

**5. (Optional) add the `LB Recommended` formula**
If you added the optional rating fields, open the `LB Recommended` property → **Edit formula** → paste:
```
if(prop("Rating") > 0, format(round(prop("Rating")) / 2), "")
```

**6. Run it**
Your fork → **Actions** tab → enable workflows if prompted → **Letterboxd → Notion sync → Run
workflow**. After the first green run it also runs daily on its own. Nothing to install — the workflow
handles dependencies.

## Configuration

| Env / secret | Purpose | Required? |
|---|---|---|
| `NOTION_TOKEN` | Notion integration token (DB shared with it). | Yes |
| `LETTERBOXD_USERNAME` | Whose public Letterboxd feed to read. | Yes |
| `NOTION_DATABASE_ID` | Which Notion database to sync into. | Yes (for forks) |
| `ALKI_INGEST_URL` / `ALKI_INGEST_TOKEN` | Optional review-queue endpoint (see below). | No |

**Schedule:** edit the cron in `.github/workflows/sync.yml`:
```yaml
on:
  schedule:
    - cron: '0 12 * * *'   # daily 12:00 UTC — GitHub cron is fixed UTC, no DST
```
Scheduled runs can be delayed 10–20+ min under load; use **Run workflow** for an immediate run.

## What syncs

| Notion field | From Letterboxd |
|---|---|
| `Status` | → `Watched` (diary) / `Watchlist` (watchlist) |
| `Last Watched` | diary watched date (most recent) |
| `LB Rating` | your Letterboxd star (0.5–5) |
| `Year` | release year |
| `LB URL` | canonical film link (dedup key) |
| `Public Review` | review text — only if the Notion field is empty |
| `Name`, `Type` | on **create** only (`Type` defaults to `Movie`) |

## Optional: flag uncertain matches

When the sync isn't sure whether a Letterboxd film maps to an existing Notion row (a close-but-different
title, a title with a conflicting year, or an ambiguous title), it **writes nothing** and reports the
film so you can resolve it by hand — no risk of a wrong merge or duplicate.

By default these are just printed to the workflow log. If you run your own dashboard/endpoint, set
`ALKI_INGEST_URL` and `ALKI_INGEST_TOKEN` and the sync will `POST` them (header `x-alki-token`) as:

```json
{ "reviews": [
  { "lbUrl": "...", "lbTitle": "...", "lbYear": 2024, "lbRating": 4,
    "watchedDate": "2026-01-01", "source": "diary",
    "reason": "why it was uncertain",
    "candidates": [ { "title": "...", "url": "...", "year": 2017, "score": 0.5 } ] }
] }
```

Leave those unset and everything still works — uncertain films are simply logged.

## Manual history backfill

The Letterboxd RSS feed only carries your ~50 most recent entries, so it won't import your whole
back-catalog in one go. To seed older films, log/rate them on Letterboxd; the next sync pulls them in.

## Local run (optional)

```bash
npm install
cp .env.example .env   # fill in your values; .env is git-ignored
node src/sync.js
```

## How it works

`src/letterboxd.js` fetches and parses the RSS diary; `src/watchlist.js` scrapes the public watchlist;
`src/match.js` normalizes titles and classifies each film as confident / uncertain / new;
`src/notion.js` upserts rows; `src/sync.js` ties it together. Deeper docs live in [`docs/`](./docs/).

## Limitations

- **Films only** — TV / web series never sync (Letterboxd doesn't catalog them).
- **One-way** — nothing is pushed back to Letterboxd, and edits/deletes on Letterboxd after a sync
  don't propagate (Notion stays the source of truth).
- **RSS is recent-only** — ~50 latest diary entries per run; older history is manual.

## License

[MIT](./LICENSE) — fork it, change it, use it however you like.
