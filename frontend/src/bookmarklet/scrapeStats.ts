// scrapeStats reads AO3's own stats-page DOM (loaded same-origin by the
// bookmarklet) and returns already-parsed data. It never throws - every
// failure mode (wrong view, no works yet, unrecognized markup) is a typed
// { ok: false, reason } result so the bookmarklet can show a specific
// banner instead of a raw exception.

export interface AggregateStats {
  hits: number;
  kudos: number;
  comments: number;
  bookmarks: number;
  subscriptions: number;
  userSubscriptions: number;
  wordCount: number;
  worksCount: number;
}

export interface ScrapedWork {
  ao3WorkId: number;
  title: string;
  fandoms: string[];
  hits: number;
  kudos: number;
  comments: number;
  bookmarks: number;
  subscriptions: number;
  wordCount: number;
}

export interface ScrapedData {
  username: string;
  aggregate: AggregateStats;
  works: ScrapedWork[];
  earliestPostYear: number | null;
}

export type ScrapeFailureReason = "no-works" | "not-all-years" | "scrape-failed";

export type ScrapeResult =
  { ok: true; data: ScrapedData } | { ok: false; reason: ScrapeFailureReason };

const USERNAME_PATTERN = /^\/users\/([^/]+)\/stats/;

export function scrapeStats(doc: Document, pathname: string): ScrapeResult {
  try {
    return scrapeStatsUnsafe(doc, pathname);
  } catch {
    return { ok: false, reason: "scrape-failed" };
  }
}

function scrapeStatsUnsafe(doc: Document, pathname: string): ScrapeResult {
  const usernameMatch = pathname.match(USERNAME_PATTERN);
  if (!usernameMatch) return { ok: false, reason: "scrape-failed" };
  const username = usernameMatch[1];

  // AO3 reuses #main as the generic per-page content container across the
  // whole site; the stats-index class is what actually identifies this page.
  const statsRoot = doc.querySelector("#main.stats-index");
  if (!statsRoot) return { ok: false, reason: "scrape-failed" };

  const currentYearLabel = statsRoot.querySelector(".year.actions .current")?.textContent?.trim();
  if (!currentYearLabel) return { ok: false, reason: "scrape-failed" };
  if (currentYearLabel !== "All Years") return { ok: false, reason: "not-all-years" };

  if (statsRoot.querySelector("p.notice")) return { ok: false, reason: "no-works" };

  const aggregate = parseAggregate(statsRoot);
  if (!aggregate) return { ok: false, reason: "scrape-failed" };

  const works = parseWorks(statsRoot);
  if (works === null) return { ok: false, reason: "scrape-failed" };
  if (works.length === 0) return { ok: false, reason: "no-works" };

  const earliestPostYear = parseEarliestPostYear(statsRoot);

  return {
    ok: true,
    data: {
      username,
      aggregate: { ...aggregate, worksCount: works.length },
      works,
      earliestPostYear,
    },
  };
}

// The synthetic zero-point baseline year: the minimum parseable year across
// the stats page's own year-selector links (never the "All Years" span
// itself, which isn't an anchor). Non-fatal by design - a missing/empty
// year list still yields a successful scrape with a null year.
function parseEarliestPostYear(statsRoot: Element): number | null {
  const yearLinks = Array.from(statsRoot.querySelectorAll("ol.year.actions li a"));
  const years = yearLinks
    .map((link) => parseNumber(link.textContent))
    .filter((year): year is number => year !== null);

  return years.length === 0 ? null : Math.min(...years);
}

function parseAggregate(statsRoot: Element): Omit<AggregateStats, "worksCount"> | null {
  const metaDl = statsRoot.querySelector("dl.statistics.meta.group");
  if (!metaDl) return null;

  const wordCount = parseNumber(metaDl.querySelector("dd.words")?.textContent);
  const hits = parseNumber(metaDl.querySelector("dd.hits")?.textContent);
  const kudos = parseNumber(metaDl.querySelector("dd.kudos")?.textContent);
  const comments = parseNumber(metaDl.querySelector("dd.comment.thread.count")?.textContent);
  const bookmarks = parseNumber(metaDl.querySelector("dd.bookmarks")?.textContent);
  const subscriptions = parseNumber(metaDl.querySelector("dd.subscriptions")?.textContent);
  const userSubscriptions = parseNumber(metaDl.querySelector("dd.user.subscriptions")?.textContent);

  if (
    [wordCount, hits, kudos, comments, bookmarks, subscriptions, userSubscriptions].some(
      (n) => n === null,
    )
  ) {
    return null;
  }

  return {
    wordCount: wordCount as number,
    hits: hits as number,
    kudos: kudos as number,
    comments: comments as number,
    bookmarks: bookmarks as number,
    subscriptions: subscriptions as number,
    userSubscriptions: userSubscriptions as number,
  };
}

// Per-work rows are grouped under a fandom heading, so the same work can
// appear multiple times (once per fandom it's tagged with) - dedup by
// ao3WorkId and union the fandom names onto a single entry.
function parseWorks(statsRoot: Element): ScrapedWork[] | null {
  const rows = Array.from(
    statsRoot.querySelectorAll("ul.statistics.index.group > li.fandom.listbox.group"),
  );
  const worksById = new Map<number, ScrapedWork>();

  for (const row of rows) {
    const fandom = row.querySelector("h5.heading")?.textContent?.trim();
    const link = row.querySelector("dl > dt a");
    const href = link?.getAttribute("href") ?? "";
    const idMatch = href.match(/\/works\/(\d+)/);

    if (!fandom || !link || !idMatch) return null;

    const ao3WorkId = Number(idMatch[1]);
    const title = link.textContent?.trim() ?? "";
    const statsDl = row.querySelector("dl.stats");
    const wordCount = parseWorkWordCount(row.querySelector("dl > dt span.words")?.textContent) ?? 0;
    const hits = parseNumber(statsDl?.querySelector("dd.hits")?.textContent) ?? 0;
    const kudos = parseNumber(statsDl?.querySelector("dd.kudos")?.textContent) ?? 0;
    const comments = parseNumber(statsDl?.querySelector("dd.comments")?.textContent) ?? 0;
    const bookmarks = parseNumber(statsDl?.querySelector("dd.bookmarks")?.textContent) ?? 0;
    const subscriptions = parseNumber(statsDl?.querySelector("dd.subscriptions")?.textContent) ?? 0;

    const existing = worksById.get(ao3WorkId);
    if (existing) {
      if (!existing.fandoms.includes(fandom)) existing.fandoms.push(fandom);
    } else {
      worksById.set(ao3WorkId, {
        ao3WorkId,
        title,
        fandoms: [fandom],
        hits,
        kudos,
        comments,
        bookmarks,
        subscriptions,
        wordCount,
      });
    }
  }

  return Array.from(worksById.values());
}

function parseNumber(text: string | null | undefined): number | null {
  if (text == null) return null;
  const cleaned = text.replace(/,/g, "").trim();
  if (cleaned === "") return null;

  const value = Number(cleaned);
  return Number.isNaN(value) ? null : value;
}

// A work's word count renders as "(11,885 words)" rather than the aggregate
// dd.words' bare comma-delimited number, so it needs the parens/unit text
// stripped in addition to the commas parseNumber already handles.
function parseWorkWordCount(text: string | null | undefined): number | null {
  if (text == null) return null;
  const digitsOnly = text.replace(/[^\d]/g, "");
  return parseNumber(digitsOnly);
}
