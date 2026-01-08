const THEME_KEY = "firecash-theme";

export type ThemePreference = "dark" | "light" | "system";

export function getThemePreference(): ThemePreference {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "dark" || stored === "light" || stored === "system") {
    return stored;
  }
  return "dark";
}

export function setThemePreference(theme: ThemePreference) {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}

export function applyTheme(theme: ThemePreference) {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

export function getSystemTheme(): "dark" | "light" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
