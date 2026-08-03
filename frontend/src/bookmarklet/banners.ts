// Banners the bookmarklet injects into the AO3 page itself, since that's
// where the user is at success/failure time. The success banner shows the
// capability token as visible, copyable text plus a link to the dashboard;
// failure banners are accessible (role="alert"/"status" so screen readers
// announce them) and keyboard-operable (real <button>s, nothing mouse-only).
//
// This file only ever uses inline styles (cssText/style properties), never
// Tailwind classes - it's injected into an arbitrary third-party page (AO3)
// with no build-time CSS pipeline available, so there's no stylesheet for
// class-based styling to resolve against, and no CSS custom properties to
// reference either (see resolveColorTokens below). It reuses this
// product's design-system palette (design-system/ao3-stats-plus/MASTER.md)
// as literal hex from src/lib/colorTokens.ts rather than duplicating a
// separate set of colors here.

import { DARK_COLOR_TOKENS, LIGHT_COLOR_TOKENS, type ColorTokens } from "../lib/colorTokens";
import { MESSAGE_STYLE, primaryButtonStyle } from "./bannerStyles";
import { appendTokenField, type SuccessBannerData } from "./successBannerTokenField";

// SaveTokenResult/SuccessBannerData are defined in successBannerTokenField.ts
// (split out to keep this file under CODE_STANDARDS.md's .ts line budget -
// see that file's own header comment) but re-exported here so callers only
// ever need to import from "./banners".
export type { SaveTokenResult, SuccessBannerData } from "./successBannerTokenField";

export interface FailureBannerData {
  message: string;
  schemaVersion: number;
}

export interface InfoBannerData {
  message: string;
}

export interface RetryBannerData {
  message: string;
  onRetry: () => void;
}

export interface UnauthorizedBannerData {
  message: string;
}

export interface ProgressBannerData {
  current: number;
  total: number;
}

export interface SummaryBannerData {
  enriched: number;
  skipped: number;
  total: number;
  truncatedWorks: boolean;
  truncatedBookmarkPagesCount: number;
  circuitBroken: boolean;
}

// jsdom-safe: matches the rest of the app's `prefers-color-scheme` handling
// (see src/lib/useChartColors.ts), but resolved once per banner render
// rather than reactively - a banner is a one-shot injection into the host
// page, not a long-lived React tree, so there's nothing to re-render if the
// system preference flips while it's on screen.
function resolveColorTokens(): ColorTokens {
  const prefersDark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? DARK_COLOR_TOKENS : LIGHT_COLOR_TOKENS;
}

// Shared base: readable typography (larger size, generous line-height) plus
// a flex-column layout so any banner with multiple children (heading/token/
// button/link) gets consistent gap-based spacing between them, rather than
// elements sitting crammed against each other with zero separation. The
// drop shadow here is intentional and not a MASTER.md anti-pattern
// violation - it's not one of this product's own flat/bordered cards, it's
// a floating overlay injected on top of an arbitrary third-party page
// (AO3), where separation from unpredictable host-page content matters
// more than in-app visual consistency.
function bannerBaseStyle(colors: ColorTokens): string {
  return (
    "position:fixed;top:1rem;right:1rem;z-index:2147483647;max-width:24rem;" +
    "display:flex;flex-direction:column;gap:0.75rem;" +
    "padding:1rem 1.25rem;border-radius:0.5rem;" +
    "font-family:'Work Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
    `font-size:0.9375rem;line-height:1.5;color:${colors.ink};` +
    "box-shadow:0 4px 16px rgba(0,0,0,0.25);"
  );
}

const HEADING_STYLE = "margin:0;font-weight:600;font-size:1rem;";

// This product's 7-token design-system palette (design-system/ao3-stats-plus/
// MASTER.md) has no dedicated "info"/"warning" roles, so each banner
// severity maps onto the closest existing role rather than inventing new
// colors: success -> growth (positive-data green), a scrape-layout/network
// failure or an out-of-date/unauthorized bookmarklet -> destructive (all
// three are "something went wrong" states - retry previously had its own
// amber, but that's a role this palette doesn't have, and the message
// copy/Retry button already distinguish it from a terminal failure without
// needing a fourth color), and the pre-POST informational banner -> accent,
// this product's signature wine, used here as its one "notice this" color.
function tintBackground(colors: ColorTokens, roleColor: string): string {
  return `color-mix(in srgb, ${roleColor} 12%, ${colors.card})`;
}

// The token field itself (editable input, Copy/Save buttons, live/error
// regions, dashboard link) is built by successBannerTokenField.ts - see
// that file's header comment for why it's split out and the full Save
// interaction contract.
export function renderSuccessBanner(container: HTMLElement, data: SuccessBannerData): HTMLElement {
  const colors = resolveColorTokens();
  const banner = document.createElement("div");
  banner.setAttribute("role", "status");
  banner.setAttribute("tabindex", "-1");
  banner.style.cssText = `${bannerBaseStyle(colors)}background:${tintBackground(colors, colors.growth)};border:1px solid ${colors.growth};`;

  const heading = document.createElement("p");
  heading.textContent = "Stats captured!";
  heading.style.cssText = HEADING_STYLE;
  banner.appendChild(heading);

  appendTokenField(banner, colors, data);

  container.appendChild(banner);
  banner.focus();

  return banner;
}

export function renderFailureBanner(container: HTMLElement, data: FailureBannerData): HTMLElement {
  const colors = resolveColorTokens();
  const banner = document.createElement("div");
  banner.setAttribute("role", "alert");
  banner.style.cssText = `${bannerBaseStyle(colors)}background:${tintBackground(colors, colors.destructive)};border:1px solid ${colors.destructive};`;

  const message = document.createElement("p");
  message.textContent = data.message;
  message.style.cssText = MESSAGE_STYLE;
  banner.appendChild(message);

  // schemaVersion is a debugging detail, not part of the problem
  // explanation - de-emphasized (smaller, muted) rather than concatenated
  // into the message a non-technical reader has to parse.
  const detail = document.createElement("p");
  detail.textContent = `schemaVersion ${data.schemaVersion}`;
  detail.style.cssText = `${MESSAGE_STYLE}font-size:0.75rem;color:${colors.inkSoft};`;
  banner.appendChild(detail);

  container.appendChild(banner);
  return banner;
}

// Fills a banner-naming gap: scrape failures (no-works / not-all-years /
// scrape-failed) are informational, pre-POST outcomes with no
// schemaVersion in play, so reusing renderFailureBanner (which always
// appends a "(schemaVersion N)" suffix) would be a misleading fit for them.
export function renderInfoBanner(container: HTMLElement, data: InfoBannerData): HTMLElement {
  const colors = resolveColorTokens();
  const banner = document.createElement("div");
  banner.setAttribute("role", "status");
  banner.style.cssText = `${bannerBaseStyle(colors)}background:${tintBackground(colors, colors.accent)};border:1px solid ${colors.accent};`;
  banner.textContent = data.message;

  container.appendChild(banner);
  return banner;
}

export function renderRetryBanner(container: HTMLElement, data: RetryBannerData): HTMLElement {
  const colors = resolveColorTokens();
  const banner = document.createElement("div");
  banner.setAttribute("role", "alert");
  banner.style.cssText = `${bannerBaseStyle(colors)}background:${tintBackground(colors, colors.destructive)};border:1px solid ${colors.destructive};`;

  const message = document.createElement("p");
  message.textContent = data.message;
  message.style.cssText = MESSAGE_STYLE;
  banner.appendChild(message);

  const retryButton = document.createElement("button");
  retryButton.type = "button";
  retryButton.textContent = "Retry";
  retryButton.style.cssText = primaryButtonStyle(colors.destructive, colors.card);
  retryButton.addEventListener("click", () => data.onRetry());
  // Belt-and-suspenders: real browsers already turn an Enter keydown on a
  // focused <button> into a click, but this banner is injected into an
  // arbitrary AO3 page outside our own event-handling stack, so handle it
  // explicitly rather than relying on that implicit behavior.
  retryButton.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    data.onRetry();
  });
  banner.appendChild(retryButton);

  container.appendChild(banner);
  return banner;
}

export function renderUnauthorizedBanner(
  container: HTMLElement,
  data: UnauthorizedBannerData,
): HTMLElement {
  const colors = resolveColorTokens();
  const banner = document.createElement("div");
  banner.setAttribute("role", "alert");
  banner.style.cssText = `${bannerBaseStyle(colors)}background:${tintBackground(colors, colors.destructive)};border:1px solid ${colors.destructive};`;
  banner.textContent = data.message;

  container.appendChild(banner);
  return banner;
}

// Phase 2 fan-out's live progress indicator (plan section 8): a polite live
// region ("Capturing work N of M...") that updates *in place* via
// updateProgressBanner below, rather than a new alert node per work, so a
// screen-reader user hears periodic progress, not a flood. Unlike
// renderSuccessBanner, it deliberately does not move focus - repeatedly
// stealing focus on every work processed would be actively hostile to
// keyboard/screen-reader users.
export function renderProgressBanner(
  container: HTMLElement,
  data: ProgressBannerData,
): HTMLElement {
  const colors = resolveColorTokens();
  const banner = document.createElement("div");
  banner.setAttribute("role", "status");
  banner.setAttribute("aria-live", "polite");
  banner.style.cssText = `${bannerBaseStyle(colors)}background:${tintBackground(colors, colors.accent)};border:1px solid ${colors.accent};`;
  banner.textContent = progressMessage(data);

  container.appendChild(banner);
  return banner;
}

// Updates the same banner node's text in place - no new DOM node, no
// re-appending, so the container never accumulates more than one progress
// banner across the whole fan-out run.
export function updateProgressBanner(banner: HTMLElement, data: ProgressBannerData): void {
  banner.textContent = progressMessage(data);
}

function progressMessage(data: ProgressBannerData): string {
  return `Capturing work ${data.current} of ${data.total}...`;
}

// The final report once the fan-out finishes (or is capped/circuit-broken) -
// plan section 7: "Saved further data for X of M, Y skipped" plus any truncation, so
// partial success (the normal operating mode under fan-out) is always
// visible, never silently swallowed. A circuit-broken run is called out
// distinctly from an ordinary partial-success summary, since it means AO3
// itself was struggling rather than a handful of individually-skipped works.
export function renderSummaryBanner(container: HTMLElement, data: SummaryBannerData): HTMLElement {
  const colors = resolveColorTokens();
  const banner = document.createElement("div");
  banner.setAttribute("role", "status");
  banner.style.cssText = `${bannerBaseStyle(colors)}background:${tintBackground(colors, colors.growth)};border:1px solid ${colors.growth};`;

  const summary = document.createElement("p");
  summary.textContent = `Saved further data for ${data.enriched} of ${data.total} works (${data.skipped} skipped).`;
  summary.style.cssText = MESSAGE_STYLE;
  banner.appendChild(summary);

  if (data.circuitBroken) {
    const circuitNotice = document.createElement("p");
    circuitNotice.textContent =
      "Stopped early: AO3 appeared to be struggling, so the circuit breaker paused this run.";
    circuitNotice.style.cssText = MESSAGE_STYLE;
    banner.appendChild(circuitNotice);
  }

  if (data.truncatedWorks || data.truncatedBookmarkPagesCount > 0) {
    const truncationNotice = document.createElement("p");
    const parts: string[] = [];
    if (data.truncatedWorks) parts.push("the work count cap was reached");
    if (data.truncatedBookmarkPagesCount > 0) {
      parts.push(`${data.truncatedBookmarkPagesCount} work(s) had truncated bookmark pages`);
    }
    truncationNotice.textContent = `Truncated: ${parts.join("; ")}.`;
    truncationNotice.style.cssText = `${MESSAGE_STYLE}font-size:0.8125rem;color:${colors.inkSoft};`;
    banner.appendChild(truncationNotice);
  }

  container.appendChild(banner);
  return banner;
}
