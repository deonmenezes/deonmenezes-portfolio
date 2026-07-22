import { isAdmin } from "../../lib/social/auth.js";
import { buildDeliveryText, buildFlowMessages, normalizeFlowSteps, normalizeKeyword } from "../../lib/social/automation.js";
import { query } from "../../lib/social/db.js";
import { logError, readJson, requireMethod, sameOrigin, sendJson } from "../../lib/social/http.js";

function validate(body) {
  const mediaId = String(body?.mediaId || body?.media_id || "").trim();
  const triggerType = String(body?.triggerType ?? body?.trigger_type ?? "comment").trim().toLowerCase();
  const title = String(body?.title || body?.name || "").trim();
  const keyword = normalizeKeyword(body?.keyword);
  const responseText = String(body?.responseText ?? body?.response_text ?? "").trim();
  const flowSteps = normalizeFlowSteps(body?.flowSteps ?? body?.flow_steps);
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
  if (!["comment", "message", "mention"].includes(triggerType)) throw new Error("Automation trigger is invalid.");
  if (triggerType === "comment" && !/^\d+$/u.test(mediaId)) throw new Error("Select an Instagram post.");
  if (!title || title.length > 120) throw new Error("Title is required and must be under 120 characters.");
  if (!keyword || keyword.length > 120) throw new Error("At least one keyword is required and the list must be under 120 characters.");
  if (!responseText && resourceLinks.length === 0 && !flowSteps.length) throw new Error("Add response text, a resource URL, or a flow step.");
  if (Array.isArray(body?.flowSteps ?? body?.flow_steps) && !flowSteps.length) throw new Error("Add at least one valid flow step.");
  if (responseText.length > 700 || publicReplyText.length > 220) throw new Error("Reply copy is too long.");
  if (!['strict', 'immediate'].includes(followGateMode) || !['exact', 'contains'].includes(matchMode)) throw new Error("Automation mode is invalid.");
  try {
    buildDeliveryText(
      { id: "ffffffff-ffff-ffff-ffff-ffffffffffff", response_text: responseText, resource_links: resourceLinks },
      "9223372036854775807",
      "https://deonmenezes.com",
    );
  } catch {
    throw new Error("The fallback private reply is too long. Shorten the text or use fewer links.");
  }
  try {
    buildFlowMessages(
      { id: "ffffffff-ffff-ffff-ffff-ffffffffffff", response_text: responseText, resource_links: resourceLinks, flow_steps: flowSteps },
      "9223372036854775807",
      "https://deonmenezes.com",
    );
  } catch (error) {
    const detail = String(error?.message || "");
    throw new Error(/longer than Instagram/u.test(detail)
      ? "A flow message is too long. Keep each message under Instagram's limit."
      : /message step/u.test(detail)
        ? "A flow needs at least one message or button step."
        : "Every flow button needs a valid HTTPS URL.");
  }
  for (const step of flowSteps) {
    if (step.type === "button") {
      for (const button of step.buttons) {
        if (button.type === "web_url") {
          const url = new URL(button.url);
          if (url.protocol !== "https:") throw new Error("Every flow button URL must use HTTPS.");
        }
      }
    }
  }
  const triggerKey = `${triggerType}:${triggerType === "comment" ? mediaId : keyword}`;
  return { mediaId: mediaId || null, triggerType, triggerKey, title, keyword, responseText, publicReplyText, resourceLinks, flowSteps, followGateMode, matchMode, enabled };
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
         (media_id,trigger_type,trigger_key,title,keyword,match_mode,response_text,public_reply_text,resource_links,flow_steps,follow_gate_mode,enabled,needs_setup,source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,false,'dashboard')
         ON CONFLICT (trigger_key) DO UPDATE SET media_id=excluded.media_id, trigger_type=excluded.trigger_type, title=excluded.title, keyword=excluded.keyword,
           match_mode=excluded.match_mode, response_text=excluded.response_text,
           public_reply_text=excluded.public_reply_text, resource_links=excluded.resource_links,
           flow_steps=excluded.flow_steps, follow_gate_mode=excluded.follow_gate_mode, enabled=excluded.enabled, needs_setup=false,
           source='dashboard', updated_at=now() RETURNING *`,
        [value.mediaId,value.triggerType,value.triggerKey,value.title,value.keyword,value.matchMode,value.responseText,value.publicReplyText,JSON.stringify(value.resourceLinks),JSON.stringify(value.flowSteps),value.followGateMode,value.enabled],
      );
      return sendJson(res, 200, { ok: true, automation: rows[0] });
    }
    const id = String(req.query.id || "");
    if (!id) return sendJson(res, 400, { error: "missing_id" });
    const rows = await query(
      `UPDATE social_automations SET media_id=$2,trigger_type=$3,trigger_key=$4,title=$5,keyword=$6,match_mode=$7,response_text=$8,
       public_reply_text=$9,resource_links=$10::jsonb,flow_steps=$11::jsonb,follow_gate_mode=$12,enabled=$13,needs_setup=false,
       source='dashboard',updated_at=now() WHERE id=$1 RETURNING *`,
      [id,value.mediaId,value.triggerType,value.triggerKey,value.title,value.keyword,value.matchMode,value.responseText,value.publicReplyText,JSON.stringify(value.resourceLinks),JSON.stringify(value.flowSteps),value.followGateMode,value.enabled],
    );
    return rows[0] ? sendJson(res, 200, { ok: true, automation: rows[0] }) : sendJson(res, 404, { error: "not_found" });
  } catch (error) {
    logError("social.automations", error);
    const clientError = /required|under|too long|HTTPS|invalid|Select|Add response|flow button|flow message|message step|fallback|trigger/u.test(String(error.message || ""));
    return sendJson(res, clientError ? 400 : 500, { error: clientError ? "invalid_automation" : "automation_save_failed", detail: clientError ? error.message : undefined });
  }
}
