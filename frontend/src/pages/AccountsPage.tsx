export default function AccountsPage() {
  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Accounts</h1>
          <p className="muted">Manage accounts and groups.</p>
        </div>
        <div className="toolbar">
          <button className="pill">Create Group</button>
          <button className="pill primary">Add Account</button>
        </div>
      </header>
      <div className="split-grid">
        <div className="card">
          <h3>Accounts</h3>
          <div className="list-row list-header columns-3">
            <span>Name</span>
            <span>Currency</span>
            <span>Status</span>
          </div>
          {[
            { name: "Primary Account", currency: "USD", status: "Active" },
            { name: "Retirement", currency: "USD", status: "Active" },
            { name: "Vacation Fund", currency: "EUR", status: "Paused" },
          ].map((row) => (
            <div className="list-row columns-3" key={row.name}>
              <span>{row.name}</span>
              <span>{row.currency}</span>
              <span className="status">{row.status}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Groups</h3>
          <p className="muted">Bundle accounts for combined insights.</p>
          <div className="chip-grid">
            {["Investments", "Cashflow", "Long Term"].map((group) => (
              <span key={group} className="chip">
                {group}
              </span>
            ))}
          </div>
          <button className="pill">Manage memberships</button>
        </div>
      </div>
    </section>
  );
}
