import { describe, expect, it } from "vitest";
import { renderOgSvg } from "./og-image-core.mjs";

describe("OG image SVG", () => {
  it("keeps long service names and metrics in separate fixed rows", () => {
    const svg = renderOgSvg(
      {
        id: "requests",
        name: { en: "Requests System", ar: "نظام الطلبات" },
        currentStatus: "error",
        uptimeLabel: "99.84%",
        latest: {
          checkedAt: "2026-08-02T06:46:52.746Z",
          latencyMs: 20_000,
        },
      },
      "2026-08-02T06:47:55.791Z",
    );

    expect(svg).toContain('width="1200" height="630"');
    expect(svg).toContain("Requests System");
    expect(svg).toContain("20 s");
    expect(svg).toContain("99.84%");
    expect(svg).toContain("svustatus.pages.dev/requests");
  });
});
