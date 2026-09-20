/* Instagram, TikTok, and YouTube profile lookup for /viral, through Apify.
   Apify bills per run and the account has a small monthly allowance, so every
   lookup is cached in MongoDB for a week and new lookups are capped per network
   and per day. Without MongoDB there is no cache and no cap, so the lookup is off.

   Profile photos are copied into the cache and served from /api/viral/avatar:
   Instagram and TikTok sign their image URLs to expire and refuse to load on
   other sites, so hot-linking them would break within hours. */

import { createHmac } from "node:crypto";
import { logError, sendJson } from "./social/http.js";
import { requestIp } from "./jev.js";
import { getDatabase } from "./viral-store.js";

const CACHE_DAYS = 7;
const LOOKUPS_PER_NETWORK_PER_DAY = 8;
const LOOKUPS_PER_DAY = 120;
const APIFY_TIMEOUT_SECONDS = 50;
const MAX_AVATAR_BYTES = 400 * 1024;

export const SOCIAL_PLATFORMS = {
  instagram: {
    handle: /^[A-Za-z0-9._]{1,30}$/u,
    actor: "apify~instagram-profile-scraper",
    input: (handle) => ({ usernames: [handle] }),
    avatarHosts: [".cdninstagram.com", ".fbcdn.net"],
    parse: ([item]) => item?.username && {
      handle: item.username,
      name: item.fullName || item.username,
      followers: item.followersCount,
      verified: item.verified,
      avatar: item.profilePicUrlHD || item.profilePicUrl,
      bio: item.biography,
      category: item.businessCategoryName,
      // The same run returns the latest posts, so the track record costs nothing extra.
      recent: (Array.isArray(item.latestPosts) ? item.latestPosts : []).slice(0, 12).map((post) => ({ likes: post.likesCount, views: post.videoViewCount ?? post.videoPlayCount })),
    },
  },
  tiktok: {
    handle: /^[A-Za-z0-9._]{2,24}$/u,
    actor: "clockworks~tiktok-profile-scraper",
    input: (handle) => ({ profiles: [handle], resultsPerPage: 1, shouldDownloadVideos: false, shouldDownloadCovers: false }),
    avatarHosts: [".tiktokcdn.com", ".tiktokcdn-us.com", ".tiktokcdn-eu.com"],
    parse: ([item]) => item?.authorMeta?.name && {
      handle: item.authorMeta.name,
      name: item.authorMeta.nickName || item.authorMeta.name,
      followers: item.authorMeta.fans,
      verified: item.authorMeta.verified,
      avatar: item.authorMeta.originalAvatarUrl || item.authorMeta.avatar,
      bio: item.authorMeta.signature,
      // One video is fetched (each more is billed), so the track record is the account's lifetime average.
      lifetime: { posts: item.authorMeta.video, likes: item.authorMeta.heart },
      recent: [{ likes: item.diggCount, views: item.playCount }],
    },
  },
  youtube: {
    handle: /^[A-Za-z0-9._-]{3,30}$/u,
    actor: "streamers~youtube-channel-scraper",
    input: (handle) => ({ startUrls: [{ url: `https://www.youtube.com/@${handle}` }], maxResults: 1, maxResultsShorts: 0, maxResultStreams: 0 }),
    avatarHosts: [".googleusercontent.com", ".ggpht.com"],
    parse: ([item]) => item?.channelName && {
      handle: item.channelUsername || item.channelName,
      name: item.channelName,
      followers: item.numberOfSubscribers,
      verified: item.isChannelVerified,
      avatar: item.channelAvatarUrl,
      bio: item.channelDescription,
      lifetime: { posts: item.channelTotalVideos, views: item.channelTotalViews },
      recent: [{ likes: item.likes, views: item.viewCount }],
    },
  },
};

const count = (value) => {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : null;
};
const median = (values) => {
  const sorted = values.filter((value) => value != null).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
};
const oneLine = (value, limit) => String(value || "").replace(/[\p{Cc}\s]+/gu, " ").trim().slice(0, limit);

/** What is kept about an account besides its size: who they say they are, and how their posts have done. */
export function creatorContext(found, followers) {
  const recent = (Array.isArray(found.recent) ? found.recent : []).map((post) => ({ likes: count(post?.likes), views: count(post?.views) }));
  const views = recent.map((post) => post.views).filter((value) => value != null);
  const posts = count(found.lifetime?.posts);
  const per = (total) => (posts && count(total) != null ? Math.round(count(total) / posts) : null);
  return {
    bio: oneLine(found.bio, 200),
    category: oneLine(found.category, 60),
    recentPosts: recent.length,
    medianLikes: median(recent.map((post) => post.likes)),
    recentVideos: views.length,
    medianViews: median(views),
    // A breakout: a video seen by more people than follow the account.
    breakouts: followers ? views.filter((value) => value > followers).length : null,
    lifetimePosts: posts,
    likesPerPost: per(found.lifetime?.likes),
    viewsPerPost: per(found.lifetime?.views),
  };
}

export const avatarPath = (platform, handle) => `/api/viral/avatar?platform=${platform}&handle=${encodeURIComponent(handle)}`;
const cacheId = (platform, handle) => `${platform}:${handle.toLowerCase()}`;

// Only ever fetch an avatar from the platform's own image hosts, over https.
export function isAllowedAvatar(url, hosts) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && hosts.some((host) => parsed.hostname.endsWith(host));
  } catch {
    return false;
  }
}

async function downloadAvatar(url, hosts, fetchFn) {
  if (!isAllowedAvatar(url, hosts)) return null;
  try {
    const response = await fetchFn(url, { signal: AbortSignal.timeout(8000), redirect: "error" });
    const type = String(response.headers.get("content-type") || "").split(";")[0].trim();
    if (!response.ok || !/^image\/(?:jpeg|png|webp)$/u.test(type)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length && bytes.length <= MAX_AVATAR_BYTES ? { type, data: bytes.toString("base64") } : null;
  } catch {
    return null;
  }
}

function toPublicProfile(platform, doc) {
  return {
    handle: doc.handle,
    name: doc.name,
    avatarUrl: doc.avatar ? avatarPath(platform, doc.handle) : null,
    verified: Boolean(doc.verified),
    followers: doc.followers,
  };
}

// Counts a lookup against this network and the whole site for today, and says
// whether both are still under their cap. The counters expire on their own.
async function underLookupCaps(db, req) {
  const day = new Date().toISOString().slice(0, 10);
  const network = createHmac("sha256", process.env.JEV_HASH_SECRET || "viral").update(`ip:${requestIp(req)}`).digest("hex").slice(0, 32);
  const counters = db.collection("lookup_counters");
  const bump = (id) => counters.findOneAndUpdate(
    { _id: id },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(Date.now() + 2 * 86_400_000) } },
    { upsert: true, returnDocument: "after" },
  );
  const [mine, everyone] = await Promise.all([bump(`${day}:${network}`), bump(`${day}:all`)]);
  return (mine?.count ?? 1) <= LOOKUPS_PER_NETWORK_PER_DAY && (everyone?.count ?? 1) <= LOOKUPS_PER_DAY;
}

export function createSocialProfileLookup({ fetchFn = (...args) => fetch(...args), getDatabaseFn = getDatabase } = {}) {
  return async function lookup(req, res, platform, rawHandle) {
    const config = SOCIAL_PLATFORMS[platform];
    const handle = String(rawHandle || "").replace(/^@/u, "");
    if (!config.handle.test(handle)) return sendJson(res, 400, { error: "invalid_handle" });

    const token = process.env.APIFY_TOKEN?.trim();
    let db;
    try {
      db = await getDatabaseFn();
    } catch (error) {
      logError("viral.social", error);
    }
    if (!token || !db) return sendJson(res, 503, { error: "lookup_unavailable" });

    try {
      const profiles = db.collection("profiles");
      const cached = await profiles.findOne({ _id: cacheId(platform, handle) });
      // A profile cached before the track record was kept is fetched once more, caps allowing.
      const fresh = cached && cached.fetchedAt > new Date(Date.now() - CACHE_DAYS * 86_400_000);
      const complete = cached && (cached.missing || cached.context);
      let allowed;
      if (fresh && !complete) allowed = await underLookupCaps(db, req);
      if (fresh && (complete || !allowed)) {
        if (cached.missing) return sendJson(res, 404, { error: "not_found" });
        return sendJson(res, 200, { profile: toPublicProfile(platform, cached) });
      }

      if (!(allowed ?? await underLookupCaps(db, req))) {
        res.setHeader("Retry-After", "3600");
        return sendJson(res, 429, { error: "too_many_lookups" });
      }

      const run = await fetchFn(`https://api.apify.com/v2/acts/${config.actor}/run-sync-get-dataset-items?timeout=${APIFY_TIMEOUT_SECONDS}`, {
        method: "POST",
        signal: AbortSignal.timeout((APIFY_TIMEOUT_SECONDS + 5) * 1000),
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(config.input(handle)),
      });
      if (!run.ok) throw new Error(`apify ${run.status}`);
      const items = await run.json();
      const found = Array.isArray(items) ? config.parse(items) : null;

      // A miss is cached too, so a typo can't be used to burn the allowance.
      if (!found || String(found.handle).toLowerCase() !== handle.toLowerCase()) {
        await profiles.updateOne({ _id: cacheId(platform, handle) }, { $set: { platform, missing: true, fetchedAt: new Date() } }, { upsert: true });
        return sendJson(res, 404, { error: "not_found" });
      }

      const followers = Math.floor(Number(found.followers));
      const doc = {
        platform,
        handle: String(found.handle).slice(0, 30),
        name: String(found.name || found.handle).slice(0, 60),
        followers: Number.isFinite(followers) && followers >= 0 ? followers : null,
        verified: Boolean(found.verified),
        context: creatorContext(found, Number.isFinite(followers) && followers >= 0 ? followers : null),
        avatar: await downloadAvatar(found.avatar, config.avatarHosts, fetchFn),
        missing: false,
        fetchedAt: new Date(),
      };
      await profiles.updateOne({ _id: cacheId(platform, handle) }, { $set: doc }, { upsert: true });
      return sendJson(res, 200, { profile: toPublicProfile(platform, doc) });
    } catch (error) {
      logError("viral.social", error);
      return sendJson(res, 502, { error: "lookup_failed" });
    }
  };
}

/** The cached account behind a handle, for the scoring request. Never scrapes; null when unknown. */
export async function cachedCreator(platform, handle, { getDatabaseFn = getDatabase } = {}) {
  const config = Object.hasOwn(SOCIAL_PLATFORMS, platform) ? SOCIAL_PLATFORMS[platform] : null;
  if (!config || typeof handle !== "string" || !config.handle.test(handle)) return null;
  try {
    const db = await getDatabaseFn();
    const doc = db && await db.collection("profiles").findOne({ _id: cacheId(platform, handle) }, { projection: { followers: 1, verified: 1, context: 1, missing: 1 } });
    return doc && !doc.missing ? { followers: doc.followers, verified: Boolean(doc.verified), ...doc.context } : null;
  } catch (error) {
    logError("viral.creator", error);
    return null;
  }
}

export function createViralAvatarHandler({ getDatabaseFn = getDatabase } = {}) {
  return async function handler(req, res) {
    const platform = String(req.query?.platform || "");
    const handle = String(req.query?.handle || "");
    const config = Object.hasOwn(SOCIAL_PLATFORMS, platform) ? SOCIAL_PLATFORMS[platform] : null;
    if (req.method !== "GET" || !config || !config.handle.test(handle)) return sendJson(res, 404, { error: "not_found" });

    try {
      const db = await getDatabaseFn();
      const doc = db && await db.collection("profiles").findOne({ _id: cacheId(platform, handle) }, { projection: { avatar: 1 } });
      if (!doc?.avatar?.data || !/^image\/(?:jpeg|png|webp)$/u.test(doc.avatar.type)) return sendJson(res, 404, { error: "not_found" });
      res.setHeader("Content-Type", doc.avatar.type);
      res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'");
      res.status(200).end(Buffer.from(doc.avatar.data, "base64"));
    } catch (error) {
      logError("viral.avatar", error);
      sendJson(res, 502, { error: "avatar_unavailable" });
    }
  };
}

export const lookupSocialProfile = createSocialProfileLookup();
export const viralAvatarHandler = createViralAvatarHandler();
