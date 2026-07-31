import type { ScrapedWorkPage } from "./scrapeWorkPage";
import type { ScrapedBookmark } from "./scrapeWorkBookmarks";

// Translates scrapeWorkPage's + scrapeWorkBookmarks' parsed data into the
// exact POST /ingest/work JSON body contract defined in
// backend/spec/support/work_detail_payloads.rb, mirroring
// buildIngestPayload.ts's role for the existing /ingest payload - own
// schemaVersion namespace, independent of the stats-page schemaVersion per
// the plan.
export interface WorkDetailPayload {
  schemaVersion: number;
  username: string;
  readToken: string | null;
  ao3WorkId: number;
  workStats: {
    publicBookmarks: number;
    visibleComments: number;
    chapterCount: number;
    chaptersExpected: number | null;
  };
  work: {
    publishedOn: string | null;
    series: string[];
    complete: boolean;
  };
  bookmarks: ScrapedBookmark[];
}

export interface BuildWorkDetailPayloadOptions {
  schemaVersion: number;
  username: string;
  readToken?: string;
}

export function buildWorkDetailPayload(
  workPage: ScrapedWorkPage,
  bookmarks: ScrapedBookmark[],
  options: BuildWorkDetailPayloadOptions,
): WorkDetailPayload {
  return {
    schemaVersion: options.schemaVersion,
    username: options.username,
    readToken: options.readToken ?? null,
    ao3WorkId: workPage.ao3WorkId,
    workStats: {
      publicBookmarks: workPage.publicBookmarks,
      visibleComments: workPage.visibleComments,
      chapterCount: workPage.chapterCount,
      chaptersExpected: workPage.chaptersExpected,
    },
    work: {
      publishedOn: workPage.publishedOn,
      series: workPage.series,
      complete: workPage.complete,
    },
    bookmarks,
  };
}
