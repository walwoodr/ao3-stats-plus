import { useState } from "react";

// The bookmarklet is a loader: dragging/installing this link just injects a
// small IIFE that pulls in the real bookmarklet bundle from our own origin
// (built from src/bookmarklet/*.ts - see TECH_DEBT.md for the still-open
// build/hosting step). Dragging isn't keyboard-operable, so this page also
// offers a keyboard-reachable fallback: a toggle that reveals the same code
// as copyable text, per the plan.
function buildBookmarkletSource(): string {
  const appOrigin = window.location.origin;
  return `javascript:(function(){var s=document.createElement('script');s.src='${appOrigin}/bookmarklet.js?t='+Date.now();document.body.appendChild(s);})();`;
}

export function InstallPage() {
  const [showCode, setShowCode] = useState(false);
  const bookmarkletSource = buildBookmarkletSource();

  const handleCopy = () => {
    navigator.clipboard.writeText(bookmarkletSource);
  };

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Install the AO3 Stats+ bookmarklet</h1>
      <p className="mt-4 text-slate-700">
        Drag the button below to your browser's bookmarks bar. Whenever you're on your AO3 stats
        page, click it to capture a snapshot of your stats.
      </p>

      <button
        type="button"
        aria-expanded={showCode}
        onClick={() => setShowCode((prev) => !prev)}
        className="mt-6 rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
      >
        Show code
      </button>

      <p className="mt-6">
        <a
          href={bookmarkletSource}
          onClick={(event) => event.preventDefault()}
          className="inline-block rounded-md bg-slate-900 px-4 py-2 font-medium text-white"
        >
          AO3 Stats+
        </a>
      </p>

      {showCode && (
        <div className="mt-6">
          <p className="text-sm text-slate-600">
            Can't drag? Copy this code and paste it as the URL of a new bookmark instead:
          </p>
          <pre className="mt-2 overflow-x-auto rounded-md bg-slate-100 p-3 text-xs">
            <code>{bookmarkletSource}</code>
          </pre>
          <button
            type="button"
            onClick={handleCopy}
            className="mt-2 rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
          >
            Copy
          </button>
        </div>
      )}
    </div>
  );
}
