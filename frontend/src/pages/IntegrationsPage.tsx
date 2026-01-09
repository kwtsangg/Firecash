import { useEffect, useMemo, useState } from "react";
import ActionToast, { ActionToastData } from "../components/ActionToast";
import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";
import {
  createIntegration,
  fetchIntegrationCatalog,
  fetchIntegrationLogs,
  fetchIntegrations,
  type IntegrationLogEntry,
  type IntegrationProviderCatalog,
  type IntegrationSummary,
} from "../api/integrations";
import { formatDateDisplay } from "../utils/date";
import { formatApiErrorDetail, getFriendlyErrorMessage } from "../utils/errorMessages";
import { pageTitles } from "../utils/pageTitles";
import { usePageMeta } from "../utils/pageMeta";

export default function IntegrationsPage() {
  usePageMeta({ title: pageTitles.integrations });
  const [toast, setToast] = useState<ActionToastData | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationSummary[]>([]);
  const [catalog, setCatalog] = useState<IntegrationProviderCatalog[]>([]);
  const [logs, setLogs] = useState<IntegrationLogEntry[]>([]);
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [providerKey, setProviderKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string[]>([]);

  const showToast = (title: string, description?: string) => {
    setToast({ title, description });
  };

  const loadIntegrations = async () => {
    setIsLoading(true);
    setError(null);
    setErrorDetails([]);
    try {
      const [integrationData, catalogData] = await Promise.all([
        fetchIntegrations(),
        fetchIntegrationCatalog(),
      ]);
      setIntegrations(integrationData);
      setCatalog(catalogData.providers);
      setProviderKey(catalogData.providers[0]?.key ?? "");
      setSelectedIntegrationId(integrationData[0]?.id ?? null);
    } catch (error) {
      setIntegrations([]);
      setCatalog([]);
      setProviderKey("");
      setSelectedIntegrationId(null);
      setError("Unable to load integrations.");
      const detail = formatApiErrorDetail(error);
      setErrorDetails(detail ? [detail] : []);
    } finally {
      setIsLoading(false);
    }
  };

  const loadLogs = async (integrationId: string | null) => {
    if (!integrationId) {
      setLogs([]);
      return;
    }
    try {
      const data = await fetchIntegrationLogs(integrationId);
      setLogs(data);
    } catch (error) {
      setLogs([]);
    }
  };

  useEffect(() => {
    loadIntegrations();
  }, []);

  useEffect(() => {
    loadLogs(selectedIntegrationId);
  }, [selectedIntegrationId]);

  const selectedProvider = useMemo(
    () => catalog.find((provider) => provider.key === providerKey),
    [catalog, providerKey],
  );

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>{pageTitles.integrations}</h1>
          <p className="muted">Connect external data sources and monitor their sync health.</p>
        </div>
      </header>
      {toast && <ActionToast toast={toast} onDismiss={() => setToast(null)} />}
      {isLoading ? (
        <LoadingState
          title="Loading integrations"
          description="Fetching connected providers and sync status."
        />
      ) : error ? (
        <ErrorState
          className="card"
          headline={error}
          details={errorDetails}
          onRetry={loadIntegrations}
        />
      ) : (
        <div className="split-grid">
          <div className="card">
            <h3>Connect a provider</h3>
            <p className="muted">
              Use read-only API tokens when available. Provider metadata shows its refresh cadence.
            </p>
            <div className="form-grid">
              <label>
                Provider
                <select value={providerKey} onChange={(event) => setProviderKey(event.target.value)}>
                  {catalog.map((provider) => (
                    <option key={provider.key} value={provider.key}>
                      {provider.display_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Display name
                <input
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Brokerage Sync"
                />
              </label>
            </div>
            {selectedProvider ? (
              <div className="alert-card">
                <div>
                  <strong>{selectedProvider.display_name}</strong>
                  <p className="muted">{selectedProvider.description}</p>
                </div>
                <ul className="list-compact">
                  <li>
                    <span className="muted">Data source</span>
                    <span>{selectedProvider.data_source}</span>
                  </li>
                  <li>
                    <span className="muted">Refresh cadence</span>
                    <span>{selectedProvider.refresh_cadence}</span>
                  </li>
                  <li>
                    <span className="muted">Read-only capable</span>
                    <span>{selectedProvider.supports_read_only ? "Yes" : "No"}</span>
                  </li>
                </ul>
              </div>
            ) : null}
            <button
              className="pill primary"
              disabled={isSaving}
              onClick={async () => {
                if (!providerKey || !displayName.trim()) {
                  showToast("Missing details", "Choose a provider and enter a display name.");
                  return;
                }
                setIsSaving(true);
                try {
                  await createIntegration({
                    provider_key: providerKey,
                    display_name: displayName.trim(),
                  });
                  setDisplayName("");
                  await loadIntegrations();
                  showToast("Integration added", "We will start syncing on the next cadence.");
                } catch (error) {
                  showToast(
                    "Unable to add",
                    getFriendlyErrorMessage(error, "Please try again in a moment."),
                  );
                } finally {
                  setIsSaving(false);
                }
              }}
            >
              {isSaving ? "Connecting..." : "Connect provider"}
            </button>
          </div>
          <div className="card">
            <h3>Integration status</h3>
            <p className="muted">Track sync health, cadence, and data sources.</p>
            {integrations.length === 0 ? (
              <p className="muted">No integrations connected yet.</p>
            ) : (
              <div className="table">
                <div className="table-row table-header columns-4">
                  <span>Name</span>
                  <span>Status</span>
                  <span>Cadence</span>
                  <span>Last sync</span>
                </div>
                {integrations.map((integration) => (
                  <div
                    key={integration.id}
                    className="table-row columns-4"
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedIntegrationId(integration.id)}
                  >
                    <span>
                      {integration.display_name}
                      <span className="muted"> ({integration.provider_key})</span>
                    </span>
                    <span>{integration.status}</span>
                    <span>{integration.refresh_cadence ?? "-"}</span>
                    <span>
                      {integration.last_sync_at
                        ? formatDateDisplay(integration.last_sync_at)
                        : "Not synced"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card">
            <h3>Sync logs</h3>
            <p className="muted">Latest messages for the selected integration.</p>
            {!selectedIntegrationId ? (
              <p className="muted">Select an integration to view logs.</p>
            ) : logs.length === 0 ? (
              <p className="muted">No logs yet. The next sync will appear here.</p>
            ) : (
              <div className="table compact">
                <div className="table-row table-header columns-3">
                  <span>Level</span>
                  <span>Message</span>
                  <span>Time</span>
                </div>
                {logs.map((entry) => (
                  <div className="table-row columns-3" key={entry.id}>
                    <span>{entry.level}</span>
                    <span>{entry.message}</span>
                    <span>{formatDateDisplay(entry.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
