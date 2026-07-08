import axios, { AxiosError } from "axios";

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

apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    const status = error.response?.status ?? 0;
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
