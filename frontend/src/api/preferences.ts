import { get, put } from "../utils/apiClient";

type PreferencesResponse = {
  categories?: string[];
  strategies?: string[];
  holding_strategies?: Record<string, string>;
  retention_days?: number;
  export_redaction?: string;
  asset_refresh_cadence?: string;
  asset_data_source?: string;
};

export type Preferences = {
  categories: string[];
  strategies: string[];
  holdingStrategies: Record<string, string>;
  retentionDays?: number | null;
  exportRedaction: string;
  assetRefreshCadence: string;
  assetDataSource: string;
};

export const DEFAULT_CATEGORIES = ["General", "Housing", "Investing", "Lifestyle", "Bills"];
export const DEFAULT_STRATEGIES = ["Long Term", "Short Term", "Hedging"];

const normalizeList = (items: string[] | undefined, fallback: string[]) => {
  const normalized = (items ?? [])
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return normalized.length ? Array.from(new Set(normalized)) : fallback;
};

const normalizeHoldingStrategies = (value: Record<string, string> | undefined) => {
  if (!value) {
    return {};
  }
  return Object.entries(value).reduce<Record<string, string>>((acc, [key, val]) => {
    if (typeof key === "string" && typeof val === "string" && key.trim() && val.trim()) {
      acc[key] = val.trim();
    }
    return acc;
  }, {});
};

export async function fetchPreferences(): Promise<Preferences> {
  const response = await get<PreferencesResponse>("/api/preferences");
  return {
    categories: normalizeList(response.categories, DEFAULT_CATEGORIES),
    strategies: normalizeList(response.strategies, DEFAULT_STRATEGIES),
    holdingStrategies: normalizeHoldingStrategies(response.holding_strategies),
    retentionDays: response.retention_days ?? null,
    exportRedaction: response.export_redaction ?? "none",
    assetRefreshCadence: response.asset_refresh_cadence ?? "daily",
    assetDataSource: response.asset_data_source ?? "stooq",
  };
}

export async function updatePreferences(update: Partial<Preferences>): Promise<Preferences> {
  const payload: PreferencesResponse = {};
  if (update.categories) {
    payload.categories = update.categories;
  }
  if (update.strategies) {
    payload.strategies = update.strategies;
  }
  if (update.holdingStrategies) {
    payload.holding_strategies = update.holdingStrategies;
  }
  if (update.retentionDays !== undefined) {
    payload.retention_days = update.retentionDays ?? 0;
  }
  if (update.exportRedaction) {
    payload.export_redaction = update.exportRedaction;
  }
  if (update.assetRefreshCadence) {
    payload.asset_refresh_cadence = update.assetRefreshCadence;
  }
  if (update.assetDataSource) {
    payload.asset_data_source = update.assetDataSource;
  }
  const response = await put<PreferencesResponse>("/api/preferences", payload);
  return {
    categories: normalizeList(response.categories, DEFAULT_CATEGORIES),
    strategies: normalizeList(response.strategies, DEFAULT_STRATEGIES),
    holdingStrategies: normalizeHoldingStrategies(response.holding_strategies),
    retentionDays: response.retention_days ?? null,
    exportRedaction: response.export_redaction ?? "none",
    assetRefreshCadence: response.asset_refresh_cadence ?? "daily",
    assetDataSource: response.asset_data_source ?? "stooq",
  };
}
