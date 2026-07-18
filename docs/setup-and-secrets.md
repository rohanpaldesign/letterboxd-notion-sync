# Setup & secrets

> Public repo: this file lists secret **names** and where they live, never their values.

## GitHub Actions secrets (this repo)

Set at **Settings -> Secrets and variables -> Actions**:

| Secret name | What it is | Required? |
|---|---|---|
| `NOTION_TOKEN` | Notion internal-integration token; the "To Watch" database is shared with it. | Yes |
| `LETTERBOXD_USERNAME` | Your Letterboxd handle (the `<user>` in `letterboxd.com/<user>`). | Yes |
| `NOTION_DATABASE_ID` | Optional override; defaults to the "To Watch" database id in `src/notion.js`. | No |
| `ALKI_INGEST_URL` | `https://alki-os.vercel.app/api/watching/ingest` (not a secret, just a URL). | Optional |
| `ALKI_INGEST_TOKEN` | The token the sync presents to Alki (value = the dedicated `ALKI_WATCHING_TOKEN`). | Optional |

If the two `ALKI_*` values are unset, the sync still runs and just logs uncertain items instead of
posting them.

## Alki OS environment (separate app)

Set in Alki's Vercel project env:

| Env name | What it is |
|---|---|
| `ALKI_WATCHING_TOKEN` | Dedicated token the `watching` endpoints accept. Its value matches this repo's `ALKI_INGEST_TOKEN` secret. |

For the full Alki token map, see `docs/SECRETS.md` in the `alki-os` repo. In short: `ALKI_INGEST_TOKEN`
is the shared inbound token (also used by a Claude Code routine as `ALKI_TOKEN`); it is Vercel-sensitive
and was intentionally left untouched, which is why the sync uses its own `ALKI_WATCHING_TOKEN`.

## One-time steps performed during setup

1. Added the six Notion fields (`LB Rating`, `LB Recommended`, `Year`, `LB URL`, `Public Review`,
   `Private Notes`) to the "To Watch" database.
2. Set the `LB Recommended` formula in the Notion UI (see [notion-schema.md](./notion-schema.md)).
3. Created the `WatchingReview` table in Alki via `POST /api/watching/migrate` (idempotent).
4. Added `ALKI_WATCHING_TOKEN` to Alki's Vercel env and the matching secrets here.
5. Renamed several Notion titles to Letterboxd-canonical form to reduce false "uncertain" flags.

## Changing the schedule

Edit the cron in `.github/workflows/sync.yml`:

```yaml
on:
  schedule:
    - cron: '0 12 * * *'   # 12:00 UTC = 4 AM PST / 5 AM PDT
```

GitHub cron is fixed UTC (no daylight-saving adjustment) and scheduled runs can be delayed 10-20+ min
under load. Use **Run workflow** for an immediate run.

## Runtime

- Node 22 on `ubuntu-latest`, `actions/checkout@v5` + `actions/setup-node@v5`.
- Dependencies: `@notionhq/client`, `rss-parser` (installed by the workflow; nothing installed locally).
