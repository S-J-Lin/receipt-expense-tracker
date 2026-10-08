export function moneyToCents(value: number | string): number {
  const normalized = String(value).replace(",", ".");
  const [whole = "0", fraction = ""] = normalized.split(".");
  const sign = whole.startsWith("-") ? -1 : 1;
  const wholeDigits = whole.replace("-", "") || "0";
  const fractionDigits = `${fraction}00`.slice(0, 2);
  return sign * (Number.parseInt(wholeDigits, 10) * 100 + Number.parseInt(fractionDigits, 10));
}

export function formatMoneyFromCents(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(cents / 100);
}

export function formatExpenseAmount(amount: number, currency = "EUR"): string {
  return formatMoneyFromCents(moneyToCents(amount), currency);
}

/**
 * Parses a typed amount. Accepts `12.50`, `12,50` (German keyboards), an
 * optional leading minus and no thousands separators. Returns null for
 * anything ambiguous instead of guessing.
 */
export function parseDecimalInput(value: string | number | null | undefined, maxDecimals = 2): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = (value ?? "").trim().replace(/−/g, "-");
  const pattern = new RegExp(`^-?\\d+(?:[.,]\\d{1,${maxDecimals}})?$`);
  if (!pattern.test(text)) return null;
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Display string for an amount input (dot decimal, no trailing zeros forced). */
export function amountInputText(value: number | null | undefined): string {
  return value === null || value === undefined || Number.isNaN(value) ? "" : String(value);
}

/** True when a number has at most two decimal places (what numeric(12,2) stores without rounding). */
export function hasAtMostTwoDecimals(value: number): boolean {
  return Number.isFinite(value) && Math.abs(Math.round(value * 100) - value * 100) < 1e-6;
}
