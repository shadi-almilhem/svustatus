import { describe, expect, it } from "vitest";
import { historyFromD1Export } from "./status-d1.mjs";

const monitors = [
  { id: "portal", url: "https://example.com" },
  { id: "lms", url: "https://lms.example.com" },
];

describe("D1 status history import", () => {
  it("converts Wrangler D1 rows to status check records", () => {
    const history = historyFromD1Export(
      [
        {
          results: [
            {
              monitor_id: "portal",
              checked_at: "2026-08-02T10:00:00.000Z",
              url: "https://example.com",
              ok: 1,
              status: 200,
              latency_ms: 321,
              attempt: 1,
              error: null,
            },
          ],
        },
      ],
      monitors,
    );

    expect(history.portal).toEqual([
      {
        id: "portal",
        url: "https://example.com",
        checkedAt: "2026-08-02T10:00:00.000Z",
        ok: true,
        status: 200,
        latencyMs: 321,
        attempt: 1,
      },
    ]);
    expect(history.lms).toEqual([]);
  });

  it("ignores unknown monitors and invalid timestamps", () => {
    const history = historyFromD1Export(
      [
        {
          results: [
            { monitor_id: "unknown", checked_at: "2026-08-02T10:00:00.000Z" },
            { monitor_id: "portal", checked_at: "not-a-date" },
          ],
        },
      ],
      monitors,
    );

    expect(history).toEqual({ portal: [], lms: [] });
  });
});
