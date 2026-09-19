/* GET /api/viral/profile?handle=… and GET /api/viral/search?q=… : public X
   profile lookup and people search for the /viral page.
   Tries FxTwitter's public API first, then the public syndication page that
   api/stats.js also reads. X rate-limits shared datacenter IPs on the second
   one, which is why it is only the fallback. Successful lookups are CDN-cached
   for a day, so a handle costs one upstream fetch however many people preview it. */

import { logError, requireMethod, sendJson } from "./social/http.js";
import { lookupSocialProfile, SOCIAL_PLATFORMS } from "./viral-social.js";

const HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/u;
const AVATAR_PATTERN = /^https:\/\/(?:pbs|abs)\.twimg\.com\/[\w\-./]+$/u;
const NEXT_DATA_PATTERN = /<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/su;
const MAX_PAGE_BYTES = 3 * 1024 * 1024;
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const NOT_FOUND = Symbol("not_found");
const FX_UA = "deonmenezes.com/viral (+https://deonmenezes.com/viral)";
const MAX_QUERY_CHARS = 50;
const MAX_RESULTS = 8;

function toProfile({ handle, name, avatar, verified, followers }) {
  const large = String(avatar || "").replace(/_normal(\.\w+)$/u, "_400x400$1");
  const count = Math.floor(Number(followers));
  return {
    handle: String(handle),
    name: String(name || handle).slice(0, 60),
    avatarUrl: AVATAR_PATTERN.test(large) ? large : null,
    verified: Boolean(verified),
    followers: followers != null && Number.isFinite(count) && count >= 0 ? count : null,
  };
}

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
  return toProfile({
    handle: user.screen_name,
    name: user.name,
    avatar: user.profile_image_url_https,
    verified: user.is_blue_verified || user.verified,
    followers: user.followers_count,
  });
}

function fromFxUser(user, { trustFollowers = true } = {}) {
  if (!user || typeof user.screen_name !== "string" || !HANDLE_PATTERN.test(user.screen_name)) return null;
  return toProfile({
    handle: user.screen_name,
    name: user.name,
    avatar: user.avatar_url,
    verified: user.verification?.verified,
    followers: trustFollowers ? user.followers : null,
  });
}

export function parseFxProfile(body, handle) {
  const user = body?.user;
  if (typeof user?.screen_name !== "string" || user.screen_name.toLowerCase() !== handle.toLowerCase()) return null;
  return fromFxUser(user);
}

// Typeahead is the fast, dependable source but reports 0 followers for
// everyone, so its counts are dropped and the page looks a handle up when it is
// picked. People search carries real counts but is slow and often unavailable.
export function parseFxSearch(body) {
  const fromSearch = Array.isArray(body?.results);
  const users = fromSearch ? body.results : Array.isArray(body?.users) ? body.users : [];
  const seen = new Set();
  const profiles = [];
  for (const user of users) {
    const profile = fromFxUser(user, { trustFollowers: fromSearch });
    const key = profile?.handle.toLowerCase();
    if (!profile || seen.has(key)) continue;
    seen.add(key);
    profiles.push(profile);
    if (profiles.length === MAX_RESULTS) break;
  }
  return profiles;
}

export function cleanSearchQuery(value) {
  return String(value ?? "")
    .replace(/^@/u, "")
    .replace(/[^\p{L}\p{N}_ .'-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, MAX_QUERY_CHARS);
}

async function fromFxTwitter(handle, fetchFn) {
  const response = await fetchFn(`https://api.fxtwitter.com/${handle}`, {
    signal: AbortSignal.timeout(6000),
    headers: { "user-agent": FX_UA },
  });
  if (response.status === 404) return NOT_FOUND;
  if (!response.ok) throw new Error(`fxtwitter ${response.status}`);
  return parseFxProfile(await response.json(), handle) ?? NOT_FOUND;
}

async function fromSyndication(handle, fetchFn) {
  const response = await fetchFn(`https://syndication.twitter.com/srv/timeline-profile/screen-name/${handle}`, {
    signal: AbortSignal.timeout(8000),
    headers: { "user-agent": BROWSER_UA },
  });
  if (!response.ok) throw new Error(`syndication ${response.status}`);
  const html = await response.text();
  if (html.length > MAX_PAGE_BYTES) throw new Error("syndication page too large");
  // An account with no public posts has no user object here, so a miss from
  // this source alone is not proof the handle doesn't exist.
  return parseProfile(html, handle) ?? NOT_FOUND;
}

export function createViralProfileHandler({ fetchFn = (...args) => fetch(...args), socialLookupFn = lookupSocialProfile } = {}) {
  return async function handler(req, res) {
    if (!requireMethod(req, res, ["GET"])) return;
    // Browsers label same-origin fetches; this keeps other sites from using the
    // endpoint as a free profile API without pretending to be real security.
    if (req.headers["sec-fetch-site"] !== "same-origin") return sendJson(res, 403, { error: "invalid_origin" });

    const platform = String(req.query?.platform || "x");
    if (Object.hasOwn(SOCIAL_PLATFORMS, platform)) return socialLookupFn(req, res, platform, req.query?.handle);
    if (platform !== "x") return sendJson(res, 400, { error: "unknown_platform" });

    const handle = String(req.query?.handle || "").replace(/^@/u, "");
    if (!HANDLE_PATTERN.test(handle)) return sendJson(res, 400, { error: "invalid_handle" });

    let profile = null;
    let answered = false;
    for (const source of [fromFxTwitter, fromSyndication]) {
      try {
        const result = await source(handle, fetchFn);
        answered = true;
        if (result !== NOT_FOUND) {
          profile = result;
          break;
        }
      } catch (error) {
        logError("viral.profile", error);
      }
    }

    if (!profile) return sendJson(res, answered ? 404 : 502, { error: answered ? "not_found" : "lookup_failed" });
    // Not sendJson: that marks responses no-store, and this one is meant to cache.
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).json({ profile });
  };
}

export function createViralSearchHandler({ fetchFn = (...args) => fetch(...args) } = {}) {
  return async function handler(req, res) {
    if (!requireMethod(req, res, ["GET"])) return;
    if (req.headers["sec-fetch-site"] !== "same-origin") return sendJson(res, 403, { error: "invalid_origin" });

    const query = cleanSearchQuery(req.query?.q);
    if (query.length < 2) return sendJson(res, 400, { error: "query_too_short" });

    let profiles = null;
    for (const [path, timeoutMs] of [["typeahead", 5000], ["search/users", 3000]]) {
      try {
        const response = await fetchFn(`https://api.fxtwitter.com/2/${path}?q=${encodeURIComponent(query)}`, {
          signal: AbortSignal.timeout(timeoutMs),
          headers: { "user-agent": FX_UA },
        });
        if (!response.ok) throw new Error(`fxtwitter ${path} ${response.status}`);
        profiles = parseFxSearch(await response.json());
        if (profiles.length) break;
      } catch (error) {
        logError("viral.search", error);
      }
    }

    if (!profiles) return sendJson(res, 502, { error: "search_failed" });
    if (!profiles.length) return sendJson(res, 200, { profiles });
    // Not sendJson: that marks responses no-store, and hits are meant to cache.
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).json({ profiles });
  };
}

export const viralSearchHandler = createViralSearchHandler();
export default createViralProfileHandler();
