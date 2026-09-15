import type { Meta, StoryObj } from "@storybook/react-vite";
import { BookmarkFeedItem } from "./BookmarkFeedItem";
import { LIGHT_COLOR_TOKENS, DARK_COLOR_TOKENS } from "../lib/colorTokens";

// Storybook coverage for the states docs/plans/bookmark-notes-feed.md §3
// names explicitly for BookmarkFeedItem: populated, missing-name, note-less-
// but-tagged, long-note, and XSS-payload cards, each in light and dark so
// addon-a11y scans both. Only the glyph's color differs between the
// Light/Dark story pairs below (an explicit prop here, not read from
// useChartColors() internally - mirrors ComparisonLegend's contract) - the
// surrounding Tailwind chrome (bg-card/text-ink/etc.) follows
// `prefers-color-scheme` the same way every other MASTER-token-based story
// in this repo does, which today has no separate forced-dark variant either
// (see markerShapes.stories.tsx for the one existing precedent of an
// explicit-color-prop dark pairing this follows).
const meta = {
  title: "Components/BookmarkFeedItem",
  component: BookmarkFeedItem,
  parameters: { layout: "padded" },
} satisfies Meta<typeof BookmarkFeedItem>;

export default meta;
type Story = StoryObj<typeof meta>;

const BASE_ARGS = {
  workTitle: "The Long Way Home",
  workFandoms: "Fandom One, Fandom Two",
  bookmarkerName: "reader123",
  noteHtml: "<p>I have re-read this fic more times than I can count. Thank you!</p>",
  bookmarkerTags: ["favorite", "reread"],
  bookmarkedOn: "2026-02-01",
  collections: ["Staff Picks"],
  ao3WorkBookmarksUrl: "https://archiveofourown.org/works/42/bookmarks",
  showGlyph: false,
};

export const PopulatedLight: Story = { args: { ...BASE_ARGS } };

export const PopulatedDark: Story = {
  args: { ...BASE_ARGS },
  parameters: { backgrounds: { default: "dark" } },
};

export const MissingNameLight: Story = {
  args: { ...BASE_ARGS, bookmarkerName: null },
};

export const MissingNameDark: Story = {
  args: { ...BASE_ARGS, bookmarkerName: null },
  parameters: { backgrounds: { default: "dark" } },
};

export const NoteLessButTaggedLight: Story = {
  args: { ...BASE_ARGS, noteHtml: null, bookmarkerTags: ["favorite"], collections: [] },
};

export const NoteLessButTaggedDark: Story = {
  args: { ...BASE_ARGS, noteHtml: null, bookmarkerTags: ["favorite"], collections: [] },
  parameters: { backgrounds: { default: "dark" } },
};

const LONG_NOTE_HTML =
  "<p>" + "This story genuinely wrecked me in the best possible way. ".repeat(20) + "</p>";

export const LongNoteLight: Story = {
  args: { ...BASE_ARGS, noteHtml: LONG_NOTE_HTML },
};

export const LongNoteDark: Story = {
  args: { ...BASE_ARGS, noteHtml: LONG_NOTE_HTML },
  parameters: { backgrounds: { default: "dark" } },
};

// EXTERNAL-UNVERIFIED: not tied to any external system - this is a
// synthetic adversarial payload proving the sanitizeHtml seam (T-02) holds
// end to end, including through Storybook's own render path. Confirms the
// script tag and the onerror handler never reach the live DOM.
const XSS_PAYLOAD_HTML =
  '<p>Nice fic! <script>alert("xss")</script></p><img src="x" onerror="alert(1)">';

export const XssPayloadLight: Story = {
  args: { ...BASE_ARGS, noteHtml: XSS_PAYLOAD_HTML },
};

export const XssPayloadDark: Story = {
  args: { ...BASE_ARGS, noteHtml: XSS_PAYLOAD_HTML },
  parameters: { backgrounds: { default: "dark" } },
};

export const WithGlyphLight: Story = {
  args: {
    ...BASE_ARGS,
    showGlyph: true,
    glyphShape: "circle",
    glyphColor: LIGHT_COLOR_TOKENS.series[0],
  },
};

export const WithGlyphDark: Story = {
  args: {
    ...BASE_ARGS,
    showGlyph: true,
    glyphShape: "circle",
    glyphColor: DARK_COLOR_TOKENS.series[0],
  },
  parameters: { backgrounds: { default: "dark" } },
};
