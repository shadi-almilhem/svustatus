import { describe, expect, it } from "vitest";
import {
  buildStatusPayload,
  calculateUptimePercent,
  normalizeConfig,
} from "./status-core.mjs";

const config = normalizeConfig({
  timezone: "Asia/Dubai",
  historyDays: 3,
  timeoutMs: 20_000,
  retries: 3,
  monitors: [
    {
      id: "portal",
      name: { en: "Portal", ar: "البوابة" },
      url: "https://example.com",
    },
  ],
});

describe("status aggregation", () => {
  it("marks successful checks as operational", () => {
    const payload = buildStatusPayload(
      config,
      null,
      [check("portal", "2026-05-05T08:00:00.000Z", true)],
      new Date("2026-05-05T12:00:00.000Z"),
    );

    expect(payload.monitors[0].currentStatus).toBe("success");
    expect(payload.monitors[0].uptimePercent).toBe(100);
    expect(payload.monitors[0].daily.at(-1).bar).toEqual([
      { status: "success", height: 100 },
    ]);
  });

  it("marks failed checks as outage", () => {
    const payload = buildStatusPayload(
      config,
      null,
      [check("portal", "2026-05-05T08:00:00.000Z", false)],
      new Date("2026-05-05T12:00:00.000Z"),
    );

    expect(payload.monitors[0].currentStatus).toBe("error");
    expect(payload.monitors[0].uptimePercent).toBe(0);
    expect(payload.monitors[0].incidents).toHaveLength(1);
  });

  it("creates mixed green and red bars for a partial outage day", () => {
    const payload = buildStatusPayload(
      config,
      null,
      [
        check("portal", "2026-05-05T08:00:00.000Z", true),
        check("portal", "2026-05-05T09:00:00.000Z", false),
        check("portal", "2026-05-05T10:00:00.000Z", true),
      ],
      new Date("2026-05-05T12:00:00.000Z"),
    );

    expect(payload.monitors[0].daily.at(-1).bar).toEqual([
      { status: "success", height: 66.67 },
      { status: "error", height: 33.33 },
    ]);
    expect(payload.monitors[0].incidents[0].resolvedAt).toBe(
      "2026-05-05T10:00:00.000Z",
    );
  });

  it("prunes history outside the configured retention window", () => {
    const previous = {
      history: {
        portal: [
          check("portal", "2026-04-25T08:00:00.000Z", true),
          check("portal", "2026-05-04T08:00:00.000Z", true),
        ],
      },
    };
    const payload = buildStatusPayload(
      config,
      previous,
      [check("portal", "2026-05-05T08:00:00.000Z", true)],
      new Date("2026-05-05T12:00:00.000Z"),
    );

    expect(payload.history.portal.map((record) => record.checkedAt)).toEqual([
      "2026-05-04T08:00:00.000Z",
      "2026-05-05T08:00:00.000Z",
    ]);
  });

  it("calculates uptime from retained checks", () => {
    expect(
      calculateUptimePercent([
        check("portal", "2026-05-05T08:00:00.000Z", true),
        check("portal", "2026-05-05T09:00:00.000Z", true),
        check("portal", "2026-05-05T10:00:00.000Z", true),
        check("portal", "2026-05-05T11:00:00.000Z", false),
      ]),
    ).toBe(75);
  });
});

function check(id, checkedAt, ok) {
  return {
    id,
    url: "https://example.com",
    checkedAt,
    ok,
    status: ok ? 200 : 500,
    latencyMs: 120,
    attempt: 1,
  };
}
