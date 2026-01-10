import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ActionToast, { ActionToastData } from "../components/ActionToast";
import ChartPanel from "../components/ChartPanel";
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
import {
  formatDateDisplay,
  formatDateInputValue,
  getDefaultRange,
  toDateInputValue,
  toIsoDateInput,
  toIsoDateTime,
} from "../utils/date";
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

type AssetPrice = {
  asset_id: string;
  symbol: string;
  price: number | null;
  currency_code: string;
  recorded_at: string | null;
};

type AssetPerformance = {
  asset_id: string;
  symbol: string;
  quantity: number;
  currency_code: string;
  start_price: number | null;
  latest_price: number | null;
  start_at: string | null;
  latest_at: string | null;
  return_pct: number | null;
  benchmark_label: string;
  benchmark_return: number | null;
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

type Candle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
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

type DashboardResponse = {
  accounts: Account[];
  groups: AccountGroup[];
  memberships: AccountGroupMembership[];
  assets: Asset[];
  transactions: Transaction[];
  history: HistoryPoint[];
  totals: TotalsResponse | null;
  price_status: AssetPriceStatus | null;
};

type AssetDisplay = {
  name: string;
  amount: number;
  currency: string;
  account: string;
};

type PriceChange = {
  changeValue: number | null;
  changePercent: number | null;
  latestClose: number | null;
  previousClose: number | null;
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

export default function DashboardPage() {
  usePageMeta({ title: pageTitles.dashboard });
  const navigate = useNavigate();
  const { currency: displayCurrency } = useCurrency();
  const { account: selectedAccount, group: selectedGroup } = useSelection();
  const [range, setRange] = useState<DateRange>(() => getDefaultRange(90));
  const [toast, setToast] = useState<ActionToastData | null>(null);
  const [cacheNotice, setCacheNotice] = useState<string | null>(null);
  const cacheNoticeTimeout = useRef<number | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [isTransactionOpen, setIsTransactionOpen] = useState(false);
  const [transactionAccount, setTransactionAccount] = useState("");
  const [transactionType, setTransactionType] = useState("Income");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState(() =>
    formatDateInputValue(toDateInputValue(new Date()))
  );
  const [transactionNotes, setTransactionNotes] = useState("");
  const [transactionCurrency, setTransactionCurrency] = useState("USD");
  const [categories, setCategories] = useState<string[]>([]);
  const [transactionCategory, setTransactionCategory] = useState("General");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [memberships, setMemberships] = useState<AccountGroupMembership[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetPrices, setAssetPrices] = useState<AssetPrice[]>([]);
  const [performanceMetrics, setPerformanceMetrics] = useState<AssetPerformance[]>([]);
  const [priceChanges, setPriceChanges] = useState<Record<string, PriceChange>>({});
  const [transactions, setTransactions] = useState<TransactionDisplay[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [totals, setTotals] = useState<TotalsResponse | null>(null);
  const [priceStatus, setPriceStatus] = useState<AssetPriceStatus | null>(null);
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
        setCacheNotice(
          "Using cached dashboard data. We are pacing requests to avoid rate limits.",
        );
        if (cacheNoticeTimeout.current) {
          window.clearTimeout(cacheNoticeTimeout.current);
        }
        cacheNoticeTimeout.current = window.setTimeout(() => {
          setCacheNotice(null);
          cacheNoticeTimeout.current = null;
        }, 8000);
      }
    };
    window.addEventListener("firecash:rate-limit-cache", handler);
    return () => {
      window.removeEventListener("firecash:rate-limit-cache", handler);
      if (cacheNoticeTimeout.current) {
        window.clearTimeout(cacheNoticeTimeout.current);
        cacheNoticeTimeout.current = null;
      }
    };
  }, []);

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

  const fetchPriceChanges = useCallback(
    async (symbols: string[]): Promise<Record<string, PriceChange>> => {
      if (symbols.length === 0) {
        return {};
      }
      const entries = await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const response = await get<{ candles: Candle[] }>(
              `/api/assets/candles?symbol=${encodeURIComponent(symbol)}`,
            );
            const candles = response.candles;
            if (candles.length < 2) {
              return [
                symbol,
                {
                  changeValue: null,
                  changePercent: null,
                  latestClose: null,
                  previousClose: null,
                },
              ] as const;
            }
            const latest = candles[candles.length - 1];
            const previous = candles[candles.length - 2];
            if (!previous.close) {
              return [
                symbol,
                {
                  changeValue: null,
                  changePercent: null,
                  latestClose: latest.close,
                  previousClose: previous.close,
                },
              ] as const;
            }
            const changeValue = latest.close - previous.close;
            const changePercent = (changeValue / previous.close) * 100;
            return [
              symbol,
              {
                changeValue,
                changePercent,
                latestClose: latest.close,
                previousClose: previous.close,
              },
            ] as const;
          } catch (err) {
            return [
              symbol,
              {
                changeValue: null,
                changePercent: null,
                latestClose: null,
                previousClose: null,
              },
            ] as const;
          }
        }),
      );
      return Object.fromEntries(entries);
    },
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
        const [pricesResult, performanceResult] = await Promise.allSettled([
          get<AssetPrice[]>("/api/assets/prices"),
          get<AssetPerformance[]>("/api/assets/performance"),
        ]);
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
        const pricesResponse =
          pricesResult.status === "fulfilled" ? pricesResult.value : [];
        const performanceResponse =
          performanceResult.status === "fulfilled" ? performanceResult.value : [];
        const symbols = Array.from(
          new Set(assetsResponse.map((asset) => asset.symbol)),
        );
        const priceChangeResponse = await fetchPriceChanges(symbols);

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
        setAssetPrices(pricesResponse);
        setPerformanceMetrics(performanceResponse);
        setPriceChanges(priceChangeResponse);
        setTransactions(mappedTransactions);
        setHistory(historyResponse);
        setTotals(totalsResponse);
        setPriceStatus(priceStatusResponse);
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
  }, [fetchPriceChanges, formatFailureReason, isRecord]);

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
  const accountNameById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name])),
    [accounts],
  );
  const priceByAssetId = useMemo(
    () => new Map(assetPrices.map((price) => [price.asset_id, price])),
    [assetPrices],
  );
  const performanceByAssetId = useMemo(
    () => new Map(performanceMetrics.map((metric) => [metric.asset_id, metric])),
    [performanceMetrics],
  );
  const holdings = useMemo(() => {
    return assets
      .map((asset) => {
        const accountName = accountNameById.get(asset.account_id) ?? "Unknown";
        const priceInfo = priceByAssetId.get(asset.id);
        const performance = performanceByAssetId.get(asset.id);
        const currency = priceInfo?.currency_code ?? asset.currency_code;
        const lastPrice = priceInfo?.price ?? performance?.latest_price ?? null;
        const avgPrice =
          performance?.start_price && performance?.latest_price
            ? (performance.start_price + performance.latest_price) / 2
            : performance?.start_price ?? performance?.latest_price ?? null;
        const priceChange = priceChanges[asset.symbol];
        const marketValue =
          lastPrice === null
            ? null
            : convertAmount(lastPrice * asset.quantity, currency, displayCurrency);
        return {
          id: asset.id,
          symbol: asset.symbol,
          shares: asset.quantity,
          account: accountName,
          currency,
          lastPrice,
          avgPrice,
          changeValue: priceChange?.changeValue ?? null,
          changePercent: priceChange?.changePercent ?? null,
          marketValue,
        };
      })
      .filter((holding) => matchesSelection(holding.account));
  }, [
    accountNameById,
    assets,
    displayCurrency,
    matchesSelection,
    performanceByAssetId,
    priceByAssetId,
    priceChanges,
  ]);

  const selectionScale = Math.max(0.4, filteredAssets.length / baseAssets.length || 1);

  const totalAssets = totals
    ? convertAmount(totals.total, totals.currency_code, displayCurrency)
    : filteredAssets.reduce(
        (sum, asset) => sum + convertAmount(asset.amount, asset.currency, displayCurrency),
        0,
      );

  const { monthlyIncome, monthlyExpense, netCashflow } = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    return filteredTransactions.reduce(
      (acc, transaction) => {
        const date = new Date(transaction.date);
        if (date < cutoff) {
          return acc;
        }
        const amount = convertAmount(
          transaction.amount,
          transaction.currency,
          displayCurrency,
        );
        if (transaction.type === "Income") {
          acc.monthlyIncome += amount;
        } else {
          acc.monthlyExpense += amount;
        }
        acc.netCashflow += transaction.type === "Income" ? amount : -amount;
        return acc;
      },
      { monthlyIncome: 0, monthlyExpense: 0, netCashflow: 0 },
    );
  }, [displayCurrency, filteredTransactions]);

  const netCashflowTrend = useMemo(() => {
    if (filteredTransactions.length === 0) {
      return null;
    }
    const now = new Date();
    const currentStart = new Date();
    currentStart.setDate(now.getDate() - 30);
    const previousStart = new Date();
    previousStart.setDate(now.getDate() - 60);
    const totalsByPeriod = filteredTransactions.reduce(
      (acc, transaction) => {
        const date = new Date(transaction.date);
        const signedAmount =
          transaction.type === "Income" ? transaction.amount : -transaction.amount;
        const amount = convertAmount(signedAmount, transaction.currency, displayCurrency);
        if (date >= currentStart) {
          acc.current += amount;
        } else if (date >= previousStart && date < currentStart) {
          acc.previous += amount;
        }
        return acc;
      },
      { current: 0, previous: 0 },
    );
    const trendValue =
      totalsByPeriod.previous === 0
        ? totalsByPeriod.current === 0
          ? 0
          : 100
        : ((totalsByPeriod.current - totalsByPeriod.previous) /
            Math.abs(totalsByPeriod.previous)) *
          100;
    return `${trendValue >= 0 ? "+" : ""}${trendValue.toFixed(1)}%`;
  }, [displayCurrency, filteredTransactions]);

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

  const handleRefreshPrices = async () => {
    try {
      await post<{ updated: number }>("/api/assets/refresh-prices", {});
      const results = await Promise.allSettled([
        get<TotalsResponse>("/api/totals"),
        get<AssetPriceStatus>("/api/assets/price-status"),
        get<AssetPrice[]>("/api/assets/prices"),
        get<AssetPerformance[]>("/api/assets/performance"),
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
      const pricesResponse = resolve(results[2], [] as AssetPrice[], "asset prices");
      const performanceResponse = resolve(
        results[3],
        [] as AssetPerformance[],
        "asset performance",
      );

      if (totalsResponse) {
        setTotals(totalsResponse);
      }
      if (priceStatusResponse) {
        setPriceStatus(priceStatusResponse);
      }
      setAssetPrices(pricesResponse);
      setPerformanceMetrics(performanceResponse);
      const symbols = Array.from(new Set(assets.map((asset) => asset.symbol)));
      const priceChangeResponse = await fetchPriceChanges(symbols);
      setPriceChanges(priceChangeResponse);

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
    const accountName =
      accounts.find((account) => account.id === transactionAccount)?.name ?? "Unknown";
    const normalizedDate = toIsoDateInput(transactionDate);
    if (!normalizedDate) {
      showToast("Invalid date", "Use the YYYY/MM/DD format to save this transaction.");
      return;
    }
    const tempId = `temp-${Date.now()}`;
    const optimisticTransaction: TransactionDisplay = {
      id: tempId,
      account: accountName,
      type: transactionType,
      amount,
      currency: transactionCurrency,
      date: normalizedDate,
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
        occurred_at: toIsoDateTime(normalizedDate),
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
  const hasHoldings = holdings.length > 0;
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
            <p className="muted">Start tracking assets, cashflow, and holdings in one view.</p>
          </div>
          <div className="toolbar">
            <button className="pill primary" onClick={() => setIsTransactionOpen(true)}>
              Add Transaction
            </button>
            <button className="pill" onClick={() => navigate("/transactions?create=recurring")}>
              Add Recurring
            </button>
            <button className="pill" onClick={() => navigate("/stocks?create=holding")}>
              Add Stock Trade
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
                type="text"
                inputMode="numeric"
                placeholder="YYYY/MM/DD"
                value={transactionDate}
                onChange={(event) =>
                  setTransactionDate(formatDateInputValue(event.target.value))
                }
              />
              <div className="input-helper">Format: YYYY/MM/DD</div>
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
            secondaryActionLabel="Add stock trade"
            onSecondaryAction={() => navigate("/stocks?create=holding")}
            secondaryActionHint="Track investments alongside cash activity."
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
            Track assets, cashflow, and holdings with a clean monthly snapshot.
          </p>
          <div className="cache-notice" aria-live="polite">
            {cacheNotice ?? "\u00A0"}
          </div>
        </div>
        <div className="toolbar">
          <button className="pill primary" onClick={() => setIsTransactionOpen(true)}>
            Add Transaction
          </button>
          <button className="pill" onClick={() => navigate("/transactions?create=recurring")}>
            Add Recurring
          </button>
          <button className="pill" onClick={() => navigate("/stocks?create=holding")}>
            Add Stock Trade
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
                  type="text"
                  inputMode="numeric"
                  placeholder="YYYY/MM/DD"
                  value={transactionDate}
                  onChange={(event) =>
                    setTransactionDate(formatDateInputValue(event.target.value))
                  }
                />
                <div className="input-helper">Format: YYYY/MM/DD</div>
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
              : "Portfolio value"
          }
        />
        <KpiCard
          label="Net Cashflow"
          value={formatCurrency(netCashflow, displayCurrency)}
          trend={netCashflowTrend ?? undefined}
          footnote="Last 30 days"
        />
        <KpiCard
          label="Monthly Income"
          value={formatCurrency(monthlyIncome, displayCurrency)}
          footnote="Last 30 days"
        />
        <KpiCard
          label="Monthly Expenses"
          value={formatCurrency(monthlyExpense, displayCurrency)}
          footnote="Last 30 days"
        />
      </div>
      {isFiltering ? (
        <div className="card chart-card">
          <LoadingSkeleton label="Refreshing asset growth" lines={4} />
        </div>
      ) : (
        <ChartPanel
          title="Growth curve"
          description={`Net worth trend for the selected range (${growthLabel}).`}
          points={linePoints}
          labels={tooltipDates}
          formatLabel={formatDateDisplay}
          formatValue={(value) => formatCurrency(value, displayCurrency)}
          axisTitleY="Value"
          axisTitleX="Date"
          headerExtras={<DateRangePicker value={range} onChange={setRange} />}
        />
      )}
      <div className="card list-card">
        <div className="list-row list-header columns-7">
          <span>Symbol</span>
          <span>Shares</span>
          <span>Last price</span>
          <span>Avg price</span>
          <span>1D change</span>
          <span>Market value ({displayCurrency})</span>
          <span>Account</span>
        </div>
        {isFiltering ? (
          <LoadingSkeleton label="Refreshing holdings" lines={5} />
        ) : !hasHoldings ? (
          <EmptyState
            title="No holdings to show yet"
            description="Add a stock trade to track last price, day change, and market value."
            actionLabel="Add stock trade"
            onAction={() => navigate("/stocks?create=holding")}
            actionHint="Keep holdings updated to see daily moves."
            secondaryActionLabel="Log a transaction"
            onSecondaryAction={() => setIsTransactionOpen(true)}
            secondaryActionHint="Record cashflow alongside holdings."
          />
        ) : (
          holdings.map((holding) => {
            const changeLabel =
              holding.changeValue === null || holding.changePercent === null
                ? "—"
                : `${holding.changeValue > 0 ? "+" : ""}${formatCurrency(
                    holding.changeValue,
                    holding.currency,
                  )} (${holding.changePercent > 0 ? "+" : ""}${holding.changePercent.toFixed(
                    2,
                  )}%)`;
            return (
              <div className="list-row columns-7" key={holding.id}>
                <span>{holding.symbol}</span>
                <span>{holding.shares.toFixed(2)}</span>
                <span>
                  {holding.lastPrice === null
                    ? "—"
                    : formatCurrency(holding.lastPrice, holding.currency)}
                </span>
                <span>
                  {holding.avgPrice === null
                    ? "—"
                    : formatCurrency(holding.avgPrice, holding.currency)}
                </span>
                <span
                  className={
                    holding.changeValue !== null && holding.changeValue < 0
                      ? "status warn"
                      : "status"
                  }
                >
                  {changeLabel}
                </span>
                <span>
                  {holding.marketValue === null
                    ? "—"
                    : formatCurrency(holding.marketValue, displayCurrency)}
                </span>
                <span>{holding.account}</span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
