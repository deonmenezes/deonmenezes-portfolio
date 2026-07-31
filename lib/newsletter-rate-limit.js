import { createHmac } from "node:crypto";
import { query } from "./social/db.js";

const RATE_LIMIT_SQL = `
  WITH locks AS MATERIALIZED (
    SELECT pg_advisory_xact_lock(hashtextextended(key_hash, 0))
    FROM (VALUES ($1), ($2)) AS keys(key_hash)
    ORDER BY key_hash
  ),
  recent AS (
    SELECT
      COUNT(*) FILTER (
        WHERE key_hash = $1 AND created_at > NOW() - INTERVAL '1 hour'
      )::int AS ip_attempts,
      COUNT(*) FILTER (
        WHERE key_hash = $2 AND created_at > NOW() - INTERVAL '24 hours'
      )::int AS email_attempts
    FROM newsletter_signup_attempts
    CROSS JOIN (SELECT COUNT(*) FROM locks) AS lock_gate
    WHERE created_at > NOW() - INTERVAL '7 days'
      AND key_hash IN ($1, $2)
  ),
  allowed AS (
    SELECT (ip_attempts < 20 AND email_attempts < 5) AS ok
    FROM recent
  ),
  recorded AS (
    INSERT INTO newsletter_signup_attempts (key_hash)
    SELECT value
    FROM allowed, (VALUES ($1), ($2)) AS keys(value)
    WHERE ok
    RETURNING 1
  ),
  purged AS (
    DELETE FROM newsletter_signup_attempts
    WHERE created_at < NOW() - INTERVAL '7 days'
    RETURNING 1
  )
  SELECT COUNT(*)::int AS inserted FROM recorded
`;

function requestIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim()
    .slice(0, 128);
}

function keyHash(secret, type, value) {
  return createHmac("sha256", secret).update(`${type}:${value}`).digest("hex");
}

export async function enforceNewsletterRateLimit(req, email, secret, queryFn = query) {
  const ipHash = keyHash(secret, "ip", requestIp(req));
  const emailHash = keyHash(secret, "email", email);
  const rows = await queryFn(RATE_LIMIT_SQL, [ipHash, emailHash]);
  return Number(rows[0]?.inserted) === 2;
}
