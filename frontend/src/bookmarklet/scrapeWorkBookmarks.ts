// scrapeWorkBookmarks parses a single AO3 /works/:id/bookmarks page (public
// bookmarks only - an inherent AO3 limitation the plan accepts) and follows
// its "next" pagination up to a caller-supplied page cap, aggregating every
// page's bookmarks into one list. Network/timeout/abort concerns belong to
// the fan-out orchestrator (fanOut.ts) - fetchAllWorkBookmarks here just
// takes an injected fetchPage function and handles pagination-following +
// the page cap, so parsing/pagination logic stays independently testable
// with no real network involved.
//
// EVERY selector below (outer item wrapper, byline, note, tags, collections,
// pagination) is confirmed 2026-09-21 directly against live, real AO3 HTML -
// https://archiveofourown.org/works/85527071/bookmarks, pages 1-4 (fetched
// with curl --http1.1 and a real browser User-Agent; Cloudflare 525s were
// transient and cleared on retry) - NOT against otwcode/otwarchive's GitHub
// source or the Pagy gem source, both of which were tried by two earlier
// Maintenance passes (2026-09-17, then again earlier 2026-09-21) and turned
// out to not reflect what AO3 actually serves for this page. See
// TECH_DEBT.md's 2026-09-21 entry for the full history and evidence.
//
// Two load-bearing details a naive reading would miss:
// (1) `ol.bookmark.index.group`'s first child <li> is the WORK's own summary
//     card (`li.work.blurb.group.work-<id>.user-<id>`, also role="article"),
//     not a bookmark - the item selector below matches on the real
//     bookmark-item class set (`user short blurb group`) specifically so it
//     does not pick that card up as a spurious null bookmark row.
// (2) The last page's disabled "next" control is a `<span>`, not an
//     `<a>` without an href - `li.next` is always present when pagination
//     renders at all; what varies is whether it contains a real `<a href>`
//     (has-next) or a `<span class="disabled">` (last page). See
//     parseHasNextPage below.
// (3) The bookmark date's month renders as a 3-letter abbreviation ("Sep",
//     "Jun", not "September"/"June") - a separate, previously-unnoticed bug
//     found by this pass's own fixtures (every prior fixture happened to
//     only use "May", identical either way). See MONTH_NAMES below.

export interface ScrapedBookmark {
  bookmarkerName: string | null;
  noteHtml: string | null;
  bookmarkerTags: string[];
  bookmarkedOn: string | null;
  collections: string[];
}

export interface WorkBookmarksPage {
  bookmarks: ScrapedBookmark[];
  hasNextPage: boolean;
}

export interface FetchWorkBookmarksResult {
  bookmarks: ScrapedBookmark[];
  truncated: boolean;
  pagesFetched: number;
}

// Confirmed live 2026-09-21 against ~60 real p.datetime values across
// https://archiveofourown.org/works/85527071/bookmarks pages 1-4: AO3
// renders the bookmark date's month as a 3-letter abbreviation ("Jun",
// "Sep", "Aug", "Jul" - all observed live), not the full month name a
// previous pass assumed and never caught, since its fixtures only ever
// used "May" (identical either way as a 3-letter prefix).
const MONTH_NAMES = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

export function parseWorkBookmarksPage(doc: Document): WorkBookmarksPage {
  const items = Array.from(
    doc.querySelectorAll('ol.bookmark.index.group > li.user.short.blurb.group[role="article"]'),
  );
  const bookmarks = items.map(parseBookmarkItem);

  return { bookmarks, hasNextPage: parseHasNextPage(doc) };
}

// AO3 actually overrides Pagy's default nav template here (confirmed live,
// not the stock Pagy `pagy_nav` markup an earlier pass trusted from the gem
// source): `<ol class="pagination actions pagy" role="navigation"
// aria-label="Pagination">` with one `<li>` per control, including a
// `<li class="next">`. That `<li class="next">` is present whenever the
// pagination bar renders at all, whether or not a next page exists - what
// distinguishes the two states is its content: a real `<a href="...">` when
// a next page exists, or a plain `<span class="disabled">` (no <a> at all)
// on the last page. So "does li.next contain an href-bearing <a>" is the
// reliable signal, not "does li.next exist" or a rel="next" attribute
// (real AO3 markup never has one).
function parseHasNextPage(doc: Document): boolean {
  const nextItem = doc.querySelector("ol.pagination.actions.pagy > li.next");
  if (!nextItem) return false;

  return !!nextItem.querySelector("a[href]");
}

// Sequentially fetches pages starting at 1, stopping either when a page
// reports no further pagination or the page cap is reached - whichever
// comes first (reaching the cap on exactly the final page is NOT truncation,
// since nothing was actually left unfetched).
export async function fetchAllWorkBookmarks(
  fetchPage: (page: number) => Promise<Document>,
  { maxPages }: { maxPages: number },
): Promise<FetchWorkBookmarksResult> {
  const bookmarks: ScrapedBookmark[] = [];
  let pagesFetched = 0;
  let truncated = false;

  for (let page = 1; page <= maxPages; page++) {
    const doc = await fetchPage(page);
    const parsed = parseWorkBookmarksPage(doc);
    bookmarks.push(...parsed.bookmarks);
    pagesFetched++;

    if (!parsed.hasNextPage) break;
    if (pagesFetched >= maxPages) {
      truncated = true;
      break;
    }
  }

  return { bookmarks, truncated, pagesFetched };
}

function parseBookmarkItem(item: Element): ScrapedBookmark {
  return {
    bookmarkerName: parseBookmarkerName(item),
    noteHtml: parseNoteHtml(item),
    bookmarkerTags: parseListAfterHeading(item, "Bookmark Tags:"),
    bookmarkedOn: parseBookmarkedOn(item.querySelector("p.datetime")?.textContent),
    collections: parseListAfterHeading(item, "Bookmark Collections:"),
  };
}

// A deleted/orphaned account's byline is EXPECTED to render with no <a> at
// all (general AO3 convention) - not independently confirmed against live
// markup this session (none of the ~60 real bookmark items fetched across
// this work's 4 pages happened to include one). See TECH_DEBT.md.
function parseBookmarkerName(item: Element): string | null {
  const link = item.querySelector("h5.byline.heading a");
  const name = link?.textContent?.trim();
  return name || null;
}

// The note block only renders in the DOM when a note actually exists (see
// the header comment's "<!--notes-->" placeholder-comment note). Real
// class is "blockquote.userstuff.summary" - confirmed live; NOT
// "userstuff bookmark-notes" (the pre-2026-09-17 code) or "userstuff notes"
// (an earlier fix this pass supersedes, both unverified guesses that never
// matched real AO3 markup).
function parseNoteHtml(item: Element): string | null {
  const note = item.querySelector("blockquote.userstuff.summary");
  const html = note?.innerHTML.trim();
  return html || null;
}

// Tags and Collections are each their own "h6.meta.heading" + list pair
// within a bookmark item, sharing the same list markup shape - identified
// by the heading text immediately preceding the list rather than by class,
// since both lists use the same classes. Heading text is matched exactly on
// the confirmed real English strings ("Bookmark Tags:"/"Bookmark
// Collections:", confirmed live 2026-09-21 - not the "Bookmarker's Tags:"/
// "Bookmarker's Collections:" wording an earlier pass assumed without
// finding a live example) - reasonable given the rest of this scraper
// already assumes English AO3 output, even though the real heading text
// comes from AO3's i18n `ts()` helper and could theoretically vary by
// locale.
function parseListAfterHeading(item: Element, headingText: string): string[] {
  const headings = Array.from(item.querySelectorAll("h6.meta.heading"));
  const heading = headings.find((h) => h.textContent?.trim() === headingText);
  const list = heading?.nextElementSibling;
  if (!list) return [];

  return Array.from(list.querySelectorAll("a"))
    .map((a) => a.textContent?.trim())
    .filter((name): name is string => !!name);
}

// AO3 renders bookmark dates as "15 Sep 2026" (day, 3-letter month
// abbreviation, year) - confirmed live, see MONTH_NAMES above.
function parseBookmarkedOn(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.trim().match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;

  const monthIndex = MONTH_NAMES.indexOf(match[2].toLowerCase());
  if (monthIndex === -1) return null;

  const day = match[1].padStart(2, "0");
  const month = String(monthIndex + 1).padStart(2, "0");
  return `${match[3]}-${month}-${day}`;
}
