/* Sends the backfill, one explicit batch at a time.
 *
 * Every safeguard here exists because a private reply is single use: Meta
 * allows one per comment, ever. A bug that sends the wrong text cannot be
 * corrected by sending again, so the caller must name exactly who to message
 * and the batch is capped hard.
 */

import { timingSafeEqual } from "node:crypto";

import { logError, readJson, requireMethod, sendJson } from "./social/http.js";
import { privateReply } from "./social/meta.js";

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

  return { message, ids };
}

export function createBackfillSendHandler({
  send = privateReply,
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

    for (const [index, commentId] of validated.ids.entries()) {
      if (index > 0) await sleep(GAP_MS);
      try {
        await send(commentId, { text: validated.message });
        sent += 1;
        results.push({ comment_id: commentId, ok: true });
      } catch (error) {
        failed += 1;
        results.push({
          comment_id: commentId,
          ok: false,
          error: String(error?.message || "send_failed").slice(0, 160),
        });
        logError("backfill_send", error);
      }
    }

    console.log(JSON.stringify({ level: "info", scope: "backfill_send", sent, failed, at: new Date().toISOString() }));
    return sendJson(res, 200, { ok: true, sent, failed, results });
  };
}

export default createBackfillSendHandler();
