import assert from "node:assert/strict";
import test from "node:test";

import { createIssuesHandler, resetIssuesCache } from "../lib/issues.js";

const originalApiKey = process.env.RESEND_API_KEY;

test.beforeEach(() => {
  resetIssuesCache();
  process.env.RESEND_API_KEY = "test-api-key";
});

test.afterEach(() => {
  resetIssuesCache();
  if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalApiKey;
});

function request(query = {}) {
  return { method: "GET", query, headers: { host: "deonmenezes.com" } };
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

const BROADCASTS = {
  "id-old": {
    id: "id-old",
    status: "sent",
    subject: "Issue 1",
    preview_text: "First one",
    sent_at: "2026-08-01T10:00:00Z",
    html: "<p>one</p>",
  },
  "id-new": {
    id: "id-new",
    status: "sent",
    subject: "Issue 2",
    preview_text: "Second one",
    sent_at: "2026-08-08T10:00:00Z",
    html: "<p>two</p>",
  },
  "id-draft": { id: "id-draft", status: "draft", subject: "Not out yet", html: "<p>secret</p>" },
};

function fakeFetch(calls = []) {
  return async (url) => {
    calls.push(url);
    if (url === "https://api.resend.com/broadcasts") {
      return Response.json({
        data: Object.values(BROADCASTS).map(({ id, status, sent_at }) => ({ id, status, sent_at })),
      });
    }
    const id = url.split("/").pop();
    const broadcast = BROADCASTS[id];
    if (!broadcast) return new Response(null, { status: 404 });
    return Response.json(broadcast);
  };
}

test("archive lists only sent issues, newest first", async () => {
  const calls = [];
  const handler = createIssuesHandler({ fetchFn: fakeFetch(calls) });
  const res = response();

  await handler(request(), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.issues.map((i) => i.id), ["id-new", "id-old"]);
  assert.equal(res.body.issues[0].subject, "Issue 2");
  assert.equal(res.body.issues[0].preview, "Second one");
  assert.ok(!calls.some((url) => url.endsWith("id-draft")), "a draft must never be fetched");
});

test("archive never leaks issue bodies in the list", async () => {
  const handler = createIssuesHandler({ fetchFn: fakeFetch() });
  const res = response();

  await handler(request(), res);

  for (const issue of res.body.issues) {
    assert.equal(issue.html, undefined);
    assert.equal(issue.text, undefined);
  }
});

test("a single sent issue returns its html", async () => {
  const handler = createIssuesHandler({ fetchFn: fakeFetch() });
  const res = response();

  await handler(request({ id: "id-new" }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.subject, "Issue 2");
  assert.equal(res.body.html, "<p>two</p>");
});

test("a draft issue is not readable", async () => {
  const handler = createIssuesHandler({ fetchFn: fakeFetch() });
  const res = response();

  await handler(request({ id: "id-draft" }), res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: "issue_not_found" });
});

test("an unknown issue id returns 404", async () => {
  const handler = createIssuesHandler({ fetchFn: fakeFetch() });
  const res = response();

  await handler(request({ id: "nope" }), res);

  assert.equal(res.statusCode, 404);
});

test("archive reports unavailable when Resend fails", async () => {
  const handler = createIssuesHandler({
    fetchFn: async () => new Response(null, { status: 500 }),
  });
  const res = response();

  await handler(request(), res);

  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body, { error: "issues_unavailable" });
});

test("archive reports unavailable without an API key", async () => {
  delete process.env.RESEND_API_KEY;
  const handler = createIssuesHandler({ fetchFn: fakeFetch() });
  const res = response();

  await handler(request(), res);

  assert.equal(res.statusCode, 503);
});

test("archive results are cached between requests", async () => {
  const calls = [];
  const handler = createIssuesHandler({ fetchFn: fakeFetch(calls) });

  await handler(request(), response());
  const afterFirst = calls.length;
  await handler(request(), response());

  assert.equal(calls.length, afterFirst, "a second list request must be served from cache");
});
