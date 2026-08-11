import { applyApiHeaders, logError, requireMethod } from "./social/http.js";

const RESEND_BROADCASTS_URL = "https://api.resend.com/broadcasts";
const RESEND_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_ISSUES = 50;

const cache = new Map();

function cached(key) {
  const hit = cache.get(key);
  if (!hit || hit.expires < Date.now()) return null;
  return hit.value;
}

function remember(key, value) {
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

export function resetIssuesCache() {
  cache.clear();
}

function headers(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": "deonmenezes.com-issues/1.0",
  };
}

function summarize(broadcast) {
  return {
    id: String(broadcast?.id || ""),
    subject: String(broadcast?.subject || broadcast?.name || "Untitled issue"),
    preview: String(broadcast?.preview_text || ""),
    sent_at: broadcast?.sent_at || null,
  };
}

/** Newest first, and only what actually went out. Drafts stay private. */
function sortSent(list) {
  return list
    .filter((item) => String(item?.status || "").toLowerCase() === "sent")
    .sort((a, b) => new Date(b?.sent_at || 0) - new Date(a?.sent_at || 0))
    .slice(0, MAX_ISSUES);
}

export async function listIssues({ apiKey, fetchFn = (...args) => fetch(...args) }) {
  const hit = cached("list");
  if (hit) return hit;

  const response = await fetchFn(RESEND_BROADCASTS_URL, {
    headers: headers(apiKey),
    signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`resend_broadcasts_${response.status}`);

  const body = await response.json();
  const sent = sortSent(Array.isArray(body?.data) ? body.data : []);

  // The list endpoint carries no subject or preview text, so each sent issue is
  // fetched once and cached. Drafts are never fetched.
  const issues = [];
  for (const item of sent) {
    try {
      const detail = await getIssue(item.id, { apiKey, fetchFn });
      if (detail) issues.push(summarize(detail));
    } catch (error) {
      logError("issues_detail", error);
      issues.push(summarize(item));
    }
  }
  return remember("list", issues);
}

export async function getIssue(id, { apiKey, fetchFn = (...args) => fetch(...args) }) {
  const key = `issue:${id}`;
  const hit = cached(key);
  if (hit) return hit;

  const response = await fetchFn(`${RESEND_BROADCASTS_URL}/${encodeURIComponent(id)}`, {
    headers: headers(apiKey),
    signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`resend_broadcast_${response.status}`);

  const body = await response.json();
  if (String(body?.status || "").toLowerCase() !== "sent") return null;
  return remember(key, body);
}

export function createIssuesHandler({ fetchFn = (...args) => fetch(...args) } = {}) {
  return async function handler(req, res) {
    if (!requireMethod(req, res, ["GET"])) return;

    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      applyApiHeaders(res);
      return res.status(503).json({ error: "issues_unavailable" });
    }

    const id = String(req.query?.id || "").trim();

    try {
      if (id) {
        const issue = await getIssue(id, { apiKey, fetchFn });
        if (!issue) {
          applyApiHeaders(res);
          return res.status(404).json({ error: "issue_not_found" });
        }
        applyApiHeaders(res);
        res.setHeader("Cache-Control", "public, max-age=300, s-maxage=900");
        return res.status(200).json({
          ...summarize(issue),
          html: String(issue?.html || ""),
          text: String(issue?.text || ""),
        });
      }

      const issues = await listIssues({ apiKey, fetchFn });
      applyApiHeaders(res);
      res.setHeader("Cache-Control", "public, max-age=300, s-maxage=900");
      return res.status(200).json({ issues });
    } catch (error) {
      logError("issues", error);
      applyApiHeaders(res);
      return res.status(502).json({ error: "issues_unavailable" });
    }
  };
}

export default createIssuesHandler();
