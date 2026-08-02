export const WATCH_RETENTION_DAYS = 7;

export function getRecoveredMonitorIds(previousPayload, nextPayload) {
  if (!previousPayload?.monitors || !nextPayload?.monitors) return [];

  const previousStatusById = new Map(
    previousPayload.monitors.map((monitor) => [
      monitor.id,
      monitor.currentStatus,
    ]),
  );

  return nextPayload.monitors
    .filter(
      (monitor) =>
        monitor.currentStatus === "success" &&
        previousStatusById.get(monitor.id) === "error",
    )
    .map((monitor) => monitor.id);
}

export function selectRecoverableWatches(watches, recoveredMonitorIds, now = new Date()) {
  const recovered = new Set(recoveredMonitorIds);
  const nowTime = now.getTime();

  return watches.filter((watch) => {
    if (!recovered.has(watch.monitor_id)) return false;
    if (watch.notified_at) return false;
    return Date.parse(watch.expires_at) > nowTime;
  });
}

export function createWatchExpiry(now = new Date(), days = WATCH_RETENTION_DAYS) {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}
