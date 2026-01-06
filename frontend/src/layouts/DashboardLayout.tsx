import { NavLink, Outlet } from "react-router-dom";

const navigation = [
  { label: "Dashboard", to: "/dashboard" },
  { label: "Transactions", to: "/transactions" },
  { label: "Accounts", to: "/accounts" },
  { label: "Settings", to: "/settings" },
];

export default function DashboardLayout() {
  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="logo">Firecash</div>
        <div className="nav-actions">
          <button className="pill">Primary Account</button>
          <button className="pill">All Groups</button>
          <button className="pill">USD</button>
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
