import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { Selector } from "../components/Selectors";
import { CurrencyProvider } from "../components/CurrencyContext";
import { SelectionProvider } from "../components/SelectionContext";
import { version } from "../../package.json";
import { get } from "../utils/apiClient";
import { useAuth } from "../components/AuthContext";

const navigation = [
  { label: "Dashboard", to: "/dashboard" },
  { label: "Stocks", to: "/stocks" },
  { label: "Transactions", to: "/transactions" },
  { label: "Accounts", to: "/accounts" },
  { label: "Settings", to: "/settings" },
];

export default function DashboardLayout() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [account, setAccount] = useState("All Accounts");
  const [group, setGroup] = useState("All Groups");
  const [currency, setCurrency] = useState("USD");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [accountOptions, setAccountOptions] = useState<string[]>(["All Accounts"]);
  const [groupOptions, setGroupOptions] = useState<string[]>(["All Groups"]);
  const [userName, setUserName] = useState<string | null>(null);

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
    let isMounted = true;
    const loadProfile = async () => {
      try {
        const profile = await get<{ name: string }>("/api/me");
        if (isMounted) {
          setUserName(profile.name);
        }
      } catch (error) {
        if (isMounted) {
          setUserName(null);
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
              <div className="logo">Firecash</div>
            </div>
            <div className="nav-actions">
              <span className="user-indicator">
                {userName ? `Signed in as ${userName}` : "Signed in"}
              </span>
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
          {isSidebarOpen && (
            <aside className="sidebar">
              <nav>
                {navigation.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `nav-link ${isActive ? "active" : ""}`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </aside>
          )}
          <main className="content">
            <Outlet />
          </main>
          <div className="version-badge">v{version}</div>
        </div>
      </SelectionProvider>
    </CurrencyProvider>
  );
}
