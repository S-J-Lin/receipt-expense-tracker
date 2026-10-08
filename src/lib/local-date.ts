export const APP_TIME_ZONE = "Europe/Berlin";

export function localIsoDate(now = new Date(), timeZone = APP_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function localMonth(now = new Date(), timeZone = APP_TIME_ZONE): string {
  return localIsoDate(now, timeZone).slice(0, 7);
}

function fromIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

export function addIsoDays(value: string, days: number): string {
  const date = fromIsoDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysInIsoMonth(month: string): number {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

export function monthStart(month: string): string {
  return `${month}-01`;
}

export function monthEnd(month: string): string {
  return `${month}-${String(daysInIsoMonth(month)).padStart(2, "0")}`;
}

export function shiftIsoMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + offset, 1)).toISOString().slice(0, 7);
}

export function startOfIsoWeek(value: string): string {
  const day = fromIsoDate(value).getUTCDay();
  return addIsoDays(value, -(day === 0 ? 6 : day - 1));
}

export function inclusiveDayCount(start: string, end: string): number {
  return Math.floor((fromIsoDate(end).getTime() - fromIsoDate(start).getTime()) / 86_400_000) + 1;
}

export function dashboardAnchorDate(month: string, today = localIsoDate()): string {
  return month === today.slice(0, 7) ? today : monthEnd(month);
}

/** True for a real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isRealIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** First day of the Berlin-local month `offset` months from `today` (YYYY-MM-DD). */
export function monthStartOffset(today: string, offset: number): string {
  return `${shiftIsoMonth(today.slice(0, 7), offset)}-01`;
}
