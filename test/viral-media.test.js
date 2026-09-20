import assert from "node:assert/strict";
import test from "node:test";
import { ABANDONED_AFTER_MS, createViralMediaHandler, isOwnMediaUrl, MAX_VIDEO_BYTES, MEDIA_BUCKET, MEDIA_DAILY_UPLOADS_PER_NETWORK, mediaKeyFor } from "../lib/viral-media.js";

const NAMES = ["BLOB_READ_WRITE_TOKEN", "JEV_HASH_SECRET", "VIRAL_MEDIA", "VIRAL_MEDIA_BUDGET_MB"];
const saved = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));

test.beforeEach(() => {
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_StoreABC123_secretpart";
  process.env.JEV_HASH_SECRET = "test-hash-secret";
  delete process.env.VIRAL_MEDIA;
  delete process.env.VIRAL_MEDIA_BUDGET_MB;
});

test.afterEach(() => {
  for (const name of NAMES) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

const ID = "1758300000000-abc123";
const HOST = "https://storeabc123.public.blob.vercel-storage.com";
const NOW = Date.parse("2026-09-20T12:00:00Z");
const key = (id = ID) => mediaKeyFor(id, "test-hash-secret");

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

// A small stand-in for the posts collection that honours the filters the handler relies on.
function matches(doc, filter) {
  return Object.entries(filter).every(([name, want]) => {
    const value = doc[name];
    if (want && typeof want === "object" && !(want instanceof Date)) {
      if ("$exists" in want) return (value !== undefined) === want.$exists;
      if ("$type" in want) return typeof value === want.$type;
      if ("$lt" in want) return value !== undefined && value < want.$lt;
      throw new Error(`unsupported filter ${JSON.stringify(want)}`);
    }
    return value === want;
  });
}

function database(docs) {
  const posts = {
    async findOne(filter) {
      const doc = docs.find((entry) => matches(entry, filter));
      return doc ? { ...doc } : null;
    },
    find(filter) {
      const rows = docs.filter((doc) => matches(doc, filter)).sort((a, b) => a.mediaAt - b.mediaAt).map((doc) => ({ ...doc }));
      return { sort: () => ({ limit: (count) => ({ toArray: async () => rows.slice(0, count) }) }) };
    },
    async updateOne(filter, change) {
      const doc = docs.find((entry) => matches(entry, filter));
      if (!doc) return { modifiedCount: 0 };
      Object.assign(doc, change.$set);
      for (const name of Object.keys(change.$unset || {})) delete doc[name];
      return { modifiedCount: 1 };
    },
  };
  return { collection: () => posts };
}

function harness({ docs = [{ clientId: ID, attachments: ["video"] }], claim = "ok", head = { size: 1000, contentType: "video/mp4" }, now = NOW } = {}) {
  const calls = { queries: [], tokens: [], deleted: [] };
  const handler = createViralMediaHandler({
    nowFn: () => now,
    queryFn: async (_sql, params) => { calls.queries.push(params); return [{ status: claim, key_requests: 0, day: "2026-09-20" }]; },
    getDatabaseFn: async () => database(docs),
    sdkFn: async () => ({
      tokenFn: async (options) => { calls.tokens.push(options); return "vercel_blob_client_test"; },
      headFn: async () => head,
      delFn: async (url) => { calls.deleted.push(url); },
    }),
  });
  return { handler, calls, docs };
}

async function send(handler, body, headers) {
  const res = response();
  await handler(request(body, headers), res);
  return res;
}

test("only the publisher gets an upload token: one exact path, sized and typed, written once", async () => {
  const { handler, calls, docs } = harness();
  const res = await send(handler, { action: "grant", id: ID, mediaKey: key(), contentType: "video/mp4", size: 5 * 1024 * 1024 });

  assert.equal(res.statusCode, 200);
  assert.match(res.body.pathname, new RegExp(`^viral/${ID}-[0-9a-f]{24}\\.mp4$`, "u"));
  assert.equal(docs[0].mediaPath, res.body.pathname, "the granted path is remembered, so only it can attach");
  const [token] = calls.tokens;
  assert.equal(token.pathname, res.body.pathname);
  assert.equal(token.maximumSizeInBytes, 5 * 1024 * 1024);
  assert.deepEqual(token.allowedContentTypes, ["video/mp4"]);
  assert.equal(token.addRandomSuffix, false, "a random suffix would let one token write many files");
  assert.equal(token.allowOverwrite, false);
  assert.ok(token.validUntil - NOW <= 10 * 60_000);

  const [usageKey, globalKey, reservedKb, perNetwork, siteRequests, siteKb] = calls.queries[0];
  assert.match(usageKey, /^media:[0-9a-f]{64}$/u);
  assert.equal(globalKey, "media:*");
  assert.equal(reservedKb, 5 * 1024, "the budget is counted in kilobytes");
  assert.equal(perNetwork, MEDIA_DAILY_UPLOADS_PER_NETWORK);
  assert.equal(siteRequests, MEDIA_BUCKET.limits.globalDailyRequests);
  assert.equal(siteKb, MEDIA_BUCKET.limits.globalDailyInputTokens);

  const second = await send(handler, { action: "grant", id: ID, mediaKey: key(), contentType: "video/mp4", size: 1000 });
  assert.equal(second.statusCode, 409, "one grant per post");
  assert.equal(calls.tokens.length, 1);
  assert.equal(calls.queries.length, 1, "and the refusal is not metered");

  for (const mediaKey of [undefined, "nope", key("1758300000000-other1"), "0".repeat(64)]) {
    assert.equal((await send(harness().handler, { action: "grant", id: ID, mediaKey, contentType: "video/mp4", size: 1000 })).statusCode, 403);
  }
});

test("a grant is refused for the wrong file, a missing post, a spent limit, another origin, or when switched off", async () => {
  const grant = { action: "grant", id: ID, mediaKey: key(), contentType: "video/mp4", size: 1000 };
  const cases = [
    [{ ...grant, contentType: "image/png" }, {}, 400],
    [{ ...grant, contentType: "text/html" }, {}, 400],
    [{ ...grant, size: MAX_VIDEO_BYTES + 1 }, {}, 413],
    [{ ...grant, size: -5 }, {}, 413],
    [grant, { docs: [] }, 404],
    [grant, { docs: [{ clientId: ID, attachments: ["image"] }] }, 404],
    [grant, { docs: [{ clientId: ID, attachments: ["video"], mediaPath: `viral/${ID}-aa.mp4`, mediaUrl: `${HOST}/viral/${ID}-aa.mp4`, mediaAt: new Date(NOW) }] }, 409],
    [grant, { claim: "network_limit_reached" }, 429],
  ];
  for (const [body, options, status] of cases) {
    const { handler, calls } = harness(options);
    assert.equal((await send(handler, body)).statusCode, status, JSON.stringify(body).slice(0, 80));
    assert.equal(calls.tokens.length, 0);
  }

  assert.equal((await send(harness().handler, grant, { origin: "https://evil.example" })).statusCode, 403);
  process.env.VIRAL_MEDIA = "off";
  assert.equal((await send(harness().handler, grant)).statusCode, 503);
});

test("a grant alone evicts nobody; a landed upload pushes out the oldest videos, only as many as needed", async () => {
  process.env.VIRAL_MEDIA_BUDGET_MB = "100";
  const mb = 1024 * 1024;
  const docs = [
    { clientId: ID, attachments: ["video"] },
    { clientId: "old-post-0001", attachments: ["video"], mediaPath: "viral/old-post-0001-a.mp4", mediaUrl: `${HOST}/viral/old-post-0001-a.mp4`, mediaBytes: 40 * mb, mediaAt: new Date(NOW - 2000) },
    { clientId: "mid-post-0002", attachments: ["video"], mediaPath: "viral/mid-post-0002-b.mp4", mediaUrl: `${HOST}/viral/mid-post-0002-b.mp4`, mediaBytes: 40 * mb, mediaAt: new Date(NOW - 1000) },
  ];
  const { handler, calls } = harness({ docs, head: { size: 30 * mb, contentType: "video/webm" } });
  const granted = await send(handler, { action: "grant", id: ID, mediaKey: key(), contentType: "video/webm", size: 30 * mb });
  assert.equal(granted.statusCode, 200);
  assert.deepEqual(calls.deleted, [], "claiming 30 MB without uploading deletes nothing");

  const attached = await send(handler, { action: "attach", id: ID, mediaKey: key(), url: `${HOST}/${granted.body.pathname}` });
  assert.equal(attached.statusCode, 200);
  assert.deepEqual(calls.deleted, [`${HOST}/viral/old-post-0001-a.mp4`]);
  assert.equal(docs[1].mediaUrl, undefined);
  assert.equal(docs[1].mediaPath, undefined);
  assert.ok(docs[2].mediaUrl && docs[0].mediaUrl);
});

test("attach accepts only the exact granted file, once, and a lost race deletes nothing", async () => {
  const path = `viral/${ID}-0123456789abcdef01234567.mp4`;
  const url = `${HOST}/${path}`;
  const granted = () => [{ clientId: ID, attachments: ["video"], mediaPath: path, mediaBytes: 1000, mediaAt: new Date(NOW) }];

  const { handler, docs, calls } = harness({ docs: granted() });
  assert.equal((await send(handler, { action: "attach", id: ID, mediaKey: key(), url })).statusCode, 200);
  assert.equal(docs[0].mediaUrl, url);
  assert.equal(docs[0].mediaBytes, 1000);
  assert.equal((await send(handler, { action: "attach", id: ID, mediaKey: key(), url })).statusCode, 409);
  assert.deepEqual(calls.deleted, [], "the second attach names the same file and must not delete it");

  assert.equal((await send(harness().handler, { action: "attach", id: ID, mediaKey: key(), url })).statusCode, 400, "no grant, no attach");

  for (const bad of [
    `https://evil.example/${path}`,
    `https://otherstore.public.blob.vercel-storage.com/${path}`,
    `${HOST}/viral/${ID}-ffffffffffffffffffffffff.mp4`,
    `${HOST}/viral/${ID}-abc123-0123456789abcdef01234567.mp4`,
    `${url}?download=1`,
    `${HOST}/viral/../${path}`,
    url.replace("https", "http"),
    42,
  ]) {
    const attempt = harness({ docs: granted() });
    assert.equal((await send(attempt.handler, { action: "attach", id: ID, mediaKey: key(), url: bad })).statusCode, 400, String(bad));
    assert.deepEqual(attempt.calls.deleted, []);
  }

  const oversized = harness({ docs: granted(), head: { size: MAX_VIDEO_BYTES + 1, contentType: "video/mp4" } });
  assert.equal((await send(oversized.handler, { action: "attach", id: ID, mediaKey: key(), url })).statusCode, 400);
  assert.deepEqual(oversized.calls.deleted, [url], "a file that broke the rules is removed");
  assert.equal(oversized.docs[0].mediaPath, undefined);
});

test("a post whose id is a prefix of another's cannot claim or delete the other's video", async () => {
  const victimPath = "viral/1758300000000-abc123-0123456789abcdef01234567.mp4";
  const docs = [
    { clientId: "1758300000000-abc123", attachments: ["video"], mediaPath: victimPath, mediaUrl: `${HOST}/${victimPath}`, mediaBytes: 1000, mediaAt: new Date(NOW) },
    { clientId: "1758300000000", attachments: ["video"], mediaPath: "viral/1758300000000-aaaaaaaaaaaaaaaaaaaaaaaa.mp4", mediaBytes: 1000, mediaAt: new Date(NOW) },
  ];
  const { handler, calls } = harness({ docs });
  const res = await send(handler, { action: "attach", id: "1758300000000", mediaKey: key("1758300000000"), url: `${HOST}/${victimPath}` });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(calls.deleted, []);
  assert.equal(docs[1].mediaUrl, undefined);
});

test("a grant that never attached is swept, file and all, after half an hour", async () => {
  const stale = { clientId: "stale-post-0001", attachments: ["video"], mediaPath: "viral/stale-post-0001-bb.mp4", mediaBytes: 9000, mediaAt: new Date(NOW - ABANDONED_AFTER_MS - 1000) };
  const recent = { clientId: "fresh-post-0002", attachments: ["video"], mediaPath: "viral/fresh-post-0002-cc.mp4", mediaBytes: 9000, mediaAt: new Date(NOW - 60_000) };
  const docs = [{ clientId: ID, attachments: ["video"] }, stale, recent];
  const { handler, calls } = harness({ docs });
  await send(handler, { action: "grant", id: ID, mediaKey: key(), contentType: "video/mp4", size: 1000 });
  assert.deepEqual(calls.deleted, [`${HOST}/viral/stale-post-0001-bb.mp4`]);
  assert.equal(stale.mediaPath, undefined);
  assert.ok(recent.mediaPath, "an upload still in progress is left alone");
});

test("isOwnMediaUrl is an exact match on this store's host", () => {
  const host = "storeabc123.public.blob.vercel-storage.com";
  const path = `viral/${ID}-abc.webm`;
  assert.ok(isOwnMediaUrl(`https://${host}/${path}`, path, host));
  assert.ok(!isOwnMediaUrl(`https://${host}.evil.example/${path}`, path, host));
  assert.ok(!isOwnMediaUrl(`https://${host}/${path}`, undefined, host));
  assert.ok(!isOwnMediaUrl(`https://${host}/${path}`, path, null));
  assert.ok(!isOwnMediaUrl(`https://${host}/viral/../x.mp4`, "viral/../x.mp4", host));
});
