import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readStatusPayload,
  STATUS_KV_KEY,
  STATUS_LIVE_KEY,
  type PagesEnv,
} from "./status";

describe("readStatusPayload", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns fresh KV data without fetching the public fallback", async () => {
    const kvPayload = payload("2026-05-25T14:00:00.000Z", ["2026-05-24", "2026-05-25"]);
    vi.setSystemTime(new Date("2026-05-25T14:30:00.000Z"));
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await readStatusPayload(
      env({ kvPayload }),
      new Request("https://svustatus.pages.dev/api/status"),
    );

    expect(result.generatedAt).toBe(kvPayload.generatedAt);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prefers fuller fallback history over a newer sparse KV snapshot", async () => {
    const kvPayload = payload("2026-05-25T14:30:00.000Z", ["2026-05-25"]);
    const fallbackPayload = payload("2026-05-25T14:20:00.000Z", [
      "2026-05-24",
      "2026-05-25",
    ]);
    vi.setSystemTime(new Date("2026-05-25T14:45:00.000Z"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(fallbackPayload));

    const result = await readStatusPayload(
      env({ kvPayload }),
      new Request("https://svustatus.pages.dev/api/status"),
    );

    expect(result.generatedAt).toBe(fallbackPayload.generatedAt);
  });

  it("uses the public fallback when KV is stale and fallback is newer", async () => {
    const kvPayload = payload("2026-05-23T07:30:08.841Z");
    const fallbackPayload = payload("2026-05-25T14:22:41.269Z");
    vi.setSystemTime(new Date("2026-05-25T14:45:00.000Z"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(fallbackPayload),
    );

    const result = await readStatusPayload(
      env({ kvPayload }),
      new Request("https://svustatus.pages.dev/api/status"),
    );

    expect(result.generatedAt).toBe(fallbackPayload.generatedAt);
  });

  it("keeps stale KV data when the public fallback is unavailable", async () => {
    const kvPayload = payload("2026-05-23T07:30:08.841Z");
    vi.setSystemTime(new Date("2026-05-25T14:45:00.000Z"));
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));

    const result = await readStatusPayload(
      env({ kvPayload }),
      new Request("https://svustatus.pages.dev/api/status"),
    );

    expect(result.generatedAt).toBe(kvPayload.generatedAt);
  });

  it("overlays a lightweight live check onto the historical payload", async () => {
    const kvPayload = payload("2026-05-25T14:00:00.000Z");
    const livePayload = {
      generatedAt: "2026-05-25T15:00:00.000Z",
      results: [
        {
          id: "service",
          url: "https://example.com",
          checkedAt: "2026-05-25T15:00:00.000Z",
          ok: false,
          status: 503,
          latencyMs: 420,
          attempt: 2,
        },
      ],
    };
    vi.setSystemTime(new Date("2026-05-25T15:05:00.000Z"));

    const result = await readStatusPayload(
      env({ kvPayload, livePayload }),
      new Request("https://svustatus.pages.dev/api/status"),
    );

    expect(result.generatedAt).toBe(livePayload.generatedAt);
    expect(result.monitors[0].currentStatus).toBe("error");
    expect(result.monitors[0].latest).toEqual(livePayload.results[0]);
    expect(result.history.service.at(-1)).toEqual(livePayload.results[0]);
  });
});

function env({
  kvPayload,
  livePayload = null,
}: {
  kvPayload: ReturnType<typeof payload> | null;
  livePayload?: object | null;
}) {
  return {
    STATUS_KV: {
      get: vi.fn(async (key: string) => {
        if (key === STATUS_KV_KEY) return kvPayload;
        if (key === STATUS_LIVE_KEY) return livePayload;
        return null;
      }),
    },
    ASSETS: {
      fetch: vi.fn(async () => Response.json(payload("2026-05-05T16:31:59.674Z"))),
    },
  } as unknown as PagesEnv;
}

function payload(generatedAt: string, dateKeys = ["2026-05-24", "2026-05-25"]) {
  return {
    version: 1,
    generatedAt,
    timezone: "Asia/Dubai",
    historyDays: 2,
    monitors: [
      {
        id: "service",
        daily: dateKeys.map(() => ({ card: [{ status: "success" }] })),
      },
    ],
    incidents: [],
    history: {
      service: dateKeys.map((dateKey) => ({
        checkedAt: `${dateKey}T08:00:00.000Z`,
      })),
    },
  };
}
