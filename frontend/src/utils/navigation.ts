import type { BreadcrumbItem } from "../components/Breadcrumbs";
import { pageTitles } from "./pageTitles";

export type NavigationSection = {
  title: string;
  items: { label: string; to: string }[];
};

type BreadcrumbRoute = {
  label: string;
  to: string;
  parent?: string;
};

export const navigationSections: NavigationSection[] = [
  {
    title: "Core",
    items: [
      { label: pageTitles.dashboard, to: "/dashboard" },
      { label: pageTitles.accounts, to: "/accounts" },
      { label: pageTitles.transactions, to: "/transactions" },
      { label: pageTitles.reports, to: "/reports" },
      { label: pageTitles.settings, to: "/settings" },
    ],
  },
  {
    title: "Platform",
    items: [
      { label: pageTitles.integrations, to: "/integrations" },
    ],
  },
  {
    title: "Explore",
    items: [
      { label: pageTitles.stocks, to: "/stocks" },
      { label: pageTitles.stockMarket, to: "/stocks/market" },
    ],
  },
];

const breadcrumbRoutes: BreadcrumbRoute[] = [
  { label: pageTitles.dashboard, to: "/dashboard" },
  { label: pageTitles.accounts, to: "/accounts" },
  { label: pageTitles.transactions, to: "/transactions" },
  { label: pageTitles.reports, to: "/reports" },
  { label: pageTitles.settings, to: "/settings" },
  { label: pageTitles.integrations, to: "/integrations" },
  { label: pageTitles.stocks, to: "/stocks" },
  { label: pageTitles.stockMarket, to: "/stocks/market", parent: "/stocks" },
];

const breadcrumbMap = new Map(breadcrumbRoutes.map((route) => [route.to, route]));

export function getBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const normalized = pathname.replace(/\/$/, "") || "/";
  const match = breadcrumbMap.get(normalized);
  if (!match) {
    return [];
  }

  const items: BreadcrumbItem[] = [];
  const visited = new Set<string>();
  let current: BreadcrumbRoute | undefined = match;
  while (current && !visited.has(current.to)) {
    items.unshift({ label: current.label, to: current.to });
    visited.add(current.to);
    current = current.parent ? breadcrumbMap.get(current.parent) : undefined;
  }

  return items;
}
