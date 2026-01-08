import { get } from "../utils/apiClient";

export type TransactionFilters = {
  category?: string;
  merchant?: string;
};

export async function fetchTransactions<T = unknown>(filters: TransactionFilters = {}) {
  const params = new URLSearchParams();
  if (filters.category) {
    params.set("category", filters.category);
  }
  if (filters.merchant) {
    params.set("merchant", filters.merchant);
  }
  const query = params.toString();
  return get<T>(`/api/transactions${query ? `?${query}` : ""}`);
}
