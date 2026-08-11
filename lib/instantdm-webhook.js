import { createHmac, timingSafeEqual } from "node:crypto";

import { logError, readRawBody, requireMethod, sendJson } from "./social/http.js";
import { addResendContact, isSubscribableEmail } from "./resend-contacts.js";

const MAX_BODY_BYTES = 64 * 1024;

// InstantDM fires one of these per collected answer. Anything else is ignored so
// that widening subscribed_events later cannot quietly start harvesting emails.
const SUBSCRIBING_EVENTS = new Set(["question_answered", "flow_completed"]);

// Only these subtrees are searched for an address. A blind scan of the whole
// payload would pick up Deon's own account email and Instagram profile fields.
const ANSWER_KEYS = ["question_response", "contact_info", "answers", "answer", "response", "responses", "data"];
const EMAIL_KEYS = ["email", "email_address", "value", "text", "answer", "response"];

function constantTimeEquals(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

/**
 * InstantDM documents an `x-webhook-signature` header "verified against
 * webhook_secret" but never states the scheme, and the signing code is
 * server-side. So the variants below are guesses: a match is recorded for the
 * logs, and enforcement stays opt-in until one of them is confirmed in
 * production. The unguessable URL token is the actual gate.
 */
export function matchSignatureVariant(rawBody, secret, header) {
  if (!secret || !header) return "";
  // A Hmac is single-use, so each encoding needs its own instance.
  const hex = createHmac("sha256", secret).update(rawBody).digest("hex");
  const base64 = createHmac("sha256", secret).update(rawBody).digest("base64");
  const candidates = { hex, "sha256-prefixed": `sha256=${hex}`, base64 };
  for (const [name, candidate] of Object.entries(candidates)) {
    if (constantTimeEquals(candidate, header)) return name;
  }
  return "";
}

function collectEmails(node, depth, found) {
  if (depth > 6 || node == null || found.size >= 10) return found;

  if (typeof node === "string") {
    const email = isSubscribableEmail(node);
    if (email) found.add(email);
    return found;
  }

  if (Array.isArray(node)) {
    for (const item of node) collectEmails(item, depth + 1, found);
    return found;
  }

  if (typeof node !== "object") return found;

  for (const [key, value] of Object.entries(node)) {
    const lowered = key.toLowerCase();
    if (EMAIL_KEYS.includes(lowered) || ANSWER_KEYS.includes(lowered)) {
      collectEmails(value, depth + 1, found);
    } else if (lowered.includes("email")) {
      collectEmails(value, depth + 1, found);
    }
  }
  return found;
}

export function extractEmails(payload) {
  const event = String(payload?.event || payload?.event_type || payload?.type || "").trim();
  if (event && !SUBSCRIBING_EVENTS.has(event)) return { event, emails: [] };

  const roots = [];
  for (const key of ANSWER_KEYS) {
    if (payload?.[key] != null) roots.push(payload[key]);
  }
  if (!roots.length) roots.push(payload);

  const found = new Set();
  for (const root of roots) collectEmails(root, 0, found);
  return { event: event || "unknown", emails: [...found] };
}

export function createInstantDmWebhookHandler({
  fetchFn = (...args) => fetch(...args),
} = {}) {
  return async function handler(req, res) {
    if (!requireMethod(req, res, ["POST"])) return;

    const expectedToken = process.env.INSTANTDM_WEBHOOK_TOKEN?.trim();
    if (!expectedToken) return sendJson(res, 503, { error: "webhook_unconfigured" });
    if (!constantTimeEquals(req.query?.token, expectedToken)) {
      return sendJson(res, 401, { error: "unauthorized" });
    }

    let raw;
    try {
      raw = await readRawBody(req, MAX_BODY_BYTES);
    } catch (error) {
      const tooLarge = error?.message === "payload_too_large";
      return sendJson(res, tooLarge ? 413 : 400, { error: tooLarge ? "payload_too_large" : "invalid_body" });
    }

    const secret = process.env.INSTANTDM_WEBHOOK_SECRET?.trim();
    const signatureVariant = matchSignatureVariant(raw, secret, req.headers?.["x-webhook-signature"]);
    if (process.env.INSTANTDM_WEBHOOK_REQUIRE_SIGNATURE === "1" && !signatureVariant) {
      return sendJson(res, 401, { error: "bad_signature" });
    }

    let payload;
    try {
      payload = raw.length ? JSON.parse(raw.toString("utf8")) : {};
    } catch {
      return sendJson(res, 400, { error: "invalid_json" });
    }

    const { event, emails } = extractEmails(payload);
    if (!emails.length) return sendJson(res, 200, { ok: true, event, added: 0, skipped: 0 });

    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) return sendJson(res, 503, { error: "newsletter_unavailable" });

    let added = 0;
    let skipped = 0;
    let failed = 0;
    for (const email of emails) {
      try {
        const outcome = await addResendContact(email, {
          apiKey,
          fetchFn,
          userAgent: "deonmenezes.com-instantdm-sync/1.0",
        });
        if (outcome === "created") added += 1;
        else if (outcome === "existing") skipped += 1;
        else failed += 1;
      } catch (error) {
        failed += 1;
        logError("instantdm_webhook_contact", error);
      }
    }

    // Always 200 on a authenticated, well-formed delivery. InstantDM retries on
    // non-2xx, and a retry would not fix a Resend outage for this one payload.
    console.log(JSON.stringify({
      level: "info",
      scope: "instantdm_webhook",
      event,
      signatureVariant: signatureVariant || "none",
      added,
      skipped,
      failed,
      at: new Date().toISOString(),
    }));
    return sendJson(res, 200, { ok: true, event, added, skipped, failed });
  };
}

export default createInstantDmWebhookHandler();
