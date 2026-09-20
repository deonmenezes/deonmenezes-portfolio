import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { accountTip, createViralHandler, describeCreator, scorePost } from "../lib/viral.js";
import { cleanAuthor, createViralFeedHandler, savePost } from "../lib/viral-store.js";
import { PLATFORM_IDS, PLATFORMS, questionsFor } from "../viral-platforms.js";
import { BASIS_LABELS, PRACTICES } from "../viral-practices.js";
import { MAX_OWN_TOPICS, TRENDS, TRENDS_AS_OF, TRENDS_MAX_AGE_DAYS, cleanTopics, trendContext, trendsFor } from "../viral-trends.js";

const saved = { gateway: process.env.AI_GATEWAY_API_KEY, secret: process.env.JEV_HASH_SECRET, mongo: process.env.MONGODB_URI };

test.beforeEach(() => {
  process.env.AI_GATEWAY_API_KEY = "vck_test_gateway_key";
  process.env.JEV_HASH_SECRET = "test-hash-secret";
  delete process.env.MONGODB_URI;
});

test.afterEach(() => {
  for (const [name, value] of [["AI_GATEWAY_API_KEY", saved.gateway], ["JEV_HASH_SECRET", saved.secret], ["MONGODB_URI", saved.mongo]]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function request(body, headers = {}) {
  return { method: "POST", body, headers: { host: "deonmenezes.com", origin: "https://deonmenezes.com", "x-forwarded-proto": "https", "x-real-ip": "203.0.113.9", ...headers } };
}

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(statusCode) { this.statusCode = statusCode; return this; },
    json(body) { this.body = body; return this; },
  };
}

const claimed = () => [{ status: "ok", key_requests: 0, day: "2026-09-19" }];
const everyAction = (platformId, probability) => Object.fromEntries(Object.keys(PLATFORMS[platformId].actions).map((action) => [action, { probability }]));
const gateway = (answers) => new Response(JSON.stringify({ answers, usage: { inputTokens: 700, outputTokens: 90 }, providerMetadata: { gateway: { cost: "0" } } }), { status: 200 });

test("every platform fits in one Jev request and can turn its answers into its own metrics", () => {
  assert.deepEqual(PLATFORM_IDS, ["x", "instagram", "tiktok", "youtube"]);
  for (const id of PLATFORM_IDS) {
    const platform = PLATFORMS[id];
    assert.ok(Object.keys(questionsFor(id)).length <= 10, `${id}: Jev takes at most 10 questions`);
    assert.ok(platform.metrics.some((metric) => metric.from === "views"), `${id}: needs a views metric`);
    for (const metric of platform.metrics) {
      assert.ok(metric.from === "views" || platform.actions[metric.from], `${id}: metric ${metric.key} points at a real action`);
    }
    assert.ok(Object.values(platform.actions).some((action) => action.weight < 0), `${id}: something has to be able to hurt`);
    assert.equal(platform.weightsArePublished, id === "x", "only X published its weights");
  }
});

test("each platform scores a strong post well, a weak one badly, and reports its own metrics", () => {
  for (const id of PLATFORM_IDS) {
    const negatives = Object.fromEntries(Object.entries(PLATFORMS[id].actions).filter(([, { weight }]) => weight < 0).map(([action]) => [action, { probability: 0.05 }]));
    const strong = scorePost({ ...everyAction(id, 0.8), ...negatives, hook: { score: 2.6 } }, { platform: id, followers: 5000, textLength: 120 });
    const weak = scorePost({ ...everyAction(id, 0.12), hook: { score: 0.2 } }, { platform: id, followers: 5000, textLength: 120 });

    assert.equal(strong.platform, id);
    assert.equal(strong.verdict, "Banger", `${id}: strong post`);
    assert.ok(["Flop", "Mid"].includes(weak.verdict), `${id}: weak post was ${weak.verdict}`);
    assert.deepEqual(Object.keys(strong.metrics), PLATFORMS[id].metrics.map((metric) => metric.key));
    assert.ok(strong.metrics.views > weak.metrics.views * 20, `${id}: reach follows the score`);
    assert.ok(weak.tips.length > 0 && weak.tips.length <= 3);
  }
});

test("a viewer hiding the post sinks it on every platform", () => {
  for (const id of PLATFORM_IDS) {
    const hated = scorePost({ ...everyAction(id, 0.6), negative: { probability: 0.98 }, report: { probability: 0.9 } }, { platform: id });
    const liked = scorePost({ ...everyAction(id, 0.6), negative: { probability: 0.02 }, report: { probability: 0.02 } }, { platform: id });
    assert.ok(hated.viralScore < liked.viralScore, id);
  }
});

test("other platforms describe the format and the hook to Jev and ask their own questions", async () => {
  let upstream;
  const handler = createViralHandler({
    queryFn: async () => claimed(),
    fetchFn: async (_url, options) => { upstream = JSON.parse(options.body); return gateway(everyAction("instagram", 0.5)); },
  });
  const res = response();

  await handler(request({ platform: "instagram", text: "3 things I wish I knew", extra: "  I open on the mistake  ", format: "Carousel", attachments: ["image", "image"] }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.platform, "instagram");
  assert.deepEqual(upstream.state, { platform: "Instagram", format: "Carousel", caption: "3 things I wish I knew", hook: "I open on the mistake", attachments: ["image", "image"], creator: { followers: 1000, verifiedPublicFigure: false }, ...trendContext("instagram") });
  assert.deepEqual(upstream.questions, questionsFor("instagram"));
  assert.ok("sends" in res.body.metrics && !("reposts" in res.body.metrics));

  const youtube = createViralHandler({ queryFn: async () => claimed(), fetchFn: async (_url, options) => { upstream = JSON.parse(options.body); return gateway(everyAction("youtube", 0.5)); } });
  await youtube(request({ platform: "youtube", text: "I built a robot", format: "Podcast" }), response());
  assert.deepEqual(upstream.state, { platform: "YouTube", format: "Video", title: "I built a robot", creator: { subscribers: 1000, verifiedPublicFigure: false }, ...trendContext("youtube") }, "an unknown format falls back to the first");
});

test("Jev is told what is new only while the list is fresh, and never for X", () => {
  const asOf = Date.parse(`${TRENDS_AS_OF}T00:00:00Z`);
  const day = 86_400_000;
  const fresh = trendContext("youtube", asOf + 5 * day);
  assert.equal(fresh.today, new Date(asOf + 5 * day).toISOString().slice(0, 10));
  assert.deepEqual(fresh.trendingNow, TRENDS.youtube.topics);
  assert.deepEqual(trendContext("youtube", asOf + (TRENDS_MAX_AGE_DAYS + 1) * day), {}, "a stale list is not sent");
  assert.equal(trendsFor("tiktok", asOf + (TRENDS_MAX_AGE_DAYS + 1) * day), null, "and not shown");
  assert.deepEqual(trendContext("x", asOf), {});
  assert.deepEqual(trendContext("__proto__", asOf), {});
  for (const [id, trends] of Object.entries(TRENDS)) {
    assert.ok(trends.topics.length <= 16 && trends.topics.every((topic) => topic.length <= 90), `${id}: the list rides along with every request, so it stays short`);
    assert.ok(trends.gaps.every((gap) => ["measured", "reported", "inferred"].includes(gap.basis)), `${id}: every gap says how we know`);
    assert.ok(PLATFORMS[id].check, `${id}: says how it was checked`);
  }
});

test("bigger accounts reach a smaller share of their followers where the data shows it", () => {
  const flat = Object.fromEntries(Object.keys(PLATFORMS.instagram.actions).map((action) => [action, { probability: 0 }]));
  const small = scorePost(flat, { platform: "instagram", followers: 3000 });
  const large = scorePost(flat, { platform: "instagram", followers: 500_000 });
  assert.ok(small.reach.followers / 3000 > 0.15 && small.reach.followers / 3000 <= 0.25);
  assert.ok(large.reach.followers / 500_000 >= 0.04 && large.reach.followers / 500_000 < 0.06);
  assert.equal(scorePost(flat, { platform: "instagram", followers: 0 }).metrics.views, 0);
});

test("an unknown platform is rejected before anything is spent", async () => {
  const handler = createViralHandler({ queryFn: async () => { throw new Error("db"); }, fetchFn: async () => { throw new Error("gateway"); } });
  const res = response();
  await handler(request({ platform: "myspace", text: "hello" }), res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "unknown_platform" });

  for (const platform of ["__proto__", "constructor"]) {
    const next = response();
    await handler(request({ platform, text: "hello" }), next);
    assert.equal(next.statusCode, 400, platform);
  }
});

test("posts are published only when storage is on, the author is well formed, and Jev wouldn't report it", async () => {
  const author = { handle: "DeonMen", name: "Deon", avatarUrl: "https://pbs.twimg.com/profile_images/1/a_400x400.jpg", verified: true };
  const run = async ({ enabled, report = 0.02, platform = "x", body = {} }) => {
    const saves = [];
    const calls = [];
    const handler = createViralHandler({
      queryFn: async () => claimed(),
      storeEnabledFn: () => enabled,
      saveFn: async (post) => { saves.push(post); return true; },
      fetchFn: async (_url, options) => {
        const sent = JSON.parse(options.body);
        calls.push(Object.keys(sent.questions));
        return gateway(sent.questions.like ? { ...everyAction(platform, 0.5), ...(platform === "x" ? { report: { probability: report } } : {}) } : { report: { probability: report } });
      },
    });
    const res = response();
    await handler(request({ id: "1789820000000-abc123", platform, text: "a perfectly fine post", author, publish: true, ...body }), res);
    return { saves, calls, res };
  };

  let result = await run({ enabled: false });
  assert.equal(result.saves.length, 0);
  assert.equal(result.res.body.published, false);

  result = await run({ enabled: true });
  assert.equal(result.saves.length, 1);
  assert.equal(result.res.body.published, true);
  assert.deepEqual(result.saves[0].author, author);
  assert.equal(result.calls.length, 1, "X already asks about reports, so no second call");

  result = await run({ enabled: true, report: 0.9 });
  assert.equal(result.saves.length, 0, "a reportable post is scored but never published");
  assert.equal(result.res.statusCode, 200);

  result = await run({ enabled: true, platform: "tiktok" });
  assert.deepEqual(result.calls[1], ["report"], "platforms without a report signal get one extra moderation question");
  assert.equal(result.saves.length, 1);

  result = await run({ enabled: true, platform: "tiktok", report: 0.9 });
  assert.equal(result.saves.length, 0);

  result = await run({ enabled: true, body: { author: { handle: "not a handle!" } } });
  assert.equal(result.saves.length, 0);

  for (const publish of [false, undefined, "true", 1]) {
    result = await run({ enabled: true, platform: "tiktok", body: { publish } });
    assert.equal(result.saves.length, 0, `publish=${publish} is private`);
    assert.equal(result.res.body.published, false);
    assert.equal(result.calls.length, 1, "a private post is not even sent for the moderation check");
    assert.equal(result.res.statusCode, 200, "and is still scored");
  }
});

test("authors are reduced to safe fields", () => {
  assert.equal(cleanAuthor(null), null);
  assert.equal(cleanAuthor({ handle: "<script>" }), null);
  assert.deepEqual(cleanAuthor({ handle: "deon", name: "x".repeat(99), avatarUrl: "https://evil.example/a.png", verified: "yes", role: "admin" }), {
    handle: "deon", name: "x".repeat(60), avatarUrl: null, verified: true,
  });
});

function fakeCollection(docs = []) {
  const calls = [];
  return {
    calls,
    // Like the driver: an upsert reports an insert only the first time an id is seen.
    async updateOne(filter, update, options) {
      const seen = calls.some((call) => call.filter.clientId === filter.clientId);
      calls.push({ filter, update, options });
      return { upsertedCount: seen ? 0 : 1 };
    },
    find(filter) {
      let rows = docs.filter((doc) => doc.platform === filter.platform && (!filter.createdAt || doc.createdAt >= filter.createdAt.$gte));
      return {
        sort(spec) { const [[key, direction]] = Object.entries(spec); rows = [...rows].sort((a, b) => (a[key] > b[key] ? 1 : -1) * direction); return this; },
        limit(count) { rows = rows.slice(0, count); return this; },
        async toArray() { return rows; },
      };
    },
  };
}

test("saving is an idempotent upsert keyed by the browser's post id, and ignores malformed ids", async () => {
  const collection = fakeCollection();
  const scored = { viralScore: 70, verdict: "Banger", metrics: { views: 10 }, hook: 2, emotion: "awe", breakdown: [{ secret: true }] };
  const post = { id: "1789820000000-abc123", platform: "x", text: "hi", extra: "", format: undefined, attachments: [], poll: ["only"], author: { handle: "deon" }, scored };

  assert.equal(await savePost(post, { collection }), true);
  const [{ filter, update, options }] = collection.calls;
  assert.deepEqual(filter, { clientId: post.id });
  assert.equal(options.upsert, true);
  assert.ok(update.$setOnInsert && !update.$set, "a replayed request must not overwrite the stored post");
  assert.deepEqual(update.$setOnInsert.poll, []);
  assert.equal(update.$setOnInsert.breakdown, undefined);

  assert.equal(await savePost(post, { collection }), false, "replaying an id that exists is not a publish, so it earns no media key");
  assert.equal(await savePost({ ...post, id: "../../etc" }, { collection }), false);
  assert.equal(await savePost({ ...post, id: { $ne: null } }, { collection }).catch(() => false), false);
  assert.equal(collection.calls.length, 2);
});

test("the feed is off without a database and returns a platform's recent posts and leaders with one", async () => {
  const off = createViralFeedHandler({ getCollectionFn: async () => null });
  let res = response();
  await off({ method: "GET", query: { platform: "tiktok" }, headers: {} }, res);
  assert.deepEqual(res.body, { enabled: false, posts: [], leaderboard: [] });

  const now = Date.now();
  const doc = (clientId, platform, viralScore, ageDays) => ({ clientId, platform, viralScore, verdict: "Solid", text: clientId, metrics: { views: 1 }, author: { handle: "a", name: "A", internal: "x" }, createdAt: new Date(now - ageDays * 86_400_000), _id: "mongo-id" });
  const on = createViralFeedHandler({ getCollectionFn: async () => fakeCollection([doc("old-banger", "tiktok", 99, 30), doc("fresh-mid", "tiktok", 40, 1), doc("fresh-top", "tiktok", 80, 2), doc("other", "x", 100, 0)]) });
  res = response();
  await on({ method: "GET", query: { platform: "tiktok" }, headers: {} }, res);

  assert.equal(res.body.enabled, true);
  assert.deepEqual(res.body.posts.map((post) => post.id), ["fresh-mid", "fresh-top", "old-banger"]);
  assert.deepEqual(res.body.leaderboard.map((post) => post.id), ["fresh-top", "fresh-mid"], "the leaderboard is this week only");
  assert.equal(res.body.posts[0]._id, undefined);
  assert.equal(JSON.stringify(res.body).includes("internal"), false);

  const broken = createViralFeedHandler({ getCollectionFn: async () => { throw new Error("mongodb+srv://user:hunter2@host"); } });
  res = response();
  await broken({ method: "GET", query: {}, headers: {} }, res);
  assert.equal(res.statusCode, 502);
  assert.doesNotMatch(JSON.stringify(res.body), /hunter2|mongodb/u);
});

test("best practices cover every platform, label who said each one, and only link out over https", () => {
  for (const id of PLATFORM_IDS) {
    const { intro, items } = PRACTICES[id];
    assert.ok(intro.length > 20 && items.length >= 5, id);
    for (const item of items) {
      assert.ok(BASIS_LABELS[item.basis], `${id}: ${item.title} needs a basis`);
      assert.ok(item.title.split(" ").length <= 6, `${id}: "${item.title}" is too long`);
      if (item.basis === "official") assert.ok(item.source, `${id}: an official claim needs its source`);
      if (item.source) assert.match(item.source.url, /^https:\/\//u);
    }
  }
  const timely = PRACTICES.instagram.items.find((item) => /moment/iu.test(item.title));
  assert.equal(timely.basis, "unconfirmed", "Instagram has not said timeliness is a ranking signal");
});

test("the page loads the shared platform files, and the stylesheet themes all four", async () => {
  const [html, script, css, vercel] = await Promise.all([
    readFile(new URL("../viral.html", import.meta.url), "utf8"),
    readFile(new URL("../viral.js", import.meta.url), "utf8"),
    readFile(new URL("../viral.css", import.meta.url), "utf8"),
    readFile(new URL("../vercel.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  assert.match(script, /from "\/viral-platforms\.js"/u);
  assert.match(script, /from "\/viral-practices\.js"/u);
  for (const id of PLATFORM_IDS) {
    assert.ok(html.includes(`data-platform-option="${id}"`), id);
    if (id !== "x") assert.ok(css.includes(`[data-platform="${id}"] {`), `${id} theme`);
  }
  const icons = new Set(PLATFORM_IDS.flatMap((id) => PLATFORMS[id].metrics.map((metric) => metric.icon)));
  for (const name of icons) assert.ok(html.includes(`id="i-${name}"`), `icon ${name}`);
  assert.doesNotMatch(css, /var\(--blue\)/u);
  assert.equal(vercel.rewrites.find((rule) => rule.source === "/api/viral/feed").destination, "/api/stats?route=viral-feed");
});

test("a visitor's own topics lead the list Jev reads, cleaned and capped", async () => {
  const asOf = Date.parse(`${TRENDS_AS_OF}T00:00:00Z`);
  const day = 86_400_000;
  assert.deepEqual(cleanTopics(["  Garba\n night ", "garba night", 7, "", "x".repeat(200)]), ["Garba night", "x".repeat(80)]);
  assert.equal(cleanTopics(Array.from({ length: 20 }, (_, index) => `topic ${index}`)).length, MAX_OWN_TOPICS);
  assert.deepEqual(cleanTopics("not a list"), []);

  assert.deepEqual(trendContext("tiktok", asOf, ["Garba night"]).trendingNow, ["Garba night", ...TRENDS.tiktok.topics]);
  assert.deepEqual(trendContext("tiktok", asOf + (TRENDS_MAX_AGE_DAYS + 1) * day, ["Garba night"]).trendingNow, ["Garba night"], "they outlive the researched list");
  assert.deepEqual(trendContext("x", asOf, ["Garba night"]), {}, "X still gets none");

  let upstream;
  const handler = createViralHandler({
    queryFn: async () => claimed(),
    fetchFn: async (_url, options) => { upstream = JSON.parse(options.body); return gateway(everyAction("instagram", 0.5)); },
  });
  await handler(request({ platform: "instagram", text: "Garba in the Bay", topics: ["Garba night", { not: "text" }] }), response());
  assert.deepEqual(upstream.state.trendingNow.slice(0, 2), ["Garba night", TRENDS.instagram.topics[0]]);
});

test("the media key goes only to the request that created a public video post", async () => {
  const before = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_StoreABC123_secretpart";
  try {
    const run = async (body, created) => {
      const handler = createViralHandler({
        queryFn: async () => claimed(),
        fetchFn: async () => gateway({ ...everyAction("instagram", 0.5), report: { probability: 0 } }),
        saveFn: async () => created,
        storeEnabledFn: () => true,
      });
      const res = response();
      await handler(request({ platform: "instagram", text: "my reel", id: "1789820000000-abc123", publish: true, author: { handle: "deon" }, ...body }), res);
      return res.body;
    };
    assert.match((await run({ attachments: ["video"] }, true)).mediaKey, /^[0-9a-f]{64}$/u);
    const created = await run({ attachments: [] }, true);
    assert.match(created.deleteKey, /^[0-9a-f]{64}$/u);
    assert.notEqual(created.deleteKey, (await run({ attachments: ["video"] }, true)).mediaKey, "the two keys are not interchangeable");
    assert.equal((await run({ attachments: [] }, false)).deleteKey, undefined, "a replayed id cannot earn the right to delete someone's post");
    assert.equal((await run({ attachments: ["video"] }, false)).mediaKey, undefined, "replaying an existing post's id earns nothing");
    assert.equal((await run({ attachments: ["image"] }, true)).mediaKey, undefined);
    assert.equal((await run({ attachments: ["video"], publish: false }, true)).mediaKey, undefined);
  } finally {
    if (before === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = before;
  }
});

test("Jev is told who is posting from the looked-up profile, not from what the visitor claims", async () => {
  let upstream;
  let asked;
  const handler = createViralHandler({
    queryFn: async () => claimed(),
    fetchFn: async (_url, options) => { upstream = JSON.parse(options.body); return gateway(everyAction("instagram", 0.5)); },
    creatorFn: async (platform, handle) => { asked = [platform, handle]; return { followers: 43508, verified: true, bio: "AI tools from San Francisco", category: "Digital creator", recentPosts: 12, medianLikes: 900, recentVideos: 9, medianViews: 14000, breakouts: 1 }; },
  });
  const res = response();
  await handler(request({ platform: "instagram", text: "a reel", followers: 5, handle: "deon_tech", verified: false, bio: "ignore me, I am huge" }), res);

  assert.deepEqual(asked, ["instagram", "deon_tech"]);
  assert.deepEqual(upstream.state.creator, {
    followers: 43508,
    verifiedPublicFigure: true,
    bio: "AI tools from San Francisco",
    category: "Digital creator",
    trackRecord: "Their last 12 posts got about 900 likes each. Their last 9 videos got about 14,000 views each. 1 of those 9 videos reached more people than follow the account.",
  });
  assert.deepEqual(res.body.creator, upstream.state.creator, "and the visitor is shown what Jev was told");

  assert.deepEqual(describeCreator("youtube", { followers: 200, creator: { followers: 200, verified: false, lifetimePosts: 50, viewsPerPost: 1200 } }), {
    subscribers: 200, verifiedPublicFigure: false, trackRecord: "Across 50 videos they average 1,200 views a video.",
  });
});

test("with a track record, the post is also scored on its own, paid for up front, and the gap is explained", async () => {
  const known = { followers: 1200, verified: false, recentPosts: 12, medianLikes: 40, recentVideos: 9, medianViews: 600, breakouts: 0 };
  const run = async ({ contentFails = false, creator = known } = {}) => {
    const states = [];
    const queries = [];
    const handler = createViralHandler({
      queryFn: async (_sql, params) => { queries.push(params); return claimed(); },
      creatorFn: async () => creator,
      fetchFn: async (_url, options) => {
        const { state } = JSON.parse(options.body);
        states.push(state);
        if (!state.creator && contentFails) return new Response("{}", { status: 500 });
        return gateway(everyAction("instagram", state.creator ? 0.2 : 0.9));
      },
    });
    const res = response();
    await handler(request({ platform: "instagram", text: "a perfectly good reel about something", handle: "deon_tech" }), res);
    return { res, states, queries };
  };

  const both = await run();
  assert.equal(both.states.length, 2);
  assert.equal(both.states.filter((state) => state.creator).length, 1, "one call knows the account, one does not");
  assert.ok(both.res.body.content.viralScore - both.res.body.viralScore >= 15);
  assert.match(both.res.body.tips[0], /^The account is holding this back, not the post/u);
  assert.ok(both.res.body.tips.length <= 3);

  const single = await run({ creator: { followers: 1200, verified: false } });
  assert.equal(single.states.length, 1, "no track record, no second call");
  assert.equal(single.res.body.content, undefined);
  assert.ok(both.queries[0][2] > single.queries[0][2] * 1.5, "both calls are reserved before either is made");

  const degraded = await run({ contentFails: true });
  assert.equal(degraded.res.statusCode, 200);
  assert.equal(degraded.res.body.content, undefined, "a failed second opinion costs the visitor nothing");

  assert.equal(accountTip(50, 55), null);
  assert.match(accountTip(80, 40), /^Your account is carrying this one/u);
});
