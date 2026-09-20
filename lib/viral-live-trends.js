/* Live "trending now" topics for /viral, beside the hand-researched list in
   viral-trends.js.

   Sources, and what each is worth:
   - Google "Trending now" for the US and India: Google's own public RSS feed,
     free, dependable. What people are searching for today.
   - TikTok trending hashtags (US): Apify actor clockworks~tiktok-trends-scraper,
     which reads TikTok's Creative Center. About $0.035 a run, but the actor refuses
     any charge ceiling under $0.50, so that is the worst case per run and it runs
     only every four days: even the worst case stays inside the monthly credit.
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
const KEEP_FOR_MS = 6 * 24 * HOUR;
const APIFY_TIMEOUT_SECONDS = 45;
const RETRY_AFTER_MS = 12 * HOUR;
const SLOW_RUN_SECONDS = 240;

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

const APIFY = "https://api.apify.com/v2";
const apifyToken = () => (process.env.VIRAL_LIVE_TRENDS?.trim().toLowerCase() === "off" ? "" : process.env.APIFY_TOKEN?.trim() || "");
const refusal = async (response) => (await response.text().catch(() => "")).replace(/\s+/gu, " ").slice(0, 160);

function topicsFrom(actor, items, pick) {
  const topics = (Array.isArray(items) ? items : []).map(pick).map(tidy).filter(Boolean).slice(0, MAX_PER_SOURCE);
  // Rows that hold no topic mean the actor changed its output: say what it sends now, and count it as a failure.
  if (!topics.length) throw new Error(`apify ${actor} returned ${Array.isArray(items) ? items.length : "no"} rows, none usable; fields: ${Object.keys(items?.[0] || {}).slice(0, 14).join(",")}`);
  return topics;
}

/* An actor too slow to wait for inside one request: `start` sets the run going and returns its id,
   and `collect` is asked on later requests until the run has ended. */
const slowApify = (actor, input, pick, maxChargeUsd) => ({
  async start(fetchFn) {
    const token = apifyToken();
    if (!token) return null;
    const response = await fetchFn(`${APIFY}/acts/${actor}/runs?timeout=${SLOW_RUN_SECONDS}&maxItems=${MAX_PER_SOURCE}&maxTotalChargeUsd=${maxChargeUsd}`, {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(`apify ${actor} ${response.status}: ${await refusal(response)}`);
    const runId = (await response.json())?.data?.id;
    if (typeof runId !== "string" || !/^[A-Za-z0-9]{8,32}$/u.test(runId)) throw new Error(`apify ${actor} gave no run id`);
    return runId;
  },
  /** Topics once the run has succeeded, null while it is still going; throws if it failed. */
  async collect(fetchFn, runId) {
    const headers = { Authorization: `Bearer ${apifyToken()}` };
    const run = await fetchFn(`${APIFY}/actor-runs/${runId}`, { signal: AbortSignal.timeout(15_000), headers });
    if (!run.ok) throw new Error(`apify run ${run.status}`);
    const { status, defaultDatasetId } = (await run.json())?.data || {};
    if (status === "READY" || status === "RUNNING") return null;
    if (status !== "SUCCEEDED") throw new Error(`apify ${actor} run ended ${status}`);
    const items = await fetchFn(`${APIFY}/datasets/${defaultDatasetId}/items?clean=true&limit=${MAX_PER_SOURCE}`, { signal: AbortSignal.timeout(15_000), headers });
    if (!items.ok) throw new Error(`apify dataset ${items.status}`);
    return topicsFrom(actor, await items.json(), pick);
  },
});

const apify = (actor, input, pick, maxChargeUsd) => async (fetchFn) => {
  const token = apifyToken();
  if (!token) return null;
  const url = `${APIFY}/acts/${actor}/run-sync-get-dataset-items?timeout=${APIFY_TIMEOUT_SECONDS}&maxItems=${MAX_PER_SOURCE}&maxTotalChargeUsd=${maxChargeUsd}`;
  const response = await fetchFn(url, {
    method: "POST",
    signal: AbortSignal.timeout((APIFY_TIMEOUT_SECONDS + 5) * 1000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  // The refusal says why (a bad input, a ceiling under the actor's start fee); it holds nothing secret.
  if (!response.ok) throw new Error(`apify ${actor} ${response.status}: ${await refusal(response)}`);
  return topicsFrom(actor, await response.json(), pick);
};

export const SOURCES = {
  google: { label: "Google Trending now, US and India", everyMs: 6 * HOUR, platforms: ["instagram", "tiktok", "youtube"], run: google },
  // PAUSED 2026-09-20: with the input its page documents, the run succeeds in about two minutes and returns
  // zero rows (three live tries). It needs a look in the Apify console before it is worth more credit.
  "tiktok-creative": {
    paused: true,
    label: "TikTok Creative Center trending hashtags, US",
    everyMs: 96 * HOUR,
    platforms: ["tiktok"],
    slow: slowApify("clockworks~tiktok-trends-scraper", { adsScrapeHashtags: true, resultsPerPage: MAX_PER_SOURCE, adsCountryCode: "US", adsTimeRange: "7" }, (item) => (item?.name ? `#${String(item.name).replace(/^#/u, "")}` : ""), 0.5),
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
  const fail = (id, source, error) => {
    logError(`viral.trends.${id}`, error);
    // A failed run may try again sooner than a good one, but never in a tight loop.
    return collection.updateOne({ _id: id }, { $set: { error: String(error?.message || error).slice(0, 240), triedAt: new Date(now), nextAt: new Date(now + Math.min(source.everyMs, RETRY_AFTER_MS)) }, $unset: { runId: "" } }).catch(() => {});
  };

  await Promise.all(Object.entries(sources).filter(([, source]) => !source.paused).map(async ([id, source]) => {
    // A slow run started on an earlier request: see whether it has finished. Taking the id first means one collector.
    if (source.slow) {
      const waiting = await collection.findOneAndUpdate({ _id: id, runId: { $type: "string" }, collecting: { $ne: true } }, { $set: { collecting: true } }).catch(() => null);
      if (waiting) {
        try {
          const topics = await source.slow.collect(fetchFn, waiting.runId);
          if (topics) await collection.updateOne({ _id: id }, { $set: { topics, fetchedAt: new Date(now) }, $unset: { runId: "", collecting: "", error: "" } });
          else await collection.updateOne({ _id: id }, { $unset: { collecting: "" } });
        } catch (error) {
          await fail(id, source, error);
          await collection.updateOne({ _id: id }, { $unset: { collecting: "" } }).catch(() => {});
        }
        return;
      }
    }

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
      if (source.slow) {
        const runId = await source.slow.start(fetchFn);
        if (runId) await collection.updateOne({ _id: id }, { $set: { runId, startedAt: new Date(now) } });
        return;
      }
      const topics = await source.run(fetchFn);
      if (topics?.length) await collection.updateOne({ _id: id }, { $set: { topics, fetchedAt: new Date(now) }, $unset: { error: "" } });
    } catch (error) {
      await fail(id, source, error);
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
