import type {
  StatusBarData,
  StatusReport,
  StatusType,
} from "@/components/blocks/status.types";

export type Locale = "en" | "ar";
export type LocalizedText = Record<Locale, string>;

export type CheckResult = {
  id: string;
  url: string;
  checkedAt: string;
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  attempt: number;
  error?: string;
};

export type StatusIncident = {
  id: number;
  monitorId: string;
  title: LocalizedText;
  affected: LocalizedText;
  startedAt: string;
  resolvedAt: string | null;
  updates: {
    status: "investigating" | "identified" | "monitoring" | "resolved";
    date: string;
    message: LocalizedText;
  }[];
};

export type MonitorStatus = {
  id: string;
  name: LocalizedText;
  url: string;
  currentStatus: StatusType;
  uptimePercent: number | null;
  uptimeLabel: string;
  latest: CheckResult | null;
  daily: SerializedStatusBarData[];
  incidents: StatusIncident[];
};

export type StatusPayload = {
  version: number;
  generatedAt: string | null;
  timezone: string;
  historyDays: number;
  monitors: MonitorStatus[];
  incidents: StatusIncident[];
  history: Record<string, CheckResult[]>;
};

type SerializedStatusBarData = Omit<StatusBarData, "events"> & {
  events: {
    id: number;
    name: string;
    type: "incident" | "report" | "maintenance";
    from: string | null;
    to: string | null;
  }[];
};

export const STATUS_DATA_URL =
  import.meta.env.VITE_STATUS_DATA_URL?.trim() ||
  (import.meta.env.DEV ? "/status.json" : "/api/status");

export async function fetchStatusPayload(signal?: AbortSignal) {
  const response = await fetch(STATUS_DATA_URL, {
    signal,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Status data request failed with ${response.status}.`);
  }

  return (await response.json()) as StatusPayload;
}

export function getSystemStatus(monitors: MonitorStatus[]) {
  if (monitors.length === 0) return "info";
  if (monitors.some((monitor) => monitor.currentStatus === "error")) {
    return "error";
  }
  if (monitors.some((monitor) => monitor.currentStatus === "empty")) {
    return "info";
  }
  return "success";
}

export function toStatusBarData(data: SerializedStatusBarData[]) {
  return data.map((day) => ({
    ...day,
    events: day.events.map((event) => ({
      ...event,
      from: event.from ? new Date(event.from) : null,
      to: event.to ? new Date(event.to) : null,
    })),
  })) satisfies StatusBarData[];
}

export function toStatusReports(
  incidents: StatusIncident[],
  locale: Locale,
): StatusReport[] {
  return incidents.map((incident) => ({
    id: incident.id,
    title: incident.title[locale],
    affected: [incident.affected[locale]],
    updates: incident.updates.map((update) => ({
      status: update.status,
      date: new Date(update.date),
      message: update.message[locale],
    })),
  }));
}

export function displayName(text: LocalizedText, locale: Locale) {
  return text[locale] || text.en;
}

export function formatLatency(value: number | null, locale: Locale) {
  if (value === null) return "--";
  return `${new Intl.NumberFormat(locale).format(value)} ms`;
}

export function formatStatusCode(value: number | null, locale: Locale) {
  if (value === null) return "--";
  return new Intl.NumberFormat(locale).format(value);
}

export function formatDateTime(
  value: string | null | undefined,
  locale: Locale,
  timezone: string,
) {
  if (!value) return "--";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

export function formatRelativeCheck(
  value: string | null | undefined,
  locale: Locale,
) {
  if (!value) return "--";
  const diffMs = Date.now() - new Date(value).getTime();
  const absMinutes = Math.max(1, Math.round(Math.abs(diffMs) / 60_000));
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (absMinutes < 60) return rtf.format(-absMinutes, "minute");
  const hours = Math.round(absMinutes / 60);
  if (hours < 48) return rtf.format(-hours, "hour");
  return rtf.format(-Math.round(hours / 24), "day");
}
