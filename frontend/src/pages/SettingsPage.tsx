export default function SettingsPage() {
  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="muted">Profile, currency, and API access.</p>
        </div>
        <button className="pill">Manage API Keys</button>
      </header>
      <div className="split-grid">
        <div className="card">
          <h3>Profile</h3>
          <p className="muted">Update your profile and preferences.</p>
          <div className="form-grid">
            <label>
              Display name
              <input type="text" placeholder="Jane Doe" />
            </label>
            <label>
              Email
              <input type="email" placeholder="you@example.com" />
            </label>
          </div>
          <button className="pill primary">Save changes</button>
        </div>
        <div className="card">
          <h3>Currency</h3>
          <p className="muted">Base display currency for dashboards.</p>
          <div className="chip-grid">
            {["USD", "EUR", "GBP", "JPY"].map((currency) => (
              <span key={currency} className="chip">
                {currency}
              </span>
            ))}
          </div>
          <button className="pill">Sync FX rates</button>
        </div>
      </div>
    </section>
  );
}
