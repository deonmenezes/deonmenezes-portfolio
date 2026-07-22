import { isAdmin } from "../../lib/social/auth.js";
import { buildDeliveryText, normalizeKeyword } from "../../lib/social/automation.js";
import { query } from "../../lib/social/db.js";
import { logError, readJson, requireMethod, sameOrigin, sendJson } from "../../lib/social/http.js";

function validate(body) {
  const mediaId = String(body?.mediaId || body?.media_id || "").trim();
  const title = String(body?.title || body?.name || "").trim();
  const keyword = normalizeKeyword(body?.keyword);
  const responseText = String(body?.responseText ?? body?.response_text ?? "").trim();
  const publicReply = body?.publicReply && typeof body.publicReply === "object" ? body.publicReply : null;
  const publicReplyText = publicReply && publicReply.enabled === false
    ? ""
    : String(publicReply?.text ?? body?.publicReplyText ?? body?.public_reply_text ?? "").trim();
  const links = Array.isArray(body?.links)
    ? body.links
    : (Array.isArray(body?.resourceUrls) ? body.resourceUrls : (Array.isArray(body?.resource_links) ? body.resource_links : []));
  const resourceLinks = links.map((link, index) => {
    const label = String(link?.label || `Link ${index + 1}`).trim().slice(0, 100);
    const url = new URL(String(link?.url || ""));
    if (url.protocol !== "https:") throw new Error("Every resource URL must use HTTPS.");
    return { label, url: url.toString() };
  });
  const followGateMode = typeof body?.followGate === "boolean"
    ? (body.followGate ? "strict" : "immediate")
    : (body?.followGateMode ?? body?.follow_gate_mode ?? "strict");
  const matchMode = body?.matchMode ?? body?.match_mode ?? "exact";
  const enabled = Boolean(body?.enabled);
  if (!/^\d+$/u.test(mediaId)) throw new Error("Select an Instagram post.");
  if (!title || title.length > 120) throw new Error("Title is required and must be under 120 characters.");
  if (!keyword || keyword.length > 120) throw new Error("At least one keyword is required and the list must be under 120 characters.");
  if (!responseText && resourceLinks.length === 0) throw new Error("Add response text or at least one resource URL.");
  if (responseText.length > 700 || publicReplyText.length > 220) throw new Error("Reply copy is too long.");
  if (!['strict', 'immediate'].includes(followGateMode) || !['exact', 'contains'].includes(matchMode)) throw new Error("Automation mode is invalid.");
  try {
    buildDeliveryText(
      { id: "ffffffff-ffff-ffff-ffff-ffffffffffff", response_text: responseText, resource_links: resourceLinks },
      "9223372036854775807",
      "https://deonmenezes.com",
    );
  } catch {
    throw new Error("The combined private reply is too long. Shorten the text or use fewer links.");
  }
  return { mediaId, title, keyword, responseText, publicReplyText, resourceLinks, followGateMode, matchMode, enabled };
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["POST", "PATCH", "DELETE"])) return;
  if (!isAdmin(req)) return sendJson(res, 401, { error: "authentication_required" });
  if (!sameOrigin(req)) return sendJson(res, 403, { error: "invalid_origin" });
  try {
    if (req.method === "DELETE") {
      const id = String(req.query.id || "");
      if (!id) return sendJson(res, 400, { error: "missing_id" });
      const rows = await query(
        `UPDATE social_automations SET enabled=false,needs_setup=true,source='dashboard',updated_at=now()
         WHERE id=$1 RETURNING id`,
        [id],
      );
      return rows[0] ? sendJson(res, 200, { ok: true, disabled: true }) : sendJson(res, 404, { error: "not_found" });
    }
    const value = validate(await readJson(req));
    if (req.method === "POST") {
      const rows = await query(
        `INSERT INTO social_automations
         (media_id,title,keyword,match_mode,response_text,public_reply_text,resource_links,follow_gate_mode,enabled,needs_setup,source)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,false,'dashboard')
         ON CONFLICT (media_id) DO UPDATE SET title=excluded.title, keyword=excluded.keyword,
           match_mode=excluded.match_mode, response_text=excluded.response_text,
           public_reply_text=excluded.public_reply_text, resource_links=excluded.resource_links,
           follow_gate_mode=excluded.follow_gate_mode, enabled=excluded.enabled, needs_setup=false,
           source='dashboard', updated_at=now() RETURNING *`,
        [value.mediaId,value.title,value.keyword,value.matchMode,value.responseText,value.publicReplyText,JSON.stringify(value.resourceLinks),value.followGateMode,value.enabled],
      );
      return sendJson(res, 200, { ok: true, automation: rows[0] });
    }
    const id = String(req.query.id || "");
    if (!id) return sendJson(res, 400, { error: "missing_id" });
    const rows = await query(
      `UPDATE social_automations SET media_id=$2,title=$3,keyword=$4,match_mode=$5,response_text=$6,
       public_reply_text=$7,resource_links=$8::jsonb,follow_gate_mode=$9,enabled=$10,needs_setup=false,
       source='dashboard',updated_at=now() WHERE id=$1 RETURNING *`,
      [id,value.mediaId,value.title,value.keyword,value.matchMode,value.responseText,value.publicReplyText,JSON.stringify(value.resourceLinks),value.followGateMode,value.enabled],
    );
    return rows[0] ? sendJson(res, 200, { ok: true, automation: rows[0] }) : sendJson(res, 404, { error: "not_found" });
  } catch (error) {
    logError("social.automations", error);
    const clientError = /required|under|too long|HTTPS|invalid|Select|Add response/u.test(String(error.message || ""));
    return sendJson(res, clientError ? 400 : 500, { error: clientError ? "invalid_automation" : "automation_save_failed", detail: clientError ? error.message : undefined });
  }
}
