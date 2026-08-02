import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStatusPayload } from "./status-data";

describe("fetchStatusPayload", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("retries a transient server error and returns the next valid payload", async () => {
    vi.useFakeTimers();
    const expected = {
      version: 1,
      generatedAt: "2026-08-02T07:00:00.000Z",
      timezone: "Asia/Dubai",
      historyDays: 45,
      monitors: [],
      incidents: [],
      history: {},
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockResolvedValueOnce(Response.json(expected));

    const resultPromise = fetchStatusPayload();
    await vi.advanceTimersByTimeAsync(400);

    await expect(resultPromise).resolves.toEqual(expected);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
