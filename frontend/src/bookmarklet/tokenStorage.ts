// Persists the bookmarklet's readToken in AO3-origin localStorage, keyed
// per username so multiple AO3 accounts on the same browser don't clobber
// each other's tokens. This is a different origin/store than the app's own
// useTokenStore (which lives on the frontend origin) - the bookmarklet runs
// on archiveofourown.org, so it needs its own persistence to replay the
// token on repeat captures instead of 403ing every time.
//
// Merely *accessing* window.localStorage can throw (Safari private
// browsing/embedded webviews raise a SecurityError), not just fail to
// return a value - every read/write here is guarded so a blocked store
// degrades to "no persisted token" rather than aborting the capture flow.

const KEY_PREFIX = "ao3-stats-plus:readToken:";

export function getStoredReadToken(username: string): string | undefined {
  try {
    return window.localStorage.getItem(`${KEY_PREFIX}${username}`) ?? undefined;
  } catch {
    return undefined;
  }
}

export function setStoredReadToken(username: string, token: string): void {
  try {
    window.localStorage.setItem(`${KEY_PREFIX}${username}`, token);
  } catch {
    // localStorage unavailable - losing the persisted token is an
    // acceptable degradation; throwing here would abort the whole capture.
  }
}
