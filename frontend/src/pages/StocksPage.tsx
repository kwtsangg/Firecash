import { useMemo, useState } from "react";
import ActionToast, { ActionToastData } from "../components/ActionToast";
import { BarChart, DonutChart, LineChart } from "../components/Charts";
import DateRangePicker, { DateRange } from "../components/DateRangePicker";
import KpiCard from "../components/KpiCard";
import Modal from "../components/Modal";
import { useCurrency } from "../components/CurrencyContext";
import { useSelection } from "../components/SelectionContext";
import { convertAmount, formatCurrency } from "../utils/currency";

type Holding = {
  id: string;
  ticker: string;
  shares: number;
  avgEntry: number;
  price: number;
  change: number;
  currency: string;
  account: string;
  entryDate: string;
};

type Trade = {
  id: string;
  ticker: string;
  shares: number;
  price: number;
  currency: string;
  account: string;
  date: string;
  side: "Buy" | "Sell";
};

export default function StocksPage() {
  const accountOptions = ["Primary Account", "Retirement", "HKD Growth"];
  const supportedTickers = new Set(["AAPL", "TSLA", "0700.HK", "MSFT", "NVDA"]);
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
  const [holdingDate, setHoldingDate] = useState("2026-04-20");
  const [holdingAccount, setHoldingAccount] = useState(accountOptions[0]);
  const [holdings, setHoldings] = useState<Holding[]>([
    {
      id: "AAPL-2026-01-15",
      ticker: "AAPL",
      shares: 42,
      avgEntry: 168.2,
      price: 182.14,
      change: 1.4,
      currency: "USD",
      account: "Primary Account",
      entryDate: "2026-01-15",
    },
    {
      id: "TSLA-2026-02-11",
      ticker: "TSLA",
      shares: 16,
      avgEntry: 192.4,
      price: 175.22,
      change: -0.6,
      currency: "USD",
      account: "Retirement",
      entryDate: "2026-02-11",
    },
    {
      id: "0700.HK-2026-03-03",
      ticker: "0700.HK",
      shares: 55,
      avgEntry: 282.1,
      price: 296.1,
      change: 0.9,
      currency: "HKD",
      account: "HKD Growth",
      entryDate: "2026-03-03",
    },
  ]);
  const [trades, setTrades] = useState<Trade[]>([
    {
      id: "trade-aapl-2026-01-15",
      ticker: "AAPL",
      shares: 42,
      price: 168.2,
      currency: "USD",
      account: "Primary Account",
      date: "2026-01-15",
      side: "Buy",
    },
    {
      id: "trade-tsla-2026-02-11",
      ticker: "TSLA",
      shares: 16,
      price: 192.4,
      currency: "USD",
      account: "Retirement",
      date: "2026-02-11",
      side: "Buy",
    },
    {
      id: "trade-0700-2026-03-03",
      ticker: "0700.HK",
      shares: 55,
      price: 282.1,
      currency: "HKD",
      account: "HKD Growth",
      date: "2026-03-03",
      side: "Buy",
    },
  ]);

  const showToast = (title: string, description?: string) => {
    setToast({ title, description });
  };

  const performanceSeries = useMemo(
    () => [
      { date: "2026-01-08", value: 120 },
      { date: "2026-01-28", value: 132 },
      { date: "2026-02-18", value: 128 },
      { date: "2026-03-10", value: 136 },
      { date: "2026-03-22", value: 142 },
      { date: "2026-04-02", value: 150 },
      { date: "2026-04-18", value: 147 },
      { date: "2026-05-06", value: 158 },
      { date: "2026-06-12", value: 162 },
      { date: "2026-07-08", value: 171 },
      { date: "2026-08-14", value: 176 },
      { date: "2026-09-03", value: 188 },
    ],
    [],
  );
  const performanceSeriesFiltered = useMemo(() => {
    const fromDate = new Date(range.from);
    const toDate = new Date(range.to);
    const filtered = performanceSeries
      .filter((point) => {
        const date = new Date(point.date);
        return date >= fromDate && date <= toDate;
      });
    return filtered.length > 0 ? filtered : performanceSeries;
  }, [performanceSeries, range.from, range.to]);
  const performancePoints = performanceSeriesFiltered.map((point) => point.value);
  const performanceMax = Math.max(...performancePoints);
  const performanceMin = Math.min(...performancePoints);
  const performanceMidpoint = Math.round((performanceMax + performanceMin) / 2);
  const performanceYLabels = [
    { label: formatCurrency(performanceMax, displayCurrency), position: 12 },
    { label: formatCurrency(performanceMidpoint, displayCurrency), position: 52 },
    { label: formatCurrency(performanceMin, displayCurrency), position: 92 },
  ];
  const performanceLabelIndexes = [
    0,
    Math.floor((performanceSeriesFiltered.length - 1) / 2),
    Math.max(performanceSeriesFiltered.length - 1, 0),
  ];
  const performanceXLabels = Array.from(new Set(performanceLabelIndexes))
    .filter((index) => performanceSeriesFiltered[index])
    .map((index) => ({
      label: new Date(performanceSeriesFiltered[index].date).toLocaleString("en-US", {
        month: "short",
      }),
      position: (index / Math.max(performanceSeriesFiltered.length - 1, 1)) * 94 + 3,
    }));
  const dividendBars = useMemo(
    () => [
      { label: "Jan", value: 240 },
      { label: "Feb", value: 180 },
      { label: "Mar", value: 320 },
      { label: "Apr", value: 210 },
    ],
    [],
  );
  const sectorMix = useMemo(
    () => [
      { label: "Tech", value: 45, color: "#7f5bff" },
      { label: "Healthcare", value: 22, color: "#43d6b1" },
      { label: "Finance", value: 18, color: "#f7b955" },
      { label: "Energy", value: 15, color: "#5b6cff" },
    ],
    [],
  );
  const accountGroups: Record<string, string> = {
    "Primary Account": "Cashflow",
    Retirement: "Investments",
    "HKD Growth": "Investments",
  };
  const matchesSelection = (account: string) =>
    (selectedAccount === "All Accounts" || selectedAccount === account) &&
    (selectedGroup === "All Groups" || accountGroups[account] === selectedGroup);
  const filteredHoldings = holdings.filter((holding) =>
    matchesSelection(holding.account),
  );
  const filteredTrades = trades.filter((trade) => matchesSelection(trade.account));
  const totalEquity = filteredHoldings.reduce(
    (sum, holding) =>
      sum + convertAmount(holding.price * holding.shares, holding.currency, displayCurrency),
    0,
  );
  const dayChange = filteredHoldings.reduce((sum, holding) => {
    const holdingValue = holding.price * holding.shares;
    const changeValue = (holding.change / 100) * holdingValue;
    return sum + convertAmount(changeValue, holding.currency, displayCurrency);
  }, 0);
  const totalMarketValue = filteredHoldings.reduce(
    (sum, holding) =>
      sum + convertAmount(holding.price * holding.shares, holding.currency, displayCurrency),
    0,
  );

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Stocks</h1>
          <p className="muted">Track holdings, dividends, and live price momentum.</p>
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
            onClick={() => {
              setHoldings((prev) =>
                prev.map((holding) => {
                  const updatedPrice = Number((holding.price * 1.01).toFixed(2));
                  const updatedChange = Number((holding.change + 0.4).toFixed(1));
                  return {
                    ...holding,
                    price: updatedPrice,
                    change: updatedChange,
                  };
                }),
              );
              showToast("Quotes syncing", "Refreshing stock prices.");
            }}
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
              onClick={() => {
                const normalizedTicker = holdingTicker.trim().toUpperCase();
                if (!normalizedTicker || !supportedTickers.has(normalizedTicker)) {
                  showToast("Ticker not found", "Select a supported symbol to continue.");
                  return;
                }
                const shares = Number(holdingShares);
                const price = Number(holdingPrice);
                if (!shares || !price) {
                  showToast("Missing details", "Enter shares and price to save.");
                  return;
                }
                setHoldings((prev) => [
                  {
                    id: `${normalizedTicker}-${Date.now()}`,
                    ticker: normalizedTicker,
                    shares,
                    avgEntry: price,
                    price,
                    change: 0,
                    currency: normalizedTicker.endsWith(".HK") ? "HKD" : "USD",
                    account: holdingAccount,
                    entryDate: holdingDate,
                  },
                  ...prev,
                ]);
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
                setHoldingDate("2026-04-20");
                showToast("Holding saved", `Added ${normalizedTicker} to ${holdingAccount}.`);
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
              onChange={(event) => setHoldingTicker(event.target.value)}
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
          trend="+3.8%"
          footnote="vs last period"
        />
        <KpiCard
          label="Dividend Yield"
          value="2.9%"
          trend="Stable"
          footnote="trailing 12 months"
        />
        <KpiCard
          label="Day Change"
          value={formatCurrency(dayChange, displayCurrency)}
          trend={dayChange >= 0 ? "+1.1%" : "-0.6%"}
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
        <div className="chart-surface">
          <LineChart
            points={performancePoints}
            xLabels={performanceXLabels}
            yLabels={performanceYLabels}
          />
        </div>
      </div>
      <div className="split-grid">
        <div className="card">
          <h3>Dividend cashflow</h3>
          <p className="muted">Quarterly income distribution.</p>
          <BarChart values={dividendBars} />
        </div>
        <div className="card">
          <h3>Sector allocation</h3>
          <p className="muted">Diversification across industries.</p>
          <DonutChart values={sectorMix} />
          <div className="legend">
            {sectorMix.map((item) => (
              <div key={item.label} className="legend-item">
                <span className="legend-dot" style={{ background: item.color }} />
                {item.label}
              </div>
            ))}
          </div>
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
        {filteredHoldings.map((row) => (
          <div className="list-row columns-7" key={row.id}>
            <span>{row.ticker}</span>
            <span>{row.shares}</span>
            <span>
              {row.currency === "HKD" ? "HK$" : "$"}
              {row.avgEntry.toFixed(2)}
            </span>
            <span>
              {row.currency === "HKD" ? "HK$" : "$"}
              {row.price.toFixed(2)}
            </span>
            <span>
              {formatCurrency(
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
        ))}
        <div className="list-row columns-7 summary-row">
          <span>Total</span>
          <span>-</span>
          <span>-</span>
          <span>-</span>
          <span>{formatCurrency(totalMarketValue, displayCurrency)}</span>
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
        {filteredTrades.map((trade) => (
          <div className="list-row columns-6" key={trade.id}>
            <span>{trade.date}</span>
            <span className={trade.side === "Sell" ? "status warn" : "status"}>
              {trade.side}
            </span>
            <span>{trade.ticker}</span>
            <span>{trade.shares}</span>
            <span>
              {formatCurrency(trade.price, trade.currency)} {trade.currency}
            </span>
            <span>{trade.account}</span>
          </div>
        ))}
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
