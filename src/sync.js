// Entry point: pull the Letterboxd diary feed and upsert films into Notion.
import { fetchDiary, aggregateByFilm } from './letterboxd.js';
import { loadPages, buildIndex, upsertFilm } from './notion.js';

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

  console.log(`Done. Created ${created}, updated ${updated}, failed ${failed}.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
