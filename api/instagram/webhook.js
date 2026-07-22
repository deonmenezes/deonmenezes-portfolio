import { waitUntil } from "@vercel/functions";
import { extractWebhookEvents, processPendingEvents, signatureValid, storeWebhookEvents } from "../../lib/social/automation.js";
import { logError, publicBaseUrl, readRawBody, requireMethod, sendJson } from "../../lib/social/http.js";
import { accountId } from "../../lib/social/meta.js";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method === "GET") {
    const mode = String(req.query["hub.mode"] || "");
    const token = String(req.query["hub.verify_token"] || "");
    const challenge = String(req.query["hub.challenge"] || "");
    if (mode === "subscribe" && token && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
      res.status(200).send(challenge);
      return;
    }
    return sendJson(res, 403, { error: "verification_failed" });
  }
  if (!requireMethod(req, res, ["POST"])) return;
  try {
    const raw = await readRawBody(req);
    if (!signatureValid(raw, req.headers["x-hub-signature-256"])) return sendJson(res, 401, { error: "invalid_signature" });
    let payload;
    try { payload = JSON.parse(raw.toString("utf8")); }
    catch { return sendJson(res, 400, { error: "invalid_json" }); }
    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    if (payload?.object !== "instagram" || entries.some((entry) => String(entry?.id || "") !== accountId())) {
      return sendJson(res, 200, { received: 0, inserted: 0 });
    }
    const events = extractWebhookEvents(payload);
    const inserted = await storeWebhookEvents(events);
    if (inserted) waitUntil(processPendingEvents(publicBaseUrl(req), 25));
    return sendJson(res, 200, { received: events.length, inserted });
  } catch (error) {
    const invalidPayload = /invalid json|payload_too_large/iu.test(String(error?.message || ""));
    if (!invalidPayload) logError("instagram.webhook", error);
    return sendJson(res, invalidPayload ? 400 : 500, { error: invalidPayload ? "invalid_json" : "webhook_unavailable" });
  }
}
