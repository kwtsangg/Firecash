import { get, post } from "../utils/apiClient";

export type ApiTokenSummary = {
  id: string;
  name: string;
  token_prefix?: string | null;
  is_read_only: boolean;
  created_at: string;
  last_used_at?: string | null;
  revoked_at?: string | null;
  expires_at?: string | null;
};

export type ApiTokenCreated = {
  id: string;
  token: string;
  token_prefix: string;
  is_read_only: boolean;
  created_at: string;
  expires_at?: string | null;
};

export async function fetchApiTokens() {
  return get<ApiTokenSummary[]>("/api/tokens");
}

export async function createApiToken(payload: {
  name: string;
  is_read_only?: boolean;
  expires_at?: string | null;
}) {
  return post<ApiTokenCreated>("/api/tokens", payload);
}

export async function revokeApiToken(tokenId: string) {
  return post(`/api/tokens/${tokenId}/revoke`);
}
