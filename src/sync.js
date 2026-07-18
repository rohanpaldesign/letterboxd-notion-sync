// Entry point: pull the Letterboxd diary + watchlist and upsert films into Notion.
// Films whose match is uncertain are NOT written; they are collected and sent to the Alki OS
// review queue (/watching/update) for manual handling.
import { fetchDiary, aggregateByFilm } from './letterboxd.js';
import { fetchWatchlist } from './watchlist.js';
import { loadPages, buildIndex, upsertFilm, upsertWatchlistFilm } from './notion.js';

// POST the uncertain items to Alki OS if configured; otherwise just log them.
async function postReviews(reviews) {
  const url = process.env.ALKI_INGEST_URL;
  const token = process.env.ALKI_INGEST_TOKEN;
  if (!url || !token) {
    console.log('ALKI_INGEST_URL/TOKEN not set - skipping review upload (logged above).');
    return;
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-alki-token': token },
      body: JSON.stringify({ reviews }),
    });
    const text = await res.text();
    console.log(`Alki review upload: HTTP ${res.status} ${text.slice(0, 200)}`);
    if (!res.ok) process.exitCode = 1;
  } catch (err) {
    console.error(`Alki review upload failed: ${err.message}`);
    process.exitCode = 1;
  }
}

async function main() {
  const username = process.env.LETTERBOXD_USERNAME;
  if (!username) throw new Error('LETTERBOXD_USERNAME is not set');
  if (!process.env.NOTION_TOKEN) throw new Error('NOTION_TOKEN is not set');

  const reviews = [];

  console.log(`Fetching Letterboxd diary for @${username} ...`);
  const entries = await fetchDiary(username);
  const films = aggregateByFilm(entries);
  console.log(`Feed contained ${entries.length} entr(ies) across ${films.length} film(s).`);

  const pages = await loadPages();
  console.log(`Loaded ${pages.length} existing Notion row(s).`);
  const index = buildIndex(pages);

  let created = 0;
  let updated = 0;
  let uncertain = 0;
  let failed = 0;
  for (const film of films) {
    const label = `${film.title}${film.year ? ` (${film.year})` : ''}`;
    try {
      const res = await upsertFilm(index, film);
      if (res.action === 'created') created++;
      else if (res.action === 'updated') updated++;
      else if (res.action === 'uncertain') {
        uncertain++;
        reviews.push(buildReview(film, 'diary', res));
        console.log(`  UNCERTAIN (diary): ${label} -> ${res.reason}`);
        continue;
      }
      console.log(`  ${res.action}: ${label}`);
    } catch (err) {
      failed++;
      console.error(`  FAILED: ${label} -> ${JSON.stringify(err.body) || err.message}`);
    }
  }

  console.log(`Diary done. Created ${created}, updated ${updated}, uncertain ${uncertain}, failed ${failed}.`);

  // --- Watchlist pass (Letterboxd watchlist -> Notion) ---
  // Runs after the diary pass so a just-watched film is already Watched and can't be
  // re-created here. Reuses the same in-memory Notion index.
  console.log(`Fetching Letterboxd watchlist for @${username} ...`);
  const watchlist = await fetchWatchlist(username);
  console.log(`Watchlist contained ${watchlist.length} film(s).`);

  let wlCreated = 0;
  let wlBackfilled = 0;
  let wlSkipped = 0;
  let wlUncertain = 0;
  let wlFailed = 0;
  for (const film of watchlist) {
    const label = `${film.title}${film.year ? ` (${film.year})` : ''}`;
    try {
      const res = await upsertWatchlistFilm(index, film);
      if (res.action === 'created') {
        wlCreated++;
        console.log(`  created (watchlist): ${label}`);
      } else if (res.action === 'backfilled') {
        wlBackfilled++;
      } else if (res.action === 'uncertain') {
        wlUncertain++;
        reviews.push(buildReview(film, 'watchlist', res));
        console.log(`  UNCERTAIN (watchlist): ${label} -> ${res.reason}`);
      } else {
        wlSkipped++;
      }
    } catch (err) {
      wlFailed++;
      console.error(`  FAILED (watchlist): ${label} -> ${JSON.stringify(err.body) || err.message}`);
    }
  }
  console.log(
    `Watchlist done. Created ${wlCreated}, backfilled ${wlBackfilled}, skipped ${wlSkipped}, uncertain ${wlUncertain}, failed ${wlFailed}.`,
  );

  // Always send the current uncertain set (even when empty, so Alki auto-closes resolved items).
  console.log(`Uploading ${reviews.length} review item(s) to Alki.`);
  await postReviews(reviews);

  if (failed > 0 || wlFailed > 0) process.exitCode = 1;
}

function buildReview(film, source, res) {
  return {
    lbUrl: film.filmUrl,
    lbTitle: film.title,
    lbYear: film.year ?? null,
    lbRating: film.rating ?? null,
    watchedDate: film.watchedDate ?? null,
    source,
    reason: res.reason,
    candidates: res.candidates || [],
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
