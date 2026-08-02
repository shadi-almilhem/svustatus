import { getMonitorIdFromPath, getMonitorPath } from "../../src/lib/service-routes";

export const STATUS_KV_KEY = "status:latest";
export const STATUS_LIVE_KEY = "status:live";
export const DEFAULT_SITE_URL = "https://svustatus.pages.dev";
export const DEFAULT_STATUS_DATA_URL =
  "https://raw.githubusercontent.com/shadi-almilhem/svustatus/status-data/status.json";
export const STATUS_STALE_AFTER_MS = 90 * 60 * 1000;

export type Locale = "en" | "ar";
export type LocalizedText = Record<Locale, string>;
export type MonitorStatusType = "success" | "degraded" | "error" | "info" | "empty";

export type StatusCheckResult = {
  id: string;
  url: string;
  checkedAt: string;
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  attempt: number;
  error?: string;
};

export type StatusPayload = {
  version: number;
  generatedAt: string | null;
  timezone: string;
  historyDays: number;
  monitors: MonitorStatus[];
  incidents: unknown[];
  history: Record<string, StatusCheckResult[]>;
};

export type MonitorStatus = {
  id: string;
  name: LocalizedText;
  url: string;
  currentStatus: MonitorStatusType;
  uptimePercent: number | null;
  uptimeLabel: string;
  latest: StatusCheckResult | null;
  daily?: Array<{
    card?: Array<{ status?: MonitorStatusType }>;
  }>;
};

type LiveStatusPayload = {
  generatedAt: string;
  results: StatusCheckResult[];
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
  const [kvPayload, livePayload] = await Promise.all([
    env.STATUS_KV?.get<StatusPayload>(STATUS_KV_KEY, "json"),
    env.STATUS_KV?.get<LiveStatusPayload>(STATUS_LIVE_KEY, "json"),
  ]);
  if (isPayloadFresh(kvPayload) && hasExpectedDailyCoverage(kvPayload)) {
    return applyLiveStatus(kvPayload, livePayload);
  }

  const fallbackPayload = await readFallbackStatusPayload(env);
  const bestRemotePayload = getBestPayload([kvPayload, fallbackPayload]);
  if (bestRemotePayload) return applyLiveStatus(bestRemotePayload, livePayload);

  const assetUrl = new URL("/status.json", request.url);
  const assetResponse = await env.ASSETS.fetch(assetUrl);
  if (assetResponse.ok) {
    return applyLiveStatus(
      (await assetResponse.json()) as StatusPayload,
      livePayload,
    );
  }

  throw new Error("Status data is unavailable.");
}

function applyLiveStatus(
  payload: StatusPayload,
  livePayload: LiveStatusPayload | null | undefined,
) {
  const liveTime = livePayload?.generatedAt
    ? Date.parse(livePayload.generatedAt)
    : Number.NaN;
  if (!livePayload || !Number.isFinite(liveTime) || liveTime <= getPayloadTime(payload)) {
    return payload;
  }

  const resultsById = new Map(livePayload.results.map((result) => [result.id, result]));
  for (const monitor of payload.monitors) {
    const result = resultsById.get(monitor.id);
    if (!result) continue;
    monitor.latest = result;
    monitor.currentStatus = result.ok ? "success" : "error";

    const history = payload.history[monitor.id] ?? [];
    if (!history.some((record) => record.checkedAt === result.checkedAt)) {
      history.push(result);
      payload.history[monitor.id] = history;
      const successCount = history.filter((record) => record.ok).length;
      const uptimePercent = Math.round((successCount / history.length) * 10_000) / 100;
      monitor.uptimePercent = uptimePercent;
      monitor.uptimeLabel = Number.isInteger(uptimePercent)
        ? `${uptimePercent}%`
        : `${uptimePercent.toFixed(2)}%`;
    }
  }
  payload.generatedAt = livePayload.generatedAt;
  return payload;
}

async function readFallbackStatusPayload(env: PagesEnv) {
  const fallbackUrl = env.PUBLIC_STATUS_DATA_URL || DEFAULT_STATUS_DATA_URL;

  try {
    const requestUrl = new URL(fallbackUrl);
    requestUrl.searchParams.set("ts", String(Date.now()));
    const fallbackResponse = await fetch(requestUrl);
    if (!fallbackResponse.ok) return null;
    return (await fallbackResponse.json()) as StatusPayload;
  } catch {
    return null;
  }
}

function getBestPayload(payloads: Array<StatusPayload | null | undefined>) {
  const datedPayloads = payloads
    .map((payload) => ({
      payload,
      coverage: getDailyCoverage(payload),
      time: getPayloadTime(payload),
    }))
    .filter(
      (entry): entry is { payload: StatusPayload; coverage: number; time: number } =>
        Boolean(entry.payload) && Number.isFinite(entry.time),
    );

  datedPayloads.sort((a, b) => b.coverage - a.coverage || b.time - a.time);
  return datedPayloads[0]?.payload ?? null;
}

function hasExpectedDailyCoverage(payload: StatusPayload) {
  return getDailyCoverage(payload) >= payload.historyDays;
}

function getDailyCoverage(payload: StatusPayload | null | undefined) {
  if (!payload || payload.monitors.length === 0) return 0;

  const coverageByMonitor = payload.monitors.map((monitor) => {
    if (monitor.daily) {
      return monitor.daily.filter((day) =>
        day.card?.some((item) => item.status && item.status !== "empty"),
      ).length;
    }

    const dates = new Set<string>();
    for (const record of payload.history[monitor.id] ?? []) {
      if (!record.checkedAt || !Number.isFinite(Date.parse(record.checkedAt))) continue;
      dates.add(record.checkedAt.slice(0, 10));
    }
    return dates.size;
  });

  return Math.min(...coverageByMonitor);
}

function isPayloadFresh(
  payload: StatusPayload | null | undefined,
): payload is StatusPayload {
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
