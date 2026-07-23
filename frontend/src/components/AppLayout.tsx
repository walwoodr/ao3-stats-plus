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
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200 px-6 py-4">
        <Link to="/" className="text-lg font-semibold text-slate-900">
          ao3-stats-plus
        </Link>
      </header>

      <nav aria-label="Main" className="border-b border-slate-100 px-6 py-2">
        <Link to="/install" className="text-sm text-slate-600 hover:text-slate-900">
          Install
        </Link>
      </nav>

      <main ref={mainRef} tabIndex={-1} className="focus:outline-none">
        <Outlet />
      </main>
    </div>
  );
}
