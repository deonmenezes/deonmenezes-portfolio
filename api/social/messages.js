import { isAdmin } from "../../lib/social/auth.js";
import { query } from "../../lib/social/db.js";
import { sendMessage } from "../../lib/social/meta.js";
import { logError, readJson, requireMethod, sameOrigin, sendJson } from "../../lib/social/http.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["POST"])) return;
  if (!isAdmin(req)) return sendJson(res, 401, { error: "authentication_required" });
  if (!sameOrigin(req)) return sendJson(res, 403, { error: "invalid_origin" });
  try {
    const body = await readJson(req);
    const recipientId = String(body?.recipientId ?? body?.recipient_id ?? "").trim();
    const message = String(body?.text ?? body?.message ?? "").trim();
    if (!recipientId || recipientId.length > 160) throw new Error("A recipient is required.");
    if (!message || message.length > 1000) throw new Error("Message text is required and must be under 1000 characters.");
    const result = await sendMessage(recipientId, { text: message });
    const id = String(result?.message_id || `manual:${recipientId}:${Date.now()}`);
    await query(
      `INSERT INTO social_messages (id,participant_id,direction,body,created_at)
       VALUES ($1,$2,'outbound',$3,now()) ON CONFLICT (id) DO NOTHING`,
      [id, recipientId, message],
    );
    return sendJson(res, 200, { ok: true, messageId: id });
  } catch (error) {
    logError("social.messages", error);
    const detail = String(error?.message || "");
    const clientError = /required|under/u.test(detail);
    return sendJson(res, clientError ? 400 : 502, { error: clientError ? "invalid_message" : "message_send_failed", detail: clientError ? detail : undefined });
  }
}
