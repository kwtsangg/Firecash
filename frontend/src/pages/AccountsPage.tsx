import { useState } from "react";
import ActionToast, { ActionToastData } from "../components/ActionToast";

export default function AccountsPage() {
  const [toast, setToast] = useState<ActionToastData | null>(null);

  const showToast = (title: string, description?: string) => {
    setToast({ title, description });
  };

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Accounts</h1>
          <p className="muted">Manage accounts and groups.</p>
        </div>
        <div className="toolbar">
          <button
            className="pill"
            onClick={() => showToast("Group setup ready", "Add accounts to a new bundle.")}
          >
            Create Group
          </button>
          <button
            className="pill primary"
            onClick={() => showToast("Account form opened", "Capture balance and currency.")}
          >
            Add Account
          </button>
        </div>
      </header>
      {toast && <ActionToast toast={toast} onDismiss={() => setToast(null)} />}
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
            { name: "HKD Growth", currency: "HKD", status: "Active" },
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
          <button
            className="pill"
            onClick={() => showToast("Memberships opened", "Assign accounts to groups.")}
          >
            Manage memberships
          </button>
        </div>
      </div>
    </section>
  );
}
