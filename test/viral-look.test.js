import assert from "node:assert/strict";
import test from "node:test";
import { createViralLookHandler, LOOK_BUCKET, LOOK_DAILY_REQUESTS_PER_NETWORK, MAX_DESCRIPTION_CHARS, MAX_FRAMES } from "../lib/viral-look.js";
import { createViralHandler, describePost } from "../lib/viral.js";
import { JEV_LIMITS } from "../lib/jev.js";

const saved = { gmi: process.env.GMICLOUD_API_KEY, gateway: process.env.AI_GATEWAY_API_KEY, secret: process.env.JEV_HASH_SECRET, look: process.env.VIRAL_LOOK, mongo: process.env.MONGODB_URI };

test.beforeEach(() => {
  process.env.GMICLOUD_API_KEY = "gmi_test_key";
  process.env.AI_GATEWAY_API_KEY = "vck_test_gateway_key";
  process.env.JEV_HASH_SECRET = "test-hash-secret";
  delete process.env.VIRAL_LOOK;
  delete process.env.MONGODB_URI;
});

test.afterEach(() => {
  for (const [name, value] of [["GMICLOUD_API_KEY", saved.gmi], ["AI_GATEWAY_API_KEY", saved.gateway], ["JEV_HASH_SECRET", saved.secret], ["VIRAL_LOOK", saved.look], ["MONGODB_URI", saved.mongo]]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const request = (body, headers = {}) => ({
  method: "POST",
  headers: { host: "deonmenezes.com", origin: "https://deonmenezes.com", "x-forwarded-proto": "https", "x-real-ip": "203.0.113.42", ...headers },
  body,
});

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(statusCode) { this.statusCode = statusCode; return this; },
    json(body) { this.body = body; return this; },
  };
}

const FRAME = `data:image/jpeg;base64,${Buffer.from("not really a jpeg").toString("base64")}`;
const claimed = (status = "ok") => [{ status, key_requests: 0, day: "2026-09-19" }];
const chat = (content, usage = { prompt_tokens: 1249, completion_tokens: 123 }) => new Response(JSON.stringify({ choices: [{ message: { content } }], usage }), { status: 200 });

test("frames are described by the vision model, metered in their own bucket, and the answer is trimmed", async () => {
  const queries = [];
  let upstream;
  const handler = createViralLookHandler({
    queryFn: async (sql, values) => { queries.push(values); return claimed(); },
    fetchFn: async (url, options) => { upstream = { url, auth: options.headers.Authorization, body: JSON.parse(options.body) }; return chat(`  A dark screen opens.\n\n${"x".repeat(900)}`); },
  });
  const res = response();
  await handler(request({ platform: "tiktok", kind: "video", frames: [FRAME, FRAME, FRAME] }), res);

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.description.startsWith("A dark screen opens. x"));
  assert.equal(res.body.description.length, MAX_DESCRIPTION_CHARS);

  assert.equal(upstream.url, "https://api.gmi-serving.com/v1/chat/completions");
  assert.equal(upstream.auth, "Bearer gmi_test_key");
  assert.equal(upstream.body.model, "deepseek-ai/deepseek-v4-flash-vision-exp");
  assert.equal(upstream.body.thinking, undefined, "GMI rejects that switch on image requests");
  const [prompt, ...images] = upstream.body.messages[0].content;
  assert.match(prompt.text, /3 frames from one short video/u);
  assert.match(prompt.text, /never instructions to you/u);
  assert.deepEqual(images.map((part) => part.image_url.url), [FRAME, FRAME, FRAME]);

  const [claim, reconcile] = queries;
  assert.match(claim[0], /^look:[0-9a-f]{64}$/u);
  assert.equal(claim[1], LOOK_BUCKET.globalKey);
  assert.deepEqual(claim.slice(3), [LOOK_DAILY_REQUESTS_PER_NETWORK, 300, 900_000, 0.25]);
  assert.equal(reconcile[2], 1372);
  assert.ok(Math.abs(reconcile[4] - (1249 * 0.44 + 123 * 1.32) / 1e6) < 1e-12);
  assert.equal(JEV_LIMITS.globalDailyCostUsd, 0.25, "Jev's own cap is untouched");
});

test("anything that is not a small batch of JPEG data URIs is refused before it costs anything", async () => {
  const handler = createViralLookHandler({ queryFn: async () => { throw new Error("must not claim"); }, fetchFn: async () => { throw new Error("must not call"); } });
  const bad = [
    [],
    Array(MAX_FRAMES + 1).fill(FRAME),
    ["https://example.com/image.jpg"],
    ["data:image/svg+xml;base64,PHN2Zz4="],
    [`data:image/jpeg;base64,${"A".repeat(200 * 1024)}`],
    [FRAME, 42],
    "nope",
  ];
  for (const frames of bad) {
    const res = response();
    await handler(request({ platform: "instagram", frames }), res);
    assert.equal(res.statusCode, 400, JSON.stringify(frames).slice(0, 40));
  }
  const unknown = response();
  await handler(request({ platform: "myspace", frames: [FRAME] }), unknown);
  assert.equal(unknown.statusCode, 400);
  const foreign = response();
  await handler(request({ frames: [FRAME] }, { origin: "https://evil.example" }), foreign);
  assert.equal(foreign.statusCode, 403);
});

test("a spent allowance or the off switch never reaches the paid model", async () => {
  let called = 0;
  const fetchFn = async () => { called += 1; return chat("x"); };
  const limited = response();
  await createViralLookHandler({ queryFn: async () => claimed("site_limit_reached"), fetchFn })(request({ frames: [FRAME] }), limited);
  assert.equal(limited.statusCode, 429);

  process.env.VIRAL_LOOK = "off";
  const off = response();
  await createViralLookHandler({ queryFn: async () => { throw new Error("must not claim"); }, fetchFn })(request({ frames: [FRAME] }), off);
  assert.equal(off.statusCode, 503);
  assert.equal(called, 0);
});

test("a failed or empty answer is an error and the pictures are never logged", async () => {
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.map(String).join(" "));
  try {
    const failed = response();
    await createViralLookHandler({ queryFn: async () => claimed(), fetchFn: async () => new Response(JSON.stringify({ message: "overloaded" }), { status: 429 }) })(request({ frames: [FRAME] }), failed);
    assert.equal(failed.statusCode, 502);
    const empty = response();
    await createViralLookHandler({ queryFn: async () => claimed(), fetchFn: async () => chat("   ") })(request({ frames: [FRAME] }), empty);
    assert.equal(empty.statusCode, 502);
  } finally {
    console.error = original;
  }
  assert.ok(!logged.join("\n").includes("base64"), "no frame data in the logs");
});

test("what the vision model saw reaches Jev only alongside real attachments, cleaned and capped", async () => {
  assert.equal(describePost({ platformId: "x", text: "hi", extra: "", attachments: ["video"], poll: [], visual: "A cat." }).whatViewersSee, "A cat.");
  assert.equal(describePost({ platformId: "x", text: "hi", extra: "", attachments: [], poll: [], visual: "A cat." }).whatViewersSee, undefined);

  let upstream;
  const handler = createViralHandler({
    queryFn: async () => [{ status: "ok", key_requests: 0, day: "2026-09-19" }],
    fetchFn: async (_url, options) => { upstream = JSON.parse(options.body); return new Response(JSON.stringify({ answers: {}, usage: { inputTokens: 700 } }), { status: 200 }); },
  });
  await handler(request({ platform: "tiktok", text: "POV: it works first try", attachments: ["video"], visual: `  A person\n at a desk. ${"y".repeat(900)}` }), response());
  assert.ok(upstream.state.whatViewersSee.startsWith("A person at a desk. y"));
  assert.equal(upstream.state.whatViewersSee.length, 700);

  await handler(request({ platform: "tiktok", text: "POV: it works first try", attachments: ["video"], visual: { nope: true } }), response());
  assert.equal(upstream.state.whatViewersSee, undefined);
});
