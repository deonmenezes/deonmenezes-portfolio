import { isAdmin } from "../../lib/social/auth.js";
import { broadcastMessage } from "../../lib/social/broadcast.js";
import { query } from "../../lib/social/db.js";
import { logError, readJson, requireMethod, sameOrigin, sendJson } from "../../lib/social/http.js";

function parseScheduledAt(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Scheduled time is invalid.");
  if (date.getTime() < Date.now() - 60_000) throw new Error("Scheduled time must be in the future.");
  return date.toISOString();
}

function validate(body) {
  const title = String(body?.title || "").trim();
  const message = broadcastMessage(body?.text ?? body?.message?.text);
  const tagFilter = String(body?.tagFilter ?? body?.tag_filter ?? "").trim().toLocaleLowerCase("en-US").replace(/\s+/gu, "-").slice(0, 40) || null;
  const scheduledAt = parseScheduledAt(body?.scheduledAt ?? body?.scheduled_at);
  if (!title || title.length > 120) throw new Error("Broadcast title is required and must be under 120 characters.");
  return { title, message, tagFilter, scheduledAt };
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["GET", "POST", "PATCH"])) return;
  if (!isAdmin(req)) return sendJson(res, 401, { error: "authentication_required" });
  if (req.method !== "GET" && !sameOrigin(req)) return sendJson(res, 403, { error: "invalid_origin" });
  try {
    if (req.method === "GET") {
      const rows = await query(
        `SELECT b.*,COUNT(d.id)::int AS recipients,
          COUNT(d.id) FILTER (WHERE d.status='sent')::int AS sent,
          COUNT(d.id) FILTER (WHERE d.status='failed')::int AS failed
         FROM social_broadcasts b LEFT JOIN social_broadcast_deliveries d ON d.broadcast_id=b.id
         GROUP BY b.id ORDER BY b.updated_at DESC LIMIT 100`,
      );
      return sendJson(res, 200, { broadcasts: rows });
    }
    const id = String(req.query.id || "");
    const action = String(req.query.action || "");
    if (req.method === "PATCH" && action === "cancel") {
      const rows = await query("UPDATE social_broadcasts SET status='cancelled',updated_at=now() WHERE id=$1 AND status IN ('draft','scheduled') RETURNING id", [id]);
      return rows[0] ? sendJson(res, 200, { ok: true, status: "cancelled" }) : sendJson(res, 404, { error: "broadcast_not_found_or_locked" });
    }
    if (req.method === "PATCH" && action === "send") {
      const rows = await query("UPDATE social_broadcasts SET status='scheduled',scheduled_at=now(),updated_at=now() WHERE id=$1 AND status='draft' RETURNING id", [id]);
      return rows[0] ? sendJson(res, 200, { ok: true, status: "scheduled" }) : sendJson(res, 404, { error: "broadcast_not_found_or_locked" });
    }
    const value = validate(await readJson(req));
    if (req.method === "POST") {
      const rows = await query(
        `INSERT INTO social_broadcasts (title,message,tag_filter,status,scheduled_at)
         VALUES ($1,$2::jsonb,$3,CASE WHEN $4::timestamptz IS NULL THEN 'draft' ELSE 'scheduled' END,$4::timestamptz)
         RETURNING *`,
        [value.title, JSON.stringify(value.message), value.tagFilter, value.scheduledAt],
      );
      return sendJson(res, 200, { ok: true, broadcast: rows[0] });
    }
    if (!id) return sendJson(res, 400, { error: "missing_id" });
    const rows = await query(
      `UPDATE social_broadcasts SET title=$2,message=$3::jsonb,tag_filter=$4,scheduled_at=$5::timestamptz,
       status=CASE WHEN $5::timestamptz IS NULL THEN 'draft' ELSE 'scheduled' END,updated_at=now()
       WHERE id=$1 AND status='draft' RETURNING *`,
      [id, value.title, JSON.stringify(value.message), value.tagFilter, value.scheduledAt],
    );
    return rows[0] ? sendJson(res, 200, { ok: true, broadcast: rows[0] }) : sendJson(res, 404, { error: "broadcast_not_found_or_locked" });
  } catch (error) {
    logError("social.broadcasts", error);
    const detail = String(error?.message || "");
    const clientError = /required|under|invalid|future|must be/u.test(detail);
    return sendJson(res, clientError ? 400 : 500, { error: clientError ? "invalid_broadcast" : "broadcasts_unavailable", detail: clientError ? detail : undefined });
  }
}
