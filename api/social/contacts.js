import { isAdmin } from "../../lib/social/auth.js";
import { query } from "../../lib/social/db.js";
import { sendMessage } from "../../lib/social/meta.js";
import { logError, readJson, requireMethod, sameOrigin, sendJson } from "../../lib/social/http.js";

function normalizeTag(value) {
  return String(value || "").trim().toLocaleLowerCase("en-US").replace(/\s+/gu, "-").slice(0, 40);
}

function contactId(value) {
  const id = String(value || "").trim();
  if (!id || id.length > 160) throw new Error("A contact is required.");
  return id;
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["GET", "POST", "DELETE"])) return;
  if (!isAdmin(req)) return sendJson(res, 401, { error: "authentication_required" });
  if (req.method !== "GET" && !sameOrigin(req)) return sendJson(res, 403, { error: "invalid_origin" });
  try {
    if (req.method === "GET") {
      const rows = await query(`SELECT c.*, COALESCE(tags.tags,'[]'::json) AS tags
        FROM social_contacts c
        LEFT JOIN LATERAL (
          SELECT json_agg(t.name ORDER BY t.name) AS tags
          FROM social_contact_tags ct JOIN social_tags t ON t.id=ct.tag_id
          WHERE ct.contact_id=c.id
        ) tags ON true
        ORDER BY c.last_seen_at DESC LIMIT 1000`);
      return sendJson(res, 200, { contacts: rows });
    }
    const body = await readJson(req);
    if (req.method === "POST" && body?.recipientId && (body?.text ?? body?.message)) {
      const recipientId = String(body.recipientId).trim();
      const message = String(body.text ?? body.message ?? "").trim();
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
    }
    const id = contactId(body?.contactId ?? body?.contact_id);
    const contact = await query("SELECT id FROM social_contacts WHERE id=$1", [id]);
    if (!contact[0]) return sendJson(res, 404, { error: "contact_not_found" });
    if (body?.fields && typeof body.fields === "object" && !Array.isArray(body.fields)) {
      const fields = Object.fromEntries(Object.entries(body.fields).slice(0, 30).map(([key, value]) => [String(key).slice(0, 60), String(value ?? "").slice(0, 500)]));
      await query("UPDATE social_contacts SET fields=fields || $2::jsonb,updated_at=now() WHERE id=$1", [id, JSON.stringify(fields)]);
    }
    const tag = normalizeTag(body?.tag);
    if (!tag && body?.fields) return sendJson(res, 200, { ok: true, contactId: id, fieldsUpdated: true });
    if (req.method === "POST") {
      if (!tag) return sendJson(res, 400, { error: "tag_required" });
      const tagRows = await query("INSERT INTO social_tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id,name", [tag]);
      await query("INSERT INTO social_contact_tags (contact_id,tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [id, tagRows[0].id]);
      return sendJson(res, 200, { ok: true, contactId: id, tag });
    }
    const tagRows = await query("SELECT id FROM social_tags WHERE name=$1", [tag]);
    if (tagRows[0]) await query("DELETE FROM social_contact_tags WHERE contact_id=$1 AND tag_id=$2", [id, tagRows[0].id]);
    return sendJson(res, 200, { ok: true, contactId: id, removed: tag });
  } catch (error) {
    logError("social.contacts", error);
    const clientError = /required|tag/u.test(String(error?.message || ""));
    return sendJson(res, clientError ? 400 : 500, { error: clientError ? "invalid_contact_request" : "contacts_unavailable", detail: clientError ? error.message : undefined });
  }
}
