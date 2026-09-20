/* Public videos for /viral, in Vercel Blob.

   A public post's video is uploaded so other visitors can play it (the owner
   asked for this on 2026-09-20; before then no file ever left the browser).
   The file is too big to pass through a function, so the browser sends it
   straight to Blob with a short-lived token from here.

   Who may upload: only the visitor who just published the post. /api/viral
   hands them a mediaKey (an HMAC of the post id) with the result of the request
   that created the post, never a replay of its id, and both steps below demand
   it, so nobody can hang a video on someone else's post. A post gets one grant,
   for one exact path that cannot be overwritten, and only that path attaches.

   What it can cost: each video is capped in size, each network and the whole
   site are capped per day (their own `media:*` usage bucket, counted in
   kilobytes where Jev counts tokens), and the store has a fixed byte budget:
   when an uploaded video would pass it, the oldest videos are deleted and those
   posts fall back to their cover. A grant that is never attached is swept up,
   file and all, after half an hour. VIRAL_MEDIA=off disables all of it. */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { query } from "./social/db.js";
import { logError, readJson, requireMethod, sameOrigin, sendJson } from "./social/http.js";
import { claimRequest, requestIp } from "./jev.js";
import { getDatabase } from "./viral-store.js";

const MAX_BODY_BYTES = 2048;
const ID_PATTERN = /^[A-Za-z0-9-]{8,40}$/u;
const PATH_PATTERN = /^viral\/[A-Za-z0-9-]+\.(?:mp4|webm|mov)$/u;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const VIDEO_TYPES = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
const TOKEN_LIFETIME_MS = 10 * 60_000;
export const ABANDONED_AFTER_MS = 30 * 60_000;
const DEFAULT_STORE_BUDGET_MB = 900;

export const MEDIA_DAILY_UPLOADS_PER_NETWORK = 3;
// "Tokens" in this bucket are kilobytes: 25 uploads and 700 MB a day, site-wide. Nothing here is billed per call.
export const MEDIA_BUCKET = {
  globalKey: "media:*",
  limits: { globalDailyRequests: 25, globalDailyInputTokens: 700 * 1024, globalDailyCostUsd: 1 },
};

export function mediaEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim()) && process.env.VIRAL_MEDIA?.trim().toLowerCase() !== "off";
}

/** Proof that the caller published this post. Handed out once, with the published result. */
export function mediaKeyFor(id, hashSecret) {
  return createHmac("sha256", hashSecret).update(`media:${id}`).digest("hex");
}

function keyMatches(id, key, hashSecret) {
  if (typeof key !== "string" || !/^[0-9a-f]{64}$/u.test(key)) return false;
  return timingSafeEqual(Buffer.from(key, "hex"), Buffer.from(mediaKeyFor(id, hashSecret), "hex"));
}

// vercel_blob_rw_<storeId>_<secret>: public files are served from <storeId>.public.blob.vercel-storage.com.
function storeHost() {
  const storeId = process.env.BLOB_READ_WRITE_TOKEN?.trim().split("_")[3];
  return storeId ? `${storeId.toLowerCase()}.public.blob.vercel-storage.com` : null;
}

/** A video URL is only ever the one exact file this post was granted, in this site's store. */
export function isOwnMediaUrl(value, grantedPath, host = storeHost()) {
  if (typeof value !== "string" || typeof grantedPath !== "string" || !host) return false;
  return PATH_PATTERN.test(grantedPath) && value === `https://${host}/${grantedPath}`;
}

async function forget(posts, post, delFn) {
  const host = storeHost();
  if (host && post.mediaPath) await delFn(`https://${host}/${post.mediaPath}`);
  await posts.updateOne({ clientId: post.clientId }, { $unset: { mediaUrl: "", mediaPath: "", mediaBytes: "", mediaAt: "" } });
}

// A grant whose upload never arrived, or arrived and was never attached: remove the file and the claim.
async function sweepAbandoned(posts, { delFn }, now) {
  const abandoned = await posts
    .find({ mediaPath: { $type: "string" }, mediaUrl: { $exists: false }, mediaAt: { $lt: new Date(now - ABANDONED_AFTER_MS) } }, { projection: { clientId: 1, mediaPath: 1 } })
    .sort({ mediaAt: 1 }).limit(50).toArray();
  for (const post of abandoned) await forget(posts, post, delFn);
}

// Keep the store inside its budget by dropping the oldest attached videos first.
// Runs when a real upload lands, so an empty grant can never push anyone's video out.
async function makeRoom(posts, incomingBytes, keepId, { delFn }) {
  const budget = (Number(process.env.VIRAL_MEDIA_BUDGET_MB) || DEFAULT_STORE_BUDGET_MB) * 1024 * 1024;
  const stored = (await posts
    .find({ mediaUrl: { $type: "string" } }, { projection: { clientId: 1, mediaPath: 1, mediaBytes: 1 } })
    .sort({ mediaAt: 1 }).limit(500).toArray()).filter((post) => post.clientId !== keepId);
  let total = stored.reduce((sum, post) => sum + (Number(post.mediaBytes) || 0), 0);
  for (const post of stored) {
    if (total + incomingBytes <= budget) break;
    total -= Number(post.mediaBytes) || 0;
    await forget(posts, post, delFn);
  }
}

async function blobSdk() {
  const [{ del, head }, { generateClientTokenFromReadWriteToken }] = await Promise.all([import("@vercel/blob"), import("@vercel/blob/client")]);
  return { delFn: del, headFn: head, tokenFn: generateClientTokenFromReadWriteToken };
}

export function createViralMediaHandler({ queryFn = query, getDatabaseFn = getDatabase, sdkFn = blobSdk, nowFn = Date.now } = {}) {
  return async function handler(req, res) {
    if (!requireMethod(req, res, ["POST"])) return;
    if (!sameOrigin(req)) return sendJson(res, 403, { error: "invalid_origin" });

    let body;
    try {
      body = await readJson(req, MAX_BODY_BYTES);
    } catch {
      return sendJson(res, 400, { error: "invalid_json" });
    }

    const hashSecret = process.env.JEV_HASH_SECRET?.trim();
    if (!mediaEnabled() || !hashSecret) return sendJson(res, 503, { error: "media_unavailable", message: "Video sharing is switched off right now." });

    const id = typeof body?.id === "string" && ID_PATTERN.test(body.id) ? body.id : "";
    if (!id || !keyMatches(id, body?.mediaKey, hashSecret)) return sendJson(res, 403, { error: "not_your_post" });

    let posts;
    let sdk;
    try {
      const db = await getDatabaseFn();
      if (!db) return sendJson(res, 503, { error: "media_unavailable" });
      posts = db.collection("posts");
      sdk = await sdkFn();
    } catch (error) {
      logError("viral.media.setup", error);
      return sendJson(res, 503, { error: "media_unavailable" });
    }

    try {
      const now = nowFn();
      await sweepAbandoned(posts, sdk, now);
      const post = await posts.findOne({ clientId: id }, { projection: { clientId: 1, attachments: 1, mediaUrl: 1, mediaPath: 1 } });
      if (!post || !post.attachments?.includes("video")) return sendJson(res, 404, { error: "no_such_post" });
      if (post.mediaUrl) return sendJson(res, 409, { error: "already_attached" });

      if (body?.action === "attach") {
        if (!isOwnMediaUrl(body?.url, post.mediaPath)) return sendJson(res, 400, { error: "invalid_url" });
        const blob = await sdk.headFn(body.url);
        if (blob.size > MAX_VIDEO_BYTES || !Object.hasOwn(VIDEO_TYPES, blob.contentType)) {
          await forget(posts, post, sdk.delFn);
          return sendJson(res, 400, { error: "invalid_video" });
        }
        await makeRoom(posts, blob.size, id, sdk);
        // A second attach for the same post names the same file, so losing the race deletes nothing.
        const { modifiedCount } = await posts.updateOne(
          { clientId: id, mediaPath: post.mediaPath, mediaUrl: { $exists: false } },
          { $set: { mediaUrl: body.url, mediaBytes: blob.size, mediaAt: new Date(now) } },
        );
        return sendJson(res, modifiedCount ? 200 : 409, modifiedCount ? { mediaUrl: body.url } : { error: "already_attached" });
      }

      if (post.mediaPath) return sendJson(res, 409, { error: "already_granted" });
      const contentType = String(body?.contentType || "").split(";")[0].trim().toLowerCase();
      const size = Math.floor(Number(body?.size));
      if (!Object.hasOwn(VIDEO_TYPES, contentType)) return sendJson(res, 400, { error: "unsupported_type", message: "Only MP4, WebM, and MOV videos can be shared." });
      if (!(size > 0 && size <= MAX_VIDEO_BYTES)) return sendJson(res, 413, { error: "video_too_large", message: "Videos over 50 MB stay on your device." });

      const usageKey = `media:${createHmac("sha256", hashSecret).update(`ip:${requestIp(req)}`).digest("hex")}`;
      const claim = await claimRequest(queryFn, { usageKey, reservedTokens: Math.ceil(size / 1024), dailyRequests: MEDIA_DAILY_UPLOADS_PER_NETWORK, requireKey: false, bucket: MEDIA_BUCKET });
      if (claim?.status !== "ok") {
        res.setHeader("Retry-After", "3600");
        return sendJson(res, 429, { error: claim?.status || "site_limit_reached", message: "That's today's limit for shared videos. This one stays on your device." });
      }

      // One exact, unguessable path per post, written once: a replayed token has nowhere new to write.
      const pathname = `viral/${id}-${randomBytes(12).toString("hex")}.${VIDEO_TYPES[contentType]}`;
      const { modifiedCount } = await posts.updateOne(
        { clientId: id, mediaPath: { $exists: false }, mediaUrl: { $exists: false } },
        { $set: { mediaPath: pathname, mediaBytes: size, mediaAt: new Date(now) } },
      );
      if (!modifiedCount) return sendJson(res, 409, { error: "already_granted" });
      const token = await sdk.tokenFn({
        pathname,
        maximumSizeInBytes: size,
        allowedContentTypes: [contentType],
        addRandomSuffix: false,
        allowOverwrite: false,
        validUntil: now + TOKEN_LIFETIME_MS,
      });
      return sendJson(res, 200, { token, pathname, contentType });
    } catch (error) {
      logError("viral.media", error);
      return sendJson(res, 502, { error: "media_failed" });
    }
  };
}

export const viralMediaHandler = createViralMediaHandler();

/* Deleting a public post. Like the media key, the delete key is an HMAC of the
   post id that /api/viral hands only to the request that created the post; the
   browser keeps it with its copy of the post. The post's video goes with it. */

export function deleteKeyFor(id, hashSecret) {
  return createHmac("sha256", hashSecret).update(`delete:${id}`).digest("hex");
}

export function createViralDeleteHandler({ getDatabaseFn = getDatabase, sdkFn = blobSdk } = {}) {
  return async function handler(req, res) {
    if (!requireMethod(req, res, ["POST"])) return;
    if (!sameOrigin(req)) return sendJson(res, 403, { error: "invalid_origin" });

    let body;
    try {
      body = await readJson(req, MAX_BODY_BYTES);
    } catch {
      return sendJson(res, 400, { error: "invalid_json" });
    }
    const hashSecret = process.env.JEV_HASH_SECRET?.trim();
    if (!hashSecret) return sendJson(res, 503, { error: "delete_unavailable" });
    const id = typeof body?.id === "string" && ID_PATTERN.test(body.id) ? body.id : "";

    // Anyone may report a post, once per network. Enough reports hide it from the feed (see viral-store.js).
    if (body?.action === "report") {
      if (!id) return sendJson(res, 400, { error: "invalid_id" });
      try {
        const db = await getDatabaseFn();
        if (!db) return sendJson(res, 503, { error: "delete_unavailable" });
        const network = createHmac("sha256", hashSecret).update(`report:${requestIp(req)}`).digest("hex").slice(0, 24);
        await db.collection("posts").updateOne(
          { clientId: id, reportedBy: { $ne: network }, $or: [{ reports: { $exists: false } }, { reports: { $lt: 50 } }] },
          { $inc: { reports: 1 }, $push: { reportedBy: network } },
        );
        return sendJson(res, 200, { reported: true });
      } catch (error) {
        logError("viral.report", error);
        return sendJson(res, 502, { error: "report_failed" });
      }
    }

    const key = body?.deleteKey;
    if (!id || typeof key !== "string" || !/^[0-9a-f]{64}$/u.test(key)
      || !timingSafeEqual(Buffer.from(key, "hex"), Buffer.from(deleteKeyFor(id, hashSecret), "hex"))) {
      return sendJson(res, 403, { error: "not_your_post" });
    }

    try {
      const db = await getDatabaseFn();
      if (!db) return sendJson(res, 503, { error: "delete_unavailable" });
      const posts = db.collection("posts");
      const post = await posts.findOne({ clientId: id }, { projection: { clientId: 1, mediaPath: 1 } });
      if (post?.mediaPath && storeHost()) await (await sdkFn()).delFn(`https://${storeHost()}/${post.mediaPath}`);
      await posts.deleteOne({ clientId: id });
      return sendJson(res, 200, { deleted: true });
    } catch (error) {
      logError("viral.delete", error);
      return sendJson(res, 502, { error: "delete_failed" });
    }
  };
}

export const viralDeleteHandler = createViralDeleteHandler();
