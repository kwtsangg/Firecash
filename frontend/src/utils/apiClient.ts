const TOKEN_KEY = "firecash.jwt";
const CACHE_PREFIX = "firecash.cache:";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

type UnauthorizedHandler = (() => void) | null;

let unauthorizedHandler: UnauthorizedHandler = null;

export class ApiError extends Error {
  status: number;
  details?: unknown;
  retryAfterSeconds?: number;

  constructor(status: number, message: string, details?: unknown, retryAfterSeconds?: number) {
    super(message);
    this.status = status;
    this.details = details;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function buildUrl(path: string) {
  if (!API_BASE_URL) {
    return path;
  }
  if (API_BASE_URL.endsWith("/") && path.startsWith("/")) {
    return `${API_BASE_URL.slice(0, -1)}${path}`;
  }
  if (!API_BASE_URL.endsWith("/") && !path.startsWith("/")) {
    return `${API_BASE_URL}/${path}`;
  }
  return `${API_BASE_URL}${path}`;
}

export function setUnauthorizedHandler(handler: UnauthorizedHandler) {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) {
      unauthorizedHandler = null;
    }
  };
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function parseResponseBody(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const seconds = Number.parseInt(value, 10);
  if (!Number.isNaN(seconds)) {
    return seconds;
  }
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) {
    const diffSeconds = Math.ceil((dateMs - Date.now()) / 1000);
    return diffSeconds > 0 ? diffSeconds : 0;
  }
  return undefined;
}

function buildCacheKey(path: string) {
  return `${CACHE_PREFIX}${path}`;
}

function notifyOfflineCache(path: string) {
  window.dispatchEvent(
    new CustomEvent("firecash:offline-cache", { detail: { path, timestamp: Date.now() } }),
  );
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  config: { skipAuth?: boolean } = {},
) {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (!config.skipAuth) {
    const token = getToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const cacheKey = buildCacheKey(path);
  const method = (options.method ?? "GET").toUpperCase();
  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      ...options,
      headers,
    });
  } catch (error) {
    if (method === "GET") {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        notifyOfflineCache(path);
        return JSON.parse(cached) as T;
      }
    }
    throw error;
  }

  const data = await parseResponseBody(response);

  if (!response.ok) {
    const retryAfterSeconds = parseRetryAfter(response.headers.get("Retry-After"));
    const message =
      (typeof data === "object" && data && "message" in data && (data as { message: string }).message) ||
      (typeof data === "string" ? data : "Request failed");
    if (response.status === 401) {
      clearToken();
      unauthorizedHandler?.();
    }
    throw new ApiError(response.status, message, data, retryAfterSeconds);
  }

  if (method === "GET") {
    try {
      localStorage.setItem(cacheKey, JSON.stringify(data));
    } catch (error) {
      // Ignore cache errors.
    }
  }

  return data as T;
}

export function get<T>(path: string, options?: RequestInit) {
  return apiRequest<T>(path, { ...options, method: "GET" });
}

export function post<T>(path: string, body?: unknown, options?: RequestInit, config?: { skipAuth?: boolean }) {
  return apiRequest<T>(
    path,
    {
      ...options,
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    config,
  );
}

export function put<T>(path: string, body?: unknown, options?: RequestInit, config?: { skipAuth?: boolean }) {
  return apiRequest<T>(
    path,
    {
      ...options,
      method: "PUT",
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    config,
  );
}

export function del<T>(path: string, options?: RequestInit, config?: { skipAuth?: boolean }) {
  return apiRequest<T>(
    path,
    {
      ...options,
      method: "DELETE",
    },
    config,
  );
}
