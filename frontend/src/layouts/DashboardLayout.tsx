import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import Breadcrumbs, {
  BreadcrumbProvider,
  useBreadcrumbItems,
} from "../components/Breadcrumbs";
import { Selector } from "../components/Selectors";
import { CurrencyProvider } from "../components/CurrencyContext";
import { SelectionProvider } from "../components/SelectionContext";
import { version } from "../../package.json";
import { get } from "../utils/apiClient";
import { useAuth } from "../components/AuthContext";
import PrimaryNavigation from "./PrimaryNavigation";
import { getBreadcrumbs } from "../utils/navigation";

function LayoutBreadcrumbs() {
  const location = useLocation();
  const items = useBreadcrumbItems();
  const defaults = useMemo(
    () => getBreadcrumbs(location.pathname),
    [location.pathname],
  );
  const displayItems = items.length > 0 ? items : defaults;
  return <Breadcrumbs items={displayItems} />;
}

export default function DashboardLayout() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [account, setAccount] = useState("All Accounts");
  const [group, setGroup] = useState("All Groups");
  const [currency, setCurrency] = useState("USD");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [accountOptions, setAccountOptions] = useState<string[]>(["All Accounts"]);
  const [groupOptions, setGroupOptions] = useState<string[]>(["All Groups"]);
  const [userLabel, setUserLabel] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [cacheNotice, setCacheNotice] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadFilters = async () => {
      try {
        const [accounts, groups] = await Promise.all([
          get<{ name: string }[]>("/api/accounts"),
          get<{ name: string }[]>("/api/account-groups"),
        ]);
        if (!isMounted) {
          return;
        }
        setAccountOptions(["All Accounts", ...accounts.map((item) => item.name)]);
        setGroupOptions(["All Groups", "Ungrouped", ...groups.map((item) => item.name)]);
      } catch (error) {
        if (isMounted) {
          setAccountOptions(["All Accounts"]);
          setGroupOptions(["All Groups", "Ungrouped"]);
        }
      }
    };
    loadFilters();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      setCacheNotice(null);
    };
    const handleOffline = () => {
      setIsOffline(true);
    };
    const handleCache = (event: Event) => {
      const detail = (event as CustomEvent).detail as { path?: string } | undefined;
      setCacheNotice(detail?.path ?? "cached data");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("firecash:offline-cache", handleCache);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("firecash:offline-cache", handleCache);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadProfile = async () => {
      try {
        const profile = await get<{ name: string; email: string }>("/api/me");
        if (isMounted) {
          const label = profile.name?.trim() || profile.email?.trim() || null;
          setUserLabel(label);
        }
      } catch (error) {
        if (isMounted) {
          setUserLabel(null);
        }
      }
    };
    loadProfile();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!accountOptions.includes(account)) {
      setAccount("All Accounts");
    }
  }, [account, accountOptions]);

  useEffect(() => {
    if (!groupOptions.includes(group)) {
      setGroup("All Groups");
    }
  }, [group, groupOptions]);

  const stableAccountOptions = useMemo(() => accountOptions, [accountOptions]);
  const stableGroupOptions = useMemo(() => groupOptions, [groupOptions]);

  return (
    <CurrencyProvider currency={currency} setCurrency={setCurrency}>
      <SelectionProvider
        account={account}
        group={group}
        setAccount={setAccount}
        setGroup={setGroup}
      >
        <BreadcrumbProvider>
          <div className={`app-shell ${isSidebarOpen ? "" : "sidebar-collapsed"}`}>
            <header className="top-nav">
              <div className="logo-area">
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setIsSidebarOpen((prev) => !prev)}
                  aria-label={isSidebarOpen ? "Hide navigation" : "Show navigation"}
                >
                  {isSidebarOpen ? "×" : "☰"}
                </button>
                <div className="logo-stack">
                  <div className="logo">Firecash</div>
                  <span className="user-indicator">
                    {userLabel ? `Signed in as ${userLabel}` : "Signed in"}
                  </span>
                </div>
              </div>
              <div className="nav-actions">
                <Selector
                  label="Account"
                  value={account}
                  options={stableAccountOptions}
                  onChange={setAccount}
                />
                <Selector
                  label="Group"
                  value={group}
                  options={stableGroupOptions}
                  onChange={setGroup}
                />
                <Selector
                  label="Currency"
                  value={currency}
                  options={["USD", "EUR", "GBP", "JPY", "HKD"]}
                  onChange={setCurrency}
                />
                <button
                  type="button"
                  className="pill"
                  onClick={() => {
                    logout();
                    navigate("/login");
                  }}
                >
                  Log out
                </button>
              </div>
            </header>
            {(isOffline || cacheNotice) && (
              <div className="offline-banner" role="status">
                <strong>{isOffline ? "Offline mode" : "Cached view"}</strong>
                <span>
                  {isOffline
                    ? "We’ll keep you moving with cached data until you reconnect."
                    : `Showing ${cacheNotice}.`}
                </span>
              </div>
            )}
            {isSidebarOpen && (
              <aside className="sidebar">
                <PrimaryNavigation />
              </aside>
            )}
            <main className="content">
              <LayoutBreadcrumbs />
              <Outlet />
            </main>
            <div className="version-badge">v{version}</div>
          </div>
        </BreadcrumbProvider>
      </SelectionProvider>
    </CurrencyProvider>
  );
}
