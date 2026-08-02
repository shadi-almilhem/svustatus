import { describe, expect, it } from "vitest";
import {
  createWatchExpiry,
  getRecoveredMonitorIds,
  selectRecoverableWatches,
} from "./status-recovery.mjs";

describe("recovery notifications", () => {
  it("detects services that moved from outage to operational", () => {
    const previous = payload([
      ["lms", "error"],
      ["mail", "success"],
      ["svuis", "empty"],
    ]);
    const next = payload([
      ["lms", "success"],
      ["mail", "success"],
      ["svuis", "success"],
    ]);

    expect(getRecoveredMonitorIds(previous, next)).toEqual(["lms"]);
  });

  it("does not notify on the first stored status run", () => {
    expect(getRecoveredMonitorIds(null, payload([["lms", "success"]]))).toEqual([]);
  });

  it("selects only unexpired one-time watches for recovered services", () => {
    const now = new Date("2026-05-10T10:00:00.000Z");
    const watches = [
      watch("1", "lms", "2026-05-10T11:00:00.000Z", null),
      watch("2", "mail", "2026-05-10T11:00:00.000Z", null),
      watch("3", "lms", "2026-05-10T09:59:00.000Z", null),
      watch("4", "lms", "2026-05-10T11:00:00.000Z", "2026-05-10T10:01:00.000Z"),
    ];

    expect(selectRecoverableWatches(watches, ["lms"], now).map((item) => item.id)).toEqual([
      "1",
    ]);
  });

  it("creates seven-day watch expiries by default", () => {
    expect(createWatchExpiry(new Date("2026-05-10T10:00:00.000Z"))).toBe(
      "2026-05-17T10:00:00.000Z",
    );
  });
});

function payload(entries) {
  return {
    monitors: entries.map(([id, currentStatus]) => ({ id, currentStatus })),
  };
}

function watch(id, monitorId, expiresAt, notifiedAt) {
  return {
    id,
    monitor_id: monitorId,
    endpoint: `https://push.example/${id}`,
    p256dh: "key",
    auth: "auth",
    expires_at: expiresAt,
    notified_at: notifiedAt,
  };
}
