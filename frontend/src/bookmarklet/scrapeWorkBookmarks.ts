// scrapeWorkBookmarks parses a single AO3 /works/:id/bookmarks page (public
// bookmarks only - an inherent AO3 limitation the plan accepts) and follows
// its "next" pagination up to a caller-supplied page cap, aggregating every
// page's bookmarks into one list. Network/timeout/abort concerns belong to
// the fan-out orchestrator (fanOut.ts) - fetchAllWorkBookmarks here just
// takes an injected fetchPage function and handles pagination-following +
// the page cap, so parsing/pagination logic stays independently testable
// with no real network involved.
//
// EXTERNAL-UNVERIFIED: every fixture this reads against is modeled on
// general community knowledge of AO3's rendered /works/:id/bookmarks
// template, not verified against a live AO3 page - see TECH_DEBT.md.

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
  const hasNextPage = !!doc.querySelector('ol.pagination.actions a[rel="next"]');

  return { bookmarks, hasNextPage };
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
    bookmarkerTags: parseListAfterHeading(item, "Tags"),
    bookmarkedOn: parseBookmarkedOn(item.querySelector("p.datetime")?.textContent),
    collections: parseListAfterHeading(item, "Collections"),
  };
}

// A deleted/orphaned account's byline renders with no <a> at all.
function parseBookmarkerName(item: Element): string | null {
  const link = item.querySelector("h5.byline.heading a");
  const name = link?.textContent?.trim();
  return name || null;
}

function parseNoteHtml(item: Element): string | null {
  const note = item.querySelector("blockquote.userstuff.bookmark-notes");
  const html = note?.innerHTML.trim();
  return html || null;
}

// Tags and Collections are each their own "h6.landmark.heading" + list pair
// within a bookmark item, sharing the same list markup shape - identified
// by the heading text immediately preceding the list rather than by class,
// since both lists use the same classes.
function parseListAfterHeading(item: Element, headingText: string): string[] {
  const headings = Array.from(item.querySelectorAll("h6.landmark.heading"));
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
