import { useEffect, useRef, useState } from "react";

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
  const [copied, setCopied] = useState(false);
  const bookmarkletSource = buildBookmarkletSource();
  const bookmarkletLinkRef = useRef<HTMLAnchorElement>(null);

  // React sanitizes a javascript: URL passed directly as the href PROP,
  // silently swapping it for a stub that just throws ("React has blocked a
  // javascript: URL as a security precaution.") - a real defense against
  // accidentally rendering untrusted data as a script URL, but this one is
  // our own trusted, hardcoded loader, not user input. Setting the
  // attribute directly on the DOM node (outside React's own prop
  // reconciliation) is the standard way to opt out of that sanitization
  // for a deliberately-a-javascript:-URL case like a bookmarklet.
  useEffect(() => {
    bookmarkletLinkRef.current?.setAttribute("href", bookmarkletSource);
  }, [bookmarkletSource]);

  // Resets on the next code-reveal toggle rather than a timer, so the
  // confirmation doesn't silently disappear while the user is still looking
  // at the revealed code block deciding what to do next.
  const handleCopy = () => {
    navigator.clipboard.writeText(bookmarkletSource);
    setCopied(true);
  };

  const handleToggleShowCode = () => {
    setShowCode((prev) => !prev);
    setCopied(false);
  };

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="font-display text-2xl font-semibold text-ink">
        Save the AO3 Stats+ bookmarklet
      </h1>
      <p className="mt-4 text-ink-soft">
        Drag the "AO3 Stats+" button to your browser's bookmarks bar. Whenever you're on your AO3
        stats page, click it to capture a snapshot of your stats.
      </p>
      <p className="mt-4 text-sm text-ink-soft">
        The bookmarklet is a small script that makes a request to this site to fetch code to read
        your stats page and send your stats at that moment in time to the database. The code is open
        source and you can view it on{" "}
        <a
          href="https://github.com/walwoodr/ao3-stats-plus"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline underline-offset-2 hover:text-ink"
        >
          GitHub
        </a>
      </p>

      <button
        type="button"
        aria-expanded={showCode}
        onClick={handleToggleShowCode}
        className="mt-6 cursor-pointer rounded-md border border-ink-soft px-4 py-2 text-sm font-semibold text-ink outline-none transition-colors duration-200 hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {showCode ? "Hide code" : "Show code"}
      </button>

      <p className="mt-6">
        <a
          ref={bookmarkletLinkRef}
          href={bookmarkletSource}
          onClick={(event) => event.preventDefault()}
          className="inline-block cursor-pointer rounded-md bg-ink px-4 py-2 font-sans font-semibold text-paper outline-none transition-colors duration-200 hover:bg-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          AO3 Stats+
        </a>
      </p>

      {showCode && (
        <div className="mt-6">
          <p className="text-sm text-ink-soft">
            Can't drag? Copy this code and paste it as the URL of a new bookmark instead:
          </p>
          <pre
            tabIndex={0}
            aria-label="Bookmarklet code"
            className="mt-2 overflow-x-auto rounded-md border border-ink/12 bg-card p-3 font-mono text-xs text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <code>{bookmarkletSource}</code>
          </pre>
          <button
            type="button"
            onClick={handleCopy}
            className="mt-2 cursor-pointer rounded-md border border-ink-soft px-3 py-1 text-sm font-semibold text-ink outline-none transition-colors duration-200 hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}
