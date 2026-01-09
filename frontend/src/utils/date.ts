export function toDateInputValue(date: Date) {
  const offsetMinutes = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offsetMinutes * 60000);
  return localDate.toISOString().slice(0, 10);
}

export function formatDateInputValue(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  const year = digits.slice(0, 4);
  const month = digits.slice(4, 6);
  const day = digits.slice(6, 8);
  return [year, month, day].filter(Boolean).join("/");
}

export function toIsoDateInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length < 8) {
    return "";
  }
  const year = digits.slice(0, 4);
  const month = digits.slice(4, 6);
  const day = digits.slice(6, 8);
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function startOfMonth(date: Date) {
  const copy = new Date(date);
  copy.setDate(1);
  return copy;
}

export function getDefaultRange(days: number) {
  const end = new Date();
  const start = addDays(end, -days);
  return {
    from: toDateInputValue(start),
    to: toDateInputValue(end),
  };
}

export function parseDateInput(dateString: string) {
  return new Date(`${dateString}T00:00:00`);
}

export function formatDateDisplay(date: string | Date) {
  const normalized =
    typeof date === "string" ? date.split("T")[0] : toDateInputValue(date);
  const [year, month, day] = normalized.split("-");
  if (!year || !month || !day) {
    return normalized;
  }
  return `${year}/${month.padStart(2, "0")}/${day.padStart(2, "0")}`;
}

export function toIsoDateTime(dateString: string) {
  return new Date(`${dateString}T00:00:00Z`).toISOString();
}
