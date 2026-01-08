import { useEffect, useMemo, useState } from "react";
import ActionToast, { ActionToastData } from "../components/ActionToast";
import LoadingState from "../components/LoadingState";
import Modal from "../components/Modal";
import { useAuth } from "../components/AuthContext";
import { exportBackupCsv, exportBackupJson, restoreBackup, type BackupPayload } from "../api/backup";
import { fetchAuditLogs, type AuditLogEntry } from "../api/audit";
import {
  addAccountGroupUser,
  fetchAccountGroups,
  fetchAccountGroupUsers,
  removeAccountGroupUser,
  updateAccountGroupUser,
  type AccountGroup,
  type AccountGroupUser,
} from "../api/accountGroups";
import { fetchPreferences, updatePreferences } from "../api/preferences";
import { get, post, put } from "../utils/apiClient";
import { formatDateDisplay } from "../utils/date";
import { getFriendlyErrorMessage } from "../utils/errorMessages";
import { pageTitles } from "../utils/pageTitles";
import { usePageMeta } from "../utils/pageMeta";

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
  usePageMeta({ title: pageTitles.settings });
  const { logout } = useAuth();
  const [toast, setToast] = useState<ActionToastData | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryName, setCategoryName] = useState("");
  const [strategies, setStrategies] = useState<string[]>([]);
  const [strategyName, setStrategyName] = useState("");
  const [fxRates, setFxRates] = useState<FxRate[]>([]);
  const [isPreferencesLoading, setIsPreferencesLoading] = useState(true);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [exportRedaction, setExportRedaction] = useState("none");
  const [retentionDays, setRetentionDays] = useState<number | null>(null);
  const [isBackupBusy, setIsBackupBusy] = useState(false);
  const [restorePayload, setRestorePayload] = useState<BackupPayload | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [isRestoreOpen, setIsRestoreOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [accountGroups, setAccountGroups] = useState<AccountGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<AccountGroupUser[]>([]);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"view" | "edit" | "admin">("view");
  const [isMembershipSaving, setIsMembershipSaving] = useState(false);

  const showToast = (title: string, description?: string) => {
    setToast({ title, description });
  };

  const downloadFile = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
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

  const loadPreferences = async () => {
    setIsPreferencesLoading(true);
    setPreferencesError(null);
    try {
      const response = await fetchPreferences();
      setCategories(response.categories);
      setStrategies(response.strategies);
      setRetentionDays(response.retentionDays ?? null);
      setExportRedaction(response.exportRedaction);
    } catch (error) {
      setPreferencesError("Unable to load preferences right now.");
    } finally {
      setIsPreferencesLoading(false);
    }
  };

  useEffect(() => {
    loadPreferences();
  }, []);

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

  const loadAuditLogs = async () => {
    setAuditError(null);
    try {
      const logs = await fetchAuditLogs();
      setAuditLogs(logs);
    } catch (error) {
      setAuditError("Audit logs are available to admins only.");
    }
  };

  useEffect(() => {
    loadAuditLogs();
  }, []);

  const loadAccountGroups = async () => {
    try {
      const groups = await fetchAccountGroups();
      setAccountGroups(groups);
      setSelectedGroupId(groups[0]?.id ?? null);
    } catch (error) {
      setAccountGroups([]);
      setSelectedGroupId(null);
    }
  };

  useEffect(() => {
    loadAccountGroups();
  }, []);

  const loadGroupMembers = async (groupId: string | null) => {
    if (!groupId) {
      setGroupMembers([]);
      return;
    }
    try {
      const members = await fetchAccountGroupUsers(groupId);
      setGroupMembers(members);
    } catch (error) {
      setGroupMembers([]);
    }
  };

  useEffect(() => {
    loadGroupMembers(selectedGroupId);
  }, [selectedGroupId]);

  const selectedGroupName = useMemo(
    () => accountGroups.find((group) => group.id === selectedGroupId)?.name ?? "Household",
    [accountGroups, selectedGroupId],
  );
  const includePii = exportRedaction !== "pii";
  const retentionOptions = [
    { label: "Keep forever", value: null },
    { label: "30 days", value: 30 },
    { label: "90 days", value: 90 },
    { label: "180 days", value: 180 },
    { label: "1 year", value: 365 },
  ];

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>{pageTitles.settings}</h1>
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
            <LoadingState
              title="Loading profile"
              description="Fetching your account details."
              className="loading-state-inline"
            />
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
                showToast(
                  "Save failed",
                  getFriendlyErrorMessage(error, "Unable to save profile changes."),
                );
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
          <h3>Backup &amp; restore</h3>
          <p className="muted">
            Export a versioned snapshot of your data or restore a saved backup.
          </p>
          <div className="action-grid">
            <button
              className="pill primary"
              disabled={isBackupBusy}
              onClick={async () => {
                setIsBackupBusy(true);
                try {
                  const backup = await exportBackupJson(includePii);
                  downloadFile(
                    new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
                    "firecash-backup.json",
                  );
                  showToast("Backup ready", "JSON export has been downloaded.");
                } catch (error) {
                  showToast("Export failed", "Unable to create a JSON backup.");
                } finally {
                  setIsBackupBusy(false);
                }
              }}
            >
              {isBackupBusy ? "Preparing..." : "Export JSON"}
            </button>
            <button
              className="pill"
              disabled={isBackupBusy}
              onClick={async () => {
                setIsBackupBusy(true);
                try {
                  const csvBlob = await exportBackupCsv(includePii);
                  downloadFile(csvBlob, "firecash-transactions.csv");
                  showToast("CSV ready", "Transactions export has been downloaded.");
                } catch (error) {
                  showToast("Export failed", "Unable to create a CSV export.");
                } finally {
                  setIsBackupBusy(false);
                }
              }}
            >
              Export CSV
            </button>
          </div>
          <div className="action-grid">
            <label className="file-upload">
              <input
                type="file"
                accept="application/json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) {
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    try {
                      const parsed = JSON.parse(reader.result as string) as BackupPayload;
                      if (!parsed.metadata || !parsed.metadata.schema_version) {
                        throw new Error("Missing metadata");
                      }
                      setRestorePayload(parsed);
                      setRestoreError(null);
                      setIsRestoreOpen(true);
                    } catch (error) {
                      setRestoreError("Invalid backup file. Please choose a Firecash export.");
                      setRestorePayload(null);
                    }
                  };
                  reader.readAsText(file);
                }}
              />
              <span className="pill">Select backup file</span>
            </label>
            <button
              className="pill"
              disabled={!restorePayload}
              onClick={() => setIsRestoreOpen(true)}
            >
              Review restore
            </button>
          </div>
          {restoreError ? <p className="input-helper">{restoreError}</p> : null}
        </div>
        <div className="card">
          <h3>Privacy controls</h3>
          <p className="muted">Control what exports include and how long data is retained.</p>
          <div className="form-grid">
            <label>
              Export redaction
              <select
                value={exportRedaction}
                onChange={async (event) => {
                  const next = event.target.value;
                  setExportRedaction(next);
                  try {
                    await updatePreferences({ exportRedaction: next });
                    showToast("Export settings saved", "Redaction preferences updated.");
                  } catch (error) {
                    showToast("Save failed", "Unable to update export redaction.");
                  }
                }}
              >
                <option value="none">Include PII (merchant, notes)</option>
                <option value="pii">Redact PII fields</option>
              </select>
            </label>
            <label>
              Retention policy
              <select
                value={retentionDays ?? "keep"}
                onChange={async (event) => {
                  const value = event.target.value === "keep" ? null : Number(event.target.value);
                  setRetentionDays(value);
                  try {
                    await updatePreferences({ retentionDays: value });
                    showToast("Retention updated", "Policy saved and enforced.");
                  } catch (error) {
                    showToast("Save failed", "Unable to update retention policy.");
                  }
                }}
              >
                {retentionOptions.map((option) => (
                  <option
                    key={option.label}
                    value={option.value === null ? "keep" : option.value}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted small">
            Retention removes transactions older than the selected window when you save changes.
          </p>
        </div>
        <div className="card">
          <h3>Household sharing</h3>
          <p className="muted">Invite members to shared account groups with role-based access.</p>
          {accountGroups.length === 0 ? (
            <p className="muted">Create an account group to start sharing.</p>
          ) : (
            <>
              <label>
                Account group
                <select
                  value={selectedGroupId ?? ""}
                  onChange={(event) => setSelectedGroupId(event.target.value)}
                >
                  {accountGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="action-grid">
                <input
                  type="email"
                  placeholder="member@email.com"
                  value={memberEmail}
                  onChange={(event) => setMemberEmail(event.target.value)}
                />
                <select
                  value={memberRole}
                  onChange={(event) => setMemberRole(event.target.value as "view" | "edit" | "admin")}
                >
                  <option value="view">View</option>
                  <option value="edit">Edit</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  className="pill"
                  disabled={isMembershipSaving || !selectedGroupId}
                  onClick={async () => {
                    if (!selectedGroupId) {
                      return;
                    }
                    if (!memberEmail.trim()) {
                      showToast("Missing email", "Enter a member email to invite.");
                      return;
                    }
                    setIsMembershipSaving(true);
                    try {
                      await addAccountGroupUser(selectedGroupId, memberEmail.trim(), memberRole);
                      await loadGroupMembers(selectedGroupId);
                      setMemberEmail("");
                      showToast("Member invited", `Added to ${selectedGroupName}.`);
                    } catch (error) {
                      showToast("Invite failed", "Unable to add this member.");
                    } finally {
                      setIsMembershipSaving(false);
                    }
                  }}
                >
                  Invite
                </button>
              </div>
              <div className="table compact">
                <div className="table-row table-header columns-3">
                  <span>Member</span>
                  <span>Role</span>
                  <span>Actions</span>
                </div>
                {groupMembers.map((member) => (
                  <div className="table-row columns-3" key={member.user_id}>
                    <span>
                      {member.name} <span className="muted">({member.email})</span>
                    </span>
                    <span>
                      <select
                        value={member.role}
                        onChange={async (event) => {
                          if (!selectedGroupId) {
                            return;
                          }
                          const role = event.target.value;
                          try {
                            await updateAccountGroupUser(selectedGroupId, member.user_id, role);
                            await loadGroupMembers(selectedGroupId);
                            showToast("Role updated", `${member.name} is now ${role}.`);
                          } catch (error) {
                            showToast("Update failed", "Unable to change role.");
                          }
                        }}
                      >
                        <option value="view">View</option>
                        <option value="edit">Edit</option>
                        <option value="admin">Admin</option>
                      </select>
                    </span>
                    <span>
                      <button
                        className="pill"
                        onClick={async () => {
                          if (!selectedGroupId) {
                            return;
                          }
                          try {
                            await removeAccountGroupUser(selectedGroupId, member.user_id);
                            await loadGroupMembers(selectedGroupId);
                            showToast("Member removed", `${member.name} removed.`);
                          } catch (error) {
                            showToast("Remove failed", "Unable to remove member.");
                          }
                        }}
                      >
                        Remove
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="card">
          <h3>Audit log</h3>
          <p className="muted">Security activity visible to admins.</p>
          {auditError ? (
            <p className="input-helper">{auditError}</p>
          ) : (
            <div className="table compact">
              <div className="table-row table-header columns-3">
                <span>Action</span>
                <span>Actor</span>
                <span>Time</span>
              </div>
              {auditLogs.map((entry) => (
                <div className="table-row columns-3" key={entry.id}>
                  <span>{entry.action}</span>
                  <span>
                    {entry.user_name ?? "System"}{" "}
                    <span className="muted">{entry.user_email ?? ""}</span>
                  </span>
                  <span>{formatDateDisplay(entry.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <h3>Categories</h3>
          <p className="muted">Create and manage transaction categories.</p>
          {preferencesError ? (
            <div className="input-helper">
              {preferencesError}{" "}
              <button className="pill" type="button" onClick={loadPreferences}>
                Retry
              </button>
            </div>
          ) : null}
          <div className="category-manager">
            <input
              type="text"
              placeholder="New category"
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
              aria-label="New category"
            />
            <button
              className="pill"
              type="button"
              disabled={isPreferencesLoading}
              onClick={async () => {
                const trimmed = categoryName.trim();
                if (!trimmed) {
                  showToast("Missing category", "Enter a category name to save.");
                  return;
                }
                if (categories.some((category) => category.toLowerCase() === trimmed.toLowerCase())) {
                  showToast("Category exists", "Choose a new category name.");
                  return;
                }
                const previous = categories;
                const next = [...categories, trimmed];
                setCategories(next);
                setCategoryName("");
                try {
                  await updatePreferences({ categories: next });
                  showToast("Category added", `${trimmed} is ready to use.`);
                } catch (error) {
                  setCategories(previous);
                  showToast(
                    "Save failed",
                    getFriendlyErrorMessage(error, "Unable to save this category."),
                  );
                }
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
                  disabled={isPreferencesLoading}
                  onClick={async () => {
                    const previous = categories;
                    const updated = categories.filter((item) => item !== category);
                    const next = updated.length ? updated : ["General"];
                    setCategories(next);
                    try {
                      await updatePreferences({ categories: next });
                    } catch (error) {
                      setCategories(previous);
                      showToast(
                        "Save failed",
                        getFriendlyErrorMessage(error, "Unable to update categories."),
                      );
                    }
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
          {preferencesError ? (
            <div className="input-helper">
              {preferencesError}{" "}
              <button className="pill" type="button" onClick={loadPreferences}>
                Retry
              </button>
            </div>
          ) : null}
          <div className="category-manager">
            <input
              type="text"
              placeholder="New strategy"
              value={strategyName}
              onChange={(event) => setStrategyName(event.target.value)}
              aria-label="New strategy"
            />
            <button
              className="pill"
              type="button"
              disabled={isPreferencesLoading}
              onClick={async () => {
                const trimmed = strategyName.trim();
                if (!trimmed) {
                  showToast("Missing strategy", "Enter a strategy name to save.");
                  return;
                }
                if (strategies.some((strategy) => strategy.toLowerCase() === trimmed.toLowerCase())) {
                  showToast("Strategy exists", "Choose a new strategy name.");
                  return;
                }
                const previous = strategies;
                const next = [...strategies, trimmed];
                setStrategies(next);
                setStrategyName("");
                try {
                  await updatePreferences({ strategies: next });
                  showToast("Strategy added", `${trimmed} is ready to use.`);
                } catch (error) {
                  setStrategies(previous);
                  showToast(
                    "Save failed",
                    getFriendlyErrorMessage(error, "Unable to save this strategy."),
                  );
                }
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
                  disabled={isPreferencesLoading}
                  onClick={async () => {
                    const previous = strategies;
                    const updated = strategies.filter((item) => item !== strategy);
                    const next = updated.length ? updated : ["Long Term"];
                    setStrategies(next);
                    try {
                      await updatePreferences({ strategies: next });
                    } catch (error) {
                      setStrategies(previous);
                      showToast(
                        "Save failed",
                        getFriendlyErrorMessage(error, "Unable to update strategies."),
                      );
                    }
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
      <Modal
        title="Confirm restore"
        description="Restoring will overwrite your current data. This cannot be undone."
        isOpen={isRestoreOpen}
        onClose={() => setIsRestoreOpen(false)}
        footer={
          <div className="modal-footer-actions">
            <button className="pill" onClick={() => setIsRestoreOpen(false)}>
              Cancel
            </button>
            <button
              className="pill primary"
              disabled={!restorePayload || isBackupBusy}
              onClick={async () => {
                if (!restorePayload) {
                  return;
                }
                setIsBackupBusy(true);
                try {
                  await restoreBackup(restorePayload);
                  showToast("Restore complete", "Your data has been restored.");
                  setRestorePayload(null);
                  setIsRestoreOpen(false);
                } catch (error) {
                  showToast("Restore failed", "Unable to restore this backup.");
                } finally {
                  setIsBackupBusy(false);
                }
              }}
            >
              Restore backup
            </button>
          </div>
        }
      >
        {restorePayload ? (
          <div className="table compact">
            <div className="table-row table-header columns-3">
              <span>Section</span>
              <span>Count</span>
              <span>Notes</span>
            </div>
            <div className="table-row columns-3">
              <span>Accounts</span>
              <span>{restorePayload.accounts.length}</span>
              <span>Includes balances and currencies</span>
            </div>
            <div className="table-row columns-3">
              <span>Transactions</span>
              <span>{restorePayload.transactions.length}</span>
              <span>Historical activity</span>
            </div>
            <div className="table-row columns-3">
              <span>Assets</span>
              <span>{restorePayload.assets.length}</span>
              <span>Holdings snapshots</span>
            </div>
          </div>
        ) : (
          <p className="muted">Choose a valid backup file to continue.</p>
        )}
      </Modal>
    </section>
  );
}
