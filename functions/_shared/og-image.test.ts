import { describe, expect, it } from "vitest";
import { renderOgSvg } from "./og-image";
import type { MonitorStatus } from "./status";

describe("OG image SVG", () => {
  it("keeps long service names and metrics in separate fixed rows", () => {
    const monitor = {
      id: "requests",
      name: { en: "Requests System", ar: "نظام الطلبات" },
      url: "https://requests.svuonline.org",
      currentStatus: "error",
      uptimePercent: 99.84,
      uptimeLabel: "99.84%",
      latest: {
        checkedAt: "2026-08-02T06:46:52.746Z",
        ok: false,
        status: null,
        latencyMs: 20_000,
        attempt: 3,
      },
    } satisfies MonitorStatus;

    const svg = renderOgSvg(monitor, "2026-08-02T06:47:55.791Z");

    expect(svg).toContain('width="1200" height="630"');
    expect(svg).toContain("Requests System");
    expect(svg).toContain("20 s");
    expect(svg).toContain("99.84%");
    expect(svg).toContain("svustatus.pages.dev/requests");
  });

  it("can replace every text element with renderer-safe vector paths", () => {
    const monitor = {
      id: "lms",
      name: { en: "LMS", ar: "نظام إدارة التعلم" },
      url: "https://lms.svuonline.org",
      currentStatus: "success",
      uptimePercent: 100,
      uptimeLabel: "100%",
      latest: {
        checkedAt: "2026-08-02T06:46:52.746Z",
        ok: true,
        status: 200,
        latencyMs: 384,
        attempt: 1,
      },
    } satisfies MonitorStatus;
    const labels: string[] = [];

    const svg = renderOgSvg(monitor, null, undefined, (options) => {
      labels.push(options.text);
      return `<path data-label="${options.text}"/>`;
    });

    expect(labels).toContain("LMS");
    expect(labels).toContain("384 ms");
    expect(labels).toContain("svustatus.pages.dev/lms");
    expect(svg).not.toContain("<text");
  });
});
