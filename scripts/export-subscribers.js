#!/usr/bin/env node
/* Mirror the Resend audience into a local CSV.
 *
 *   node scripts/export-subscribers.js [--out <path>] [--dry-run]
 *
 * Needs RESEND_API_KEY and RESEND_AUDIENCE_ID. Pull them with:
 *   vercel env pull .env.local --environment production
 *   node --env-file=.env.local scripts/export-subscribers.js
 *
 * The default output lives OUTSIDE this repository on purpose: the repo is
 * public, and subscriber addresses must never be committed to it.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

import { CSV_COLUMNS, mergeSubscribers, parseCsv, summarize, toCsv } from "../lib/subscribers-csv.js";

const DEFAULT_OUT = resolve(homedir(), "Documents/deon-newsletter/subscribers.csv");
const RESEND_BASE_URL = "https://api.resend.com";

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

async function fetchContacts({ apiKey, audienceId }) {
  const response = await fetch(`${RESEND_BASE_URL}/audiences/${encodeURIComponent(audienceId)}/contacts`, {
    headers: { Authorization: `Bearer ${apiKey}`, "User-Agent": "deonmenezes.com-subscriber-export/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Resend returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const body = await response.json();
  if (body?.has_more) {
    console.warn("Resend reports more contacts than one page returned; only the first page was written.");
  }
  return Array.isArray(body?.data) ? body.data : [];
}

async function readExisting(path) {
  try {
    return parseCsv(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function main() {
  const { out, dryRun } = parseArgs(process.argv.slice(2));
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const audienceId = process.env.RESEND_AUDIENCE_ID?.trim();

  if (!apiKey || !audienceId) {
    console.error("RESEND_API_KEY and RESEND_AUDIENCE_ID must both be set. See the header of this file.");
    process.exitCode = 1;
    return;
  }

  const [existing, contacts] = await Promise.all([readExisting(out), fetchContacts({ apiKey, audienceId })]);
  const merged = mergeSubscribers(existing, contacts, { now: new Date().toISOString() });
  const stats = summarize(merged);

  const added = merged.length - existing.length;
  console.log(`Resend audience: ${contacts.length} contacts`);
  console.log(`Local file:      ${stats.total} rows (${stats.active} active, ${stats.unsubscribed} unsubscribed, ${stats.removed} removed upstream)`);
  if (added > 0) console.log(`New this run:    ${added}`);

  if (dryRun) {
    console.log(`\nDry run, nothing written. Would write ${out}`);
    return;
  }

  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, toCsv(merged, CSV_COLUMNS), "utf8");
  console.log(`\nWrote ${out}`);
}

await main();
