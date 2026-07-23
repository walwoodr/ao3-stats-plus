// Banners the bookmarklet injects into the AO3 page itself, since that's
// where the user is at success/failure time. The success banner shows the
// capability token as visible, copyable text plus a link to the dashboard;
// failure banners are accessible (role="alert"/"status" so screen readers
// announce them) and keyboard-operable (real <button>s, nothing mouse-only).

export interface SuccessBannerData {
  readToken: string;
  dashboardUrl: string;
}

export interface FailureBannerData {
  message: string;
  schemaVersion: number;
}

export interface RetryBannerData {
  message: string;
  onRetry: () => void;
}

export interface UnauthorizedBannerData {
  message: string;
}

const BANNER_STYLE =
  "position:fixed;top:1rem;right:1rem;z-index:2147483647;max-width:24rem;" +
  "padding:1rem;border-radius:0.5rem;font-family:sans-serif;font-size:0.875rem;" +
  "box-shadow:0 2px 8px rgba(0,0,0,0.3);";

export function renderSuccessBanner(container: HTMLElement, data: SuccessBannerData): HTMLElement {
  const banner = document.createElement("div");
  banner.setAttribute("role", "status");
  banner.setAttribute("tabindex", "-1");
  banner.style.cssText = `${BANNER_STYLE}background:#f0fdf4;border:1px solid #16a34a;`;

  const heading = document.createElement("p");
  heading.textContent = "Stats captured! Your read token:";
  banner.appendChild(heading);

  const tokenText = document.createElement("code");
  tokenText.textContent = data.readToken;
  banner.appendChild(tokenText);

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.textContent = "Copy";
  copyButton.addEventListener("click", () => {
    navigator.clipboard.writeText(data.readToken);
  });
  banner.appendChild(copyButton);

  const link = document.createElement("a");
  link.href = data.dashboardUrl;
  link.textContent = "View your dashboard";
  banner.appendChild(link);

  container.appendChild(banner);
  banner.focus();

  return banner;
}

export function renderFailureBanner(container: HTMLElement, data: FailureBannerData): HTMLElement {
  const banner = document.createElement("div");
  banner.setAttribute("role", "alert");
  banner.style.cssText = `${BANNER_STYLE}background:#fef2f2;border:1px solid #dc2626;`;
  banner.textContent = `${data.message} (schemaVersion ${data.schemaVersion})`;

  container.appendChild(banner);
  return banner;
}

export function renderRetryBanner(container: HTMLElement, data: RetryBannerData): HTMLElement {
  const banner = document.createElement("div");
  banner.setAttribute("role", "alert");
  banner.style.cssText = `${BANNER_STYLE}background:#fefce8;border:1px solid #ca8a04;`;

  const message = document.createElement("p");
  message.textContent = data.message;
  banner.appendChild(message);

  const retryButton = document.createElement("button");
  retryButton.type = "button";
  retryButton.textContent = "Retry";
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
  banner.style.cssText = `${BANNER_STYLE}background:#fef2f2;border:1px solid #dc2626;`;
  banner.textContent = data.message;

  container.appendChild(banner);
  return banner;
}
