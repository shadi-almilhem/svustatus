import { getMonitorIdFromPath, getMonitorPath } from "../../src/lib/service-routes";

export const STATUS_KV_KEY = "status:latest";
export const DEFAULT_SITE_URL = "https://svustatus.pages.dev";
export const DEFAULT_STATUS_DATA_URL =
  "https://raw.githubusercontent.com/shadi-almilhem/svustatus/status-data/status.json";
export const STATUS_STALE_AFTER_MS = 90 * 60 * 1000;

export type Locale = "en" | "ar";
export type LocalizedText = Record<Locale, string>;
export type MonitorStatusType = "success" | "degraded" | "error" | "info" | "empty";

export type StatusPayload = {
  version: number;
  generatedAt: string | null;
  timezone: string;
  historyDays: number;
  monitors: MonitorStatus[];
  incidents: unknown[];
  history: Record<string, unknown[]>;
};

export type MonitorStatus = {
  id: string;
  name: LocalizedText;
  url: string;
  currentStatus: MonitorStatusType;
  uptimePercent: number | null;
  uptimeLabel: string;
  latest: {
    checkedAt: string;
    ok: boolean;
    status: number | null;
    latencyMs: number | null;
    attempt: number;
  } | null;
};

export type PagesEnv = {
  ASSETS: Fetcher;
  STATUS_KV?: KVNamespace;
  WATCH_DB?: D1Database;
  PUBLIC_STATUS_DATA_URL?: string;
  SITE_URL?: string;
  VAPID_PUBLIC_KEY?: string;
};

export async function readStatusPayload(env: PagesEnv, request: Request) {
  const kvPayload = await env.STATUS_KV?.get<StatusPayload>(STATUS_KV_KEY, "json");
  if (isPayloadFresh(kvPayload)) return kvPayload;

  const fallbackPayload = await readFallbackStatusPayload(env);
  const freshestRemotePayload = getFreshestPayload([kvPayload, fallbackPayload]);
  if (freshestRemotePayload) return freshestRemotePayload;

  const assetUrl = new URL("/status.json", request.url);
  const assetResponse = await env.ASSETS.fetch(assetUrl);
  if (assetResponse.ok) {
    return (await assetResponse.json()) as StatusPayload;
  }

  throw new Error("Status data is unavailable.");
}

async function readFallbackStatusPayload(env: PagesEnv) {
  const fallbackUrl = env.PUBLIC_STATUS_DATA_URL || DEFAULT_STATUS_DATA_URL;

  try {
    const fallbackResponse = await fetch(fallbackUrl, { cache: "no-store" });
    if (!fallbackResponse.ok) return null;
    return (await fallbackResponse.json()) as StatusPayload;
  } catch {
    return null;
  }
}

function getFreshestPayload(payloads: Array<StatusPayload | null | undefined>) {
  const datedPayloads = payloads
    .map((payload) => ({ payload, time: getPayloadTime(payload) }))
    .filter(
      (entry): entry is { payload: StatusPayload; time: number } =>
        Boolean(entry.payload) && Number.isFinite(entry.time),
    );

  datedPayloads.sort((a, b) => b.time - a.time);
  return datedPayloads[0]?.payload ?? null;
}

function isPayloadFresh(payload: StatusPayload | null | undefined) {
  const generatedAt = getPayloadTime(payload);
  return Number.isFinite(generatedAt) && Date.now() - generatedAt < STATUS_STALE_AFTER_MS;
}

function getPayloadTime(payload: StatusPayload | null | undefined) {
  return payload?.generatedAt ? Date.parse(payload.generatedAt) : Number.NaN;
}

export function getMonitor(payload: StatusPayload, id: string) {
  return payload.monitors.find((monitor) => monitor.id === id) ?? null;
}

export function jsonResponse(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", headers.get("cache-control") ?? "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function getSiteOrigin(env: PagesEnv, request: Request) {
  return env.SITE_URL || new URL(request.url).origin || DEFAULT_SITE_URL;
}

export function getMonitorShareUrl(env: PagesEnv, request: Request, monitorId: string) {
  return new URL(getMonitorPath(monitorId), getSiteOrigin(env, request)).toString();
}

export function getMonitorIdForRequest(request: Request) {
  return getMonitorIdFromPath(new URL(request.url).pathname);
}

export function statusLabel(status: MonitorStatusType) {
  if (status === "error") return "Down";
  if (status === "empty") return "No data";
  if (status === "degraded") return "Degraded";
  if (status === "info") return "Checking";
  return "Up";
}
