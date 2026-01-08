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
import {
  fetchAccountGroupMemberships,
  fetchAccountGroups,
} from "../api/accountGroups";
import { fetchPreferences, updatePreferences } from "../api/preferences";
import { del, get, post, put } from "../utils/apiClient";
import { convertAmount, formatCurrency } from "../utils/currency";
import { formatDateDisplay, getDefaultRange, toDateInputValue } from "../utils/date";
import { supportedCurrencies } from "../utils/currency";
import { getFriendlyErrorMessage } from "../utils/errorMessages";
import { pageTitles } from "../utils/pageTitles";
import { usePageMeta } from "../utils/pageMeta";

type Account = {
  id: string;
  name: string;
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
  created_at: string;
};

type HistoryPoint = {
  date: string;
  value: number;
};

type Transaction = {
  id: string;
  amount: number;
  currency_code: string;
  transaction_type: string;
  occurred_at: string;
};

type AssetPrice = {
  asset_id: string;
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

type Candle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

type Holding = {
  id: string;
  ticker: string;
  shares: number;
  avgEntry: number | null;
  price: number | null;
  change: number | null;
  currency: string;
  assetType: string;
  account: string;
  entryDate: string;
};

type HoldingEdit = {
  ticker?: string;
  shares?: number;
  currency?: string;
  accountId?: string;
  accountName?: string;
};

type Trade = {
  id: string;
  ticker: string;
  shares: number;
  price: number | null;
  currency: string;
  account: string;
  date: string;
  side: "Buy" | "Sell";
};

const POPULAR_SYMBOLS = [
  "AAPL",
  "MSFT",
  "GOOGL",
  "AMZN",
  "TSLA",
  "NVDA",
  "META",
  "NFLX",
  "BRK.B",
  "SPY",
  "QQQ",
  "0700.HK",
];

function getTodayDate() {
  return toDateInputValue(new Date());
}

function currencyFromSymbol(symbol: string) {
  const normalized = symbol.toUpperCase();
  if (normalized.endsWith(".HK")) {
    return "HKD";
  }
  if (normalized.endsWith(".JP")) {
    return "JPY";
  }
  if (normalized.endsWith(".L")) {
    return "GBP";
  }
  if (normalized.endsWith(".TO")) {
    return "CAD";
  }
  if (normalized.endsWith(".SW")) {
    return "CHF";
  }
  if (normalized.endsWith(".DE") || normalized.endsWith(".EU")) {
    return "EUR";
  }
  return "USD";
}

export default function StocksPage() {
  usePageMeta({ title: pageTitles.stocks });
  const { currency: displayCurrency } = useCurrency();
  const { account: selectedAccount, group: selectedGroup } = useSelection();
  const [toast, setToast] = useState<ActionToastData | null>(null);
  const [range, setRange] = useState<DateRange>(() => getDefaultRange(90));
  const [isHoldingOpen, setIsHoldingOpen] = useState(false);
  const [holdingTicker, setHoldingTicker] = useState("");
  const [holdingShares, setHoldingShares] = useState("");
  const [holdingPrice, setHoldingPrice] = useState("");
  const [holdingDate, setHoldingDate] = useState(getTodayDate);
  const [holdingAccount, setHoldingAccount] = useState("");
  const [holdingStrategy, setHoldingStrategy] = useState("Long Term");
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [memberships, setMemberships] = useState<AccountGroupMembership[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [strategies, setStrategies] = useState<string[]>([]);
  const [holdingStrategies, setHoldingStrategies] = useState<Record<string, string>>({});
  const [selectedHoldings, setSelectedHoldings] = useState<Set<string>>(new Set());
  const [pendingStrategies, setPendingStrategies] = useState<Record<string, string>>({});
  const [pendingHoldings, setPendingHoldings] = useState<Record<string, HoldingEdit>>({});
  const [isEditMode, setIsEditMode] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isFiltering, setIsFiltering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPreferencesLoading, setIsPreferencesLoading] = useState(true);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [lastPriceUpdate, setLastPriceUpdate] = useState<string | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<AssetPerformance[]>([]);
  const [assetDataSource, setAssetDataSource] = useState("stooq");
  const [assetRefreshCadence, setAssetRefreshCadence] = useState("daily");

  const loadData = useCallback(async () => {
    let isMounted = true;
    const run = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [
          accountsResponse,
          groupsResponse,
          membershipResponse,
          assetsResponse,
          historyResponse,
          pricesResponse,
          performanceResponse,
          transactionsResponse,
        ] = await Promise.all([
          get<Account[]>("/api/accounts"),
          fetchAccountGroups(),
          fetchAccountGroupMemberships(),
          get<Asset[]>("/api/assets"),
          get<HistoryPoint[]>("/api/history"),
          get<AssetPrice[]>("/api/assets/prices"),
          get<AssetPerformance[]>("/api/assets/performance"),
          get<Transaction[]>("/api/transactions"),
        ]);
        if (!isMounted) {
          return;
        }
        const symbols = Array.from(
          new Set(assetsResponse.map((asset) => asset.symbol)),
        );
        const changeBySymbol = new Map<string, number | null>();
        if (symbols.length > 0) {
          await Promise.all(
            symbols.map(async (symbol) => {
              try {
                const response = await get<{ candles: Candle[] }>(
                  `/api/assets/candles?symbol=${encodeURIComponent(symbol)}`,
                );
                const candles = response.candles;
                if (candles.length < 2) {
                  changeBySymbol.set(symbol, null);
                  return;
                }
                const latest = candles[candles.length - 1];
                const previous = candles[candles.length - 2];
                if (!previous.close) {
                  changeBySymbol.set(symbol, null);
                  return;
                }
                const change = ((latest.close - previous.close) / previous.close) * 100;
                changeBySymbol.set(symbol, change);
              } catch (err) {
                changeBySymbol.set(symbol, null);
              }
            }),
          );
        }
        const accountMap = new Map(accountsResponse.map((item) => [item.id, item.name]));
        const priceMap = new Map(
          pricesResponse.map((price) => [price.asset_id, price]),
        );
        setLastPriceUpdate(getLatestPriceTimestamp(pricesResponse));
        const mappedHoldings = assetsResponse.map((asset) => {
          const priceInfo = priceMap.get(asset.id);
          return {
            id: asset.id,
            ticker: asset.symbol,
            shares: asset.quantity,
            avgEntry: null,
            price: priceInfo?.price ?? null,
            change: changeBySymbol.get(asset.symbol) ?? null,
            currency: priceInfo?.currency_code ?? asset.currency_code,
            assetType: asset.asset_type,
            account: accountMap.get(asset.account_id) ?? "Unknown",
            entryDate: asset.created_at.split("T")[0],
          };
        });
        setAccounts(accountsResponse);
        setGroups(groupsResponse);
        setMemberships(membershipResponse);
        setHoldings(mappedHoldings);
        setHistory(historyResponse);
        setPerformanceMetrics(performanceResponse);
        setTransactions(transactionsResponse);
        setHoldingAccount(accountsResponse[0]?.name ?? "");
      } catch (err) {
        if (isMounted) {
          setError("Unable to load stock data.");
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
  }, []);

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
      setStrategies(response.strategies);
      setHoldingStrategies(response.holdingStrategies);
      setHoldingStrategy(response.strategies[0] ?? "Long Term");
      setAssetDataSource(response.assetDataSource);
      setAssetRefreshCadence(response.assetRefreshCadence);
    } catch (err) {
      setPreferencesError("Unable to load strategies right now.");
    } finally {
      setIsPreferencesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  useEffect(() => {
    if (isLoading) {
      return;
    }
    setIsFiltering(true);
    const timer = window.setTimeout(() => setIsFiltering(false), 350);
    return () => window.clearTimeout(timer);
  }, [isLoading, range.from, range.to, selectedAccount, selectedGroup]);

  const accountOptions = useMemo(
    () => accounts.map((account) => account.name),
    [accounts],
  );
  const accountIdByName = useMemo(
    () => new Map(accounts.map((account) => [account.name, account.id])),
    [accounts],
  );
  const symbolSuggestions = useMemo(() => {
    const holdingSymbols = holdings.map((holding) => holding.ticker);
    const unique = Array.from(new Set([...POPULAR_SYMBOLS, ...holdingSymbols]));
    if (!holdingTicker) {
      return unique;
    }
    const query = holdingTicker.toUpperCase();
    return unique.filter((symbol) => symbol.includes(query));
  }, [holdingTicker, holdings]);

  const trades = useMemo<Trade[]>(
    () =>
      holdings.map((holding) => ({
        id: `trade-${holding.id}`,
        ticker: holding.ticker,
        shares: holding.shares,
        price: holding.price,
        currency: holding.currency,
        account: holding.account,
        date: holding.entryDate,
        side: "Buy",
      })),
    [holdings],
  );

  const showToast = (title: string, description?: string) => {
    setToast({ title, description });
  };

  const getLatestPriceTimestamp = (prices: AssetPrice[]) => {
    const timestamps = prices
      .map((price) => price.recorded_at)
      .filter((timestamp): timestamp is string => Boolean(timestamp));
    if (timestamps.length === 0) {
      return null;
    }
    return timestamps.reduce((latest, timestamp) =>
      new Date(timestamp) > new Date(latest) ? timestamp : latest,
    );
  };

  const applyPriceUpdates = (prices: AssetPrice[]) => {
    const priceMap = new Map(prices.map((price) => [price.asset_id, price]));
    setHoldings((prev) =>
      prev.map((holding) => {
        const priceInfo = priceMap.get(holding.id);
        if (!priceInfo) {
          return holding;
        }
        return {
          ...holding,
          price: priceInfo.price ?? holding.price,
          currency: priceInfo.currency_code ?? holding.currency,
        };
      }),
    );
  };

  const handleSyncQuotes = async () => {
    try {
      showToast("Quotes syncing", "Refreshing stock prices.");
      const refreshResponse = await post<{ updated: number }>(
        "/api/assets/refresh-prices",
        {},
      );
      const pricesResponse = await get<AssetPrice[]>("/api/assets/prices");
      applyPriceUpdates(pricesResponse);
      setLastPriceUpdate(getLatestPriceTimestamp(pricesResponse));
      const updatedCount = refreshResponse?.updated ?? 0;
      const availablePrices = pricesResponse.filter((price) => price.price !== null)
        .length;
      const priceMap = new Map(pricesResponse.map((price) => [price.asset_id, price]));
      const missingSymbols = holdings
        .filter((holding) => {
          const priceInfo = priceMap.get(holding.id);
          const resolvedPrice = priceInfo?.price ?? holding.price;
          return resolvedPrice === null;
        })
        .map((holding) => holding.ticker);
      if (updatedCount > 0) {
        showToast(
          "Quotes updated",
          `${
            updatedCount
          } price${updatedCount === 1 ? "" : "s"} refreshed${
            missingSymbols.length > 0
              ? `. Missing: ${missingSymbols.join(", ")}.`
              : "."
          }`,
        );
      } else if (availablePrices > 0) {
        showToast("Quotes up to date", "No new prices were returned.");
      } else if (missingSymbols.length > 0) {
        showToast(
          "Prices unavailable",
          `No prices found for ${missingSymbols.join(", ")}. Check tickers.`,
        );
      } else {
        showToast("No prices available", "Latest price data could not be fetched.");
      }
    } catch (err) {
      showToast(
        "Quote sync failed",
        getFriendlyErrorMessage(err, "Unable to refresh stock prices."),
      );
    }
  };

  const toggleHoldingSelection = (id: string) => {
    setSelectedHoldings((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (selectedHoldings.size === 0) {
      showToast("No selections", "Choose holdings to delete.");
      return;
    }
    const ids = Array.from(selectedHoldings);
    try {
      await Promise.all(ids.map((id) => del(`/api/assets/${id}`)));
      setHoldings((prev) => prev.filter((holding) => !selectedHoldings.has(holding.id)));
      const previousStrategies = holdingStrategies;
      const nextStrategies = { ...previousStrategies };
      ids.forEach((id) => delete nextStrategies[id]);
      setHoldingStrategies(nextStrategies);
      try {
        await updatePreferences({ holdingStrategies: nextStrategies });
      } catch (err) {
        setHoldingStrategies(previousStrategies);
        showToast(
          "Update failed",
          getFriendlyErrorMessage(err, "Unable to update holding strategies."),
        );
      }
      setSelectedHoldings(new Set());
      showToast("Holdings deleted", `${ids.length} holding(s) removed.`);
    } catch (err) {
      showToast("Delete failed", "Unable to delete selected holdings.");
    }
  };

  const pendingStrategyEntries = Object.entries(pendingStrategies).filter(
    ([id, value]) => value !== (holdingStrategies[id] ?? "Unassigned"),
  );

  const applyPendingChanges = async () => {
    const holdingEntries = Object.entries(pendingHoldings);
    if (
      pendingStrategyEntries.length === 0 &&
      holdingEntries.length === 0 &&
      selectedHoldings.size === 0
    ) {
      showToast("No changes", "There are no edits to apply.");
      return;
    }
    if (holdingEntries.length > 0) {
      try {
        await Promise.all(
          holdingEntries.map(async ([id, updates]) => {
            const payload: Record<string, unknown> = {};
            if (updates.ticker) {
              payload.symbol = updates.ticker;
            }
            if (updates.shares !== undefined) {
              payload.quantity = updates.shares;
            }
            if (updates.currency) {
              payload.currency_code = updates.currency;
            }
            if (updates.accountId) {
              payload.account_id = updates.accountId;
            }
            if (Object.keys(payload).length > 0) {
              await put(`/api/assets/${id}`, payload);
            }
          }),
        );
        setHoldings((prev) =>
          prev.map((holding) => {
            const edits = pendingHoldings[holding.id];
            if (!edits) {
              return holding;
            }
            return {
              ...holding,
              ticker: edits.ticker ?? holding.ticker,
              shares: edits.shares ?? holding.shares,
              currency: edits.currency ?? holding.currency,
              account: edits.accountName ?? holding.account,
            };
          }),
        );
        setPendingHoldings({});
      } catch (err) {
        showToast("Update failed", "Unable to update holdings.");
        return;
      }
    }
    if (pendingStrategyEntries.length > 0) {
      const previousStrategies = holdingStrategies;
      const nextStrategies = { ...holdingStrategies, ...pendingStrategies };
      setHoldingStrategies(nextStrategies);
      setPendingStrategies({});
      try {
        await updatePreferences({ holdingStrategies: nextStrategies });
      } catch (err) {
        setHoldingStrategies(previousStrategies);
        showToast(
          "Update failed",
          getFriendlyErrorMessage(err, "Unable to update holding strategies."),
        );
        return;
      }
    }
    if (selectedHoldings.size > 0) {
      await handleDeleteSelected();
    }
    setIsReviewOpen(false);
  };

  const performanceSeries = useMemo(() => {
    const fromDate = new Date(range.from);
    const toDate = new Date(range.to);
    const filtered = history.filter((point) => {
      const date = new Date(point.date);
      return date >= fromDate && date <= toDate;
    });
    return filtered.length > 0 ? filtered : history;
  }, [history, range.from, range.to]);

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
  const filteredHoldings = holdings.filter((holding) => matchesSelection(holding.account));
  const filteredTrades = trades.filter((trade) => matchesSelection(trade.account));
  const selectionScale = Math.max(0.4, filteredHoldings.length / holdings.length || 1);
  const rangeDays = Math.max(
    1,
    Math.round(
      (new Date(range.to).getTime() - new Date(range.from).getTime()) / 86400000,
    ),
  );
  const labelCount = Math.min(performanceSeries.length || 1, rangeDays <= 45 ? 6 : 5);
  const labelStep =
    labelCount > 1 ? (performanceSeries.length - 1) / (labelCount - 1) : 0;
  const performanceXLabels = Array.from({ length: labelCount }, (_, index) =>
    Math.round(index * labelStep),
  )
    .filter((index, position, list) => list.indexOf(index) === position)
    .filter((index) => performanceSeries[index])
    .map((index) => formatDateDisplay(performanceSeries[index].date));
  const tooltipDates = performanceSeries.map((point) => point.date);

  const dividendBars = useMemo(() => {
    if (transactions.length === 0) {
      return [];
    }
    const now = new Date();
    const months = Array.from({ length: 4 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (3 - index), 1);
      const label = date.toLocaleString("default", { month: "short" });
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      return { label, key };
    });
    const totals = new Map(months.map((month) => [month.key, 0]));
    transactions.forEach((transaction) => {
      if (transaction.transaction_type !== "income") {
        return;
      }
      const monthKey = transaction.occurred_at.split("T")[0]?.slice(0, 7);
      if (!monthKey || !totals.has(monthKey)) {
        return;
      }
      const current = totals.get(monthKey) ?? 0;
      totals.set(
        monthKey,
        current + convertAmount(transaction.amount, transaction.currency_code, displayCurrency),
      );
    });
    return months.map((month) => ({
      label: month.label,
      value: Math.round(totals.get(month.key) ?? 0),
    }));
  }, [displayCurrency, transactions]);

  const stockAllocation = useMemo(() => {
    if (filteredHoldings.length === 0) {
      return [];
    }
    const colorPalette = [
      "#7f5bff",
      "#43d6b1",
      "#f7b955",
      "#5b6cff",
      "#ff7aa2",
      "#6bdcff",
      "#ffa36b",
    ];
    const totals = filteredHoldings.reduce<Record<string, number>>((acc, holding) => {
      const effectivePrice = holding.price ?? holding.avgEntry;
      if (!effectivePrice) {
        return acc;
      }
      const value = convertAmount(
        effectivePrice * holding.shares,
        holding.currency,
        displayCurrency,
      );
      const key = holding.ticker;
      acc[key] = (acc[key] ?? 0) + value;
      return acc;
    }, {});
    const entries = Object.entries(totals);
    if (entries.length === 0) {
      return [];
    }
    return entries
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], index) => ({
        label,
        value,
        color: colorPalette[index % colorPalette.length],
      }));
  }, [displayCurrency, filteredHoldings]);

  const totalEquity = filteredHoldings.reduce((sum, holding) => {
    const effectivePrice = holding.price ?? holding.avgEntry;
    if (!effectivePrice) {
      return sum;
    }
    return (
      sum +
      convertAmount(effectivePrice * holding.shares, holding.currency, displayCurrency)
    );
  }, 0);

  const equitySeries = useMemo(() => {
    if (performanceSeries.length === 0) {
      return [];
    }
    const netChange = performanceSeries.reduce((sum, point) => sum + point.value, 0);
    const scaledTotalEquity = totalEquity * selectionScale;
    const baseline = scaledTotalEquity - netChange;
    let running = 0;
    return performanceSeries.map((point) => {
      running += point.value;
      return {
        date: point.date,
        value: Math.round(baseline + running),
      };
    });
  }, [performanceSeries, selectionScale, totalEquity]);

  const performancePoints = equitySeries.map((point) => point.value);
  const performanceMax =
    performancePoints.length > 0 ? Math.max(...performancePoints) : 0;
  const performanceMin =
    performancePoints.length > 0 ? Math.min(...performancePoints) : 0;
  const rangeSpan = performanceMax - performanceMin;
  const safeSpan = rangeSpan === 0 ? Math.max(1, Math.abs(performanceMax) * 0.1) : rangeSpan;
  const topValue = rangeSpan === 0 ? performanceMax + safeSpan / 2 : performanceMax;
  const bottomValue = rangeSpan === 0 ? performanceMin - safeSpan / 2 : performanceMin;
  const performanceMidpoint = Math.round((topValue + bottomValue) / 2);
  const performanceYLabels = [
    formatCurrency(topValue, displayCurrency),
    formatCurrency(Math.round(topValue - safeSpan * 0.25), displayCurrency),
    formatCurrency(performanceMidpoint, displayCurrency),
    formatCurrency(Math.round(bottomValue + safeSpan * 0.25), displayCurrency),
    formatCurrency(bottomValue, displayCurrency),
  ];

  const dayChange = filteredHoldings.reduce((sum, holding) => {
    if (!holding.price || holding.change === null) {
      return sum;
    }
    const holdingValue = holding.price * holding.shares;
    const changeValue = (holding.change / 100) * holdingValue;
    return sum + convertAmount(changeValue, holding.currency, displayCurrency);
  }, 0);

  const totalMarketValue = filteredHoldings.reduce((sum, holding) => {
    if (!holding.price) {
      return sum;
    }
    return (
      sum +
      convertAmount(holding.price * holding.shares, holding.currency, displayCurrency)
    );
  }, 0);

  const incomeLastYear = useMemo(() => {
    if (transactions.length === 0) {
      return 0;
    }
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    return transactions.reduce((sum, transaction) => {
      if (transaction.transaction_type !== "income") {
        return sum;
      }
      const occurredAt = new Date(transaction.occurred_at);
      if (occurredAt < cutoff) {
        return sum;
      }
      return (
        sum +
        convertAmount(transaction.amount, transaction.currency_code, displayCurrency)
      );
    }, 0);
  }, [displayCurrency, transactions]);

  if (isLoading) {
    return (
      <section className="page">
        <LoadingSkeleton label="Loading assets" lines={7} />
      </section>
    );
  }

  if (error) {
    return (
      <section className="page">
        <div className="card page-state error">
          <p>{error}</p>
          <button className="pill" type="button" onClick={loadData}>
            Retry
          </button>
        </div>
      </section>
    );
  }

  const equityTrendValue =
    performancePoints.length > 1
      ? ((performancePoints[performancePoints.length - 1] - performancePoints[0]) /
          Math.max(Math.abs(performancePoints[0]), 1)) *
        100
      : 0;
  const equityTrend = `${equityTrendValue >= 0 ? "+" : ""}${equityTrendValue.toFixed(1)}%`;
  const incomeYieldValue = totalMarketValue === 0 ? 0 : (incomeLastYear / totalMarketValue) * 100;
  const incomeYield = `${incomeYieldValue.toFixed(1)}%`;
  const dayChangePercent =
    totalMarketValue === 0 ? 0 : (dayChange / Math.max(totalMarketValue, 1)) * 100;
  const dayChangeTrend = `${dayChangePercent >= 0 ? "+" : ""}${dayChangePercent.toFixed(1)}%`;
  const lastPriceLabel = lastPriceUpdate
    ? new Date(lastPriceUpdate).toLocaleString()
    : "Not yet";
  const dataSourceLabelMap: Record<string, string> = {
    stooq: "Stooq pricing",
    manual: "Manual uploads",
    broker: "Broker APIs",
    custom: "Custom feed",
  };
  const dataSourceLabel = dataSourceLabelMap[assetDataSource] ?? "Custom feed";
  const formatPercent = (value: number | null) => {
    if (value === null || Number.isNaN(value)) {
      return "—";
    }
    const percent = value * 100;
    return `${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%`;
  };
  const benchmarkLabel = performanceMetrics[0]?.benchmark_label ?? "Benchmark";
  const benchmarkReturn = performanceMetrics[0]?.benchmark_return ?? null;

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>{pageTitles.stocks}</h1>
          <p className="muted">Track holdings, dividends, and live price momentum.</p>
          <p className="muted">Price source: {dataSourceLabel}.</p>
          <p className="muted">Refresh cadence: {assetRefreshCadence}.</p>
          <p className="muted">Last price refresh: {lastPriceLabel}.</p>
        </div>
        <div className="toolbar">
          <DateRangePicker value={range} onChange={setRange} />
          <button
            className="pill primary"
            onClick={() => setIsHoldingOpen(true)}
          >
            Add Holding
          </button>
          <button
            className="pill"
            onClick={handleSyncQuotes}
          >
            Sync Quotes
          </button>
        </div>
      </header>
      <Modal
        title="Add holding"
        description="Add a ticker, shares, and cost basis for tracking."
        isOpen={isHoldingOpen}
        onClose={() => setIsHoldingOpen(false)}
        footer={
          <>
            <button className="pill" type="button" onClick={() => setIsHoldingOpen(false)}>
              Cancel
            </button>
            <button
              className="pill primary"
              type="button"
              onClick={async () => {
                const normalizedTicker = holdingTicker.trim().toUpperCase();
                if (!normalizedTicker) {
                  showToast("Ticker required", "Enter a ticker symbol to continue.");
                  return;
                }
                const shares = Number(holdingShares);
                if (!shares) {
                  showToast("Missing details", "Enter shares to save.");
                  return;
                }
                const price = holdingPrice ? Number(holdingPrice) : null;
                const accountId = accountIdByName.get(holdingAccount);
                if (!accountId) {
                  showToast("Account required", "Select an account to continue.");
                  return;
                }
                const currencyCode = currencyFromSymbol(normalizedTicker);
                try {
                  const createdAsset = await post<Asset>("/api/assets", {
                    account_id: accountId,
                    symbol: normalizedTicker,
                    asset_type: "Stock",
                    quantity: shares,
                    currency_code: currencyCode,
                  });
                  const nextStrategies = {
                    ...holdingStrategies,
                    [createdAsset.id]: holdingStrategy,
                  };
                  setHoldingStrategies(nextStrategies);
                  try {
                    await updatePreferences({ holdingStrategies: nextStrategies });
                  } catch (err) {
                    showToast(
                      "Strategy update failed",
                      getFriendlyErrorMessage(
                        err,
                        "Holding saved, but strategy updates could not be stored.",
                      ),
                    );
                  }
                  setHoldings((prev) => [
                    {
                      id: createdAsset.id,
                      ticker: createdAsset.symbol,
                      shares: createdAsset.quantity,
                      avgEntry: price,
                      price,
                      change: null,
                      currency: createdAsset.currency_code,
                      assetType: createdAsset.asset_type,
                      account: holdingAccount,
                      entryDate: holdingDate,
                    },
                    ...prev,
                  ]);
                  const refreshResponse = await post<{ updated: number }>(
                    "/api/assets/refresh-prices",
                    {},
                  );
                  const pricesResponse = await get<AssetPrice[]>("/api/assets/prices");
                  applyPriceUpdates(pricesResponse);
                  setLastPriceUpdate(getLatestPriceTimestamp(pricesResponse));
                  const priceInfo = pricesResponse.find(
                    (item) => item.asset_id === createdAsset.id,
                  );
                  if (!priceInfo?.price) {
                    showToast(
                      "Price unavailable",
                      `No price found for ${normalizedTicker}. Check the ticker.`,
                    );
                  } else if (refreshResponse.updated > 0) {
                    showToast(
                      "Holding saved",
                      `Added ${normalizedTicker} to ${holdingAccount}.`,
                    );
                  } else {
                    showToast(
                      "Holding saved",
                      `Added ${normalizedTicker} to ${holdingAccount}.`,
                    );
                  }
                } catch (err) {
                  showToast(
                    "Save failed",
                    getFriendlyErrorMessage(err, "Unable to save holding."),
                  );
                  return;
                }
                setIsHoldingOpen(false);
                setHoldingTicker("");
                setHoldingShares("");
                setHoldingPrice("");
                setHoldingDate(getTodayDate());
                setHoldingStrategy("Long Term");
              }}
            >
              Save Holding
            </button>
          </>
        }
      >
        <div className="form-grid">
          <label>
            Ticker
            <input
              type="text"
              placeholder="AAPL"
              value={holdingTicker}
              list="stock-symbols"
              onChange={(event) =>
                setHoldingTicker(event.target.value.toUpperCase())
              }
            />
          </label>
          <datalist id="stock-symbols">
            {symbolSuggestions.map((symbol) => (
              <option key={symbol} value={symbol} />
            ))}
          </datalist>
          <label>
            Shares
            <input
              type="number"
              placeholder="0"
              value={holdingShares}
              onChange={(event) => setHoldingShares(event.target.value)}
            />
          </label>
          <label>
            Price
            <input
              type="number"
              placeholder="0.00"
              value={holdingPrice}
              onChange={(event) => setHoldingPrice(event.target.value)}
            />
          </label>
          <label>
            Account
            <select
              value={holdingAccount}
              onChange={(event) => setHoldingAccount(event.target.value)}
            >
              {accountOptions.map((account) => (
                <option key={account} value={account}>
                  {account}
                </option>
              ))}
            </select>
          </label>
          <label>
            Purchase date
            <input
              type="date"
              value={holdingDate}
              aria-describedby="holding-date-helper"
              onChange={(event) => setHoldingDate(event.target.value)}
            />
            <span className="input-helper" id="holding-date-helper">
              {formatDateDisplay(holdingDate)}
            </span>
          </label>
          <label>
            Strategy
            <select
              value={holdingStrategy}
              onChange={(event) => setHoldingStrategy(event.target.value)}
              disabled={isPreferencesLoading}
            >
              {isPreferencesLoading ? (
                <option value="">Loading strategies…</option>
              ) : (
                strategies.map((strategy) => (
                  <option key={strategy} value={strategy}>
                    {strategy}
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
        </div>
      </Modal>
      <Modal
        title="Confirm changes"
        description="Review the updates before applying."
        isOpen={isReviewOpen}
        onClose={() => setIsReviewOpen(false)}
        footer={
          <>
            <button className="pill" type="button" onClick={() => setIsReviewOpen(false)}>
              Cancel
            </button>
            <button className="pill primary" type="button" onClick={applyPendingChanges}>
              Apply changes
            </button>
          </>
        }
      >
        <div className="confirm-list">
          {pendingStrategyEntries.length === 0 && selectedHoldings.size === 0 ? (
            <p className="muted">No changes pending.</p>
          ) : (
            <>
              {Object.keys(pendingHoldings).length > 0 ? (
                <div className="confirm-section">
                  <h4>Holding edits</h4>
                  <ul>
                    {Object.entries(pendingHoldings).map(([id, edits]) => {
                      const holding = holdings.find((item) => item.id === id);
                      const name = holding?.ticker ?? id;
                      return (
                        <li key={id}>
                          {name}
                          {edits.ticker ? ` → ${edits.ticker}` : ""}
                          {edits.shares !== undefined ? `, shares → ${edits.shares}` : ""}
                          {edits.currency ? `, currency → ${edits.currency}` : ""}
                          {edits.accountName ? `, account → ${edits.accountName}` : ""}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
              {pendingStrategyEntries.length > 0 ? (
                <div className="confirm-section">
                  <h4>Strategy updates</h4>
                  <ul>
                    {pendingStrategyEntries.map(([id, value]) => {
                      const holding = holdings.find((item) => item.id === id);
                      return (
                        <li key={id}>
                          {holding?.ticker ?? id}: {holdingStrategies[id] ?? "Unassigned"} → {value}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
              {selectedHoldings.size > 0 ? (
                <div className="confirm-section">
                  <h4>Deletions</h4>
                  <ul>
                    {Array.from(selectedHoldings).map((id) => {
                      const holding = holdings.find((item) => item.id === id);
                      return <li key={id}>{holding?.ticker ?? id}</li>;
                    })}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>
      </Modal>
      {toast && <ActionToast toast={toast} onDismiss={() => setToast(null)} />}
      <div className="card-grid">
        <KpiCard
          label="Total Equity"
          value={formatCurrency(totalEquity, displayCurrency)}
          trend={equityTrend}
          footnote="vs last period"
        />
        <KpiCard
          label="Income Yield"
          value={incomeYield}
          trend={totalMarketValue === 0 ? "No data" : "Stable"}
          footnote="income over last 12 months"
        />
        <KpiCard
          label="Day Change"
          value={formatCurrency(dayChange, displayCurrency)}
          trend={dayChangeTrend}
          footnote="market open"
        />
      </div>
      <div className="card">
        <h3>Performance vs benchmark</h3>
        <p className="muted">
          Returns compare the first and latest price snapshots for each holding.
        </p>
        {performanceMetrics.length === 0 ? (
          <p className="muted">No performance data yet.</p>
        ) : (
          <div className="table compact">
            <div className="table-row table-header columns-3">
              <span>Asset</span>
              <span>Return</span>
              <span>{benchmarkLabel}</span>
            </div>
            {performanceMetrics.map((metric) => (
              <div className="table-row columns-3" key={metric.asset_id}>
                <span>{metric.symbol}</span>
                <span>{formatPercent(metric.return_pct)}</span>
                <span>{formatPercent(benchmarkReturn)}</span>
              </div>
            ))}
          </div>
        )}
        <p className="muted small">
          Benchmark data is a composite based on your holdings’ start and latest pricing.
        </p>
      </div>
      <div className="card">
        <h3>Action center</h3>
        <p className="muted">Quick shortcuts for your portfolio.</p>
        <div className="action-grid">
          <button
            className="pill"
            onClick={() => showToast("Import ready", "Upload a broker CSV file.")}
          >
            Import holdings
          </button>
          <button
            className="pill"
            onClick={() => showToast("Alert created", "Price trigger saved.")}
          >
            Create alert
          </button>
          <button
            className="pill"
            onClick={() => showToast("Rebalance started", "Suggested trades generated.")}
          >
            Rebalance
          </button>
          <button
            className="pill"
            onClick={() => showToast("Note added", "Insights saved to journal.")}
          >
            Add note
          </button>
        </div>
      </div>
      <div className="card chart-card">
        <div className="chart-header">
          <div>
            <h3>Portfolio performance</h3>
            <p className="muted">Equity value within the selected range.</p>
          </div>
          <button
            className="pill"
            onClick={() => showToast("Benchmark applied", "Comparing to S&P 500.")}
          >
            Compare Benchmark
          </button>
        </div>
        {isFiltering ? (
          <LoadingSkeleton label="Refreshing chart" lines={4} />
        ) : (
          <div className="chart-surface chart-axis-surface">
            <LineChart
              points={performancePoints}
              labels={tooltipDates}
              formatLabel={formatDateDisplay}
              formatValue={(value) => formatCurrency(value, displayCurrency)}
              showAxisLabels={false}
            />
            <span className="chart-axis-title y">Value</span>
            <span className="chart-axis-title x">Date</span>
            <div className="chart-axis-y">
              {performanceYLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className="chart-axis-x">
              {performanceXLabels.map((label, index) => (
                <span key={`${label}-${index}`}>{label}</span>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="split-grid">
        <div className="card">
          <h3>Income cashflow</h3>
          <p className="muted">Monthly income distribution from recorded transactions.</p>
          {dividendBars.length === 0 ? (
            <p className="muted">No income activity yet.</p>
          ) : (
            <BarChart
              values={dividendBars}
              formatValue={(value) => formatCurrency(value, displayCurrency)}
            />
          )}
        </div>
        <div className="card">
          <h3>Stock allocation</h3>
          <p className="muted">Allocation by market value.</p>
          {stockAllocation.length === 0 ? (
            <p className="muted">No allocations yet.</p>
          ) : (
            <>
              <DonutChart
                values={stockAllocation}
                formatValue={(value) => formatCurrency(value, displayCurrency)}
              />
              <div className="legend">
                {stockAllocation.map((item) => (
                  <div key={item.label} className="legend-item">
                    <span className="legend-dot" style={{ background: item.color }} />
                    {item.label}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <div className="card list-card holdings-table">
        <div className="list-actions">
          <button
            className="pill"
            type="button"
            onClick={() => {
              setIsEditMode((prev) => !prev);
              setSelectedHoldings(new Set());
              setPendingStrategies({});
              setPendingHoldings({});
            }}
          >
            {isEditMode ? "Exit edit mode" : "Edit holdings"}
          </button>
          {isEditMode ? (
            <>
              <button
                className="pill"
                type="button"
                onClick={() => {
                  setSelectedHoldings(
                    new Set(filteredHoldings.map((holding) => holding.id)),
                  );
                }}
              >
                Select all
              </button>
              <button className="pill" type="button" onClick={handleDeleteSelected}>
                Delete selected
              </button>
              <button className="pill primary" type="button" onClick={() => setIsReviewOpen(true)}>
                Review changes
              </button>
            </>
          ) : null}
        </div>
        <div className="list-row list-header columns-7">
          <span>Ticker</span>
          <span>Shares</span>
          <span>Avg Entry</span>
          <span>Last Price</span>
          <span>Market Value ({displayCurrency})</span>
          <span>Day Change</span>
          <span>Account</span>
        </div>
        {isFiltering ? (
          <LoadingSkeleton label="Refreshing holdings" lines={6} />
        ) : filteredHoldings.length === 0 ? (
          <EmptyState
            title={holdings.length === 0 ? "No holdings yet" : "No holdings match this view"}
            description="Holdings track your assets, prices, and allocation across accounts."
            actionLabel="Add holding"
            actionHint="Add a stock or ETF position to start tracking."
            onAction={() => setIsHoldingOpen(true)}
          />
        ) : (
          filteredHoldings.map((row) => {
            const currentStrategy = holdingStrategies[row.id] ?? "Unassigned";
            const pendingStrategy = pendingStrategies[row.id];
            const pendingHolding = pendingHoldings[row.id];
            const isSelected = selectedHoldings.has(row.id);
            const isEdited =
              (pendingStrategy && pendingStrategy !== currentStrategy) ||
              Boolean(pendingHolding);
            return (
              <div
                className={`list-row columns-7 ${isSelected ? "row-selected" : ""} ${
                  isEdited ? "row-edited" : ""
                }`}
                key={row.id}
              >
                <span className="cell-inline">
                  {isEditMode ? (
                    <button
                      type="button"
                      className={`select-pill ${isSelected ? "active" : ""}`}
                      onClick={() => toggleHoldingSelection(row.id)}
                    >
                      {isSelected ? "Selected" : "Select"}
                    </button>
                  ) : null}
                  {isEditMode ? (
                    <input
                      type="text"
                      value={pendingHolding?.ticker ?? row.ticker}
                      onChange={(event) => {
                        const value = event.target.value.toUpperCase();
                        setPendingHoldings((prev) => ({
                          ...prev,
                          [row.id]: { ...prev[row.id], ticker: value },
                        }));
                      }}
                    />
                  ) : (
                    row.ticker
                  )}
                </span>
                <span>
                  {isEditMode ? (
                    <input
                      type="number"
                      value={pendingHolding?.shares ?? row.shares}
                      onChange={(event) =>
                        setPendingHoldings((prev) => ({
                          ...prev,
                          [row.id]: { ...prev[row.id], shares: Number(event.target.value) },
                        }))
                      }
                    />
                  ) : (
                    row.shares
                  )}
                </span>
                <span>
                  {row.avgEntry === null
                    ? "—"
                    : `${formatCurrency(row.avgEntry, row.currency)} ${row.currency}`}
                </span>
                <span>
                  {row.price === null
                    ? "—"
                    : `${formatCurrency(row.price, row.currency)} ${row.currency}`}
                </span>
                <span>
                  {row.price === null
                    ? "—"
                    : formatCurrency(
                        convertAmount(row.price * row.shares, row.currency, displayCurrency),
                        displayCurrency,
                      )}
                </span>
                <span
                  className={
                    row.change !== null && row.change < 0 ? "status warn" : "status"
                  }
                >
                  {row.change === null
                    ? "—"
                    : `${row.change > 0 ? "+" : ""}${row.change.toFixed(1)}%`}
                </span>
                <span className="cell-inline cell-stack">
                  {isEditMode ? (
                    <>
                      <select
                        value={pendingHolding?.accountId ?? accountIdByName.get(row.account) ?? ""}
                        onChange={(event) => {
                          const accountId = event.target.value;
                          const accountName =
                            accountOptions.find(
                              (account) => accountIdByName.get(account) === accountId,
                            ) ?? row.account;
                          setPendingHoldings((prev) => ({
                            ...prev,
                            [row.id]: {
                              ...prev[row.id],
                              accountId,
                              accountName,
                            },
                          }));
                        }}
                      >
                        {accountOptions.map((account) => (
                          <option key={account} value={accountIdByName.get(account)}>
                            {account}
                          </option>
                        ))}
                      </select>
                      <select
                        value={pendingHolding?.currency ?? row.currency}
                        onChange={(event) =>
                          setPendingHoldings((prev) => ({
                            ...prev,
                            [row.id]: { ...prev[row.id], currency: event.target.value },
                          }))
                        }
                      >
                        {supportedCurrencies.map((currencyOption) => (
                          <option key={currencyOption} value={currencyOption}>
                            {currencyOption}
                          </option>
                        ))}
                      </select>
                      <select
                        value={pendingStrategy ?? currentStrategy}
                        onChange={(event) => {
                          const value = event.target.value;
                          setPendingStrategies((prev) => {
                            const next = { ...prev };
                            if (value === currentStrategy) {
                              delete next[row.id];
                            } else {
                              next[row.id] = value;
                            }
                            return next;
                          });
                        }}
                      >
                        {["Unassigned", ...strategies].map((strategy) => (
                          <option key={strategy} value={strategy}>
                            {strategy}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    row.account
                  )}
                </span>
              </div>
            );
          })
        )}
        <div className="list-row columns-7 summary-row">
          <span>Total</span>
          <span>-</span>
          <span>-</span>
          <span>-</span>
          <span>-</span>
          <span>{formatCurrency(totalEquity, displayCurrency)}</span>
          <span>-</span>
        </div>
      </div>
      <div className="card list-card">
        <div className="card-header">
          <div>
            <h3>Recent holdings</h3>
            <p className="muted">Latest additions across your portfolio.</p>
          </div>
        </div>
        <div className="list-row list-header columns-6">
          <span>Date</span>
          <span>Side</span>
          <span>Ticker</span>
          <span>Shares</span>
          <span>Price</span>
          <span>Account</span>
        </div>
        {isFiltering ? (
          <LoadingSkeleton label="Refreshing trades" lines={4} />
        ) : filteredTrades.length === 0 ? (
          <EmptyState
            title={trades.length === 0 ? "No holdings yet" : "No holdings match this view"}
            description="Holdings show the most recent additions across your portfolios."
            actionLabel="Add holding"
            actionHint="Add a holding to start populating activity."
            onAction={() => setIsHoldingOpen(true)}
          />
        ) : (
          filteredTrades.map((trade) => (
            <div className="list-row columns-6" key={trade.id}>
              <span>{formatDateDisplay(trade.date)}</span>
              <span className={trade.side === "Sell" ? "status warn" : "status"}>
                {trade.side}
              </span>
              <span>{trade.ticker}</span>
              <span>{trade.shares}</span>
              <span>
                {trade.price === null
                  ? "—"
                  : `${formatCurrency(trade.price, trade.currency)} ${trade.currency}`}
              </span>
              <span>{trade.account}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
