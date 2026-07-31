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

export interface SuccessBannerData {
  readToken: string;
  dashboardUrl: string;
}

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

// Zeroes out the default <p> margin, since spacing between elements is
// handled by the parent's flex `gap` instead - otherwise the two stack.
const MESSAGE_STYLE = "margin:0;";
const HEADING_STYLE = "margin:0;font-weight:600;font-size:1rem;";

// Monospace + background tint makes the token visually distinct from
// surrounding prose; break-all/pre-wrap ensures a long token wraps instead
// of overflowing the banner's fixed max-width. 'IBM Plex Mono' first, per
// MASTER.md's data/figures typography tier - the read token is exactly
// that, a figure to be copied precisely - falling back to system monospace
// since there's no font-loading mechanism available on the host AO3 page.
function tokenStyle(colors: ColorTokens): string {
  return (
    "display:block;font-family:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,Consolas," +
    "monospace;font-size:0.8125rem;" +
    `background:color-mix(in srgb, ${colors.ink} 8%, ${colors.card});` +
    "padding:0.5rem 0.6rem;border-radius:0.375rem;word-break:break-all;white-space:pre-wrap;"
  );
}

function primaryButtonStyle(accent: string): string {
  return (
    `background:${accent};color:#ffffff;border:none;border-radius:0.375rem;` +
    "padding:0.5rem 0.9rem;font-size:0.875rem;font-weight:600;line-height:1.25;" +
    "cursor:pointer;font-family:inherit;align-self:flex-start;"
  );
}

// Styled as an outlined "secondary CTA" button rather than a bare
// underlined link, so it reads as obviously clickable next to the Copy
// button rather than blending into surrounding text.
function ctaLinkStyle(accent: string, background: string): string {
  return (
    `display:inline-block;align-self:flex-start;color:${accent};background:${background};` +
    `border:1px solid ${accent};border-radius:0.375rem;padding:0.5rem 0.9rem;` +
    "font-size:0.875rem;font-weight:600;text-decoration:none;"
  );
}

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

export function renderSuccessBanner(container: HTMLElement, data: SuccessBannerData): HTMLElement {
  const colors = resolveColorTokens();
  const banner = document.createElement("div");
  banner.setAttribute("role", "status");
  banner.setAttribute("tabindex", "-1");
  banner.style.cssText = `${bannerBaseStyle(colors)}background:${tintBackground(colors, colors.growth)};border:1px solid ${colors.growth};`;

  const heading = document.createElement("p");
  heading.textContent = "Stats captured! Your read token:";
  heading.style.cssText = HEADING_STYLE;
  banner.appendChild(heading);

  const tokenText = document.createElement("code");
  tokenText.textContent = data.readToken;
  tokenText.style.cssText = tokenStyle(colors);
  banner.appendChild(tokenText);

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.textContent = "Copy";
  copyButton.style.cssText = primaryButtonStyle(colors.card);
  copyButton.addEventListener("click", () => {
    navigator.clipboard.writeText(data.readToken);
    copyButton.textContent = "Copied!";
  });
  banner.appendChild(copyButton);
  const copyExplainer = document.createElement("p");
  copyExplainer.textContent =
    "You may wish to save your read token in a password wallet to guarantee future access to your saved stats.";
  copyExplainer.style.cssText = MESSAGE_STYLE;
  banner.appendChild(copyExplainer);

  const link = document.createElement("a");
  link.href = data.dashboardUrl;
  link.textContent = "View your dashboard";
  link.style.cssText = ctaLinkStyle(colors.growth, colors.card);
  banner.appendChild(link);

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
  retryButton.style.cssText = primaryButtonStyle(colors.destructive);
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
