import { createSessionCookie, loginAllowed, recordLogin, verifyAdminPassword } from "../../lib/social/auth.js";
import { logError, readJson, requireMethod, sameOrigin, sendJson } from "../../lib/social/http.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["POST"])) return;
  if (!sameOrigin(req)) return sendJson(res, 403, { error: "invalid_origin" });
  try {
    if (!(await loginAllowed(req))) return sendJson(res, 429, { error: "too_many_attempts" });
    const body = await readJson(req);
    const valid = verifyAdminPassword(body?.password);
    await recordLogin(req, valid);
    if (!valid) return sendJson(res, 401, { error: "invalid_password" });
    res.setHeader("Set-Cookie", createSessionCookie());
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    logError("social.login", error);
    return sendJson(res, 500, { error: "login_unavailable" });
  }
}
