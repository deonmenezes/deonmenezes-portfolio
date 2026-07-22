import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { query } from "./db.js";

const COOKIE_NAME = "deon_social_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;

function encode(value) {
  return Buffer.from(value).toString("base64url");
}

function decode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function secret() {
  const value = process.env.SOCIAL_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SOCIAL_SESSION_SECRET must contain at least 32 characters.");
  return value;
}

function sign(value) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createSessionCookie() {
  const payload = encode(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS }));
  const token = `${payload}.${sign(payload)}`;
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").map((part) => {
    const index = part.indexOf("=");
    return index < 0 ? [part.trim(), ""] : [part.slice(0, index).trim(), part.slice(index + 1)];
  }).filter(([key]) => key));
}

export function isAdmin(req) {
  const token = cookies(req)[COOKIE_NAME];
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = sign(payload);
  const givenBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (givenBuffer.length !== expectedBuffer.length || !timingSafeEqual(givenBuffer, expectedBuffer)) return false;
  try {
    const value = JSON.parse(decode(payload));
    return Number.isSafeInteger(value.exp) && value.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function verifyAdminPassword(password) {
  const stored = process.env.SOCIAL_ADMIN_PASSWORD_HASH || "";
  const [scheme, salt, expected] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !expected || typeof password !== "string") return false;
  const actual = scryptSync(password, salt, 32).toString("base64url");
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function passwordHash(password) {
  const salt = randomBytes(16).toString("base64url");
  return `scrypt$${salt}$${scryptSync(password, salt, 32).toString("base64url")}`;
}

function requestFingerprint(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const address = forwarded || req.socket?.remoteAddress || "unknown";
  return createHmac("sha256", secret()).update(address).digest("hex");
}

export async function loginAllowed(req) {
  const fingerprint = requestFingerprint(req);
  const rows = await query(
    "SELECT COUNT(*)::int AS failures FROM social_login_attempts WHERE fingerprint = $1 AND succeeded = false AND created_at > now() - interval '15 minutes'",
    [fingerprint],
  );
  return Number(rows[0]?.failures || 0) < 8;
}

export async function recordLogin(req, succeeded) {
  await query("INSERT INTO social_login_attempts (fingerprint, succeeded) VALUES ($1, $2)", [requestFingerprint(req), succeeded]);
}
