import {
  buildPushPayload,
  type PushMessage,
  type PushSubscription,
  type VapidKeys,
} from "@block65/webcrypto-web-push";
import monitorConfig from "../monitor.config.json";
import {
  buildStatusPayload,
  mergeStatusHistories,
  normalizeConfig,
  runMonitorChecks,
} from "../scripts/status-core.mjs";
import {
  getRecoveredMonitorIds,
  selectRecoverableWatches,
} from "../scripts/status-recovery.mjs";

const STATUS_KV_KEY = "status:latest";
const DEFAULT_SITE_URL = "https://svustatus.pages.dev";
const DEFAULT_STATUS_DATA_URL =
  "https://raw.githubusercontent.com/shadi-almilhem/svustatus/status-data/status.json";

type Env = {
  STATUS_KV?: KVNamespace;
  WATCH_DB?: D1Database;
  SITE_URL?: string;
  PUBLIC_STATUS_DATA_URL?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  CRON_SECRET?: string;
};

type StatusPayload = {
  generatedAt: string | null;
  monitors: MonitorStatus[];
};

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

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduledStatusCheck(env));
  },

  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    if (url.pathname === "/run") {
      if (!env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
        return new Response("Unauthorized", { status: 401 });
      }
      const result = await runScheduledStatusCheck(env);
      return Response.json(result);
    }

    return new Response("Not found", { status: 404 });
  },
};

export async function runScheduledStatusCheck(env: Env) {
  if (!env.STATUS_KV) {
    throw new Error("STATUS_KV binding is required for scheduled status checks.");
  }

  const [previousPayload, fallbackPayload] = await Promise.all([
    env.STATUS_KV.get<StatusPayload>(STATUS_KV_KEY, "json"),
    readFallbackStatusPayload(env),
  ]);
  const config = normalizeConfig(monitorConfig);
  const { results } = await runMonitorChecks(config);
  const mergedHistory = mergeStatusHistories(
    [fallbackPayload, previousPayload],
    config.monitors,
  );
  const payload = buildStatusPayload(
    config,
    { history: mergedHistory },
    results,
    new Date(),
  ) as StatusPayload;

  await env.STATUS_KV.put(STATUS_KV_KEY, JSON.stringify(payload));

  const recoveredMonitorIds = getRecoveredMonitorIds(previousPayload, payload);
  const notified = await notifyRecoveredWatchers(env, previousPayload, payload, recoveredMonitorIds);

  return {
    ok: true,
    generatedAt: payload.generatedAt,
    recoveredMonitorIds,
    notified,
  };
}

async function readFallbackStatusPayload(env: Env) {
  const url = env.PUBLIC_STATUS_DATA_URL || DEFAULT_STATUS_DATA_URL;

  try {
    const response = await fetch(
      `${url}${url.includes("?") ? "&" : "?"}ts=${Date.now()}`,
    );
    if (!response.ok) return null;
    return (await response.json()) as StatusPayload;
  } catch (error) {
    console.warn(
      JSON.stringify({
        message: "Historical status fallback could not be read",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return null;
  }
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

  return fetch(subscription.endpoint, pushPayload);
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
