import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { BookmarkFeedItem } from "./BookmarkFeedItem";

// BookmarkFeedItem is the single-bookmark card (docs/plans/bookmark-notes-
// feed.md §3, task T-06): two-column layout, conditional glyph rendering
// (Decision D5 - a plain `showGlyph` boolean prop computed upstream by
// `shouldShowGlyphs`/passed down, never re-derived here), sanitized note
// HTML, and null-field fallbacks for every optional bookmark field (C5).
// The component does not exist yet - every test below is expected to fail
// on import alone.
const BASE_PROPS = {
  workTitle: "The Long Way Home",
  workFandoms: "Fandom One, Fandom Two",
  bookmarkerName: "reader123",
  noteHtml: "<p>Loved this fic!</p>",
  bookmarkerTags: ["favorite", "reread"],
  bookmarkedOn: "2026-02-01",
  collections: ["Staff Picks"],
  ao3WorkBookmarksUrl: "https://archiveofourown.org/works/42/bookmarks",
  showGlyph: false,
};

describe("BookmarkFeedItem", () => {
  describe("renders every populated field", () => {
    it("renders the work title", () => {
      render(<BookmarkFeedItem {...BASE_PROPS} />);
      expect(screen.getByText("The Long Way Home")).toBeInTheDocument();
    });

    it("renders the work's fandoms", () => {
      render(<BookmarkFeedItem {...BASE_PROPS} />);
      expect(screen.getByText("Fandom One, Fandom Two")).toBeInTheDocument();
    });

    it("renders the bookmarker's name", () => {
      render(<BookmarkFeedItem {...BASE_PROPS} />);
      expect(screen.getByText("reader123")).toBeInTheDocument();
    });

    it("renders every tag as a list item under a 'Tags' group", () => {
      render(<BookmarkFeedItem {...BASE_PROPS} />);
      const tagsGroup = screen.getByRole("list", { name: /tags/i });
      expect(within(tagsGroup).getByText("favorite")).toBeInTheDocument();
      expect(within(tagsGroup).getByText("reread")).toBeInTheDocument();
    });

    it("renders every collection as a list item under a 'Collections' group", () => {
      render(<BookmarkFeedItem {...BASE_PROPS} />);
      const collectionsGroup = screen.getByRole("list", { name: /collections/i });
      expect(within(collectionsGroup).getByText("Staff Picks")).toBeInTheDocument();
    });

    it("renders the AO3 link with the correct href, target, and rel", () => {
      render(<BookmarkFeedItem {...BASE_PROPS} />);
      const link = screen.getByRole("link", { name: /view this work's bookmarks on ao3/i });
      expect(link).toHaveAttribute("href", "https://archiveofourown.org/works/42/bookmarks");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
      expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
    });
  });

  describe("sanitized note render (the load-bearing XSS test - asserts neutralized output in the actual DOM)", () => {
    it("renders benign note HTML formatting", () => {
      render(<BookmarkFeedItem {...BASE_PROPS} noteHtml="<p>Loved this fic!</p>" />);
      expect(screen.getByText("Loved this fic!")).toBeInTheDocument();
    });

    it("never renders a <script> tag from a malicious noteHtml payload", () => {
      const { container } = render(
        <BookmarkFeedItem {...BASE_PROPS} noteHtml='<p>hi</p><script>alert("xss")</script>' />,
      );
      expect(container.querySelector("script")).not.toBeInTheDocument();
    });

    it("never renders an onerror handler from a malicious img payload", () => {
      const { container } = render(
        <BookmarkFeedItem {...BASE_PROPS} noteHtml='<img src="x" onerror="alert(1)">' />,
      );
      const img = container.querySelector("img");
      expect(img).not.toBeNull();
      expect(img).not.toHaveAttribute("onerror");
    });
  });

  describe("null-field fallbacks (C5: partial per-bookmark fields)", () => {
    it("shows 'Anonymous or deleted bookmarker' in place of a null bookmarkerName", () => {
      render(<BookmarkFeedItem {...BASE_PROPS} bookmarkerName={null} />);
      expect(screen.getByText(/anonymous or deleted bookmarker/i)).toBeInTheDocument();
    });

    it("omits the <time> element entirely when bookmarkedOn is null", () => {
      const { container } = render(<BookmarkFeedItem {...BASE_PROPS} bookmarkedOn={null} />);
      expect(container.querySelector("time")).not.toBeInTheDocument();
    });

    it("omits the 'Tags' group entirely when bookmarkerTags is empty", () => {
      render(<BookmarkFeedItem {...BASE_PROPS} bookmarkerTags={[]} />);
      expect(screen.queryByRole("list", { name: /tags/i })).not.toBeInTheDocument();
    });

    it("omits the 'Collections' group entirely when collections is empty", () => {
      render(<BookmarkFeedItem {...BASE_PROPS} collections={[]} />);
      expect(screen.queryByRole("list", { name: /collections/i })).not.toBeInTheDocument();
    });

    it("renders no note prose content when noteHtml is null", () => {
      const { container } = render(<BookmarkFeedItem {...BASE_PROPS} noteHtml={null} />);
      expect(container.querySelector(".bookmark-note")?.textContent ?? "").toBe("");
    });
  });

  // Maintenance fix (TECH_DEBT.md 2026-09-22, item 1): the label and its
  // pill list must render on one flex-wrap row, not the label stacked above
  // the pills (the old `<ul class="mt-1 ...">` markup).
  describe("Tags/Collections same-line layout (label + pills on one row, not stacked)", () => {
    it("renders the Tags label and its pill list as a single flex-wrap row, not vertically stacked", () => {
      render(<BookmarkFeedItem {...BASE_PROPS} />);
      const label = screen.getByText("Tags");
      const row = label.parentElement;
      const list = screen.getByRole("list", { name: /tags/i });

      expect(row).not.toBeNull();
      expect(row?.className).toEqual(expect.stringContaining("flex"));
      expect(row?.className).toEqual(expect.stringContaining("flex-wrap"));
      expect(list.parentElement).toBe(row);
      // The old stacked layout pushed the list below the label with a top
      // margin - that must be gone now that they share a row.
      expect(list.className).not.toEqual(expect.stringContaining("mt-1"));
    });

    it("applies the identical same-line layout to Collections", () => {
      render(<BookmarkFeedItem {...BASE_PROPS} />);
      const label = screen.getByText("Collections");
      const row = label.parentElement;
      const list = screen.getByRole("list", { name: /collections/i });

      expect(row?.className).toEqual(expect.stringContaining("flex-wrap"));
      expect(list.parentElement).toBe(row);
    });
  });

  describe("<time dateTime> semantics", () => {
    it("sets dateTime to the raw bookmarkedOn value", () => {
      const { container } = render(<BookmarkFeedItem {...BASE_PROPS} bookmarkedOn="2026-02-01" />);
      const time = container.querySelector("time");
      expect(time).toHaveAttribute("dateTime", "2026-02-01");
    });
  });

  // Decision D5: the glyph is a plain boolean prop, computed upstream by
  // `shouldShowGlyphs` (bookmarkFeed.ts) and passed down - this component
  // must not re-derive the rule itself, just obey the prop.
  describe("conditional glyph (Decision D5)", () => {
    it("renders no MarkerGlyph element at all when showGlyph is false (title only, no reserved gap)", () => {
      const { container } = render(
        <BookmarkFeedItem
          {...BASE_PROPS}
          showGlyph={false}
          glyphShape="circle"
          glyphColor="#123456"
        />,
      );
      expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeInTheDocument();
    });

    it("renders the glyph, aria-hidden, when showGlyph is true", () => {
      const { container } = render(
        <BookmarkFeedItem
          {...BASE_PROPS}
          showGlyph={true}
          glyphShape="circle"
          glyphColor="#123456"
        />,
      );
      const glyph = container.querySelector("svg");
      expect(glyph).toBeInTheDocument();
      expect(glyph).toHaveAttribute("aria-hidden", "true");
    });

    // The title text is always the accessible name for the work identity,
    // in every state - the glyph never carries meaning on its own.
    it("still renders the title as plain accessible text when the glyph is shown", () => {
      render(
        <BookmarkFeedItem
          {...BASE_PROPS}
          showGlyph={true}
          glyphShape="circle"
          glyphColor="#123456"
        />,
      );
      expect(screen.getByText("The Long Way Home")).toBeInTheDocument();
    });
  });
});
