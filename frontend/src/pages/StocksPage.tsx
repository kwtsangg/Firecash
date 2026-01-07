import { useEffect, useMemo, useState } from "react";
import ActionToast, { ActionToastData } from "../components/ActionToast";
import { BarChart, DonutChart, LineChart } from "../components/Charts";
import DateRangePicker, { DateRange } from "../components/DateRangePicker";
import KpiCard from "../components/KpiCard";
import Modal from "../components/Modal";
import { useCurrency } from "../components/CurrencyContext";
import { useSelection } from "../components/SelectionContext";
import { get, post } from "../utils/apiClient";
import { convertAmount, formatCurrency } from "../utils/currency";
import { formatDateDisplay } from "../utils/date";

type Account = {
  id: string;
  name: string;
};

type Asset = {
  id: string;
  account_id: string;
  symbol: string;
  asset_type: string;
  quantity: number;
  currency_code: string;
};

type HistoryPoint = {
  date: string;
  value: number;
};

type AssetPrice = {
  asset_id: string;
  price: number | null;
  currency_code: string;
  recorded_at: string | null;
};

type Holding = {
  id: string;
  ticker: string;
  shares: number;
  avgEntry: number | null;
  price: number | null;
  change: number;
  currency: string;
  assetType: string;
  account: string;
  entryDate: string;
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

function getTodayDate() {
  return new Date().toISOString().split("T")[0];
}

export default function StocksPage() {
  const { currency: displayCurrency } = useCurrency();
  const { account: selectedAccount, group: selectedGroup } = useSelection();
  const [toast, setToast] = useState<ActionToastData | null>(null);
  const [range, setRange] = useState<DateRange>({
    from: "2026-01-01",
    to: "2026-04-30",
  });
  const [isHoldingOpen, setIsHoldingOpen] = useState(false);
  const [holdingTicker, setHoldingTicker] = useState("");
  const [holdingShares, setHoldingShares] = useState("");
  const [holdingPrice, setHoldingPrice] = useState("");
  const [holdingDate, setHoldingDate] = useState(getTodayDate);
  const [holdingAccount, setHoldingAccount] = useState("");
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [accountsResponse, assetsResponse, historyResponse, pricesResponse] =
          await Promise.all([
            get<Account[]>("/api/accounts"),
            get<Asset[]>("/api/assets"),
            get<HistoryPoint[]>("/api/history"),
            get<AssetPrice[]>("/api/assets/prices"),
          ]);
        if (!isMounted) {
          return;
        }
        const accountMap = new Map(accountsResponse.map((item) => [item.id, item.name]));
        const priceMap = new Map(
          pricesResponse.map((price) => [price.asset_id, price]),
        );
        const mappedHoldings = assetsResponse.map((asset) => {
          const priceInfo = priceMap.get(asset.id);
          return {
            id: asset.id,
            ticker: asset.symbol,
            shares: asset.quantity,
            avgEntry: null,
            price: priceInfo?.price ?? null,
            change: 0,
            currency: priceInfo?.currency_code ?? asset.currency_code,
            assetType: asset.asset_type,
            account: accountMap.get(asset.account_id) ?? "Unknown",
            entryDate: "-",
          };
        });
        setAccounts(accountsResponse);
        setHoldings(mappedHoldings);
        setHistory(historyResponse);
        setHoldingAccount(accountsResponse[0]?.name ?? "");
        setTrades([]);
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
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const accountOptions = useMemo(
    () => accounts.map((account) => account.name),
    [accounts],
  );
  const accountIdByName = useMemo(
    () => new Map(accounts.map((account) => [account.name, account.id])),
    [accounts],
  );

  const showToast = (title: string, description?: string) => {
    setToast({ title, description });
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
      showToast("Quote sync failed", "Unable to refresh stock prices.");
    }
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
    return accountOptions.reduce<Record<string, string>>((acc, accountName) => {
      acc[accountName] = "Ungrouped";
      return acc;
    }, {});
  }, [accountOptions]);

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
    if (holdings.length === 0) {
      return [];
    }
    return [
      { label: "Jan", value: 240 },
      { label: "Feb", value: 180 },
      { label: "Mar", value: 320 },
      { label: "Apr", value: 210 },
    ];
  }, [holdings.length]);

  const sectorMix = useMemo(() => {
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
    const formatSector = (value: string) =>
      value
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (match) => match.toUpperCase());
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
      const key = holding.assetType || "Other";
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
        label: formatSector(label),
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
    if (!holding.price) {
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

  if (isLoading) {
    return (
      <section className="page">
        <div className="card page-state">Loading stocks...</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="page">
        <div className="card page-state error">{error}</div>
      </section>
    );
  }

  const equityTrend = totalMarketValue === 0 ? "0%" : "+3.8%";
  const dividendYield = totalMarketValue === 0 ? "0%" : "2.9%";
  const dayChangeTrend =
    totalMarketValue === 0 ? "0%" : dayChange >= 0 ? "+1.1%" : "-0.6%";

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Stocks</h1>
          <p className="muted">Track holdings, dividends, and live price momentum.</p>
          <p className="muted">Price source: Yahoo Finance (fallback: Stooq).</p>
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
                const currencyCode = normalizedTicker.endsWith(".HK") ? "HKD" : "USD";
                try {
                  const createdAsset = await post<Asset>("/api/assets", {
                    account_id: accountId,
                    symbol: normalizedTicker,
                    asset_type: "Stock",
                    quantity: shares,
                    currency_code: currencyCode,
                  });
                  setHoldings((prev) => [
                    {
                      id: createdAsset.id,
                      ticker: createdAsset.symbol,
                      shares: createdAsset.quantity,
                      avgEntry: price,
                      price,
                      change: 0,
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
                  showToast("Save failed", "Unable to save holding.");
                  return;
                }
                setTrades((prev) => [
                  {
                    id: `trade-${normalizedTicker}-${Date.now()}`,
                    ticker: normalizedTicker,
                    shares,
                    price,
                    currency: normalizedTicker.endsWith(".HK") ? "HKD" : "USD",
                    account: holdingAccount,
                    date: holdingDate,
                    side: "Buy",
                  },
                  ...prev,
                ]);
                setIsHoldingOpen(false);
                setHoldingTicker("");
                setHoldingShares("");
                setHoldingPrice("");
                setHoldingDate(getTodayDate());
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
              onChange={(event) =>
                setHoldingTicker(event.target.value.toUpperCase())
              }
            />
          </label>
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
              onChange={(event) => setHoldingDate(event.target.value)}
            />
          </label>
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
          label="Dividend Yield"
          value={dividendYield}
          trend={totalMarketValue === 0 ? "No data" : "Stable"}
          footnote="trailing 12 months"
        />
        <KpiCard
          label="Day Change"
          value={formatCurrency(dayChange, displayCurrency)}
          trend={dayChangeTrend}
          footnote="market open"
        />
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
        <div className="chart-surface chart-axis-surface">
          <LineChart
            points={performancePoints}
            labels={tooltipDates}
            formatLabel={formatDateDisplay}
            formatValue={(value) => formatCurrency(value, displayCurrency)}
          />
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
      </div>
      <div className="split-grid">
        <div className="card">
          <h3>Dividend cashflow</h3>
          <p className="muted">Quarterly income distribution.</p>
          {dividendBars.length === 0 ? (
            <p className="muted">No dividend activity yet.</p>
          ) : (
            <BarChart values={dividendBars} />
          )}
        </div>
        <div className="card">
          <h3>Sector allocation</h3>
          <p className="muted">Diversification across industries.</p>
          {sectorMix.length === 0 ? (
            <p className="muted">No allocations yet.</p>
          ) : (
            <>
              <DonutChart
                values={sectorMix}
                formatValue={(value) => formatCurrency(value, displayCurrency)}
              />
              <div className="legend">
                {sectorMix.map((item) => (
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
      <div className="card list-card">
        <div className="list-row list-header columns-7">
          <span>Ticker</span>
          <span>Shares</span>
          <span>Avg Entry</span>
          <span>Last Price</span>
          <span>Market Value ({displayCurrency})</span>
          <span>Day Change</span>
          <span>Account</span>
        </div>
        {filteredHoldings.length === 0 ? (
          <div className="list-row columns-7 empty-state">No holdings available.</div>
        ) : (
          filteredHoldings.map((row) => (
            <div className="list-row columns-7" key={row.id}>
              <span>{row.ticker}</span>
              <span>{row.shares}</span>
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
              <span className={row.change < 0 ? "status warn" : "status"}>
                {row.change > 0 ? "+" : ""}
                {row.change.toFixed(1)}%
              </span>
              <span>{row.account}</span>
            </div>
          ))
        )}
        <div className="list-row columns-7 summary-row">
          <span>Total</span>
          <span>-</span>
          <span>-</span>
          <span>-</span>
          <span>{formatCurrency(totalEquity, displayCurrency)}</span>
          <span>-</span>
          <span>-</span>
        </div>
      </div>
      <div className="card list-card">
        <div className="card-header">
          <div>
            <h3>Recent trades</h3>
            <p className="muted">Individual fills for your stock activity.</p>
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
        {filteredTrades.length === 0 ? (
          <div className="list-row columns-6 empty-state">No trades recorded.</div>
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
      <div className="card">
        <h3>Action center</h3>
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
    </section>
  );
}
