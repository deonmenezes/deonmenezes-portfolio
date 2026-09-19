/* GET /api/viral/profile?handle=… : public X profile lookup for the /viral page.
   Reads the same public syndication page api/stats.js already uses for the
   site's own follower count. Successful lookups are CDN-cached for a day, so a
   handle costs one upstream fetch no matter how many people preview it. */

import { logError, requireMethod, sendJson } from "./social/http.js";

const HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/u;
const AVATAR_PATTERN = /^https:\/\/(?:pbs|abs)\.twimg\.com\/[\w\-./]+$/u;
const NEXT_DATA_PATTERN = /<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/su;
const MAX_PAGE_BYTES = 3 * 1024 * 1024;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// A timeline also carries the authors of reposted and quoted posts, so match on
// the handle rather than taking the first user object found.
function findUser(node, handle, depth = 0) {
  if (!node || typeof node !== "object" || depth > 12) return null;
  if (typeof node.screen_name === "string" && node.screen_name.toLowerCase() === handle && "followers_count" in node) return node;
  for (const value of Array.isArray(node) ? node : Object.values(node)) {
    const found = findUser(value, handle, depth + 1);
    if (found) return found;
  }
  return null;
}

export function parseProfile(html, handle) {
  const match = NEXT_DATA_PATTERN.exec(html);
  if (!match) return null;
  let data;
  try { data = JSON.parse(match[1]); } catch { return null; }
  const user = findUser(data, handle.toLowerCase());
  if (!user) return null;

  const avatar = String(user.profile_image_url_https || "").replace(/_normal(\.\w+)$/u, "_400x400$1");
  const followers = Math.floor(Number(user.followers_count));
  return {
    handle: user.screen_name,
    name: String(user.name || user.screen_name).slice(0, 60),
    avatarUrl: AVATAR_PATTERN.test(avatar) ? avatar : null,
    verified: Boolean(user.is_blue_verified || user.verified),
    followers: Number.isFinite(followers) && followers >= 0 ? followers : null,
  };
}

export function createViralProfileHandler({ fetchFn = (...args) => fetch(...args) } = {}) {
  return async function handler(req, res) {
    if (!requireMethod(req, res, ["GET"])) return;
    // Browsers label same-origin fetches; this keeps other sites from using the
    // endpoint as a free profile API without pretending to be real security.
    if (req.headers["sec-fetch-site"] !== "same-origin") return sendJson(res, 403, { error: "invalid_origin" });

    const handle = String(req.query?.handle || "").replace(/^@/u, "");
    if (!HANDLE_PATTERN.test(handle)) return sendJson(res, 400, { error: "invalid_handle" });

    let profile;
    try {
      const upstream = await fetchFn(`https://syndication.twitter.com/srv/timeline-profile/screen-name/${handle}`, {
        signal: AbortSignal.timeout(8000),
        headers: { "user-agent": UA },
      });
      if (!upstream.ok) throw new Error(`syndication ${upstream.status}`);
      const html = await upstream.text();
      if (html.length > MAX_PAGE_BYTES) throw new Error("syndication page too large");
      profile = parseProfile(html, handle);
    } catch (error) {
      logError("viral.profile", error);
      return sendJson(res, 502, { error: "lookup_failed" });
    }

    if (!profile) return sendJson(res, 404, { error: "not_found" });
    // Not sendJson: that marks responses no-store, and this one is meant to cache.
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).json({ profile });
  };
}

export default createViralProfileHandler();
