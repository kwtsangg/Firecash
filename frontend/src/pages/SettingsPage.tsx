import { useEffect, useState } from "react";
import ActionToast, { ActionToastData } from "../components/ActionToast";
import { useAuth } from "../components/AuthContext";
import { ApiError, get, put } from "../utils/apiClient";

type UserProfile = {
  id: string;
  name: string;
  email: string;
};

export default function SettingsPage() {
  const { logout } = useAuth();
  const [toast, setToast] = useState<ActionToastData | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

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
            onClick={() => showToast("FX sync queued", "Refreshing conversion rates.")}
          >
            Sync FX rates
          </button>
        </div>
      </div>
    </section>
  );
}
