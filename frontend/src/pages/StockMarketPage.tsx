import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";
import { MarketOverviewItem, fetchAssetSymbols, fetchMarketOverview } from "../api/market";
import { formatCurrency } from "../utils/currency";
import { formatApiErrorDetail } from "../utils/errorMessages";
import { pageTitles } from "../utils/pageTitles";
import { usePageMeta } from "../utils/pageMeta";

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
  usePageMeta({ title: pageTitles.stockMarket });
  const [symbols, setSymbols] = useState<string[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [isOverviewLoading, setIsOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overviewErrorDetails, setOverviewErrorDetails] = useState<string[]>([]);
  const [symbolsError, setSymbolsError] = useState<string | null>(null);
  const [symbolsErrorDetails, setSymbolsErrorDetails] = useState<string[]>([]);
  const [overview, setOverview] = useState<MarketOverviewItem[]>([]);
  const heatmapContainerRef = useRef<HTMLDivElement | null>(null);
  const candleWidgetRef = useRef<HTMLDivElement | null>(null);
  const [isCandleWidgetReady, setIsCandleWidgetReady] = useState(false);
  const [widgetRefreshTick, setWidgetRefreshTick] = useState(0);

  const loadSymbols = useCallback(async () => {
    try {
      const assetSymbols = await fetchAssetSymbols();
      setSymbols(Array.from(new Set([...assetSymbols, ...POPULAR_SYMBOLS])));
      setSymbolsError(null);
      setSymbolsErrorDetails([]);
    } catch (error) {
      setSymbols(POPULAR_SYMBOLS);
      setSymbolsError("Unable to load tracked assets. Showing popular symbols instead.");
      const detail = formatApiErrorDetail(error);
      setSymbolsErrorDetails(detail ? [detail] : []);
    }
  }, []);

  const loadOverview = useCallback(async () => {
    setIsOverviewLoading(true);
    try {
      const results = await fetchMarketOverview(OVERVIEW_SYMBOLS);
      setOverview(results);
      setOverviewError(null);
      setOverviewErrorDetails([]);
    } catch (error) {
      setOverview(OVERVIEW_SYMBOLS.map((item) => ({ ...item, price: null, change: null })));
      setOverviewError("Unable to load market overview data right now.");
      const detail = formatApiErrorDetail(error);
      setOverviewErrorDetails(detail ? [detail] : []);
    } finally {
      setIsOverviewLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      await loadSymbols();
      if (isMounted) {
        await loadOverview();
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [loadOverview, loadSymbols]);

  const retryOverview = () => {
    loadOverview();
  };

  useEffect(() => {
    if (!heatmapContainerRef.current) {
      return;
    }
    heatmapContainerRef.current.innerHTML = "";
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      colorTheme: "dark",
      dataSource: "SPX500",
      grouping: "sector",
      blockSize: "market_cap_basic",
      blockColor: "change",
      locale: "en",
      symbolUrl: "",
      hasTopBar: true,
      isDataSetEnabled: true,
      isZoomEnabled: true,
      hasSymbolTooltip: true,
      width: "100%",
      height: "100%",
    });
    heatmapContainerRef.current.appendChild(script);
    return () => {
      if (heatmapContainerRef.current) {
        heatmapContainerRef.current.innerHTML = "";
      }
    };
  }, []);

  useEffect(() => {
    if (!candleWidgetRef.current) {
      return;
    }
    if (!selectedSymbol) {
      candleWidgetRef.current.innerHTML = "";
      setIsCandleWidgetReady(false);
      return;
    }
    candleWidgetRef.current.innerHTML = "";
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: selectedSymbol,
      interval: "D",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      enable_publishing: false,
      hide_legend: false,
      allow_symbol_change: false,
      hide_top_toolbar: true,
      hide_side_toolbar: true,
      save_image: false,
      calendar: false,
      studies: ["MASimple@tv-basicstudies"],
    });
    candleWidgetRef.current.appendChild(script);
    setIsCandleWidgetReady(true);
    return () => {
      if (candleWidgetRef.current) {
        candleWidgetRef.current.innerHTML = "";
      }
    };
  }, [selectedSymbol, widgetRefreshTick]);

  const filteredSymbols = useMemo(() => {
    if (!query) {
      return symbols;
    }
    const upper = query.toUpperCase();
    return symbols.filter((symbol) => symbol.includes(upper));
  }, [query, symbols]);

  const refreshWidget = () => {
    setIsCandleWidgetReady(false);
    setWidgetRefreshTick((prev) => prev + 1);
  };

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>{pageTitles.stockMarket}</h1>
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
          <div className="toolbar">
            <button className="pill" type="button" onClick={retryOverview}>
              Refresh overview
            </button>
            <a
              className="pill"
              href="https://www.tradingview.com/heatmap/stock/"
              target="_blank"
              rel="noreferrer"
            >
              Open TradingView heatmap
            </a>
          </div>
        </div>
        {overviewError ? (
          <ErrorState
            headline={overviewError}
            details={overviewErrorDetails}
            onRetry={retryOverview}
          />
        ) : null}
        {isOverviewLoading ? (
          <LoadingState
            title="Loading market overview"
            description="Pulling the latest index moves."
            className="loading-state-inline"
          />
        ) : overview.length === 0 ? (
          <EmptyState
            title="No overview data yet"
            description="Market snapshots will appear once data is available."
            actionLabel="Refresh overview"
            onAction={retryOverview}
            actionHint="Check back later for the latest index updates."
          />
        ) : (
          <div className="symbol-grid">
            {overview.map((item) => (
              <div key={item.symbol} className="symbol-card">
                <span>{item.label}</span>
                <span className="muted">
                  {item.price === null
                    ? "No data"
                    : formatCurrency(item.price, currencyFromSymbol(item.symbol))}
                </span>
                <span className={item.change !== null && item.change < 0 ? "status warn" : "status"}>
                  {item.change === null
                    ? "—"
                    : `${item.change > 0 ? "+" : ""}${item.change.toFixed(2)}%`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="card chart-card">
        <div className="chart-header">
          <div>
            <h3>Market heatmap</h3>
            <p className="muted">Sector performance powered by TradingView.</p>
          </div>
        </div>
        <div className="heatmap-widget" ref={heatmapContainerRef} />
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
            aria-label="Search symbols"
          />
        </div>
        {symbolsError ? (
          <ErrorState
            headline={symbolsError}
            details={symbolsErrorDetails}
            onRetry={loadSymbols}
            retryLabel="Reload symbols"
          />
        ) : null}
        <div className="symbol-grid">
          {filteredSymbols.length === 0 ? (
            <EmptyState
              title="No symbols found"
              description="Try a different ticker or clear the search to see all symbols."
              actionLabel="Clear search"
              onAction={() => setQuery("")}
              actionHint="Symbols from your holdings show up automatically."
            />
          ) : (
            filteredSymbols.map((symbol) => (
              <button
                type="button"
                key={symbol}
                className={`symbol-card ${selectedSymbol === symbol ? "active" : ""}`}
                onClick={() => {
                  setIsCandleWidgetReady(false);
                  setSelectedSymbol(symbol);
                }}
              >
                <span>{symbol}</span>
                <span className="muted">Daily</span>
              </button>
            ))
          )}
        </div>
      </div>
      <div className="card chart-card">
        <div className="chart-header">
          <div>
            <h3>{selectedSymbol ?? "Select a symbol"}</h3>
            <p className="muted">TradingView daily candles.</p>
          </div>
          <div className="toolbar">
            <span className="muted">Resolution</span>
            <button className="pill" type="button" disabled>
              1D
            </button>
            <button
              className="pill"
              type="button"
              onClick={refreshWidget}
              disabled={!selectedSymbol}
            >
              Refresh chart
            </button>
          </div>
        </div>
        <div className="chart-surface chart-widget-surface">
          {!selectedSymbol ? (
            <EmptyState
              title="Select a symbol"
              description="Choose a symbol from the list to visualize its price history."
              actionLabel="Browse symbols"
              onAction={() => setQuery("")}
              actionHint="Use the search field to narrow the list."
            />
          ) : null}
          <div
            className={`tradingview-widget${selectedSymbol ? "" : " is-hidden"}${
              isCandleWidgetReady ? " is-ready" : ""
            }`}
            ref={candleWidgetRef}
          />
          {selectedSymbol && !isCandleWidgetReady ? (
            <LoadingState
              title="Loading TradingView chart"
              description="Streaming daily candle data."
              className="loading-state-inline"
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
