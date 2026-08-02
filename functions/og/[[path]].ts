import { isServiceRouteId } from "../../src/lib/service-routes";
import { getMonitor, getSiteOrigin, readStatusPayload, type PagesEnv } from "../_shared/status";

type OgPagesEnv = PagesEnv & {
  OG_RENDERER: Fetcher;
};

export const onRequestGet: PagesFunction<OgPagesEnv> = async (context) =>
  createOgImageResponse(context);

export const onRequestHead: PagesFunction<OgPagesEnv> = async (context) =>
  createOgImageResponse(context, true);

async function createOgImageResponse(
  context: EventContext<OgPagesEnv, string, unknown>,
  isHead = false,
) {
  const rawPath = context.params.path;
  const path = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;
  const match = path?.match(/^([a-z0-9-]+)\.(jpe?g|png)$/i);
  const monitorId = match?.[1]?.toLowerCase() ?? "";

  if (!isServiceRouteId(monitorId)) {
    return new Response("Unknown service", { status: 404 });
  }

  if (match?.[2]?.toLowerCase() === "png") {
    const redirectUrl = new URL(context.request.url);
    redirectUrl.pathname = `/og/${monitorId}.jpg`;
    return Response.redirect(redirectUrl.toString(), 308);
  }

  if (isHead) {
    return new Response(null, {
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "public, max-age=60, must-revalidate",
        "x-content-type-options": "nosniff",
      },
    });
  }

  const payload = await readStatusPayload(context.env, context.request);
  const monitor = getMonitor(payload, monitorId);
  if (!monitor) return new Response("Unknown service", { status: 404 });

  const renderResponse = await context.env.OG_RENDERER.fetch(
    new Request("https://og-renderer.internal/render", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        monitor,
        generatedAt: payload.generatedAt,
        siteUrl: getSiteOrigin(context.env, context.request),
      }),
    }),
  );

  if (!renderResponse.ok) {
    const rendererError = (await renderResponse.text()).slice(0, 256);
    console.error(
      JSON.stringify({
        message: "OG renderer returned an error",
        monitorId,
        status: renderResponse.status,
        rendererError,
      }),
    );
    return new Response("OG image is temporarily unavailable", { status: 503 });
  }

  const headers = new Headers(renderResponse.headers);
  headers.set("content-type", "image/jpeg");
  headers.set("cache-control", "public, max-age=60, must-revalidate");
  headers.set("x-content-type-options", "nosniff");
  return new Response(renderResponse.body, { status: 200, headers });
}
