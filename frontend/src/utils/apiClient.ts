const TOKEN_KEY = "firecash.jwt";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

type UnauthorizedHandler = (() => void) | null;

let unauthorizedHandler: UnauthorizedHandler = null;

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
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

  const response = await fetch(buildUrl(path), {
    ...options,
    headers,
  });

  const data = await parseResponseBody(response);

  if (!response.ok) {
    const message =
      (typeof data === "object" && data && "message" in data && (data as { message: string }).message) ||
      (typeof data === "string" ? data : "Request failed");
    if (response.status === 401) {
      clearToken();
      unauthorizedHandler?.();
    }
    throw new ApiError(response.status, message, data);
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
