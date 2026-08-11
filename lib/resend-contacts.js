import { logError } from "./social/http.js";

const RESEND_BASE_URL = "https://api.resend.com";
const RESEND_CONTACTS_URL = `${RESEND_BASE_URL}/contacts`;
const RESEND_TIMEOUT_MS = 8_000;

/**
 * Resend has two contact endpoints and they are not interchangeable. The bare
 * /contacts one accepts the write and returns 201, but the contact lands
 * outside every audience, and broadcasts are addressed to an audience, so those
 * subscribers silently receive nothing. Only the audience-scoped endpoint
 * actually enrolls someone. RESEND_AUDIENCE_ID must therefore be set; the bare
 * path is kept purely so a missing env var loses no signups while it is noisy
 * in the logs.
 */
function contactUrls(audienceId, email) {
  const base = audienceId
    ? `${RESEND_BASE_URL}/audiences/${encodeURIComponent(audienceId)}/contacts`
    : RESEND_CONTACTS_URL;
  return { collection: base, member: `${base}/${encodeURIComponent(email)}` };
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function isSubscribableEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email || email.length > 254) return "";
  return EMAIL_PATTERN.test(email) ? email : "";
}

function resendHeaders(apiKey, userAgent) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "User-Agent": userAgent,
  };
}

/**
 * Adds an email to the Resend audience without touching an existing contact.
 *
 * Resend has no upsert, and a blind POST would reset a contact that had already
 * unsubscribed, so an existing contact is left exactly as it is. Returns
 * "existing", "created", or "failed"; callers decide what each means to them.
 */
export async function addResendContact(email, {
  apiKey,
  audienceId = process.env.RESEND_AUDIENCE_ID?.trim(),
  fetchFn = (...args) => fetch(...args),
  userAgent = "deonmenezes.com-newsletter/1.0",
} = {}) {
  const headers = resendHeaders(apiKey, userAgent);
  if (!audienceId) {
    logError("resend_contacts", new Error("RESEND_AUDIENCE_ID is unset; contact will not receive broadcasts"));
  }
  const { collection, member } = contactUrls(audienceId, email);

  try {
    const existing = await fetchFn(member, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
    if (existing.ok) return "existing";
    if (existing.status !== 404) return "failed";

    const created = await fetchFn(collection, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
      body: JSON.stringify({ email }),
    });
    if (created.ok || created.status === 409) return "created";
  } catch {
    return "failed";
  }

  return "failed";
}
