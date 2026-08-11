import assert from "node:assert/strict";
import test from "node:test";

import { asksFor, hoursLeftInWindow, planBackfill } from "../lib/comment-backfill.js";

const NOW = new Date("2026-08-11T18:00:00Z");

function comment(overrides = {}) {
  return {
    id: `c${Math.random().toString(36).slice(2, 8)}`,
    text: "Link",
    timestamp: "2026-08-11T10:00:00+0000",
    username: "someone",
    from: { id: "s1", username: "someone" },
    ...overrides,
  };
}

test("keyword matching is whole word and punctuation tolerant", () => {
  assert.ok(asksFor("Link", "link"));
  assert.ok(asksFor("link please!", "link"));
  assert.ok(asksFor("Please send the LINK 🙏", "link"));
  assert.equal(asksFor("linkedin", "link"), false, "a substring must not count");
  assert.equal(asksFor("blinking", "link"), false);
  assert.equal(asksFor("nice reel", "link"), false);
});

test("the private reply window closes 7 days after the comment", () => {
  assert.equal(Math.round(hoursLeftInWindow("2026-08-11T18:00:00+0000", NOW)), 168);
  assert.equal(Math.round(hoursLeftInWindow("2026-08-07T18:00:00+0000", NOW)), 72);
  assert.equal(hoursLeftInWindow("2026-08-01T18:00:00+0000", NOW), 0, "expired");
  assert.equal(hoursLeftInWindow("nonsense", NOW), 0);
});

test("only people who asked and can still be reached are queued", () => {
  const plan = planBackfill([
    comment({ text: "Link", from: { id: "a", username: "asked" }, username: "asked" }),
    comment({ text: "great video", from: { id: "b", username: "silent" }, username: "silent" }),
    comment({ text: "link", timestamp: "2026-07-01T10:00:00+0000", from: { id: "c", username: "stale" }, username: "stale" }),
  ], { now: NOW });

  assert.deepEqual(plan.eligible.map((e) => e.username), ["asked"]);
  assert.equal(plan.skipped.notAsking, 1);
  assert.equal(plan.skipped.windowExpired, 1);
});

test("anyone the automation already served is skipped", () => {
  const plan = planBackfill([
    comment({ from: { id: "s9", username: "gotit" }, username: "gotit" }),
    comment({ from: { id: "s8", username: "missed" }, username: "missed" }),
  ], { alreadyHandled: ["gotit"], now: NOW });

  assert.deepEqual(plan.eligible.map((e) => e.username), ["missed"]);
  assert.equal(plan.skipped.alreadyHandled, 1);
});

test("already-handled matching also works by sender id", () => {
  const plan = planBackfill([
    comment({ from: { id: "1079833704498685", username: "abhi" }, username: "abhi" }),
  ], { alreadyHandled: ["1079833704498685"], now: NOW });

  assert.equal(plan.eligible.length, 0);
  assert.equal(plan.skipped.alreadyHandled, 1);
});

test("someone who commented five times is messaged once", () => {
  const plan = planBackfill([
    comment({ from: { id: "dup", username: "keen" }, username: "keen" }),
    comment({ from: { id: "dup", username: "keen" }, username: "keen" }),
    comment({ from: { id: "dup", username: "keen" }, username: "keen" }),
  ], { now: NOW });

  assert.equal(plan.eligible.length, 1);
  assert.equal(plan.skipped.duplicate, 2);
});

test("the account never privately replies to itself", () => {
  const plan = planBackfill([
    comment({ from: { id: "me", username: "deon_tech" }, username: "deon_tech" }),
  ], { ownUsername: "deon_tech", now: NOW });

  assert.equal(plan.eligible.length, 0);
  assert.equal(plan.skipped.ownComment, 1);
});

test("the queue is ordered by who expires soonest", () => {
  const plan = planBackfill([
    comment({ timestamp: "2026-08-11T10:00:00+0000", from: { id: "new", username: "new" }, username: "new" }),
    comment({ timestamp: "2026-08-07T10:00:00+0000", from: { id: "old", username: "old" }, username: "old" }),
  ], { now: NOW });

  assert.deepEqual(plan.eligible.map((e) => e.username), ["old", "new"]);
  assert.ok(plan.eligible[0].hours_left < plan.eligible[1].hours_left);
});

test("an empty or malformed comment list is handled", () => {
  assert.equal(planBackfill([], { now: NOW }).eligible.length, 0);
  assert.equal(planBackfill(null, { now: NOW }).total, 0);
});
