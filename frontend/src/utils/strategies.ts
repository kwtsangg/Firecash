const STRATEGIES_KEY = "firecash.stockStrategies";
const HOLDING_STRATEGIES_KEY = "firecash.holdingStrategies";

const DEFAULT_STRATEGIES = ["Long Term", "Short Term", "Hedging"];

export function readStrategies() {
  if (typeof localStorage === "undefined") {
    return DEFAULT_STRATEGIES;
  }
  try {
    const stored = localStorage.getItem(STRATEGIES_KEY);
    if (!stored) {
      return DEFAULT_STRATEGIES;
    }
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return DEFAULT_STRATEGIES;
  } catch {
    return DEFAULT_STRATEGIES;
  }
}

export function storeStrategies(strategies: string[]) {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(STRATEGIES_KEY, JSON.stringify(strategies));
}

export function readHoldingStrategies() {
  if (typeof localStorage === "undefined") {
    return {};
  }
  try {
    const stored = localStorage.getItem(HOLDING_STRATEGIES_KEY);
    if (!stored) {
      return {};
    }
    const parsed = JSON.parse(stored);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, string>;
    }
    return {};
  } catch {
    return {};
  }
}

export function storeHoldingStrategies(strategies: Record<string, string>) {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(HOLDING_STRATEGIES_KEY, JSON.stringify(strategies));
}
