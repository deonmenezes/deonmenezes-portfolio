import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import test from "node:test";
import {
  CODE_ATTEMPTS, EMAIL_LIMITS, SESSION_COOKIE, STATE_COOKIE, appleClientSecret, authRequired, createViralAuthHandler,
  currentUser, parseCookies, providers, readState, signState,
} from "../lib/viral-auth.js";
import { createViralHandler } from "../lib/viral.js";

const NAMES = [
  "JEV_HASH_SECRET", "MONGODB_URI", "VIRAL_AUTH", "RESEND_API_KEY", "RESEND_EMAIL_DOMAIN", "VIRAL_AUTH_FROM",
  "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY",
  "AI_GATEWAY_API_KEY",
];
const saved = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));
const APPLE_KEYS = generateKeyPairSync("ec", { namedCurve: "P-256" });

test.beforeEach(() => {
  for (const name of NAMES) delete process.env[name];
  process.env.JEV_HASH_SECRET = "test-hash-secret";
  process.env.MONGODB_URI = "mongodb://stub";
  process.env.RESEND_API_KEY = "re_test";
  process.env.GOOGLE_CLIENT_ID = "google-client";
  process.env.GOOGLE_CLIENT_SECRET = "google-secret";
  process.env.APPLE_CLIENT_ID = "com.virelity.web";
  process.env.APPLE_TEAM_ID = "TEAM123456";
  process.env.APPLE_KEY_ID = "KEY1234567";
  process.env.APPLE_PRIVATE_KEY = APPLE_KEYS.privateKey.export({ type: "pkcs8", format: "pem" }).replace(/\n/gu, "\\n");
});

test.afterEach(() => {
  for (const name of NAMES) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

/* A tiny in-memory stand-in for the MongoDB calls the module makes. */
function matches(doc, filter) {
  return Object.entries(filter).every(([key, want]) => {
    const have = doc[key];
    if (want && typeof want === "object" && !(want instanceof Date) && ("$gt" in want || "$lt" in want)) {
      if ("$gt" in want && !(have > want.$gt)) return false;
      if ("$lt" in want && !(have < want.$lt)) return false;
      return true;
    }
    return have instanceof Date && want instanceof Date ? have.getTime() === want.getTime() : have === want;
  });
}

function apply(doc, change, inserting) {
  for (const [key, value] of Object.entries(change.$set || {})) doc[key] = value;
  if (inserting) for (const [key, value] of Object.entries(change.$setOnInsert || {})) doc[key] = value;
  for (const [key, value] of Object.entries(change.$inc || {})) {
    const [head, tail] = key.split(".");
    if (tail) doc[head] = { ...doc[head], [tail]: (doc[head]?.[tail] || 0) + value };
    else doc[key] = (doc[key] || 0) + value;
  }
  for (const [key, value] of Object.entries(change.$addToSet || {})) doc[key] = [...new Set([...(doc[key] || []), value])];
}

function database() {
  const collections = {};
  let nextId = 1;
  const collection = (name) => {
    const docs = (collections[name] ??= []);
    return {
      docs,
      async createIndex() {},
      async findOne(filter) { return docs.find((doc) => matches(doc, filter)) || null; },
      async insertOne(doc) {
        if (name === "users" && doc.email && docs.some((other) => other.email === doc.email)) throw Object.assign(new Error("dup"), { code: 11000 });
        const stored = { _id: doc._id ?? `id${nextId++}`, ...doc };
        docs.push(stored);
        return { insertedId: stored._id };
      },
      async updateOne(filter, change, { upsert } = {}) {
        let doc = docs.find((entry) => matches(entry, filter));
        if (!doc && !upsert) return { modifiedCount: 0 };
        const inserting = !doc;
        if (inserting) docs.push((doc = { ...filter }));
        apply(doc, change, inserting);
        return { modifiedCount: 1 };
      },
      async findOneAndUpdate(filter, change, { upsert } = {}) {
        let doc = docs.find((entry) => matches(entry, filter));
        if (!doc && !upsert) return null;
        const inserting = !doc;
        if (inserting) docs.push((doc = { ...filter }));
        apply(doc, change, inserting);
        return { ...doc };
      },
      async deleteOne(filter) {
        const at = docs.findIndex((doc) => matches(doc, filter));
        if (at < 0) return { deletedCount: 0 };
        docs.splice(at, 1);
        return { deletedCount: 1 };
      },
    };
  };
  const cache = {};
  return { collection: (name) => (cache[name] ??= collection(name)), docs: (name) => cache[name]?.docs || [] };
}

const request = ({ method = "GET", query = {}, headers = {}, body } = {}) => ({
  method,
  query,
  headers: { host: "virelity.com", origin: "https://virelity.com", "x-forwarded-proto": "https", "x-real-ip": "203.0.113.9", ...headers },
  body,
});

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(statusCode) { this.statusCode = statusCode; return this; },
    json(body) { this.body = body; return this; },
    end() { this.ended = true; return this; },
  };
}

const cookieFrom = (res, name) => [].concat(res.headers["Set-Cookie"] || []).map((line) => line.split(";")[0]).find((pair) => pair.startsWith(`${name}=`))?.slice(name.length + 1);
const jwt = (claims) => `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;

async function startGoogle(handler, query = {}) {
  const res = response();
  await handler(request({ query: { action: "start", provider: "google", to: "/", ...query } }), res);
  return { res, location: new URL(res.headers.Location), stateCookie: cookieFrom(res, STATE_COOKIE) };
}

test("providers follow their credentials, and posting needs sign-in only when one is set up", () => {
  assert.deepEqual(providers(), ["google", "apple", "email"]);
  assert.equal(authRequired(), true);
  delete process.env.APPLE_KEY_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  assert.deepEqual(providers(), ["email"]);
  delete process.env.RESEND_API_KEY;
  assert.equal(authRequired(), false);
  process.env.RESEND_API_KEY = "re_test";
  process.env.VIRAL_AUTH = "off";
  assert.equal(authRequired(), false, "the switch turns it off");
  delete process.env.VIRAL_AUTH;
  delete process.env.MONGODB_URI;
  assert.equal(authRequired(), false, "without MongoDB there is nowhere to keep sessions");
});

test("the state cookie is signed and expires", () => {
  const value = signState({ p: "google", s: "abc", exp: Date.now() + 60_000 });
  assert.equal(readState(value).s, "abc");
  const [body] = value.split(".");
  const forged = `${Buffer.from(JSON.stringify({ p: "google", s: "evil", exp: Date.now() + 60_000 })).toString("base64url")}.${value.split(".")[1]}`;
  assert.equal(readState(forged), null);
  assert.equal(readState(`${body}.`), null);
  assert.equal(readState(signState({ s: "old", exp: Date.now() - 1 })), null);
  assert.deepEqual(parseCookies("a=1; b = two ;c"), { a: "1", b: "two" });
});

test("Google sign-in: start sends state and nonce, the callback checks them and opens a session", async () => {
  const db = database();
  let exchanged;
  let nonce;
  const handler = createViralAuthHandler({
    getDatabaseFn: async () => db,
    fetchFn: async (url, options) => {
      exchanged = { url, body: new URLSearchParams(options.body) };
      return new Response(JSON.stringify({ id_token: jwt({ iss: "https://accounts.google.com", aud: "google-client", exp: Math.floor(Date.now() / 1000) + 300, nonce, sub: "g-1", email: "Sanju@Example.com", email_verified: true, name: "Sanju" }) }));
    },
  });

  const { res, location, stateCookie } = await startGoogle(handler);
  assert.equal(res.statusCode, 302);
  assert.equal(location.origin + location.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(location.searchParams.get("redirect_uri"), "https://virelity.com/api/viral/auth/callback/google");
  assert.equal(location.searchParams.get("scope"), "openid email profile");
  assert.ok(stateCookie);
  assert.match([].concat(res.headers["Set-Cookie"])[0], /HttpOnly; Secure; SameSite=None/u);
  nonce = location.searchParams.get("nonce");

  const back = response();
  await handler(request({ query: { action: "callback", provider: "google", code: "the-code", state: location.searchParams.get("state") }, headers: { cookie: `${STATE_COOKIE}=${stateCookie}` } }), back);
  assert.equal(back.statusCode, 302);
  assert.equal(back.headers.Location, "/viral-signed-in?to=%2F");
  assert.equal(exchanged.url, "https://oauth2.googleapis.com/token");
  assert.equal(exchanged.body.get("client_secret"), "google-secret");
  assert.equal(exchanged.body.get("redirect_uri"), "https://virelity.com/api/viral/auth/callback/google");

  const token = cookieFrom(back, SESSION_COOKIE);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/u);
  assert.match([].concat(back.headers["Set-Cookie"]).find((line) => line.startsWith(SESSION_COOKIE)), /HttpOnly; Secure; SameSite=Lax/u);
  assert.equal(db.docs("users").length, 1);
  assert.equal(db.docs("users")[0].email, "sanju@example.com");
  assert.equal(db.docs("users")[0].googleSub, "g-1");
  assert.notEqual(db.docs("sessions")[0]._id, token, "only a hash of the token is stored");

  const user = await currentUser(request({ headers: { cookie: `${SESSION_COOKIE}=${token}` } }), { getDatabaseFn: async () => db });
  assert.equal(user.email, "sanju@example.com");

  const me = response();
  await handler(request({ query: { action: "me" }, headers: { cookie: `${SESSION_COOKIE}=${token}` } }), me);
  assert.deepEqual(me.body, { user: { name: "Sanju", email: "sanju@example.com" }, providers: ["google", "apple", "email"], required: true });
});

test("Google callbacks with a wrong state, nonce, audience, or unverified email open no session", async () => {
  const cases = [
    { name: "wrong state", state: "nope", claims: {} , error: "expired" },
    { name: "wrong nonce", claims: { nonce: "other" }, error: "failed" },
    { name: "wrong audience", claims: { aud: "someone-else" }, error: "failed" },
    { name: "unverified email", claims: { email_verified: false }, error: "failed" },
    { name: "expired token", claims: { exp: 1 }, error: "failed" },
  ];
  for (const entry of cases) {
    const db = database();
    let nonce;
    const handler = createViralAuthHandler({
      getDatabaseFn: async () => db,
      fetchFn: async () => new Response(JSON.stringify({ id_token: jwt({ iss: "https://accounts.google.com", aud: "google-client", exp: Math.floor(Date.now() / 1000) + 300, nonce, sub: "g-1", email: "a@example.com", email_verified: true, ...entry.claims }) })),
    });
    const { location, stateCookie } = await startGoogle(handler);
    nonce = location.searchParams.get("nonce");
    const back = response();
    await handler(request({ query: { action: "callback", provider: "google", code: "c", state: entry.state ?? location.searchParams.get("state") }, headers: { cookie: `${STATE_COOKIE}=${stateCookie}` } }), back);
    assert.equal(new URL(back.headers.Location, "https://virelity.com").searchParams.get("error"), entry.error, entry.name);
    assert.equal(cookieFrom(back, SESSION_COOKIE), undefined, entry.name);
    assert.equal(db.docs("sessions").length, 0, entry.name);
  }

  const handler = createViralAuthHandler({ getDatabaseFn: async () => database(), fetchFn: async () => { throw new Error("no"); } });
  const noCookie = response();
  await handler(request({ query: { action: "callback", provider: "google", code: "c", state: "s" } }), noCookie);
  assert.match(noCookie.headers.Location, /error=expired/u, "a callback nobody started is refused");
});

test("sign-in starts only on known hosts, for configured providers, and returns only to known paths", async () => {
  const handler = createViralAuthHandler({ getDatabaseFn: async () => database() });
  let res = response();
  await handler(request({ query: { action: "start", provider: "google" }, headers: { host: "evil.example" } }), res);
  assert.equal(res.statusCode, 400);

  delete process.env.GOOGLE_CLIENT_ID;
  res = response();
  await handler(request({ query: { action: "start", provider: "google" } }), res);
  assert.equal(res.statusCode, 404);
  process.env.GOOGLE_CLIENT_ID = "google-client";

  const { stateCookie } = await startGoogle(handler, { to: "https://evil.example/", mode: "tab" });
  const state = readState(stateCookie);
  assert.equal(state.to, "/");
  assert.equal(state.tab, true);
  const viral = readState((await startGoogle(handler, { to: "/viral" })).stateCookie);
  assert.equal(viral.to, "/viral");
});

test("Apple: the client secret is an ES256 JWT, and the form_post callback signs the person in", async () => {
  const secret = appleClientSecret(Date.UTC(2026, 8, 21));
  const [header, payload, signature] = secret.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url")), { alg: "ES256", kid: "KEY1234567" });
  const claims = JSON.parse(Buffer.from(payload, "base64url"));
  assert.equal(claims.iss, "TEAM123456");
  assert.equal(claims.sub, "com.virelity.web");
  assert.equal(claims.aud, "https://appleid.apple.com");
  assert.ok(verify("sha256", Buffer.from(`${header}.${payload}`), { key: APPLE_KEYS.publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url")));

  const db = database();
  let nonce;
  let sentSecret;
  const handler = createViralAuthHandler({
    getDatabaseFn: async () => db,
    fetchFn: async (_url, options) => {
      sentSecret = new URLSearchParams(options.body).get("client_secret");
      return new Response(JSON.stringify({ id_token: jwt({ iss: "https://appleid.apple.com", aud: "com.virelity.web", exp: Math.floor(Date.now() / 1000) + 300, nonce, sub: "apple-1", email: "x@privaterelay.appleid.com", email_verified: "true" }) }));
    },
  });
  const start = response();
  await handler(request({ query: { action: "start", provider: "apple", to: "/viral" } }), start);
  const location = new URL(start.headers.Location);
  assert.equal(location.searchParams.get("response_mode"), "form_post");
  nonce = location.searchParams.get("nonce");

  const back = response();
  await handler(request({
    method: "POST",
    query: { action: "callback", provider: "apple" },
    headers: { origin: "https://appleid.apple.com", cookie: `${STATE_COOKIE}=${cookieFrom(start, STATE_COOKIE)}` },
    body: { code: "apple-code", state: location.searchParams.get("state"), user: JSON.stringify({ name: { firstName: "Sanju", lastName: "K" } }) },
  }), back);
  assert.equal(back.headers.Location, "/viral-signed-in?to=%2Fviral");
  assert.equal(sentSecret.split(".").length, 3);
  assert.ok(cookieFrom(back, SESSION_COOKIE));
  assert.equal(db.docs("users")[0].appleSub, "apple-1");
  assert.equal(db.docs("users")[0].name, "Sanju K");
});

test("email: a code is sent once, checked with a limit on tries, and opens a session", async () => {
  const db = database();
  const sent = [];
  let clock = Date.UTC(2026, 8, 21, 6);
  const handler = createViralAuthHandler({
    getDatabaseFn: async () => db,
    now: () => clock,
    fetchFn: async (url, options) => { sent.push({ url, body: JSON.parse(options.body) }); return new Response("{}"); },
  });
  const post = async (action, body, headers) => {
    const res = response();
    await handler(request({ method: "POST", query: { action }, body, headers }), res);
    return res;
  };

  let res = await post("email-start", { email: "not an email" });
  assert.equal(res.statusCode, 400);
  res = await post("email-start", { email: "a@example.com" }, { origin: "https://evil.example" });
  assert.equal(res.statusCode, 403);

  res = await post("email-start", { email: "A@Example.com" });
  assert.equal(res.statusCode, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, "https://api.resend.com/emails");
  assert.deepEqual(sent[0].body.to, ["a@example.com"]);
  const code = sent[0].body.subject.match(/^(\d{6}) /u)[1];
  assert.ok(sent[0].body.text.includes(code));
  assert.ok(!JSON.stringify(db.docs("email_codes")).includes(code), "the code itself is never stored");

  res = await post("email-start", { email: "a@example.com" });
  assert.equal(res.statusCode, 429, "not again within seconds");

  const wrong = code === "000000" ? "111111" : "000000";
  res = await post("email-verify", { email: "a@example.com", code: wrong });
  assert.equal(res.body.error, "wrong_code");
  res = await post("email-verify", { email: "a@example.com", code });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.user, { name: null, email: "a@example.com" });
  assert.ok(cookieFrom(res, SESSION_COOKIE));
  res = await post("email-verify", { email: "a@example.com", code });
  assert.equal(res.body.error, "code_expired", "a code works once");

  // Too many wrong tries burn the code, even the right one after.
  clock += 60_000;
  await post("email-start", { email: "b@example.com" });
  const second = sent.at(-1).body.subject.slice(0, 6);
  const miss = second === "000000" ? "111111" : "000000";
  for (let i = 0; i < CODE_ATTEMPTS; i += 1) await post("email-verify", { email: "b@example.com", code: miss });
  res = await post("email-verify", { email: "b@example.com", code: second });
  assert.equal(res.body.error, "code_expired");

  // An expired code is refused.
  await post("email-start", { email: "c@example.com" });
  const third = sent.at(-1).body.subject.slice(0, 6);
  clock += 11 * 60_000;
  res = await post("email-verify", { email: "c@example.com", code: third });
  assert.equal(res.body.error, "code_expired");
});

test("email: each address gets a few codes a day", async () => {
  const db = database();
  let clock = Date.UTC(2026, 8, 21, 6);
  const handler = createViralAuthHandler({ getDatabaseFn: async () => db, now: () => clock, fetchFn: async () => new Response("{}") });
  let res;
  for (let i = 0; i <= EMAIL_LIMITS.perAddress; i += 1) {
    clock += 60_000;
    res = response();
    await handler(request({ method: "POST", query: { action: "email-start" }, body: { email: "flood@example.com" } }), res);
  }
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.error, "email_limit");
});

test("the same person signing in with Google and then email is one account", async () => {
  const db = database();
  const { upsertUser } = await import("../lib/viral-auth.js");
  const first = await upsertUser(db, { provider: "google", sub: "g-9", email: "same@example.com", name: "Same" });
  const second = await upsertUser(db, { provider: "email", sub: "same@example.com", email: "same@example.com", name: null });
  assert.equal(first._id, second._id);
  assert.equal(db.docs("users").length, 1);
  assert.deepEqual(db.docs("users")[0].providers, ["google", "email"]);
});

test("signing out ends the session", async () => {
  const db = database();
  const handler = createViralAuthHandler({ getDatabaseFn: async () => db });
  const token = "a".repeat(43);
  const { createHash } = await import("node:crypto");
  db.collection("sessions").docs.push({ _id: createHash("sha256").update(token).digest("hex"), userId: "u1", expiresAt: new Date(Date.now() + 60_000) });
  db.collection("users").docs.push({ _id: "u1", email: "a@example.com" });
  assert.ok(await currentUser(request({ headers: { cookie: `${SESSION_COOKIE}=${token}` } }), { getDatabaseFn: async () => db }));
  const res = response();
  await handler(request({ method: "POST", query: { action: "signout" }, headers: { cookie: `${SESSION_COOKIE}=${token}` } }), res);
  assert.equal(res.statusCode, 200);
  assert.match([].concat(res.headers["Set-Cookie"])[0], /Max-Age=0/u);
  assert.equal(await currentUser(request({ headers: { cookie: `${SESSION_COOKIE}=${token}` } }), { getDatabaseFn: async () => db }), null);
});

test("posting: signed out gets 401 before any spending; signed in posts, tagged with the person", async () => {
  process.env.AI_GATEWAY_API_KEY = "vck_test";
  const never = async () => { throw new Error("must not be called"); };
  const gated = createViralHandler({ authRequiredFn: () => true, userFn: async () => null, queryFn: never, fetchFn: never, creatorFn: never });
  const denied = response();
  await gated(request({ method: "POST", body: { text: "hello", platform: "x" } }), denied);
  assert.equal(denied.statusCode, 401);
  assert.equal(denied.body.error, "sign_in_required");

  let saved;
  let noted;
  const answers = { like: { probability: 0.5 } };
  const handler = createViralHandler({
    authRequiredFn: () => true,
    userFn: async () => ({ _id: "u1", email: "a@example.com" }),
    noteFn: async (user, platform) => { noted = { user, platform }; },
    queryFn: async () => [{ status: "ok", key_requests: 0, day: "2026-09-21" }],
    fetchFn: async () => new Response(JSON.stringify({ answers, usage: { inputTokens: 10 } })),
    storeEnabledFn: () => true,
    saveFn: async (post) => { saved = post; return true; },
    creatorFn: async () => null,
    liveTrendsFn: async () => [],
  });
  const res = response();
  await handler(request({ method: "POST", body: { id: "1758300000000-abc123", text: "hello", platform: "x", publish: true, author: { handle: "anyone", name: "Any" } } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(saved.userId, "u1");
  assert.equal(saved.author.handle, "anyone", "the handle is still the visitor's choice");
  assert.equal(noted.platform, "x");
});

test("a Google account can't take over an account by an address Google no longer vouches for", async () => {
  const { upsertUser, IdentityConflict } = await import("../lib/viral-auth.js");
  const db = database();
  await upsertUser(db, { provider: "email", sub: "bob@company.com", email: "bob@company.com", name: null });
  await assert.rejects(upsertUser(db, { provider: "google", sub: "g-old", email: "bob@company.com", name: "Bob", linkable: false }), IdentityConflict);
  await upsertUser(db, { provider: "google", sub: "g-a", email: "amy@gmail.com", name: "Amy", linkable: true });
  await assert.rejects(upsertUser(db, { provider: "google", sub: "g-b", email: "amy@gmail.com", name: "Not Amy", linkable: true }), IdentityConflict, "a second Google account never replaces the first");
  assert.equal(db.docs("users").find((user) => user.email === "amy@gmail.com").googleSub, "g-a");
});

test("Google sign-in with a non-Gmail address that already has an account says to use email", async () => {
  const db = database();
  db.collection("users").docs.push({ _id: "u1", email: "bob@company.com", providers: ["email"] });
  let nonce;
  const handler = createViralAuthHandler({
    getDatabaseFn: async () => db,
    fetchFn: async () => new Response(JSON.stringify({ id_token: jwt({ iss: "https://accounts.google.com", aud: "google-client", exp: Math.floor(Date.now() / 1000) + 300, nonce, sub: "g-old", email: "bob@company.com", email_verified: true }) })),
  });
  const { location, stateCookie } = await startGoogle(handler);
  nonce = location.searchParams.get("nonce");
  const back = response();
  await handler(request({ query: { action: "callback", provider: "google", code: "c", state: location.searchParams.get("state") }, headers: { cookie: `${STATE_COOKIE}=${stateCookie}` } }), back);
  assert.match(back.headers.Location, /error=use_email/u);
  assert.equal(db.docs("sessions").length, 0);
});

test("email limits: IPv6 counts by /64, and a refused request doesn't spend the address's quota", async () => {
  const { networkOf } = await import("../lib/viral-auth.js");
  assert.equal(networkOf("2001:db8:1:2:aaaa::1"), "2001:db8:1:2::/64");
  assert.equal(networkOf("2001:0db8:0001:0002:ffff:0:0:9"), "2001:db8:1:2::/64");
  assert.equal(networkOf("203.0.113.9"), "203.0.113.9");

  const db = database();
  let clock = Date.UTC(2026, 8, 21, 6);
  const handler = createViralAuthHandler({ getDatabaseFn: async () => db, now: () => clock, fetchFn: async () => new Response("{}") });
  for (let i = 0; i <= EMAIL_LIMITS.perNetwork; i += 1) {
    clock += 60_000;
    const res = response();
    await handler(request({ method: "POST", query: { action: "email-start" }, body: { email: `spam${i}@example.com` }, headers: { "x-real-ip": `2001:db8:1:2::${i + 1}` } }), res);
    if (i === EMAIL_LIMITS.perNetwork) assert.equal(res.statusCode, 429, "rotating addresses inside one /64 doesn't help");
  }
  const victim = db.docs("auth_limits").find((doc) => doc._id.startsWith(`email-to:`) && doc.n > 1);
  assert.equal(victim, undefined);
  assert.ok(!db.docs("auth_limits").some((doc) => doc._id.includes("spam10")), "the refused address was never counted");
});
