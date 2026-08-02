export function historyFromD1Export(exportPayload, monitors) {
  const history = Object.fromEntries(monitors.map((monitor) => [monitor.id, []]));
  const monitorsById = new Map(monitors.map((monitor) => [monitor.id, monitor]));
  const batches = Array.isArray(exportPayload) ? exportPayload : [];

  for (const row of batches.flatMap((batch) => batch?.results ?? [])) {
    const monitor = monitorsById.get(row?.monitor_id);
    if (!monitor || !Number.isFinite(Date.parse(row.checked_at))) continue;

    history[monitor.id].push({
      id: monitor.id,
      url: typeof row.url === "string" ? row.url : monitor.url,
      checkedAt: row.checked_at,
      ok: row.ok === 1 || row.ok === true,
      status: toNullableNumber(row.status),
      latencyMs: toNullableNumber(row.latency_ms),
      attempt: toNullableNumber(row.attempt) ?? 1,
      ...(row.error ? { error: String(row.error) } : {}),
    });
  }

  return history;
}

export async function fetchStatusHistory(url, fetchImpl = fetch) {
  const results = [];
  let cursor = null;

  for (let page = 0; page < 20; page += 1) {
    const pageUrl = new URL(url);
    if (cursor) {
      pageUrl.searchParams.set("after", cursor.checkedAt);
      pageUrl.searchParams.set("afterId", cursor.monitorId);
    }

    const response = await fetchImpl(pageUrl, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      throw new Error(`Status history export returned ${response.status}`);
    }
    const payload = await response.json();
    if (!Array.isArray(payload.results)) {
      throw new Error("Status history export did not return a results array");
    }
    results.push(...payload.results);
    cursor = payload.nextCursor ?? null;
    if (!cursor) return [{ results }];
  }

  throw new Error("Status history export exceeded 20 pages");
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
