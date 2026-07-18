// Fetches and parses a Letterboxd member's public RSS diary feed.
// The RSS feed carries only the ~50 most recent diary entries (no auth needed).
import Parser from 'rss-parser';

export { normalizeTitle } from './match.js';

const parser = new Parser({
  customFields: {
    item: [
      ['letterboxd:filmTitle', 'filmTitle'],
      ['letterboxd:filmYear', 'filmYear'],
      ['letterboxd:memberRating', 'memberRating'],
      ['letterboxd:watchedDate', 'watchedDate'],
      ['letterboxd:rewatch', 'rewatch'],
      ['tmdb:movieId', 'tmdbId'],
    ],
  },
});

// A Letterboxd film slug uniquely identifies a film; the diary entry <link> looks like
// https://letterboxd.com/<user>/film/<slug>/<optional-date>/ so we pull <slug> out.
function slugFromLink(link) {
  if (!link) return null;
  const m = link.match(/\/film\/([^/]+)\//);
  return m ? m[1] : null;
}

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<img[^>]*>/gi, '') // drop the poster image
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// Returns raw diary entries (one per Letterboxd log; rewatches produce several).
export async function fetchDiary(username) {
  const url = `https://letterboxd.com/${encodeURIComponent(username)}/rss/`;
  const feed = await parser.parseURL(url);
  const entries = [];
  for (const item of feed.items) {
    if (!item.filmTitle) continue; // skip non-film items (e.g. list publications)
    const slug = slugFromLink(item.link);
    if (!slug) continue;
    const year = item.filmYear ? parseInt(item.filmYear, 10) : null;
    const rating =
      item.memberRating != null && item.memberRating !== ''
        ? parseFloat(item.memberRating)
        : null;
    entries.push({
      slug,
      filmUrl: `https://letterboxd.com/film/${slug}/`,
      title: item.filmTitle,
      year: Number.isFinite(year) ? year : null,
      rating: Number.isFinite(rating) ? rating : null,
      watchedDate: item.watchedDate || null,
      rewatch: String(item.rewatch).toLowerCase() === 'yes',
      review: stripHtml(item['content:encoded'] || item.content || item.description || ''),
      pubDate: item.isoDate || item.pubDate || null,
    });
  }
  return entries;
}

// Collapse multiple diary entries for the same film into a single upsert record,
// keeping the most recent watched date / rating / review.
export function aggregateByFilm(entries) {
  const byFilm = new Map();
  for (const e of entries) {
    const cur = byFilm.get(e.slug);
    if (!cur) {
      byFilm.set(e.slug, { ...e });
      continue;
    }
    if ((e.watchedDate || '') > (cur.watchedDate || '')) {
      cur.watchedDate = e.watchedDate;
      if (e.rating != null) cur.rating = e.rating;
      if (e.review) cur.review = e.review;
    }
    if (cur.rating == null && e.rating != null) cur.rating = e.rating;
    if (!cur.review && e.review) cur.review = e.review;
  }
  return [...byFilm.values()];
}
