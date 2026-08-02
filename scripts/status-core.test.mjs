import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildStatusPayload,
  calculateUptimePercent,
  checkMonitorOnce,
  mergeStatusHistories,
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
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

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

  it("merges fallback and primary histories without duplicate hourly checks", () => {
    const fallback = {
      history: {
        portal: [
          check("portal", "2026-05-04T08:00:00.000Z", true),
          check("portal", "2026-05-05T08:00:00.000Z", true),
        ],
      },
    };
    const primary = {
      history: {
        portal: [
          check("portal", "2026-05-05T08:00:00.000Z", false),
          check("portal", "2026-05-05T09:00:00.000Z", true),
        ],
      },
    };

    const history = mergeStatusHistories([fallback, primary], config.monitors);

    expect(history.portal.map((record) => record.checkedAt)).toEqual([
      "2026-05-04T08:00:00.000Z",
      "2026-05-05T08:00:00.000Z",
      "2026-05-05T09:00:00.000Z",
    ]);
    expect(history.portal[1].ok).toBe(false);
  });

  it("enforces its own deadline when an upstream fetch never settles", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise(() => undefined),
    );
    const resultPromise = checkMonitorOnce(
      config.monitors[0],
      { ...config, timeoutMs: 1_000 },
      "2026-05-05T08:00:00.000Z",
      1,
    );

    await vi.advanceTimersByTimeAsync(1_000);
    const result = await resultPromise;

    expect(result.ok).toBe(false);
    expect(result.error).toContain("timed out after 1000 ms");
  });

  it("cancels response bodies that status checks do not consume", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      status: 200,
      body: { cancel },
    });

    const result = await checkMonitorOnce(
      config.monitors[0],
      config,
      "2026-05-05T08:00:00.000Z",
      1,
    );

    expect(result.ok).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
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
