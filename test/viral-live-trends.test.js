import assert from "node:assert/strict";
import test from "node:test";
import { SOURCES, createViralTrendsHandler, liveTrendsFor, parseGoogleTrends, refreshDue } from "../lib/viral-live-trends.js";
import { MAX_LIVE_TOPICS, TRENDS, TRENDS_AS_OF, trendContext } from "../viral-trends.js";

const saved = { token: process.env.APIFY_TOKEN, off: process.env.VIRAL_LIVE_TRENDS };
test.beforeEach(() => {
  process.env.APIFY_TOKEN = "apify_test_token";
  delete process.env.VIRAL_LIVE_TRENDS;
});
test.afterEach(() => {
  for (const [name, value] of [["APIFY_TOKEN", saved.token], ["VIRAL_LIVE_TRENDS", saved.off]]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const NOW = Date.parse("2026-09-20T12:00:00Z");
const RSS = `<rss><channel><title>Daily Search Trends</title>
  <item><title>h1b fee</title><ht:news_item><ht:news_item_title>Trump extends $100,000 H-1B fee &amp; tech reacts</ht:news_item_title></ht:news_item></item>
  <item><title>garba &lt;script&gt;</title></item>
</channel></rss>`;

// The smallest Mongo that honours what refreshDue relies on: a conditional claim and a unique _id.
function database(docs = []) {
  const collection = {
    async findOneAndUpdate(filter, change) {
      const doc = docs.find((entry) => entry._id === filter._id && entry.nextAt <= filter.nextAt.$lte);
      if (!doc) return null;
      Object.assign(doc, change.$set);
      return doc;
    },
    async updateOne(filter, change, options = {}) {
      let doc = docs.find((entry) => entry._id === filter._id);
      if (!doc && options.upsert) {
        doc = { _id: filter._id, ...change.$setOnInsert };
        docs.push(doc);
        return { upsertedCount: 1 };
      }
      if (!doc) return { upsertedCount: 0, modifiedCount: 0 };
      Object.assign(doc, change.$set);
      for (const name of Object.keys(change.$unset || {})) delete doc[name];
      return { upsertedCount: 0, modifiedCount: 1 };
    },
    find(filter) {
      return { toArray: async () => docs.filter((doc) => doc.fetchedAt && doc.fetchedAt >= filter.fetchedAt.$gte) };
    },
  };
  return { docs, collection: () => collection };
}

function network() {
  const calls = [];
  const fetchFn = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.startsWith("https://trends.google.com/")) return new Response(RSS, { status: 200 });
    if (url.includes("tiktok-trends")) return new Response(JSON.stringify([{ name: "garbanight" }, { name: "#h1b" }, { nope: 1 }]), { status: 200 });
    if (url.includes("instagram-trending")) return new Response(JSON.stringify([{ topic: "  Navratri\noutfits " }]), { status: 200 });
    return new Response("[]", { status: 200 });
  };
  return { calls, fetchFn };
}

test("Google's feed is read into short, harmless topics", () => {
  assert.deepEqual(parseGoogleTrends(RSS, "US"), ["h1b fee: Trump extends $100,000 H-1B fee & tech reacts (US)", "garba script (US)"]);
  assert.deepEqual(parseGoogleTrends("not xml", "US"), []);
});

test("each source runs once per interval however many visitors ask, with a charge ceiling on the paid ones", async () => {
  const db = database();
  const { calls, fetchFn } = network();
  await Promise.all([refreshDue(db, { fetchFn, now: NOW }), refreshDue(db, { fetchFn, now: NOW }), refreshDue(db, { fetchFn, now: NOW })]);
  await refreshDue(db, { fetchFn, now: NOW + 3_600_000 });

  const apify = calls.filter((call) => call.url.startsWith("https://api.apify.com/"));
  assert.equal(apify.length, 2, "one TikTok run and one Instagram run, not one per visitor");
  for (const call of apify) {
    assert.match(call.url, /maxTotalChargeUsd=0\.(?:04|5)(?:&|$)/u);
    assert.match(call.url, /maxItems=10/u);
    assert.equal(call.options.headers.Authorization, "Bearer apify_test_token");
    assert.ok(!call.url.includes("apify_test_token"), "the token never rides in the URL");
  }
  assert.equal(calls.filter((call) => call.url.includes("google")).length, 2, "US and India, once");

  await refreshDue(db, { fetchFn, now: NOW + 7 * 3_600_000 });
  assert.equal(calls.filter((call) => call.url.includes("google")).length, 4, "Google is due again after six hours");
  assert.equal(calls.filter((call) => call.url.startsWith("https://api.apify.com/")).length, 2, "the paid sources are not");

  const tiktok = await liveTrendsFor("tiktok", { getDatabaseFn: async () => db, now: NOW + 7 * 3_600_000 });
  assert.deepEqual(tiktok.map((source) => source.id), ["tiktok-tags", "google"], "the platform's own source leads");
  assert.deepEqual(tiktok[0].topics, ["#garbanight", "#h1b"]);
  const instagram = await liveTrendsFor("instagram", { getDatabaseFn: async () => db, now: NOW });
  assert.deepEqual(instagram[0].topics, ["Navratri outfits"]);
  assert.equal(instagram[0].experimental, true, "Instagram has no official trend feed, and the page must say so");
  assert.deepEqual((await liveTrendsFor("youtube", { getDatabaseFn: async () => db, now: NOW })).map((source) => source.id), ["google"]);
  assert.deepEqual(await liveTrendsFor("x", { getDatabaseFn: async () => db, now: NOW }), []);
});

test("a failed or switched-off run keeps the old topics and does not retry until the next interval", async () => {
  const old = { _id: "tiktok-tags", nextAt: new Date(NOW - 1000), topics: ["#older"], fetchedAt: new Date(NOW - 3_600_000) };
  const db = database([old]);
  let runs = 0;
  const fetchFn = async (url) => {
    if (url.includes("apify")) { runs++; return new Response("nope", { status: 500 }); }
    return new Response(RSS, { status: 200 });
  };
  await refreshDue(db, { fetchFn, now: NOW });
  await refreshDue(db, { fetchFn, now: NOW + 60_000 });
  assert.deepEqual(old.topics, ["#older"]);
  assert.match(old.error, /apify/u);
  assert.ok(runs <= 2, "TikTok once, Instagram once");
  assert.equal(old.nextAt.getTime(), NOW + 12 * 3_600_000, "a failure retries in half a day, not at once and not in two");

  process.env.VIRAL_LIVE_TRENDS = "off";
  const quiet = database();
  const { calls, fetchFn: fine } = network();
  await refreshDue(quiet, { fetchFn: fine, now: NOW });
  assert.equal(calls.filter((call) => call.url.includes("apify")).length, 0);
  assert.equal(calls.filter((call) => call.url.includes("google")).length, 2, "the free source stays on");
});

test("the endpoint serves the cache, and scoring gets live topics between the visitor's and the researched ones", async () => {
  const db = database();
  const { fetchFn } = network();
  const handler = createViralTrendsHandler({ getDatabaseFn: async () => db, fetchFn });
  const res = { headers: {}, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ method: "GET", query: { platform: "instagram" }, headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.sources.map((source) => source.id), ["instagram", "google"]);
  assert.ok(Object.keys(SOURCES).every((id) => SOURCES[id].everyMs >= 6 * 3_600_000));

  const asOf = Date.parse(`${TRENDS_AS_OF}T00:00:00Z`);
  const context = trendContext("instagram", asOf, ["mine"], ["live one", TRENDS.instagram.topics[0], ...Array.from({ length: 30 }, (_, index) => `live ${index}`)]);
  assert.deepEqual(context.trendingNow.slice(0, 2), ["mine", "live one"]);
  assert.equal(context.trendingNow.filter((topic) => topic === TRENDS.instagram.topics[0]).length, 1, "no duplicates");
  assert.ok(context.trendingNow.length <= 1 + MAX_LIVE_TOPICS + TRENDS.instagram.topics.length);
});
