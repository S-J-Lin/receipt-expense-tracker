"use client";

/**
 * Submit button for irreversible actions. The server action also requires
 * the button's name/value pair, so a request without this button is refused.
 */
export function ConfirmSubmitButton({ children, className, message, name, value = "yes" }: { children: React.ReactNode; className?: string; message: string; name: string; value?: string }) {
  return <button className={className} name={name} onClick={(event) => { if (!window.confirm(message)) event.preventDefault(); }} type="submit" value={value}>{children}</button>;
}
