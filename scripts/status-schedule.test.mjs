import { describe, expect, it } from "vitest";
import {
  getStatusAgeMinutes,
  isStatusCheckDue,
  isStatusRunActive,
} from "./status-schedule.mjs";

const NOW = Date.parse("2026-08-02T09:10:00.000Z");

describe("status schedule", () => {
  it("runs again once the latest completed check is 55 minutes old", () => {
    expect(isStatusCheckDue("2026-08-02T08:16:00.000Z", NOW)).toBe(false);
    expect(isStatusCheckDue("2026-08-02T08:15:00.000Z", NOW)).toBe(true);
  });

  it("runs when there is no valid previous timestamp", () => {
    expect(isStatusCheckDue(null, NOW)).toBe(true);
    expect(isStatusCheckDue("invalid", NOW)).toBe(true);
  });

  it("prevents overlapping checks while allowing a retry after ten minutes", () => {
    expect(
      isStatusRunActive(
        { state: "running", startedAt: "2026-08-02T09:01:00.000Z" },
        NOW,
      ),
    ).toBe(true);
    expect(
      isStatusRunActive(
        { state: "running", startedAt: "2026-08-02T09:00:00.000Z" },
        NOW,
      ),
    ).toBe(false);
  });

  it("reports the rounded status age", () => {
    expect(getStatusAgeMinutes("2026-08-02T08:12:20.000Z", NOW)).toBe(58);
    expect(getStatusAgeMinutes(null, NOW)).toBeNull();
  });
});
