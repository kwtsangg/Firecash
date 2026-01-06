import { useMemo, useState } from "react";
import { BarChart, DonutChart, LineChart } from "../components/Charts";
import DateRangePicker, { DateRange } from "../components/DateRangePicker";
import KpiCard from "../components/KpiCard";

export default function DashboardPage() {
  const [range, setRange] = useState<DateRange>({
    from: "2024-01-01",
    to: "2024-12-31",
  });

  const linePoints = useMemo(
    () => [52, 60, 68, 64, 71, 78, 83, 79, 88, 94, 102, 110],
    [],
  );
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
          <button className="pill primary">Add Transaction</button>
          <button className="pill">Refresh Prices</button>
        </div>
      </header>
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
          <button className="pill">Export CSV</button>
          <button className="pill">Create Group</button>
          <button className="pill">Set Budget</button>
          <button className="pill">Share Snapshot</button>
        </div>
      </div>
    </section>
  );
}
