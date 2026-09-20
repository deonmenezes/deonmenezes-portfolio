/* Public comments on /viral posts.

   These are real comments from visitors, kept apart from the simulated comment
   count Jev predicts. They live on the post's own document (the newest
   MAX_COMMENTS), are fetched only when someone opens them, and like posts they
   accept any handle: the owner chose that knowingly.

   Before a comment is stored Jev is asked the same "would this be reported"
   question a public post gets, and any failure means it is not stored. Comments
   meter their own `comment:*` bucket so a flood of them can never pause scoring.
   A comment can be deleted by whoever wrote it (a key returned when it was
   added) or by the post's author (the post's delete key). */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { query } from "./social/db.js";
import { logError, readJson, requireMethod, sameOrigin, sendJson } from "./social/http.js";
import { callJev, claimRequest, estimateInputTokens, reconcileUsage, requestIp } from "./jev.js";
import { cleanAuthor, getDatabase } from "./viral-store.js";
import { deleteKeyFor } from "./viral-media.js";

const MAX_BODY_BYTES = 4096;
export const MAX_COMMENT_CHARS = 300;
export const MAX_COMMENTS = 100;
const ID_PATTERN = /^[A-Za-z0-9-]{8,40}$/u;
const COMMENT_ID_PATTERN = /^[0-9a-f]{16}$/u;
const MAX_REPORT_PROBABILITY = 0.5;

export const COMMENT_DAILY_PER_NETWORK = 20;
export const COMMENT_BUCKET = {
  globalKey: "comment:*",
  limits: { globalDailyRequests: 400, globalDailyInputTokens: 200_000, globalDailyCostUsd: 0.1 },
};

const QUESTION = {
  report: { type: "boolean", instructions: "Would this comment be reported or removed on a mainstream social platform (spam, scams, harassment, hate, threats, sexual content, doxxing)? Blunt criticism of the post is fine." },
};

export function commentKeyFor(commentId, hashSecret) {
  return createHmac("sha256", hashSecret).update(`comment:${commentId}`).digest("hex");
}

const sameKey = (given, expected) => typeof given === "string" && /^[0-9a-f]{64}$/u.test(given)
  && timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"));

const toPublicComment = (comment) => ({
  id: comment.id,
  text: comment.text,
  name: comment.author?.name,
  handle: comment.author?.handle,
  avatarUrl: comment.author?.avatarUrl || null,
  verified: Boolean(comment.author?.verified),
  createdAt: comment.createdAt instanceof Date ? comment.createdAt.getTime() : Number(comment.createdAt) || 0,
});

export function createViralCommentsHandler({ queryFn = query, fetchFn = (...args) => fetch(...args), getDatabaseFn = getDatabase, retryDelayMs } = {}) {
  return async function handler(req, res) {
    if (!requireMethod(req, res, ["GET", "POST"])) return;

    let posts;
    try {
      const db = await getDatabaseFn();
      if (!db) return sendJson(res, 503, { error: "comments_unavailable" });
      posts = db.collection("posts");
    } catch (error) {
      logError("viral.comments.setup", error);
      return sendJson(res, 503, { error: "comments_unavailable" });
    }

    try {
      if (req.method === "GET") {
        const id = String(req.query?.id || "");
        if (!ID_PATTERN.test(id)) return sendJson(res, 400, { error: "invalid_id" });
        const post = await posts.findOne({ clientId: id }, { projection: { comments: 1 } });
        if (!post) return sendJson(res, 404, { error: "no_such_post" });
        return sendJson(res, 200, { comments: (post.comments || []).map(toPublicComment) });
      }

      if (!sameOrigin(req)) return sendJson(res, 403, { error: "invalid_origin" });
      let body;
      try {
        body = await readJson(req, MAX_BODY_BYTES);
      } catch {
        return sendJson(res, 400, { error: "invalid_json" });
      }
      const hashSecret = process.env.JEV_HASH_SECRET?.trim();
      const gatewayKey = process.env.AI_GATEWAY_API_KEY?.trim();
      if (!hashSecret || !gatewayKey || process.env.VIRAL_COMMENTS?.trim().toLowerCase() === "off") {
        return sendJson(res, 503, { error: "comments_unavailable", message: "Comments are switched off right now." });
      }
      const id = typeof body?.id === "string" && ID_PATTERN.test(body.id) ? body.id : "";
      if (!id) return sendJson(res, 400, { error: "invalid_id" });

      if (body?.action === "delete") {
        const commentId = typeof body?.commentId === "string" && COMMENT_ID_PATTERN.test(body.commentId) ? body.commentId : "";
        const allowed = commentId && (sameKey(body?.deleteKey, commentKeyFor(commentId, hashSecret)) || sameKey(body?.deleteKey, deleteKeyFor(id, hashSecret)));
        if (!allowed) return sendJson(res, 403, { error: "not_yours" });
        await posts.updateOne({ clientId: id }, { $pull: { comments: { id: commentId } } });
        return sendJson(res, 200, { deleted: true });
      }

      const text = typeof body?.text === "string" ? body.text.replace(/[\p{Cc}\s]+/gu, " ").trim() : "";
      if (!text) return sendJson(res, 400, { error: "empty_comment", message: "Write something first." });
      if (text.length > MAX_COMMENT_CHARS) return sendJson(res, 400, { error: "comment_too_long", message: `Keep it under ${MAX_COMMENT_CHARS} characters.` });
      const author = cleanAuthor(body?.author);
      if (!author) return sendJson(res, 400, { error: "invalid_author" });

      const post = await posts.findOne({ clientId: id }, { projection: { text: 1 } });
      if (!post) return sendJson(res, 404, { error: "no_such_post", message: "That post is gone." });

      const state = { comment: text, onPost: String(post.text || "").slice(0, 200) };
      const usageKey = `comment:${createHmac("sha256", hashSecret).update(`ip:${requestIp(req)}`).digest("hex")}`;
      const reservedTokens = estimateInputTokens({ state, questions: QUESTION });
      const claim = await claimRequest(queryFn, { usageKey, reservedTokens, dailyRequests: COMMENT_DAILY_PER_NETWORK, requireKey: false, bucket: COMMENT_BUCKET });
      if (claim?.status !== "ok") {
        res.setHeader("Retry-After", "3600");
        return sendJson(res, 429, { error: claim?.status || "site_limit_reached", message: "That's today's limit for comments. It resets at 00:00 UTC." });
      }

      // Any doubt, including Jev not answering, means the comment is not stored.
      let reportable;
      try {
        const { upstream, payload } = await callJev({ state, questions: QUESTION, gatewayKey, fetchFn, retryDelayMs });
        if (!upstream.ok) throw new Error(`gateway ${upstream.status}`);
        await reconcileUsage(queryFn, { usageKey, reservedTokens, claim, payload, bucket: COMMENT_BUCKET });
        const probability = Number(payload.answers?.report?.probability);
        reportable = !(probability >= 0 && probability < MAX_REPORT_PROBABILITY);
      } catch (error) {
        logError("viral.comments.check", error);
        return sendJson(res, 502, { error: "comment_check_failed", message: "Couldn't check that comment. Try again." });
      }
      if (reportable) return sendJson(res, 422, { error: "comment_refused", message: "That comment looks like one that would be reported, so it wasn't posted." });

      const comment = { id: randomBytes(8).toString("hex"), text, author, createdAt: new Date() };
      const { modifiedCount } = await posts.updateOne({ clientId: id }, { $push: { comments: { $each: [comment], $slice: -MAX_COMMENTS } } });
      if (!modifiedCount) return sendJson(res, 404, { error: "no_such_post", message: "That post is gone." });
      return sendJson(res, 200, { comment: toPublicComment(comment), deleteKey: commentKeyFor(comment.id, hashSecret) });
    } catch (error) {
      logError("viral.comments", error);
      return sendJson(res, 502, { error: "comments_failed" });
    }
  };
}

export const viralCommentsHandler = createViralCommentsHandler();
