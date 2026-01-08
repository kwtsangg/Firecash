const LOCALE_KEY = "firecash-locale";

export type SupportedLocale = "en" | "es";

const translations: Record<SupportedLocale, Record<string, string>> = {
  en: {
    settingsTitle: "Settings",
    integrationsTitle: "Integrations",
  },
  es: {
    settingsTitle: "Configuración",
    integrationsTitle: "Integraciones",
  },
};

export function getLocale(): SupportedLocale {
  const stored = localStorage.getItem(LOCALE_KEY);
  if (stored === "en" || stored === "es") {
    return stored;
  }
  return "en";
}

export function setLocale(locale: SupportedLocale) {
  localStorage.setItem(LOCALE_KEY, locale);
  document.documentElement.lang = locale;
}

export function t(key: string, locale: SupportedLocale) {
  return translations[locale]?.[key] ?? key;
}

export const supportedLocales: { label: string; value: SupportedLocale }[] = [
  { label: "English", value: "en" },
  { label: "Español", value: "es" },
];
