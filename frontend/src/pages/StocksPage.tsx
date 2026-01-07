import { useMemo, useState } from "react";
import ActionToast, { ActionToastData } from "../components/ActionToast";
import { BarChart, DonutChart, LineChart } from "../components/Charts";
import DateRangePicker, { DateRange } from "../components/DateRangePicker";
import KpiCard from "../components/KpiCard";

export default function StocksPage() {
  const [toast, setToast] = useState<ActionToastData | null>(null);
  const [range, setRange] = useState<DateRange>({
    from: "2024-01-01",
    to: "2024-04-30",
  });

  const showToast = (title: string, description?: string) => {
    setToast({ title, description });
  };

  const performance = useMemo(
    () => [120, 132, 128, 136, 142, 150, 147, 158, 162, 171, 176, 188],
    [],
  );
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
            onClick={() => showToast("Holding added", "Attach a ticker to an account.")}
          >
            Add Holding
          </button>
          <button
            className="pill"
            onClick={() => showToast("Quotes syncing", "Refreshing stock prices.")}
          >
            Sync Quotes
          </button>
        </div>
      </header>
      {toast && <ActionToast toast={toast} onDismiss={() => setToast(null)} />}
      <div className="card-grid">
        <KpiCard
          label="Total Equity"
          value="$82,440"
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
          value="+$1,420"
          trend="+1.1%"
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
          <LineChart points={performance} />
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
        <div className="list-row list-header columns-5">
          <span>Ticker</span>
          <span>Shares</span>
          <span>Last Price</span>
          <span>Day Change</span>
          <span>Account</span>
        </div>
        {[
          {
            ticker: "AAPL",
            shares: "42",
            price: "$182.14",
            change: "+1.4%",
            account: "Primary Account",
          },
          {
            ticker: "TSLA",
            shares: "16",
            price: "$175.22",
            change: "-0.6%",
            account: "Investments",
          },
          {
            ticker: "0700.HK",
            shares: "55",
            price: "HK$296.10",
            change: "+0.9%",
            account: "HKD Growth",
          },
        ].map((row) => (
          <div className="list-row columns-5" key={row.ticker}>
            <span>{row.ticker}</span>
            <span>{row.shares}</span>
            <span>{row.price}</span>
            <span className={row.change.startsWith("-") ? "status warn" : "status"}>
              {row.change}
            </span>
            <span>{row.account}</span>
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
