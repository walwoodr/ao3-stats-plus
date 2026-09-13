import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLayout } from "./components/AppLayout";
import { LandingPage } from "./routes/LandingPage";
import { InstallPage } from "./routes/InstallPage";
import { DashboardPage } from "./routes/DashboardPage";
import { BookmarkFeedPage } from "./routes/BookmarkFeedPage";

// statsForUser errors (unknown username, mismatched token) are
// authorization failures, not transient network blips - retrying them can
// only ever fail the same way, so retries are disabled rather than leaving
// the user in a loading state for the default backoff before landing on
// the same error.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/install" element={<InstallPage />} />
            <Route path="/u/:username" element={<DashboardPage />} />
            <Route path="/u/:username/bookmarks" element={<BookmarkFeedPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
