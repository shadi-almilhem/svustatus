import { createWatchExpiry } from "../../scripts/status-recovery.mjs";
import {
  getMonitor,
  jsonResponse,
  readStatusPayload,
  type PagesEnv,
} from "../_shared/status";
import { isServiceRouteId } from "../../src/lib/service-routes";

type WatchRequest = {
  monitorId?: string;
  subscription?: {
    endpoint?: string;
    keys?: {
      p256dh?: string;
      auth?: string;
    };
  };
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204 });

export const onRequestPost: PagesFunction<PagesEnv> = async (context) => {
  if (!context.env.WATCH_DB) {
    return jsonResponse(
      { error: "Recovery notifications are not configured yet." },
      { status: 503 },
    );
  }

  let body: WatchRequest;
  try {
    body = (await context.request.json()) as WatchRequest;
  } catch {
    return jsonResponse({ error: "Request body must be JSON." }, { status: 400 });
  }

  const monitorId = body.monitorId?.toLowerCase() ?? "";
  const endpoint = body.subscription?.endpoint?.trim() ?? "";
  const p256dh = body.subscription?.keys?.p256dh?.trim() ?? "";
  const auth = body.subscription?.keys?.auth?.trim() ?? "";

  if (!isServiceRouteId(monitorId)) {
    return jsonResponse({ error: "Unknown service." }, { status: 400 });
  }
  if (!endpoint || !p256dh || !auth) {
    return jsonResponse({ error: "Push subscription is incomplete." }, { status: 400 });
  }

  const payload = await readStatusPayload(context.env, context.request);
  const monitor = getMonitor(payload, monitorId);
  if (!monitor) {
    return jsonResponse({ error: "Unknown service." }, { status: 404 });
  }
  if (monitor.currentStatus !== "error") {
    return jsonResponse(
      { error: "This service is already reachable.", currentStatus: monitor.currentStatus },
      { status: 409 },
    );
  }

  const now = new Date();
  const id = crypto.randomUUID();
  const expiresAt = createWatchExpiry(now);

  await context.env.WATCH_DB.prepare(
    `INSERT INTO recovery_watches (
      id, monitor_id, endpoint, p256dh, auth, created_at, expires_at, notified_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(endpoint, monitor_id) DO UPDATE SET
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      created_at = excluded.created_at,
      expires_at = excluded.expires_at,
      notified_at = NULL`,
  )
    .bind(id, monitorId, endpoint, p256dh, auth, now.toISOString(), expiresAt)
    .run();

  return jsonResponse({ ok: true, monitorId, expiresAt }, { status: 201 });
};
