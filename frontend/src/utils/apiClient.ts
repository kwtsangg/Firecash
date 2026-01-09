const TOKEN_KEY = "firecash.jwt";
const CACHE_PREFIX = "firecash.cache:";
const DEFAULT_CACHE_TTL_MS = 2000;

type CacheEntry<T> = {
  timestamp: number;
  data: T;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

type UnauthorizedHandler = (() => void) | null;

let unauthorizedHandler: UnauthorizedHandler = null;
const inflightRequests = new Map<string, Promise<unknown>>();
const rateLimitUntilByPath = new Map<string, number>();

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

function readCache<T>(cacheKey: string): CacheEntry<T> | null {
  const cached = localStorage.getItem(cacheKey);
  if (!cached) {
    return null;
  }
  try {
    const parsed = JSON.parse(cached) as CacheEntry<T> | T;
    if (parsed && typeof parsed === "object" && "data" in parsed && "timestamp" in parsed) {
      return parsed as CacheEntry<T>;
    }
    return { timestamp: 0, data: parsed as T };
  } catch (error) {
    return null;
  }
}

function writeCache<T>(cacheKey: string, data: T) {
  const entry: CacheEntry<T> = { timestamp: Date.now(), data };
  localStorage.setItem(cacheKey, JSON.stringify(entry));
}

function notifyOfflineCache(path: string) {
  window.dispatchEvent(
    new CustomEvent("firecash:offline-cache", { detail: { path, timestamp: Date.now() } }),
  );
}

function notifyRateLimitCache(path: string) {
  window.dispatchEvent(
    new CustomEvent("firecash:rate-limit-cache", { detail: { path, timestamp: Date.now() } }),
  );
}

function waitForRateLimit(path: string) {
  const until = rateLimitUntilByPath.get(path);
  if (!until) {
    return Promise.resolve();
  }
  const delayMs = until - Date.now();
  if (delayMs <= 0) {
    rateLimitUntilByPath.delete(path);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    window.setTimeout(() => {
      rateLimitUntilByPath.delete(path);
      resolve(null);
    }, delayMs);
  });
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  config: { skipAuth?: boolean; cacheTtlMs?: number } = {},
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
  const cacheTtlMs = config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  if (method === "GET") {
    const cachedEntry = readCache<T>(cacheKey);
    if (cachedEntry && cacheTtlMs > 0 && Date.now() - cachedEntry.timestamp <= cacheTtlMs) {
      return cachedEntry.data;
    }
  }
  if (method === "GET" && inflightRequests.has(cacheKey)) {
    return inflightRequests.get(cacheKey) as Promise<T>;
  }
  await waitForRateLimit(path);

  let response: Response;
  const runRequest = async () => {
    try {
      response = await fetch(buildUrl(path), {
        ...options,
        headers,
      });
    } catch (error) {
      if (method === "GET") {
        const cachedEntry = readCache<T>(cacheKey);
        if (cachedEntry) {
          notifyOfflineCache(path);
          return cachedEntry.data;
        }
      }
      throw error;
    }

    const data = await parseResponseBody(response);

    if (!response.ok) {
      const retryAfterSeconds = parseRetryAfter(response.headers.get("Retry-After"));
      if (response.status === 429 && retryAfterSeconds !== undefined) {
        rateLimitUntilByPath.set(path, Date.now() + retryAfterSeconds * 1000);
      }
      if (response.status === 429 && method === "GET") {
        const cachedEntry = readCache<T>(cacheKey);
        if (cachedEntry) {
          notifyRateLimitCache(path);
          return cachedEntry.data;
        }
      }
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
        writeCache(cacheKey, data);
      } catch (error) {
        // Ignore cache errors.
      }
    }

    return data as T;
  };

  if (method !== "GET") {
    return runRequest();
  }

  const requestPromise = runRequest().finally(() => {
    inflightRequests.delete(cacheKey);
  });
  inflightRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

export function get<T>(path: string, options?: RequestInit, config?: { cacheTtlMs?: number }) {
  return apiRequest<T>(path, { ...options, method: "GET" }, config);
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
