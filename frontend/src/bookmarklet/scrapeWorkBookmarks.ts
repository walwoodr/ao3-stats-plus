// scrapeWorkBookmarks parses a single AO3 /works/:id/bookmarks page (public
// bookmarks only - an inherent AO3 limitation the plan accepts) and follows
// its "next" pagination up to a caller-supplied page cap, aggregating every
// page's bookmarks into one list. Network/timeout/abort concerns belong to
// the fan-out orchestrator (fanOut.ts) - fetchAllWorkBookmarks here just
// takes an injected fetchPage function and handles pagination-following +
// the page cap, so parsing/pagination logic stays independently testable
// with no real network involved.
//
// Per-bookmark field selectors (byline, note, tags, datetime, collections)
// are confirmed 2026-09-17 directly against otwcode/otwarchive's actual
// app/views/bookmarks/_bookmark_user_module.html.erb source - see
// TECH_DEBT.md. Pagination detection is likewise confirmed: AO3's
// bookmarks/index.html.erb calls Pagy's stock `pagy_nav` (Pagy 9.3.3,
// per otwcode/otwarchive's Gemfile.lock, verified directly against
// raw.githubusercontent.com/ddnexus/pagy's tagged 9.3.3 source), not
// Kaminari - see parseHasNextPage below.

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

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

export function parseWorkBookmarksPage(doc: Document): WorkBookmarksPage {
  const items = Array.from(doc.querySelectorAll("ol.bookmark.index.group > li.bookmark"));
  const bookmarks = items.map(parseBookmarkItem);

  return { bookmarks, hasNextPage: parseHasNextPage(doc) };
}

// Pagy's pagy_nav (confirmed against Pagy 9.3.3's actual source, the
// version AO3's Gemfile.lock pins) renders <nav class="pagy nav"> as a flat
// sequence of sibling <a> tags with no <ol>/<li> wrapper and no rel="next"
// attribute anywhere - unlike the Kaminari-style markup this scraper
// originally (and wrongly) assumed. The nav's last child <a> is always the
// "next" control: a real <a href="..."> when a next page exists, or an
// href-less <a role="link" aria-disabled="true"> on the last page. Presence
// of href on that last link is therefore a reliable, locale-independent
// signal - it doesn't depend on AO3's translated "Next →" link text.
function parseHasNextPage(doc: Document): boolean {
  const nav = doc.querySelector("nav.pagy.nav");
  if (!nav) return false;

  const links = nav.querySelectorAll(":scope > a");
  const lastLink = links[links.length - 1];
  return !!lastLink?.hasAttribute("href");
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
    bookmarkerTags: parseListAfterHeading(item, "Bookmarker's Tags:"),
    bookmarkedOn: parseBookmarkedOn(item.querySelector("p.datetime")?.textContent),
    collections: parseListAfterHeading(item, "Bookmarker's Collections:"),
  };
}

// A deleted/orphaned account's byline renders with no <a> at all.
function parseBookmarkerName(item: Element): string | null {
  const link = item.querySelector("h5.byline.heading a");
  const name = link?.textContent?.trim();
  return name || null;
}

function parseNoteHtml(item: Element): string | null {
  const note = item.querySelector("blockquote.userstuff.notes");
  const html = note?.innerHTML.trim();
  return html || null;
}

// Tags and Collections are each their own "h6.meta.heading" + list pair
// within a bookmark item, sharing the same list markup shape - identified
// by the heading text immediately preceding the list rather than by class,
// since both lists use the same classes. Heading text is matched exactly on
// the confirmed English strings ("Bookmarker's Tags:"/"Bookmarker's
// Collections:") - reasonable given the rest of this scraper already
// assumes English AO3 output, even though the real heading text comes from
// AO3's i18n `ts()` helper and could theoretically vary by locale.
function parseListAfterHeading(item: Element, headingText: string): string[] {
  const headings = Array.from(item.querySelectorAll("h6.meta.heading"));
  const heading = headings.find((h) => h.textContent?.trim() === headingText);
  const list = heading?.nextElementSibling;
  if (!list) return [];

  return Array.from(list.querySelectorAll("a"))
    .map((a) => a.textContent?.trim())
    .filter((name): name is string => !!name);
}

// AO3 renders bookmark dates as "01 May 2024" (day, full month name, year).
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
