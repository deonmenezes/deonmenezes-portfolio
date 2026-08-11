#!/usr/bin/env node
/* Gather subscriber emails out of InstantDM, record consent, push to Resend.
 *
 * This is the manual stand-in for the outbound webhook, which InstantDM gates
 * behind the Trendsetter plan. Run it whenever you want, ideally often.
 *
 *   1. Open app.instantdm.com, DevTools console, run:  copy(localStorage.token)
 *   2. export IDM_TOKEN='<paste>'
 *   3. node --env-file=.env.local scripts/sync-instantdm.js
 *
 * Needs IDM_TOKEN, RESEND_API_KEY, RESEND_AUDIENCE_ID.
 * Pass --dry-run to see what would change without writing anything.
 *
 * The token is short lived. When it expires the script says so plainly rather
 * than reporting zero new subscribers, which would look like success.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

import { gatherConsentedEmails, InstantDmAuthError } from "../lib/instantdm-sync.js";
import { addResendContact } from "../lib/resend-contacts.js";
import { columnsFor, parseCsv, summarize, toCsv } from "../lib/subscribers-csv.js";

const DEFAULT_OUT = resolve(homedir(), "Documents/deon-newsletter/subscribers.csv");

function parseArgs(argv) {
  const args = { out: DEFAULT_OUT, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out") {
      args.out = resolve(argv[i + 1] || DEFAULT_OUT);
      i += 1;
    } else if (argv[i] === "--dry-run") args.dryRun = true;
  }
  return args;
}

async function readExisting(path) {
  try {
    return parseCsv(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

/** Adds consent provenance without ever overwriting an earlier record of it. */
function foldConsent(existingRows, records, now) {
  const byEmail = new Map();
  for (const row of existingRows) {
    const email = String(row.email || "").trim().toLowerCase();
    if (email) byEmail.set(email, { ...row, email });
  }

  const added = [];
  for (const record of records) {
    const previous = byEmail.get(record.email);
    if (previous?.consent_at) continue;
    if (!previous) added.push(record.email);
    byEmail.set(record.email, {
      unsubscribed: "false",
      resend_id: "",
      removed_at: "",
      ...previous,
      email: record.email,
      first_seen: previous?.first_seen || record.consent_at || now,
      last_synced: now,
      consent_at: record.consent_at,
      consent_prompt: record.consent_prompt,
      source_post: record.source_post,
      source_flow: record.source_flow,
      instagram_sender_id: record.instagram_sender_id,
    });
  }

  return { rows: [...byEmail.values()].sort((a, b) => String(a.first_seen).localeCompare(String(b.first_seen))), added };
}

async function main() {
  const { out, dryRun } = parseArgs(process.argv.slice(2));
  const token = process.env.IDM_TOKEN?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const audienceId = process.env.RESEND_AUDIENCE_ID?.trim();

  if (!token) {
    console.error("IDM_TOKEN is not set. Open app.instantdm.com, run copy(localStorage.token) in the console, then export it.");
    process.exitCode = 1;
    return;
  }

  let gathered;
  try {
    gathered = await gatherConsentedEmails({ token });
  } catch (error) {
    if (error instanceof InstantDmAuthError) {
      console.error(`${error.message}\nGet a fresh one: app.instantdm.com, console, copy(localStorage.token)`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const { records, scanned, failures } = gathered;
  console.log(`Scanned ${scanned} flows, found ${records.length} consented email${records.length === 1 ? "" : "s"}.`);
  for (const failure of failures) console.warn(`  could not read flow ${failure.flowId}: ${failure.message}`);

  const existing = await readExisting(out);
  const { rows, added } = foldConsent(existing, records, new Date().toISOString());
  const newToFile = rows.length - existing.length;

  if (dryRun) {
    console.log(`Dry run. ${newToFile} new row${newToFile === 1 ? "" : "s"} would be written to ${out}, nothing sent to Resend.`);
    for (const email of added) console.log(`  + ${email}`);
    return;
  }

  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, toCsv(rows, columnsFor(rows)), "utf8");

  let created = 0;
  let alreadyThere = 0;
  let failed = 0;
  if (apiKey && audienceId) {
    for (const record of records) {
      const outcome = await addResendContact(record.email, { apiKey, audienceId });
      if (outcome === "created") created += 1;
      else if (outcome === "existing") alreadyThere += 1;
      else {
        failed += 1;
        console.warn(`  Resend rejected ${record.email}`);
      }
    }
  } else {
    console.warn("RESEND_API_KEY or RESEND_AUDIENCE_ID missing; wrote the CSV but sent nothing to Resend.");
  }

  const stats = summarize(rows);
  console.log(`Resend: ${created} added, ${alreadyThere} already subscribed${failed ? `, ${failed} failed` : ""}.`);
  console.log(`Local:  ${stats.total} rows (${stats.active} active), ${rows.filter((row) => row.consent_at).length} with consent evidence.`);
  console.log(`Wrote ${out}`);
}

await main();
