import { pageTitles } from "../utils/pageTitles";

export default function ReportsPage() {
  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>{pageTitles.reports}</h1>
          <p className="muted">Generate insights across accounts, budgets, and trends.</p>
        </div>
        <button className="pill" type="button">
          Export report
        </button>
      </header>
      <div className="card page-state empty-state">
        No reports generated yet. Run a report to see insights here.
      </div>
    </section>
  );
}
