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

const ICON_LINK_CLASSES =
  "inline-flex shrink-0 items-center justify-center rounded-sm text-ink-soft outline-none transition-colors duration-200 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// Hand-authored inline SVG (this app's first icon - matches the existing
// MarkerGlyph/markerPaths.tsx pattern rather than pulling in an icon
// library, per TECH_STACK.md's ask-before-adding policy). `aria-hidden` so
// it never carries its own accessible name - the wrapping <a>'s
// aria-label/title are the sole accessible name and tooltip (TECH_DEBT.md
// 2026-09-22, item 2).
function ExternalLinkIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="inline-block"
    >
      <path
        d="M4 12 L12 4 M6 4 H12 V10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Maintenance fix (TECH_DEBT.md 2026-09-22, item 1): label and pills render
// on one flex-wrap row (the label as an inline lead-in, pills flowing after
// it), instead of the label stacked above the list - so the whole group
// wraps together rather than leaving the label alone on its own line.
function PillList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="text-xs font-medium text-ink-soft">{label}</span>
      <ul aria-label={label} className="flex flex-wrap items-baseline gap-1">
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
          <a
            href={ao3WorkBookmarksUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="View this work's bookmarks on AO3"
            aria-label="View this work's bookmarks on AO3"
            className={ICON_LINK_CLASSES}
          >
            <ExternalLinkIcon />
          </a>
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
          // A bookmark note IS quoted content (someone else's words about
          // this work), so it renders as a real <blockquote> rather than a
          // plain <div> - picks up the app-wide left-border+indent treatment
          // from index.css's global `blockquote` rule (MASTER.md's
          // "Blockquotes" spec, item 3), the same rule any real
          // `<blockquote>` nested inside the sanitized noteHtml itself also
          // gets automatically.
          <blockquote
            className="bookmark-note break-words font-sans text-ink"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(noteHtml) }}
          />
        )}

        <PillList label="Tags" items={bookmarkerTags} />
        <PillList label="Collections" items={collections} />
      </div>
    </li>
  );
}
