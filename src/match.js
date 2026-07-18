// Pure matching logic (no external deps) so it can be unit-tested without the Notion client.
// Handles title normalization, the row index, and confidence classification.

// Aggressive title normalization for matching Notion rows against Letterboxd films.
// Strips accents/punctuation/articles so "Dune: Part Two" ~ "dune part two".
export function normalizeTitle(title) {
  return String(title || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics (U+0300..U+036F)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ') // punctuation -> space
    .replace(/\b(the|a|an)\b/g, ' ') // drop articles
    .replace(/\s+/g, ' ')
    .trim();
}

export const trimSlash = (u) => (u || '').replace(/\/+$/, '');

export const titleOf = (page) =>
  (page.properties?.Name?.title || []).map((t) => t.plain_text).join('');
export const numberOf = (page, name) => page.properties?.[name]?.number ?? null;
export const urlOf = (page, name) => page.properties?.[name]?.url ?? null;
export const textOf = (page, name) =>
  (page.properties?.[name]?.rich_text || []).map((t) => t.plain_text).join('');
export const dateOf = (page, name) => page.properties?.[name]?.date?.start ?? null;

// Build lookup structures: byUrl (strongest), byTitleYear, byTitle (first-wins), plus
// byTitleAll (every page per normalized title, to detect ambiguity) and a flat title list
// for fuzzy scanning.
export function buildIndex(pages) {
  const byUrl = new Map();
  const byTitleYear = new Map();
  const byTitle = new Map();
  const byTitleAll = new Map();
  const titles = [];
  for (const page of pages) {
    const url = urlOf(page, 'LB URL');
    if (url) byUrl.set(trimSlash(url), page);
    const nt = normalizeTitle(titleOf(page));
    if (!nt) continue;
    const year = numberOf(page, 'Year');
    if (year) byTitleYear.set(`${nt}|${year}`, page);
    if (!byTitle.has(nt)) byTitle.set(nt, page);
    if (!byTitleAll.has(nt)) byTitleAll.set(nt, []);
    byTitleAll.get(nt).push(page);
    titles.push({ nt, page });
  }
  return { byUrl, byTitleYear, byTitle, byTitleAll, titles };
}

// Insert a freshly-created page into the in-memory index so later films in the same run
// match it instead of creating a duplicate.
export function indexPage(index, page, film) {
  index.byUrl.set(trimSlash(film.filmUrl), page);
  const nt = normalizeTitle(film.title);
  if (!nt) return;
  if (film.year) index.byTitleYear.set(`${nt}|${film.year}`, page);
  if (!index.byTitle.has(nt)) index.byTitle.set(nt, page);
  if (!index.byTitleAll.has(nt)) index.byTitleAll.set(nt, []);
  index.byTitleAll.get(nt).push(page);
  index.titles.push({ nt, page });
}

const tokensOf = (nt) => (nt ? nt.split(' ').filter(Boolean) : []);

// Token Dice coefficient + containment (overlap over the smaller set) between two titles.
function titleScores(a, b) {
  const A = new Set(tokensOf(a));
  const B = new Set(tokensOf(b));
  if (!A.size || !B.size) return { dice: 0, contain: 0 };
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return {
    dice: (2 * inter) / (A.size + B.size),
    contain: inter / Math.min(A.size, B.size),
  };
}

const candidateOf = (page, score) => ({
  title: titleOf(page),
  url: page.url,
  year: numberOf(page, 'Year'),
  score: Math.round(score * 100) / 100,
});

// Classify a film against the index:
//   { kind: 'confident', page }               -> safe to write
//   { kind: 'uncertain', reason, candidates }  -> write nothing, flag for review
//   { kind: 'new' }                            -> safe to create
export function classifyMatch(index, film) {
  const key = trimSlash(film.filmUrl);
  if (index.byUrl.has(key)) return { kind: 'confident', page: index.byUrl.get(key) };

  const nt = normalizeTitle(film.title);
  if (film.year && index.byTitleYear.has(`${nt}|${film.year}`)) {
    return { kind: 'confident', page: index.byTitleYear.get(`${nt}|${film.year}`) };
  }

  // Exact normalized-title match(es).
  if (index.byTitleAll.has(nt)) {
    const pages = index.byTitleAll.get(nt);
    if (pages.length > 1) {
      return {
        kind: 'uncertain',
        reason: `Ambiguous: ${pages.length} Notion rows are named "${film.title}"`,
        candidates: pages.map((p) => candidateOf(p, 1)),
      };
    }
    const page = pages[0];
    const rowYear = numberOf(page, 'Year');
    if (film.year && rowYear && rowYear !== film.year) {
      return {
        kind: 'uncertain',
        reason: `Title matches "${titleOf(page)}" but years differ (Letterboxd ${film.year} vs Notion ${rowYear}) - possibly a different film`,
        candidates: [candidateOf(page, 1)],
      };
    }
    return { kind: 'confident', page };
  }

  // No exact title: fuzzy scan for a near-match that could be a differently-named duplicate.
  let best = null;
  for (const { nt: other, page } of index.titles) {
    if (other === nt) continue;
    const { dice, contain } = titleScores(nt, other);
    if (dice >= 0.5 || contain === 1) {
      if (!best || dice > best.dice) best = { page, dice };
    }
  }
  if (best) {
    return {
      kind: 'uncertain',
      reason: `No exact match; close to "${titleOf(best.page)}" - could be a duplicate under a different name`,
      candidates: [candidateOf(best.page, best.dice)],
    };
  }

  return { kind: 'new' };
}
