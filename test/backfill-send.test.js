import assert from "node:assert/strict";
import test from "node:test";

import { createBackfillSendHandler, MAX_BATCH, validateBatch } from "../lib/backfill-send.js";

const original = process.env.BACKFILL_TOKEN;

test.beforeEach(() => {
  process.env.BACKFILL_TOKEN = "tok";
});

test.afterEach(() => {
  if (original === undefined) delete process.env.BACKFILL_TOKEN;
  else process.env.BACKFILL_TOKEN = original;
});

function request(body, { token = "tok", method = "POST" } = {}) {
  return { method, query: { token }, headers: { host: "deonmenezes.com" }, body };
}

function response() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const MESSAGE = "Here is the link you asked for: https://arqio.app/";

test("a batch sends one private reply per comment id", async () => {
  const calls = [];
  const handler = createBackfillSendHandler({
    send: async (id, message) => calls.push({ id, message }),
    sleep: async () => {},
  });
  const res = response();

  await handler(request({ comment_ids: ["111", "222"], message: MESSAGE }), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    ok: true,
    sent: 2,
    failed: 0,
    results: [
      { comment_id: "111", ok: true },
      { comment_id: "222", ok: true },
    ],
  });
  assert.deepEqual(calls.map((c) => c.id), ["111", "222"]);
  assert.deepEqual(calls[0].message, { text: MESSAGE });
});

test("one failure does not stop the batch and is reported", async () => {
  const handler = createBackfillSendHandler({
    send: async (id) => {
      if (id === "222") throw new Error("The comment is invalid for a private reply");
      return {};
    },
    sleep: async () => {},
  });
  const res = response();

  await handler(request({ comment_ids: ["111", "222", "333"], message: MESSAGE }), res);

  assert.equal(res.body.sent, 2);
  assert.equal(res.body.failed, 1);
  assert.equal(res.body.results[1].ok, false);
  assert.match(res.body.results[1].error, /invalid for a private reply/u);
});

test("nothing sends without the right token", async () => {
  let called = false;
  const handler = createBackfillSendHandler({ send: async () => { called = true; }, sleep: async () => {} });

  for (const token of ["wrong", ""]) {
    const res = response();
    await handler(request({ comment_ids: ["111"], message: MESSAGE }, { token }), res);
    assert.equal(res.statusCode, 401);
  }
  assert.equal(called, false);
});

test("the batch size is capped so a send cannot run away", () => {
  const ids = Array.from({ length: MAX_BATCH + 1 }, (_, i) => String(1000 + i));
  assert.deepEqual(validateBatch({ comment_ids: ids, message: MESSAGE }), { error: "batch_too_large" });
});

test("the caller must name who to message", () => {
  assert.deepEqual(validateBatch({ comment_ids: [], message: MESSAGE }), { error: "no_comment_ids" });
  assert.deepEqual(validateBatch({ message: MESSAGE }), { error: "no_comment_ids" });
});

test("malformed or repeated ids are refused", () => {
  assert.deepEqual(validateBatch({ comment_ids: ["12a"], message: MESSAGE }), { error: "invalid_comment_id" });
  assert.deepEqual(validateBatch({ comment_ids: ["11", "11"], message: MESSAGE }), { error: "duplicate_comment_ids" });
});

test("an empty or oversized message is refused", () => {
  assert.deepEqual(validateBatch({ comment_ids: ["11"], message: "hi" }), { error: "message_too_short" });
  assert.deepEqual(validateBatch({ comment_ids: ["11"], message: "x".repeat(901) }), { error: "message_too_long" });
});

test("a valid batch passes validation unchanged", () => {
  assert.deepEqual(validateBatch({ comment_ids: [" 11 ", "22"], message: `  ${MESSAGE}  ` }), {
    ids: ["11", "22"],
    message: MESSAGE,
  });
});

test("only POST is accepted", async () => {
  const handler = createBackfillSendHandler({ send: async () => {}, sleep: async () => {} });
  const res = response();

  await handler(request({}, { method: "GET" }), res);

  assert.equal(res.statusCode, 405);
});
