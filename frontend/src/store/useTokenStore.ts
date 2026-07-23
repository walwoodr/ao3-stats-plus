import { create } from "zustand";
import { persist } from "zustand/middleware";

// useTokenStore holds one capability read token per AO3 username, persisted
// to localStorage so a returning visitor doesn't need to re-paste it from
// the bookmarklet's success banner every time.
interface TokenState {
  tokensByUsername: Record<string, string>;
  getToken: (username: string) => string | undefined;
  setToken: (username: string, token: string) => void;
  clearToken: (username: string) => void;
}

export const useTokenStore = create<TokenState>()(
  persist(
    (set, get) => ({
      tokensByUsername: {},
      getToken: (username) => get().tokensByUsername[username],
      setToken: (username, token) =>
        set((state) => ({
          tokensByUsername: { ...state.tokensByUsername, [username]: token },
        })),
      clearToken: (username) =>
        set((state) => {
          const tokensByUsername = { ...state.tokensByUsername };
          delete tokensByUsername[username];
          return { tokensByUsername };
        }),
    }),
    { name: "ao3-stats-plus-token-store" },
  ),
);
