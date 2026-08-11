import assert from "node:assert/strict";
import test from "node:test";

import { mergeSubscribers, parseCsv, summarize, toCsv } from "../lib/subscribers-csv.js";

const NOW = "2026-08-11T18:00:00.000Z";

test("a fresh export writes every contact", () => {
  const rows = mergeSubscribers([], [
    { email: "a@example.com", id: "c1", created_at: "2026-08-01T00:00:00Z", unsubscribed: false },
    { email: "b@example.com", id: "c2", created_at: "2026-08-02T00:00:00Z", unsubscribed: true },
  ], { now: NOW });

  assert.deepEqual(rows.map((r) => r.email), ["a@example.com", "b@example.com"]);
  assert.equal(rows[0].first_seen, "2026-08-01T00:00:00Z");
  assert.equal(rows[1].unsubscribed, "true");
  assert.equal(rows[0].last_synced, NOW);
});

test("first_seen survives a delete and re-add upstream", () => {
  // Resend stamps a new created_at when a contact is re-added, which would
  // otherwise rewrite history on every sync.
  const existing = [{ email: "a@example.com", first_seen: "2026-01-01T00:00:00Z", unsubscribed: "false", resend_id: "old", last_synced: "x", removed_at: "" }];
  const rows = mergeSubscribers(existing, [
    { email: "a@example.com", id: "new", created_at: "2026-08-09T00:00:00Z", unsubscribed: false },
  ], { now: NOW });

  assert.equal(rows[0].first_seen, "2026-01-01T00:00:00Z");
  assert.equal(rows[0].resend_id, "new");
});

test("someone removed upstream is kept and stamped, not dropped", () => {
  const existing = [{ email: "gone@example.com", first_seen: "2026-01-01T00:00:00Z", unsubscribed: "false", resend_id: "c9", last_synced: "x", removed_at: "" }];

  const rows = mergeSubscribers(existing, [], { now: NOW });

  assert.equal(rows.length, 1, "history must not lose people");
  assert.equal(rows[0].removed_at, NOW);
});

test("a removal stamp is not overwritten on later runs", () => {
  const existing = [{ email: "gone@example.com", first_seen: "2026-01-01T00:00:00Z", unsubscribed: "false", resend_id: "c9", last_synced: "x", removed_at: "2026-02-02T00:00:00Z" }];

  const rows = mergeSubscribers(existing, [], { now: NOW });

  assert.equal(rows[0].removed_at, "2026-02-02T00:00:00Z");
});

test("a returning contact clears the removal stamp", () => {
  const existing = [{ email: "back@example.com", first_seen: "2026-01-01T00:00:00Z", unsubscribed: "false", resend_id: "c9", last_synced: "x", removed_at: "2026-02-02T00:00:00Z" }];

  const rows = mergeSubscribers(existing, [
    { email: "back@example.com", id: "c9", created_at: "2026-08-09T00:00:00Z", unsubscribed: false },
  ], { now: NOW });

  assert.equal(rows[0].removed_at, "");
});

test("emails are matched case-insensitively so nobody is duplicated", () => {
  const existing = [{ email: "reader@example.com", first_seen: "2026-01-01T00:00:00Z", unsubscribed: "false", resend_id: "c1", last_synced: "x", removed_at: "" }];

  const rows = mergeSubscribers(existing, [
    { email: "Reader@Example.COM", id: "c1", created_at: "2026-08-09T00:00:00Z", unsubscribed: false },
  ], { now: NOW });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, "reader@example.com");
});

test("csv survives a round trip including awkward values", () => {
  const rows = [
    { email: "a@example.com", first_seen: "2026-01-01", unsubscribed: "false", resend_id: 'has "quotes"', last_synced: NOW, removed_at: "" },
    { email: "b@example.com", first_seen: "2026-01-02", unsubscribed: "true", resend_id: "has,comma", last_synced: NOW, removed_at: "" },
  ];

  const parsed = parseCsv(toCsv(rows));

  assert.deepEqual(parsed, rows.map((row) => ({ ...row, resend_id: row.resend_id })));
});

test("parsing an empty or header-only file yields no rows", () => {
  assert.deepEqual(parseCsv(""), []);
  assert.deepEqual(parseCsv("email,first_seen\n"), []);
});

test("summary separates active from unsubscribed and removed", () => {
  const stats = summarize([
    { email: "a", unsubscribed: "false", removed_at: "" },
    { email: "b", unsubscribed: "true", removed_at: "" },
    { email: "c", unsubscribed: "false", removed_at: NOW },
  ]);

  assert.deepEqual(stats, { total: 3, active: 1, unsubscribed: 1, removed: 1 });
});
