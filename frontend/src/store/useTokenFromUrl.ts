import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useTokenStore } from "./useTokenStore";

// Captures ?token= from the URL on DashboardPage mount, persists it per
// username, and strips it from the URL via a replace-navigation so it
// doesn't linger in browser history/referrers. Falls back to a previously
// stored token when the param is absent (e.g. a returning visit).
export function useTokenFromUrl(username: string): string | undefined {
  const [searchParams, setSearchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get("token");
  const storedToken = useTokenStore((state) => state.getToken(username));
  const setToken = useTokenStore((state) => state.setToken);

  useEffect(() => {
    if (!tokenFromUrl) return;

    setToken(username, tokenFromUrl);
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete("token");
        return next;
      },
      { replace: true },
    );
  }, [tokenFromUrl, username, setToken, setSearchParams]);

  return tokenFromUrl ?? storedToken;
}
