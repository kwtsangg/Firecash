import { useState } from "react";
import ActionToast, { ActionToastData } from "../components/ActionToast";

export default function SettingsPage() {
  const [toast, setToast] = useState<ActionToastData | null>(null);

  const showToast = (title: string, description?: string) => {
    setToast({ title, description });
  };

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="muted">Profile, currency, and API access.</p>
        </div>
        <button
          className="pill"
          onClick={() => showToast("API keys opened", "Create keys for external tools.")}
        >
          Manage API Keys
        </button>
      </header>
      {toast && <ActionToast toast={toast} onDismiss={() => setToast(null)} />}
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
          <button
            className="pill primary"
            onClick={() => showToast("Profile saved", "Updates will sync shortly.")}
          >
            Save changes
          </button>
        </div>
        <div className="card">
          <h3>Currency</h3>
          <p className="muted">Base display currency for dashboards.</p>
          <div className="chip-grid">
            {["USD", "EUR", "GBP", "JPY", "HKD"].map((currency) => (
              <span key={currency} className="chip">
                {currency}
              </span>
            ))}
          </div>
          <button
            className="pill"
            onClick={() => showToast("FX sync queued", "Refreshing conversion rates.")}
          >
            Sync FX rates
          </button>
        </div>
      </div>
    </section>
  );
}
