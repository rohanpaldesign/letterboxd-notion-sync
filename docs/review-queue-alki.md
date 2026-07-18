# Review queue (Alki OS `/watching/update`)

When the sync is [uncertain](./matching-and-duplicate-safety.md) about a film, it writes nothing to
Notion and instead sends the film to a review queue hosted in **Alki OS** (a separate private app),
surfaced at **`/watching/update`**. You resolve each item by hand in Notion; it clears automatically on
the next run.

## Why a separate app

Alki OS already has the pieces: a database (Supabase/Prisma), token-authed API endpoints, and a gated
dashboard. Rather than build new infrastructure, the sync just POSTs to Alki, and Alki renders the list.

## The flow

```
sync.js collects uncertain films
        |
        v
POST https://alki-os.vercel.app/api/watching/ingest   (header: x-alki-token)
        |
        v
Alki upserts them into the WatchingReview table
        |
        v
/watching/update  lists open items -> you fix Notion -> Dismiss
        |
        v
next sync no longer flags them -> Alki auto-closes them
```

## Pieces built in Alki OS

- **`WatchingReview` Prisma model** - one row per uncertain film, keyed by `lbUrl` (unique). Fields:
  `lbTitle`, `lbYear`, `lbRating`, `watchedDate`, `source` (diary/watchlist), `reason`, `candidates`
  (JSON list of likely Notion matches), `status` (open/resolved), timestamps.
- **`/api/watching/migrate`** - one-time, idempotent raw `CREATE TABLE` (plus indexes and RLS enable),
  because `prisma db push` can't be run against the DB from here. Token-authed.
- **`/api/watching/ingest`** - receives `{ reviews: [...] }`, upserts each by `lbUrl` (keeping `status`
  so a dismissed item stays dismissed), then **auto-resolves** any previously-open item that is no
  longer in the incoming set (i.e. you fixed it in Notion). Token-authed.
- **`/watching/update` page** - lists open items: the Letterboxd film (+ link), why it's uncertain, the
  likely Notion candidate(s), and a **Dismiss** button. Empty state: "All caught up."
- **Home dashboard card** - shows the count of open items with a link to the page.

## Authentication (names only - no values here)

- Alki's authed endpoints normally use the shared **`ALKI_INGEST_TOKEN`**. Because that token is stored
  as a Vercel *sensitive* variable (unreadable), and is also used by other Alki integrations (including
  a Claude Code routine), we did **not** reuse or rotate it.
- Instead the two `watching` endpoints accept a **dedicated `ALKI_WATCHING_TOKEN`** (falling back to
  `ALKI_INGEST_TOKEN` if unset). A fresh token was generated for the Letterboxd sync only, isolating it
  from everything else.

The values are stored as: `ALKI_WATCHING_TOKEN` in Alki's Vercel env, and `ALKI_INGEST_TOKEN` +
`ALKI_INGEST_URL` as GitHub Actions secrets in this repo. The sync presents its token via the
`x-alki-token` header. See [setup-and-secrets.md](./setup-and-secrets.md).

## If Alki isn't reachable

If `ALKI_INGEST_URL` / `ALKI_INGEST_TOKEN` are not set, the sync still runs fine and simply **logs** the
uncertain items to the workflow output instead of posting them. The review queue is an add-on, not a
dependency.
