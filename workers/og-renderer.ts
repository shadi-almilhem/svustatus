const MAX_SVG_BYTES = 128 * 1024;

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

    if (!request.headers.get("content-type")?.includes("image/svg+xml")) {
      return new Response("Expected an SVG image", { status: 415 });
    }

    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_SVG_BYTES) {
      return new Response("SVG image is too large", { status: 413 });
    }

    if (!request.body) return new Response("SVG image is required", { status: 400 });

    try {
      const transformed = await env.IMAGES.input(request.body).output({
        format: "image/jpeg",
        quality: 88,
        background: "#ffffff",
        anim: false,
      });
      const image = transformed.response();
      const headers = new Headers(image.headers);
      headers.set("content-type", "image/jpeg");
      headers.set("x-content-type-options", "nosniff");

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
