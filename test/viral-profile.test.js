import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { cleanSearchQuery, createViralProfileHandler, createViralSearchHandler, parseFxProfile, parseFxSearch, parseProfile } from "../lib/viral-profile.js";
import statsHandler from "../api/stats.js";

function request({ handle, headers = {}, ...overrides } = {}) {
  return { method: "GET", query: { handle }, headers: { host: "deonmenezes.com", "sec-fetch-site": "same-origin", ...headers }, ...overrides };
}

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(statusCode) { this.statusCode = statusCode; return this; },
    json(body) { this.body = body; return this; },
  };
}

const user = (overrides) => ({
  screen_name: "DeonMen", name: "Deon Menezes", followers_count: 1526, verified: false, is_blue_verified: true,
  profile_image_url_https: "https://pbs.twimg.com/profile_images/1994789024620580866/5i1dzRnM_normal.jpg",
  ...overrides,
});

// Shaped like the syndication page: the reposted author appears before the owner.
function page(...users) {
  const entries = users.map((entry) => ({ content: { tweet: { user: entry } } }));
  return `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { timeline: { entries } } } })}</script></html>`;
}

const fxBody = (overrides) => ({
  code: 200,
  user: {
    screen_name: "DeonMen", name: "Deon Menezes", followers: 1526,
    avatar_url: "https://pbs.twimg.com/profile_images/1994789024620580866/5i1dzRnM_normal.jpg",
    verification: { verified: true, type: "individual" },
    ...overrides,
  },
});
const fxOk = (overrides) => new Response(JSON.stringify(fxBody(overrides)), { status: 200 });
const fxMissing = () => new Response(JSON.stringify({ code: 404, message: "User not found" }), { status: 404 });
const isFx = (url) => url.startsWith("https://api.fxtwitter.com/");

test("both sources normalize to the same profile shape", () => {
  const expected = {
    handle: "DeonMen",
    name: "Deon Menezes",
    avatarUrl: "https://pbs.twimg.com/profile_images/1994789024620580866/5i1dzRnM_400x400.jpg",
    verified: true,
    followers: 1526,
  };
  assert.deepEqual(parseFxProfile(fxBody(), "deonmen"), expected);
  assert.deepEqual(parseProfile(page(user()), "deonmen"), expected);
  assert.equal(parseFxProfile(fxBody({ screen_name: "someone_else" }), "deonmen"), null);
  assert.equal(parseFxProfile({ code: 200 }, "deonmen"), null);
  assert.equal(parseFxProfile(fxBody({ avatar_url: "https://evil.example/a.jpg" }), "deonmen").avatarUrl, null);
});

test("a profile lookup returns name, large avatar, verified, and real followers", () => {
  const profile = parseProfile(page(user()), "deonmen");
  assert.deepEqual(profile, {
    handle: "DeonMen",
    name: "Deon Menezes",
    avatarUrl: "https://pbs.twimg.com/profile_images/1994789024620580866/5i1dzRnM_400x400.jpg",
    verified: true,
    followers: 1526,
  });
});

test("the lookup picks the handle's owner, not a reposted author", () => {
  const reposted = user({ screen_name: "elonmusk", name: "Elon Musk", followers_count: 241_646_031 });
  assert.equal(parseProfile(page(reposted, user()), "DeonMen").followers, 1526);
  assert.equal(parseProfile(page(reposted), "DeonMen"), null);
});

test("avatars from anywhere but X's image hosts are dropped", () => {
  for (const url of ["https://evil.example/a.jpg", "javascript:alert(1)", "https://pbs.twimg.com.evil.example/a.jpg", "https://pbs.twimg.com/a.jpg?x=<script>"]) {
    assert.equal(parseProfile(page(user({ profile_image_url_https: url })), "deonmen").avatarUrl, null, url);
  }
});

test("unparseable pages yield no profile instead of throwing", () => {
  assert.equal(parseProfile("<html>blocked</html>", "deonmen"), null);
  assert.equal(parseProfile('<script id="__NEXT_DATA__">{not json</script>', "deonmen"), null);
});

test("the handler validates the handle before fetching and caches hits at the CDN", async () => {
  const fetched = [];
  const handler = createViralProfileHandler({ fetchFn: async (url) => { fetched.push(url); return fxOk(); } });

  for (const handle of ["", "has space", "../../etc/passwd", "waytoolongforanxhandle", "a?b=c"]) {
    const res = response();
    await handler(request({ handle }), res);
    assert.equal(res.statusCode, 400, handle);
  }
  assert.deepEqual(fetched, [], "an invalid handle must never reach an upstream URL");

  const res = response();
  await handler(request({ handle: "@DeonMen" }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(fetched, ["https://api.fxtwitter.com/DeonMen"], "a hit on the first source must not call the second");
  assert.equal(res.body.profile.followers, 1526);
  assert.match(res.headers["Cache-Control"], /s-maxage=86400/u);
});

test("the handler falls back to the syndication page when the first source fails or misses", async () => {
  const failing = createViralProfileHandler({ fetchFn: async (url) => (isFx(url) ? new Response("down", { status: 503 }) : new Response(page(user()), { status: 200 })) });
  let res = response();
  await failing(request({ handle: "DeonMen" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.profile.handle, "DeonMen");

  const missing = createViralProfileHandler({ fetchFn: async (url) => (isFx(url) ? fxMissing() : new Response(page(user()), { status: 200 })) });
  res = response();
  await missing(request({ handle: "DeonMen" }), res);
  assert.equal(res.statusCode, 200);
});

test("the handler refuses cross-site callers and reports misses and upstream failures distinctly", async () => {
  const ok = createViralProfileHandler({ fetchFn: async (url) => (isFx(url) ? fxMissing() : new Response(page(), { status: 200 })) });

  let res = response();
  await ok(request({ handle: "DeonMen", headers: { "sec-fetch-site": "cross-site" } }), res);
  assert.equal(res.statusCode, 403);

  res = response();
  await ok(request({ handle: "nobody_here" }), res);
  assert.equal(res.statusCode, 404);
  assert.match(res.headers["Cache-Control"], /no-store/u, "misses and errors must not be cached");

  // One source saying "not found" while the other is down is still a miss, not an outage.
  const half = createViralProfileHandler({ fetchFn: async (url) => (isFx(url) ? fxMissing() : new Response("rate limited", { status: 429 })) });
  res = response();
  await half(request({ handle: "nobody_here" }), res);
  assert.equal(res.statusCode, 404);

  const down = createViralProfileHandler({ fetchFn: async () => new Response("rate limited", { status: 429 }) });
  res = response();
  await down(request({ handle: "DeonMen" }), res);
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body, { error: "lookup_failed" });

  res = response();
  await ok(request({ handle: "DeonMen", method: "POST" }), res);
  assert.equal(res.statusCode, 405);
});

test("the profile route is wired through stats.js, the rewrite, and the page CSP", async () => {
  const res = response();
  await statsHandler(request({ handle: "bad handle", query: { route: "viral-profile", handle: "bad handle" } }), res);
  assert.equal(res.statusCode, 400);

  const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(vercel.rewrites.find((rule) => rule.source === "/api/viral/profile").destination, "/api/stats?route=viral-profile");
  const cspFor = (source) => vercel.headers.find((rule) => rule.source === source).headers.find((header) => header.key === "Content-Security-Policy").value;
  assert.match(cspFor("/viral"), /img-src 'self' blob: https:\/\/pbs\.twimg\.com https:\/\/abs\.twimg\.com/u);
  assert.match(cspFor("/viral"), /media-src blob:/u, "attached videos play from blob: URLs");
  assert.equal(vercel.rewrites.find((rule) => rule.source === "/api/viral/search").destination, "/api/stats?route=viral-search");
  assert.doesNotMatch(cspFor("/jev"), /twimg/u, "only the viral page loads X avatars");

  const script = await readFile(new URL("../viral.js", import.meta.url), "utf8");
  assert.match(script, /AVATAR_PATTERN\.test\(avatarUrl\)/u, "the page must re-check avatar URLs read back from localStorage");
  assert.doesNotMatch(script, /innerHTML/u);
});

const person = (screen_name, name, followers, extra = {}) => ({
  screen_name, name, followers,
  avatar_url: `https://pbs.twimg.com/profile_images/1/${screen_name}_normal.jpg`,
  verification: { verified: false },
  ...extra,
});

test("people search returns several clickable candidates with real follower counts", () => {
  const profiles = parseFxSearch({ results: [
    person("DeonMen", "Deon Menezes", 1526, { verification: { verified: true } }),
    person("deon_menezes", "Deon menezes", 4),
    person("DeonMen", "Duplicate", 1),
    person("bad handle!", "Broken", 9),
  ] });
  assert.deepEqual(profiles.map((profile) => profile.handle), ["DeonMen", "deon_menezes"]);
  assert.equal(profiles[0].followers, 1526);
  assert.equal(profiles[0].verified, true);
  assert.match(profiles[0].avatarUrl, /_400x400\.jpg$/u);
});

test("typeahead results drop their follower counts, which are always zero", () => {
  const profiles = parseFxSearch({ users: [person("elonmusk", "Elon Musk", 0)] });
  assert.equal(profiles[0].followers, null);
  assert.deepEqual(parseFxSearch({}), []);
  assert.equal(parseFxSearch({ results: Array.from({ length: 30 }, (_, i) => person(`user_${i}`, "U", i)) }).length, 8);
});

test("search queries are cleaned before they reach the upstream URL", () => {
  assert.equal(cleanSearchQuery("@Deon  <script>Menezes!!"), "Deon script Menezes");
  assert.equal(cleanSearchQuery("Esra Elönü"), "Esra Elönü");
  assert.equal(cleanSearchQuery("x".repeat(80)).length, 50);
  assert.equal(cleanSearchQuery(undefined), "");
});

test("the search handler tries typeahead first, falls back to people search, and never caches empties", async () => {
  const searchRequest = (q, headers = {}) => ({ method: "GET", query: { q }, headers: { "sec-fetch-site": "same-origin", ...headers } });
  const fetched = [];
  const handler = createViralSearchHandler({ fetchFn: async (url) => {
    fetched.push(url);
    return url.includes("/typeahead")
      ? new Response("down", { status: 503 })
      : new Response(JSON.stringify({ results: [person("DeonMen", "Deon Menezes", 1526)] }), { status: 200 });
  } });

  let res = response();
  await handler(searchRequest("deon & menezes"), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(fetched, [
    "https://api.fxtwitter.com/2/typeahead?q=deon%20menezes",
    "https://api.fxtwitter.com/2/search/users?q=deon%20menezes",
  ]);
  assert.equal(res.body.profiles[0].handle, "DeonMen");
  assert.match(res.headers["Cache-Control"], /s-maxage=3600/u);

  res = response();
  await handler(searchRequest("d"), res);
  assert.equal(res.statusCode, 400);

  res = response();
  await handler(searchRequest("deon", { "sec-fetch-site": "cross-site" }), res);
  assert.equal(res.statusCode, 403);

  const empty = createViralSearchHandler({ fetchFn: async () => new Response(JSON.stringify({ results: [] }), { status: 200 }) });
  res = response();
  await empty(searchRequest("zzzzqqqq"), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { profiles: [] });
  assert.match(res.headers["Cache-Control"], /no-store/u);

  const down = createViralSearchHandler({ fetchFn: async () => new Response("down", { status: 503 }) });
  res = response();
  await down(searchRequest("deon"), res);
  assert.equal(res.statusCode, 502);
});
