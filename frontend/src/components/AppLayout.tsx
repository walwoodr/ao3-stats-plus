import { useEffect, useRef } from "react";
import { Link, Outlet, useLocation, useMatch } from "react-router-dom";

const NAV_LINK_CLASSES =
  "rounded-sm text-sm text-ink-soft outline-none transition-colors duration-200 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// Wraps every route with semantic header/nav/main landmarks and moves focus
// to the main content on route change, since React Router's client-side
// navigation doesn't reset focus the way a full page load would.
export function AppLayout() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  // Username-scoped Dashboard/Bookmarks links (docs/plans/bookmark-notes-
  // feed.md, T-09) - rendered only under /u/:username* (the dashboard and
  // bookmarks routes both nest inside AppLayout, so this can't just read a
  // route param off useParams the way a route-owned component would).
  const usernameMatch = useMatch("/u/:username/*");

  useEffect(() => {
    mainRef.current?.focus();
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-ink/12 px-6 py-4">
        <Link
          to="/"
          className="rounded-sm font-display text-lg font-semibold text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          AO3 Stats+
        </Link>
      </header>

      <nav aria-label="Main" className="flex gap-4 border-b border-ink/12 px-6 py-2">
        {usernameMatch && (
          <>
            <Link to={`/u/${usernameMatch.params.username}`} className={NAV_LINK_CLASSES}>
              Dashboard
            </Link>
            <Link to={`/u/${usernameMatch.params.username}/bookmarks`} className={NAV_LINK_CLASSES}>
              Bookmarks
            </Link>
          </>
        )}
        <Link to="/install" className={NAV_LINK_CLASSES}>
          Install
        </Link>
      </nav>

      <main
        ref={mainRef}
        tabIndex={-1}
        className="outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Outlet />
      </main>
    </div>
  );
}
