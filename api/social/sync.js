import { isAdmin } from "../../lib/social/auth.js";
import { seedAutomations, syncInstagram } from "../../lib/social/automation.js";
import { logError, requireMethod, sameOrigin, sendJson } from "../../lib/social/http.js";
import { socialSeeds } from "../../data/social-seeds.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["POST"])) return;
  if (!isAdmin(req)) return sendJson(res, 401, { error: "authentication_required" });
  if (!sameOrigin(req)) return sendJson(res, 403, { error: "invalid_origin" });
  try {
    const sync = await syncInstagram();
    const seed = await seedAutomations(socialSeeds);
    return sendJson(res, 200, { ok: true, sync, seed });
  } catch (error) {
    logError("social.sync", error);
    return sendJson(res, 502, { error: "instagram_sync_failed", detail: String(error.message || "sync_failed").slice(0, 180) });
  }
}
