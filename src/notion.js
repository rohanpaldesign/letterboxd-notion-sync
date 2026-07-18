// Notion side of the sync: load existing rows and upsert Letterboxd films.
// Match classification (incl. uncertainty detection) lives in ./match.js (dependency-free).
import { Client } from '@notionhq/client';
import {
  buildIndex,
  classifyMatch,
  indexPage,
  numberOf,
  urlOf,
  textOf,
  dateOf,
} from './match.js';

export { buildIndex };

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// The "To Watch" database id. Not secret (just an id); overridable via env.
const DATABASE_ID =
  process.env.NOTION_DATABASE_ID || '3601a6b9-4cec-4e5f-8571-8603dc40f74b';

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

// Properties written on a diary upsert. Never touches factor selects, Rating, LB Recommended,
// Feels, Country, Private Notes, or (on update) Type.
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

  const existingReview = existing ? textOf(existing, 'Public Review') : '';
  if (film.review && !existingReview) {
    props['Public Review'] = {
      rich_text: [{ text: { content: film.review.slice(0, 1900) } }],
    };
  }
  return props;
}

// Diary upsert. Returns { action: 'updated' | 'created' | 'uncertain', reason?, candidates? }.
export async function upsertFilm(index, film) {
  const match = classifyMatch(index, film);
  if (match.kind === 'uncertain') {
    return { action: 'uncertain', reason: match.reason, candidates: match.candidates };
  }
  if (match.kind === 'confident') {
    await notion.pages.update({
      page_id: match.page.id,
      properties: buildProps(film, match.page),
    });
    return { action: 'updated' };
  }
  const props = buildProps(film, null);
  props.Name = { title: [{ text: { content: film.title } }] };
  props.Type = { select: { name: 'Movie' } }; // sensible default, create only
  const page = await notion.pages.create({
    parent: { database_id: DATABASE_ID },
    properties: props,
  });
  indexPage(index, page, film);
  return { action: 'created' };
}

// Watchlist upsert: create a Watchlist row only if the film clearly isn't already in Notion.
// Confident match -> only backfill LB URL / Year (never downgrades a Watched row, never rates).
// Uncertain -> write nothing, flag for review.
// Returns { action: 'created' | 'backfilled' | 'skipped' | 'uncertain', reason?, candidates? }.
export async function upsertWatchlistFilm(index, film) {
  const match = classifyMatch(index, film);
  if (match.kind === 'uncertain') {
    return { action: 'uncertain', reason: match.reason, candidates: match.candidates };
  }
  if (match.kind === 'confident') {
    const existing = match.page;
    const props = {};
    if (!urlOf(existing, 'LB URL')) props['LB URL'] = { url: film.filmUrl };
    if (film.year && numberOf(existing, 'Year') == null) props.Year = { number: film.year };
    if (Object.keys(props).length === 0) return { action: 'skipped' };
    await notion.pages.update({ page_id: existing.id, properties: props });
    return { action: 'backfilled' };
  }
  const props = {
    Name: { title: [{ text: { content: film.title } }] },
    Status: { select: { name: 'Watchlist' } },
    Type: { select: { name: 'Movie' } },
    'LB URL': { url: film.filmUrl },
  };
  if (film.year) props.Year = { number: film.year };
  const page = await notion.pages.create({
    parent: { database_id: DATABASE_ID },
    properties: props,
  });
  indexPage(index, page, film);
  return { action: 'created' };
}
