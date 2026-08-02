import { jsonResponse, type PagesEnv } from "../_shared/status";

export const onRequestGet: PagesFunction<PagesEnv> = async (context) => {
  if (!context.env.VAPID_PUBLIC_KEY) {
    return jsonResponse(
      { supported: false, reason: "VAPID public key is not configured." },
      { status: 503 },
    );
  }

  return jsonResponse({
    supported: true,
    publicKey: context.env.VAPID_PUBLIC_KEY,
  });
};
