import { describe, expect, it } from "vitest";
import {
  addStoreDays,
  formatStoreDateTime,
  storeCalendarDate,
  storeDateTime,
  storeDayEnd,
  storeDayStart,
} from "@volt/shared";

describe("Helsinki store clock", () => {
  it("formats a UTC instant as Helsinki wall time", () => {
    const stamp = formatStoreDateTime("2026-09-14T17:10:00.000Z");
    expect(stamp).toMatch(/14 Sep/);
    expect(stamp).toContain("2026");
    expect(stamp).toMatch(/20:10/);
    expect(stamp).toMatch(/EEST|GMT\+3/);
  });

  it("treats calendar days as Europe/Helsinki, not UTC", () => {
    const start = storeDayStart("2026-10-11");
    expect(storeCalendarDate(start)).toBe("2026-10-11");
    expect(start.toISOString()).toBe("2026-10-10T21:00:00.000Z");
    const end = storeDayEnd("2026-10-11");
    expect(storeCalendarDate(end)).toBe("2026-10-11");
    expect(storeDateTime("2026-09-14", "20:10:00").toISOString()).toBe("2026-09-14T17:10:00.000Z");
  });

  it("adds delivery days on the Helsinki calendar", () => {
    const from = storeDateTime("2026-10-11", "23:30:00");
    expect(storeCalendarDate(addStoreDays(from, 1))).toBe("2026-10-12");
  });
});
