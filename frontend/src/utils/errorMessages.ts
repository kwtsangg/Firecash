import { ApiError } from "./apiClient";

export function getFriendlyErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "Your session has expired. Please log in again.";
    }
    if (error.status === 403) {
      return "You don’t have permission to do that.";
    }
    if (error.status === 404) {
      return "We couldn’t find what you were looking for.";
    }
    if (error.status >= 500) {
      return fallback;
    }
  }
  return fallback;
}
