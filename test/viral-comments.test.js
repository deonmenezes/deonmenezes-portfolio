import assert from "node:assert/strict";
import test from "node:test";
import { COMMENT_BUCKET, COMMENT_DAILY_PER_NETWORK, MAX_COMMENTS, MAX_COMMENT_CHARS, commentKeyFor, createViralCommentsHandler } from "../lib/viral-comments.js";
import { deleteKeyFor } from "../lib/viral-media.js";

const NAMES = ["AI_GATEWAY_API_KEY", "JEV_HASH_SECRET", "VIRAL_COMMENTS"];
const saved = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));

test.beforeEach(() => {
  process.env.AI_GATEWAY_API_KEY = "vck_test_gateway_key";
  process.env.JEV_HASH_SECRET = "test-hash-secret";
  delete process.env.VIRAL_COMMENTS;
});

test.afterEach(() => {
  for (const name of NAMES) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

const ID = "1758300000000-abc123";

const request = (body, { method = "POST", query = {}, headers = {} } = {}) => ({
  method,
  query,
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

function database(docs) {
  const posts = {
    async findOne({ clientId }) { return docs.find((doc) => doc.clientId === clientId) || null; },
    async updateOne({ clientId }, change) {
      const doc = docs.find((entry) => entry.clientId === clientId);
      if (!doc) return { modifiedCount: 0 };
      if (change.$push) {
        const { $each, $slice } = change.$push.comments;
        doc.comments = [...(doc.comments || []), ...$each].slice($slice);
      }
      if (change.$pull) doc.comments = (doc.comments || []).filter((comment) => comment.id !== change.$pull.comments.id);
      return { modifiedCount: 1 };
    },
  };
  return { collection: () => posts };
}

function harness({ docs = [{ clientId: ID, text: "my reel about visas" }], report = 0.05, claim = "ok", gatewayStatus = 200 } = {}) {
  const calls = { queries: [], states: [] };
  const handler = createViralCommentsHandler({
    retryDelayMs: 0,
    queryFn: async (_sql, params) => { calls.queries.push(params); return [{ status: claim, key_requests: 0, day: "2026-09-20" }]; },
    getDatabaseFn: async () => database(docs),
    fetchFn: async (_url, options) => {
      calls.states.push(JSON.parse(options.body).state);
      return new Response(JSON.stringify({ answers: { report: { probability: report } }, usage: { inputTokens: 90 }, providerMetadata: { gateway: { cost: "0" } } }), { status: gatewayStatus });
    },
  });
  return { handler, calls, docs };
}

async function send(handler, body, options) {
  const res = response();
  await handler(request(body, options), res);
  return res;
}

const author = { handle: "deon_tech", name: "Deon", avatarUrl: "https://evil.example/x.png", verified: true };

test("a comment is checked by Jev, metered in its own bucket, stored clean, and readable by anyone", async () => {
  const { handler, calls, docs } = harness();
  const res = await send(handler, { action: "add", id: ID, text: "  Great   breakdown\nof the fee  ", author });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.comment.text, "Great breakdown of the fee");
  assert.equal(res.body.comment.handle, "deon_tech");
  assert.equal(res.body.comment.avatarUrl, null, "an avatar from anywhere but the allowed hosts is dropped");
  assert.equal(res.body.deleteKey, commentKeyFor(res.body.comment.id, "test-hash-secret"));
  assert.deepEqual(calls.states[0], { comment: "Great breakdown of the fee", onPost: "my reel about visas" });
  const [usageKey, globalKey, , perNetwork, siteRequests] = calls.queries[0];
  assert.match(usageKey, /^comment:[0-9a-f]{64}$/u);
  assert.equal(globalKey, "comment:*");
  assert.equal(perNetwork, COMMENT_DAILY_PER_NETWORK);
  assert.equal(siteRequests, COMMENT_BUCKET.limits.globalDailyRequests);
  assert.equal(docs[0].comments.length, 1);

  const read = await send(handler, undefined, { method: "GET", query: { id: ID }, headers: { origin: "https://elsewhere.example" } });
  assert.equal(read.statusCode, 200);
  assert.deepEqual(read.body.comments.map((comment) => comment.text), ["Great breakdown of the fee"]);
  assert.equal(read.body.comments[0].author, undefined);
});

test("a comment is refused when Jev would report it, cannot answer, or the rules are broken", async () => {
  const add = { action: "add", id: ID, text: "hello", author };
  const cases = [
    [add, { report: 0.8 }, 422],
    [add, { gatewayStatus: 500 }, 502],
    [add, { claim: "network_limit_reached" }, 429],
    [add, { docs: [] }, 404],
    [{ ...add, text: "   " }, {}, 400],
    [{ ...add, text: "x".repeat(MAX_COMMENT_CHARS + 1) }, {}, 400],
    [{ ...add, author: { handle: "../etc" } }, {}, 400],
    [{ ...add, id: "nope" }, {}, 400],
  ];
  for (const [body, options, status] of cases) {
    const { handler, docs } = harness(options);
    assert.equal((await send(handler, body)).statusCode, status, JSON.stringify(body).slice(0, 70));
    assert.equal(docs[0]?.comments, undefined, "nothing is stored");
  }

  assert.equal((await send(harness().handler, add, { headers: { origin: "https://evil.example" } })).statusCode, 403);
  process.env.VIRAL_COMMENTS = "off";
  assert.equal((await send(harness().handler, add)).statusCode, 503);
});

test("only the newest comments are kept", async () => {
  const docs = [{ clientId: ID, text: "post", comments: Array.from({ length: MAX_COMMENTS }, (_, index) => ({ id: `old${index}`, text: "old" })) }];
  const { handler } = harness({ docs });
  await send(handler, { action: "add", id: ID, text: "newest", author });
  assert.equal(docs[0].comments.length, MAX_COMMENTS);
  assert.equal(docs[0].comments.at(-1).text, "newest");
  assert.equal(docs[0].comments[0].id, "old1");
});

test("a comment is deleted by its writer or by the post's author, and by nobody else", async () => {
  const comment = (id) => ({ id, text: "hi", author: { handle: "a" }, createdAt: new Date() });
  const docs = [{ clientId: ID, text: "post", comments: [comment("aaaaaaaaaaaaaaaa"), comment("bbbbbbbbbbbbbbbb"), comment("cccccccccccccccc")] }];
  const { handler } = harness({ docs });
  const remove = (commentId, deleteKey) => send(handler, { action: "delete", id: ID, commentId, deleteKey });

  for (const key of [undefined, "nope", commentKeyFor("bbbbbbbbbbbbbbbb", "test-hash-secret"), deleteKeyFor("1758300000000-other1", "test-hash-secret")]) {
    assert.equal((await remove("aaaaaaaaaaaaaaaa", key)).statusCode, 403);
  }
  assert.equal(docs[0].comments.length, 3);

  assert.equal((await remove("aaaaaaaaaaaaaaaa", commentKeyFor("aaaaaaaaaaaaaaaa", "test-hash-secret"))).statusCode, 200);
  assert.equal((await remove("bbbbbbbbbbbbbbbb", deleteKeyFor(ID, "test-hash-secret"))).statusCode, 200, "the post's author moderates their own post");
  assert.deepEqual(docs[0].comments.map((entry) => entry.id), ["cccccccccccccccc"]);
});
