// The success banner's editable-token field (docs/plans/memorable-token-and-
// recovery.md section 4/7/10, task 20): a labeled, editable text input
// pre-filled with the captured/suggested token, a Copy button (copies the
// *current* input value), a Save button that rotates the token via a
// caller-supplied onSaveToken callback, and a dashboard link recomputed
// (URL-encoded) from the current saved token. Split out of banners.ts to
// keep that file under CODE_STANDARDS.md's 400-line .ts budget - this is a
// self-contained "one field's worth" of DOM construction and Save-button
// state machine, not a general-purpose banners helper.
//
// onSaveToken mirrors renderRetryBanner's existing onRetry callback
// pattern: banners.ts stays decoupled from apiOrigin/fetch/tokenUpdateClient
// entirely - entrypoint.ts is the one that knows how to turn a token string
// into an actual POST /ingest/token request (see entrypoint.ts's
// "onSaveToken wiring").
import type { ColorTokens } from "../lib/colorTokens";
import { MESSAGE_STYLE, ctaLinkStyle, inputButton, primaryButtonStyle } from "./bannerStyles";

export type SaveTokenResult = { ok: true; readToken: string } | { ok: false; message: string };

export interface SuccessBannerData {
  readToken: string;
  frontendOrigin: string;
  username: string;
  onSaveToken: (newToken: string) => Promise<SaveTokenResult>;
}

const INPUT_ID = "ao3-stats-plus-token-input";

function buildDashboardUrl(frontendOrigin: string, username: string, token: string): string {
  return `${frontendOrigin}/u/${encodeURIComponent(username)}?token=${encodeURIComponent(token)}`;
}

function labelStyle(colors: ColorTokens): string {
  return `${MESSAGE_STYLE}font-size:0.8125rem;font-weight:600;color:${colors.inkSoft};`;
}

// MASTER.md's Inputs spec (plan section 4): 16px explicitly (never
// smaller - avoids iOS Safari auto-zooming the field on focus), monospace
// value font since the token is a figure to be transcribed precisely, same
// treatment as the old read-only <code> block it replaces.
function inputStyle(colors: ColorTokens): string {
  return (
    `background:${colors.card};color:${colors.ink};` +
    "display:flex;gap:0.5rem;flex-direction:row;align-items:center;" +
    `border:1px solid color-mix(in srgb, ${colors.ink} 20%, transparent);border-radius:6px;` +
    "font-size:16px;width:100%;box-sizing:border-box;"
  );
}
function internalInputStyle(colors: ColorTokens): string {
  return (
    `background:${colors.card};color:${colors.ink};` +
    "padding:10px 14px;font-size:16px;width:100%;box-sizing:border-box;" +
    "font-family:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;" +
    "border:none;border-radius:6px;box-shadow: none;"
  );
}

function smallTextStyle(color: string): string {
  return `${MESSAGE_STYLE}font-size:0.8125rem;color:${color};`;
}

// Listens on the <input> (the actual focus target), but rings the
// *wrapper* div (inputStyle) - the input itself (internalInputStyle) has
// border:none, so it has no visible border to ring; the wrapper is what
// actually renders the bordered box around the input + Copy button.
function focusRingListeners(
  input: HTMLInputElement,
  wrapper: HTMLElement,
  colors: ColorTokens,
): void {
  const baseBorder = `1px solid color-mix(in srgb, ${colors.ink} 20%, transparent)`;
  input.addEventListener("focus", () => {
    wrapper.style.borderColor = colors.accent;
    wrapper.style.boxShadow = `0 0 0 3px color-mix(in srgb, ${colors.accent} 15%, transparent)`;
  });
  input.addEventListener("blur", () => {
    wrapper.style.border = baseBorder;
    wrapper.style.boxShadow = "none";
  });
}

export function appendTokenField(
  banner: HTMLElement,
  colors: ColorTokens,
  data: SuccessBannerData,
): void {
  const label = document.createElement("label");
  label.setAttribute("for", INPUT_ID);
  label.textContent = "Your access token - type a new one to choose your own:";
  label.style.cssText = labelStyle(colors);
  banner.appendChild(label);

  const inputActionArea = document.createElement("div");
  inputActionArea.style.cssText = "display:flex;gap:0.5rem;";
  banner.appendChild(inputActionArea);

  const inputArea = document.createElement("div");
  inputArea.style.cssText = inputStyle(colors);
  inputActionArea.appendChild(inputArea);

  const input = document.createElement("input");
  input.type = "text";
  input.id = INPUT_ID;
  input.value = data.readToken;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("autocapitalize", "off");
  input.style.cssText = internalInputStyle(colors);
  focusRingListeners(input, inputArea, colors);
  inputArea.appendChild(input);

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.textContent = "⧉";
  copyButton.setAttribute("title", "Copy");
  copyButton.setAttribute("aria-label", "Copy");
  copyButton.style.cssText = inputButton(colors.card, colors.inkSoft);
  copyButton.addEventListener("click", () => {
    navigator.clipboard.writeText(input.value);
    copyButton.textContent = "☑";
    copyButton.setAttribute("title", "Copied!");
    copyButton.setAttribute("aria-label", "Copied!");
  });
  inputArea.appendChild(copyButton);

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = "Save";
  saveButton.style.cssText = primaryButtonStyle(colors.card, colors.inkSoft);
  inputActionArea.appendChild(saveButton);

  const explainer = document.createElement("p");
  explainer.textContent =
    "You may wish to save this token in a password wallet to guarantee future access to your saved stats.";
  explainer.style.cssText = smallTextStyle(colors.inkSoft);
  banner.appendChild(explainer);

  const continueActionRegion = document.createElement("div");
  continueActionRegion.style.cssText = "display:flex;gap:0.5rem;flex-direction:row-reverse;";
  banner.appendChild(continueActionRegion);

  const savedRegion = document.createElement("p");
  savedRegion.setAttribute("role", "status");
  savedRegion.setAttribute("aria-live", "polite");
  savedRegion.style.cssText = smallTextStyle(colors.inkSoft);
  banner.appendChild(savedRegion);

  const errorRegion = document.createElement("p");
  errorRegion.setAttribute("role", "alert");
  errorRegion.style.cssText = smallTextStyle(colors.destructive);
  errorRegion.style.display = "none";
  continueActionRegion.appendChild(errorRegion);

  const link = document.createElement("a");
  link.href = buildDashboardUrl(data.frontendOrigin, data.username, data.readToken);
  link.textContent = "View your dashboard";
  link.style.cssText = ctaLinkStyle(colors.growth, colors.card);
  continueActionRegion.appendChild(link);

  const triggerSave = (): void => {
    const trimmed = input.value.trim();
    if (!trimmed) return;

    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
    errorRegion.textContent = "";
    errorRegion.style.display = "none";

    data
      .onSaveToken(trimmed)
      .then((result) => {
        if (result.ok) {
          input.value = result.readToken;
          link.href = buildDashboardUrl(data.frontendOrigin, data.username, result.readToken);
          savedRegion.textContent = "Token saved.";
        } else {
          errorRegion.textContent = result.message;
          errorRegion.style.display = "";
        }
      })
      .catch(() => {
        errorRegion.textContent = "Could not save token - please try again.";
        errorRegion.style.display = "";
      })
      .finally(() => {
        saveButton.disabled = false;
        saveButton.textContent = "Save";
      });
  };

  saveButton.addEventListener("click", triggerSave);
  // Belt-and-suspenders, matching renderRetryBanner's Enter-triggers-action
  // pattern: banners are injected outside our own event-handling stack, so
  // Enter-in-the-input must be handled explicitly (and prevented from doing
  // anything form-submission-like) rather than relying on implicit browser
  // behavior.
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    triggerSave();
  });
}
