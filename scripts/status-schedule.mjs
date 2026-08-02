export const STATUS_CHECK_INTERVAL_MS = 55 * 60 * 1000;
export const STATUS_RUN_LEASE_MS = 4 * 60 * 1000;

export function isStatusCheckDue(generatedAt, now = Date.now()) {
  const generatedAtMs = generatedAt ? Date.parse(generatedAt) : Number.NaN;
  return !Number.isFinite(generatedAtMs) || now - generatedAtMs >= STATUS_CHECK_INTERVAL_MS;
}

export function isStatusRunActive(lastRun, now = Date.now()) {
  if (lastRun?.state !== "running" && lastRun?.state !== "queued") return false;
  const startedAtMs = Date.parse(lastRun.startedAt);
  return Number.isFinite(startedAtMs) && now - startedAtMs < STATUS_RUN_LEASE_MS;
}

export function getStatusAgeMinutes(generatedAt, now = Date.now()) {
  const generatedAtMs = generatedAt ? Date.parse(generatedAt) : Number.NaN;
  if (!Number.isFinite(generatedAtMs)) return null;
  return Math.max(0, Math.round((now - generatedAtMs) / 60_000));
}
