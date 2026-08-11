/* Pulls answered emails out of InstantDM's flow responses.
 *
 * This is the manual stand-in for the outbound webhook, which InstantDM gates
 * behind a higher plan. It reads the same records the webhook would have
 * pushed, so the resulting consent evidence is identical.
 */

import { isSubscribableEmail } from "./resend-contacts.js";

const BASE = "https://api.instantdm.com";

export class InstantDmAuthError extends Error {}

async function call(path, { token, fetchFn }) {
  const response = await fetchFn(`${BASE}${path}`, {
    // InstantDM's internal API takes the raw JWT with no "Bearer " prefix.
    headers: { Authorization: token, "User-Agent": "deonmenezes.com-subscriber-sync/1.0" },
  });
  if (response.status === 401 || response.status === 403) {
    throw new InstantDmAuthError(`InstantDM returned ${response.status}; the token has probably expired.`);
  }
  if (!response.ok) throw new Error(`InstantDM returned ${response.status} for ${path}`);
  const body = await response.json();
  if (String(body?.code) === "401") throw new InstantDmAuthError("InstantDM rejected the token.");
  return body;
}

/** Every post that runs a flow, with its flow ids. */
export async function listFlowPosts({ token, fetchFn = (...args) => fetch(...args) }) {
  const body = await call("/automate-post", { token, fetchFn });
  const rows = Array.isArray(body?.data) ? body.data : [];
  const posts = [];
  for (const row of rows) {
    if (!row?.flow_editor) continue;
    const flowIds = Object.keys(row?.flow_ids || {});
    for (const flowId of flowIds) posts.push({ postId: String(row.post_id || ""), flowId });
  }
  return posts;
}

/**
 * Turns one flow's response rows into subscriber records.
 *
 * Only answers to an email question with skip false are taken. A skipped
 * question means the person chose not to give an address, and anything else in
 * the payload (their profile, the account owner) is not consent.
 */
export function extractConsentedEmails(rows, { postId = "", flowId = "" } = {}) {
  const found = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    for (const answer of row?.question_response || []) {
      if (String(answer?.question_type || "").toLowerCase() !== "email") continue;
      if (answer?.skip === true) continue;

      const email = isSubscribableEmail(answer?.user_response);
      if (!email) continue;

      found.push({
        email,
        consent_at: answer?.updated_at || row?.created_at || "",
        consent_prompt: String(answer?.question || ""),
        source_post: postId,
        source_flow: flowId || String(answer?.flow_id || ""),
        instagram_sender_id: String(answer?.sender_id || row?.sender_id || ""),
      });
    }
  }
  return found;
}

export async function gatherConsentedEmails({ token, fetchFn = (...args) => fetch(...args), onProgress }) {
  const posts = await listFlowPosts({ token, fetchFn });
  const byEmail = new Map();
  const failures = [];

  for (const { postId, flowId } of posts) {
    try {
      const body = await call(`/flow_editor_response?flow_id=${encodeURIComponent(flowId)}&limit=all`, { token, fetchFn });
      const rows = Array.isArray(body?.data) ? body.data : body?.data?.responses || [];
      for (const record of extractConsentedEmails(rows, { postId, flowId })) {
        // Keep the earliest consent for anyone who subscribed from two reels.
        const previous = byEmail.get(record.email);
        if (!previous || String(record.consent_at) < String(previous.consent_at)) byEmail.set(record.email, record);
      }
      onProgress?.({ flowId, postId, count: rows.length });
    } catch (error) {
      if (error instanceof InstantDmAuthError) throw error;
      failures.push({ flowId, message: error.message });
    }
  }

  return { records: [...byEmail.values()], scanned: posts.length, failures };
}
