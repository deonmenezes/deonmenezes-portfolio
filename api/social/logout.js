import { clearSessionCookie } from "../../lib/social/auth.js";
import { requireMethod, sameOrigin, sendJson } from "../../lib/social/http.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["POST"])) return;
  if (!sameOrigin(req)) return sendJson(res, 403, { error: "invalid_origin" });
  res.setHeader("Set-Cookie", clearSessionCookie());
  return sendJson(res, 200, { ok: true });
}
