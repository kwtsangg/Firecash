import { NavLink } from "react-router-dom";

export type BreadcrumbItem = {
  label: string;
  to?: string;
  hint?: string;
};

type BreadcrumbsProps = {
  items: BreadcrumbItem[];
};

export default function Breadcrumbs({ items }: BreadcrumbsProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const content = item.to && !isLast ? (
            <NavLink to={item.to}>{item.label}</NavLink>
          ) : (
            <span aria-current={isLast ? "page" : undefined}>{item.label}</span>
          );

          return (
            <li key={`${item.label}-${index}`} className="breadcrumb-item">
              {content}
              {item.hint && <span className="breadcrumb-hint">{item.hint}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
