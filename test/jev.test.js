import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJevHandler, createJevKeyHandler, hashKey, JEV_LIMITS, validateEvaluation } from "../lib/jev.js";
import statsHandler from "../api/stats.js";

const VALID_KEY = `djev_${"a".repeat(43)}`;
const originalGatewayKey = process.env.AI_GATEWAY_API_KEY;
const originalHashSecret = process.env.JEV_HASH_SECRET;

test.beforeEach(() => {
  process.env.AI_GATEWAY_API_KEY = "vck_test_gateway_key";
  process.env.JEV_HASH_SECRET = "test-hash-secret";
});

test.afterEach(() => {
  if (originalGatewayKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
  else process.env.AI_GATEWAY_API_KEY = originalGatewayKey;
  if (originalHashSecret === undefined) delete process.env.JEV_HASH_SECRET;
  else process.env.JEV_HASH_SECRET = originalHashSecret;
});

function request(body, { headers = {}, ...overrides } = {}) {
  return {
    method: "POST",
    headers: {
      host: "deonmenezes.com",
      origin: "https://deonmenezes.com",
      "x-forwarded-proto": "https",
      "x-real-ip": "203.0.113.42",
      ...headers,
    },
    body,
    ...overrides,
  };
}

function response() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    ended: false,
    setHeader(name, value) { this.headers[name] = value; },
    status(statusCode) { this.statusCode = statusCode; return this; },
    json(body) { this.body = body; return this; },
    end() { this.ended = true; return this; },
  };
}

const evaluation = {
  state: "I was charged twice.",
  questions: { wantsRefund: { type: "boolean", instructions: "Is the customer asking for a refund?" } },
};

function claimed(status = "ok", keyRequests = 0) {
  return [{ status, key_requests: keyRequests, day: "2026-09-19" }];
}

function gatewayOk(cost = "0") {
  return new Response(JSON.stringify({
    answers: { wantsRefund: { type: "boolean", probability: 0.97 } },
    usage: { inputTokens: 279, outputTokens: 20 },
    providerMetadata: { typesafe: { confidence: {} }, gateway: { cost, generationId: "gen_secret" } },
  }), { status: 200 });
}

test("key creation returns a djev key and stores only its hash", async () => {
  let params;
  const handler = createJevKeyHandler({ queryFn: async (_sql, values) => { params = values; return [{ inserted: 1 }]; } });
  const res = response();

  await handler(request({}), res);

  assert.equal(res.statusCode, 201);
  assert.match(res.body.key, /^djev_[A-Za-z0-9_-]{43}$/u);
  assert.equal(res.body.dailyRequests, JEV_LIMITS.keyDailyRequests);
  const [ipHash, keyHash, prefix, perIp, perSite] = params;
  assert.match(ipHash, /^[a-f0-9]{64}$/u);
  assert.notEqual(ipHash, "203.0.113.42");
  assert.equal(keyHash, hashKey(res.body.key));
  assert.equal(prefix, res.body.key.slice(0, 10));
  assert.equal(perIp, JEV_LIMITS.keysPerIpPerDay);
  assert.equal(perSite, JEV_LIMITS.keysPerDay);
  assert.ok(!params.includes(res.body.key));
});

test("key creation is same-origin only", async () => {
  const handler = createJevKeyHandler({ queryFn: async () => { throw new Error("db should not be called"); } });
  const res = response();

  await handler(request({}, { headers: { origin: "https://attacker.example" } }), res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "invalid_origin" });
});

test("key creation is rate limited per network", async () => {
  const handler = createJevKeyHandler({ queryFn: async () => [{ inserted: 0 }] });
  const res = response();

  await handler(request({}), res);

  assert.equal(res.statusCode, 429);
  assert.equal(res.headers["Retry-After"], "86400");
  assert.deepEqual(res.body, { error: "too_many_keys" });
});

test("evaluation proxies to the gateway and hides gateway metadata", async () => {
  const queries = [];
  let upstream;
  const handler = createJevHandler({
    queryFn: async (sql, values) => { queries.push({ sql, values }); return claimed("ok", 5); },
    fetchFn: async (url, options) => { upstream = { url, options }; return gatewayOk(); },
  });
  const res = response();

  await handler(request(evaluation, { headers: { authorization: `Bearer ${VALID_KEY}`, origin: "https://elsewhere.example" } }), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    model: "typesafe-ai/jev",
    answers: { wantsRefund: { type: "boolean", probability: 0.97 } },
    confidence: {},
    usage: { inputTokens: 279, outputTokens: 20 },
    remainingToday: JEV_LIMITS.keyDailyRequests - 6,
  });
  assert.equal(res.headers["Access-Control-Allow-Origin"], "*");
  assert.equal(upstream.url, "https://ai-gateway.vercel.sh/v4/ai/evaluation-model");
  assert.equal(upstream.options.headers.Authorization, "Bearer vck_test_gateway_key");
  assert.equal(upstream.options.headers["ai-model-id"], "typesafe-ai/jev");
  assert.deepEqual(JSON.parse(upstream.options.body), evaluation);
  assert.doesNotMatch(JSON.stringify(res.body), /vck_|gen_secret/u);
  const reserved = queries[0].values[2];
  assert.ok(reserved > 279, "the reservation must over-estimate so in-flight requests cannot outrun the budget");
  assert.deepEqual(queries[0].values, [
    hashKey(VALID_KEY), "*", reserved,
    JEV_LIMITS.keyDailyRequests, JEV_LIMITS.globalDailyRequests,
    JEV_LIMITS.globalDailyInputTokens, JEV_LIMITS.globalDailyCostUsd,
  ]);
  assert.deepEqual(queries[1].values, [hashKey(VALID_KEY), "*", 279, reserved, 0, "2026-09-19"]);
});

test("evaluation rejects missing, malformed, and unknown keys without calling the gateway", async () => {
  const fetchFn = async () => { throw new Error("gateway should not be called"); };
  const noDb = createJevHandler({ queryFn: async () => { throw new Error("db should not be called"); }, fetchFn });

  for (const authorization of [undefined, "Bearer nope", `Basic ${VALID_KEY}`]) {
    const res = response();
    await noDb(request(evaluation, { headers: authorization ? { authorization } : {} }), res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, "invalid_api_key");
  }

  const unknown = createJevHandler({ queryFn: async () => [], fetchFn });
  const res = response();
  await unknown(request(evaluation, { headers: { authorization: `Bearer ${VALID_KEY}` } }), res);
  assert.equal(res.statusCode, 401);
});

test("evaluation refuses when the database says a cap is spent, without calling the gateway", async () => {
  const fetchFn = async () => { throw new Error("gateway should not be called"); };
  for (const status of ["daily_limit_reached", "site_limit_reached"]) {
    const queries = [];
    const handler = createJevHandler({ queryFn: async (sql) => { queries.push(sql); return claimed(status, 1000); }, fetchFn });
    const res = response();
    await handler(request(evaluation, { headers: { authorization: `Bearer ${VALID_KEY}` } }), res);
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.error, status);
    assert.equal(res.headers["Retry-After"], "3600");
    assert.equal(queries.length, 1, "a refused request must not reconcile usage");
  }
});

test("the claim statement reserves tokens only when every cap allows the request", async () => {
  let sql;
  const handler = createJevHandler({ queryFn: async (statement) => { sql ??= statement; return claimed(); }, fetchFn: async () => gatewayOk() });
  await handler(request(evaluation, { headers: { authorization: `Bearer ${VALID_KEY}` } }), response());

  assert.match(sql, /revoked_at IS NULL/u);
  assert.match(sql, /site_tokens \+ \$3::bigint > \$6::bigint/u);
  assert.match(sql, /site_cost >= \$7::numeric/u);
  assert.match(sql, /WHERE status = 'ok'/u);
});

test("key creation always takes its lock and ignores the spoofable forwarded-for header", async () => {
  const seen = [];
  const handler = createJevKeyHandler({ queryFn: async (sql, values) => { seen.push({ sql, ip: values[0] }); return [{ inserted: 1 }]; } });

  await handler(request({}, { headers: { "x-forwarded-for": "1.1.1.1" } }), response());
  await handler(request({}, { headers: { "x-forwarded-for": "2.2.2.2" } }), response());
  await handler(request({}, { headers: { "x-real-ip": "198.51.100.7" } }), response());

  assert.equal(seen[0].ip, seen[1].ip, "changing x-forwarded-for must not look like a new network");
  assert.notEqual(seen[0].ip, seen[2].ip);
  assert.match(seen[0].sql, /FROM lock\s*\)/u, "lock must drive the FROM clause so it cannot be skipped");
});

test("key creation needs its own hash secret", async () => {
  delete process.env.JEV_HASH_SECRET;
  const handler = createJevKeyHandler({ queryFn: async () => { throw new Error("db should not be called"); } });
  const res = response();

  await handler(request({}), res);

  assert.equal(res.statusCode, 503);
});

test("evaluation records what the gateway reports it billed", async () => {
  const queries = [];
  const handler = createJevHandler({
    queryFn: async (sql, values) => { queries.push(values); return claimed(); },
    fetchFn: async () => gatewayOk("0.000011718"),
  });

  await handler(request(evaluation, { headers: { authorization: `Bearer ${VALID_KEY}` } }), response());

  assert.equal(queries[1][4], 0.000011718);
});

test("evaluation echoes caller validation errors but never account errors", async () => {
  const headers = { authorization: `Bearer ${VALID_KEY}` };
  const invalid = createJevHandler({
    queryFn: async () => claimed(),
    fetchFn: async () => new Response(JSON.stringify({ error: { message: "criteria: expected record" } }), { status: 400 }),
  });
  let res = response();
  await invalid(request(evaluation, { headers }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "criteria: expected record");

  const billing = createJevHandler({
    queryFn: async () => claimed(),
    fetchFn: async () => new Response(JSON.stringify({ error: { message: "AI Gateway requires a valid credit card on file" } }), { status: 402 }),
  });
  res = response();
  await billing(request(evaluation, { headers }), res);
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body, { error: "jev_upstream_failed" });
});

test("evaluation validates the request shape before touching the database", () => {
  assert.equal(validateEvaluation(evaluation), null);
  assert.match(validateEvaluation({ questions: evaluation.questions }), /state/u);
  assert.match(validateEvaluation({ state: "   ", questions: evaluation.questions }), /state/u);
  assert.match(validateEvaluation({ state: "x", questions: {} }), /at least one/u);
  assert.match(validateEvaluation({ state: "x", questions: { q: { type: "essay" } } }), /choice, score, or boolean/u);
  const many = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`q${i}`, { type: "boolean", instructions: "?" }]));
  assert.match(validateEvaluation({ state: "x", questions: many }), /At most 10/u);
});

test("evaluation answers CORS preflight and rejects other methods", async () => {
  const handler = createJevHandler({ queryFn: async () => [], fetchFn: async () => gatewayOk() });

  let res = response();
  await handler(request(null, { method: "OPTIONS" }), res);
  assert.equal(res.statusCode, 204);
  assert.equal(res.ended, true);
  assert.equal(res.headers["Access-Control-Allow-Headers"], "authorization, content-type");

  res = response();
  await handler(request(null, { method: "GET" }), res);
  assert.equal(res.statusCode, 405);
});

test("evaluation rejects oversized bodies", async () => {
  const handler = createJevHandler({ queryFn: async () => claimed(), fetchFn: async () => gatewayOk() });
  const res = response();

  await handler(request({ ...evaluation, state: "x".repeat(33 * 1024) }, { headers: { authorization: `Bearer ${VALID_KEY}` } }), res);

  assert.equal(res.statusCode, 413);
});

test("stats function delegates both jev rewrite targets", async () => {
  let res = response();
  await statsHandler(request(evaluation, { query: { route: "jev" } }), res);
  assert.equal(res.statusCode, 401);

  res = response();
  await statsHandler(request({}, { query: { route: "jev-keys" }, headers: { origin: "https://attacker.example" } }), res);
  assert.equal(res.statusCode, 403);
});

test("the /jev page, its rewrites, and its CSP line up", async () => {
  const [html, script, vercel] = await Promise.all([
    readFile(new URL("../jev.html", import.meta.url), "utf8"),
    readFile(new URL("../jev.js", import.meta.url), "utf8"),
    readFile(new URL("../vercel.json", import.meta.url), "utf8").then(JSON.parse),
  ]);

  assert.ok(html.includes("<h1>Deon X Jev</h1>"));
  assert.ok(html.includes('<link rel="canonical" href="https://deonmenezes.com/jev">'));
  assert.doesNotMatch(html, /\sstyle="/u, "page CSP has no 'unsafe-inline' for styles");
  assert.doesNotMatch(script, /innerHTML|\.style\./u);

  const rewrites = Object.fromEntries(vercel.rewrites.map((rule) => [rule.source, rule.destination]));
  assert.equal(rewrites["/api/jev"], "/api/stats?route=jev");
  assert.equal(rewrites["/api/jev/keys"], "/api/stats?route=jev-keys");

  const csp = vercel.headers.find((rule) => rule.source === "/jev").headers
    .find((header) => header.key === "Content-Security-Policy").value;
  assert.match(csp, /connect-src 'self'/u);
  assert.match(csp, /script-src 'self' https:\/\/www\.googletagmanager\.com/u);
});
