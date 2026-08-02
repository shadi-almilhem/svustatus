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
};

export function renderOgSvg(monitor, generatedAt, siteUrl = "https://svustatus.pages.dev") {
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
  const titleSize = monitor.name.en.length > 15 ? 68 : monitor.name.en.length > 9 ? 78 : 92;
  const displayUrl = `${new URL(siteUrl).host}/${monitor.id}`;
  const latency = formatLatency(monitor.latest?.latencyMs ?? null);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#ffffff"/>
  <rect width="1200" height="12" fill="${state.color}"/>
  <rect x="56" y="66" width="54" height="54" rx="12" fill="#111827"/>
  <text x="83" y="99" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="16" font-weight="700">SVU</text>
  <text x="126" y="79" fill="#68727d" font-family="Arial, sans-serif" font-size="16">UNIVERSITY SERVICES</text>
  <text x="126" y="115" fill="#171b20" font-family="Arial, sans-serif" font-size="28" font-weight="700">SVU Status</text>
  <rect x="998" y="65" width="146" height="57" rx="29" fill="${state.softColor}" stroke="${state.color}" stroke-width="2"/>
  <circle cx="1027" cy="94" r="7" fill="${state.color}"/>
  <text x="1045" y="103" fill="${state.color}" font-family="Arial, sans-serif" font-size="24" font-weight="700">${state.label}</text>
  <text x="56" y="210" fill="${state.color}" font-family="Arial, sans-serif" font-size="18" font-weight="700">LIVE SERVICE STATUS</text>
  <text x="56" y="315" fill="#171b20" font-family="Arial, sans-serif" font-size="${titleSize}" font-weight="700">${escapeXml(monitor.name.en)}</text>
  <text x="56" y="383" fill="#56616d" font-family="Arial, sans-serif" font-size="29">${state.description}</text>
  <line x1="56" y1="456" x2="1144" y2="456" stroke="#e7eaed" stroke-width="2"/>
  <text x="80" y="495" fill="#7a848e" font-family="Arial, sans-serif" font-size="17">Last check</text>
  <text x="80" y="535" fill="#242a31" font-family="Arial, sans-serif" font-size="26" font-weight="700">${escapeXml(lastChecked)}</text>
  <line x1="418" y1="477" x2="418" y2="542" stroke="#e7eaed"/>
  <text x="443" y="495" fill="#7a848e" font-family="Arial, sans-serif" font-size="17">Latency</text>
  <text x="443" y="535" fill="#242a31" font-family="Arial, sans-serif" font-size="26" font-weight="700">${escapeXml(latency)}</text>
  <line x1="782" y1="477" x2="782" y2="542" stroke="#e7eaed"/>
  <text x="806" y="495" fill="#7a848e" font-family="Arial, sans-serif" font-size="17">45-day uptime</text>
  <text x="806" y="535" fill="#242a31" font-family="Arial, sans-serif" font-size="26" font-weight="700">${escapeXml(monitor.uptimeLabel)}</text>
  <circle cx="61" cy="575" r="5" fill="${state.color}"/>
  <text x="76" y="583" fill="#68727d" font-family="Arial, sans-serif" font-size="20">${escapeXml(displayUrl)}</text>
</svg>`;
}

function formatLatency(latencyMs) {
  if (latencyMs === null) return "—";
  if (latencyMs < 1_000) return `${latencyMs} ms`;
  const seconds = latencyMs / 1_000;
  return `${seconds >= 10 ? Math.round(seconds) : seconds.toFixed(1)} s`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
