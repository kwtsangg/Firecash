import { NavLink, Outlet } from "react-router-dom";
import { useState } from "react";
import { Selector } from "../components/Selectors";
import { CurrencyProvider } from "../components/CurrencyContext";
import { SelectionProvider } from "../components/SelectionContext";
import { version } from "../../package.json";

const navigation = [
  { label: "Dashboard", to: "/dashboard" },
  { label: "Stocks", to: "/stocks" },
  { label: "Transactions", to: "/transactions" },
  { label: "Accounts", to: "/accounts" },
  { label: "Settings", to: "/settings" },
];

export default function DashboardLayout() {
  const [account, setAccount] = useState("All Accounts");
  const [group, setGroup] = useState("All Groups");
  const [currency, setCurrency] = useState("USD");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

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
              <Selector
                label="Account"
                value={account}
                options={["All Accounts", "Primary Account", "Retirement", "Side Hustle"]}
                onChange={setAccount}
              />
              <Selector
                label="Group"
                value={group}
                options={["All Groups", "Investments", "Cashflow"]}
                onChange={setGroup}
              />
              <Selector
                label="Currency"
                value={currency}
                options={["USD", "EUR", "GBP", "JPY", "HKD"]}
                onChange={setCurrency}
              />
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
