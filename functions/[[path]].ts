import {
  getMonitor,
  getMonitorIdForRequest,
  getMonitorShareUrl,
  getSiteOrigin,
  readStatusPayload,
  statusLabel,
  type PagesEnv,
} from "./_shared/status";

export const onRequestGet: PagesFunction<PagesEnv> = async (context) => {
  const monitorId = getMonitorIdForRequest(context.request);
  if (!monitorId) return context.next();

  const assetResponse = await context.env.ASSETS.fetch(new URL("/", context.request.url));
  if (!assetResponse.ok) return assetResponse;

  const payload = await readStatusPayload(context.env, context.request);
  const monitor = getMonitor(payload, monitorId);
  if (!monitor) return context.next();

  const title = `${monitor.name.en} is ${statusLabel(monitor.currentStatus)} | SVU Status`;
  const description =
    monitor.currentStatus === "error"
      ? `${monitor.name.en} is currently unreachable. Check live SVU service status.`
      : `${monitor.name.en} is currently reachable. Check live SVU service status.`;
  const shareUrl = getMonitorShareUrl(context.env, context.request, monitor.id);
  const imageUrl = new URL(`/og/${monitor.id}.png`, getSiteOrigin(context.env, context.request));
  imageUrl.searchParams.set("v", payload.generatedAt ?? String(Date.now()));

  let html = await assetResponse.text();
  html = setTitle(html, title);
  html = upsertMeta(html, "name", "description", description);
  html = upsertMeta(html, "property", "og:url", shareUrl);
  html = upsertMeta(html, "property", "og:title", title);
  html = upsertMeta(html, "property", "og:description", description);
  html = upsertMeta(html, "property", "og:image", imageUrl.toString());
  html = upsertMeta(html, "property", "og:image:secure_url", imageUrl.toString());
  html = upsertMeta(html, "property", "og:image:type", "image/png");
  html = upsertMeta(html, "property", "og:image:alt", `${monitor.name.en} live status`);
  html = upsertMeta(html, "name", "twitter:title", title);
  html = upsertMeta(html, "name", "twitter:description", description);
  html = upsertMeta(html, "name", "twitter:image", imageUrl.toString());
  html = upsertMeta(html, "name", "twitter:image:alt", `${monitor.name.en} live status`);

  const headers = new Headers(assetResponse.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "public, max-age=30, stale-while-revalidate=120");

  return new Response(html, {
    status: assetResponse.status,
    headers,
  });
};

function setTitle(html: string, title: string) {
  return html.replace(/<title>.*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
}

function upsertMeta(html: string, kind: "name" | "property", key: string, content: string) {
  const tag = `<meta ${kind}="${escapeHtml(key)}" content="${escapeHtml(content)}" />`;
  const pattern = new RegExp(`<meta\\s+${kind}=["']${escapeRegExp(key)}["'][^>]*>`, "i");
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
