import { get } from "../utils/apiClient";

export type AuditLogEntry = {
  id: string;
  user_id?: string | null;
  user_name?: string | null;
  user_email?: string | null;
  action: string;
  context: Record<string, unknown>;
  created_at: string;
};

export async function fetchAuditLogs(limit = 100, offset = 0) {
  return get<AuditLogEntry[]>(`/api/admin/audit-logs?limit=${limit}&offset=${offset}`);
}
