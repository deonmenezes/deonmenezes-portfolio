import { readJson, requireMethod, sameOrigin, sendJson } from "./social/http.js";
import { enforceNewsletterRateLimit } from "./newsletter-rate-limit.js";

const MAX_BODY_BYTES = 4 * 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const RESEND_CONTACTS_URL = "https://api.resend.com/contacts";
const RESEND_TIMEOUT_MS = 8_000;

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

    const email = String(body?.email || "").trim().toLowerCase();
    if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
      return sendJson(res, 400, { error: "invalid_email" });
    }

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

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "deonmenezes.com-newsletter/1.0",
    };

    try {
      const contactUrl = `${RESEND_CONTACTS_URL}/${encodeURIComponent(email)}`;
      const existing = await fetchFn(contactUrl, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
      });
      if (existing.ok) {
        return sendJson(res, 200, { ok: true, status: "accepted" });
      }
      if (existing.status !== 404) {
        return sendJson(res, 502, { error: "newsletter_unavailable" });
      }

      const created = await fetchFn(RESEND_CONTACTS_URL, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
        body: JSON.stringify({ email }),
      });
      if (created.ok) return sendJson(res, 200, { ok: true, status: "accepted" });
      if (created.status === 409) {
        return sendJson(res, 200, { ok: true, status: "accepted" });
      }
    } catch {
      // Fall through to the same generic response used for unsuccessful upstream requests.
    }

    return sendJson(res, 502, { error: "newsletter_unavailable" });
  };
}

export default createNewsletterHandler();
