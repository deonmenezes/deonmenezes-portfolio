import assert from "node:assert/strict";
import { test } from "node:test";
import { capsRatio, draftChecks } from "../viral-checks.js";

const ids = (platform, text) => draftChecks(platform, text).map((check) => check.id);

test("an ordinary draft raises nothing", () => {
  for (const platform of ["x", "instagram", "tiktok", "youtube"]) {
    assert.deepEqual(ids(platform, "I tracked every hour I worked for a year. Here is what I found."), []);
  }
  assert.deepEqual(draftChecks("x", "   "), []);
});

test("X flags shouting, hashtag piles, links, and very short posts", () => {
  assert.deepEqual(ids("x", "THIS IS THE BEST THING EVER MADE BY ANYONE"), ["shout"]);
  assert.deepEqual(ids("x", "New post is up for everyone now #a #b #c"), ["hashtags"]);
  assert.deepEqual(ids("x", "Read the whole thing here https://example.com/post"), ["link"]);
  assert.deepEqual(ids("x", "gm"), ["short"]);
  assert.match(draftChecks("x", "Read it https://example.com today everyone")[0].text, /no link penalty/u);
});

test("short text is never called shouting", () => {
  assert.equal(capsRatio("OK WOW"), 0);
  assert.ok(capsRatio("HELLO EVERYONE OUT THERE") > 0.9);
});

test("each platform checks what its own app does", () => {
  assert.deepEqual(ids("instagram", "Desk tour #a #b #c #d #e #f"), ["hashtags"]);
  assert.deepEqual(ids("instagram", "x".repeat(130)), ["fold"]);
  assert.deepEqual(ids("youtube", "How I rebuilt my entire editing workflow from scratch in a single weekend with one tool"), ["title"]);
  assert.deepEqual(ids("tiktok", "word ".repeat(40)), ["fold"]);
});

test("every check names its source and there are never more than three", () => {
  const all = draftChecks("x", "LOOK AT THIS NOW EVERYONE #a #b #c https://example.com");
  assert.ok(all.length <= 3);
  for (const check of all) assert.ok(check.source && check.text);
});
