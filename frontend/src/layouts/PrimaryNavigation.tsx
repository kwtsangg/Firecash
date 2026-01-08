import { NavLink } from "react-router-dom";
import { pageTitles } from "../utils/pageTitles";

const primarySections = [
  { label: pageTitles.accounts, to: "/accounts" },
  { label: pageTitles.transactions, to: "/transactions" },
  { label: pageTitles.reports, to: "/reports" },
  { label: pageTitles.settings, to: "/settings" },
];

const secondarySections = [
  { label: pageTitles.dashboard, to: "/dashboard" },
  { label: pageTitles.stocks, to: "/stocks" },
  { label: pageTitles.stockMarket, to: "/stocks/market" },
];

type NavSectionProps = {
  title: string;
  items: { label: string; to: string }[];
};

function NavSection({ title, items }: NavSectionProps) {
  return (
    <div className="nav-section">
      <div className="nav-section-title">{title}</div>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
        >
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

export default function PrimaryNavigation() {
  return (
    <nav className="primary-nav" aria-label="Primary">
      <NavSection title="Core" items={primarySections} />
      <NavSection title="Explore" items={secondarySections} />
    </nav>
  );
}
