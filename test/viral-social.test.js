import assert from "node:assert/strict";
import test from "node:test";
import { createSocialProfileLookup, createViralAvatarHandler, isAllowedAvatar, SOCIAL_PLATFORMS } from "../lib/viral-social.js";
import { createViralProfileHandler } from "../lib/viral-profile.js";
import { cleanAuthor } from "../lib/viral-store.js";

const saved = { token: process.env.APIFY_TOKEN, secret: process.env.JEV_HASH_SECRET };
test.beforeEach(() => {
  process.env.APIFY_TOKEN = "apify_api_test_token";
  process.env.JEV_HASH_SECRET = "test-hash-secret";
});
test.afterEach(() => {
  for (const [name, value] of [["APIFY_TOKEN", saved.token], ["JEV_HASH_SECRET", saved.secret]]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(statusCode) { this.statusCode = statusCode; return this; },
    json(body) { this.body = body; return this; },
    end(body) { this.sent = body; return this; },
  };
}

const request = (ip = "203.0.113.5") => ({ method: "GET", headers: { "x-real-ip": ip, "sec-fetch-site": "same-origin" }, query: {} });

// Just enough of the driver for the lookup: findOne, updateOne, findOneAndUpdate.
function fakeDb(seed = {}) {
  const stores = { profiles: new Map(Object.entries(seed)), lookup_counters: new Map() };
  return {
    stores,
    collection(name) {
      const store = stores[name];
      return {
        async findOne({ _id }) { return store.get(_id) || null; },
        async updateOne({ _id }, { $set }) { store.set(_id, { ...(store.get(_id) || {}), _id, ...$set }); },
        async findOneAndUpdate({ _id }, { $inc }) {
          const next = { _id, count: (store.get(_id)?.count || 0) + $inc.count };
          store.set(_id, next);
          return next;
        },
      };
    },
  };
}

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const instagramItem = { username: "deon_tech", fullName: "Deon Menezes", followersCount: 43508, verified: true, profilePicUrlHD: "https://instagram.fyvr4-1.fna.fbcdn.net/v/pic.jpg?sig=abc" };

function apify(items, { avatar = PNG, avatarType = "image/png" } = {}) {
  const calls = [];
  const fetchFn = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.startsWith("https://api.apify.com/")) return new Response(JSON.stringify(items), { status: 200 });
    return new Response(avatar, { status: 200, headers: { "content-type": avatarType } });
  };
  return { calls, fetchFn };
}

test("an Instagram lookup returns the real profile, stores the photo, and hands back a same-site avatar URL", async () => {
  const db = fakeDb();
  const { calls, fetchFn } = apify([instagramItem]);
  const lookup = createSocialProfileLookup({ fetchFn, getDatabaseFn: async () => db });
  const res = response();

  await lookup(request(), res, "instagram", "@deon_tech");

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.profile, {
    handle: "deon_tech", name: "Deon Menezes", verified: true, followers: 43508,
    avatarUrl: "/api/viral/avatar?platform=instagram&handle=deon_tech",
  });
  assert.match(calls[0].url, /acts\/apify~instagram-profile-scraper\/run-sync-get-dataset-items/u);
  assert.equal(calls[0].options.headers.Authorization, "Bearer apify_api_test_token");
  assert.doesNotMatch(calls[0].url, /apify_api_test_token/u, "the token must not travel in the URL");
  assert.deepEqual(JSON.parse(calls[0].options.body), { usernames: ["deon_tech"] });
  assert.equal(db.stores.profiles.get("instagram:deon_tech").avatar.type, "image/png");
  assert.ok(cleanAuthor({ handle: "deon_tech", avatarUrl: res.body.profile.avatarUrl }).avatarUrl, "a looked-up avatar is accepted on published posts");
});

test("a cached profile answers without calling Apify, until it is a week old", async () => {
  const cached = { platform: "instagram", handle: "deon_tech", name: "Deon", followers: 10, verified: false, avatar: null, missing: false, fetchedAt: new Date() };
  const db = fakeDb({ "instagram:deon_tech": cached });
  const fresh = apify([instagramItem]);
  const lookup = createSocialProfileLookup({ fetchFn: fresh.fetchFn, getDatabaseFn: async () => db });

  let res = response();
  await lookup(request(), res, "instagram", "DEON_TECH");
  assert.equal(res.body.profile.followers, 10);
  assert.equal(fresh.calls.length, 0);

  cached.fetchedAt = new Date(Date.now() - 8 * 86_400_000);
  res = response();
  await lookup(request(), res, "instagram", "deon_tech");
  assert.equal(res.body.profile.followers, 43508);
  assert.ok(fresh.calls.length > 0);
});

test("a miss is cached, so a typo can't be used to burn the allowance", async () => {
  const db = fakeDb();
  const { calls, fetchFn } = apify([]);
  const lookup = createSocialProfileLookup({ fetchFn, getDatabaseFn: async () => db });

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = response();
    await lookup(request(), res, "tiktok", "nobody_here_zz");
    assert.equal(res.statusCode, 404);
  }
  assert.equal(calls.length, 1);

  // A scraper that returns someone else's account is a miss too.
  const other = apify([{ ...instagramItem, username: "someone_else" }]);
  const res = response();
  await createSocialProfileLookup({ fetchFn: other.fetchFn, getDatabaseFn: async () => fakeDb() })(request(), res, "instagram", "deon_tech");
  assert.equal(res.statusCode, 404);
});

test("new lookups are capped per network, and the cap never blocks cached answers", async () => {
  const db = fakeDb();
  const { calls, fetchFn } = apify([instagramItem]);
  const lookup = createSocialProfileLookup({ fetchFn, getDatabaseFn: async () => db });
  const statuses = [];
  for (let index = 0; index < 10; index++) {
    const res = response();
    await lookup(request(), res, "instagram", `account_${index}`);
    statuses.push(res.statusCode);
  }
  assert.deepEqual(statuses.slice(0, 8), Array(8).fill(404), "the fake scraper returns a different handle, so each is a miss");
  assert.deepEqual(statuses.slice(8), [429, 429]);
  assert.equal(calls.length, 8);

  const res = response();
  await lookup(request(), res, "instagram", "account_0");
  assert.equal(res.statusCode, 404, "cached, so answered despite the cap");

  const another = response();
  await lookup(request("198.51.100.20"), another, "instagram", "fresh_account");
  assert.notEqual(another.statusCode, 429, "a different network has its own allowance");
});

test("handles are validated per platform before anything is spent", async () => {
  const { calls, fetchFn } = apify([instagramItem]);
  const lookup = createSocialProfileLookup({ fetchFn, getDatabaseFn: async () => fakeDb() });
  for (const [platform, handle] of [["instagram", "has space"], ["instagram", "a/../b"], ["tiktok", "x"], ["youtube", "ab"], ["youtube", "https://evil.example"], ["instagram", "x".repeat(31)]]) {
    const res = response();
    await lookup(request(), res, platform, handle);
    assert.equal(res.statusCode, 400, `${platform}:${handle}`);
  }
  assert.equal(calls.length, 0);
  assert.deepEqual(Object.keys(SOCIAL_PLATFORMS), ["instagram", "tiktok", "youtube"]);
});

test("the lookup is off without a token or a database, and hides upstream errors", async () => {
  const { fetchFn } = apify([instagramItem]);
  let res = response();
  await createSocialProfileLookup({ fetchFn, getDatabaseFn: async () => null })(request(), res, "instagram", "deon_tech");
  assert.equal(res.statusCode, 503);

  delete process.env.APIFY_TOKEN;
  res = response();
  await createSocialProfileLookup({ fetchFn, getDatabaseFn: async () => fakeDb() })(request(), res, "instagram", "deon_tech");
  assert.equal(res.statusCode, 503);

  process.env.APIFY_TOKEN = "apify_api_test_token";
  res = response();
  await createSocialProfileLookup({ fetchFn: async () => new Response("quota exceeded for apify_api_test_token", { status: 402 }), getDatabaseFn: async () => fakeDb() })(request(), res, "instagram", "deon_tech");
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body, { error: "lookup_failed" });
});

test("avatars are only ever fetched from the platform's own image hosts", async () => {
  const hosts = SOCIAL_PLATFORMS.instagram.avatarHosts;
  assert.equal(isAllowedAvatar("https://instagram.fyvr4-1.fna.fbcdn.net/v/pic.jpg", hosts), true);
  for (const url of ["http://x.fbcdn.net/a.jpg", "https://fbcdn.net.evil.example/a.jpg", "https://169.254.169.254/latest/meta-data", "https://user@x.fbcdn.net/a.jpg", "file:///etc/passwd", "not a url"]) {
    assert.equal(isAllowedAvatar(url, hosts), false, url);
  }

  // A profile whose photo points somewhere else is still returned, without a photo.
  const db = fakeDb();
  const { calls, fetchFn } = apify([{ ...instagramItem, profilePicUrlHD: "https://169.254.169.254/steal", profilePicUrl: undefined }]);
  const res = response();
  await createSocialProfileLookup({ fetchFn, getDatabaseFn: async () => db })(request(), res, "instagram", "deon_tech");
  assert.equal(res.body.profile.avatarUrl, null);
  assert.equal(calls.length, 1, "only the Apify call was made");

  // Something that isn't an image is not stored either.
  const html = apify([instagramItem], { avatar: "<script>alert(1)</script>", avatarType: "text/html" });
  const next = response();
  await createSocialProfileLookup({ fetchFn: html.fetchFn, getDatabaseFn: async () => fakeDb() })(request(), next, "instagram", "deon_tech");
  assert.equal(next.body.profile.avatarUrl, null);
});

test("stored avatars are served as images with a locked-down response", async () => {
  const db = fakeDb({ "instagram:deon_tech": { avatar: { type: "image/png", data: PNG.toString("base64") } }, "instagram:weird": { avatar: { type: "text/html", data: "PGI+" } } });
  const handler = createViralAvatarHandler({ getDatabaseFn: async () => db });

  let res = response();
  await handler({ method: "GET", query: { platform: "instagram", handle: "Deon_Tech" }, headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Content-Type"], "image/png");
  assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
  assert.deepEqual(res.sent, PNG);

  for (const query of [{ platform: "instagram", handle: "weird" }, { platform: "instagram", handle: "unknown" }, { platform: "x", handle: "deon" }, { platform: "__proto__", handle: "deon" }, { platform: "instagram", handle: "../x" }]) {
    res = response();
    await handler({ method: "GET", query, headers: {} }, res);
    assert.equal(res.statusCode, 404, JSON.stringify(query));
  }
});

test("the profile endpoint routes other platforms to the social lookup and rejects unknown ones", async () => {
  const seen = [];
  const handler = createViralProfileHandler({
    fetchFn: async () => { throw new Error("X lookup should not run"); },
    socialLookupFn: async (_req, res, platform, handle) => { seen.push([platform, handle]); res.status(200).json({ ok: true }); },
  });
  const make = (query) => ({ method: "GET", query, headers: { "sec-fetch-site": "same-origin" } });

  let res = response();
  await handler(make({ platform: "tiktok", handle: "khaby.lame" }), res);
  assert.deepEqual(seen, [["tiktok", "khaby.lame"]]);

  res = response();
  await handler(make({ platform: "myspace", handle: "tom" }), res);
  assert.equal(res.statusCode, 400);

  res = response();
  await handler({ ...make({ platform: "tiktok", handle: "khaby.lame" }), headers: { "sec-fetch-site": "cross-site" } }, res);
  assert.equal(res.statusCode, 403, "paid lookups are same-origin only");
});
