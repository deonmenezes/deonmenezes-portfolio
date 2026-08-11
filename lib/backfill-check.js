/* Which comments has the account already replied to?
 *
 * A batch that times out mid-flight leaves no client-side record of what
 * landed. Resuming blind would post a second reply under someone's comment,
 * so the resume path asks Instagram what is actually there.
 */

import { timingSafeEqual } from "node:crypto";

import { logError, readJson, requireMethod, sendJson } from "./social/http.js";
import { getAccount, listCommentReplies } from "./social/meta.js";

const MAX_IDS = 40;

function constantTimeEquals(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

export function hasReplyFrom(replies, username) {
  const own = String(username || "").toLowerCase();
  if (!own) return false;
  return (Array.isArray(replies) ? replies : []).some((reply) => {
    const from = String(reply?.username || reply?.from?.username || "").toLowerCase();
    return from === own;
  });
}

export function createBackfillCheckHandler({
  fetchReplies = listCommentReplies,
  fetchAccount = getAccount,
} = {}) {
  return async function handler(req, res) {
    if (!requireMethod(req, res, ["POST"])) return;

    const expected = process.env.BACKFILL_TOKEN?.trim();
    if (!expected) return sendJson(res, 503, { error: "backfill_unconfigured" });
    if (!constantTimeEquals(req.query?.token, expected)) return sendJson(res, 401, { error: "unauthorized" });

    let body;
    try {
      body = await readJson(req, 16 * 1024);
    } catch {
      return sendJson(res, 400, { error: "invalid_json" });
    }

    const ids = Array.isArray(body?.comment_ids) ? body.comment_ids.map(String) : [];
    if (!ids.length || ids.length > MAX_IDS) return sendJson(res, 400, { error: "bad_comment_ids", max: MAX_IDS });

    try {
      const account = await fetchAccount();
      const alreadyReplied = [];
      const clean = [];
      for (const id of ids) {
        try {
          const replies = await fetchReplies(id);
          if (hasReplyFrom(replies, account?.username)) alreadyReplied.push(id);
          else clean.push(id);
        } catch (error) {
          // Unknown beats assuming clean: a wrong guess double-posts in public.
          alreadyReplied.push(id);
          logError("backfill_check_reply", error);
        }
      }
      return sendJson(res, 200, { ok: true, account: account?.username || "", already_replied: alreadyReplied, clean });
    } catch (error) {
      logError("backfill_check", error);
      return sendJson(res, 502, { error: "meta_unavailable" });
    }
  };
}

export default createBackfillCheckHandler();
