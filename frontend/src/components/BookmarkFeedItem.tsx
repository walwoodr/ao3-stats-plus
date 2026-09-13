import { MarkerGlyph } from "../lib/markerShapes";
import type { MarkerShapeName } from "../lib/seriesStyles";
import { sanitizeHtml } from "../lib/sanitizeHtml";

// A single bookmark-note card (docs/plans/bookmark-notes-feed.md §3, T-06):
// two-column layout (work identity | the bookmark itself). `showGlyph`/
// `glyphShape`/`glyphColor` are pre-resolved props computed upstream by
// bookmarkFeed.ts's `shouldShowGlyphs`/`buildGlyphStyleAssignment` (Decision
// D5) - this component obeys the prop rather than re-deriving the rule,
// mirroring ComparisonLegend's own (shape, color)-as-props contract.
export interface BookmarkFeedItemProps {
  workTitle: string;
  workFandoms: string;
  bookmarkerName: string | null;
  noteHtml: string | null;
  bookmarkerTags: string[];
  bookmarkedOn: string | null;
  collections: string[];
  ao3WorkBookmarksUrl: string;
  showGlyph: boolean;
  glyphShape?: MarkerShapeName;
  glyphColor?: string;
}

const LINK_CLASSES =
  "underline text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function PillList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <span className="text-xs font-medium text-ink-soft">{label}</span>
      <ul aria-label={label} className="mt-1 flex flex-wrap gap-1">
        {items.map((item) => (
          <li
            key={item}
            className="rounded-full border border-ink/15 px-2 py-0.5 text-xs text-ink-soft"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BookmarkFeedItem({
  workTitle,
  workFandoms,
  bookmarkerName,
  noteHtml,
  bookmarkerTags,
  bookmarkedOn,
  collections,
  ao3WorkBookmarksUrl,
  showGlyph,
  glyphShape,
  glyphColor,
}: BookmarkFeedItemProps) {
  return (
    <li className="flex flex-col gap-4 rounded-lg border border-ink/12 bg-card p-6 transition-colors duration-200 sm:grid sm:grid-cols-[12rem_minmax(0,1fr)]">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          {showGlyph && glyphShape && glyphColor && (
            <MarkerGlyph shape={glyphShape} color={glyphColor} />
          )}
          <span className="font-sans text-ink">{workTitle}</span>
        </div>
        <span className="text-sm text-ink-soft">{workFandoms}</span>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {bookmarkerName ? (
            <span className="font-medium text-ink">{bookmarkerName}</span>
          ) : (
            <span className="italic text-ink-soft">Anonymous or deleted bookmarker</span>
          )}
          {bookmarkedOn && (
            <time dateTime={bookmarkedOn} className="font-mono text-sm text-ink-soft">
              {bookmarkedOn}
            </time>
          )}
        </div>

        {noteHtml && (
          <div
            className="bookmark-note break-words font-sans text-ink"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(noteHtml) }}
          />
        )}

        <PillList label="Tags" items={bookmarkerTags} />
        <PillList label="Collections" items={collections} />

        <a
          href={ao3WorkBookmarksUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${LINK_CLASSES} text-sm`}
        >
          View this work&apos;s bookmarks on AO3
        </a>
      </div>
    </li>
  );
}
