import { Link } from "react-router-dom";

export function LandingPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-semibold text-slate-900">ao3-stats-plus</h1>
      <p className="text-lg text-slate-600">
        Track how your AO3 fic stats - hits, kudos, comments, bookmarks, subscriptions - change over
        time, straight from your own stats page.
      </p>
      <Link
        to="/install"
        className="rounded-md bg-slate-900 px-6 py-3 font-medium text-white hover:bg-slate-700"
      >
        Get started: install the bookmarklet
      </Link>
    </div>
  );
}
