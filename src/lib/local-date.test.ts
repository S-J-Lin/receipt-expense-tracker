import { describe, expect, it } from "vitest";
import { addIsoDays, dashboardAnchorDate, daysInIsoMonth, localIsoDate, localMonth, monthEnd, shiftIsoMonth, startOfIsoWeek } from "@/lib/local-date";

describe("Europe/Berlin local date helpers", () => {
  it("uses Berlin local today instead of UTC", () => expect(localIsoDate(new Date("2026-09-13T22:30:00Z"))).toBe("2026-09-14"));
  it("handles the DST spring transition", () => expect(localIsoDate(new Date("2026-03-29T22:30:00Z"))).toBe("2026-03-30"));
  it("handles the DST autumn transition", () => expect(localIsoDate(new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-26"));
  it("provides the local month", () => expect(localMonth(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01"));
  it("handles leap years and month ends", () => { expect(daysInIsoMonth("2028-02")).toBe(29); expect(monthEnd("2026-02")).toBe("2026-02-28"); });
  it("handles year boundaries", () => expect(shiftIsoMonth("2026-01", -1)).toBe("2025-12"));
  it("uses Monday as the start of week", () => expect(startOfIsoWeek("2026-09-13")).toBe("2026-09-07"));
  it("uses the final day for a historical selected month", () => expect(dashboardAnchorDate("2026-02", "2026-09-13")).toBe("2026-02-28"));
  it("adds date-only days without DST drift", () => expect(addIsoDays("2026-03-29", 1)).toBe("2026-03-30"));
});
