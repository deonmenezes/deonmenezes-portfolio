import assert from "node:assert/strict";
import test from "node:test";
import { createNewsletterHandler } from "../lib/newsletter.js";
import { enforceNewsletterRateLimit } from "../lib/newsletter-rate-limit.js";
import statsHandler from "../api/stats.js";

const handler = createNewsletterHandler({ allowSignup: async () => true });
const originalFetch = globalThis.fetch;
const originalApiKey = process.env.RESEND_API_KEY;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalApiKey;
});

function request(body, { headers = {}, ...overrides } = {}) {
  return {
    method: "POST",
    headers: {
      host: "deonmenezes.com",
      origin: "https://deonmenezes.com",
      "x-forwarded-proto": "https",
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
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("newsletter signup normalizes the email and creates a Resend contact", async () => {
  process.env.RESEND_API_KEY = "test-api-key";
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(null, { status: requests.length === 1 ? 404 : 201 });
  };
  const res = response();

  await handler(request({ email: "  Reader@Example.COM  " }), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, status: "accepted" });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, "https://api.resend.com/contacts/reader%40example.com");
  assert.equal(requests[0].options.method, "GET");
  assert.equal(requests[1].url, "https://api.resend.com/contacts");
  assert.equal(requests[1].options.method, "POST");
  assert.equal(requests[1].options.headers.Authorization, "Bearer test-api-key");
  assert.equal(requests[1].options.headers["Content-Type"], "application/json");
  assert.ok(requests[1].options.headers["User-Agent"]);
  assert.ok(requests[1].options.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    email: "reader@example.com",
  });
});

test("newsletter rejects invalid email addresses", async () => {
  process.env.RESEND_API_KEY = "test-api-key";
  globalThis.fetch = async () => {
    throw new Error("fetch should not be called");
  };
  const res = response();

  await handler(request({ email: "not-an-email" }), res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "invalid_email" });
});

test("newsletter rejects requests from another origin", async () => {
  process.env.RESEND_API_KEY = "test-api-key";
  globalThis.fetch = async () => {
    throw new Error("fetch should not be called");
  };
  const res = response();

  await handler(request({ email: "reader@example.com" }, {
    headers: { origin: "https://attacker.example" },
  }), res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "invalid_origin" });
});

test("newsletter silently accepts honeypot submissions without calling Resend", async () => {
  delete process.env.RESEND_API_KEY;
  globalThis.fetch = async () => {
    throw new Error("fetch should not be called");
  };
  const res = response();

  await handler(request({ email: "bot@example.com", company: "Spambots Inc." }), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
});

test("newsletter leaves existing contact subscription preferences unchanged", async () => {
  process.env.RESEND_API_KEY = "test-api-key";
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(null, { status: 200 });
  };
  const res = response();

  await handler(request({ email: "reader@example.com" }), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, status: "accepted" });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.resend.com/contacts/reader%40example.com");
  assert.equal(requests[0].options.method, "GET");
});

test("newsletter returns a generic error when Resend fails", async () => {
  process.env.RESEND_API_KEY = "test-api-key";
  globalThis.fetch = async () => new Response(JSON.stringify({
    message: "sensitive upstream detail",
  }), { status: 500 });
  const res = response();

  await handler(request({ email: "reader@example.com" }), res);

  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body, { error: "newsletter_unavailable" });
  assert.doesNotMatch(JSON.stringify(res.body), /sensitive|reader@example\.com|test-api-key/u);
});

test("newsletter returns 503 when the Resend API key is missing", async () => {
  delete process.env.RESEND_API_KEY;
  globalThis.fetch = async () => {
    throw new Error("fetch should not be called");
  };
  const res = response();

  await handler(request({ email: "reader@example.com" }), res);

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { error: "newsletter_unavailable" });
});

test("newsletter only accepts POST requests", async () => {
  const res = response();

  await handler(request(null, { method: "GET" }), res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "POST");
  assert.deepEqual(res.body, { error: "method_not_allowed" });
});

test("newsletter rate limits excessive signup attempts before calling Resend", async () => {
  process.env.RESEND_API_KEY = "test-api-key";
  let fetchCalled = false;
  const limitedHandler = createNewsletterHandler({
    allowSignup: async () => false,
    fetchFn: async () => {
      fetchCalled = true;
      return new Response(null, { status: 201 });
    },
  });
  const res = response();

  await limitedHandler(request({ email: "reader@example.com" }), res);

  assert.equal(res.statusCode, 429);
  assert.equal(res.headers["Retry-After"], "3600");
  assert.deepEqual(res.body, { error: "newsletter_too_many_requests" });
  assert.equal(fetchCalled, false);
});

test("newsletter rate limiter stores only keyed hashes", async () => {
  let sql;
  let params;
  const allowed = await enforceNewsletterRateLimit(
    request({}, { headers: { "x-forwarded-for": "203.0.113.42" } }),
    "reader@example.com",
    "rate-limit-secret",
    async (statement, values) => {
      sql = statement;
      params = values;
      return [{ inserted: 2 }];
    },
  );

  assert.equal(allowed, true);
  assert.match(sql, /newsletter_signup_attempts/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /ORDER BY key_hash/);
  assert.equal(params.length, 2);
  assert.notEqual(params[0], "203.0.113.42");
  assert.notEqual(params[1], "reader@example.com");
  assert.match(params[0], /^[a-f0-9]{64}$/u);
  assert.match(params[1], /^[a-f0-9]{64}$/u);
});

test("stats function delegates the newsletter rewrite target", async () => {
  const res = response();

  await statsHandler(request({ email: "not-an-email" }, {
    query: { route: "newsletter" },
  }), res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "invalid_email" });
});

test("newsletter rejects oversized JSON bodies", async () => {
  const res = response();

  await handler(request(JSON.stringify({ email: "reader@example.com", padding: "x".repeat(4096) })), res);

  assert.equal(res.statusCode, 413);
  assert.deepEqual(res.body, { error: "payload_too_large" });
});
