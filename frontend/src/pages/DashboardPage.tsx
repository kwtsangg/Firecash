import { useMemo, useState } from "react";
import ActionToast, { ActionToastData } from "../components/ActionToast";
import { BarChart, DonutChart, LineChart } from "../components/Charts";
import DateRangePicker, { DateRange } from "../components/DateRangePicker";
import KpiCard from "../components/KpiCard";

export default function DashboardPage() {
  const [range, setRange] = useState<DateRange>({
    from: "2024-01-01",
    to: "2024-12-31",
  });
  const [toast, setToast] = useState<ActionToastData | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const showToast = (title: string, description?: string) => {
    setToast({ title, description });
  };

  const baseSeries = useMemo(
    () => [
      { date: "2024-01-15", value: 52 },
      { date: "2024-02-10", value: 60 },
      { date: "2024-03-05", value: 68 },
      { date: "2024-03-26", value: 64 },
      { date: "2024-04-12", value: 71 },
      { date: "2024-05-01", value: 78 },
      { date: "2024-05-21", value: 83 },
      { date: "2024-06-14", value: 79 },
      { date: "2024-07-02", value: 88 },
      { date: "2024-08-06", value: 94 },
      { date: "2024-09-17", value: 102 },
      { date: "2024-11-04", value: 110 },
    ],
    [],
  );
  const linePoints = useMemo(() => {
    const fromDate = new Date(range.from);
    const toDate = new Date(range.to);
    const multiplier = 1 + refreshTick * 0.01;
    return baseSeries
      .filter((point) => {
        const date = new Date(point.date);
        return date >= fromDate && date <= toDate;
      })
      .map((point) => Math.round(point.value * multiplier));
  }, [baseSeries, range.from, range.to, refreshTick]);
  const barValues = useMemo(
    () => [
      { label: "Mon", value: 10 },
      { label: "Tue", value: 18 },
      { label: "Wed", value: 14 },
      { label: "Thu", value: 24 },
      { label: "Fri", value: 20 },
      { label: "Sat", value: 9 },
      { label: "Sun", value: 12 },
    ],
    [],
  );
  const donutValues = useMemo(
    () => [
      { label: "Brokerage", value: 42, color: "#7f5bff" },
      { label: "Retirement", value: 28, color: "#5b6cff" },
      { label: "Cash", value: 15, color: "#43d6b1" },
      { label: "Crypto", value: 9, color: "#f7b955" },
    ],
    [],
  );

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">
            Overview of your asset growth and daily performance.
          </p>
        </div>
        <div className="toolbar">
          <button
            className="pill primary"
            onClick={() => showToast("Transaction started", "Pick an account to continue.")}
          >
            Add Transaction
          </button>
          <button
            className="pill"
            onClick={() => {
              setRefreshTick((prev) => prev + 1);
              showToast("Price refresh queued", "Fetching latest quotes.");
            }}
          >
            Refresh Prices
          </button>
        </div>
      </header>
      {toast && <ActionToast toast={toast} onDismiss={() => setToast(null)} />}
      <div className="card-grid">
        <KpiCard
          label="Total Assets"
          value="$128,420"
          trend="+4.2%"
          footnote="vs last period"
        />
        <KpiCard
          label="Net Income"
          value="$6,240"
          trend="+12%"
          footnote="This month"
        />
        <KpiCard
          label="Growth"
          value="+12.4%"
          trend="Stable"
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
        <div className="chart-surface">
          <LineChart points={linePoints} />
        </div>
      </div>
      <div className="split-grid">
        <div className="card">
          <h3>Weekly Cashflow</h3>
          <p className="muted">Income vs expenses snapshot.</p>
          <BarChart values={barValues} />
        </div>
        <div className="card">
          <h3>Allocation</h3>
          <p className="muted">Account group distribution.</p>
          <DonutChart values={donutValues} />
          <div className="legend">
            {donutValues.map((item) => (
              <div key={item.label} className="legend-item">
                <span className="legend-dot" style={{ background: item.color }} />
                {item.label}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="card">
        <h3>Quick actions</h3>
        <div className="action-grid">
          <button
            className="pill"
            onClick={() => showToast("Export queued", "CSV export will download shortly.")}
          >
            Export CSV
          </button>
          <button
            className="pill"
            onClick={() => showToast("Group creator ready", "Name your new group.")}
          >
            Create Group
          </button>
          <button
            className="pill"
            onClick={() => showToast("Budget builder opened", "Adjust spending targets.")}
          >
            Set Budget
          </button>
          <button
            className="pill"
            onClick={() => showToast("Snapshot shared", "Link copied to clipboard.")}
          >
            Share Snapshot
          </button>
        </div>
      </div>
    </section>
  );
}
