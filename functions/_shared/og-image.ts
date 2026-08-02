import type { MonitorStatus } from "./status";

export type OgTextOptions = {
  x: number;
  y: number;
  text: string;
  fill: string;
  size: number;
  weight?: 400 | 700;
  anchor?: "start" | "middle";
};

export type OgTextRenderer = (options: OgTextOptions) => string;

const STATUS_COPY = {
  error: {
    label: "DOWN",
    description: "Students may not be able to reach this service.",
    color: "#dc2626",
    softColor: "#fef2f2",
  },
  success: {
    label: "UP",
    description: "Students can reach this service right now.",
    color: "#16a34a",
    softColor: "#f0fdf4",
  },
} as const;

export function renderOgSvg(
  monitor: MonitorStatus,
  generatedAt: string | null,
  siteUrl = "https://svustatus.pages.dev",
  textRenderer: OgTextRenderer = renderTextElement,
) {
  const isDown = monitor.currentStatus === "error";
  const state = isDown ? STATUS_COPY.error : STATUS_COPY.success;
  const checkedAt = monitor.latest?.checkedAt ?? generatedAt;
  const lastChecked = checkedAt
    ? new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Dubai",
      }).format(new Date(checkedAt))
    : "No check yet";
  const titleSize =
    monitor.name.en.length > 15 ? 68 : monitor.name.en.length > 9 ? 78 : 92;
  const displayUrl = `${new URL(siteUrl).host}/${monitor.id}`;
  const latency = formatLatency(monitor.latest?.latencyMs ?? null);
  const text = (options: OgTextOptions) => textRenderer(options);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#ffffff"/>
  <rect width="1200" height="12" fill="${state.color}"/>
  <rect x="56" y="66" width="54" height="54" rx="12" fill="#111827"/>
  ${text({ x: 83, y: 99, text: "SVU", fill: "#ffffff", size: 16, weight: 700, anchor: "middle" })}
  ${text({ x: 126, y: 79, text: "UNIVERSITY SERVICES", fill: "#68727d", size: 16 })}
  ${text({ x: 126, y: 115, text: "SVU Status", fill: "#171b20", size: 28, weight: 700 })}
  <rect x="998" y="65" width="146" height="57" rx="29" fill="${state.softColor}" stroke="${state.color}" stroke-width="2"/>
  <circle cx="1027" cy="94" r="7" fill="${state.color}"/>
  ${text({ x: 1045, y: 103, text: state.label, fill: state.color, size: 24, weight: 700 })}
  ${text({ x: 56, y: 210, text: "LIVE SERVICE STATUS", fill: state.color, size: 18, weight: 700 })}
  ${text({ x: 56, y: 315, text: monitor.name.en, fill: "#171b20", size: titleSize, weight: 700 })}
  ${text({ x: 56, y: 383, text: state.description, fill: "#56616d", size: 29 })}
  <line x1="56" y1="456" x2="1144" y2="456" stroke="#e7eaed" stroke-width="2"/>
  ${text({ x: 80, y: 495, text: "Last check", fill: "#7a848e", size: 17 })}
  ${text({ x: 80, y: 535, text: lastChecked, fill: "#242a31", size: 26, weight: 700 })}
  <line x1="418" y1="477" x2="418" y2="542" stroke="#e7eaed"/>
  ${text({ x: 443, y: 495, text: "Latency", fill: "#7a848e", size: 17 })}
  ${text({ x: 443, y: 535, text: latency, fill: "#242a31", size: 26, weight: 700 })}
  <line x1="782" y1="477" x2="782" y2="542" stroke="#e7eaed"/>
  ${text({ x: 806, y: 495, text: "45-day uptime", fill: "#7a848e", size: 17 })}
  ${text({ x: 806, y: 535, text: monitor.uptimeLabel, fill: "#242a31", size: 26, weight: 700 })}
  <circle cx="61" cy="575" r="5" fill="${state.color}"/>
  ${text({ x: 76, y: 583, text: displayUrl, fill: "#68727d", size: 20 })}
</svg>`;
}

function renderTextElement(options: OgTextOptions) {
  const weight = options.weight ? ` font-weight="${options.weight}"` : "";
  const anchor = options.anchor ? ` text-anchor="${options.anchor}"` : "";
  return `<text x="${options.x}" y="${options.y}"${anchor} fill="${options.fill}" font-family="Arial, sans-serif" font-size="${options.size}"${weight}>${escapeXml(options.text)}</text>`;
}

function formatLatency(latencyMs: number | null) {
  if (latencyMs === null) return "—";
  if (latencyMs < 1_000) return `${latencyMs} ms`;
  const seconds = latencyMs / 1_000;
  return `${seconds >= 10 ? Math.round(seconds) : seconds.toFixed(1)} s`;
}

function escapeXml(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
