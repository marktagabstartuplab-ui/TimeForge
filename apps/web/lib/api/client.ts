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

export function setAccessToken(token: string | null): void {
  accessToken = token;
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
      .post<{ accessToken: string }>(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/refresh`,
        {},
        { withCredentials: true },
      )
      .then(({ data }) => {
        setAccessToken(data.accessToken);
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
        // recovered. Clear the token and let AuthProvider redirect to /login.
        setAccessToken(null);
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
