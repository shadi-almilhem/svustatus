import React from "react";
import { ImageResponse } from "@cloudflare/pages-plugin-vercel-og/api";
import {
  getMonitor,
  getMonitorShareUrl,
  readStatusPayload,
  statusLabel,
  type MonitorStatus,
  type PagesEnv,
} from "../_shared/status";
import { isServiceRouteId } from "../../src/lib/service-routes";

export const onRequestGet: PagesFunction<PagesEnv> = async (context) => {
  return createOgImageResponse(context);
};

export const onRequestHead: PagesFunction<PagesEnv> = async (context) => {
  const response = await createOgImageResponse(context);
  const headers = new Headers(response.headers);

  if (response.ok) {
    const body = await response.arrayBuffer();
    headers.set("content-length", String(body.byteLength));
  }

  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

async function createOgImageResponse(context: EventContext<PagesEnv, string, unknown>) {
  const rawPath = context.params.path;
  const path = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;
  const monitorId = path?.replace(/\.png$/i, "").toLowerCase() ?? "";

  if (!isServiceRouteId(monitorId)) {
    return new Response("Unknown service", { status: 404 });
  }

  const payload = await readStatusPayload(context.env, context.request);
  const monitor = getMonitor(payload, monitorId);
  if (!monitor) return new Response("Unknown service", { status: 404 });

  const shareUrl = getMonitorShareUrl(context.env, context.request, monitor.id);

  return new ImageResponse(renderOgCard(monitor, payload.generatedAt, shareUrl), {
    width: 1200,
    height: 630,
    headers: {
      "cache-control": "no-transform, public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}

function renderOgCard(monitor: MonitorStatus, generatedAt: string | null, shareUrl: string) {
  const isDown = monitor.currentStatus === "error";
  const status = statusLabel(monitor.currentStatus).toUpperCase();
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
  const color = isDown ? "#dc2626" : "#16a34a";
  const softColor = isDown ? "#fef2f2" : "#f0fdf4";
  const statusCopy = isDown
    ? "Students may not be able to reach this service."
    : "Students can reach this service right now.";
  const titleSize = monitor.name.en.length > 15 ? 68 : monitor.name.en.length > 9 ? 78 : 92;
  const compactLatency = formatOgLatency(monitor.latest?.latencyMs ?? null);
  const displayUrl = shareUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return React.createElement(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#ffffff",
        color: "#171b20",
        fontFamily: "Arial, sans-serif",
        padding: "50px 56px 42px",
        borderTop: `12px solid ${color}`,
      },
    },
    React.createElement(
      "div",
      { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
      React.createElement(
        "div",
        { style: { display: "flex", alignItems: "center" } },
        React.createElement(
          "div",
          {
            style: {
              width: 54,
              height: 54,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              background: "#111827",
              color: "#ffffff",
              fontSize: 16,
              fontWeight: 800,
              marginRight: 16,
            },
          },
          "SVU",
        ),
        React.createElement(
          "div",
          { style: { display: "flex", flexDirection: "column" } },
          React.createElement(
            "div",
            { style: { color: "#68727d", fontSize: 16, textTransform: "uppercase" } },
            "University services",
          ),
          React.createElement(
            "div",
            { style: { fontSize: 28, fontWeight: 700, marginTop: 2 } },
            "SVU Status",
          ),
        ),
      ),
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            border: `2px solid ${color}`,
            borderRadius: 999,
            color,
            background: softColor,
            padding: "11px 20px",
            fontSize: 24,
            fontWeight: 700,
          },
        },
        React.createElement("span", {
          style: {
            width: 14,
            height: 14,
            borderRadius: 999,
            background: color,
            display: "flex",
            marginRight: 11,
          },
        }),
        status,
      ),
    ),
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          flex: 1,
          flexDirection: "column",
          justifyContent: "center",
          padding: "26px 0 22px",
        },
      },
      React.createElement(
        "div",
        {
          style: {
            color,
            fontSize: 18,
            fontWeight: 700,
            textTransform: "uppercase",
            marginBottom: 12,
          },
        },
        "Live service status",
      ),
      React.createElement(
        "div",
        { style: { fontSize: titleSize, fontWeight: 800, lineHeight: 1.03 } },
        monitor.name.en,
      ),
      React.createElement(
        "div",
        { style: { color: "#56616d", fontSize: 29, marginTop: 18 } },
        statusCopy,
      ),
    ),
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          borderTop: "2px solid #e7eaed",
          paddingTop: 20,
        },
      },
      React.createElement(
        "div",
        { style: { display: "flex", width: "100%" } },
        renderMetric("Last check", lastChecked),
        renderMetric("Latency", compactLatency),
        renderMetric("45-day uptime", monitor.uptimeLabel, true),
      ),
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            color: "#68727d",
            fontSize: 20,
            marginTop: 18,
          },
        },
        React.createElement("span", {
          style: {
            width: 9,
            height: 9,
            display: "flex",
            flexShrink: 0,
            borderRadius: 999,
            background: color,
            marginRight: 10,
          },
        }),
        displayUrl,
      ),
    ),
  );
}

function renderMetric(label: string, value: string, isLast = false) {
  return React.createElement(
    "div",
    {
      style: {
        display: "flex",
        flex: 1,
        minWidth: 0,
        flexDirection: "column",
        padding: "0 24px",
        borderRight: isLast ? "none" : "1px solid #e7eaed",
      },
    },
    React.createElement(
      "div",
      { style: { color: "#7a848e", fontSize: 17, marginBottom: 7 } },
      label,
    ),
    React.createElement(
      "div",
      { style: { color: "#242a31", fontSize: 26, fontWeight: 700, whiteSpace: "nowrap" } },
      value,
    ),
  );
}

function formatOgLatency(latencyMs: number | null) {
  if (latencyMs === null) return "—";
  if (latencyMs < 1_000) return `${latencyMs} ms`;
  const seconds = latencyMs / 1_000;
  return `${seconds >= 10 ? Math.round(seconds) : seconds.toFixed(1)} s`;
}
