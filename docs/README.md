# Documentation

Detailed docs for the Letterboxd <-> Notion sync and its Alki OS review queue.

> Security note: this is a **public** repo. These docs reference secret **names** only, never their
> values. Actual token values live in GitHub Actions secrets and Vercel environment variables.

## Index

1. [Architecture](./architecture.md) - what it is, the one-way design, data flow, components.
2. [Notion schema](./notion-schema.md) - the "To Watch" database fields, the rating mapping, and the
   `LB Recommended` formula.
3. [Matching & duplicate-safety](./matching-and-duplicate-safety.md) - how films are matched to Notion
   rows and how uncertain matches are flagged instead of duplicated.
4. [Review queue (Alki OS)](./review-queue-alki.md) - the `/watching/update` page, its API + data model,
   and how the sync talks to it.
5. [Operating guide](./operating-guide.md) - how to use it day to day (backfill, watchlist, ratings,
   resolving flagged items).
6. [Setup & secrets](./setup-and-secrets.md) - what is configured, the secret names, and how to change
   the schedule or rewire things.
7. [Changelog](./changelog.md) - everything built, in order.

## 30-second summary

- Films you log/rate on **Letterboxd** flow **into Notion** automatically (daily cron + on demand).
- Notion is the **master** for your detailed 5-factor rating; the `LB Recommended` field converts it to
  the 0.5-5 star to enter on Letterboxd.
- It is **one-way (Letterboxd -> Notion)** by design, because Letterboxd has no public write API.
- When the sync is **unsure** a film matches an existing Notion row, it writes nothing and flags it in
  **Alki OS at `/watching/update`** so you can resolve it by hand - no silent duplicates.
