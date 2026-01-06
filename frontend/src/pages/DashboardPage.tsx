export default function DashboardPage() {
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
        <div className="card">
          <h3>Total Assets</h3>
          <p className="metric">$128,420</p>
          <p className="muted">+4.2% vs last period</p>
        </div>
        <div className="card">
          <h3>Net Income</h3>
          <p className="metric">$6,240</p>
          <p className="muted">This month</p>
        </div>
        <div className="card">
          <h3>Growth</h3>
          <p className="metric">+12.4%</p>
          <p className="muted">Year to date</p>
        </div>
      </div>
      <div className="card chart-placeholder">
        <div className="chart-header">
          <div>
            <h3>Asset Growth</h3>
            <p className="muted">Date range picker goes here</p>
          </div>
          <div className="toolbar">
            <button className="pill">7D</button>
            <button className="pill">30D</button>
            <button className="pill">90D</button>
            <button className="pill">1Y</button>
          </div>
        </div>
        <div className="chart-surface">Chart Area</div>
      </div>
    </section>
  );
}
