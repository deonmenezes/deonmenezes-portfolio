const MAX_JSON_BYTES = 64 * 1024;

export function applyApiHeaders(res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
}

export function sendJson(res, status, body) {
  applyApiHeaders(res);
  res.status(status).json(body);
}

export function requireMethod(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader("Allow", methods.join(", "));
  sendJson(res, 405, { error: "method_not_allowed" });
  return false;
}

export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    const expectedHost = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
    const expectedProtocol = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
    const actual = new URL(origin);
    return actual.host === expectedHost && actual.protocol === `${expectedProtocol}:`;
  } catch {
    return false;
  }
}

export async function readJson(req, maxBytes = MAX_JSON_BYTES) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const raw = await readRawBody(req, maxBytes);
  if (!raw.length) return {};
  return JSON.parse(raw.toString("utf8"));
}

export async function readRawBody(req, maxBytes = 1024 * 1024) {
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > maxBytes) throw new Error("payload_too_large");
    return req.body;
  }
  if (typeof req.body === "string") {
    const buffer = Buffer.from(req.body);
    if (buffer.length > maxBytes) throw new Error("payload_too_large");
    return buffer;
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new Error("payload_too_large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export function publicBaseUrl(req) {
  const configured = process.env.PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/u, "");
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "deonmenezes.com").split(",")[0].trim();
  const protocol = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  return `${protocol}://${host}`;
}

export function logError(scope, error) {
  console.error(JSON.stringify({
    level: "error",
    scope,
    errorKind: error?.name || "Error",
    message: String(error?.message || "unexpected_error").slice(0, 300),
    at: new Date().toISOString(),
  }));
}
