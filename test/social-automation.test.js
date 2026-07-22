import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDeliveryText,
  buildFollowCard,
  extractCaptionKeyword,
  extractWebhookEvents,
  FOLLOW_CONFIRMATION_PAYLOAD,
  isMatch,
} from "../lib/social/automation.js";

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

test("webhook parser extracts comments, postbacks, and messages", () => {
  const events = extractWebhookEvents({ entry: [{ time: 100, changes: [{ field: "comments", value: { id: "c1", text: "LINK", from: { id: "u1", username: "person" }, media: { id: "m1" } } }], messaging: [{ sender: { id: "u1" }, recipient: { id: "business" }, timestamp: 101, postback: { payload: FOLLOW_CONFIRMATION_PAYLOAD } }, { sender: { id: "u1" }, recipient: { id: "business" }, timestamp: 102, message: { mid: "msg1", text: "hello" } }] }] });
  assert.deepEqual(events.map((event) => event.type), ["comment", "postback", "message"]);
  assert.equal(events[0].payload.mediaId, "m1");
});
