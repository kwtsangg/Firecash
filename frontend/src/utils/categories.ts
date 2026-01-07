const defaultCategories = ["General", "Housing", "Investing", "Lifestyle", "Bills"];

export function readCategories() {
  if (typeof window === "undefined") {
    return defaultCategories;
  }
  try {
    const stored = window.localStorage.getItem("firecash.categories");
    if (!stored) {
      return defaultCategories;
    }
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return defaultCategories;
    }
    const normalized = parsed
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
    return normalized.length ? normalized : defaultCategories;
  } catch (error) {
    return defaultCategories;
  }
}

export function storeCategories(categories: string[]) {
  if (typeof window === "undefined") {
    return;
  }
  const trimmed = categories.map((item) => item.trim()).filter(Boolean);
  window.localStorage.setItem("firecash.categories", JSON.stringify(trimmed));
}
