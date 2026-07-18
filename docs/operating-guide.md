# Operating guide

How to use this day to day. The golden rule: **do the "doing" on Letterboxd, do the "rating" in Notion.**

## Watching a film

1. **Log it on Letterboxd** (with or without a quick star).
2. On the next sync it flows into Notion: the row is set to `Watched`, with `Last Watched`, `LB Rating`
   (your Letterboxd star), `Year`, and `LB URL` filled in. If the film was on your Notion watchlist, that
   same row flips to `Watched` - no duplicate.
3. **Rate it properly in Notion** by filling the five factor selects. Your `Rating` (/10) computes, and
   `LB Recommended` shows the 0.5-5 star it suggests.
4. If your considered `LB Recommended` differs from the quick `LB Rating` you gave on Letterboxd, update
   the star on Letterboxd if you care to. (Nothing pushes it there automatically.)

## To-watch films (watchlist)

**Add them on Letterboxd.** Your Letterboxd watchlist is scraped into Notion as `Watchlist` rows
automatically. When you later watch + log one, Letterboxd removes it from the watchlist and the sync
flips your Notion row to `Watched`.

| You do | Result |
|---|---|
| Add to Letterboxd watchlist | New `Watchlist` row appears in Notion |
| Watch + log it on Letterboxd | Same row flips to `Watched` |
| Add a to-watch item only in Notion | Stays Notion-only; it will NOT appear on Letterboxd |
| Remove from Letterboxd watchlist (unwatched) | Nothing changes in Notion; delete the row yourself if you want |

Only add a to-watch item directly in Notion if it's something private you don't want on your public
Letterboxd watchlist.

## Backfilling your existing library

Your older rated films exist in Notion but not on Letterboxd, and the RSS feed only carries ~50 recent
entries, so history is backfilled by hand:

1. Go down your `Watched` movies in Notion.
2. Read each one's `LB Recommended` star.
3. Log the film on Letterboxd with that star.
4. The next sync pulls it back and stamps `LB Rating` / `LB URL` / `Last Watched` onto the existing row.

Tip: run **Actions -> Run workflow** after a backfill session to sync immediately instead of waiting for
the daily run.

## Resolving flagged (uncertain) films

Open **`https://alki-os.vercel.app/watching/update`** (sign in to Alki first). For each item:

1. Read why it was flagged and which Notion row it might be.
2. Fix it in Notion - either merge it into the correct existing row (e.g. correct the title/year so it
   matches), or confirm it's genuinely a new film and add it.
3. Click **Dismiss** (or just leave it - it auto-clears once the sync matches it confidently).

The count of open items also shows on your Alki home dashboard.

## Running the sync manually

Repo -> **Actions** tab -> **Letterboxd -> Notion sync** -> **Run workflow**. Otherwise it runs daily at
12:00 UTC (4 AM PST).

## What never happens (by design)

- Nothing you do only in Notion is pushed to Letterboxd.
- TV / web series never sync (Letterboxd is films-only).
- The sync never edits your factor ratings, `Rating`, `LB Recommended`, or `Private Notes`.
- Deleting or editing something on Letterboxd after it synced does not un-sync it (Notion is master).
