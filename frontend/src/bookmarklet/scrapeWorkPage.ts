// scrapeWorkPage reads a single AO3 work page's DOM (same-origin fetched by
// the fan-out orchestrator, one per work Phase 1 scraped) and returns
// already-parsed enrichment data. Mirrors scrapeStats.ts's established
// pattern: never throws - every failure mode is a typed
// { ok: false, reason: "scrape-failed" } result.
//
// EXTERNAL-UNVERIFIED: the outer dl.work.meta.group/dl.stats nesting and
// the dd.series markup shape are modeled on otwcode/otwarchive's
// work_meta_list helper, not verified against a live AO3 page - see
// TECH_DEBT.md and each fixture's header for the corresponding entry. Two
// things ARE confirmed against work_meta_list's real source
// (app/helpers/works_helper.rb): (1) the Comments/Bookmarks dt/dd pair is
// omitted entirely when the count is zero, never rendered as a bare "0" -
// zero must be inferred from the row's absence; (2) only the Bookmarks row
// is ever wrapped in a link - Chapters, Comments, and Kudos are always
// plain text, regardless of count.

export interface ScrapedWorkPage {
  ao3WorkId: number;
  publicBookmarks: number;
  visibleComments: number;
  publishedOn: string | null;
  chapterCount: number;
  chaptersExpected: number | null;
  complete: boolean;
  series: string[];
}

export type WorkPageScrapeResult =
  { ok: true; data: ScrapedWorkPage } | { ok: false; reason: "scrape-failed" };

const WORK_ID_PATTERN = /^\/works\/(\d+)/;

export function scrapeWorkPage(doc: Document, pathname: string): WorkPageScrapeResult {
  try {
    return scrapeWorkPageUnsafe(doc, pathname);
  } catch {
    return { ok: false, reason: "scrape-failed" };
  }
}

function scrapeWorkPageUnsafe(doc: Document, pathname: string): WorkPageScrapeResult {
  const idMatch = pathname.match(WORK_ID_PATTERN);
  if (!idMatch) return { ok: false, reason: "scrape-failed" };
  const ao3WorkId = Number(idMatch[1]);

  const metaGroup = doc.querySelector("dl.work.meta.group");
  if (!metaGroup) return { ok: false, reason: "scrape-failed" };

  const statsDl = metaGroup.querySelector("dd.stats dl.stats");
  if (!statsDl) return { ok: false, reason: "scrape-failed" };

  // Chapters is the one field AO3 always renders regardless of count (there
  // is no "zero chapters" work) - its absence signals a broken/changed
  // layout, not a genuinely-zero reading, unlike Comments/Bookmarks below.
  const chapters = parseChapterTotalDisplay(statsDl.querySelector("dd.chapters")?.textContent);
  if (!chapters) return { ok: false, reason: "scrape-failed" };

  return {
    ok: true,
    data: {
      ao3WorkId,
      publicBookmarks: parseNumber(statsDl.querySelector("dd.bookmarks")?.textContent) ?? 0,
      visibleComments: parseNumber(statsDl.querySelector("dd.comments")?.textContent) ?? 0,
      publishedOn: parseIsoDate(statsDl.querySelector("dd.published")?.textContent),
      chapterCount: chapters.count,
      chaptersExpected: chapters.expected,
      complete: isComplete(statsDl),
      series: parseSeries(metaGroup),
    },
  };
}

// chapter_total_display renders "N/M" for a closed count or "N/? " for
// AO3's open-ended WIP marker.
function parseChapterTotalDisplay(
  text: string | null | undefined,
): { count: number; expected: number | null } | null {
  if (!text) return null;
  const match = text.trim().match(/^([\d,]+)\/(\?|[\d,]+)$/);
  if (!match) return null;

  const count = parseNumber(match[1]);
  if (count === null) return null;
  if (match[2] === "?") return { count, expected: null };

  const expected = parseNumber(match[2]);
  return expected === null ? null : { count, expected };
}

// dd.status's preceding dt distinguishes "Completed:" from "Updated:" -
// absent entirely (no status row at all) is treated as not complete.
function isComplete(statsDl: Element): boolean {
  const statusDd = statsDl.querySelector("dd.status");
  if (!statusDd) return false;

  const label = statusDd.previousElementSibling?.textContent?.trim() ?? "";
  return /completed/i.test(label);
}

// A work can belong to more than one series; absent dd.series means none.
function parseSeries(metaGroup: Element): string[] {
  const seriesDd = metaGroup.querySelector("dd.series");
  if (!seriesDd) return [];

  // Each span.series can also contain sibling "Previous Work"/"Next Work"
  // navigation links (for any work that isn't first/last in that series) -
  // the actual series title link is nested one level deeper, inside
  // span.position, so the selector must be scoped there rather than to any
  // <a> anywhere inside span.series.
  return Array.from(seriesDd.querySelectorAll("span.series span.position a"))
    .map((link) => link.textContent?.trim())
    .filter((name): name is string => !!name);
}

function parseIsoDate(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;

  return Number.isNaN(new Date(trimmed).getTime()) ? null : trimmed;
}

function parseNumber(text: string | null | undefined): number | null {
  if (text == null) return null;
  const cleaned = text.replace(/,/g, "").trim();
  if (cleaned === "") return null;

  const value = Number(cleaned);
  return Number.isNaN(value) ? null : value;
}
