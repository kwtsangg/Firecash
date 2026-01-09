import { get } from "../utils/apiClient";

export type Account = {
  id: string;
  name: string;
  currency_code: string;
};

export type Transaction = {
  id: string;
  account_id: string;
  amount: number;
  currency_code: string;
  transaction_type: string;
  description: string | null;
  occurred_at: string;
};

export type TotalsResponse = {
  total: number;
  currency_code: string;
  totals_by_currency: { currency_code: string; total: number }[];
};

export type ReportSnapshot = {
  accounts: Account[];
  transactions: Transaction[];
  totals: TotalsResponse;
};

export type DailyTransactionTotal = {
  date: string;
  currency_code: string;
  total: number;
};

export async function fetchReportSnapshot(): Promise<ReportSnapshot> {
  const [accounts, transactions, totals] = await Promise.all([
    get<Account[]>("/api/accounts"),
    get<Transaction[]>("/api/transactions"),
    get<TotalsResponse>("/api/totals"),
  ]);

  return { accounts, transactions, totals };
}

type DailyTotalsParams = {
  start_date?: string;
  end_date?: string;
  account_id?: string;
  account_group_id?: string;
  currency_code?: string;
};

export async function fetchDailyExpenseTotals(
  params: DailyTotalsParams,
): Promise<DailyTransactionTotal[]> {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      searchParams.set(key, value);
    }
  });
  const query = searchParams.toString();
  const path = query ? `/api/transactions/daily-totals?${query}` : "/api/transactions/daily-totals";
  return get<DailyTransactionTotal[]>(path);
}
