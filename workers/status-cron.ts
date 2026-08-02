import {
  buildPushPayload,
  type PushMessage,
  type PushSubscription,
  type VapidKeys,
} from "@block65/webcrypto-web-push";
import { timingSafeEqual } from "node:crypto";
import monitorConfig from "../monitor.config.json";
import {
  normalizeConfig,
  runMonitorChecks,
} from "../scripts/status-core.mjs";
import {
  getRecoveredMonitorIds,
  selectRecoverableWatches,
} from "../scripts/status-recovery.mjs";
import {
  getStatusAgeMinutes,
  isStatusCheckDue,
  isStatusRunActive,
} from "../scripts/status-schedule.mjs";

const STATUS_KV_KEY = "status:latest";
const STATUS_LIVE_KEY = "status:live";
const STATUS_GENERATED_AT_KEY = "status:generated-at";
const STATUS_RUN_KEY = "status:run:last";
const STATUS_SCHEMA_KEY = "status:schema:v2";
const DEFAULT_SITE_URL = "https://svustatus.pages.dev";

type Env = {
  STATUS_KV?: KVNamespace;
  WATCH_DB?: D1Database;
  SITE_URL?: string;
  PUBLIC_STATUS_DATA_URL?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  CRON_SECRET?: string;
  STATUS_QUEUE?: Queue<StatusQueueMessage>;
};

type StatusPayload = {
  generatedAt: string | null;
  monitors: MonitorStatus[];
};

type CheckResult = {
  id: string;
  url: string;
  checkedAt: string;
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  attempt: number;
  error?: string;
};

type LiveStatusPayload = {
  generatedAt: string;
  results: CheckResult[];
};

type StatusRun = {
  state: "queued" | "running" | "success" | "error";
  trigger: "cron" | "manual";
  scheduledAt: string | null;
  startedAt: string;
  completedAt?: string;
  generatedAt?: string | null;
  durationMs?: number;
  error?: string;
};

type StatusQueueMessage = Pick<StatusRun, "trigger" | "scheduledAt">;

type MonitorStatus = {
  id: string;
  name: { en: string; ar: string };
  currentStatus: string;
  uptimeLabel: string;
};

type WatchRow = {
  id: string;
  monitor_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expires_at: string;
  notified_at: string | null;
};

type StatusCheckRow = {
  monitor_id: string;
  checked_at: string;
  url: string;
  ok: number;
  status: number | null;
  latency_ms: number | null;
  attempt: number;
  error: string | null;
};

export default {
  async scheduled(controller: ScheduledController, env: Env) {
    await runStatusCheckIfDue(env, controller.scheduledTime);
  },

  async queue(batch: MessageBatch<StatusQueueMessage>, env: Env) {
    for (const message of batch.messages) {
      try {
        await runRecordedStatusCheck(env, message.body);
        message.ack();
      } catch {
        message.retry({ delaySeconds: 60 });
      }
    }
  },

  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      if (!env.STATUS_KV) {
        return Response.json(
          { ok: false, error: "STATUS_KV binding is unavailable" },
          { status: 503 },
        );
      }

      const [generatedAt, lastRun] = await Promise.all([
        getLatestGeneratedAt(env.STATUS_KV),
        env.STATUS_KV.get<StatusRun>(STATUS_RUN_KEY, "json"),
      ]);
      return Response.json({
        ok: true,
        schedule: "*/5 * * * *",
        triggerIntervalMinutes: 5,
        targetIntervalMinutes: 60,
        generatedAt,
        ageMinutes: getStatusAgeMinutes(generatedAt),
        checkDue: isStatusCheckDue(generatedAt),
        lastRun,
      });
    }

    if (url.pathname === "/history") {
      if (!env.STATUS_KV || !env.WATCH_DB) {
        return Response.json(
          { error: "Status storage bindings are unavailable" },
          { status: 503 },
        );
      }

      await ensureStatusSchema(env.STATUS_KV, env.WATCH_DB);
      const cutoff = Date.now() - 46 * 24 * 60 * 60 * 1000;
      const requestedAfter = Date.parse(url.searchParams.get("after") ?? "");
      const after = new Date(
        Number.isFinite(requestedAfter) ? Math.max(requestedAfter, cutoff) : cutoff,
      ).toISOString();
      const afterId = url.searchParams.get("afterId") ?? "";
      const query = await env.WATCH_DB.prepare(
        `SELECT monitor_id, checked_at, url, ok, status, latency_ms, attempt, error
         FROM status_checks
         WHERE checked_at > ? OR (checked_at = ? AND monitor_id > ?)
         ORDER BY checked_at, monitor_id
         LIMIT 500`,
      )
        .bind(after, after, afterId)
        .all<StatusCheckRow>();
      const rows = query.results ?? [];
      const last = rows.at(-1);

      return Response.json(
        {
          results: rows,
          nextCursor:
            rows.length === 500 && last
              ? { checkedAt: last.checked_at, monitorId: last.monitor_id }
              : null,
        },
        { headers: { "Cache-Control": "public, max-age=300" } },
      );
    }

    if (url.pathname === "/run") {
      if (!isAuthorizedCronRequest(request, env.CRON_SECRET)) {
        return new Response("Unauthorized", { status: 401 });
      }
      const result = await enqueueStatusCheck(env, {
        trigger: "manual",
        scheduledAt: null,
      });
      return Response.json(result, { status: 202 });
    }

    return new Response("Not found", { status: 404 });
  },
};

export async function runStatusCheckIfDue(env: Env, scheduledTime: number) {
  if (!env.STATUS_KV || !env.STATUS_QUEUE) {
    throw new Error("STATUS_KV and STATUS_QUEUE bindings are required for status checks.");
  }

  const [generatedAt, lastRun] = await Promise.all([
    getLatestGeneratedAt(env.STATUS_KV),
    env.STATUS_KV.get<StatusRun>(STATUS_RUN_KEY, "json"),
  ]);
  if (!isStatusCheckDue(generatedAt)) {
    return { ok: true, skipped: true, reason: "status data is fresh" };
  }
  if (isStatusRunActive(lastRun)) {
    return { ok: true, skipped: true, reason: "status check is already running" };
  }

  return enqueueStatusCheck(env, {
    trigger: "cron",
    scheduledAt: new Date(scheduledTime).toISOString(),
  });
}

async function enqueueStatusCheck(env: Env, context: StatusQueueMessage) {
  if (!env.STATUS_KV || !env.STATUS_QUEUE) {
    throw new Error("STATUS_KV and STATUS_QUEUE bindings are required for status checks.");
  }

  const startedAt = new Date().toISOString();
  const queuedRun: StatusRun = {
    state: "queued",
    ...context,
    startedAt,
  };
  await env.STATUS_KV.put(STATUS_RUN_KEY, JSON.stringify(queuedRun));

  try {
    await env.STATUS_QUEUE.send(context);
    return { ok: true, queued: true, startedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await env.STATUS_KV.put(
      STATUS_RUN_KEY,
      JSON.stringify({
        ...queuedRun,
        state: "error",
        completedAt: new Date().toISOString(),
        error: message,
      } satisfies StatusRun),
    );
    throw error;
  }
}

async function runRecordedStatusCheck(
  env: Env,
  context: Pick<StatusRun, "trigger" | "scheduledAt">,
) {
  if (!env.STATUS_KV) {
    throw new Error("STATUS_KV binding is required for scheduled status checks.");
  }

  const startedAt = new Date();
  const run: StatusRun = {
    state: "running",
    ...context,
    startedAt: startedAt.toISOString(),
  };
  await env.STATUS_KV.put(STATUS_RUN_KEY, JSON.stringify(run));

  try {
    const result = await runScheduledStatusCheck(env);
    const completedAt = new Date();
    await env.STATUS_KV.put(
      STATUS_RUN_KEY,
      JSON.stringify({
        ...run,
        state: "success",
        completedAt: completedAt.toISOString(),
        generatedAt: result.generatedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
      } satisfies StatusRun),
    );
    return result;
  } catch (error) {
    const completedAt = new Date();
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({ message: "Scheduled status check failed", error: message }),
    );
    await env.STATUS_KV.put(
      STATUS_RUN_KEY,
      JSON.stringify({
        ...run,
        state: "error",
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        error: message,
      } satisfies StatusRun),
    );
    throw error;
  }
}

export async function runScheduledStatusCheck(env: Env) {
  if (!env.STATUS_KV || !env.WATCH_DB) {
    throw new Error("STATUS_KV and WATCH_DB bindings are required for status checks.");
  }

  await ensureStatusSchema(env.STATUS_KV, env.WATCH_DB);
  const previousLive = await env.STATUS_KV.get<LiveStatusPayload>(STATUS_LIVE_KEY, "json");
  const config = normalizeConfig(monitorConfig);
  const { results }: { results: CheckResult[] } = await runMonitorChecks(config);
  const payload: LiveStatusPayload = {
    generatedAt: new Date().toISOString(),
    results,
  };

  await persistStatusChecks(env.WATCH_DB, results);
  await env.STATUS_KV.put(STATUS_LIVE_KEY, JSON.stringify(payload));
  await env.STATUS_KV.put(STATUS_GENERATED_AT_KEY, payload.generatedAt);

  const previousPayload = previousLive
    ? toNotificationPayload(previousLive, config.monitors)
    : null;
  const notificationPayload = toNotificationPayload(payload, config.monitors);
  const recoveredMonitorIds = getRecoveredMonitorIds(
    previousPayload,
    notificationPayload,
  );
  const notified = await notifyRecoveredWatchers(
    env,
    previousPayload,
    notificationPayload,
    recoveredMonitorIds,
  );

  return {
    ok: true,
    generatedAt: payload.generatedAt,
    recoveredMonitorIds,
    notified,
  };
}

async function ensureStatusSchema(statusKv: KVNamespace, database: D1Database) {
  if ((await statusKv.get(STATUS_SCHEMA_KEY)) === "ready") return;

  await database.batch([
    database.prepare(
      `CREATE TABLE IF NOT EXISTS status_checks (
        monitor_id TEXT NOT NULL,
        checked_at TEXT NOT NULL,
        url TEXT NOT NULL,
        ok INTEGER NOT NULL,
        status INTEGER,
        latency_ms INTEGER,
        attempt INTEGER NOT NULL,
        error TEXT,
        PRIMARY KEY (monitor_id, checked_at)
      )`,
    ),
    database.prepare(
      `CREATE INDEX IF NOT EXISTS idx_status_checks_checked_at
       ON status_checks (checked_at)`,
    ),
  ]);
  await statusKv.put(STATUS_SCHEMA_KEY, "ready");
}

async function persistStatusChecks(database: D1Database, results: CheckResult[]) {
  const statements = results.map((result) =>
    database
      .prepare(
        `INSERT OR REPLACE INTO status_checks
         (monitor_id, checked_at, url, ok, status, latency_ms, attempt, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        result.id,
        result.checkedAt,
        result.url,
        result.ok ? 1 : 0,
        result.status,
        result.latencyMs,
        result.attempt,
        result.error ?? null,
      ),
  );
  statements.push(
    database
      .prepare("DELETE FROM status_checks WHERE checked_at < ?")
      .bind(new Date(Date.now() - 46 * 24 * 60 * 60 * 1000).toISOString()),
  );
  await database.batch(statements);
}

function toNotificationPayload(
  livePayload: LiveStatusPayload,
  monitors: Array<{ id: string; name: { en: string; ar: string } }>,
): StatusPayload {
  const resultsById = new Map(livePayload.results.map((result) => [result.id, result]));
  return {
    generatedAt: livePayload.generatedAt,
    monitors: monitors.map((monitor) => ({
      ...monitor,
      currentStatus: resultsById.get(monitor.id)?.ok ? "success" : "error",
      uptimeLabel: "--%",
    })),
  };
}

async function getLatestGeneratedAt(statusKv: KVNamespace) {
  const generatedAt = await statusKv.get(STATUS_GENERATED_AT_KEY);
  if (generatedAt && Number.isFinite(Date.parse(generatedAt))) return generatedAt;

  const payload = await statusKv.get<StatusPayload>(STATUS_KV_KEY, "json");
  return payload?.generatedAt ?? null;
}

function isAuthorizedCronRequest(request: Request, secret: string | undefined) {
  if (!secret) return false;
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;

  const encoder = new TextEncoder();
  const provided = encoder.encode(authorization.slice("Bearer ".length));
  const expected = encoder.encode(secret);
  return (
    provided.byteLength === expected.byteLength &&
    timingSafeEqual(provided, expected)
  );
}

async function notifyRecoveredWatchers(
  env: Env,
  previousPayload: StatusPayload | null,
  payload: StatusPayload,
  recoveredMonitorIds: string[],
) {
  if (!previousPayload || recoveredMonitorIds.length === 0 || !env.WATCH_DB) return 0;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return 0;

  const now = new Date();
  await env.WATCH_DB.prepare("DELETE FROM recovery_watches WHERE expires_at <= ?")
    .bind(now.toISOString())
    .run();

  const watchResult = await env.WATCH_DB.prepare(
    `SELECT id, monitor_id, endpoint, p256dh, auth, expires_at, notified_at
     FROM recovery_watches
     WHERE notified_at IS NULL AND expires_at > ?`,
  )
    .bind(now.toISOString())
    .all<WatchRow>();

  const watches = selectRecoverableWatches(
    watchResult.results ?? [],
    recoveredMonitorIds,
    now,
  ) as WatchRow[];
  const monitorsById = new Map(payload.monitors.map((monitor) => [monitor.id, monitor]));
  let notified = 0;

  for (const watch of watches) {
    const monitor = monitorsById.get(watch.monitor_id);
    if (!monitor) continue;

    try {
      const response = await sendRecoveryNotification(env, watch, monitor);
      if (response.ok || response.status === 201 || response.status === 202) {
        await markWatchNotified(env, watch.id, now);
        notified += 1;
      } else if (response.status === 404 || response.status === 410) {
        await deleteWatch(env, watch.id);
      } else {
        console.warn(
          JSON.stringify({
            message: "Push service rejected notification",
            watchId: watch.id,
            status: response.status,
          }),
        );
      }
    } catch (error) {
      console.warn(
        JSON.stringify({
          message: "Recovery notification failed",
          watchId: watch.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  return notified;
}

async function sendRecoveryNotification(env: Env, watch: WatchRow, monitor: MonitorStatus) {
  const siteUrl = env.SITE_URL || DEFAULT_SITE_URL;
  const serviceUrl = new URL(`/${monitor.id}`, siteUrl).toString();
  const subscription: PushSubscription = {
    endpoint: watch.endpoint,
    expirationTime: null,
    keys: {
      p256dh: watch.p256dh,
      auth: watch.auth,
    },
  };
  const message: PushMessage = {
    data: {
      title: `${monitor.name.en} is back online`,
      body: "SVU Status detected a successful check.",
      monitorId: monitor.id,
      url: serviceUrl,
    },
    options: {
      ttl: 60 * 60,
      urgency: "high",
    },
  };
  const vapid: VapidKeys = {
    subject: env.VAPID_SUBJECT || siteUrl,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
  const pushPayload = await buildPushPayload(message, subscription, vapid);
  const body = new Uint8Array(pushPayload.body.byteLength);
  body.set(pushPayload.body);

  return fetch(subscription.endpoint, { ...pushPayload, body: body.buffer });
}

async function markWatchNotified(env: Env, id: string, now: Date) {
  await env.WATCH_DB?.prepare(
    "UPDATE recovery_watches SET notified_at = ? WHERE id = ?",
  )
    .bind(now.toISOString(), id)
    .run();
}

async function deleteWatch(env: Env, id: string) {
  await env.WATCH_DB?.prepare("DELETE FROM recovery_watches WHERE id = ?")
    .bind(id)
    .run();
}
