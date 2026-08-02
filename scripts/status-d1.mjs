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

function toNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
