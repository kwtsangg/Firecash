import { pageTitles } from "../utils/pageTitles";

export default function BudgetsPage() {
  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>{pageTitles.budgets}</h1>
          <p className="muted">Plan targets and track category health.</p>
        </div>
        <button className="pill" type="button">
          New budget
        </button>
      </header>
      <div className="card page-state empty-state">
        No budgets yet. Create your first plan to start tracking.
      </div>
    </section>
  );
}
