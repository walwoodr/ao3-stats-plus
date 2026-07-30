// Banners the bookmarklet injects into the AO3 page itself, since that's
// where the user is at success/failure time. The success banner shows the
// capability token as visible, copyable text plus a link to the dashboard;
// failure banners are accessible (role="alert"/"status" so screen readers
// announce them) and keyboard-operable (real <button>s, nothing mouse-only).
//
// This file only ever uses inline styles (cssText/style properties), never
// Tailwind classes - it's injected into an arbitrary third-party page (AO3)
// with no build-time CSS pipeline available, so there's no stylesheet for
// class-based styling to resolve against.

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

// Shared base: readable typography (larger size, generous line-height) plus
// a flex-column layout so any banner with multiple children (heading/token/
// button/link) gets consistent gap-based spacing between them, rather than
// elements sitting crammed against each other with zero separation.
const BANNER_STYLE =
  "position:fixed;top:1rem;right:1rem;z-index:2147483647;max-width:24rem;" +
  "display:flex;flex-direction:column;gap:0.75rem;" +
  "padding:1rem 1.25rem;border-radius:0.5rem;" +
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
  "font-size:0.9375rem;line-height:1.5;color:#1f2937;" +
  "box-shadow:0 4px 16px rgba(0,0,0,0.25);";

// Zeroes out the default <p> margin, since spacing between elements is
// handled by the parent's flex `gap` instead - otherwise the two stack.
const MESSAGE_STYLE = "margin:0;";
const HEADING_STYLE = "margin:0;font-weight:600;font-size:1rem;";

// Monospace + background tint makes the token visually distinct from
// surrounding prose; break-all/pre-wrap ensures a long token wraps instead
// of overflowing the banner's fixed max-width.
const TOKEN_STYLE =
  "display:block;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;" +
  "font-size:0.8125rem;background:rgba(0,0,0,0.07);padding:0.5rem 0.6rem;" +
  "border-radius:0.375rem;word-break:break-all;white-space:pre-wrap;";

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
function ctaLinkStyle(accent: string): string {
  return (
    `display:inline-block;align-self:flex-start;color:${accent};background:#ffffff;` +
    `border:1px solid ${accent};border-radius:0.375rem;padding:0.5rem 0.9rem;` +
    "font-size:0.875rem;font-weight:600;text-decoration:none;"
  );
}

const SUCCESS_ACCENT = "#16a34a";
const FAILURE_ACCENT = "#dc2626";
const INFO_ACCENT = "#2563eb";
const RETRY_ACCENT = "#ca8a04";

export function renderSuccessBanner(container: HTMLElement, data: SuccessBannerData): HTMLElement {
  const banner = document.createElement("div");
  banner.setAttribute("role", "status");
  banner.setAttribute("tabindex", "-1");
  banner.style.cssText = `${BANNER_STYLE}background:#f0fdf4;border:1px solid ${SUCCESS_ACCENT};`;

  const heading = document.createElement("p");
  heading.textContent = "Stats captured! Your read token:";
  heading.style.cssText = HEADING_STYLE;
  banner.appendChild(heading);

  const tokenText = document.createElement("code");
  tokenText.textContent = data.readToken;
  tokenText.style.cssText = TOKEN_STYLE;
  banner.appendChild(tokenText);

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.textContent = "Copy";
  copyButton.style.cssText = primaryButtonStyle(SUCCESS_ACCENT);
  copyButton.addEventListener("click", () => {
    navigator.clipboard.writeText(data.readToken);
  });
  banner.appendChild(copyButton);

  const link = document.createElement("a");
  link.href = data.dashboardUrl;
  link.textContent = "View your dashboard";
  link.style.cssText = ctaLinkStyle(SUCCESS_ACCENT);
  banner.appendChild(link);

  container.appendChild(banner);
  banner.focus();

  return banner;
}

export function renderFailureBanner(container: HTMLElement, data: FailureBannerData): HTMLElement {
  const banner = document.createElement("div");
  banner.setAttribute("role", "alert");
  banner.style.cssText = `${BANNER_STYLE}background:#fef2f2;border:1px solid ${FAILURE_ACCENT};`;
  banner.textContent = `${data.message} (schemaVersion ${data.schemaVersion})`;

  container.appendChild(banner);
  return banner;
}

// Fills a banner-naming gap: scrape failures (no-works / not-all-years /
// scrape-failed) are informational, pre-POST outcomes with no
// schemaVersion in play, so reusing renderFailureBanner (which always
// appends a "(schemaVersion N)" suffix) would be a misleading fit for them.
export function renderInfoBanner(container: HTMLElement, data: InfoBannerData): HTMLElement {
  const banner = document.createElement("div");
  banner.setAttribute("role", "status");
  banner.style.cssText = `${BANNER_STYLE}background:#eff6ff;border:1px solid ${INFO_ACCENT};`;
  banner.textContent = data.message;

  container.appendChild(banner);
  return banner;
}

export function renderRetryBanner(container: HTMLElement, data: RetryBannerData): HTMLElement {
  const banner = document.createElement("div");
  banner.setAttribute("role", "alert");
  banner.style.cssText = `${BANNER_STYLE}background:#fefce8;border:1px solid ${RETRY_ACCENT};`;

  const message = document.createElement("p");
  message.textContent = data.message;
  message.style.cssText = MESSAGE_STYLE;
  banner.appendChild(message);

  const retryButton = document.createElement("button");
  retryButton.type = "button";
  retryButton.textContent = "Retry";
  retryButton.style.cssText = primaryButtonStyle(RETRY_ACCENT);
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
  const banner = document.createElement("div");
  banner.setAttribute("role", "alert");
  banner.style.cssText = `${BANNER_STYLE}background:#fef2f2;border:1px solid ${FAILURE_ACCENT};`;
  banner.textContent = data.message;

  container.appendChild(banner);
  return banner;
}
