import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ACTIONS, createViralHandler, QUESTIONS, scorePost, VIRAL_DAILY_REQUESTS_PER_NETWORK } from "../lib/viral.js";
import statsHandler from "../api/stats.js";

const saved = { gateway: process.env.AI_GATEWAY_API_KEY, secret: process.env.JEV_HASH_SECRET };

test.beforeEach(() => {
  process.env.AI_GATEWAY_API_KEY = "vck_test_gateway_key";
  process.env.JEV_HASH_SECRET = "test-hash-secret";
});

test.afterEach(() => {
  for (const [name, value] of [["AI_GATEWAY_API_KEY", saved.gateway], ["JEV_HASH_SECRET", saved.secret]]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function request(body, { headers = {}, ...overrides } = {}) {
  return {
    method: "POST",
    headers: { host: "deonmenezes.com", origin: "https://deonmenezes.com", "x-forwarded-proto": "https", "x-real-ip": "203.0.113.42", ...headers },
    body,
    ...overrides,
  };
}

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(statusCode) { this.statusCode = statusCode; return this; },
    json(body) { this.body = body; return this; },
  };
}

const p = (probability) => ({ type: "boolean", probability });

// Recorded Jev output for two real posts.
const BLAND = { like: p(0.19), repost: p(0.12), reply: p(0.18), quote: p(0.16), shareLink: p(0.09), follow: p(0.06), negative: p(0.13), report: p(0.02), hook: { type: "score", score: 0 }, emotion: { type: "choice", choice: "nothing" } };
const STRONG = { like: p(0.63), repost: p(0.56), reply: p(0.74), quote: p(0.71), shareLink: p(0.47), follow: p(0.37), negative: p(0.22), report: p(0.06), hook: { type: "score", score: 2.72 }, emotion: { type: "choice", choice: "awe" } };

const gateway = (answers) => new Response(JSON.stringify({ answers, usage: { inputTokens: 620, outputTokens: 90 }, providerMetadata: { gateway: { cost: "0" } } }), { status: 200 });
const claimed = (status = "ok", keyRequests = 0) => [{ status, key_requests: keyRequests, day: "2026-09-19" }];

test("the action weights are the ones X publishes for its For You ranker", () => {
  const weights = Object.fromEntries(Object.entries(ACTIONS).map(([action, { weight }]) => [action, weight]));
  assert.deepEqual(weights, { like: 0.5, repost: 1, reply: 5, quote: 5, shareLink: 20, follow: 4, negative: -43.2, report: -234 });
  assert.deepEqual(Object.keys(ACTIONS).sort(), Object.keys(QUESTIONS).filter((name) => QUESTIONS[name].type === "boolean").sort());
  assert.ok(Object.keys(QUESTIONS).length <= 10, "Jev requests are capped at 10 questions");
});

test("scoring separates a bland post from a strong one", () => {
  const bland = scorePost(BLAND, { followers: 1000, textLength: 37 });
  const strong = scorePost(STRONG, { followers: 10_000, textLength: 150 });

  assert.equal(bland.verdict, "Flop");
  assert.equal(strong.verdict, "Banger");
  assert.ok(strong.viralScore > bland.viralScore + 30);
  assert.ok(strong.metrics.views > bland.metrics.views * 50);
  assert.ok(strong.metrics.likes > strong.metrics.replies && strong.metrics.replies > strong.metrics.reposts);
  assert.equal(strong.emotion, "awe");
  assert.ok(bland.tips.length > 0 && bland.tips.length <= 3);
});

test("negative signals sink an otherwise engaging post", () => {
  const spam = scorePost({ ...STRONG, negative: p(0.95), report: p(0.9) }, { followers: 10_000, textLength: 80 });
  assert.equal(spam.verdict, "Flop");
  assert.equal(spam.viralScore, 0);
  assert.match(spam.tips[0], /-234/u);
});

test("scoring survives missing or junk model output", () => {
  const empty = scorePost({}, {});
  assert.equal(empty.viralScore, 0);
  assert.equal(empty.verdict, "Flop");
  assert.equal(empty.emotion, "nothing");
  const junk = scorePost({ like: { probability: "NaN" }, reply: { probability: 7 }, emotion: { choice: 42 } }, { followers: 100 });
  assert.ok(Number.isFinite(junk.viralScore) && Number.isFinite(junk.metrics.views));
});

test("a simulation meters the visitor's network, not a djev key, and sends only the post to Jev", async () => {
  const queries = [];
  let upstream;
  const handler = createViralHandler({
    queryFn: async (sql, values) => { queries.push({ sql, values }); return claimed("ok", 4); },
    fetchFn: async (url, options) => { upstream = JSON.parse(options.body); return gateway(STRONG); },
  });
  const res = response();

  await handler(request({ text: "  hello world  ", followers: 10_000, name: "Deon", handle: "deon_tech" }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.verdict, "Banger");
  assert.equal(res.body.remainingToday, VIRAL_DAILY_REQUESTS_PER_NETWORK - 5);
  assert.deepEqual(upstream.state, { post: "hello world", creator: { followers: 10_000, verifiedPublicFigure: false } }, "the post, and who is posting it");
  assert.deepEqual(upstream.questions, QUESTIONS);
  assert.match(queries[0].values[0], /^viral:[a-f0-9]{64}$/u);
  assert.doesNotMatch(queries[0].values[0], /203\.0\.113/u);
  assert.equal(queries[0].values[3], VIRAL_DAILY_REQUESTS_PER_NETWORK);
  assert.doesNotMatch(queries[0].sql, /jev_api_keys/u, "anonymous buckets must not require a key row");
  assert.equal(queries[1].values[2], 620, "reconciles to the gateway's real token count");
});

test("attachments and polls are described to Jev, and junk is dropped", async () => {
  let upstream;
  const handler = createViralHandler({
    queryFn: async () => claimed(),
    fetchFn: async (_url, options) => { upstream = JSON.parse(options.body); return gateway(BLAND); },
  });

  await handler(request({
    text: "which one?",
    attachments: ["image", "video", "exe", 7, "gif", "image", "image"],
    poll: ["  Tabs ", "Spaces", "", 42, "x".repeat(40)],
  }), response());
  assert.deepEqual(upstream.state, {
    post: "which one?",
    attachments: ["image", "video", "gif", "image"],
    poll: ["Tabs", "Spaces", "x".repeat(25)],
    creator: { followers: 1000, verifiedPublicFigure: false },
  });

  await handler(request({ text: "solo", poll: ["only one"] }), response());
  assert.deepEqual(upstream.state, { post: "solo", creator: { followers: 1000, verifiedPublicFigure: false } }, "a poll needs two options to count");
});

test("simulations are same-origin, non-empty, bounded, and rate limited", async () => {
  const never = { queryFn: async () => { throw new Error("db should not be called"); }, fetchFn: async () => { throw new Error("gateway should not be called"); } };
  const handler = createViralHandler(never);

  let res = response();
  await handler(request({ text: "hi" }, { headers: { origin: "https://attacker.example" } }), res);
  assert.equal(res.statusCode, 403);

  res = response();
  await handler(request({ text: "   " }), res);
  assert.equal(res.body.error, "empty_post");

  res = response();
  await handler(request({ text: "x".repeat(1001) }), res);
  assert.equal(res.body.error, "post_too_long");

  res = response();
  await handler(request(null, { method: "GET" }), res);
  assert.equal(res.statusCode, 405);

  const limited = createViralHandler({ queryFn: async () => claimed("daily_limit_reached", 40), fetchFn: never.fetchFn });
  res = response();
  await limited(request({ text: "hi" }), res);
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.error, "daily_limit_reached");
});

test("a throttled gateway is retried once, then reported as busy without leaking account details", async () => {
  let calls = 0;
  const throttled = () => new Response(JSON.stringify({ error: { message: "Free tier requests on this model are rate-limited. Upgrade to paid credits" } }), { status: 429 });

  const recovers = createViralHandler({ queryFn: async () => claimed(), retryDelayMs: 0, fetchFn: async () => (++calls === 1 ? throttled() : gateway(BLAND)) });
  let res = response();
  await recovers(request({ text: "hi there" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls, 2);

  calls = 0;
  const stuck = createViralHandler({ queryFn: async () => claimed(), retryDelayMs: 0, fetchFn: async () => { calls++; return throttled(); } });
  res = response();
  await stuck(request({ text: "hi there" }), res);
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.error, "jev_busy");
  assert.equal(calls, 2);
  assert.doesNotMatch(JSON.stringify(res.body), /tier|credits|Upgrade/iu);
});

test("stats function delegates the viral rewrite target", async () => {
  const res = response();
  await statsHandler(request({ text: "hi" }, { query: { route: "viral" }, headers: { origin: "https://attacker.example" } }), res);
  assert.equal(res.statusCode, 403);
});

test("the /viral page respects its CSP and doesn't pose as X", async () => {
  const [html, script, vercel] = await Promise.all([
    readFile(new URL("../viral.html", import.meta.url), "utf8"),
    readFile(new URL("../viral.js", import.meta.url), "utf8"),
    readFile(new URL("../vercel.json", import.meta.url), "utf8").then(JSON.parse),
  ]);

  assert.doesNotMatch(html, /\sstyle="/u);
  assert.doesNotMatch(script, /innerHTML|\.style\./u);
  assert.doesNotMatch(html, /<title>[^<]*\/ X<\/title>/u);
  assert.ok(html.includes("Not affiliated with X"));
  const platforms = await readFile(new URL("../viral-platforms.js", import.meta.url), "utf8");
  assert.ok(platforms.includes("github.com/xai-org/x-algorithm"), "the X weights link to their source");
  assert.doesNotMatch(html, /href="\/jev"|Free Jev API/u, "the simulator doesn't advertise the API");
  assert.match(script, /pending = \[post, \.\.\.pending\]/u, "the post goes on screen before Jev answers");
  assert.match(script, /prefers-reduced-motion/u);
  for (const verdict of ["banger", "solid", "mid", "flop"]) {
    assert.ok((await readFile(new URL("../viral.css", import.meta.url), "utf8")).includes(`.verdict-${verdict}`));
  }

  assert.equal(vercel.rewrites.find((rule) => rule.source === "/api/viral").destination, "/api/stats?route=viral");
  const csp = vercel.headers.find((rule) => rule.source === "/viral").headers.find((header) => header.key === "Content-Security-Policy").value;
  assert.match(csp, /connect-src 'self'/u);
  assert.match(csp, /style-src 'self'/u);
});
