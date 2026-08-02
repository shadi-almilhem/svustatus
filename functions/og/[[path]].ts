import { isServiceRouteId } from "../../src/lib/service-routes";
import { type PagesEnv } from "../_shared/status";

const DEFAULT_OG_IMAGE_BASE_URL =
  "https://raw.githubusercontent.com/shadi-almilhem/svustatus/status-data/og";

type OgPagesEnv = PagesEnv & {
  PUBLIC_OG_IMAGE_BASE_URL?: string;
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
  const monitorId = path?.replace(/\.png$/i, "").toLowerCase() ?? "";

  if (!isServiceRouteId(monitorId)) {
    return new Response("Unknown service", { status: 404 });
  }

  const baseUrl = context.env.PUBLIC_OG_IMAGE_BASE_URL || DEFAULT_OG_IMAGE_BASE_URL;
  const upstreamUrl = new URL(`${baseUrl.replace(/\/$/, "")}/${monitorId}.png`);
  const version = new URL(context.request.url).searchParams.get("v");
  if (version) upstreamUrl.searchParams.set("v", version);

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { accept: "image/png" },
    });
    if (upstream.ok && upstream.headers.get("content-type")?.includes("image/png")) {
      return imageResponse(isHead ? null : upstream.body, upstream.headers);
    }
  } catch {
    // The bundled fallback below keeps previews available if GitHub is unreachable.
  }

  const fallbackUrl = new URL(`/og-static/${monitorId}.png`, context.request.url);
  const fallback = await context.env.ASSETS.fetch(fallbackUrl);
  if (!fallback.ok) return new Response("OG image is unavailable", { status: 503 });
  return imageResponse(isHead ? null : fallback.body, fallback.headers);
}

function imageResponse(body: BodyInit | null, sourceHeaders: Headers) {
  const headers = new Headers();
  headers.set("content-type", sourceHeaders.get("content-type") || "image/png");
  headers.set(
    "cache-control",
    "no-transform, public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
  );
  const contentLength = sourceHeaders.get("content-length");
  if (contentLength) headers.set("content-length", contentLength);
  return new Response(body, { status: 200, headers });
}
