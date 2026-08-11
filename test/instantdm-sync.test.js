import assert from "node:assert/strict";
import test from "node:test";

import {
  extractConsentedEmails,
  gatherConsentedEmails,
  InstantDmAuthError,
  listFlowPosts,
} from "../lib/instantdm-sync.js";

function answer(overrides = {}) {
  return {
    question: "Drop your best email below and you're in 👇",
    question_type: "email",
    skip: false,
    user_response: "reader@example.com",
    updated_at: "2026-08-11T16:29:55Z",
    sender_id: "204354",
    ...overrides,
  };
}

test("an answered email question becomes a consent record", () => {
  const [record] = extractConsentedEmails(
    [{ created_at: "2026-08-11T14:46:58Z", question_response: [answer()] }],
    { postId: "post-1", flowId: "flow-1" },
  );

  assert.deepEqual(record, {
    email: "reader@example.com",
    consent_at: "2026-08-11T16:29:55Z",
    consent_prompt: "Drop your best email below and you're in 👇",
    source_post: "post-1",
    source_flow: "flow-1",
    instagram_sender_id: "204354",
  });
});

test("a skipped question is never treated as consent", () => {
  const found = extractConsentedEmails([
    { question_response: [answer({ skip: true })] },
  ]);

  assert.deepEqual(found, []);
});

test("only email questions count, whatever else the payload holds", () => {
  const found = extractConsentedEmails([
    {
      sender_detail: { profile_email: "scraped@example.com" },
      question_response: [answer({ question_type: "text", user_response: "someone@example.com" })],
    },
  ]);

  assert.deepEqual(found, [], "a free-text answer that looks like an email is not a subscription");
});

test("junk answers are dropped and addresses normalized", () => {
  const found = extractConsentedEmails([
    { question_response: [answer({ user_response: "Actually, just send it" })] },
    { question_response: [answer({ user_response: "  Reader@Example.COM " })] },
  ]);

  assert.deepEqual(found.map((r) => r.email), ["reader@example.com"]);
});

test("flow posts are discovered from the automation list", async () => {
  const fetchFn = async () => Response.json({
    data: [
      { post_id: "p1", flow_editor: true, flow_ids: { f1: {} } },
      { post_id: "p2", flow_editor: false, flow_ids: {} },
      { post_id: "p3", flow_editor: true, flow_ids: { f3: {} } },
    ],
  });

  const posts = await listFlowPosts({ token: "t", fetchFn });

  assert.deepEqual(posts, [
    { postId: "p1", flowId: "f1" },
    { postId: "p3", flowId: "f3" },
  ]);
});

test("the earliest consent wins when someone subscribes from two reels", async () => {
  const fetchFn = async (url) => {
    if (url.includes("/automate-post")) {
      return Response.json({
        data: [
          { post_id: "p1", flow_editor: true, flow_ids: { f1: {} } },
          { post_id: "p2", flow_editor: true, flow_ids: { f2: {} } },
        ],
      });
    }
    const late = url.includes("f2");
    return Response.json({
      data: [{ question_response: [answer({ updated_at: late ? "2026-08-11T20:00:00Z" : "2026-08-01T10:00:00Z" })] }],
    });
  };

  const { records, scanned } = await gatherConsentedEmails({ token: "t", fetchFn });

  assert.equal(scanned, 2);
  assert.equal(records.length, 1);
  assert.equal(records[0].consent_at, "2026-08-01T10:00:00Z");
  assert.equal(records[0].source_flow, "f1");
});

test("an expired token fails loudly instead of reporting zero subscribers", async () => {
  const fetchFn = async () => new Response(null, { status: 401 });

  await assert.rejects(
    () => gatherConsentedEmails({ token: "stale", fetchFn }),
    InstantDmAuthError,
  );
});

test("one unreadable flow does not abandon the rest", async () => {
  const fetchFn = async (url) => {
    if (url.includes("/automate-post")) {
      return Response.json({
        data: [
          { post_id: "p1", flow_editor: true, flow_ids: { f1: {} } },
          { post_id: "p2", flow_editor: true, flow_ids: { f2: {} } },
        ],
      });
    }
    if (url.includes("f1")) return new Response(null, { status: 500 });
    return Response.json({ data: [{ question_response: [answer()] }] });
  };

  const { records, failures } = await gatherConsentedEmails({ token: "t", fetchFn });

  assert.equal(records.length, 1);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].flowId, "f1");
});
