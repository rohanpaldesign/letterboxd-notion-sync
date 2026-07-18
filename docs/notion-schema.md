# Notion schema

The sync targets the **"To Watch"** database (under Rohan's Dashboard -> Collection Box -> Watching).
The database id is set as the default in `src/notion.js` and can be overridden with the
`NOTION_DATABASE_ID` env var. (These ids are not secrets.)

## Pre-existing fields (unchanged, never written by the sync)

| Field | Type | Notes |
|---|---|---|
| `Name` | Title | Film title. |
| `Status` | Select | `Watchlist` / `Watched`. |
| `Type` | Select | `Movie` / `Web Series` / `Short Film` / `Documentary`. Only non-web-series sync. |
| `Rating` | Formula | Your /10 score, computed from the five factor selects below. |
| `Acting`, `Story`, `Direction`, `Music`, `Enjoyment` | Select | Star ratings (the factors). |
| `Feels`, `Country` | Multi-select | Genres / countries. |
| `Last Watched` | Date | When you last watched it. |

## Fields added for the sync

| Field | Type | Written by sync? | Purpose |
|---|---|---|---|
| `LB Rating` | Number | Yes (inbound) | The raw 0.5-5 star you actually gave the film **on Letterboxd**. Empty for Notion-first films. |
| `LB Recommended` | Formula | No (derived) | Your Notion /10 score converted to a 0.5-5 star suggestion. Read this to decide the star to enter on Letterboxd. |
| `Year` | Number | Yes (inbound) | Release year (comes free from the feed). Used for accurate matching. |
| `LB URL` | URL | Yes (inbound) | Canonical Letterboxd film link; also the strongest dedup key. |
| `Public Review` | Text | Yes (only if empty) | The review from Letterboxd; also where you write reviews meant to be public. The sync never overwrites an existing value. |
| `Private Notes` | Text | No | Notes that never leave Notion. |

## The rating mapping

Notion `/10` maps 1:1 onto Letterboxd's ten half-star levels: **`LB Recommended = round(Rating) / 2`**.

| Notion `Rating` | `LB Recommended` |
|---|---|
| 7 | 3.5 |
| 8 | 4.0 |
| 9 | 4.5 |
| 10 | 5.0 |

### The `LB Recommended` formula

Set in the Notion UI (the API cannot create a formula that references another formula property):

```
if(prop("Rating") > 0, format(round(prop("Rating")) / 2), "")
```

- Returns a string so the cell is **blank** until you've filled in your factor ratings.
- Prefer a numeric column you can sort by? Use `round(prop("Rating")) / 2` instead (it shows `0` for
  unrated rows rather than blank).

## `LB Rating` vs `LB Recommended`

- `LB Rating` = what Letterboxd says you gave it (pulled in by the sync).
- `LB Recommended` = what your careful Notion score suggests you should give it.

Having both lets you spot films where your Letterboxd quick-star drifted from your considered Notion
rating, so you can update the star on Letterboxd if you want.

## What the sync writes, per film

On a confident match it sets: `Status = Watched`, `Last Watched`, `LB Rating`, `Year`, `LB URL`, and
`Public Review` (only when empty). On a create it also sets `Name` and defaults `Type = Movie`. It
**never** touches `Rating`, the factor selects, `LB Recommended`, `Feels`, `Country`, or `Private
Notes`, and it never changes an existing `Type`.
