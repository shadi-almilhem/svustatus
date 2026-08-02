import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readStatusPayload, STATUS_KV_KEY, type PagesEnv } from "./status";

describe("readStatusPayload", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns fresh KV data without fetching the public fallback", async () => {
    const kvPayload = payload("2026-05-25T14:00:00.000Z");
    vi.setSystemTime(new Date("2026-05-25T14:30:00.000Z"));
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await readStatusPayload(
      env({ kvPayload }),
      new Request("https://svustatus.pages.dev/api/status"),
    );

    expect(result.generatedAt).toBe(kvPayload.generatedAt);
    expect(fetchMock).not.toHaveBeenCalled();
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
});

function env({ kvPayload }: { kvPayload: ReturnType<typeof payload> | null }) {
  return {
    STATUS_KV: {
      get: vi.fn(async (key: string) => (key === STATUS_KV_KEY ? kvPayload : null)),
    },
    ASSETS: {
      fetch: vi.fn(async () => Response.json(payload("2026-05-05T16:31:59.674Z"))),
    },
  } as unknown as PagesEnv;
}

function payload(generatedAt: string) {
  return {
    version: 1,
    generatedAt,
    timezone: "Asia/Dubai",
    historyDays: 45,
    monitors: [],
    incidents: [],
    history: {},
  };
}
