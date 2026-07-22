import { query } from "../lib/social/db.js";
import { linkDestination, visitorHash } from "../lib/social/automation.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");
  try {
    const automationId = String(req.query.automation || "");
    const linkIndex = Number(req.query.index);
    if (!automationId || !Number.isSafeInteger(linkIndex) || linkIndex < 0) return res.status(404).send("Link not found");
    const destination = await linkDestination(automationId, linkIndex);
    if (!destination) return res.status(404).send("Link not found");
    const deliveryId = /^\d+$/u.test(String(req.query.d || "")) ? String(req.query.d) : null;
    try {
      if (deliveryId) {
        await query(
          `INSERT INTO social_link_clicks (automation_id,delivery_id,link_index,visitor_hash)
           SELECT $1,d.id,$3,$4 FROM social_deliveries d WHERE d.id=$2 AND d.automation_id=$1`,
          [automationId, deliveryId, linkIndex, visitorHash(req)],
        );
      } else {
        await query(
          "INSERT INTO social_link_clicks (automation_id,delivery_id,link_index,visitor_hash) VALUES ($1,NULL,$2,$3)",
          [automationId, linkIndex, visitorHash(req)],
        );
      }
    } catch {
      // A valid resource link should still work if analytics storage is briefly unavailable.
    }
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(302, destination);
  } catch {
    return res.status(404).send("Link not found");
  }
}
