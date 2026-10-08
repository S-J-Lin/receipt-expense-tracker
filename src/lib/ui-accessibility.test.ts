import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? pages(path) : name === "page.tsx" ? [path] : [];
  });
}

function luminance(hex: string) {
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(hex.slice(1 + offset, 3 + offset), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const token = (name: string) => css.match(new RegExp(`--${name}: (#[0-9a-f]{6})`))?.[1] ?? "";

describe("disabled and form states", () => {
  it("styles disabled accent buttons even though the legacy override is unlayered", () => {
    expect(css).toContain('.bg-indigo-600:disabled, .bg-indigo-700:disabled');
    expect(css).toContain(".ui-btn:disabled");
  });
  it("meets WCAG contrast for field borders (3:1), placeholders and optional labels (4.5:1)", () => {
    expect(contrast(token("field-border"), token("card"))).toBeGreaterThanOrEqual(3);
    expect(contrast(token("field-border"), token("field-background"))).toBeGreaterThanOrEqual(3);
    expect(contrast(token("field-placeholder"), token("field-background"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("field-optional"), token("card"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("disabled-foreground"), token("disabled-background"))).toBeGreaterThanOrEqual(4.5);
  });
  it("maps light Tailwind classes that previously rendered light boxes in the dark theme", () => {
    for (const selector of [".bg-blue-50", ".text-blue-900", ".hover\\:bg-slate-50:hover", ".hover\\:bg-red-100:hover"]) expect(css).toContain(selector);
  });
  it("shows a visible focus ring on links and buttons", () => expect(css).toContain("a:focus-visible, button:focus-visible"));
});

describe("mobile navigation", () => {
  it("hides the fixed bar only for text-entry controls, never for checkbox/radio/file", () => {
    const rule = css.slice(css.indexOf("body:has("), css.indexOf(".mobile-bottom-nav {", css.indexOf("body:has(")));
    expect(rule).toContain(':not([type="checkbox"]):not([type="radio"]):not([type="file"])');
    expect(css).toContain("env(safe-area-inset-bottom)");
  });
  it("marks the active destination with more than color", () => {
    const nav = readFileSync("src/components/mobile-nav.tsx", "utf8");
    expect(nav).toContain('aria-current={active ? "page" : undefined}');
    expect(nav).toContain("font-bold");
    expect(nav).toContain("h-0.5");
  });
  it("lets large amounts wrap instead of hiding digits behind an ellipsis", () => {
    const amount = css.slice(css.indexOf(".dashboard-amount {"), css.indexOf("}", css.indexOf(".dashboard-amount {")));
    expect(amount).not.toContain("text-overflow: ellipsis");
    expect(amount).toContain("overflow-wrap: anywhere");
  });
});

describe("page titles", () => {
  it("gives every route except the dashboard and redirects its own title", () => {
    const missing = pages("src/app").filter((file) => !file.endsWith(join("app", "page.tsx")) && !file.includes("groups")).filter((file) => !readFileSync(file, "utf8").includes("export const metadata"));
    expect(missing).toEqual([]);
    expect(readFileSync("src/app/layout.tsx", "utf8")).toContain("template: `%s · ${APP_NAME}`");
  });
});

describe("service worker", () => {
  const worker = readFileSync("public/sw.js", "utf8");
  it("stores only successful same-origin static responses", () => expect(worker).toContain('response.ok && response.type === "basic"'));
  it("never caches navigations, exports, backups or API calls", () => {
    expect(worker).toContain('url.pathname.startsWith("/export/download")');
    expect(worker).toContain('url.pathname.startsWith("/import/backup")');
    expect(worker).toContain('event.respondWith(fetch(request).catch(() => caches.match("/offline")))');
  });
  it("bounds the static cache", () => expect(worker).toContain("STATIC_LIMIT"));
});

describe("amount inputs", () => {
  it("keeps dormant receipt forms on the shared dark UI and decimal text input", () => {
    const form = readFileSync("src/components/expense-form.tsx", "utf8");
    expect(form).toContain('inputMode="decimal"'); expect(form).not.toContain('type="number"');
    for (const path of ["src/components/expense-form.tsx", "src/components/receipt-upload-form.tsx", "src/components/cancel-receipt-session-button.tsx"]) expect(readFileSync(path, "utf8")).toContain("ui-btn");
    for (const path of ["src/app/receipts/upload/page.tsx", "src/app/receipts/confirm/[sessionId]/page.tsx"]) expect(readFileSync(path, "utf8")).toContain("ui-card");
  });
  it("use the decimal keypad and offer a sign toggle for adjustments", () => {
    const input = readFileSync("src/components/ui/amount-input.tsx", "utf8");
    expect(input).toContain('inputMode="decimal"');
    expect(input).toContain("aria-pressed={negative}");
    for (const form of ["src/components/manual-expense-form.tsx", "src/components/chatgpt-import-form.tsx", "src/components/itemized-expense-editor.tsx"]) {
      const source = readFileSync(form, "utf8");
      expect(source, form).toContain("<AmountInput allowNegative");
      expect(source, form).not.toContain('type="number"');
    }
  });
});
