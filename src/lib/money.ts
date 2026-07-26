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
