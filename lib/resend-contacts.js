const RESEND_CONTACTS_URL = "https://api.resend.com/contacts";
const RESEND_TIMEOUT_MS = 8_000;

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
  fetchFn = (...args) => fetch(...args),
  userAgent = "deonmenezes.com-newsletter/1.0",
} = {}) {
  const headers = resendHeaders(apiKey, userAgent);

  try {
    const contactUrl = `${RESEND_CONTACTS_URL}/${encodeURIComponent(email)}`;
    const existing = await fetchFn(contactUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
    if (existing.ok) return "existing";
    if (existing.status !== 404) return "failed";

    const created = await fetchFn(RESEND_CONTACTS_URL, {
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
