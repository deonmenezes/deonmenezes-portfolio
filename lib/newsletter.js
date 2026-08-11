import { readJson, requireMethod, sameOrigin, sendJson } from "./social/http.js";
import { enforceNewsletterRateLimit } from "./newsletter-rate-limit.js";
import { addResendContact, isSubscribableEmail } from "./resend-contacts.js";

const MAX_BODY_BYTES = 4 * 1024;

export function createNewsletterHandler({
  fetchFn = (...args) => fetch(...args),
  allowSignup = enforceNewsletterRateLimit,
} = {}) {
  return async function handler(req, res) {
    if (!requireMethod(req, res, ["POST"])) return;
    if (!sameOrigin(req)) return sendJson(res, 403, { error: "invalid_origin" });

    let body;
    try {
      body = await readJson(req, MAX_BODY_BYTES);
      if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY_BYTES) {
        return sendJson(res, 413, { error: "payload_too_large" });
      }
    } catch (error) {
      const tooLarge = error?.message === "payload_too_large";
      return sendJson(res, tooLarge ? 413 : 400, { error: tooLarge ? "payload_too_large" : "invalid_json" });
    }

    if (String(body?.company || "").trim()) return sendJson(res, 200, { ok: true });

    const email = isSubscribableEmail(body?.email);
    if (!email) return sendJson(res, 400, { error: "invalid_email" });

    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) return sendJson(res, 503, { error: "newsletter_unavailable" });

    try {
      if (!await allowSignup(req, email, apiKey)) {
        res.setHeader("Retry-After", "3600");
        return sendJson(res, 429, { error: "newsletter_too_many_requests" });
      }
    } catch {
      return sendJson(res, 503, { error: "newsletter_unavailable" });
    }

    const outcome = await addResendContact(email, { apiKey, fetchFn });
    if (outcome === "failed") return sendJson(res, 502, { error: "newsletter_unavailable" });
    return sendJson(res, 200, { ok: true, status: "accepted" });
  };
}

export default createNewsletterHandler();
