/* Live "trending now" topics for /viral, beside the hand-researched list in
   viral-trends.js.

   Sources, and what each is worth:
   - Google "Trending now" for the US and India: Google's own public RSS feed,
     free, dependable. What people are searching for today.
   - TikTok trending hashtags (US): Apify actor clockworks~tiktok-trends-scraper,
     which reads TikTok's Creative Center. About $0.035 a run.
   - Instagram: Instagram publishes NO trending feed. The one Apify actor that
     claims to read its "trending surface" (s-r~instagram-trending-scraper) is
     small and unproven, so its topics are labelled experimental. About $0.02 a run.

   Apify credit is shared with profile lookups ($5 a month in all), so each
   source refreshes at most once per its interval no matter how many visitors
   ask: the next allowed time is claimed atomically in Mongo BEFORE the run, and
   every run carries a hard charge ceiling. A failed run keeps the old topics.
   VIRAL_LIVE_TRENDS=off disables the paid sources; Google stays on. */

import { logError, requireMethod, sendJson } from "./social/http.js";
import { getDatabase } from "./viral-store.js";

const HOUR = 3_600_000;
const MAX_TOPIC_CHARS = 80;
const MAX_PER_SOURCE = 10;
const KEEP_FOR_MS = 4 * 24 * HOUR;
const APIFY_TIMEOUT_SECONDS = 45;
const RETRY_AFTER_MS = 12 * HOUR;

const tidy = (value) => String(value ?? "").replace(/[\p{Cc}\s]+/gu, " ").replace(/[<>]/gu, "").trim().slice(0, MAX_TOPIC_CHARS).trim();
const unescapeXml = (value) => value.replace(/&amp;/gu, "&").replace(/&apos;/gu, "'").replace(/&quot;/gu, '"').replace(/&lt;/gu, "").replace(/&gt;/gu, "");

/** Google's feed: each item is a search term, made readable with its first headline. */
export function parseGoogleTrends(xml, place) {
  const topics = [];
  for (const [, item] of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gu)) {
    const query = unescapeXml(item.match(/<title>([^<]*)<\/title>/u)?.[1] || "");
    const headline = unescapeXml(item.match(/<ht:news_item_title>([^<]*)<\/ht:news_item_title>/u)?.[1] || "");
    const text = tidy(headline ? `${query}: ${headline}` : query);
    const suffix = ` (${place})`;
    if (text) topics.push(`${text.slice(0, MAX_TOPIC_CHARS - suffix.length).trim()}${suffix}`);
    if (topics.length === MAX_PER_SOURCE) break;
  }
  return topics;
}

async function google(fetchFn) {
  const feeds = await Promise.all([["US", "US"], ["IN", "India"]].map(async ([geo, place]) => {
    const response = await fetchFn(`https://trends.google.com/trending/rss?geo=${geo}`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`google trends ${response.status}`);
    return parseGoogleTrends(await response.text(), place).slice(0, MAX_PER_SOURCE / 2);
  }));
  return feeds.flat();
}

const apify = (actor, input, pick, maxChargeUsd) => async (fetchFn) => {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token || process.env.VIRAL_LIVE_TRENDS?.trim().toLowerCase() === "off") return null;
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?timeout=${APIFY_TIMEOUT_SECONDS}&maxItems=${MAX_PER_SOURCE}&maxTotalChargeUsd=${maxChargeUsd}`;
  const response = await fetchFn(url, {
    method: "POST",
    signal: AbortSignal.timeout((APIFY_TIMEOUT_SECONDS + 5) * 1000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  // The refusal says why (a bad input, a ceiling under the actor's start fee); it holds nothing secret.
  if (!response.ok) throw new Error(`apify ${actor} ${response.status}: ${(await response.text().catch(() => "")).replace(/\s+/gu, " ").slice(0, 160)}`);
  const items = await response.json();
  return (Array.isArray(items) ? items : []).map(pick).map(tidy).filter(Boolean).slice(0, MAX_PER_SOURCE);
};

export const SOURCES = {
  google: { label: "Google Trending now, US and India", everyMs: 6 * HOUR, platforms: ["instagram", "tiktok", "youtube"], run: google },
  "tiktok-hashtags": {
    label: "TikTok Creative Center trending hashtags, US",
    everyMs: 48 * HOUR,
    platforms: ["tiktok"],
    run: apify("clockworks~tiktok-trends-scraper", { adsScrapeHashtags: true, resultsPerPage: MAX_PER_SOURCE, adsCountryCode: "US", adsTimeRange: "7" }, (item) => (item?.name ? `#${String(item.name).replace(/^#/u, "")}` : ""), 0.2),
  },
  instagram: {
    label: "Instagram trending topics, from an unofficial and unproven scraper",
    experimental: true,
    everyMs: 24 * HOUR,
    platforms: ["instagram"],
    run: apify("s-r~instagram-trending-scraper", { maxKeywords: MAX_PER_SOURCE, expandRelatedTopics: false }, (item) => item?.topic, 0.04),
  },
};

/** Refresh whichever sources are due. Each is claimed first, so a crowd of visitors still means one run. */
export async function refreshDue(db, { fetchFn = (...args) => fetch(...args), now = Date.now(), sources = SOURCES } = {}) {
  const collection = db.collection("live_trends");
  await Promise.all(Object.entries(sources).map(async ([id, source]) => {
    let claimed;
    try {
      claimed = await collection.findOneAndUpdate(
        { _id: id, nextAt: { $lte: new Date(now) } },
        { $set: { nextAt: new Date(now + source.everyMs) } },
      ) || await collection.updateOne({ _id: id }, { $setOnInsert: { nextAt: new Date(now + source.everyMs), topics: [] } }, { upsert: true }).then((result) => result.upsertedCount === 1);
    } catch (error) {
      // Two first-ever requests can race on the insert; the loser simply does not run.
      if (error?.code !== 11000) logError("viral.trends.claim", error);
      return;
    }
    if (!claimed) return;
    try {
      const topics = await source.run(fetchFn);
      if (topics?.length) await collection.updateOne({ _id: id }, { $set: { topics, fetchedAt: new Date(now) }, $unset: { error: "" } });
      else if (topics) await collection.updateOne({ _id: id }, { $set: { error: "nothing returned", triedAt: new Date(now) } });
    } catch (error) {
      logError(`viral.trends.${id}`, error);
      // A failed run may try again sooner than a good one, but never in a tight loop.
      await collection.updateOne({ _id: id }, { $set: { error: String(error?.message || error).slice(0, 240), triedAt: new Date(now), nextAt: new Date(now + Math.min(source.everyMs, RETRY_AFTER_MS)) } }).catch(() => {});
    }
  }));
}

/** What is cached for a platform, freshest knowledge only. Never fetches. */
export async function liveTrendsFor(platformId, { getDatabaseFn = getDatabase, now = Date.now(), sources = SOURCES } = {}) {
  try {
    const db = await getDatabaseFn();
    if (!db) return [];
    const docs = await db.collection("live_trends").find({ fetchedAt: { $gte: new Date(now - KEEP_FOR_MS) } }).toArray();
    return Object.entries(sources)
      .filter(([, source]) => source.platforms.includes(platformId))
      .map(([id, source]) => ({ id, doc: docs.find((doc) => doc._id === id), source }))
      .filter(({ doc }) => doc?.topics?.length)
      // The platform's own source leads; Google's general list follows.
      .sort((a, b) => Number(a.id === "google") - Number(b.id === "google"))
      .map(({ id, doc, source }) => ({ id, label: source.label, experimental: Boolean(source.experimental), fetchedAt: doc.fetchedAt.getTime(), topics: doc.topics.map(tidy).filter(Boolean) }));
  } catch (error) {
    logError("viral.trends.read", error);
    return [];
  }
}

export function createViralTrendsHandler({ getDatabaseFn = getDatabase, fetchFn, sources = SOURCES } = {}) {
  return async function handler(req, res) {
    if (!requireMethod(req, res, ["GET"])) return;
    const platform = String(req.query?.platform || "");
    try {
      const db = await getDatabaseFn();
      if (!db) return sendJson(res, 200, { sources: [] });
      await refreshDue(db, { fetchFn, sources });
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=3600");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.status(200).json({ sources: await liveTrendsFor(platform, { getDatabaseFn: async () => db, sources }) });
    } catch (error) {
      logError("viral.trends", error);
      sendJson(res, 502, { error: "trends_unavailable" });
    }
  };
}

export const viralTrendsHandler = createViralTrendsHandler();
