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
      <div className="card">
        <p className="muted">Settings options will appear here.</p>
      </div>
    </section>
  );
}
