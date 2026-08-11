import assert from "node:assert/strict";
import test from "node:test";

import { createBackfillCheckHandler, hasReplyFrom } from "../lib/backfill-check.js";

const original = process.env.BACKFILL_TOKEN;
test.beforeEach(() => { process.env.BACKFILL_TOKEN = "tok"; });
test.afterEach(() => {
  if (original === undefined) delete process.env.BACKFILL_TOKEN;
  else process.env.BACKFILL_TOKEN = original;
});

function response() {
  return {
    headers: {}, statusCode: null, body: null,
    setHeader(n, v) { this.headers[n] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
const request = (body) => ({ method: "POST", query: { token: "tok" }, headers: {}, body });

test("a reply from the account is detected by either username shape", () => {
  assert.ok(hasReplyFrom([{ username: "deon_tech" }], "deon_tech"));
  assert.ok(hasReplyFrom([{ from: { username: "Deon_Tech" } }], "deon_tech"));
  assert.equal(hasReplyFrom([{ username: "someone_else" }], "deon_tech"), false);
  assert.equal(hasReplyFrom([], "deon_tech"), false);
  assert.equal(hasReplyFrom([{ username: "deon_tech" }], ""), false);
});

test("comments are split into already replied and clean", async () => {
  const handler = createBackfillCheckHandler({
    fetchAccount: async () => ({ username: "deon_tech" }),
    fetchReplies: async (id) => (id === "111" ? [{ username: "deon_tech" }] : []),
  });
  const res = response();

  await handler(request({ comment_ids: ["111", "222"] }), res);

  assert.deepEqual(res.body.already_replied, ["111"]);
  assert.deepEqual(res.body.clean, ["222"]);
});

test("a comment whose replies cannot be read is treated as already replied", async () => {
  // Guessing "clean" would post a second public reply under someone's comment.
  const handler = createBackfillCheckHandler({
    fetchAccount: async () => ({ username: "deon_tech" }),
    fetchReplies: async () => { throw new Error("boom"); },
  });
  const res = response();

  await handler(request({ comment_ids: ["111"] }), res);

  assert.deepEqual(res.body.already_replied, ["111"]);
  assert.deepEqual(res.body.clean, []);
});

test("the check refuses without a valid token", async () => {
  const handler = createBackfillCheckHandler({ fetchAccount: async () => ({}), fetchReplies: async () => [] });
  const res = response();
  await handler({ method: "POST", query: { token: "no" }, headers: {}, body: { comment_ids: ["1"] } }, res);
  assert.equal(res.statusCode, 401);
});
