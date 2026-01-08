import { useEffect } from "react";
import { useBreadcrumbs } from "../components/Breadcrumbs";
import type { BreadcrumbItem } from "../components/Breadcrumbs";

export const APP_TITLE = "Firecash";

export function formatPageTitle(title: string) {
  return `${title} | ${APP_TITLE}`;
}

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = formatPageTitle(title);
  }, [title]);
}

type PageMeta = {
  title: string;
  breadcrumbs?: BreadcrumbItem[];
};

export function usePageMeta({ title, breadcrumbs }: PageMeta) {
  usePageTitle(title);
  useBreadcrumbs(breadcrumbs);
}
