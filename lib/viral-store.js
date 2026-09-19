/* Shared storage for /viral: the public feed and leaderboard, in MongoDB.
   Everything here is a no-op until MONGODB_URI is set, so the simulator works
   (browser-only) without it. Media is never uploaded; only text and numbers are. */

import { logError, requireMethod, sendJson } from "./social/http.js";
import { DEFAULT_PLATFORM, PLATFORMS } from "../viral-platforms.js";

const DATABASE = "willitgoviral";
const COLLECTION = "posts";
const FEED_LIMIT = 40;
const LEADERBOARD_LIMIT = 8;
const LEADERBOARD_DAYS = 7;
const ID_PATTERN = /^[A-Za-z0-9-]{8,40}$/u;
const HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/u;
const AVATAR_PATTERN = /^https:\/\/(?:pbs|abs)\.twimg\.com\/[\w\-./]+$/u;

let collectionPromise;

export function storeEnabled() {
  return Boolean(process.env.MONGODB_URI?.trim());
}

// The driver is imported lazily so a deployment without MongoDB never loads it.
async function getCollection() {
  if (!storeEnabled()) return null;
  collectionPromise ??= (async () => {
    const { MongoClient } = await import("mongodb");
    const client = new MongoClient(process.env.MONGODB_URI.trim(), { maxPoolSize: 5, serverSelectionTimeoutMS: 4000 });
    await client.connect();
    const collection = client.db(DATABASE).collection(COLLECTION);
    await Promise.all([
      collection.createIndex({ clientId: 1 }, { unique: true }),
      collection.createIndex({ platform: 1, createdAt: -1 }),
      collection.createIndex({ platform: 1, viralScore: -1, createdAt: -1 }),
    ]);
    return collection;
  })().catch((error) => {
    collectionPromise = undefined;
    throw error;
  });
  return collectionPromise;
}

/** The visitor tells us who they are, so keep only well-formed, harmless fields. */
export function cleanAuthor(author) {
  if (!author || typeof author.handle !== "string" || !HANDLE_PATTERN.test(author.handle)) return null;
  return {
    handle: author.handle,
    name: String(author.name || author.handle).slice(0, 60),
    avatarUrl: typeof author.avatarUrl === "string" && AVATAR_PATTERN.test(author.avatarUrl) ? author.avatarUrl : null,
    verified: Boolean(author.verified),
  };
}

export async function savePost({ id, platform, text, extra, format, attachments, poll, author, scored }, { collection } = {}) {
  if (!ID_PATTERN.test(id)) return false;
  const target = collection ?? await getCollection();
  if (!target) return false;
  await target.updateOne(
    { clientId: id },
    {
      $setOnInsert: {
        clientId: id,
        platform,
        text,
        extra: extra || null,
        format: format || null,
        attachments,
        poll: poll.length >= 2 ? poll : [],
        author,
        viralScore: scored.viralScore,
        verdict: scored.verdict,
        metrics: scored.metrics,
        hook: scored.hook,
        emotion: scored.emotion,
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );
  return true;
}

function toPublicPost(doc) {
  return {
    id: doc.clientId,
    platform: doc.platform,
    text: doc.text,
    format: doc.format || undefined,
    attachments: doc.attachments || [],
    poll: doc.poll?.length >= 2 ? doc.poll : undefined,
    name: doc.author?.name,
    handle: doc.author?.handle,
    avatarUrl: doc.author?.avatarUrl || null,
    verified: Boolean(doc.author?.verified),
    viralScore: doc.viralScore,
    verdict: doc.verdict,
    metrics: doc.metrics,
    hook: doc.hook,
    emotion: doc.emotion,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.getTime() : Date.now(),
  };
}

export function createViralFeedHandler({ getCollectionFn = getCollection } = {}) {
  return async function handler(req, res) {
    if (!requireMethod(req, res, ["GET"])) return;
    const platform = Object.hasOwn(PLATFORMS, String(req.query?.platform)) ? String(req.query.platform) : DEFAULT_PLATFORM;

    let collection;
    try {
      collection = await getCollectionFn();
    } catch (error) {
      logError("viral.feed", error);
      return sendJson(res, 502, { error: "feed_unavailable" });
    }
    if (!collection) return sendJson(res, 200, { enabled: false, posts: [], leaderboard: [] });

    try {
      const since = new Date(Date.now() - LEADERBOARD_DAYS * 86_400_000);
      const [recent, top] = await Promise.all([
        collection.find({ platform }).sort({ createdAt: -1 }).limit(FEED_LIMIT).toArray(),
        collection.find({ platform, createdAt: { $gte: since } }).sort({ viralScore: -1, createdAt: -1 }).limit(LEADERBOARD_LIMIT).toArray(),
      ]);
      // Not sendJson: a few seconds of CDN caching absorbs a traffic spike.
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=5, stale-while-revalidate=30");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.status(200).json({ enabled: true, posts: recent.map(toPublicPost), leaderboard: top.map(toPublicPost) });
    } catch (error) {
      logError("viral.feed", error);
      sendJson(res, 502, { error: "feed_unavailable" });
    }
  };
}

export const viralFeedHandler = createViralFeedHandler();
