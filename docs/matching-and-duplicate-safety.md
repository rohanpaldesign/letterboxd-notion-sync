# Matching & duplicate-safety

The hardest part of an inbound sync is deciding whether a Letterboxd film is the *same* film as an
existing Notion row. Get it wrong and you either create a duplicate or overwrite the wrong row. All of
this logic lives in `src/match.js` (dependency-free, so it is unit-testable without the Notion client).

## Title normalization

Before comparing, titles are normalized (`normalizeTitle`): lowercased, accents stripped, `&` -> `and`,
punctuation -> spaces, leading articles (`the` / `a` / `an`) dropped, whitespace collapsed. So
`"Dune: Part Two"` -> `dune part two`, and `"The Killing of a Sacred Deer"` -> `killing of sacred deer`.

## The row index

`buildIndex` builds several lookups from all Notion rows:

- `byUrl` - by stored `LB URL` (strongest key).
- `byTitleYear` - by `normalized title + year`.
- `byTitle` / `byTitleAll` - by normalized title (all rows sharing a title, to detect ambiguity).
- `titles` - a flat list for fuzzy scanning.

Newly created rows are inserted back into the index mid-run so a later film in the same run can't create
a second copy.

## Confidence classification

`classifyMatch(index, film)` returns one of three verdicts:

### `confident` -> safe to write
- The film's `LB URL` already exists on a row, **or**
- normalized `title + year` matches a row, **or**
- a single row matches by title only with no conflicting year.

### `uncertain` -> write NOTHING, flag for review
- **Fuzzy near-match**: no exact match, but a row's title is close (token Dice coefficient >= 0.5, or
  one title's tokens are fully contained in the other). Example: Letterboxd `Blade Runner` vs Notion
  `Blade Runner 2049`.
- **Year conflict**: the title matches a row, but the years differ. Example: `Suspiria (1977)` vs
  `Suspiria (2018)`.
- **Ambiguous title**: more than one Notion row shares the film's title.

### `new` -> safe to create
- No exact match and nothing fuzzy is close enough.

## What "uncertain" does

Uncertain films are **not written to Notion at all**. Instead the sync collects them and sends them to
the Alki OS review queue (see [review-queue-alki.md](./review-queue-alki.md)). This is the guarantee:
**the sync never creates a duplicate or merges into the wrong row when it isn't sure.** You resolve
those by hand in Notion, and they clear from the queue on the next run.

## Worked examples (verified in testing)

| Letterboxd film | Existing Notion rows | Verdict | Why |
|---|---|---|---|
| Blade Runner (1982) | Blade Runner 2049 | uncertain | fuzzy / token containment |
| Interstellar (2014) | Interstellar (2014) | confident | title + year match |
| Interstellar (1999) | Interstellar (2014) | uncertain | year conflict |
| Mother (2017) | two rows named "Mother" | uncertain | ambiguous |
| Dune: Part Two (2024) | Dune | uncertain | close title |
| Totally New Film (2025) | (none close) | new | safe to create |

## Title fixes applied during setup

To reduce false "uncertain" flags on your existing library, several titles were renamed to Letterboxd's
canonical form: `Dune 2` -> `Dune: Part Two`, `Captain Philips` -> `Captain Phillips`, `F1: The Movie`
-> `F1`, `Grave of Fireflies` -> `Grave of the Fireflies`, `What dreams may come.` -> `What Dreams May
Come`, `Killing of a Sacred Deer` -> `The Killing of a Sacred Deer`, and `Diabel` -> `Diabel` was set to the
1988 film's Letterboxd title.
