import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { BACKGROUND_COLOR, canSubmitOnline, CLIPBOARD_DENIED_MESSAGE, MOBILE_NAV_ITEMS, OFFLINE_MESSAGE, PWA_ICONS, THEME_COLOR } from "@/lib/pwa-config";

describe("Milestone 13 PWA contract", () => {
  it("provides an installable standalone manifest and icons", () => {
    const value = manifest();
    expect(value.display).toBe("standalone"); expect(value.start_url).toBe("/"); expect(value.icons).toEqual(PWA_ICONS);
    for (const icon of PWA_ICONS) expect(existsSync(resolve("public", icon.src.slice(1)))).toBe(true);
    expect(existsSync(resolve("public/icons/apple-touch-icon.png"))).toBe(true);
    expect(THEME_COLOR).toBe("#121212"); expect(BACKGROUND_COLOR).toBe("#121212");
  });
  it("keeps the five mobile destinations", () => expect(MOBILE_NAV_ITEMS.map(({ href }) => href)).toEqual(["/", "/expenses/new", "/import/chatgpt", "/export", "/expenses"]));
  it("has actionable fallbacks", () => { expect(CLIPBOARD_DENIED_MESSAGE).toBe("無法自動讀取剪貼簿，請長按輸入框並選擇貼上。"); expect(canSubmitOnline(false)).toBe(OFFLINE_MESSAGE); expect(canSubmitOnline(true)).toBeNull(); });
  it("excludes personal routes from caching", () => { const worker = readFileSync(resolve("public/sw.js"), "utf8"); expect(worker).toContain('request.method !== "GET"'); expect(worker).toContain('url.pathname.startsWith("/api/")'); expect(worker).toContain('url.pathname.startsWith("/export/download")'); });
});
