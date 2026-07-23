// Shared by apiConfig.js's axios interceptor (covers apiConfig.get/post/put/patch/delete
// calls) and the window.fetch guard installed in _app.js (covers the handful of API
// modules — userApi, draw-frame, dashboardApi, etc. — that call fetch() directly instead
// of going through apiConfig). Keep these keys in sync with authSlice.js's storage keys.
const AUTH_STORAGE_KEYS = ["token", "authUser", "authUserId", "accessibleScreens", "accessByDepartment"];

let isHandlingExpiry = false;

export const handleSessionExpired = () => {
  if (typeof window === "undefined" || isHandlingExpiry) {
    return;
  }
  isHandlingExpiry = true;

  AUTH_STORAGE_KEYS.forEach((key) => {
    window.sessionStorage.removeItem(key);
    window.localStorage.removeItem(key);
  });

  if (window.location.pathname === "/") {
    window.location.reload();
  } else {
    window.location.href = "/";
  }
};

const requestHadAuthHeader = (headers) => {
  if (!headers) return false;
  if (typeof headers.get === "function") {
    return Boolean(headers.get("authorization") || headers.get("Authorization"));
  }
  return Boolean(headers.Authorization || headers.authorization);
};

// A 401 only means "session expired" when the request actually sent a bearer token
// (e.g. login itself returns 401 for a wrong password, with no Authorization header —
// that must NOT trigger a forced redirect away from the login screen).
export const installAuthFetchGuard = () => {
  if (typeof window === "undefined" || window.__authFetchGuardInstalled) {
    return;
  }
  window.__authFetchGuardInstalled = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const response = await originalFetch(input, init);

    if (response.status === 401 && requestHadAuthHeader(init?.headers)) {
      handleSessionExpired();
    }

    return response;
  };
};
