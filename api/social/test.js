import { isAdmin } from "../../lib/social/auth.js";
import { buildDeliveryText, buildFlowMessages } from "../../lib/social/automation.js";
import { query } from "../../lib/social/db.js";
import { publicBaseUrl, readJson, requireMethod, sameOrigin, sendJson } from "../../lib/social/http.js";
import { getAccount } from "../../lib/social/meta.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["POST"])) return;
  if (!isAdmin(req)) return sendJson(res, 401, { error: "authentication_required" });
  if (!sameOrigin(req)) return sendJson(res, 403, { error: "invalid_origin" });
  const body = await readJson(req);
  const rows = await query("SELECT * FROM social_automations WHERE id=$1", [String(body?.automationId || "")]);
  if (!rows[0]) return sendJson(res, 404, { error: "not_found" });
  try {
    const account = await getAccount();
    const preview = buildDeliveryText(rows[0], "preview", publicBaseUrl(req));
    const flow = buildFlowMessages(rows[0], "preview", publicBaseUrl(req));
    return sendJson(res, 200, { ok: true, liveConnection: true, account: account.username, preview, flow });
  } catch (error) {
    return sendJson(res, 502, { error: "meta_connection_failed", detail: String(error.message || "Meta connection failed").slice(0, 180) });
  }
}
