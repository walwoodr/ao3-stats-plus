import { Link } from "react-router-dom";

export function LandingPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="font-display text-4xl font-semibold text-ink">AO3 Stats+</h1>
      <p className="text-lg text-ink-soft">Track your AO3 fic stats over time.</p>
      <Link
        to="/install"
        className="rounded-md bg-ink px-6 py-3 font-sans font-semibold text-paper outline-none transition-colors duration-200 hover:bg-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Get started
      </Link>
    </div>
  );
}
