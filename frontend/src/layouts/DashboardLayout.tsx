import { NavLink, Outlet } from "react-router-dom";
import { useState } from "react";
import { Selector } from "../components/Selectors";

const navigation = [
  { label: "Dashboard", to: "/dashboard" },
  { label: "Transactions", to: "/transactions" },
  { label: "Accounts", to: "/accounts" },
  { label: "Settings", to: "/settings" },
];

export default function DashboardLayout() {
  const [account, setAccount] = useState("Primary Account");
  const [group, setGroup] = useState("All Groups");
  const [currency, setCurrency] = useState("USD");

  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="logo">Firecash</div>
        <div className="nav-actions">
          <Selector
            label="Account"
            value={account}
            options={["Primary Account", "Retirement", "Side Hustle"]}
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
            options={["USD", "EUR", "GBP", "JPY"]}
            onChange={setCurrency}
          />
        </div>
      </header>
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
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
