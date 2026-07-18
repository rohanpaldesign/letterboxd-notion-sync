# Architecture

## What this is

A free, low-maintenance sync that pulls everything you log on **Letterboxd** into your private
**Notion** movie database (the "To Watch" database), and flags anything it can't confidently match for
manual review in **Alki OS**.

## The core constraint: one-way only

**Letterboxd has no public write API.** Their API is invite-only and read-oriented. That single fact
shapes the whole design:

- **Letterboxd -> Notion** is fully automatable and reliable (public RSS feed + public watchlist page,
  no auth, no key). This is what we build.
- **Notion -> Letterboxd** would require writing to Letterboxd, which is only possible via CSV import
  (additive only, can't update/delete) or fragile headless browser automation. We deliberately do
  **not** do this. Instead, Notion stays the master and you enter ratings on Letterboxd yourself using
  the `LB Recommended` helper field.

Consequences worth remembering:

- **Letterboxd is films-only.** TV / web series never appear in the feed, so they never sync. Only
  Movie / Short Film / Documentary types are ever eligible.
- **Nothing is pushed back to Letterboxd.** Edits, ratings, and watchlist adds you make only in Notion
  stay in Notion.

## Data sources (both free, no auth)

| Source | URL | Carries |
|---|---|---|
| Diary RSS | `https://letterboxd.com/<user>/rss/` | The ~50 most recent watched/rated films: title, year, member rating, watched date, rewatch flag, review, film link. |
| Watchlist HTML | `https://letterboxd.com/<user>/watchlist/page/<N>/` | Your watchlist (scraped; there is **no** watchlist RSS - that endpoint returns 403). Each poster exposes `data-item-slug`, `data-item-link`, `data-item-name="Title (Year)"`. |

## Where it runs

- **GitHub Actions cron** in this repo (`.github/workflows/sync.yml`), free. Runs daily at **12:00 UTC
  (4 AM PST / 5 AM PDT)** and on demand via the **Run workflow** button.
- No servers, no database of its own, no stored Letterboxd credentials.

## End-to-end flow (one run)

```
GitHub Actions (daily / on demand)
        |
        v
  node src/sync.js
        |
        |-- fetch diary RSS  ------------------\
        |-- fetch watchlist HTML  -------------- src/letterboxd.js, src/watchlist.js
        |
        |-- load all Notion rows  ------------- src/notion.js (loadPages)
        |-- build match index  --------------- src/match.js (buildIndex)
        |
        |-- for each film: classifyMatch  ----- src/match.js
        |       confident -> update / create in Notion (src/notion.js)
        |       uncertain -> collect for review (write nothing)
        |       new       -> create in Notion
        |
        |-- POST uncertain items -------------- Alki OS /api/watching/ingest
                                                  -> shows on /watching/update
```

## Components

| File | Responsibility |
|---|---|
| `src/letterboxd.js` | Fetch + parse the diary RSS; aggregate multiple diary entries per film. |
| `src/watchlist.js` | Scrape the public watchlist pages across pagination. |
| `src/match.js` | Dependency-free core: title normalization, the row index, and confidence classification (`classifyMatch`). Unit-testable without the Notion client. |
| `src/notion.js` | Notion client, `loadPages`, and the upsert helpers (`upsertFilm`, `upsertWatchlistFilm`). |
| `src/sync.js` | Entry point: diary pass, watchlist pass, then upload uncertain items to Alki. |
| `.github/workflows/sync.yml` | The cron + manual trigger. |

## Why Notion is the master

Your Notion rating is a **/10 score computed from five weighted factors** (Acting, Story, Direction,
Music, Enjoyment). Letterboxd only has a single 0.5-5 star. That mapping is lossless in the
Notion->Letterboxd direction but impossible in reverse, so:

- The sync never overwrites your factor ratings or your computed `Rating`.
- It stores Letterboxd's own star in a separate `LB Rating` field (what you actually gave it there),
  so you can compare it against your Notion-derived `LB Recommended`.

See [notion-schema.md](./notion-schema.md) for the field-by-field detail.
