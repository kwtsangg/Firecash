import { useCallback, useEffect, useMemo, useState } from "react";
import ActionToast, { ActionToastData } from "../components/ActionToast";
import { BarChart, DonutChart, LineChart } from "../components/Charts";
import DateRangePicker, { DateRange } from "../components/DateRangePicker";
import EmptyState from "../components/EmptyState";
import KpiCard from "../components/KpiCard";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Modal from "../components/Modal";
import { useCurrency } from "../components/CurrencyContext";
import { useSelection } from "../components/SelectionContext";
import { fetchPreferences } from "../api/preferences";
import { ApiError, get, post } from "../utils/apiClient";
import { convertAmount, formatCurrency, supportedCurrencies } from "../utils/currency";
import { formatDateDisplay, getDefaultRange, toDateInputValue, toIsoDateTime } from "../utils/date";
import { pageTitles } from "../utils/pageTitles";
import { usePageMeta } from "../utils/pageMeta";

type Account = {
  id: string;
  name: string;
  currency_code: string;
};

type AccountGroup = {
  id: string;
  name: string;
};

type AccountGroupMembership = {
  account_id: string;
  group_id: string;
};

type Asset = {
  id: string;
  account_id: string;
  symbol: string;
  asset_type: string;
  quantity: number;
  currency_code: string;
};

type Transaction = {
  id: string;
  account_id: string;
  amount: number;
  currency_code: string;
  transaction_type: string;
  category: string;
  merchant: string | null;
  description: string | null;
  occurred_at: string;
};

type HistoryPoint = {
  date: string;
  value: number;
};

type TotalsResponse = {
  total: number;
  currency_code: string;
  totals_by_currency: { currency_code: string; total: number }[];
};

type AssetPriceStatus = {
  missing_count: number;
  total_count: number;
};

type FxRate = {
  base_currency: string;
  quote_currency: string;
  rate: number;
  recorded_on: string;
};

type DashboardResponse = {
  accounts: Account[];
  groups: AccountGroup[];
  memberships: AccountGroupMembership[];
  assets: Asset[];
  transactions: Transaction[];
  history: HistoryPoint[];
  totals: TotalsResponse | null;
  price_status: AssetPriceStatus | null;
  fx_rates: FxRate[];
};

type AssetDisplay = {
  name: string;
  amount: number;
  currency: string;
  account: string;
};

type TransactionDisplay = {
  id: string;
  account: string;
  type: string;
  category: string;
  amount: number;
  currency: string;
  date: string;
  notes: string;
};

const chartPalette = ["#7f5bff", "#5b6cff", "#43d6b1", "#f7b955", "#ff7aa2"];

export default function DashboardPage() {
  usePageMeta({ title: pageTitles.dashboard });
  const { currency: displayCurrency } = useCurrency();
  const { account: selectedAccount, group: selectedGroup } = useSelection();
  const [range, setRange] = useState<DateRange>(() => getDefaultRange(90));
  const [toast, setToast] = useState<ActionToastData | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [isTransactionOpen, setIsTransactionOpen] = useState(false);
  const [transactionAccount, setTransactionAccount] = useState("");
  const [transactionType, setTransactionType] = useState("Income");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState(() => toDateInputValue(new Date()));
  const [transactionNotes, setTransactionNotes] = useState("");
  const [transactionCurrency, setTransactionCurrency] = useState("USD");
  const [categories, setCategories] = useState<string[]>([]);
  const [transactionCategory, setTransactionCategory] = useState("General");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [memberships, setMemberships] = useState<AccountGroupMembership[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [transactions, setTransactions] = useState<TransactionDisplay[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [totals, setTotals] = useState<TotalsResponse | null>(null);
  const [priceStatus, setPriceStatus] = useState<AssetPriceStatus | null>(null);
  const [fxRates, setFxRates] = useState<FxRate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFiltering, setIsFiltering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string[]>([]);
  const [isPreferencesLoading, setIsPreferencesLoading] = useState(true);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);

  const showToast = useCallback((title: string, description?: string) => {
    setToast({ title, description });
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string }>).detail;
      if (detail?.path === "/api/dashboard") {
        showToast(
          "Using cached dashboard data",
          "We are pacing requests to avoid rate limits. We will refresh shortly.",
        );
      }
    };
    window.addEventListener("firecash:rate-limit-cache", handler);
    return () => window.removeEventListener("firecash:rate-limit-cache", handler);
  }, [showToast]);

  const formatFailureReason = useCallback((error: unknown) => {
    if (error instanceof ApiError) {
      const retryNotice =
        error.status === 429 && typeof error.retryAfterSeconds === "number"
          ? ` Retry in ${error.retryAfterSeconds}s.`
          : "";
      return `HTTP ${error.status} — ${error.message}.${retryNotice}`.trim();
    }
    if (error instanceof Error) {
      return error.message;
    }
    return "Unknown error";
  }, []);

  const isRecord = useCallback(
    (value: unknown): value is Record<string, unknown> =>
      typeof value === "object" && value !== null,
    [],
  );

  const loadData = useCallback(async () => {
    let isMounted = true;
    const run = async () => {
      setIsLoading(true);
      setError(null);
      setErrorDetails([]);
      try {
        const dashboardResponse = await get<DashboardResponse>("/api/dashboard");
        const accountsResponse = Array.isArray(dashboardResponse.accounts)
          ? dashboardResponse.accounts
          : [];
        const groupsResponse = Array.isArray(dashboardResponse.groups)
          ? dashboardResponse.groups
          : [];
        const membershipResponse = Array.isArray(dashboardResponse.memberships)
          ? dashboardResponse.memberships
          : [];
        const assetsResponse = Array.isArray(dashboardResponse.assets)
          ? dashboardResponse.assets
          : [];
        const transactionsResponse = Array.isArray(dashboardResponse.transactions)
          ? dashboardResponse.transactions
          : [];
        const historyResponse = Array.isArray(dashboardResponse.history)
          ? dashboardResponse.history
          : [];
        const totalsResponse = isRecord(dashboardResponse.totals)
          ? dashboardResponse.totals
          : null;
        const priceStatusResponse = isRecord(dashboardResponse.price_status)
          ? dashboardResponse.price_status
          : null;
        const normalizedFxRates = Array.isArray(dashboardResponse.fx_rates)
          ? dashboardResponse.fx_rates
          : [];

        if (!isMounted) {
          return;
        }

        const accountMap = new Map(accountsResponse.map((item) => [item.id, item.name]));
        const mappedTransactions = transactionsResponse.map((item) => ({
          id: item.id,
          account: accountMap.get(item.account_id) ?? "Unknown",
          type: item.transaction_type === "income" ? "Income" : "Expense",
          amount: item.amount,
          currency: item.currency_code,
          date: item.occurred_at.split("T")[0],
          category: item.category ?? "Uncategorized",
          notes: item.description ?? "Manual entry",
        }));

        setAccounts(accountsResponse);
        setGroups(groupsResponse);
        setMemberships(membershipResponse);
        setAssets(assetsResponse);
        setTransactions(mappedTransactions);
        setHistory(historyResponse);
        setTotals(totalsResponse);
        setPriceStatus(priceStatusResponse);
        setFxRates(normalizedFxRates);
        setTransactionAccount(accountsResponse[0]?.id ?? "");
      } catch (err) {
        if (isMounted) {
          let retryMessage: string | null = null;
          if (err instanceof ApiError && err.status === 429 && err.retryAfterSeconds !== undefined) {
            retryMessage = `Retry in ${err.retryAfterSeconds}s.`;
          }
          setError("Unable to load dashboard data.");
          setErrorDetails([
            "We hit an unexpected error while loading the dashboard.",
            formatFailureReason(err),
            ...(retryMessage ? [retryMessage] : []),
          ]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    await run();
    return () => {
      isMounted = false;
    };
  }, [formatFailureReason, isRecord]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    loadData().then((result) => {
      cleanup = result;
    });
    return () => {
      cleanup?.();
    };
  }, [loadData]);

  const loadPreferences = useCallback(async () => {
    setIsPreferencesLoading(true);
    setPreferencesError(null);
    try {
      const response = await fetchPreferences();
      setCategories(response.categories);
      setTransactionCategory((prev) =>
        response.categories.includes(prev) ? prev : response.categories[0] ?? "General",
      );
    } catch (err) {
      setPreferencesError("Unable to load categories right now.");
    } finally {
      setIsPreferencesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  useEffect(() => {
    if (!categories.includes(transactionCategory)) {
      setTransactionCategory(categories[0] ?? "General");
    }
  }, [categories, transactionCategory]);

  useEffect(() => {
    if (isTransactionOpen) {
      loadPreferences();
    }
  }, [isTransactionOpen, loadPreferences]);

  useEffect(() => {
    if (isLoading) {
      return;
    }
    setIsFiltering(true);
    const timer = window.setTimeout(() => setIsFiltering(false), 350);
    return () => window.clearTimeout(timer);
  }, [isLoading, range.from, range.to, selectedAccount, selectedGroup]);

  const accountOptions = useMemo(
    () => accounts.map((item) => ({ id: item.id, name: item.name })),
    [accounts],
  );

  const baseAssets = useMemo<AssetDisplay[]>(
    () =>
      assets.map((asset) => ({
        name: asset.symbol,
        amount: asset.quantity,
        currency: asset.currency_code,
        account: accounts.find((account) => account.id === asset.account_id)?.name ?? "Unknown",
      })),
    [assets, accounts],
  );

  const accountGroups: Record<string, string> = useMemo(() => {
    const groupNameById = new Map(groups.map((group) => [group.id, group.name]));
    const accountGroupById = memberships.reduce<Record<string, string>>((acc, membership) => {
      const groupName = groupNameById.get(membership.group_id);
      if (groupName) {
        acc[membership.account_id] = groupName;
      }
      return acc;
    }, {});
    return accounts.reduce<Record<string, string>>((acc, account) => {
      acc[account.name] = accountGroupById[account.id] ?? "Ungrouped";
      return acc;
    }, {});
  }, [accounts, groups, memberships]);

  const matchesSelection = (account: string) =>
    (selectedAccount === "All Accounts" || selectedAccount === account) &&
    (selectedGroup === "All Groups" || accountGroups[account] === selectedGroup);

  const filteredAssets = baseAssets.filter((asset) => matchesSelection(asset.account));
  const filteredTransactions = transactions.filter((transaction) =>
    matchesSelection(transaction.account),
  );

  const selectionScale = Math.max(0.4, filteredAssets.length / baseAssets.length || 1);

  const totalAssets = totals
    ? convertAmount(totals.total, totals.currency_code, displayCurrency)
    : filteredAssets.reduce(
        (sum, asset) => sum + convertAmount(asset.amount, asset.currency, displayCurrency),
        0,
      );

  const netIncome = filteredTransactions.reduce((sum, transaction) => {
    const signedAmount = transaction.type === "Expense" ? -transaction.amount : transaction.amount;
    return sum + convertAmount(signedAmount, transaction.currency, displayCurrency);
  }, 0);

  const lineSeries = useMemo(() => {
    const fromDate = new Date(range.from);
    const toDate = new Date(range.to);
    const filtered = history.filter((point) => {
      const date = new Date(point.date);
      return date >= fromDate && date <= toDate;
    });
    const series = filtered.length > 0 ? filtered : history;
    if (series.length === 0) {
      return [];
    }
    const netChange = series.reduce((sum, point) => sum + point.value, 0);
    const scaledTotalAssets = totalAssets * selectionScale;
    const baseline = scaledTotalAssets - netChange;
    let running = 0;
    return series.map((point) => {
      running += point.value;
      return {
        date: point.date,
        value: Math.round((baseline + running) * (1 + refreshTick * 0.01)),
      };
    });
  }, [history, range.from, range.to, refreshTick, selectionScale, totalAssets]);

  const barValues = useMemo(() => {
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
    return days.map((day) => {
      const label = weekdays[day.getDay()];
      const dateKey = day.toISOString().split("T")[0];
      const total = filteredTransactions.reduce((sum, transaction) => {
        if (transaction.date !== dateKey) {
          return sum;
        }
        const signedAmount = transaction.type === "Expense" ? -transaction.amount : transaction.amount;
        return sum + signedAmount;
      }, 0);
      return { label, value: Math.round(total) };
    });
  }, [filteredTransactions]);

  const donutValues = useMemo(() => {
    const totalsByType = new Map<string, number>();
    filteredTransactions.forEach((transaction) => {
      const value = Math.abs(
        convertAmount(transaction.amount, transaction.currency, displayCurrency),
      );
      totalsByType.set(
        transaction.type,
        (totalsByType.get(transaction.type) ?? 0) + value,
      );
    });
    return Array.from(totalsByType.entries()).map(([label, value], index) => ({
      label,
      value,
      color: chartPalette[index % chartPalette.length],
    }));
  }, [displayCurrency, filteredTransactions]);

  const latestFxRates = useMemo(() => {
    const latestByCurrency = new Map<string, FxRate>();
    fxRates.forEach((rate) => {
      const existing = latestByCurrency.get(rate.quote_currency);
      if (!existing || rate.recorded_on > existing.recorded_on) {
        latestByCurrency.set(rate.quote_currency, rate);
      }
    });
    return Array.from(latestByCurrency.values())
      .filter((rate) => rate.base_currency === "USD")
      .sort((a, b) => a.quote_currency.localeCompare(b.quote_currency));
  }, [fxRates]);


  const handleRefreshPrices = async () => {
    try {
      await post<{ updated: number }>("/api/assets/refresh-prices", {});
      const results = await Promise.allSettled([
        get<TotalsResponse>("/api/totals"),
        get<AssetPriceStatus>("/api/assets/price-status"),
        get<FxRate[]>("/api/fx-rates"),
      ]);
      const failures: string[] = [];
      const resolve = <T,>(result: PromiseSettledResult<T>, fallback: T, label: string) => {
        if (result.status === "fulfilled") {
          return result.value;
        }
        failures.push(label);
        return fallback;
      };
      const totalsResponse = resolve(results[0], null as TotalsResponse | null, "totals");
      const priceStatusResponse = resolve(
        results[1],
        null as AssetPriceStatus | null,
        "price status",
      );
      const fxRatesResponse = resolve(results[2], [] as FxRate[], "fx rates");
      const normalizedFxRates = Array.isArray(fxRatesResponse) ? fxRatesResponse : [];

      if (totalsResponse) {
        setTotals(totalsResponse);
      }
      if (priceStatusResponse) {
        setPriceStatus(priceStatusResponse);
      }
      setFxRates(normalizedFxRates);

      if (failures.length === results.length) {
        showToast("Price refresh failed", "Unable to sync the latest prices.");
        return;
      }
      if (failures.length > 0) {
        showToast(
          "Refresh completed with warnings",
          `We could not refresh: ${failures.join(", ")}.`,
        );
        return;
      }
      showToast("Price refresh complete", "Latest prices are now available.");
    } catch (err) {
      showToast("Price refresh failed", "Unable to sync the latest prices.");
    }
  };

  const handleSaveTransaction = async () => {
    const amount = Number(transactionAmount);
    if (!amount) {
      showToast("Missing amount", "Enter a transaction amount to save.");
      return;
    }
    if (!transactionAccount) {
      showToast("Missing account", "Select an account to save this transaction.");
      return;
    }
    const accountName = accounts.find((account) => account.id === transactionAccount)?.name ?? "Unknown";
    const tempId = `temp-${Date.now()}`;
    const optimisticTransaction: TransactionDisplay = {
      id: tempId,
      account: accountName,
      type: transactionType,
      amount,
      currency: transactionCurrency,
      date: transactionDate,
      category: transactionCategory,
      notes: transactionNotes || "Manual entry",
    };
    setTransactions((prev) => [optimisticTransaction, ...prev]);
    setIsTransactionOpen(false);
    setTransactionAmount("");
    setTransactionNotes("");
    try {
      const created = await post<Transaction>("/api/transactions", {
        account_id: transactionAccount,
        amount,
        currency_code: transactionCurrency,
        transaction_type: transactionType.toLowerCase(),
        category: transactionCategory,
        merchant: null,
        description: transactionNotes || null,
        occurred_at: toIsoDateTime(transactionDate),
      });
      setTransactions((prev) =>
        prev.map((transaction) =>
          transaction.id === tempId
            ? {
                id: created.id,
                account: accountName,
                type: created.transaction_type === "income" ? "Income" : "Expense",
                amount: created.amount,
                currency: created.currency_code,
                date: created.occurred_at.split("T")[0],
                category: transactionCategory,
                notes: created.description ?? "Manual entry",
              }
            : transaction,
        ),
      );
      showToast("Transaction saved", "Your entry has been recorded.");
    } catch (err) {
      setTransactions((prev) => prev.filter((transaction) => transaction.id !== tempId));
      showToast("Save failed", "Unable to save this transaction.");
    }
  };

  const linePoints = lineSeries.map((point) => point.value);
  const maxValue = linePoints.length > 0 ? Math.max(...linePoints) : 0;
  const minValue = linePoints.length > 0 ? Math.min(...linePoints) : 0;
  const midpointValue = Math.round((maxValue + minValue) / 2);
  const axisYLabels = [
    formatCurrency(maxValue, displayCurrency),
    formatCurrency(Math.round(maxValue * 0.75), displayCurrency),
    formatCurrency(midpointValue, displayCurrency),
    formatCurrency(Math.round(minValue + (maxValue - minValue) * 0.25), displayCurrency),
    formatCurrency(minValue, displayCurrency),
  ];
  const rangeDays = Math.max(
    1,
    Math.round(
      (new Date(range.to).getTime() - new Date(range.from).getTime()) / 86400000,
    ),
  );
  const labelCount = Math.min(lineSeries.length || 1, rangeDays <= 45 ? 6 : 5);
  const labelStep = labelCount > 1 ? (lineSeries.length - 1) / (labelCount - 1) : 0;
  const axisXLabels = Array.from({ length: labelCount }, (_, index) =>
    Math.round(index * labelStep),
  )
    .filter((index, position, list) => list.indexOf(index) === position)
    .filter((index) => lineSeries[index])
    .map((index) => formatDateDisplay(lineSeries[index].date));
  const tooltipDates = lineSeries.map((point) => point.date);

  const hasHistory = lineSeries.length > 1 && lineSeries.some((point) => point.value !== 0);
  const growthValue = hasHistory
    ? ((lineSeries[lineSeries.length - 1].value - lineSeries[0].value) /
        Math.max(Math.abs(lineSeries[0].value), 1)) *
      100
    : 0;
  const growthLabel = `${growthValue.toFixed(1)}%`;
  const assetTrendValue =
    lineSeries.length > 1
      ? ((lineSeries[lineSeries.length - 1].value - lineSeries[0].value) /
          Math.max(Math.abs(lineSeries[0].value), 1)) *
        100
      : 0;
  const assetTrend = `${assetTrendValue >= 0 ? "+" : ""}${assetTrendValue.toFixed(1)}%`;
  const midPoint = new Date(
    (new Date(range.from).getTime() + new Date(range.to).getTime()) / 2,
  );
  const incomeByPeriod = filteredTransactions.reduce(
    (acc, transaction) => {
      const signedAmount = transaction.type === "Expense" ? -transaction.amount : transaction.amount;
      const amount = convertAmount(signedAmount, transaction.currency, displayCurrency);
      const date = new Date(transaction.date);
      if (date <= midPoint) {
        acc.previous += amount;
      } else {
        acc.current += amount;
      }
      return acc;
    },
    { current: 0, previous: 0 },
  );
  const netIncomeTrendValue =
    incomeByPeriod.previous === 0
      ? incomeByPeriod.current === 0
        ? 0
        : 100
      : ((incomeByPeriod.current - incomeByPeriod.previous) /
          Math.abs(incomeByPeriod.previous)) *
        100;
  const netIncomeTrend = `${netIncomeTrendValue >= 0 ? "+" : ""}${netIncomeTrendValue.toFixed(1)}%`;
  const isEmptyDashboard =
    accounts.length === 0 && assets.length === 0 && transactions.length === 0;

  if (isLoading) {
    return (
      <section className="page">
        <LoadingSkeleton label="Loading metrics" lines={7} />
      </section>
    );
  }

  if (error) {
    return (
      <section className="page">
        <div className="card page-state error">
          <p>{error}</p>
          {errorDetails.length > 0 ? (
            <>
              <p className="muted">Debug details</p>
              <ul>
                {errorDetails.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            </>
          ) : null}
          <button className="pill" type="button" onClick={loadData}>
            Retry
          </button>
        </div>
      </section>
    );
  }

  if (isEmptyDashboard) {
    return (
      <section className="page">
        <header className="page-header">
          <div>
            <h1>{pageTitles.dashboard}</h1>
            <p className="muted">Overview of your asset growth and daily performance.</p>
          </div>
          <div className="toolbar">
            <button className="pill primary" onClick={() => setIsTransactionOpen(true)}>
              Add Transaction
            </button>
          </div>
        </header>
        <Modal
          title="Add transaction"
          description="Log income or expenses to keep your net worth accurate."
          isOpen={isTransactionOpen}
          onClose={() => setIsTransactionOpen(false)}
          footer={
            <>
              <button className="pill" type="button" onClick={() => setIsTransactionOpen(false)}>
                Cancel
              </button>
              <button className="pill primary" type="button" onClick={handleSaveTransaction}>
                Save Transaction
              </button>
            </>
          }
        >
          <div className="form-grid">
            <label>
              Account
              <select
                value={transactionAccount}
                onChange={(event) => setTransactionAccount(event.target.value)}
              >
                {accountOptions.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type
              <select
                value={transactionType}
                onChange={(event) => setTransactionType(event.target.value)}
              >
                <option value="Income">Income</option>
                <option value="Expense">Expense</option>
              </select>
            </label>
            <label>
              Amount
              <input
                type="number"
                value={transactionAmount}
                onChange={(event) => setTransactionAmount(event.target.value)}
                placeholder="0.00"
              />
            </label>
            <label>
              Currency
              <select
                value={transactionCurrency}
                onChange={(event) => setTransactionCurrency(event.target.value)}
              >
                {supportedCurrencies.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Category
              <select
                value={transactionCategory}
                onChange={(event) => setTransactionCategory(event.target.value)}
                disabled={isPreferencesLoading}
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date
              <input
                type="date"
                value={transactionDate}
                onChange={(event) => setTransactionDate(event.target.value)}
              />
            </label>
            <label className="full-width">
              Notes
              <textarea
                rows={3}
                value={transactionNotes}
                onChange={(event) => setTransactionNotes(event.target.value)}
                placeholder="Optional details"
              />
            </label>
            {preferencesError ? (
              <p className="input-helper">{preferencesError}</p>
            ) : null}
          </div>
        </Modal>
        <div className="card">
          <EmptyState
            title="No dashboard data yet"
            description="Add accounts and log your first transactions to populate charts and insights."
            actionLabel="Add transaction"
            actionHint="Start with an income or expense entry."
            onAction={() => setIsTransactionOpen(true)}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>{pageTitles.dashboard}</h1>
          <p className="muted">
            Overview of your asset growth and daily performance.
          </p>
        </div>
        <div className="toolbar">
          <button className="pill primary" onClick={() => setIsTransactionOpen(true)}>
            Add Transaction
          </button>
          <button
            className="pill"
            onClick={() => {
              setRefreshTick((prev) => prev + 1);
              handleRefreshPrices();
            }}
          >
            Refresh Prices
          </button>
        </div>
      </header>
      <Modal
        title="Add transaction"
        description="Log income or expenses to keep your net worth accurate."
        isOpen={isTransactionOpen}
        onClose={() => setIsTransactionOpen(false)}
        footer={
          <>
            <button className="pill" type="button" onClick={() => setIsTransactionOpen(false)}>
              Cancel
            </button>
            <button
              className="pill primary"
              type="button"
              onClick={handleSaveTransaction}
            >
              Save Transaction
            </button>
          </>
        }
      >
        <div className="form-grid">
          <label>
            Account
            <select
              value={transactionAccount}
              onChange={(event) => setTransactionAccount(event.target.value)}
            >
              {accountOptions.length === 0 ? (
                <option value="" disabled>
                  No accounts available
                </option>
              ) : (
                accountOptions.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <label>
            Type
            <select
              value={transactionType}
              onChange={(event) => setTransactionType(event.target.value)}
            >
              {["Income", "Expense"].map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label>
            Amount
            <input
              type="number"
              placeholder="0.00"
              value={transactionAmount}
              onChange={(event) => setTransactionAmount(event.target.value)}
            />
          </label>
          <label>
            Currency
            <select
              value={transactionCurrency}
              onChange={(event) => setTransactionCurrency(event.target.value)}
            >
              {supportedCurrencies.map((currencyOption) => (
                <option key={currencyOption} value={currencyOption}>
                  {currencyOption}
                </option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select
              value={transactionCategory}
              onChange={(event) => setTransactionCategory(event.target.value)}
              disabled={isPreferencesLoading}
            >
              {isPreferencesLoading ? (
                <option value="">Loading categories…</option>
              ) : (
                categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))
              )}
            </select>
            {preferencesError ? (
              <div className="input-helper">
                {preferencesError}{" "}
                <button className="pill" type="button" onClick={loadPreferences}>
                  Retry
                </button>
              </div>
            ) : null}
          </label>
          <label>
            Date
            <input
              type="date"
              value={transactionDate}
              onChange={(event) => setTransactionDate(event.target.value)}
            />
          </label>
          <label>
            Notes
            <input
              type="text"
              placeholder="Salary, rent, dividends..."
              value={transactionNotes}
              onChange={(event) => setTransactionNotes(event.target.value)}
            />
          </label>
        </div>
      </Modal>
      {toast && <ActionToast toast={toast} onDismiss={() => setToast(null)} />}
      <div className="card-grid">
        <KpiCard
          label="Total Assets"
          value={formatCurrency(totalAssets, displayCurrency)}
          trend={assetTrend}
          footnote={
            priceStatus?.missing_count
              ? `Missing prices for ${priceStatus.missing_count} holdings`
              : "vs last period"
          }
        />
        <KpiCard
          label="Net Income"
          value={formatCurrency(netIncome, displayCurrency)}
          trend={netIncomeTrend}
          footnote="This month"
        />
        <KpiCard
          label="Growth"
          value={growthLabel}
          trend={hasHistory ? "Stable" : "No data"}
          footnote="Year to date"
        />
      </div>
      <div className="card chart-card">
        <div className="chart-header">
          <div>
            <h3>Asset Growth</h3>
            <p className="muted">Track portfolio growth in your date range.</p>
          </div>
          <DateRangePicker value={range} onChange={setRange} />
        </div>
        {isFiltering ? (
          <LoadingSkeleton label="Refreshing asset growth" lines={4} />
        ) : (
          <div className="chart-surface chart-axis-surface">
            <LineChart
              points={linePoints}
              labels={tooltipDates}
              formatLabel={formatDateDisplay}
              formatValue={(value) => formatCurrency(value, displayCurrency)}
              showAxisLabels={false}
            />
            <span className="chart-axis-title y">Value</span>
            <span className="chart-axis-title x">Date</span>
            <div className="chart-axis-y">
              {axisYLabels.map((label, index) => (
                <span key={`${label}-${index}`}>{label}</span>
              ))}
            </div>
            <div className="chart-axis-x">
              {axisXLabels.map((label, index) => (
                <span key={`${label}-${index}`}>{label}</span>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="split-grid">
        <div className="card">
          <h3>Weekly Cashflow</h3>
          <p className="muted">Income vs expenses snapshot.</p>
          <BarChart
            values={barValues}
            formatValue={(value) => formatCurrency(value, displayCurrency)}
          />
        </div>
        <div className="card">
          <h3>Allocation</h3>
          <p className="muted">Income vs expense mix.</p>
          {donutValues.length ? (
            <DonutChart
              values={donutValues}
              formatValue={(value) => formatCurrency(value, displayCurrency)}
            />
          ) : (
            <p className="muted">No assets yet.</p>
          )}
          <div className="legend">
            {donutValues.map((item) => (
              <div key={item.label} className="legend-item">
                <span className="legend-dot" style={{ background: item.color }} />
                {item.label}
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>FX rates</h3>
          <p className="muted">Latest USD base currency rates.</p>
          {latestFxRates.length === 0 ? (
            <p className="muted">No FX rates available.</p>
          ) : (
            <div className="chip-grid">
              {latestFxRates.map((rate) => (
                <span key={rate.quote_currency} className="chip">
                  {rate.quote_currency} {rate.rate.toFixed(3)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="card list-card">
        <div className="list-row list-header columns-6">
          <span>Date</span>
          <span>Account</span>
          <span>Type</span>
          <span>Category</span>
          <span>Amount ({displayCurrency})</span>
          <span>Notes</span>
        </div>
        {isFiltering ? (
          <LoadingSkeleton label="Refreshing activity" lines={6} />
        ) : filteredTransactions.length === 0 ? (
          <EmptyState
            title={
              transactions.length === 0
                ? "No activity yet"
                : "No activity matches this view"
            }
            description="Metrics summarize your cashflow and balances from recorded transactions."
            actionLabel="Add transaction"
            actionHint="Log a transaction to populate your metrics feed."
            onAction={() => setIsTransactionOpen(true)}
          />
        ) : (
          filteredTransactions.map((transaction) => (
            <div
              className="list-row columns-6"
              key={transaction.id}
            >
              <span>{formatDateDisplay(transaction.date)}</span>
              <span>{transaction.account}</span>
              <span>{transaction.type}</span>
              <span>{transaction.category}</span>
              <span className="amount-cell">
                <span>
                  {formatCurrency(
                    convertAmount(transaction.amount, transaction.currency, displayCurrency),
                    displayCurrency,
                  )}
                </span>
                <span className="subtext">
                  {formatCurrency(transaction.amount, transaction.currency)} {transaction.currency}
                </span>
              </span>
              <span>{transaction.notes}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
