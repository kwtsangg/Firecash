import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";

export type BreadcrumbItem = {
  label: string;
  to?: string;
  hint?: string;
};

type BreadcrumbsProps = {
  items: BreadcrumbItem[];
  className?: string;
};

type BreadcrumbContextValue = {
  items: BreadcrumbItem[];
  setItems: (items: BreadcrumbItem[]) => void;
};

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BreadcrumbItem[]>([]);
  const value = useMemo(() => ({ items, setItems }), [items]);

  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

export function useBreadcrumbs(items?: BreadcrumbItem[]) {
  const context = useContext(BreadcrumbContext);

  useEffect(() => {
    if (!context || items === undefined) {
      return;
    }
    context.setItems(items);
    return () => {
      context.setItems([]);
    };
  }, [context, items]);

  return context?.items ?? [];
}

export function useBreadcrumbItems() {
  return useContext(BreadcrumbContext)?.items ?? [];
}

export default function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav className={`breadcrumbs ${className ?? ""}`.trim()} aria-label="Breadcrumb">
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
