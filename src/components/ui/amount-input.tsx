"use client";

import { useState } from "react";
import { amountInputText, parseDecimalInput } from "@/lib/money";

type Props = {
  id: string;
  value: number;
  onValueChange: (value: number) => void;
  /** Adds a −/+ toggle; iOS decimal keypads have no minus key. */
  allowNegative?: boolean;
  maxDecimals?: number;
  className?: string;
  describedBy?: string;
  placeholder?: string;
  required?: boolean;
};

/**
 * Amount field for phones: text input with the decimal keypad, accepting
 * `12.50` and `12,50`. Invalid text is reported as NaN so schema validation
 * rejects it instead of silently saving 0.
 */
export function AmountInput({ id, value, onValueChange, allowNegative = false, maxDecimals = 2, className = "", describedBy, placeholder, required }: Props) {
  const [text, setText] = useState(() => amountInputText(Number.isNaN(value) ? null : Math.abs(value)));
  const [negative, setNegative] = useState(value < 0);
  const parsed = parseDecimalInput(text, maxDecimals);
  const invalid = text.trim() !== "" && (parsed === null || (parsed < 0 && !allowNegative));
  const emit = (nextText: string, nextNegative: boolean) => {
    const amount = parseDecimalInput(nextText, maxDecimals);
    if (amount === null || (amount < 0 && !allowNegative)) { onValueChange(nextText.trim() === "" ? 0 : Number.NaN); return; }
    // A typed minus sign (hardware keyboard) is honoured as well as the toggle.
    if (amount < 0) { onValueChange(amount); return; }
    onValueChange(nextNegative ? -amount : amount);
  };
  const input = <input aria-describedby={describedBy} aria-invalid={invalid || undefined} autoComplete="off" className={`${className} money-input`} enterKeyHint="next" id={id} inputMode="decimal" onChange={(event) => { setText(event.target.value); emit(event.target.value, negative); }} placeholder={placeholder ?? (maxDecimals === 2 ? "0,00" : "1")} required={required} type="text" value={text} />;
  if (!allowNegative) return input;
  return <div className="mt-1 flex min-w-0 gap-2">
    <button aria-label={negative ? "目前為減項（負數），點擊改為加項" : "目前為加項（正數），點擊改為減項"} aria-pressed={negative} className={`ui-btn shrink-0 px-3 ${negative ? "ui-btn-danger" : "ui-btn-secondary"}`} onClick={() => { const next = !negative; setNegative(next); emit(text, next); }} type="button">{negative ? "−" : "+"}</button>
    <div className="min-w-0 flex-1 [&>input]:mt-0">{input}</div>
  </div>;
}
