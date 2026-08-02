import { Resvg } from "@cf-wasm/resvg/legacy/workerd";
import { parse, type PathCommand } from "opentype.js";
import {
  renderOgSvg,
  type OgTextOptions,
} from "../functions/_shared/og-image";
import type { MonitorStatus } from "../functions/_shared/status";
import boldFontData from "./assets/og-bold.ttf";
import regularFontData from "./assets/og-regular.ttf";

const MAX_PAYLOAD_BYTES = 16 * 1024;
const regularFont = parse(regularFontData);
const boldFont = parse(boldFontData);

type OgRenderPayload = {
  monitor: MonitorStatus;
  generatedAt: string | null;
  siteUrl: string;
};

interface Env {
  IMAGES: ImagesBinding;
}

export default {
  async fetch(request, env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { allow: "POST" },
      });
    }

    if (!request.headers.get("content-type")?.includes("application/json")) {
      return new Response("Expected JSON status data", { status: 415 });
    }

    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_PAYLOAD_BYTES) {
      return new Response("Status data is too large", { status: 413 });
    }

    if (!request.body) return new Response("Status data is required", { status: 400 });

    try {
      const source = await request.text();
      if (new TextEncoder().encode(source).byteLength > MAX_PAYLOAD_BYTES) {
        return new Response("Status data is too large", { status: 413 });
      }
      const payload = JSON.parse(source) as Partial<OgRenderPayload>;
      if (!isValidPayload(payload)) {
        return new Response("Invalid status data", { status: 400 });
      }

      const pathStartedAt = performance.now();
      const svg = renderOgSvg(
        payload.monitor,
        payload.generatedAt,
        payload.siteUrl,
        renderTextPath,
      );
      const pathDuration = performance.now() - pathStartedAt;

      const rasterStartedAt = performance.now();
      const renderer = await Resvg.async(svg, {
        fitTo: { mode: "width", value: 800 },
        background: "#ffffff",
        textRendering: 1,
      });
      const rendered = renderer.render();
      const png = rendered.asPng();
      const pngBuffer = new ArrayBuffer(png.byteLength);
      new Uint8Array(pngBuffer).set(png);
      const rasterDuration = performance.now() - rasterStartedAt;
      rendered.free();
      renderer.free();

      const pngStream = new Response(pngBuffer).body;
      if (!pngStream) throw new Error("PNG rasterization returned an empty image");

      const transformed = await env.IMAGES.input(pngStream)
        .transform({ width: 1200, height: 630, fit: "cover" })
        .output({
          format: "image/jpeg",
          quality: 88,
          background: "#ffffff",
          anim: false,
        });
      const image = transformed.response();
      const headers = new Headers(image.headers);
      headers.set("content-type", "image/jpeg");
      headers.set("x-content-type-options", "nosniff");
      headers.set(
        "server-timing",
        `text-paths;dur=${pathDuration.toFixed(1)}, svg-raster;dur=${rasterDuration.toFixed(1)}`,
      );

      return new Response(image.body, { status: image.status, headers });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code =
        typeof error === "object" && error && "code" in error
          ? String(error.code)
          : "unknown";
      console.error(
        JSON.stringify({
          message: "OG JPEG conversion failed",
          error: message,
          code,
        }),
      );
      return new Response(`JPEG conversion failed (${code}): ${message}`, {
        status: 502,
      });
    }
  },
} satisfies ExportedHandler<Env>;

function isValidPayload(payload: Partial<OgRenderPayload>): payload is OgRenderPayload {
  return Boolean(
    payload.monitor?.id &&
      payload.monitor.name?.en &&
      typeof payload.siteUrl === "string" &&
      URL.canParse(payload.siteUrl) &&
      (payload.generatedAt === null || typeof payload.generatedAt === "string"),
  );
}

function renderTextPath(options: OgTextOptions) {
  const font = options.weight === 700 ? boldFont : regularFont;
  const x =
    options.anchor === "middle"
      ? options.x - font.getAdvanceWidth(options.text, options.size) / 2
      : options.x;
  const path = font.getPath(options.text, x, options.y, options.size, {
    kerning: true,
  });
  return `<path d="${serializePath(path.commands)}" fill="${options.fill}"/>`;
}

function serializePath(commands: PathCommand[]) {
  return commands.map(serializePathCommand).join("");
}

function serializePathCommand(command: PathCommand) {
  switch (command.type) {
    case "M":
    case "L":
      return `${command.type}${round(command.x)} ${round(command.y)}`;
    case "C":
      return `C${round(command.x1)} ${round(command.y1)} ${round(command.x2)} ${round(command.y2)} ${round(command.x)} ${round(command.y)}`;
    case "Q":
      return `Q${round(command.x1)} ${round(command.y1)} ${round(command.x)} ${round(command.y)}`;
    case "Z":
      return "Z";
  }
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
