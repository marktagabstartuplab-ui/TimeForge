import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: string[];
  };
}

export class ApiError extends Error {
  code: string;
  status: number;
  details?: string[];

  constructor(status: number, code: string, message: string, details?: string[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const apiClient = axios.create({
  baseURL: `${process.env.NEXT_PUBLIC_API_URL}/api/v1`,
  withCredentials: true,
});

// In-memory access token, set by the AuthProvider on login. Kept out of
// localStorage on purpose; the refresh token stays in an httpOnly cookie.
let accessToken: string | null = null;

// Body-based refresh token fallback — when the browser doesn't send the
// cross-site httpOnly cookie (e.g. Safari ITP, or a frontend/backend domain
// split like Vercel + Railway), the cookie-based refresh fails. We keep the
// rotated refresh token and send it in the request body instead. Backed by
// sessionStorage (not localStorage) so it survives a hard reload of the same
// tab — otherwise refreshing the page logs the user out whenever the cookie
// path is unavailable — while still dying with the tab. The httpOnly cookie
// remains the primary mechanism; tokens rotate on every refresh and reuse is
// detected server-side.
const REFRESH_FALLBACK_KEY = "tf.refresh-fallback";

function readStoredRefreshToken(): string | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage.getItem(REFRESH_FALLBACK_KEY) : null;
  } catch {
    return null; // storage disabled — memory-only fallback still applies
  }
}

let refreshTokenMemory: string | null = readStoredRefreshToken();

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setRefreshTokenMemory(token: string | null): void {
  refreshTokenMemory = token;
  try {
    if (typeof window === "undefined") return;
    if (token) window.sessionStorage.setItem(REFRESH_FALLBACK_KEY, token);
    else window.sessionStorage.removeItem(REFRESH_FALLBACK_KEY);
  } catch {
    // Storage unavailable — in-memory fallback still works for this page life.
  }
}

/** The current body-fallback refresh token (cookie remains primary). */
export function getRefreshTokenMemory(): string | null {
  return refreshTokenMemory;
}

/**
 * Called when the refresh token itself is invalid/expired/reused — the
 * session is unrecoverable and the user must log in again. Registered by
 * AuthProvider (a plain module can't call useRouter()/clear React state
 * directly), mirroring the setAccessToken() bridge above.
 */
type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler | null = null;

export function setSessionExpiredHandler(handler: SessionExpiredHandler | null): void {
  onSessionExpired = handler;
}

apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Endpoints where a 401 means "bad credentials" / "no session yet", not
// "session expired mid-request" — must never trigger a refresh-and-retry
// (refreshing off the /auth/refresh call's own failure would recurse).
const NO_REFRESH_PATHS = ["/auth/login", "/auth/refresh", "/auth/register", "/auth/logout"];

function isNoRefreshPath(url?: string): boolean {
  return Boolean(url) && NO_REFRESH_PATHS.some((p) => url!.includes(p));
}

// Single in-flight refresh promise shared by every request that hits a 401
// concurrently — this *is* the mutex: everyone awaits the same promise
// instead of firing their own /auth/refresh call.
let refreshPromise: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post<{ accessToken: string; refreshToken?: string }>(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/refresh`,
        // Send the refresh token in the body as a fallback for when the
        // httpOnly cookie isn't sent (cross-site cookie blocking).
        refreshTokenMemory ? { refreshToken: refreshTokenMemory } : {},
        { withCredentials: true },
      )
      .then(({ data }) => {
        setAccessToken(data.accessToken);
        // Keep the rotated refresh token for future body-based fallbacks.
        if (data.refreshToken) {
          setRefreshTokenMemory(data.refreshToken);
        }
        return data.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const status = error.response?.status ?? 0;
    const config = error.config as RetriableConfig | undefined;

    if (status === 401 && config && !config._retried && !isNoRefreshPath(config.url)) {
      config._retried = true;
      try {
        const newToken = await refreshAccessToken();
        config.headers = config.headers ?? {};
        config.headers.Authorization = `Bearer ${newToken}`;
        return apiClient.request(config);
      } catch {
        // Refresh token invalid/expired/reused — the session can't be
        // recovered. Clear the tokens and let AuthProvider redirect to /login.
        setAccessToken(null);
        setRefreshTokenMemory(null);
        onSessionExpired?.();
      }
    }

    const body = error.response?.data?.error;
    return Promise.reject(
      new ApiError(
        status,
        body?.code ?? "UNKNOWN",
        body?.message ?? error.message ?? "Something went wrong",
        body?.details,
      ),
    );
  },
);
