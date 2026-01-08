import { get, post } from "../utils/apiClient";

export type BackupMetadata = {
  schema_version: number;
  exported_at: string;
  format: "json" | "csv";
  include_pii: boolean;
};

export type BackupPayload = {
  metadata: BackupMetadata;
  accounts: Array<{
    id: string;
    name: string;
    currency_code: string;
    created_at: string;
  }>;
  account_groups: Array<{ id: string; name: string }>;
  account_group_members: Array<{ group_id: string; account_id: string }>;
  transactions: Array<{
    id: string;
    account_id: string;
    amount: number;
    currency_code: string;
    transaction_type: string;
    category: string;
    merchant?: string | null;
    description?: string | null;
    occurred_at: string;
  }>;
  recurring_transactions: Array<{
    id: string;
    account_id: string;
    amount: number;
    currency_code: string;
    transaction_type: string;
    description?: string | null;
    interval_days: number;
    next_occurs_at: string;
    is_enabled: boolean;
  }>;
  assets: Array<{
    id: string;
    account_id: string;
    symbol: string;
    asset_type: string;
    quantity: number;
    currency_code: string;
    created_at: string;
  }>;
  preferences: Array<{ key: string; value: unknown }>;
};

export async function exportBackup(format: "json" | "csv", includePii: boolean) {
  if (format === "csv") {
    const csv = await get<string>(`/api/backup/export?format=csv&include_pii=${includePii}`, {
      headers: { Accept: "text/csv" },
    });
    return new Blob([csv], { type: "text/csv" });
  }
  return get<BackupPayload>(`/api/backup/export?format=json&include_pii=${includePii}`);
}

export async function restoreBackup(payload: BackupPayload) {
  return post("/api/backup/restore", { confirm: true, payload });
}
