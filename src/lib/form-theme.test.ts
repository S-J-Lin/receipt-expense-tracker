import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("dark form hierarchy", () => {
  const css = readFileSync(resolve("src/app/globals.css"), "utf8");
  it("defines shared label, value, placeholder and optional tokens", () => {
    expect(css).toContain("--foreground-secondary: #a3a3a3");
    expect(css).toContain("--field-background: #161616");
    expect(css).toContain("--field-border: #333333");
    expect(css).toContain("--field-placeholder: #6b7280");
    expect(css).toContain("--field-optional: #7a7a7a");
  });
  it("keeps controls iPhone-safe with a visible accent focus ring", () => {
    expect(css).toContain("font-size: 1rem");
    expect(css).toContain("border-color: var(--accent) !important");
    expect(css).toContain("0 0 0 3px rgb(79 140 255 / 18%)");
  });
  it("distinguishes invalid, disabled and read-only states", () => {
    expect(css).toContain('aria-invalid="true"');
    expect(css).toContain("cursor: not-allowed");
    expect(css).toContain("input:read-only:not(:disabled)");
  });
});
