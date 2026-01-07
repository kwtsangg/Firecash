import { useEffect, useMemo, useState } from "react";
import { CandlestickChart } from "../components/Charts";
import { get } from "../utils/apiClient";
import { formatCurrency } from "../utils/currency";
import { formatDateDisplay } from "../utils/date";

type Asset = {
  id: string;
  symbol: string;
};

type Candle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
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

const RANGE_PRESETS = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
  { label: "Max", days: null },
];

const OVERVIEW_SYMBOLS = [
  { label: "S&P 500 (SPY)", symbol: "SPY" },
  { label: "Nasdaq 100 (QQQ)", symbol: "QQQ" },
  { label: "Dow 30 (DIA)", symbol: "DIA" },
];

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

export default function StockMarketPage() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [rangeDays, setRangeDays] = useState<number | null>(90);
  const [overview, setOverview] = useState<
    { label: string; symbol: string; price: number | null; change: number | null }[]
  >([]);
  const displayCurrency = selectedSymbol ? currencyFromSymbol(selectedSymbol) : "USD";

  useEffect(() => {
    let isMounted = true;
    const loadSymbols = async () => {
      try {
        const assets = await get<Asset[]>("/api/assets");
        if (!isMounted) {
          return;
        }
        const assetSymbols = assets.map((asset) => asset.symbol);
        setSymbols(Array.from(new Set([...assetSymbols, ...POPULAR_SYMBOLS])));
      } catch (error) {
        if (isMounted) {
          setSymbols(POPULAR_SYMBOLS);
        }
      }
    };
    loadSymbols();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadOverview = async () => {
      try {
        const results = await Promise.all(
          OVERVIEW_SYMBOLS.map(async (item) => {
            const response = await get<{ candles: Candle[] }>(
              `/api/assets/candles?symbol=${encodeURIComponent(item.symbol)}`,
            );
            const latest = response.candles.at(-1);
            const previous = response.candles.at(-2);
            const price = latest?.close ?? null;
            const change =
              latest && previous ? ((latest.close - previous.close) / previous.close) * 100 : null;
            return { ...item, price, change };
          }),
        );
        if (isMounted) {
          setOverview(results);
        }
      } catch (error) {
        if (isMounted) {
          setOverview(OVERVIEW_SYMBOLS.map((item) => ({ ...item, price: null, change: null })));
        }
      }
    };
    loadOverview();
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredSymbols = useMemo(() => {
    if (!query) {
      return symbols;
    }
    const upper = query.toUpperCase();
    return symbols.filter((symbol) => symbol.includes(upper));
  }, [query, symbols]);

  const displayedCandles = useMemo(() => {
    if (rangeDays === null) {
      return candles;
    }
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - rangeDays);
    return candles.filter((candle) => new Date(candle.date) >= cutoff);
  }, [candles, rangeDays]);

  const loadCandles = async (symbol: string) => {
    setSelectedSymbol(symbol);
    setIsLoading(true);
    try {
      const response = await get<{ candles: Candle[] }>(
        `/api/assets/candles?symbol=${encodeURIComponent(symbol)}`,
      );
      setCandles(response.candles);
    } catch (error) {
      setCandles([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Market view</h1>
          <p className="muted">Explore daily price action for tracked symbols.</p>
          <p className="muted">Price source: Stooq.</p>
        </div>
      </header>
      <div className="card">
        <div className="chart-header">
          <div>
            <h3>Market overview</h3>
            <p className="muted">Quick reads for major indices.</p>
          </div>
          <a
            className="pill"
            href="https://finviz.com/map.ashx"
            target="_blank"
            rel="noreferrer"
          >
            Open Finviz heatmap
          </a>
        </div>
        <div className="symbol-grid">
          {overview.map((item) => (
            <div key={item.symbol} className="symbol-card">
              <span>{item.label}</span>
              <span className="muted">
                {item.price === null
                  ? "No data"
                  : formatCurrency(item.price, currencyFromSymbol(item.symbol))}
              </span>
              <span className={item.change && item.change < 0 ? "status warn" : "status"}>
                {item.change === null ? "—" : `${item.change > 0 ? "+" : ""}${item.change.toFixed(2)}%`}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="chart-header">
          <div>
            <h3>Symbol explorer</h3>
            <p className="muted">Pick a symbol to inspect candles and ranges.</p>
          </div>
          <input
            className="search-input"
            type="text"
            placeholder="Search symbols"
            value={query}
            onChange={(event) => setQuery(event.target.value.toUpperCase())}
          />
        </div>
        <div className="symbol-grid">
          {filteredSymbols.map((symbol) => (
            <button
              type="button"
              key={symbol}
              className={`symbol-card ${selectedSymbol === symbol ? "active" : ""}`}
              onClick={() => loadCandles(symbol)}
            >
              <span>{symbol}</span>
              <span className="muted">Daily</span>
            </button>
          ))}
        </div>
      </div>
      <div className="card chart-card">
        <div className="chart-header">
          <div>
            <h3>{selectedSymbol ?? "Select a symbol"}</h3>
            <p className="muted">Daily candle chart.</p>
          </div>
          <div className="toolbar">
            <span className="muted">Resolution</span>
            <button className="pill" type="button" disabled>
              1D
            </button>
            {RANGE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="pill"
                onClick={() => setRangeDays(preset.days)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <div className="chart-surface">
          {isLoading ? (
            <p className="muted">Loading candles…</p>
          ) : displayedCandles.length === 0 ? (
            <p className="muted">Select a symbol to view candles.</p>
          ) : (
            <CandlestickChart
              candles={displayedCandles}
              formatValue={(value) => formatCurrency(value, displayCurrency)}
              formatLabel={formatDateDisplay}
            />
          )}
        </div>
      </div>
    </section>
  );
}
