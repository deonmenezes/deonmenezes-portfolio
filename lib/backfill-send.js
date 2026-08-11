/* Sends the backfill, one explicit batch at a time.
 *
 * Every safeguard here exists because a private reply is single use: Meta
 * allows one per comment, ever. A bug that sends the wrong text cannot be
 * corrected by sending again, so the caller must name exactly who to message
 * and the batch is capped hard.
 */

import { timingSafeEqual } from "node:crypto";

import { logError, readJson, requireMethod, sendJson } from "./social/http.js";
import { privateReply, replyToComment } from "./social/meta.js";

export const MAX_BATCH = 25;
const MAX_BODY_BYTES = 16 * 1024;
const GAP_MS = 400;

function constantTimeEquals(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

export function validateBatch(body) {
  const message = String(body?.message || "").trim();
  if (message.length < 10) return { error: "message_too_short" };
  if (message.length > 900) return { error: "message_too_long" };

  const ids = Array.isArray(body?.comment_ids) ? body.comment_ids.map((id) => String(id).trim()).filter(Boolean) : [];
  if (!ids.length) return { error: "no_comment_ids" };
  if (ids.length > MAX_BATCH) return { error: "batch_too_large" };
  if (!ids.every((id) => /^\d+$/u.test(id))) return { error: "invalid_comment_id" };
  if (new Set(ids).size !== ids.length) return { error: "duplicate_comment_ids" };

  // Two public texts, because the DM only reaches people who follow you.
  // Announcing "sent it to your DMs" under a comment whose DM was refused
  // would be a false claim posted publicly, so the delivered reply follows
  // what actually happened.
  const publicOnSent = String(body?.public_on_sent || "").trim();
  const publicOnFailed = String(body?.public_on_failed || "").trim();
  if (publicOnSent && publicOnSent.length > 280) return { error: "public_on_sent_too_long" };
  if (publicOnFailed && publicOnFailed.length > 280) return { error: "public_on_failed_too_long" };
  if (publicOnFailed && !publicOnSent) return { error: "public_on_sent_required" };

  return { message, ids, publicOnSent, publicOnFailed };
}

export function createBackfillSendHandler({
  send = privateReply,
  replyPublicly = replyToComment,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  return async function handler(req, res) {
    if (!requireMethod(req, res, ["POST"])) return;

    const expected = process.env.BACKFILL_TOKEN?.trim();
    if (!expected) return sendJson(res, 503, { error: "backfill_unconfigured" });
    if (!constantTimeEquals(req.query?.token, expected)) return sendJson(res, 401, { error: "unauthorized" });

    let body;
    try {
      body = await readJson(req, MAX_BODY_BYTES);
    } catch {
      return sendJson(res, 400, { error: "invalid_json" });
    }

    const validated = validateBatch(body);
    if (validated.error) return sendJson(res, 400, { error: validated.error, max_batch: MAX_BATCH });

    const results = [];
    let sent = 0;
    let failed = 0;
    let replied = 0;
    let replyFailed = 0;

    for (const [index, commentId] of validated.ids.entries()) {
      if (index > 0) await sleep(GAP_MS);

      const result = { comment_id: commentId, ok: false };
      try {
        await send(commentId, { text: validated.message });
        result.ok = true;
        sent += 1;
      } catch (error) {
        failed += 1;
        result.error = String(error?.message || "send_failed").slice(0, 160);
        logError("backfill_send", error);
      }

      const publicText = result.ok ? validated.publicOnSent : validated.publicOnFailed;
      if (publicText) {
        try {
          await replyPublicly(commentId, publicText);
          result.replied = true;
          replied += 1;
        } catch (error) {
          result.replied = false;
          result.reply_error = String(error?.message || "reply_failed").slice(0, 160);
          replyFailed += 1;
          logError("backfill_public_reply", error);
        }
      }

      results.push(result);
    }

    console.log(JSON.stringify({
      level: "info", scope: "backfill_send", sent, failed, replied, replyFailed, at: new Date().toISOString(),
    }));
    return sendJson(res, 200, { ok: true, sent, failed, replied, reply_failed: replyFailed, results });
  };
}

export default createBackfillSendHandler();
