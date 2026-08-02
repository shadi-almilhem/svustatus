import { jsonResponse, readStatusPayload, type PagesEnv } from "../_shared/status";

export const onRequestGet: PagesFunction<PagesEnv> = async (context) => {
  try {
    const payload = await readStatusPayload(context.env, context.request);
    return jsonResponse(payload, {
      headers: {
        "cache-control": "public, max-age=15, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Status data is unavailable.",
      },
      { status: 503 },
    );
  }
};
