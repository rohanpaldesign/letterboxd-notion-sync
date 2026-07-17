// Scrapes a Letterboxd member's public watchlist (there is no watchlist RSS feed).
// Each film poster on the HTML page exposes data-item-slug / data-item-link / data-item-name,
// so no auth or API key is needed. Pages are /watchlist/page/<N>/.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const MAX_PAGES = 50; // safety cap

// Pull each film poster's slug + name (e.g. "Tuner (2025)") from one page's HTML.
// Match the whole poster <div> opening tag first, then extract attributes from it in any
// order (Letterboxd emits data-item-name before data-item-slug).
function parseWatchlistPage(html) {
  const films = [];
  const tagRe = /<div\b[^>]*\bdata-item-slug="[^"]*"[^>]*>/g;
  let t;
  while ((t = tagRe.exec(html)) !== null) {
    const tag = t[0];
    const slug = (tag.match(/data-item-slug="([^"]+)"/) || [])[1];
    if (!slug) continue;
    const rawName = ((tag.match(/data-item-name="([^"]*)"/) || [])[1] || '')
      .replace(/&amp;/g, '&')
      .replace(/&#0?39;/g, "'")
      .replace(/&quot;/g, '"');
    const ym = rawName.match(/^(.*)\s+\((\d{4})\)\s*$/);
    const title = ym ? ym[1].trim() : rawName.trim();
    const year = ym ? parseInt(ym[2], 10) : null;
    films.push({
      slug,
      filmUrl: `https://letterboxd.com/film/${slug}/`,
      title,
      year: Number.isFinite(year) ? year : null,
    });
  }
  return films;
}

// Returns the full watchlist as deduped { slug, filmUrl, title, year } records.
export async function fetchWatchlist(username) {
  const byslug = new Map();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `https://letterboxd.com/${encodeURIComponent(username)}/watchlist/page/${page}/`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) {
      if (page === 1) throw new Error(`Watchlist fetch failed (${res.status}) for @${username}`);
      break; // ran past the last page
    }
    const html = await res.text();
    const films = parseWatchlistPage(html);
    if (films.length === 0) break; // no more films
    for (const f of films) if (!byslug.has(f.slug)) byslug.set(f.slug, f);
  }
  return [...byslug.values()];
}
