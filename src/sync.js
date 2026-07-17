// Entry point: pull the Letterboxd diary feed and upsert films into Notion.
import { fetchDiary, aggregateByFilm } from './letterboxd.js';
import { fetchWatchlist } from './watchlist.js';
import { loadPages, buildIndex, upsertFilm, upsertWatchlistFilm } from './notion.js';

async function main() {
  const username = process.env.LETTERBOXD_USERNAME;
  if (!username) throw new Error('LETTERBOXD_USERNAME is not set');
  if (!process.env.NOTION_TOKEN) throw new Error('NOTION_TOKEN is not set');

  console.log(`Fetching Letterboxd diary for @${username} ...`);
  const entries = await fetchDiary(username);
  const films = aggregateByFilm(entries);
  console.log(`Feed contained ${entries.length} entr(ies) across ${films.length} film(s).`);

  const pages = await loadPages();
  console.log(`Loaded ${pages.length} existing Notion row(s).`);
  const index = buildIndex(pages);

  let created = 0;
  let updated = 0;
  let failed = 0;
  for (const film of films) {
    const label = `${film.title}${film.year ? ` (${film.year})` : ''}`;
    try {
      const res = await upsertFilm(index, film);
      if (res.action === 'created') created++;
      else updated++;
      console.log(`  ${res.action}: ${label}`);
    } catch (err) {
      failed++;
      console.error(`  FAILED: ${label} -> ${JSON.stringify(err.body) || err.message}`);
    }
  }

  console.log(`Diary done. Created ${created}, updated ${updated}, failed ${failed}.`);

  // --- Watchlist pass (Letterboxd watchlist -> Notion) ---
  // Runs after the diary pass so a just-watched film is already Watched and can't be
  // re-created here. Reuses the same in-memory Notion index.
  console.log(`Fetching Letterboxd watchlist for @${username} ...`);
  const watchlist = await fetchWatchlist(username);
  console.log(`Watchlist contained ${watchlist.length} film(s).`);

  let wlCreated = 0;
  let wlBackfilled = 0;
  let wlSkipped = 0;
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
      } else {
        wlSkipped++;
      }
    } catch (err) {
      wlFailed++;
      console.error(`  FAILED (watchlist): ${label} -> ${JSON.stringify(err.body) || err.message}`);
    }
  }
  console.log(
    `Watchlist done. Created ${wlCreated}, backfilled ${wlBackfilled}, skipped ${wlSkipped}, failed ${wlFailed}.`,
  );

  if (failed > 0 || wlFailed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
