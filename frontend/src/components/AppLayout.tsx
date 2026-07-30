import { useEffect, useRef } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

// Wraps every route with semantic header/nav/main landmarks and moves focus
// to the main content on route change, since React Router's client-side
// navigation doesn't reset focus the way a full page load would.
export function AppLayout() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

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
          ao3-stats-plus
        </Link>
      </header>

      <nav aria-label="Main" className="border-b border-ink/12 px-6 py-2">
        <Link
          to="/install"
          className="rounded-sm text-sm text-ink-soft outline-none transition-colors duration-200 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
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
