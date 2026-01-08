import { get, post } from "../utils/apiClient";

export type IntegrationSummary = {
  id: string;
  provider_key: string;
  display_name: string;
  status: string;
  last_sync_at?: string | null;
  created_at: string;
  data_source?: string | null;
  refresh_cadence?: string | null;
};

export type IntegrationLogEntry = {
  id: string;
  level: string;
  message: string;
  created_at: string;
};

export type IntegrationProviderCatalog = {
  key: string;
  display_name: string;
  description: string;
  data_source: string;
  refresh_cadence: string;
  supports_read_only: boolean;
};

export async function fetchIntegrations() {
  return get<IntegrationSummary[]>("/api/integrations");
}

export async function fetchIntegrationCatalog() {
  return get<{ providers: IntegrationProviderCatalog[] }>("/api/integrations/catalog");
}

export async function createIntegration(payload: {
  provider_key: string;
  display_name: string;
}) {
  return post<IntegrationSummary>("/api/integrations", payload);
}

export async function fetchIntegrationLogs(integrationId: string) {
  return get<IntegrationLogEntry[]>(`/api/integrations/${integrationId}/logs`);
}
