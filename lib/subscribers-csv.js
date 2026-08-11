/* Local subscriber mirror.
   Resend is the source of truth for who gets mailed; this is a durable local
   record of who ever subscribed, including people later removed upstream. */

export const CSV_COLUMNS = ["email", "first_seen", "unsubscribed", "resend_id", "last_synced", "removed_at"];

/* Written by the InstantDM sync. Consent that cannot be evidenced is
   functionally consent you do not have, and the only copy of this currently
   lives in InstantDM under a plan with no export. */
export const CONSENT_COLUMNS = ["consent_at", "consent_prompt", "source_post", "source_flow", "instagram_sender_id"];

/** Every column present across the rows, base columns first, order stable. */
export function columnsFor(rows) {
  const columns = [...CSV_COLUMNS, ...CONSENT_COLUMNS];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }
  return columns;
}

function escapeCell(value) {
  const cell = value == null ? "" : String(value);
  return /[",\r\n]/u.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
}

export function toCsv(rows, columns = CSV_COLUMNS) {
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCell(row[column])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

/** Minimal RFC 4180 reader: quoted fields, escaped quotes, CRLF or LF. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const [header, ...body] = rows.filter((entry) => entry.length && entry.some((value) => value !== ""));
  if (!header) return [];
  return body.map((entry) => Object.fromEntries(header.map((column, index) => [column, entry[index] ?? ""])));
}

/**
 * Folds a Resend contact list into the existing rows.
 *
 * Rows are never dropped. Someone deleted upstream keeps their row and gains a
 * removed_at stamp, so the file stays an accurate history rather than a
 * snapshot that quietly loses people. first_seen is preserved once set, since
 * Resend's created_at changes if a contact is deleted and re-added.
 */
export function mergeSubscribers(existingRows, contacts, { now }) {
  const byEmail = new Map();
  for (const row of existingRows) {
    const email = String(row.email || "").trim().toLowerCase();
    if (email) byEmail.set(email, { ...row, email });
  }

  const seen = new Set();
  for (const contact of contacts) {
    const email = String(contact?.email || "").trim().toLowerCase();
    if (!email) continue;
    seen.add(email);

    const previous = byEmail.get(email) || {};
    // Spread previous first so consent provenance written by the InstantDM sync
    // survives a Resend-only export run.
    byEmail.set(email, {
      ...previous,
      email,
      first_seen: previous.first_seen || contact?.created_at || now,
      unsubscribed: String(Boolean(contact?.unsubscribed)),
      resend_id: contact?.id || previous.resend_id || "",
      last_synced: now,
      removed_at: "",
    });
  }

  for (const [email, row] of byEmail) {
    if (seen.has(email) || row.removed_at) continue;
    byEmail.set(email, { ...row, removed_at: now });
  }

  return [...byEmail.values()].sort((a, b) => String(a.first_seen).localeCompare(String(b.first_seen)));
}

export function summarize(rows) {
  return {
    total: rows.length,
    active: rows.filter((row) => !row.removed_at && row.unsubscribed !== "true").length,
    unsubscribed: rows.filter((row) => row.unsubscribed === "true").length,
    removed: rows.filter((row) => row.removed_at).length,
  };
}
