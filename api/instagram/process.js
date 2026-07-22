import { isAdmin } from "../../lib/social/auth.js";
import { cleanupOldData, processPendingEvents, seedAutomations, syncInstagram } from "../../lib/social/automation.js";
import { logError, publicBaseUrl, requireMethod, sameOrigin, sendJson } from "../../lib/social/http.js";
import { socialSeeds } from "../../data/social-seeds.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["GET", "POST"])) return;
  const cronSecret = process.env.CRON_SECRET;
  const cron = Boolean(cronSecret) && req.headers.authorization === `Bearer ${cronSecret}`;
  if (!cron && !isAdmin(req)) return sendJson(res, 401, { error: "authentication_required" });
  if (req.method === "POST" && !cron && !sameOrigin(req)) return sendJson(res, 403, { error: "invalid_origin" });
  try {
    const processed = await processPendingEvents(publicBaseUrl(req), 100);
    let sync;
    let seed;
    if (req.query.sync === "1") {
      sync = await syncInstagram();
      seed = await seedAutomations(socialSeeds);
    }
    await cleanupOldData();
    return sendJson(res, 200, { ok: true, processed, sync, seed });
  } catch (error) {
    logError("instagram.process", error);
    return sendJson(res, 500, { error: "processing_failed" });
  }
}
