export class MetaError extends Error {
  constructor(status, code, message = "Meta API request failed.") {
    super(message);
    this.name = "MetaError";
    this.status = status;
    this.code = code;
  }
}

function settings() {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID;
  const version = process.env.META_GRAPH_API_VERSION || "v25.0";
  if (!token || !/^\d+$/u.test(accountId || "")) throw new Error("Instagram API credentials are incomplete.");
  return { token, accountId, base: new URL(`https://graph.instagram.com/${version}/`) };
}

async function graph(path, { method = "GET", params = {}, body } = {}) {
  const { token, base } = settings();
  const url = new URL(path.replace(/^\//u, ""), base);
  if (url.origin !== base.origin) throw new Error("Unexpected Meta API origin.");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      if (method === "GET" && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      throw new MetaError(503, "transport", "Meta API was unreachable.");
    }
    let payload = {};
    try { payload = await response.json(); } catch { payload = {}; }
    if (response.ok) return payload;
    const safeToRetry = response.status === 429 || (method === "GET" && [502, 503, 504].includes(response.status));
    if (safeToRetry && attempt < 2) {
      const retryAfter = Math.min(5, Math.max(0, Number(response.headers.get("retry-after")) || attempt + 1));
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      continue;
    }
    throw new MetaError(response.status, payload?.error?.code, payload?.error?.message || "Meta API request failed.");
  }
  throw new MetaError(503, "transport", "Meta API was unreachable.");
}

async function allPages(path, params) {
  const first = await graph(path, { params });
  const rows = Array.isArray(first.data) ? [...first.data] : [];
  let next = first?.paging?.next;
  let pages = 1;
  while (next && pages < 10) {
    const target = new URL(next);
    if (target.origin !== "https://graph.instagram.com") break;
    const { token } = settings();
    let payload = {};
    let loaded = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let response;
      try {
        response = await fetch(target, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
      } catch {
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
          continue;
        }
        throw new MetaError(503, "transport", "Meta API was unreachable.");
      }
      try { payload = await response.json(); } catch { payload = {}; }
      if (response.ok) {
        loaded = true;
        break;
      }
      const safeToRetry = response.status === 429 || [502, 503, 504].includes(response.status);
      if (!safeToRetry || attempt >= 2) throw new MetaError(response.status, payload?.error?.code, payload?.error?.message);
      const retryAfter = Math.min(5, Math.max(0, Number(response.headers.get("retry-after")) || attempt + 1));
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    }
    if (!loaded) throw new MetaError(503, "transport", "Meta API was unreachable.");
    rows.push(...(Array.isArray(payload.data) ? payload.data : []));
    next = payload?.paging?.next;
    pages += 1;
  }
  return rows;
}

export function accountId() {
  return settings().accountId;
}

export function getAccount() {
  const { accountId: id } = settings();
  return graph(id, { params: { fields: "id,username,name,biography,profile_picture_url,followers_count,follows_count,media_count" } });
}

export function getSubscribedApps() {
  const { accountId: id } = settings();
  return graph(`${id}/subscribed_apps`);
}

export function listMedia() {
  const { accountId: id } = settings();
  return allPages(`${id}/media`, {
    fields: "id,caption,media_type,permalink,timestamp,thumbnail_url,comments_count,like_count",
    limit: 100,
  });
}

export function listConversations() {
  const { accountId: id } = settings();
  return allPages(`${id}/conversations`, {
    platform: "instagram",
    fields: "id,updated_time,participants,messages.limit(100){id,created_time,from,to,message}",
    limit: 50,
  });
}

export async function getFollowStatus(recipientId) {
  const payload = await graph(encodeURIComponent(recipientId), { params: { fields: "is_user_follow_business" } });
  if (typeof payload?.is_user_follow_business !== "boolean") throw new MetaError(502, "missing_follow_status", "Meta did not return follow status.");
  return payload.is_user_follow_business;
}

export function privateReply(commentId, message) {
  const { accountId: id } = settings();
  return graph(`${id}/messages`, { method: "POST", body: { recipient: { comment_id: commentId }, message } });
}

export function sendMessage(recipientId, message) {
  const { accountId: id } = settings();
  return graph(`${id}/messages`, {
    method: "POST",
    body: { recipient: { id: recipientId }, message },
  });
}

export function replyToComment(commentId, text) {
  return graph(`${encodeURIComponent(commentId)}/replies`, { method: "POST", body: { message: text } });
}
