import { useEffect, useState } from "react";
import ActionToast, { ActionToastData } from "../components/ActionToast";
import { useAuth } from "../components/AuthContext";
import { ApiError, get, post, put } from "../utils/apiClient";
import { readCategories, storeCategories } from "../utils/categories";
import { readStrategies, storeStrategies } from "../utils/strategies";
import { formatDateDisplay } from "../utils/date";

type UserProfile = {
  id: string;
  name: string;
  email: string;
};

type FxRate = {
  base_currency: string;
  quote_currency: string;
  rate: number;
  recorded_on: string;
};

export default function SettingsPage() {
  const { logout } = useAuth();
  const [toast, setToast] = useState<ActionToastData | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [categories, setCategories] = useState<string[]>(() => readCategories());
  const [categoryName, setCategoryName] = useState("");
  const [strategies, setStrategies] = useState<string[]>(() => readStrategies());
  const [strategyName, setStrategyName] = useState("");
  const [fxRates, setFxRates] = useState<FxRate[]>([]);

  const showToast = (title: string, description?: string) => {
    setToast({ title, description });
  };

  useEffect(() => {
    let isMounted = true;
    const loadProfile = async () => {
      setIsLoading(true);
      try {
        const response = await get<UserProfile>("/api/me");
        if (isMounted) {
          setProfile(response);
          setName(response.name);
          setEmail(response.email);
        }
      } catch (error) {
        if (isMounted) {
          setProfile(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    loadProfile();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    storeCategories(categories);
  }, [categories]);

  useEffect(() => {
    storeStrategies(strategies);
  }, [strategies]);

  const loadFxRates = async () => {
    try {
      const response = await get<FxRate[]>("/api/fx-rates");
      setFxRates(response);
    } catch (error) {
      setFxRates([]);
    }
  };

  useEffect(() => {
    loadFxRates();
  }, []);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="muted">Profile, currency, and API access.</p>
        </div>
        <div className="toolbar">
          <button
            className="pill"
            onClick={() => showToast("API keys opened", "Create keys for external tools.")}
          >
            Manage API Keys
          </button>
          <button className="pill" type="button" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      {toast && <ActionToast toast={toast} onDismiss={() => setToast(null)} />}
      <div className="split-grid">
        <div className="card">
          <h3>Profile</h3>
          <p className="muted">Update your profile and preferences.</p>
          {isLoading ? (
            <p className="muted">Loading profile…</p>
          ) : profile ? (
            <div className="form-grid">
              <label>
                Display name
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
            </div>
          ) : (
            <p className="muted">Profile details are unavailable.</p>
          )}
          <button
            className="pill primary"
            disabled={isSaving || !profile}
            onClick={async () => {
              if (!profile) {
                return;
              }
              setIsSaving(true);
              try {
                const response = await put<UserProfile>(
                  "/api/me",
                  { name: name.trim(), email: email.trim() },
                  undefined,
                );
                setProfile(response);
                setName(response.name);
                setEmail(response.email);
                showToast("Profile saved", "Updates have been applied.");
              } catch (error) {
                const message =
                  error instanceof ApiError ? error.message : "Unable to save profile changes.";
                showToast("Save failed", message);
              } finally {
                setIsSaving(false);
              }
            }}
          >
            {isSaving ? "Saving..." : "Save changes"}
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
            onClick={async () => {
              try {
                await post("/api/fx-rates/refresh");
                await loadFxRates();
                showToast("FX sync complete", "Rates have been refreshed.");
              } catch (error) {
                showToast("FX sync failed", "Unable to refresh FX rates.");
              }
            }}
          >
            Sync FX rates
          </button>
        </div>
        <div className="card">
          <h3>Data management</h3>
          <p className="muted">Export reports or clean up local settings.</p>
          <div className="action-grid">
            <button
              className="pill"
              onClick={() => showToast("Export queued", "Transactions export will download shortly.")}
            >
              Export transactions
            </button>
            <button
              className="pill"
              onClick={() => showToast("Export queued", "Dashboard export will download shortly.")}
            >
              Export dashboard
            </button>
          </div>
        </div>
        <div className="card">
          <h3>Quick actions</h3>
          <p className="muted">Common shortcuts and utilities.</p>
          <div className="action-grid">
            <button
              className="pill"
              onClick={() => showToast("Group creator ready", "Name your new group.")}
            >
              Create Group
            </button>
            <button className="pill" onClick={() => showToast("Snapshot shared", "Link copied.")}>
              Share Snapshot
            </button>
          </div>
        </div>
        <div className="card">
          <h3>Categories</h3>
          <p className="muted">Create and manage transaction categories.</p>
          <div className="category-manager">
            <input
              type="text"
              placeholder="New category"
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
            />
            <button
              className="pill"
              type="button"
              onClick={() => {
                const trimmed = categoryName.trim();
                if (!trimmed) {
                  showToast("Missing category", "Enter a category name to save.");
                  return;
                }
                if (categories.some((category) => category.toLowerCase() === trimmed.toLowerCase())) {
                  showToast("Category exists", "Choose a new category name.");
                  return;
                }
                setCategories((prev) => [...prev, trimmed]);
                setCategoryName("");
                showToast("Category added", `${trimmed} is ready to use.`);
              }}
            >
              Add Category
            </button>
          </div>
          <div className="chip-grid">
            {categories.map((category) => (
              <div className="chip" key={category}>
                <span>{category}</span>
                <button
                  type="button"
                  className="chip-action"
                  onClick={() => {
                    const updated = categories.filter((item) => item !== category);
                    setCategories(updated.length ? updated : ["General"]);
                  }}
                  aria-label={`Remove ${category}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>Stock strategies</h3>
          <p className="muted">Manage strategy labels for holdings.</p>
          <div className="category-manager">
            <input
              type="text"
              placeholder="New strategy"
              value={strategyName}
              onChange={(event) => setStrategyName(event.target.value)}
            />
            <button
              className="pill"
              type="button"
              onClick={() => {
                const trimmed = strategyName.trim();
                if (!trimmed) {
                  showToast("Missing strategy", "Enter a strategy name to save.");
                  return;
                }
                if (strategies.some((strategy) => strategy.toLowerCase() === trimmed.toLowerCase())) {
                  showToast("Strategy exists", "Choose a new strategy name.");
                  return;
                }
                setStrategies((prev) => [...prev, trimmed]);
                setStrategyName("");
                showToast("Strategy added", `${trimmed} is ready to use.`);
              }}
            >
              Add Strategy
            </button>
          </div>
          <div className="chip-grid">
            {strategies.map((strategy) => (
              <div className="chip" key={strategy}>
                <span>{strategy}</span>
                <button
                  type="button"
                  className="chip-action"
                  onClick={() => {
                    const updated = strategies.filter((item) => item !== strategy);
                    setStrategies(updated.length ? updated : ["Long Term"]);
                  }}
                  aria-label={`Remove ${strategy}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>FX rate table</h3>
          <p className="muted">Latest currency conversions.</p>
          {fxRates.length === 0 ? (
            <p className="muted">No FX rates available.</p>
          ) : (
            <div className="table">
              <div className="table-row table-header columns-4">
                <span>Base</span>
                <span>Quote</span>
                <span>Rate</span>
                <span>Date</span>
              </div>
              {fxRates.map((rate) => (
                <div
                  className="table-row columns-4"
                  key={`${rate.base_currency}-${rate.quote_currency}-${rate.recorded_on}`}
                >
                  <span>{rate.base_currency}</span>
                  <span>{rate.quote_currency}</span>
                  <span>{rate.rate.toFixed(4)}</span>
                  <span>{formatDateDisplay(rate.recorded_on)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
