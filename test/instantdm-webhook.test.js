import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  createInstantDmWebhookHandler,
  extractEmails,
  matchSignatureVariant,
} from "../lib/instantdm-webhook.js";

const ENV_KEYS = [
  "RESEND_API_KEY",
  "INSTANTDM_WEBHOOK_TOKEN",
  "INSTANTDM_WEBHOOK_SECRET",
  "INSTANTDM_WEBHOOK_REQUIRE_SIGNATURE",
];
const original = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

test.beforeEach(() => {
  process.env.RESEND_API_KEY = "test-api-key";
  process.env.INSTANTDM_WEBHOOK_TOKEN = "token-abc";
  delete process.env.INSTANTDM_WEBHOOK_SECRET;
  delete process.env.INSTANTDM_WEBHOOK_REQUIRE_SIGNATURE;
});

test.afterEach(() => {
  for (const key of ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

function request(body, options = {}) {
  const { headers = {}, method = "POST" } = options;
  // "token" is read with `in` rather than a default so a test can pass an
  // explicit undefined to exercise the missing-token path.
  const token = "token" in options ? options.token : "token-abc";
  return {
    method,
    query: { token },
    headers: { host: "deonmenezes.com", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
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

function recordingFetch(requests, { existing = false } = {}) {
  return async (url, options) => {
    requests.push({ url, options });
    if (options?.method === "GET" || !options?.method) {
      return new Response(null, { status: existing ? 200 : 404 });
    }
    return new Response(null, { status: 201 });
  };
}

test("webhook subscribes the email answered inside a flow", async () => {
  const requests = [];
  const handler = createInstantDmWebhookHandler({ fetchFn: recordingFetch(requests) });
  const res = response();

  await handler(request({
    event: "question_answered",
    question_response: { question_type: "email", value: "  Reader@Example.COM " },
  }), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, event: "question_answered", added: 1, skipped: 0, failed: 0 });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, "https://api.resend.com/contacts/reader%40example.com");
  assert.deepEqual(JSON.parse(requests[1].options.body), { email: "reader@example.com" });
});

test("webhook leaves an existing contact untouched", async () => {
  const requests = [];
  const handler = createInstantDmWebhookHandler({
    fetchFn: recordingFetch(requests, { existing: true }),
  });
  const res = response();

  await handler(request({
    event: "flow_completed",
    contact_info: { email: "reader@example.com" },
  }), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, event: "flow_completed", added: 0, skipped: 1, failed: 0 });
  assert.equal(requests.length, 1, "an existing contact must not be re-created");
});

test("webhook rejects a wrong or missing token before reading the body", async () => {
  let called = false;
  const handler = createInstantDmWebhookHandler({
    fetchFn: async () => {
      called = true;
      return new Response(null, { status: 200 });
    },
  });

  for (const token of ["wrong-token", "", undefined]) {
    const res = response();
    await handler(request({ event: "question_answered", email: "a@b.com" }, { token }), res);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: "unauthorized" });
  }
  assert.equal(called, false);
});

test("webhook refuses to run when no token is configured", async () => {
  delete process.env.INSTANTDM_WEBHOOK_TOKEN;
  const handler = createInstantDmWebhookHandler({ fetchFn: async () => new Response(null, { status: 200 }) });
  const res = response();

  await handler(request({ event: "question_answered", email: "a@b.com" }), res);

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { error: "webhook_unconfigured" });
});

test("webhook only accepts POST", async () => {
  const handler = createInstantDmWebhookHandler({ fetchFn: async () => new Response(null, { status: 200 }) });
  const res = response();

  await handler(request({}, { method: "GET" }), res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "POST");
});

test("webhook ignores events that are not an answered question", async () => {
  let called = false;
  const handler = createInstantDmWebhookHandler({
    fetchFn: async () => {
      called = true;
      return new Response(null, { status: 404 });
    },
  });
  const res = response();

  await handler(request({ event: "dm_received", contact_info: { email: "reader@example.com" } }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.added, 0);
  assert.equal(called, false, "a non-subscribing event must never reach Resend");
});

test("extractEmails ignores addresses outside the answer subtrees", () => {
  const { emails } = extractEmails({
    event: "question_answered",
    sender_detail: { username: "someone", profile_email: "scraped@example.com" },
    account_owner: "deon.menezes@virelity.com",
    question_response: { value: "wanted@example.com" },
  });

  assert.deepEqual(emails, ["wanted@example.com"]);
});

test("extractEmails deduplicates and normalizes", () => {
  const { emails } = extractEmails({
    event: "flow_completed",
    answers: [
      { question_type: "email", value: "Reader@Example.com" },
      { question_type: "email", value: "reader@example.com" },
    ],
  });

  assert.deepEqual(emails, ["reader@example.com"]);
});

test("signature enforcement rejects an unsigned delivery when required", async () => {
  process.env.INSTANTDM_WEBHOOK_SECRET = "shhh";
  process.env.INSTANTDM_WEBHOOK_REQUIRE_SIGNATURE = "1";
  const handler = createInstantDmWebhookHandler({ fetchFn: async () => new Response(null, { status: 404 }) });
  const res = response();

  await handler(request({ event: "question_answered", email: "a@b.com" }), res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "bad_signature" });
});

test("signature enforcement accepts the hex HMAC variant", async () => {
  process.env.INSTANTDM_WEBHOOK_SECRET = "shhh";
  process.env.INSTANTDM_WEBHOOK_REQUIRE_SIGNATURE = "1";
  const body = JSON.stringify({ event: "question_answered", question_response: { value: "a@b.com" } });
  const signature = createHmac("sha256", "shhh").update(Buffer.from(body)).digest("hex");
  const handler = createInstantDmWebhookHandler({ fetchFn: async () => new Response(null, { status: 404 }) });
  const res = response();

  await handler(request(body, { headers: { "x-webhook-signature": signature } }), res);

  assert.equal(res.statusCode, 200);
});

test("matchSignatureVariant names the scheme that matched", () => {
  const raw = Buffer.from("payload");
  const hex = createHmac("sha256", "s").update(raw).digest("hex");
  const base64 = createHmac("sha256", "s").update(raw).digest("base64");

  assert.equal(matchSignatureVariant(raw, "s", hex), "hex");
  assert.equal(matchSignatureVariant(raw, "s", `sha256=${hex}`), "sha256-prefixed");
  assert.equal(matchSignatureVariant(raw, "s", base64), "base64");
  assert.equal(matchSignatureVariant(raw, "s", "nope"), "");
  assert.equal(matchSignatureVariant(raw, "", hex), "");
});
