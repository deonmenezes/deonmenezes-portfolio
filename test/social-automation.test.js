import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDeliveryText,
  buildFlowMessages,
  buildFlowPlan,
  buildFollowCard,
  extractCaptionKeyword,
  extractWebhookEvents,
  FOLLOW_CONFIRMATION_PAYLOAD,
  isMatch,
} from "../lib/social/automation.js";
import { broadcastMessage } from "../lib/social/broadcast.js";
import { sendMessage } from "../lib/social/meta.js";

test("extractCaptionKeyword understands Instagram caption quotes", () => {
  assert.equal(extractCaptionKeyword('Comment “Link” and I will send it'), "LINK");
  assert.equal(extractCaptionKeyword("comment India🇮🇳 to get the links"), "INDIA");
  assert.equal(extractCaptionKeyword("No call to action"), "");
});

test("comment matching supports exact aliases and all-comments flows", () => {
  assert.equal(isMatch("tool", "LINK, TOOL, DOC, 🔗", "exact"), true);
  assert.equal(isMatch("🔗", "LINK, TOOL, DOC, 🔗", "exact"), true);
  assert.equal(isMatch("please send link", "LINK, TOOL, DOC, 🔗", "exact"), false);
  assert.equal(isMatch("anything", "*", "exact"), true);
  assert.equal(isMatch("please send the link", "LINK", "contains"), true);
  assert.equal(isMatch("please send the tool", "LINK", "contains"), false);
});

test("follow card has the required interactive buttons", () => {
  const card = buildFollowCard("42");
  const buttons = card.attachment.payload.buttons;
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].type, "web_url");
  assert.equal(buttons[1].type, "postback");
  assert.ok(Array.from(buttons[1].title).length <= 20);
  assert.equal(buttons[1].payload, `${FOLLOW_CONFIRMATION_PAYLOAD}:42`);
});

test("delivery text uses deonmenezes.com tracking links", () => {
  const text = buildDeliveryText({ id: "automation-id", response_text: "Here it is", resource_links: [{ label: "Guide", url: "https://example.com" }] }, 42, "https://deonmenezes.com");
  assert.match(text, /https:\/\/deonmenezes\.com\/go\/automation-id\/0\?d=42/u);
  assert.doesNotMatch(text, /example\.com/u);
});

test("flow steps can deliver multiple messages and interactive buttons", () => {
  const messages = buildFlowMessages({
    id: "automation-id",
    flow_steps: [
      { type: "message", text: "Here is the guide." },
      { type: "button", text: "Choose an option", buttons: [{ type: "web_url", title: "Open guide", url: "https://example.com/guide" }, { type: "postback", title: "Continue", payload: "FLOW_CONTINUE" }] },
    ],
    resource_links: [],
  }, 42, "https://deonmenezes.com");
  assert.equal(messages.length, 2);
  assert.equal(messages[0].text, "Here is the guide.");
  assert.equal(messages[1].attachment.payload.buttons[0].type, "web_url");
  assert.equal(messages[1].attachment.payload.buttons[1].payload, "FLOW_CONTINUE:42:1");
});

test("flow plans preserve durable delays between message steps", () => {
  const plan = buildFlowPlan({ id: "automation-id", flow_steps: [{ type: "message", text: "First" }, { type: "delay", seconds: 30 }, { type: "message", text: "Second" }], resource_links: [] }, 9, "https://deonmenezes.com");
  assert.equal(plan.length, 2);
  assert.equal(plan[0].delaySeconds, 0);
  assert.equal(plan[1].delaySeconds, 30);
  assert.equal(plan[1].message.text, "Second");
});

test("flow conditions choose the branch from webhook context", () => {
  const followed = buildFlowPlan({ id: "automation-id", flow_steps: [{ type: "condition", condition: "follows", yesText: "Welcome back", noText: "Please follow first" }], resource_links: [] }, 10, "https://deonmenezes.com", { follows: true });
  assert.equal(followed[0].message.text, "Welcome back");
});

test("webhook parser extracts comments, postbacks, and messages", () => {
  const events = extractWebhookEvents({ entry: [{ time: 100, changes: [{ field: "comments", value: { id: "c1", text: "LINK", from: { id: "u1", username: "person" }, media: { id: "m1" } } }], messaging: [{ sender: { id: "u1" }, recipient: { id: "business" }, timestamp: 101, postback: { payload: FOLLOW_CONFIRMATION_PAYLOAD } }, { sender: { id: "u1" }, recipient: { id: "business" }, timestamp: 102, message: { mid: "msg1", text: "hello" } }] }] });
  assert.deepEqual(events.map((event) => event.type), ["comment", "postback", "message"]);
  assert.equal(events[0].payload.mediaId, "m1");
});

test("webhook parser extracts story mention events", () => {
  const events = extractWebhookEvents({ entry: [{ time: 200, changes: [{ field: "mentions", value: { id: "mention-1", from: { id: "u2", username: "viewer" }, media_id: "story-1" } }] }] });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "mention");
  assert.equal(events[0].payload.commenterId, "u2");
});

test("webhook parser marks live comments for one-shot delivery", () => {
  const events = extractWebhookEvents({ entry: [{ time: 300, changes: [{ field: "live_comments", value: { id: "live-c1", text: "LINK", from: { id: "u3" }, media: { id: "live-1" } } }] }] });
  assert.equal(events[0].type, "comment");
  assert.equal(events[0].payload.live, true);
});

test("broadcast messages enforce the Instagram message limit", () => {
  assert.deepEqual(broadcastMessage("Hello"), { text: "Hello" });
  assert.throws(() => broadcastMessage("x".repeat(1001)), /under 1000/u);
});

test("Instagram direct messages use the Graph API message shape", async () => {
  const previousFetch = globalThis.fetch;
  const previousToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const previousAccount = process.env.INSTAGRAM_ACCOUNT_ID;
  let requestBody;
  process.env.INSTAGRAM_ACCESS_TOKEN = "test-token";
  process.env.INSTAGRAM_ACCOUNT_ID = "123456789";
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ message_id: "m1", recipient_id: "u1" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await sendMessage("u1", { text: "Hello" });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.INSTAGRAM_ACCESS_TOKEN;
    else process.env.INSTAGRAM_ACCESS_TOKEN = previousToken;
    if (previousAccount === undefined) delete process.env.INSTAGRAM_ACCOUNT_ID;
    else process.env.INSTAGRAM_ACCOUNT_ID = previousAccount;
  }
  assert.deepEqual(requestBody, { recipient: { id: "u1" }, message: { text: "Hello" } });
});
