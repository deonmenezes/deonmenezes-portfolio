import assert from "node:assert/strict";
import test from "node:test";

import { addResendContact, isSubscribableEmail } from "../lib/resend-contacts.js";

const original = process.env.RESEND_AUDIENCE_ID;

test.afterEach(() => {
  if (original === undefined) delete process.env.RESEND_AUDIENCE_ID;
  else process.env.RESEND_AUDIENCE_ID = original;
});

function recordingFetch(requests, { existing = false } = {}) {
  return async (url, options) => {
    requests.push({ url, method: options?.method || "GET" });
    if ((options?.method || "GET") === "GET") {
      return new Response(null, { status: existing ? 200 : 404 });
    }
    return new Response(null, { status: 201 });
  };
}

test("a contact is enrolled in the audience, not created loose", async () => {
  // Regression guard: the bare /contacts endpoint returns 201 but leaves the
  // contact in no audience, so broadcasts never reach them.
  process.env.RESEND_AUDIENCE_ID = "aud-123";
  const requests = [];

  const outcome = await addResendContact("reader@example.com", {
    apiKey: "k",
    fetchFn: recordingFetch(requests),
  });

  assert.equal(outcome, "created");
  assert.deepEqual(requests, [
    { url: "https://api.resend.com/audiences/aud-123/contacts/reader%40example.com", method: "GET" },
    { url: "https://api.resend.com/audiences/aud-123/contacts", method: "POST" },
  ]);
});

test("an audience member already present is left alone", async () => {
  process.env.RESEND_AUDIENCE_ID = "aud-123";
  const requests = [];

  const outcome = await addResendContact("reader@example.com", {
    apiKey: "k",
    fetchFn: recordingFetch(requests, { existing: true }),
  });

  assert.equal(outcome, "existing");
  assert.equal(requests.length, 1, "an existing contact must not be re-created");
});

test("without an audience id the signup still lands rather than being lost", async () => {
  delete process.env.RESEND_AUDIENCE_ID;
  const requests = [];

  const outcome = await addResendContact("reader@example.com", {
    apiKey: "k",
    fetchFn: recordingFetch(requests),
  });

  assert.equal(outcome, "created");
  assert.equal(requests[1].url, "https://api.resend.com/contacts");
});

test("an explicit audienceId overrides the environment", async () => {
  process.env.RESEND_AUDIENCE_ID = "from-env";
  const requests = [];

  await addResendContact("reader@example.com", {
    apiKey: "k",
    audienceId: "explicit",
    fetchFn: recordingFetch(requests),
  });

  assert.ok(requests[0].url.includes("/audiences/explicit/"));
});

test("upstream failures are reported rather than swallowed", async () => {
  process.env.RESEND_AUDIENCE_ID = "aud-123";

  const serverError = await addResendContact("reader@example.com", {
    apiKey: "k",
    fetchFn: async () => new Response(null, { status: 500 }),
  });
  assert.equal(serverError, "failed");

  const thrown = await addResendContact("reader@example.com", {
    apiKey: "k",
    fetchFn: async () => {
      throw new Error("network down");
    },
  });
  assert.equal(thrown, "failed");
});

test("isSubscribableEmail normalizes and rejects junk", () => {
  assert.equal(isSubscribableEmail("  Reader@Example.COM "), "reader@example.com");
  assert.equal(isSubscribableEmail("not an email"), "");
  assert.equal(isSubscribableEmail(""), "");
  assert.equal(isSubscribableEmail(null), "");
  assert.equal(isSubscribableEmail(`${"a".repeat(250)}@example.com`), "");
});
