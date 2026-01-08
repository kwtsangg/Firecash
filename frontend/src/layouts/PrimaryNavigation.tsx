import { NavLink } from "react-router-dom";
import { navigationSections } from "../utils/navigation";

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
      {navigationSections.map((section) => (
        <NavSection key={section.title} title={section.title} items={section.items} />
      ))}
    </nav>
  );
}
