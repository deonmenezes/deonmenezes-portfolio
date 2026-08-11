/* Read-only preview of a comment backfill.
 *
 * Deliberately has NO send path. Messaging several hundred people is not
 * something that should be one query parameter away from a preview, so the
 * sending side is a separate deliberate change.
 */

import { timingSafeEqual } from "node:crypto";

import { logError, requireMethod, sendJson } from "./social/http.js";
import { planBackfill } from "./comment-backfill.js";
import { getAccount, listComments } from "./social/meta.js";

function constantTimeEquals(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

export function createBackfillPreviewHandler({
  fetchComments = listComments,
  fetchAccount = getAccount,
} = {}) {
  return async function handler(req, res) {
    if (!requireMethod(req, res, ["GET"])) return;

    const expected = process.env.BACKFILL_TOKEN?.trim();
    if (!expected) return sendJson(res, 503, { error: "backfill_unconfigured" });
    if (!constantTimeEquals(req.query?.token, expected)) return sendJson(res, 401, { error: "unauthorized" });

    const mediaId = String(req.query?.media || "").trim();
    if (!/^\d+$/u.test(mediaId)) return sendJson(res, 400, { error: "invalid_media_id" });

    const keyword = String(req.query?.keyword || "link").trim();
    const alreadyHandled = String(req.query?.handled || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    try {
      const [comments, account] = await Promise.all([fetchComments(mediaId), fetchAccount()]);
      const plan = planBackfill(comments, { keyword, alreadyHandled, ownUsername: account?.username });

      return sendJson(res, 200, {
        ok: true,
        media_id: mediaId,
        keyword,
        account: account?.username || "",
        comments_fetched: plan.total,
        eligible: plan.eligible.length,
        skipped: plan.skipped,
        soonest_expiry_hours: plan.eligible[0]?.hours_left ?? null,
        sample: plan.eligible.slice(0, 10).map(({ username, hours_left, timestamp }) => ({ username, hours_left, timestamp })),
        // Only on request: the send step needs the ids, but the default
        // response should not hand back a list of people by default.
        ...(String(req.query?.include || "") === "ids" ? { queue: plan.eligible } : {}),
      });
    } catch (error) {
      logError("backfill_preview", error);
      return sendJson(res, 502, {
        error: "meta_unavailable",
        detail: String(error?.message || "").slice(0, 200),
      });
    }
  };
}

export default createBackfillPreviewHandler();
