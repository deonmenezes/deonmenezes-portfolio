/* Sign-in for /viral, asked for only when a visitor tries to post.

   Three ways in: Google and Apple (OpenID Connect, code flow) and a six-digit
   code sent by email through Resend. A provider is offered only when its
   credentials are set, and posting requires a session only while at least one
   is. Everything lives in MongoDB next to the posts: `users`, `sessions` (only
   a SHA-256 of each token is stored), `email_codes`, `auth_limits`.

   The session is an HttpOnly `__Host-` cookie. Google and Apple run in a popup
   so the draft (and any attached video) stays in the page underneath; the
   callback ends on /viral-signed-in, which tells the page and closes itself.
   The id_token comes straight from the provider's token endpoint over TLS in
   exchange for our client secret, so its claims are checked (issuer, audience,
   expiry, nonce) but its signature is not fetched and verified; OpenID Connect
   Core 3.1.3.7 allows that for this flow. */

import { createHash, createHmac, randomBytes, randomInt, sign, timingSafeEqual } from "node:crypto";
import { applyApiHeaders, logError, readJson, readRawBody, requireMethod, sameOrigin, sendJson } from "./social/http.js";
import { requestIp } from "./jev.js";
import { getDatabase, storeEnabled } from "./viral-store.js";
import { isSubscribableEmail } from "./resend-contacts.js";

export const SESSION_COOKIE = "__Host-virelity_session";
export const STATE_COOKIE = "__Host-virelity_auth";
const SESSION_DAYS = 30;
const STATE_SECONDS = 600;
const CODE_SECONDS = 600;
export const CODE_ATTEMPTS = 5;
const CODE_RESEND_SECONDS = 30;
// Resend's free plan sends 100 emails a day, so the site-wide cap stays under it.
export const EMAIL_LIMITS = { perAddress: 5, perNetwork: 10, site: 90 };
const DAY_MS = 86_400_000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const RETURN_PATHS = new Set(["/", "/viral"]);
const SIGNED_IN_PAGE = "/viral-signed-in";
// Redirect URIs are built from the request's host, so only these hosts may start a sign-in.
const HOSTS = ["virelity.com", "www.virelity.com", "deonmenezes.com", "www.deonmenezes.com", "viral-89458c.vercel.app"];

const GOOGLE = {
  authorize: "https://accounts.google.com/o/oauth2/v2/auth",
  token: "https://oauth2.googleapis.com/token",
  issuers: ["https://accounts.google.com", "accounts.google.com"],
};
const APPLE = {
  authorize: "https://appleid.apple.com/auth/authorize",
  token: "https://appleid.apple.com/auth/token",
  issuers: ["https://appleid.apple.com"],
};

const env = (name) => process.env[name]?.trim() || "";

/** The providers that are configured, in the order the page shows them. */
export function providers() {
  if (env("VIRAL_AUTH").toLowerCase() === "off") return [];
  const has = (...names) => names.every((name) => env(name));
  return [
    has("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET") && "google",
    has("APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY") && "apple",
    has("RESEND_API_KEY") && "email",
  ].filter(Boolean);
}

/** Posting needs a session only when someone could actually get one. */
export function authRequired() {
  return providers().length > 0 && Boolean(env("JEV_HASH_SECRET")) && storeEnabled();
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const hmac = (label, value) => createHmac("sha256", env("JEV_HASH_SECRET")).update(`${label}:${value}`).digest("base64url");
const sameText = (a, b) => {
  const left = Buffer.from(String(a ?? ""));
  const right = Buffer.from(String(b ?? ""));
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
};

export function parseCookies(header) {
  const cookies = {};
  for (const part of String(header || "").split(";")) {
    const at = part.indexOf("=");
    if (at > 0) cookies[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  return cookies;
}

const sessionCookie = (token, maxAge) => `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
// SameSite=None: Apple returns by a cross-site POST, which would not carry a Lax cookie.
const stateCookie = (value, maxAge) => `${STATE_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None`;

export function signState(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac("auth-state", body)}`;
}

export function readState(value, now = Date.now()) {
  const [body, mac] = String(value || "").split(".");
  if (!body || !mac || !sameText(mac, hmac("auth-state", body))) return null;
  try {
    const state = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return state && state.exp > now ? state : null;
  } catch {
    return null;
  }
}

function siteBase(req) {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim().toLowerCase();
  const extra = env("VIRAL_AUTH_HOSTS").toLowerCase().split(",").map((entry) => entry.trim()).filter(Boolean);
  return HOSTS.includes(host) || extra.includes(host) ? `https://${host}` : null;
}

const callbackUrl = (base, provider) => `${base}/api/viral/auth/callback/${provider}`;

export function decodeJwt(token) {
  const part = String(token || "").split(".")[1];
  if (!part) throw new Error("malformed_id_token");
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

/** Apple's client secret is a short-lived ES256 JWT signed with the team's key. */
export function appleClientSecret(now = Date.now()) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const iat = Math.floor(now / 1000);
  const unsigned = `${encode({ alg: "ES256", kid: env("APPLE_KEY_ID") })}.${encode({ iss: env("APPLE_TEAM_ID"), iat, exp: iat + 300, aud: "https://appleid.apple.com", sub: env("APPLE_CLIENT_ID") })}`;
  const key = env("APPLE_PRIVATE_KEY").replace(/\\n/gu, "\n");
  const signature = sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${unsigned}.${signature}`;
}

function checkClaims(claims, { issuers, audience, nonce, now }) {
  if (!issuers.includes(claims?.iss)) throw new Error("wrong_issuer");
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(audience)) throw new Error("wrong_audience");
  if (!(Number(claims.exp) * 1000 > now)) throw new Error("expired_id_token");
  if (!sameText(claims.nonce, nonce)) throw new Error("wrong_nonce");
  if (typeof claims.sub !== "string" || !claims.sub) throw new Error("no_subject");
  const verified = claims.email_verified === true || claims.email_verified === "true";
  return { sub: claims.sub, email: verified ? isSubscribableEmail(claims.email) || null : null };
}

async function exchange(url, params, fetchFn) {
  const response = await fetchFn(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(8000),
  });
  const tokens = await response.json().catch(() => ({}));
  if (!response.ok || typeof tokens.id_token !== "string") throw new Error(`token_exchange_${response.status}`);
  return decodeJwt(tokens.id_token);
}

async function googleIdentity({ code, base, state, fetchFn, now }) {
  const claims = await exchange(GOOGLE.token, {
    code, client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"),
    redirect_uri: callbackUrl(base, "google"), grant_type: "authorization_code",
  }, fetchFn);
  const { sub, email } = checkClaims(claims, { issuers: GOOGLE.issuers, audience: env("GOOGLE_CLIENT_ID"), nonce: state.n, now });
  if (!email) throw new Error("email_not_verified");
  // Google vouches for Gmail and Workspace addresses today. Any other address was only
  // verified once, when the Google account was made, so it may not be theirs any more:
  // such an account never takes over an existing account that has that email.
  const linkable = email.endsWith("@gmail.com") || typeof claims.hd === "string";
  return { provider: "google", sub, email, name: String(claims.name || "").slice(0, 80) || null, linkable };
}

async function appleIdentity({ code, base, state, fetchFn, now, form }) {
  const claims = await exchange(APPLE.token, {
    code, client_id: env("APPLE_CLIENT_ID"), client_secret: appleClientSecret(now),
    redirect_uri: callbackUrl(base, "apple"), grant_type: "authorization_code",
  }, fetchFn);
  const { sub, email } = checkClaims(claims, { issuers: APPLE.issuers, audience: env("APPLE_CLIENT_ID"), nonce: state.n, now });
  // Apple sends the person's name once, on their first sign-in, beside the code.
  let name = null;
  try {
    const user = typeof form.user === "string" ? JSON.parse(form.user) : null;
    name = [user?.name?.firstName, user?.name?.lastName].filter((part) => typeof part === "string").join(" ").trim().slice(0, 80) || null;
  } catch { /* no name, then */ }
  return { provider: "apple", sub, email, name };
}

let indexesPromise;
function ensureIndexes(db) {
  indexesPromise ??= Promise.all([
    db.collection("users").createIndex({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } }),
    db.collection("users").createIndex({ googleSub: 1 }, { unique: true, partialFilterExpression: { googleSub: { $type: "string" } } }),
    db.collection("users").createIndex({ appleSub: 1 }, { unique: true, partialFilterExpression: { appleSub: { $type: "string" } } }),
    db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("email_codes").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("auth_limits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]).then(() => true, (error) => {
    indexesPromise = undefined;
    logError("viral.auth.indexes", error);
    return false;
  });
  return indexesPromise;
}

/** Finds the person by provider id, then by verified email (which links the two), else creates them. */
export class IdentityConflict extends Error {}

export async function upsertUser(db, { provider, sub, email, name, linkable = true }, now = new Date()) {
  const users = db.collection("users");
  const subField = provider === "email" ? null : `${provider}Sub`;
  const bySub = async () => (subField ? await users.findOne({ [subField]: sub }) : null);
  const find = async () => {
    const own = await bySub();
    if (own || !email) return own;
    const byEmail = await users.findOne({ email });
    // An email match joins two ways in only when this one can be trusted with the address,
    // and never swaps out a different Google or Apple account already tied to it.
    if (byEmail && (!linkable || (subField && byEmail[subField] && byEmail[subField] !== sub))) throw new IdentityConflict("identity_conflict");
    return byEmail;
  };
  let user = await find();
  if (!user) {
    const doc = { ...(email ? { email } : {}), name: name || null, ...(subField ? { [subField]: sub } : {}), providers: [provider], createdAt: now, lastSignInAt: now, signIns: 1, simulations: 0 };
    try {
      const { insertedId } = await users.insertOne(doc);
      return { _id: insertedId, ...doc };
    } catch (error) {
      if (error?.code !== 11000) throw error;
      user = await find();
      if (!user) throw error;
    }
  }
  const set = { lastSignInAt: now };
  if (subField && !user[subField]) set[subField] = sub;
  if (!user.name && name) set.name = name;
  if (!user.email && email) set.email = email;
  await users.updateOne({ _id: user._id }, { $set: set, $addToSet: { providers: provider }, $inc: { signIns: 1 } });
  return { ...user, ...set };
}

async function startSession(db, userId, now) {
  const token = randomBytes(32).toString("base64url");
  await db.collection("sessions").insertOne({ _id: sha256(token), userId, createdAt: new Date(now), expiresAt: new Date(now + SESSION_DAYS * DAY_MS) });
  return token;
}

/** The signed-in person behind a request, or null. */
export async function currentUser(req, { getDatabaseFn = getDatabase, now = Date.now() } = {}) {
  const token = parseCookies(req.headers?.cookie)[SESSION_COOKIE];
  if (!token || !TOKEN_PATTERN.test(token)) return null;
  const db = await getDatabaseFn();
  if (!db) return null;
  const session = await db.collection("sessions").findOne({ _id: sha256(token), expiresAt: { $gt: new Date(now) } });
  if (!session) return null;
  return db.collection("users").findOne({ _id: session.userId });
}

/** Counts a simulation against the person, for the owner's own numbers. Best effort. */
export async function noteSimulation(user, platform, { getDatabaseFn = getDatabase } = {}) {
  if (!user?._id) return;
  try {
    const db = await getDatabaseFn();
    await db?.collection("users").updateOne({ _id: user._id }, { $inc: { simulations: 1, [`byPlatform.${platform}`]: 1 }, $set: { lastPostAt: new Date() } });
  } catch (error) {
    logError("viral.auth.note", error);
  }
}

// One counter per key per UTC day; the documents delete themselves.
async function spend(db, key, max, now) {
  const day = new Date(now).toISOString().slice(0, 10);
  const doc = await db.collection("auth_limits").findOneAndUpdate(
    { _id: `${key}:${day}` },
    { $inc: { n: 1 }, $setOnInsert: { expiresAt: new Date(now + DAY_MS * 2) } },
    { upsert: true, returnDocument: "after" },
  );
  return Number(doc?.n ?? doc?.value?.n) <= max;
}

async function sendCode(email, code, fetchFn) {
  const from = env("VIRAL_AUTH_FROM") || `Virelity <signin@${env("RESEND_EMAIL_DOMAIN") || "deonmenezes.com"}>`;
  const response = await fetchFn("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json", "User-Agent": "virelity-auth/1.0" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `${code} is your Virelity code`,
      text: `Your Virelity sign-in code is ${code}\n\nIt works for 10 minutes. If you didn't ask for it, you can ignore this email.`,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`resend_${response.status}`);
}

// One IPv6 household gets a whole /64, so count it as one network.
export function networkOf(ip) {
  if (!ip.includes(":")) return ip;
  const [head, tail = ""] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : left;
  return `${groups.slice(0, 4).map((group) => group.toLowerCase().replace(/^0+(?=.)/u, "")).join(":")}::/64`;
}

const codeHash = (email, code) => hmac("email-code", `${email}:${code}`);

async function readForm(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const raw = await readRawBody(req, 16 * 1024);
  return Object.fromEntries(new URLSearchParams(raw.toString("utf8")));
}

function redirect(res, location, cookies = []) {
  applyApiHeaders(res);
  if (cookies.length) res.setHeader("Set-Cookie", cookies);
  res.setHeader("Location", location);
  res.status(302).end();
}

const publicUser = (user) => (user ? { name: user.name || null, email: user.email || null } : null);

export function createViralAuthHandler({ getDatabaseFn = getDatabase, fetchFn = (...args) => fetch(...args), now = () => Date.now() } = {}) {
  return async function handler(req, res) {
    if (!requireMethod(req, res, ["GET", "POST"])) return;
    const action = String(req.query?.action || "me");
    const provider = String(req.query?.provider || "");
    const enabled = providers();

    try {
      if (action === "me") {
        if (req.method !== "GET") return sendJson(res, 405, { error: "method_not_allowed" });
        const required = authRequired();
        const user = required ? await currentUser(req, { getDatabaseFn, now: now() }) : null;
        return sendJson(res, 200, { user: publicUser(user), providers: required ? enabled : [], required });
      }

      if (action === "start") {
        if (req.method !== "GET" || !["google", "apple"].includes(provider) || !enabled.includes(provider)) return sendJson(res, 404, { error: "unknown_provider" });
        const base = siteBase(req);
        if (!base) return sendJson(res, 400, { error: "unknown_host" });
        const to = RETURN_PATHS.has(String(req.query?.to)) ? String(req.query.to) : "/";
        const state = { p: provider, s: randomBytes(16).toString("base64url"), n: randomBytes(16).toString("base64url"), to, tab: req.query?.mode === "tab", exp: now() + STATE_SECONDS * 1000 };
        const google = provider === "google";
        const params = new URLSearchParams({
          client_id: env(google ? "GOOGLE_CLIENT_ID" : "APPLE_CLIENT_ID"),
          redirect_uri: callbackUrl(base, provider),
          response_type: "code",
          scope: google ? "openid email profile" : "name email",
          state: state.s,
          nonce: state.n,
          ...(google ? { prompt: "select_account" } : { response_mode: "form_post" }),
        });
        return redirect(res, `${(google ? GOOGLE : APPLE).authorize}?${params}`, [stateCookie(signState(state), STATE_SECONDS)]);
      }

      if (action === "callback") {
        const state = readState(parseCookies(req.headers?.cookie)[STATE_COOKIE], now());
        const done = (error, extra = []) => redirect(res, `${SIGNED_IN_PAGE}?${new URLSearchParams({ to: state?.to || "/", ...(state?.tab ? { tab: "1" } : {}), ...(error ? { error } : {}) })}`, [stateCookie("", 0), ...extra]);
        if (!["google", "apple"].includes(provider) || !enabled.includes(provider)) return done("unavailable");
        const form = req.method === "POST" ? await readForm(req) : req.query || {};
        if (!state || state.p !== provider || !sameText(form.state, state.s)) return done("expired");
        if (form.error) return done(form.error === "access_denied" || form.error === "user_cancelled_authorize" ? "cancelled" : "failed");
        const base = siteBase(req);
        if (!base || typeof form.code !== "string" || !form.code) return done("failed");

        let identity;
        try {
          const read = provider === "google" ? googleIdentity : appleIdentity;
          identity = await read({ code: form.code, base, state, fetchFn, now: now(), form });
        } catch (error) {
          logError(`viral.auth.${provider}`, error);
          return done("failed");
        }
        const db = await getDatabaseFn();
        // Without the unique indexes two sign-ins could make two accounts for one person.
        if (!db || !await ensureIndexes(db)) return done("unavailable");
        let user;
        try {
          user = await upsertUser(db, identity, new Date(now()));
        } catch (error) {
          if (error instanceof IdentityConflict) return done("use_email");
          throw error;
        }
        const token = await startSession(db, user._id, now());
        return done(null, [sessionCookie(token, SESSION_DAYS * 86_400)]);
      }

      // Everything below changes state from the page itself.
      if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });
      if (!sameOrigin(req)) return sendJson(res, 403, { error: "invalid_origin" });
      const db = await getDatabaseFn();
      if (!db) return sendJson(res, 503, { error: "auth_unavailable" });

      if (action === "signout") {
        const token = parseCookies(req.headers?.cookie)[SESSION_COOKIE];
        if (token && TOKEN_PATTERN.test(token)) await db.collection("sessions").deleteOne({ _id: sha256(token) });
        res.setHeader("Set-Cookie", [sessionCookie("", 0)]);
        return sendJson(res, 200, { user: null });
      }

      if (action !== "email-start" && action !== "email-verify") return sendJson(res, 404, { error: "unknown_action" });
      if (!enabled.includes("email")) return sendJson(res, 404, { error: "unknown_provider" });
      let body;
      try {
        body = await readJson(req, 2048);
      } catch {
        return sendJson(res, 400, { error: "invalid_json" });
      }
      const email = isSubscribableEmail(body?.email);
      if (!email) return sendJson(res, 400, { error: "invalid_email", message: "That doesn't look like an email address." });
      if (!await ensureIndexes(db)) return sendJson(res, 503, { error: "auth_unavailable", message: "Sign-in is down for a moment. Try again." });
      const codes = db.collection("email_codes");
      const at = now();

      if (action === "email-start") {
        const existing = await codes.findOne({ _id: email });
        if (existing?.sentAt && at - new Date(existing.sentAt).getTime() < CODE_RESEND_SECONDS * 1000) {
          return sendJson(res, 429, { error: "too_soon", message: "A code is on its way. Give it a few seconds." });
        }
        const allowed = await spend(db, `email-ip:${hmac("ip", networkOf(requestIp(req)))}`, EMAIL_LIMITS.perNetwork, at)
          && await spend(db, "email-site", EMAIL_LIMITS.site, at)
          && await spend(db, `email-to:${hmac("email", email)}`, EMAIL_LIMITS.perAddress, at);
        if (!allowed) return sendJson(res, 429, { error: "email_limit", message: "Too many codes today. Try another way in, or come back tomorrow." });
        const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
        await codes.updateOne({ _id: email }, { $set: { codeHash: codeHash(email, code), attempts: 0, sentAt: new Date(at), expiresAt: new Date(at + CODE_SECONDS * 1000) } }, { upsert: true });
        try {
          await sendCode(email, code, fetchFn);
        } catch (error) {
          logError("viral.auth.email", error);
          await codes.deleteOne({ _id: email });
          return sendJson(res, 502, { error: "email_failed", message: "Couldn't send the code. Try again." });
        }
        return sendJson(res, 200, { sent: true });
      }

      const code = typeof body?.code === "string" ? body.code.replace(/\s+/gu, "") : "";
      if (!/^\d{6}$/u.test(code)) return sendJson(res, 400, { error: "wrong_code", message: "The code is 6 digits." });
      // Every try is counted before it is checked, so guesses can't race the limit.
      const entry = await codes.findOneAndUpdate(
        { _id: email, expiresAt: { $gt: new Date(at) }, attempts: { $lt: CODE_ATTEMPTS } },
        { $inc: { attempts: 1 } },
        { returnDocument: "after" },
      );
      const stored = entry?.codeHash ? entry : entry?.value;
      if (!stored) return sendJson(res, 400, { error: "code_expired", message: "That code has expired or had too many tries. Ask for a new one." });
      if (!sameText(stored.codeHash, codeHash(email, code))) {
        const left = CODE_ATTEMPTS - Number(stored.attempts);
        return sendJson(res, 400, { error: "wrong_code", message: left > 0 ? "That code isn't right. Check the email and try again." : "Too many tries. Ask for a new code." });
      }
      const { deletedCount } = await codes.deleteOne({ _id: email, codeHash: stored.codeHash });
      if (!deletedCount) return sendJson(res, 400, { error: "code_expired", message: "That code was already used. Ask for a new one." });
      const user = await upsertUser(db, { provider: "email", sub: email, email, name: null }, new Date(at));
      const token = await startSession(db, user._id, at);
      res.setHeader("Set-Cookie", [sessionCookie(token, SESSION_DAYS * 86_400)]);
      return sendJson(res, 200, { user: publicUser(user) });
    } catch (error) {
      logError("viral.auth", error);
      return sendJson(res, 502, { error: "auth_failed", message: "Sign-in hit a snag. Try again." });
    }
  };
}

export const viralAuthHandler = createViralAuthHandler();
