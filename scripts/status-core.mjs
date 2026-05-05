export const DEFAULT_STATUS_OPTIONS = {
  historyDays: 45,
  timeoutMs: 20_000,
  retries: 3,
  retryDelayMs: 1_500,
  timezone: "Asia/Dubai",
  userAgent:
    "Mozilla/5.0 SVUStatusBot/1.0 (+https://github.com/svu-status-page)",
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeConfig(config) {
  const merged = {
    ...DEFAULT_STATUS_OPTIONS,
    ...config,
  };

  if (!Array.isArray(merged.monitors) || merged.monitors.length === 0) {
    throw new Error("monitor.config.json must contain at least one monitor.");
  }

  const ids = new Set();
  const monitors = merged.monitors.map((monitor) => {
    if (!monitor.id || !monitor.url || !monitor.name) {
      throw new Error("Each monitor must include id, name, and url.");
    }
    if (ids.has(monitor.id)) {
      throw new Error(`Duplicate monitor id: ${monitor.id}`);
    }
    ids.add(monitor.id);
    return {
      ...monitor,
      name:
        typeof monitor.name === "string"
          ? { en: monitor.name, ar: monitor.name }
          : monitor.name,
    };
  });

  return {
    ...merged,
    historyDays: Number(merged.historyDays),
    timeoutMs: Number(merged.timeoutMs),
    retries: Number(merged.retries),
    retryDelayMs: Number(merged.retryDelayMs),
    monitors,
  };
}

export async function runMonitorChecks(config) {
  const options = normalizeConfig(config);
  const checkedAt = new Date().toISOString();

  const results = await Promise.all(
    options.monitors.map((monitor) =>
      runMonitorWithRetries(monitor, options, checkedAt),
    ),
  );

  return { options, results };
}

export async function runMonitorWithRetries(monitor, options, checkedAt) {
  let latestResult;

  for (let attempt = 1; attempt <= options.retries; attempt += 1) {
    latestResult = await checkMonitorOnce(monitor, options, checkedAt, attempt);
    if (latestResult.ok) return latestResult;
    if (attempt < options.retries) {
      await sleep(options.retryDelayMs);
    }
  }

  return latestResult;
}

export async function checkMonitorOnce(monitor, options, checkedAt, attempt) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(monitor.url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": monitor.userAgent ?? options.userAgent,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    const latencyMs = Date.now() - startedAt;
    const ok =
      response.status >= 200 &&
      response.status < 400 &&
      latencyMs <= options.timeoutMs;

    return {
      id: monitor.id,
      url: monitor.url,
      checkedAt,
      ok,
      status: response.status,
      latencyMs,
      attempt,
    };
  } catch (error) {
    return {
      id: monitor.id,
      url: monitor.url,
      checkedAt,
      ok: false,
      status: null,
      latencyMs: Date.now() - startedAt,
      attempt,
      error: error instanceof Error ? error.message : "Unknown check error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function buildStatusPayload(config, previousPayload, results, now = new Date()) {
  const options = normalizeConfig(config);
  const history = normalizeHistory(previousPayload?.history, options.monitors);

  for (const result of results) {
    if (!history[result.id]) history[result.id] = [];
    history[result.id].push(sanitizeResult(result));
  }

  const prunedHistory = pruneHistory(history, options, now);
  const monitors = options.monitors.map((monitor) =>
    summarizeMonitor(monitor, prunedHistory[monitor.id] ?? [], options, now),
  );
  const incidents = monitors
    .flatMap((monitor) => monitor.incidents)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, 20);

  return {
    version: 1,
    generatedAt: now.toISOString(),
    timezone: options.timezone,
    historyDays: options.historyDays,
    monitors,
    incidents,
    history: prunedHistory,
  };
}

export function summarizeMonitor(monitor, records, options, now = new Date()) {
  const sortedRecords = [...records].sort(
    (a, b) => Date.parse(a.checkedAt) - Date.parse(b.checkedAt),
  );
  const latest = sortedRecords.at(-1) ?? null;
  const incidents = buildIncidents(monitor, sortedRecords);
  const daily = buildDailyStatus(sortedRecords, incidents, options, now);
  const uptimePercent = calculateUptimePercent(sortedRecords);

  return {
    id: monitor.id,
    name: monitor.name,
    url: monitor.url,
    currentStatus: latest ? (latest.ok ? "success" : "error") : "empty",
    uptimePercent,
    uptimeLabel:
      uptimePercent === null ? "--%" : `${formatNumber(uptimePercent)}%`,
    latest,
    daily,
    incidents,
  };
}

export function buildDailyStatus(records, incidents, options, now = new Date()) {
  return getRecentDateKeys(options.historyDays, options.timezone, now).map(
    (dateKey) => {
      const dayRecords = records.filter(
        (record) =>
          toDateKey(new Date(record.checkedAt), options.timezone) === dateKey,
      );
      const successCount = dayRecords.filter((record) => record.ok).length;
      const failureCount = dayRecords.length - successCount;

      return {
        day: `${dateKey}T00:00:00.000Z`,
        bar: buildBarSegments(successCount, failureCount),
        card: buildCardSegments(successCount, failureCount),
        events: incidents
          .filter((incident) =>
            incidentTouchesDay(incident, dateKey, options.timezone),
          )
          .map((incident) => ({
            id: incident.id,
            name: incident.title.en,
            type: "incident",
            from: incident.startedAt,
            to: incident.resolvedAt,
          })),
      };
    },
  );
}

export function calculateUptimePercent(records) {
  if (records.length === 0) return null;
  const okCount = records.filter((record) => record.ok).length;
  return roundPercent((okCount / records.length) * 100);
}

export function buildIncidents(monitor, records) {
  const incidents = [];
  let current = null;

  for (const record of records) {
    if (!record.ok && !current) {
      current = {
        id: stableId(`${monitor.id}-${record.checkedAt}`),
        monitorId: monitor.id,
        title: {
          en: `${monitor.name.en} outage`,
          ar: `انقطاع ${monitor.name.ar}`,
        },
        affected: monitor.name,
        startedAt: record.checkedAt,
        resolvedAt: null,
        updates: [
          {
            status: "investigating",
            date: record.checkedAt,
            message: {
              en: `${monitor.name.en} did not respond successfully.`,
              ar: `لم يستجب ${monitor.name.ar} بنجاح.`,
            },
          },
        ],
      };
      continue;
    }

    if (record.ok && current) {
      current.resolvedAt = record.checkedAt;
      current.updates.push({
        status: "resolved",
        date: record.checkedAt,
        message: {
          en: `${monitor.name.en} recovered on the next successful check.`,
          ar: `عاد ${monitor.name.ar} للعمل في الفحص الناجح التالي.`,
        },
      });
      incidents.push(current);
      current = null;
    }
  }

  if (current) incidents.push(current);

  return incidents
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, 10);
}

export function pruneHistory(history, options, now = new Date()) {
  const validKeys = new Set(
    getRecentDateKeys(options.historyDays, options.timezone, now),
  );
  const pruned = {};

  for (const monitor of options.monitors) {
    pruned[monitor.id] = (history[monitor.id] ?? []).filter((record) =>
      validKeys.has(toDateKey(new Date(record.checkedAt), options.timezone)),
    );
  }

  return pruned;
}

export function normalizeHistory(history, monitors) {
  const normalized = {};
  for (const monitor of monitors) {
    normalized[monitor.id] = Array.isArray(history?.[monitor.id])
      ? history[monitor.id].map(sanitizeResult)
      : [];
  }
  return normalized;
}

export function getRecentDateKeys(historyDays, timezone, now = new Date()) {
  const keys = [];
  for (let offset = historyDays - 1; offset >= 0; offset -= 1) {
    keys.push(toDateKey(new Date(now.getTime() - offset * ONE_DAY_MS), timezone));
  }
  return [...new Set(keys)];
}

export function toDateKey(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function buildBarSegments(successCount, failureCount) {
  const total = successCount + failureCount;
  if (total === 0) return [{ status: "empty", height: 100 }];
  if (failureCount === 0) return [{ status: "success", height: 100 }];
  if (successCount === 0) return [{ status: "error", height: 100 }];

  const successHeight = roundPercent((successCount / total) * 100);
  return [
    { status: "success", height: successHeight },
    { status: "error", height: roundPercent(100 - successHeight) },
  ];
}

function buildCardSegments(successCount, failureCount) {
  const total = successCount + failureCount;
  if (total === 0) return [{ status: "empty", value: "No checks" }];

  const segments = [];
  if (successCount > 0) {
    segments.push({
      status: "success",
      value: formatApproxHours(successCount, total),
    });
  }
  if (failureCount > 0) {
    segments.push({
      status: "error",
      value: formatApproxHours(failureCount, total),
    });
  }
  return segments;
}

function formatApproxHours(count, total) {
  const hours = (count / total) * 24;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (Number.isInteger(hours)) return `${hours}h`;
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  return minutes === 0 ? `${wholeHours}h` : `${wholeHours}h ${minutes}m`;
}

function incidentTouchesDay(incident, dateKey, timezone) {
  const startKey = toDateKey(new Date(incident.startedAt), timezone);
  const endKey = incident.resolvedAt
    ? toDateKey(new Date(incident.resolvedAt), timezone)
    : startKey;
  return dateKey >= startKey && dateKey <= endKey;
}

function sanitizeResult(result) {
  return {
    id: result.id,
    url: result.url,
    checkedAt: result.checkedAt,
    ok: Boolean(result.ok),
    status: result.status ?? null,
    latencyMs:
      typeof result.latencyMs === "number" ? Math.round(result.latencyMs) : null,
    attempt: result.attempt ?? 1,
    ...(result.error ? { error: String(result.error) } : {}),
  };
}

function roundPercent(value) {
  return Math.round(value * 100) / 100;
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function stableId(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
