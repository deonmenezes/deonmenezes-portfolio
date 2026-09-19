/* Deon X Jev: a hosted front door to TypeSafe AI's Jev model.
   Visitors mint a free `djev_` key on /jev and call POST /api/jev. Requests run
   on the site's own Vercel AI Gateway credentials, so every limit here exists to
   keep that account from being drained: per-key and site-wide daily request
   caps, a site-wide input-token budget reserved before each upstream call, and
   a site-wide cap on what the gateway reports it actually billed. */

import { createHash, createHmac, randomBytes } from "node:crypto";
import { query } from "./social/db.js";
import { applyApiHeaders, logError, readJson, requireMethod, sameOrigin, sendJson } from "./social/http.js";

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v4/ai/evaluation-model";
const JEV_MODEL = "typesafe-ai/jev";
const UPSTREAM_TIMEOUT_MS = 15_000;

const MAX_BODY_BYTES = 32 * 1024;
const MAX_QUESTIONS = 10;
const QUESTION_TYPES = new Set(["choice", "score", "boolean"]);
const KEY_PATTERN = /^djev_[A-Za-z0-9_-]{43}$/u;
const GLOBAL_USAGE_KEY = "*";

// Jev lists at $0.042 per million input tokens and is currently billed at $0.
// The token budget is what actually bounds spend: it is reserved before the
// upstream call, so in-flight requests cannot outrun it. 5M tokens is about
// $0.21 a day at list price. The billed-cost cap is a second, after-the-fact stop.
export const JEV_LIMITS = {
  keysPerIpPerDay: 3,
  keysPerDay: 500,
  keyDailyRequests: 1000,
  globalDailyRequests: 25_000,
  globalDailyInputTokens: 5_000_000,
  globalDailyCostUsd: 0.25,
};

// `lock` drives the FROM clause so the advisory lock is always taken, even for
// a network with no keys yet. Joining it to an empty scan would skip it.
const CREATE_KEY_SQL = `
  WITH lock AS MATERIALIZED (
    SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))
  ),
  recent AS (
    SELECT
      (SELECT COUNT(*)::int FROM jev_api_keys
        WHERE ip_hash = $1 AND created_at > NOW() - INTERVAL '24 hours') AS by_ip,
      (SELECT COUNT(*)::int FROM jev_api_keys
        WHERE created_at > NOW() - INTERVAL '24 hours') AS by_site
    FROM lock
  ),
  created AS (
    INSERT INTO jev_api_keys (key_hash, key_prefix, ip_hash)
    SELECT $2, $3, $1 FROM recent WHERE by_ip < $4::int AND by_site < $5::int
    RETURNING 1
  )
  SELECT COUNT(*)::int AS inserted FROM created
`;

// One round trip: confirm the key is live, decide against every cap, and only
// then count the request and reserve its estimated tokens. Refused requests
// count for nothing, so a spent key cannot burn the site-wide budget. An
// unknown or revoked key returns no rows.
const CLAIM_REQUEST_SQL = `
  WITH active AS (
    SELECT key_hash FROM jev_api_keys WHERE key_hash = $1 AND revoked_at IS NULL
  ),
  current AS (
    SELECT
      COALESCE((SELECT requests FROM jev_usage WHERE key_hash = $1 AND day = CURRENT_DATE), 0) AS key_requests,
      COALESCE((SELECT requests FROM jev_usage WHERE key_hash = $2 AND day = CURRENT_DATE), 0) AS site_requests,
      COALESCE((SELECT input_tokens FROM jev_usage WHERE key_hash = $2 AND day = CURRENT_DATE), 0) AS site_tokens,
      COALESCE((SELECT cost_usd FROM jev_usage WHERE key_hash = $2 AND day = CURRENT_DATE), 0) AS site_cost
    FROM active
  ),
  verdict AS (
    SELECT key_requests, CASE
      WHEN key_requests >= $4::int THEN 'daily_limit_reached'
      WHEN site_requests >= $5::int
        OR site_tokens + $3::bigint > $6::bigint
        OR site_cost >= $7::numeric THEN 'site_limit_reached'
      ELSE 'ok'
    END AS status
    FROM current
  ),
  bumped AS (
    INSERT INTO jev_usage (key_hash, day, requests, input_tokens)
    SELECT target, CURRENT_DATE, 1, $3::bigint
    FROM verdict, (VALUES ($1::text), ($2::text)) AS targets(target)
    WHERE status = 'ok'
    ON CONFLICT (key_hash, day) DO UPDATE
      SET requests = jev_usage.requests + 1,
          input_tokens = jev_usage.input_tokens + EXCLUDED.input_tokens
  )
  SELECT status, key_requests, CURRENT_DATE::text AS day FROM verdict
`;

// Swap the reservation for what the gateway actually counted and billed, on the
// day the request was claimed (a request can finish after midnight UTC).
const RECONCILE_USAGE_SQL = `
  UPDATE jev_usage
  SET input_tokens = GREATEST(0, input_tokens + $3::bigint - $4::bigint),
      cost_usd = cost_usd + $5::numeric
  WHERE day = $6::date AND key_hash IN ($1, $2)
`;

// Vercel sets x-real-ip itself. x-forwarded-for is not used: a caller can put
// anything in it, which would make the per-network key limit meaningless.
function requestIp(req) {
  return String(req.headers["x-real-ip"] || req.headers["x-vercel-forwarded-for"] || req.socket?.remoteAddress || "unknown")
    .split(",")[0]
    .trim()
    .slice(0, 128);
}

// Deliberately generous so reservations over-count: 2 bytes per token, plus
// headroom for the ~250 tokens Jev adds to every request on its own.
function estimateInputTokens(body) {
  return Math.ceil(Buffer.byteLength(JSON.stringify(body)) / 2) + 400;
}

export function hashKey(key) {
  return createHash("sha256").update(key).digest("hex");
}

function bearerKey(req) {
  const match = /^Bearer\s+(\S+)$/iu.exec(String(req.headers.authorization || ""));
  return match && KEY_PATTERN.test(match[1]) ? match[1] : null;
}

function applyCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateEvaluation(body) {
  if (!isPlainObject(body)) return "Send a JSON object with `state` and `questions`.";
  const { state, questions } = body;
  const stateOk = (typeof state === "string" && state.trim()) || (state !== null && typeof state === "object");
  if (!stateOk) return "`state` must be a non-empty string, object, or array.";
  if (!isPlainObject(questions)) return "`questions` must be an object of named questions.";
  const entries = Object.entries(questions);
  if (!entries.length) return "`questions` needs at least one question.";
  if (entries.length > MAX_QUESTIONS) return `At most ${MAX_QUESTIONS} questions per request.`;
  for (const [name, question] of entries) {
    if (!isPlainObject(question) || !QUESTION_TYPES.has(question.type)) {
      return `Question "${name.slice(0, 64)}" needs a \`type\` of choice, score, or boolean.`;
    }
  }
  return null;
}

export function createJevKeyHandler({ queryFn = query } = {}) {
  return async function handler(req, res) {
    if (!requireMethod(req, res, ["POST"])) return;
    if (!sameOrigin(req)) return sendJson(res, 403, { error: "invalid_origin" });

    // A dedicated salt, so rotating the gateway key never resets key quotas.
    const secret = process.env.JEV_HASH_SECRET?.trim();
    if (!secret) return sendJson(res, 503, { error: "jev_unavailable" });

    const key = `djev_${randomBytes(32).toString("base64url")}`;
    const ipHash = createHmac("sha256", secret).update(`ip:${requestIp(req)}`).digest("hex");
    try {
      const rows = await queryFn(CREATE_KEY_SQL, [ipHash, hashKey(key), key.slice(0, 10), JEV_LIMITS.keysPerIpPerDay, JEV_LIMITS.keysPerDay]);
      if (Number(rows[0]?.inserted) !== 1) {
        res.setHeader("Retry-After", "86400");
        return sendJson(res, 429, { error: "too_many_keys" });
      }
    } catch (error) {
      logError("jev.keys", error);
      return sendJson(res, 503, { error: "jev_unavailable" });
    }
    return sendJson(res, 201, { key, dailyRequests: JEV_LIMITS.keyDailyRequests });
  };
}

export function createJevHandler({ queryFn = query, fetchFn = (...args) => fetch(...args) } = {}) {
  return async function handler(req, res) {
    applyCors(res);
    if (req.method === "OPTIONS") {
      applyApiHeaders(res);
      return res.status(204).end();
    }
    if (!requireMethod(req, res, ["POST", "OPTIONS"])) return;

    const key = bearerKey(req);
    if (!key) return sendJson(res, 401, { error: "invalid_api_key", message: "Send `Authorization: Bearer djev_...`. Get a key at https://deonmenezes.com/jev" });

    let body;
    try {
      body = await readJson(req, MAX_BODY_BYTES);
      if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY_BYTES) throw new Error("payload_too_large");
    } catch (error) {
      const tooLarge = error?.message === "payload_too_large";
      return sendJson(res, tooLarge ? 413 : 400, { error: tooLarge ? "payload_too_large" : "invalid_json" });
    }

    const problem = validateEvaluation(body);
    if (problem) return sendJson(res, 400, { error: "invalid_request", message: problem });

    const gatewayKey = process.env.AI_GATEWAY_API_KEY?.trim();
    if (!gatewayKey) return sendJson(res, 503, { error: "jev_unavailable" });

    const keyHash = hashKey(key);
    const reservedTokens = estimateInputTokens(body);
    let claim;
    try {
      [claim] = await queryFn(CLAIM_REQUEST_SQL, [
        keyHash, GLOBAL_USAGE_KEY, reservedTokens,
        JEV_LIMITS.keyDailyRequests, JEV_LIMITS.globalDailyRequests,
        JEV_LIMITS.globalDailyInputTokens, JEV_LIMITS.globalDailyCostUsd,
      ]);
    } catch (error) {
      logError("jev.claim", error);
      return sendJson(res, 503, { error: "jev_unavailable" });
    }
    if (!claim) return sendJson(res, 401, { error: "invalid_api_key", message: "Unknown or revoked key." });
    if (claim.status !== "ok") {
      res.setHeader("Retry-After", "3600");
      return sendJson(res, 429, { error: claim.status, message: "Daily limit reached. It resets at 00:00 UTC." });
    }

    let upstream;
    let payload;
    try {
      upstream = await fetchFn(GATEWAY_URL, {
        method: "POST",
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${gatewayKey}`,
          "Content-Type": "application/json",
          "ai-gateway-protocol-version": "0.0.1",
          "ai-gateway-auth-method": "api-key",
          "ai-evaluation-model-specification-version": "4",
          "ai-model-id": JEV_MODEL,
        },
        body: JSON.stringify({ state: body.state, questions: body.questions }),
      });
      payload = await upstream.json();
    } catch (error) {
      logError("jev.upstream", error);
      return sendJson(res, 502, { error: "jev_upstream_failed" });
    }

    if (!upstream.ok) {
      // Only a caller's own validation error is safe to echo; anything else
      // (auth, billing, capacity) describes this site's account, not theirs.
      if (upstream.status === 400) {
        return sendJson(res, 400, { error: "invalid_request", message: String(payload?.error?.message || "Invalid request.").slice(0, 500) });
      }
      logError("jev.upstream", new Error(`gateway ${upstream.status}: ${String(payload?.error?.message || "").slice(0, 200)}`));
      return sendJson(res, upstream.status === 429 ? 429 : 502, { error: "jev_upstream_failed" });
    }

    const inputTokens = Number(payload?.usage?.inputTokens) || 0;
    const cost = Number(payload?.providerMetadata?.gateway?.cost) || 0;
    try {
      await queryFn(RECONCILE_USAGE_SQL, [keyHash, GLOBAL_USAGE_KEY, inputTokens, reservedTokens, cost, claim.day]);
    } catch (error) {
      // The reservation stays in place, so a failed write over-counts, never under.
      logError("jev.reconcile", error);
    }

    return sendJson(res, 200, {
      model: JEV_MODEL,
      answers: payload.answers,
      confidence: payload?.providerMetadata?.typesafe?.confidence ?? {},
      usage: { inputTokens, outputTokens: Number(payload?.usage?.outputTokens) || 0 },
      remainingToday: Math.max(0, JEV_LIMITS.keyDailyRequests - Number(claim.key_requests) - 1),
    });
  };
}

export const jevKeyHandler = createJevKeyHandler();
export default createJevHandler();
