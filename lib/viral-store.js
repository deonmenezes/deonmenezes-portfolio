/* Shared storage for /viral: the public feed and leaderboard, in MongoDB.
   Everything here is a no-op until MONGODB_URI is set, so the simulator works
   (browser-only) without it. Only text and numbers are stored here; a public
   post's video lives in Vercel Blob (lib/viral-media.js) and its URL is kept on the post. */

import { logError, requireMethod, sendJson } from "./social/http.js";
import { DEFAULT_PLATFORM, PLATFORMS } from "../viral-platforms.js";

const DATABASE = "willitgoviral";
const COLLECTION = "posts";
const FEED_LIMIT = 40;
const LEADERBOARD_LIMIT = 8;
const LEADERBOARD_DAYS = 7;
const ID_PATTERN = /^[A-Za-z0-9-]{8,40}$/u;
// Instagram and YouTube handles are longer than X's and allow dots and dashes.
const HANDLE_PATTERN = /^[A-Za-z0-9._-]{1,30}$/u;
// X avatars load from X's image hosts; the other platforms' are served by this site.
// A shared video is always a file in this site's own Blob store.
const MEDIA_PATTERN = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/viral\/[A-Za-z0-9-]+\.(?:mp4|webm|mov)$/u;
const AVATAR_PATTERN = /^(?:https:\/\/(?:pbs|abs)\.twimg\.com\/[\w\-./]+|\/api\/viral\/avatar\?platform=(?:instagram|tiktok|youtube)&handle=[\w.%-]{1,90})$/u;

let databasePromise;

export function storeEnabled() {
  return Boolean(process.env.MONGODB_URI?.trim());
}

// The driver is imported lazily so a deployment without MongoDB never loads it.
export async function getDatabase() {
  if (!storeEnabled()) return null;
  databasePromise ??= (async () => {
    const { MongoClient } = await import("mongodb");
    const client = new MongoClient(process.env.MONGODB_URI.trim(), { maxPoolSize: 5, serverSelectionTimeoutMS: 4000 });
    await client.connect();
    const db = client.db(DATABASE);
    const posts = db.collection(COLLECTION);
    await Promise.all([
      posts.createIndex({ clientId: 1 }, { unique: true }),
      posts.createIndex({ platform: 1, createdAt: -1 }),
      posts.createIndex({ platform: 1, viralScore: -1, createdAt: -1 }),
      // Daily lookup counters delete themselves.
      db.collection("lookup_counters").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]);
    return db;
  })().catch((error) => {
    databasePromise = undefined;
    throw error;
  });
  return databasePromise;
}

async function getCollection() {
  const db = await getDatabase();
  return db ? db.collection(COLLECTION) : null;
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
  const { upsertedCount } = await target.updateOne(
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
  // Only the request that created the post published it. Replaying someone
  // else's id changes nothing and must not count: the media key rides on this.
  return upsertedCount === 1;
}

function toPublicPost(doc) {
  return {
    id: doc.clientId,
    platform: doc.platform,
    text: doc.text,
    format: doc.format || undefined,
    attachments: doc.attachments || [],
    mediaUrl: typeof doc.mediaUrl === "string" && MEDIA_PATTERN.test(doc.mediaUrl) ? doc.mediaUrl : undefined,
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
