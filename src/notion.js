// Notion side of the sync: load existing rows, match, and upsert Letterboxd films.
import { Client } from '@notionhq/client';
import { normalizeTitle } from './letterboxd.js';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// The "To Watch" database id. Not secret (just an id); overridable via env.
const DATABASE_ID =
  process.env.NOTION_DATABASE_ID || '3601a6b9-4cec-4e5f-8571-8603dc40f74b';

const titleOf = (page) =>
  (page.properties?.Name?.title || []).map((t) => t.plain_text).join('');
const numberOf = (page, name) => page.properties?.[name]?.number ?? null;
const urlOf = (page, name) => page.properties?.[name]?.url ?? null;
const textOf = (page, name) =>
  (page.properties?.[name]?.rich_text || []).map((t) => t.plain_text).join('');
const dateOf = (page, name) => page.properties?.[name]?.date?.start ?? null;

const trimSlash = (u) => (u || '').replace(/\/+$/, '');

export async function loadPages() {
  const pages = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: DATABASE_ID,
      start_cursor: cursor,
      page_size: 100,
    });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return pages;
}

// Build lookup maps for matching: strongest (LB URL) -> title+year -> title-only.
export function buildIndex(pages) {
  const byUrl = new Map();
  const byTitleYear = new Map();
  const byTitle = new Map();
  for (const page of pages) {
    const url = urlOf(page, 'LB URL');
    if (url) byUrl.set(trimSlash(url), page);
    const nt = normalizeTitle(titleOf(page));
    if (!nt) continue;
    const year = numberOf(page, 'Year');
    if (year) byTitleYear.set(`${nt}|${year}`, page);
    if (!byTitle.has(nt)) byTitle.set(nt, page); // first wins; title-only is a fallback
  }
  return { byUrl, byTitleYear, byTitle };
}

export function findMatch(index, film) {
  if (index.byUrl.has(trimSlash(film.filmUrl))) {
    return index.byUrl.get(trimSlash(film.filmUrl));
  }
  const nt = normalizeTitle(film.title);
  if (film.year && index.byTitleYear.has(`${nt}|${film.year}`)) {
    return index.byTitleYear.get(`${nt}|${film.year}`);
  }
  if (index.byTitle.has(nt)) return index.byTitle.get(nt);
  return null;
}

// Properties written on every upsert. Deliberately never touches factor selects,
// Rating, LB Recommended, Feels, Country, Private Notes, or (on update) Type.
function buildProps(film, existing) {
  const props = {};
  props.Status = { select: { name: 'Watched' } };

  if (film.watchedDate) {
    const existingDate = existing ? dateOf(existing, 'Last Watched') : null;
    if (!existingDate || film.watchedDate > existingDate) {
      props['Last Watched'] = { date: { start: film.watchedDate } };
    }
  }
  if (film.rating != null) props['LB Rating'] = { number: film.rating };
  if (film.year) props.Year = { number: film.year };
  props['LB URL'] = { url: film.filmUrl };

  // Seed the public review only if we don't already have one, so we never clobber
  // a review Rohan wrote/edited in Notion.
  const existingReview = existing ? textOf(existing, 'Public Review') : '';
  if (film.review && !existingReview) {
    props['Public Review'] = {
      rich_text: [{ text: { content: film.review.slice(0, 1900) } }],
    };
  }
  return props;
}

export async function upsertFilm(index, film) {
  const existing = findMatch(index, film);
  if (existing) {
    await notion.pages.update({
      page_id: existing.id,
      properties: buildProps(film, existing),
    });
    return { action: 'updated' };
  }
  const props = buildProps(film, null);
  props.Name = { title: [{ text: { content: film.title } }] };
  props.Type = { select: { name: 'Movie' } }; // sensible default, create only
  await notion.pages.create({
    parent: { database_id: DATABASE_ID },
    properties: props,
  });
  return { action: 'created' };
}
