import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { query } from "./db.js";
import {
  accountId,
  getAccount,
  getFollowStatus,
  listConversations,
  listMedia,
  privateReply,
  replyToComment,
  sendMessage,
} from "./meta.js";

export const FOLLOW_CONFIRMATION_PAYLOAD = "FOLLOW_CONFIRMED";
export const FOLLOW_CARD_TEXT = "🔐 Follow to Unlock Exclusive Content\n👋 Looks like you haven't followed me yet! 🤔 Follow to unlock exclusive content! 🔓";

export function normalizeKeyword(value) {
  return typeof value === "string" ? value.trim().toLocaleUpperCase("en-US") : "";
}

export function extractCaptionKeyword(caption) {
  const text = String(caption || "");
  const match = /\bcomment\s*[“”"']?\s*([\p{L}\p{N}_-]{1,40})/iu.exec(text);
  return normalizeKeyword(match?.[1] || "");
}

export function isMatch(text, keyword, mode) {
  const candidate = normalizeKeyword(text);
  const expected = normalizeKeyword(keyword);
  if (expected === "*") return true;
  const triggers = expected.split(",").map((value) => value.trim()).filter(Boolean);
  return triggers.some((trigger) => mode === "contains" ? candidate.includes(trigger) : candidate === trigger);
}

function shortcode(permalink) {
  return /\/(?:reel|p)\/([^/]+)/u.exec(String(permalink || ""))?.[1] || "";
}

function titleFromCaption(caption, fallback) {
  const firstLine = String(caption || "").split(/\r?\n/u).map((line) => line.trim()).find(Boolean);
  return (firstLine || fallback || "Instagram post").slice(0, 120);
}

export function buildFollowCard(deliveryId) {
  const profileUrl = process.env.INSTAGRAM_PROFILE_URL || "https://www.instagram.com/deon_tech/";
  const payload = deliveryId ? `${FOLLOW_CONFIRMATION_PAYLOAD}:${deliveryId}` : FOLLOW_CONFIRMATION_PAYLOAD;
  return {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text: FOLLOW_CARD_TEXT,
        buttons: [
          { type: "web_url", url: profileUrl, title: "Open Profile" },
          { type: "postback", title: "I followed 👍", payload },
        ],
      },
    },
  };
}

function linksArray(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item.url === "string") : [];
}

export function buildDeliveryText(automation, deliveryId, baseUrl) {
  const links = linksArray(automation.resource_links);
  const lines = [];
  if (automation.response_text) lines.push(automation.response_text.trim());
  links.forEach((link, index) => {
    const tracked = `${baseUrl}/go/${automation.id}/${index}?d=${encodeURIComponent(deliveryId)}`;
    lines.push(`${link.label || `Link ${index + 1}`}: ${tracked}`);
  });
  if (!lines.length) lines.push("Thanks — your request was received.");
  const text = lines.join("\n\n");
  if (text.length > 1000) throw new Error(`Automation ${automation.id} produces a message longer than Instagram's limit.`);
  return text;
}

export async function syncInstagram() {
  const run = await query("INSERT INTO social_sync_runs (kind, status) VALUES ('instagram', 'running') RETURNING id");
  const runId = run[0].id;
  try {
    const [account, media, conversations] = await Promise.all([
      getAccount(),
      listMedia(),
      listConversations().catch(() => []),
    ]);

    await query(
      `INSERT INTO social_account_snapshots
       (username, name, profile_picture_url, followers_count, follows_count, media_count)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [account.username || "deon_tech", account.name || null, account.profile_picture_url || null, account.followers_count || 0, account.follows_count || 0, account.media_count || media.length],
    );

    for (const item of media) {
      const mediaShortcode = shortcode(item.permalink);
      if (!item.id || !mediaShortcode || !item.permalink || !item.timestamp) continue;
      await query(
        `INSERT INTO social_media
         (id, shortcode, media_type, caption, permalink, thumbnail_url, published_at, comments_count, like_count, synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
         ON CONFLICT (id) DO UPDATE SET
           shortcode=excluded.shortcode, media_type=excluded.media_type, caption=excluded.caption,
           permalink=excluded.permalink, thumbnail_url=excluded.thumbnail_url, published_at=excluded.published_at,
           comments_count=excluded.comments_count, like_count=excluded.like_count, synced_at=now()`,
        [item.id, mediaShortcode, item.media_type || "UNKNOWN", item.caption || "", item.permalink, item.thumbnail_url || null, item.timestamp, item.comments_count || 0, item.like_count || 0],
      );
      const keyword = extractCaptionKeyword(item.caption);
      if (keyword) {
        await query(
          `INSERT INTO social_automations
           (media_id, title, keyword, enabled, needs_setup, source)
           VALUES ($1,$2,$3,false,true,'caption_discovery')
           ON CONFLICT (media_id) DO NOTHING`,
          [item.id, titleFromCaption(item.caption, mediaShortcode), keyword],
        );
      }
    }

    for (const conversation of conversations) {
      const participants = Array.isArray(conversation?.participants?.data) ? conversation.participants.data : [];
      const other = participants.find((person) => String(person?.id || "") !== accountId()) || participants[0] || {};
      const messages = Array.isArray(conversation?.messages?.data) ? conversation.messages.data : [];
      for (const message of messages) {
        if (!message?.id || !message?.created_time) continue;
        const fromId = String(message?.from?.id || "");
        await query(
          `INSERT INTO social_messages
           (id, conversation_id, participant_id, participant_username, direction, body, created_at, synced_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,now())
           ON CONFLICT (id) DO UPDATE SET body=excluded.body, synced_at=now()`,
          [message.id, conversation.id || null, other.id || fromId || null, other.username || other.name || null, fromId === accountId() ? "outbound" : "inbound", message.message || "", message.created_time],
        );
      }
    }

    await query(
      "UPDATE social_sync_runs SET status='completed', details=$2::jsonb, completed_at=now() WHERE id=$1",
      [runId, JSON.stringify({ media: media.length, conversations: conversations.length })],
    );
    return { media: media.length, conversations: conversations.length, account: account.username };
  } catch (error) {
    await query("UPDATE social_sync_runs SET status='failed', details=$2::jsonb, completed_at=now() WHERE id=$1", [runId, JSON.stringify({ error: String(error.message || "sync_failed").slice(0, 200) })]);
    throw error;
  }
}

export async function seedAutomations(seeds) {
  let seeded = 0;
  let missing = 0;
  for (const seed of seeds) {
    const media = await query("SELECT id FROM social_media WHERE shortcode=$1", [seed.shortcode]);
    if (!media[0]) {
      missing += 1;
      continue;
    }
    await query(
      `INSERT INTO social_automations
       (media_id, title, keyword, response_text, public_reply_text, resource_links, follow_gate_mode, enabled, needs_setup, source)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,'strict',$7,$8,'recording_import')
       ON CONFLICT (media_id) DO UPDATE SET
         title=excluded.title, keyword=excluded.keyword, response_text=excluded.response_text,
         resource_links=excluded.resource_links, enabled=excluded.enabled, needs_setup=excluded.needs_setup,
         source='recording_import', updated_at=now()
       WHERE social_automations.source <> 'dashboard'`,
      [
        media[0].id,
        seed.title,
        normalizeKeyword(seed.keyword),
        seed.responseText || "",
        seed.publicReplyText ?? "Sent you a DM — check your requests ✉️",
        JSON.stringify(seed.links || []),
        Boolean(seed.enabled),
        Boolean(seed.needsSetup),
      ],
    );
    seeded += 1;
  }
  return { seeded, missing };
}

export function extractWebhookEvents(payload) {
  const events = [];
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field !== "comments") continue;
      const value = change.value || {};
      const commentId = String(value.id || value.comment_id || "");
      if (!commentId) continue;
      events.push({
        providerId: `comment:${commentId}`,
        type: "comment",
        payload: {
          commentId,
          mediaId: String(value?.media?.id || value.media_id || ""),
          commenterId: String(value?.from?.id || value.user_id || ""),
          username: value?.from?.username || value.username || null,
          text: String(value.text || ""),
          timestamp: value.timestamp || entry.time || null,
        },
      });
    }
    for (const item of Array.isArray(entry?.messaging) ? entry.messaging : []) {
      if (item?.postback?.payload) {
        const senderId = String(item?.sender?.id || "");
        const time = String(item.timestamp || entry.time || "");
        events.push({
          providerId: `postback:${senderId}:${time}:${item.postback.payload}`,
          type: "postback",
          payload: { senderId, recipientId: String(item?.recipient?.id || ""), timestamp: item.timestamp || entry.time || null, payload: item.postback.payload },
        });
      }
      if (item?.message?.mid && !item.message.is_echo) {
        events.push({
          providerId: `message:${item.message.mid}`,
          type: "message",
          payload: {
            messageId: item.message.mid,
            senderId: String(item?.sender?.id || ""),
            recipientId: String(item?.recipient?.id || ""),
            text: String(item.message.text || ""),
            timestamp: item.timestamp || entry.time || Date.now(),
          },
        });
      }
    }
  }
  return events;
}

export async function storeWebhookEvents(events) {
  let inserted = 0;
  for (const event of events) {
    const result = await query(
      `INSERT INTO social_webhook_events (provider_event_id, event_type, payload)
       VALUES ($1,$2,$3::jsonb) ON CONFLICT (provider_event_id) DO NOTHING RETURNING id`,
      [event.providerId, event.type, JSON.stringify(event.payload)],
    );
    if (result[0]) inserted += 1;
  }
  return inserted;
}

async function markEvent(id, status, error) {
  await query(
    `UPDATE social_webhook_events SET status=$2, last_error=$3,
     processed_at=CASE WHEN $2 IN ('processed','ignored','failed') THEN now() ELSE processed_at END,
     next_attempt_at=CASE WHEN $2='retryable' THEN now() + interval '2 minutes' ELSE next_attempt_at END
     WHERE id=$1`,
    [id, status, error ? String(error).slice(0, 300) : null],
  );
}

async function processComment(event, baseUrl) {
  const payload = event.payload;
  if (!payload.commentId || !payload.mediaId || !payload.commenterId) return "ignored";
  const automations = await query(
    `SELECT a.* FROM social_automations a
     WHERE a.media_id=$1 AND a.enabled=true AND a.needs_setup=false LIMIT 1`,
    [payload.mediaId],
  );
  const automation = automations[0];
  if (!automation || !isMatch(payload.text, automation.keyword, automation.match_mode)) return "ignored";

  const claimed = await query(
    `INSERT INTO social_deliveries
     (automation_id, media_id, comment_id, commenter_id, commenter_username, comment_text, attempts, retry_action, claimed_at)
     VALUES ($1,$2,$3,$4,$5,$6,1,'initial',now())
     ON CONFLICT (comment_id) DO NOTHING RETURNING *`,
    [automation.id, payload.mediaId, payload.commentId, payload.commenterId, payload.username, payload.text],
  );
  if (!claimed[0]) return "processed";
  const delivery = claimed[0];
  let follows = false;
  try { follows = await getFollowStatus(payload.commenterId); } catch { follows = false; }
  await query(
    "UPDATE social_deliveries SET follows_account=$2,recipient_id=$3,claimed_at=now(),retry_action='initial',updated_at=now() WHERE id=$1",
    [delivery.id, follows, payload.commenterId],
  );

  try {
    const message = automation.follow_gate_mode === "strict" && !follows
      ? buildFollowCard(delivery.id)
      : { text: buildDeliveryText(automation, delivery.id, baseUrl) };
    const result = await privateReply(payload.commentId, message);
    const status = automation.follow_gate_mode === "strict" && !follows ? "awaiting_follow" : "sent";
    const recipientId = String(result?.recipient_id || payload.commenterId);
    const messageId = String(result?.message_id || `delivery:${delivery.id}:initial`);
    const messageBody = typeof message.text === "string" ? message.text : FOLLOW_CARD_TEXT;
    await query(
      `UPDATE social_deliveries SET status=$2, follows_account=$3, recipient_id=$4,
       private_reply_message_id=$5, retry_action=CASE WHEN $2='awaiting_follow' THEN 'resource' ELSE 'none' END,
       claimed_at=NULL, delivered_at=CASE WHEN $2='sent' THEN now() ELSE NULL END, updated_at=now()
       WHERE id=$1`,
      [delivery.id, status, follows, recipientId, String(result?.message_id || "") || null],
    );
    await query(
      `INSERT INTO social_messages
       (id, participant_id, participant_username, direction, body, created_at)
       VALUES ($1,$2,$3,'outbound',$4,now()) ON CONFLICT (id) DO NOTHING`,
      [messageId, recipientId, payload.username, messageBody],
    );
    if (automation.public_reply_text) {
      try {
        const publicResult = await replyToComment(payload.commentId, automation.public_reply_text);
        await query("UPDATE social_deliveries SET public_reply_message_id=$2 WHERE id=$1", [delivery.id, String(publicResult?.id || "") || null]);
      } catch {
        await query("UPDATE social_deliveries SET last_error='public_reply_failed',updated_at=now() WHERE id=$1", [delivery.id]);
      }
    }
    return "processed";
  } catch (error) {
    const retryable = error?.status === 429;
    await query(
      `UPDATE social_deliveries SET status=$2, last_error=$3, claimed_at=NULL,
       next_attempt_at=CASE WHEN $2='retryable' THEN now() + interval '2 minutes' ELSE NULL END, updated_at=now()
       WHERE id=$1`,
      [delivery.id, retryable ? "retryable" : (error?.status && error.status < 500 ? "failed" : "unknown"), String(error?.message || "send_failed").slice(0, 300)],
    );
    throw error;
  }
}

async function processPostback(event, baseUrl) {
  const payload = event.payload;
  const match = new RegExp(`^${FOLLOW_CONFIRMATION_PAYLOAD}:(\\d+)$`, "u").exec(String(payload.payload || ""));
  if (!match || !payload.senderId) return "ignored";
  const deliveryId = match[1];
  const pending = await query(
    "SELECT id FROM social_deliveries WHERE id=$1 AND recipient_id=$2 AND status='awaiting_follow'",
    [deliveryId, payload.senderId],
  );
  if (!pending[0]) return "ignored";
  let follows = false;
  try { follows = await getFollowStatus(payload.senderId); } catch { follows = false; }
  if (!follows) {
    const result = await sendMessage(payload.senderId, buildFollowCard(deliveryId));
    await query(
      `INSERT INTO social_messages (id,participant_id,direction,body,created_at)
       VALUES ($1,$2,'outbound',$3,now()) ON CONFLICT (id) DO NOTHING`,
      [String(result?.message_id || `follow-reminder:${payload.senderId}:${payload.timestamp || Date.now()}`), payload.senderId, FOLLOW_CARD_TEXT],
    );
    return "processed";
  }
  const claimed = await query(
    `WITH target AS (
       SELECT id FROM social_deliveries
       WHERE id=$1 AND recipient_id=$2 AND status='awaiting_follow'
       FOR UPDATE SKIP LOCKED
     )
     UPDATE social_deliveries d SET status='claimed',follows_account=true,retry_action='resource',
       claimed_at=now(),attempts=d.attempts+1,updated_at=now()
     FROM target t, social_automations a
     WHERE d.id=t.id AND a.id=d.automation_id
     RETURNING d.*,a.response_text,a.resource_links,a.id AS automation_id`,
    [deliveryId, payload.senderId],
  );
  const delivery = claimed[0];
  if (!delivery) return "processed";
  try {
    const messageBody = buildDeliveryText({ ...delivery, id: delivery.automation_id }, delivery.id, baseUrl);
    const result = await sendMessage(payload.senderId, { text: messageBody });
    await query(
      `UPDATE social_deliveries SET status='sent', follows_account=true,
       private_reply_message_id=COALESCE($2,private_reply_message_id),retry_action='none',claimed_at=NULL,
       delivered_at=now(),updated_at=now() WHERE id=$1 AND status='claimed'`,
      [delivery.id, String(result?.message_id || "") || null],
    );
    await query(
      `INSERT INTO social_messages (id,participant_id,participant_username,direction,body,created_at)
       VALUES ($1,$2,$3,'outbound',$4,now()) ON CONFLICT (id) DO NOTHING`,
      [String(result?.message_id || `delivery:${delivery.id}:resource`), payload.senderId, delivery.commenter_username, messageBody],
    );
  } catch (error) {
    const retryable = error?.status === 429 && Number(delivery.attempts || 1) < 5;
    await query(
      `UPDATE social_deliveries SET status=$2,last_error=$3,claimed_at=NULL,
       next_attempt_at=CASE WHEN $2='retryable' THEN now()+interval '2 minutes' ELSE NULL END,updated_at=now()
       WHERE id=$1 AND status='claimed'`,
      [delivery.id, retryable ? "retryable" : (error?.status && error.status < 500 ? "failed" : "unknown"), String(error?.message || "resource_send_failed").slice(0, 300)],
    );
    throw error;
  }
  return "processed";
}

async function processMessage(event) {
  const payload = event.payload;
  if (!payload.messageId || !payload.senderId) return "ignored";
  const createdAt = new Date(Number(payload.timestamp) || Date.now()).toISOString();
  await query(
    `INSERT INTO social_messages
     (id, participant_id, direction, body, created_at)
     VALUES ($1,$2,'inbound',$3,$4) ON CONFLICT (id) DO NOTHING`,
    [payload.messageId, payload.senderId, payload.text || "", createdAt],
  );
  return "processed";
}

async function recoverStaleWork() {
  await query(
    `UPDATE social_webhook_events SET status='retryable',next_attempt_at=now(),last_error='stale_processing_recovered'
     WHERE status='processing' AND next_attempt_at < now() - interval '5 minutes'`,
  );
  await query(
    `UPDATE social_deliveries SET status='unknown',claimed_at=NULL,last_error='stale_send_state_requires_review',updated_at=now()
     WHERE status='claimed' AND COALESCE(claimed_at,updated_at) < now() - interval '5 minutes'`,
  );
}

async function retryPendingDeliveries(baseUrl, limit = 20) {
  const rows = await query(
    `SELECT d.*,a.response_text,a.public_reply_text,a.resource_links,a.follow_gate_mode,a.id AS automation_id
     FROM social_deliveries d JOIN social_automations a ON a.id=d.automation_id
     WHERE d.status='retryable' AND d.next_attempt_at <= now()
     ORDER BY d.next_attempt_at,d.id LIMIT $1`,
    [Math.max(1, Math.min(100, Number(limit) || 20))],
  );
  const totals = { sent: 0, awaitingFollow: 0, failed: 0 };
  for (const delivery of rows) {
    const claimed = await query(
      `UPDATE social_deliveries SET status='claimed',claimed_at=now(),attempts=attempts+1,updated_at=now()
       WHERE id=$1 AND status='retryable' RETURNING id,attempts`,
      [delivery.id],
    );
    if (!claimed[0]) continue;
    try {
      const resourceAction = delivery.retry_action === "resource";
      const gated = !resourceAction && delivery.follow_gate_mode === "strict" && !delivery.follows_account;
      const messageBody = gated ? FOLLOW_CARD_TEXT : buildDeliveryText({ ...delivery, id: delivery.automation_id }, delivery.id, baseUrl);
      const result = resourceAction
        ? await sendMessage(delivery.recipient_id || delivery.commenter_id, { text: messageBody })
        : await privateReply(delivery.comment_id, gated ? buildFollowCard(delivery.id) : { text: messageBody });
      const status = gated ? "awaiting_follow" : "sent";
      const recipientId = String(result?.recipient_id || delivery.recipient_id || delivery.commenter_id);
      await query(
        `UPDATE social_deliveries SET status=$2,recipient_id=$3,private_reply_message_id=COALESCE($4,private_reply_message_id),
         retry_action=CASE WHEN $2='awaiting_follow' THEN 'resource' ELSE 'none' END,claimed_at=NULL,next_attempt_at=NULL,
         last_error=NULL,delivered_at=CASE WHEN $2='sent' THEN now() ELSE delivered_at END,updated_at=now() WHERE id=$1`,
        [delivery.id, status, recipientId, String(result?.message_id || "") || null],
      );
      await query(
        `INSERT INTO social_messages (id,participant_id,participant_username,direction,body,created_at)
         VALUES ($1,$2,$3,'outbound',$4,now()) ON CONFLICT (id) DO NOTHING`,
        [String(result?.message_id || `delivery:${delivery.id}:retry:${claimed[0].attempts}`), recipientId, delivery.commenter_username, messageBody],
      );
      if (!resourceAction && delivery.public_reply_text) {
        try {
          const publicResult = await replyToComment(delivery.comment_id, delivery.public_reply_text);
          await query("UPDATE social_deliveries SET public_reply_message_id=$2 WHERE id=$1", [delivery.id, String(publicResult?.id || "") || null]);
        } catch {
          await query("UPDATE social_deliveries SET last_error='public_reply_failed',updated_at=now() WHERE id=$1", [delivery.id]);
        }
      }
      if (gated) totals.awaitingFollow += 1;
      else totals.sent += 1;
    } catch (error) {
      const attempts = Number(claimed[0].attempts || 1);
      const retryable = error?.status === 429 && attempts < 5;
      await query(
        `UPDATE social_deliveries SET status=$2,last_error=$3,claimed_at=NULL,
         next_attempt_at=CASE WHEN $2='retryable' THEN now()+interval '2 minutes' ELSE NULL END,updated_at=now() WHERE id=$1`,
        [delivery.id, retryable ? "retryable" : (error?.status && error.status < 500 ? "failed" : "unknown"), String(error?.message || "retry_failed").slice(0, 300)],
      );
      totals.failed += 1;
    }
  }
  return totals;
}

export async function processPendingEvents(baseUrl, limit = 20) {
  await recoverStaleWork();
  const deliveryRetries = await retryPendingDeliveries(baseUrl, limit);
  const rows = await query(
    `SELECT id, event_type, payload FROM social_webhook_events
     WHERE status IN ('pending','retryable') AND next_attempt_at <= now()
     ORDER BY id LIMIT $1`,
    [Math.max(1, Math.min(100, Number(limit) || 20))],
  );
  const totals = { processed: 0, ignored: 0, failed: 0 };
  for (const row of rows) {
    const claimed = await query(
      `UPDATE social_webhook_events SET status='processing', attempts=attempts+1,next_attempt_at=now()
       WHERE id=$1 AND status IN ('pending','retryable') RETURNING id`,
      [row.id],
    );
    if (!claimed[0]) continue;
    try {
      let status = "ignored";
      if (row.event_type === "comment") status = await processComment(row, baseUrl);
      else if (row.event_type === "postback") status = await processPostback(row, baseUrl);
      else if (row.event_type === "message") status = await processMessage(row);
      await markEvent(row.id, status);
      totals[status] += 1;
    } catch (error) {
      const attempts = Number((await query("SELECT attempts FROM social_webhook_events WHERE id=$1", [row.id]))[0]?.attempts || 1);
      const retry = error?.status === 429 && attempts < 5;
      await markEvent(row.id, retry ? "retryable" : "failed", error?.message || "processing_failed");
      totals.failed += 1;
    }
  }
  return { ...totals, deliveryRetries };
}

export async function cleanupOldData() {
  await query("DELETE FROM social_webhook_events WHERE received_at < now() - interval '30 days'");
  await query(
    `UPDATE social_deliveries SET commenter_username=NULL,comment_text='',recipient_id=NULL,
     commenter_id='purged:' || id::text WHERE created_at < now() - interval '90 days' AND commenter_id NOT LIKE 'purged:%'`,
  );
  await query(
    `UPDATE social_messages SET body='',participant_username=NULL,conversation_id=NULL,
     participant_id='purged:' || substr(md5(id),1,24)
     WHERE created_at < now() - interval '90 days' AND COALESCE(participant_id,'') NOT LIKE 'purged:%'`,
  );
  await query("UPDATE social_link_clicks SET visitor_hash=NULL WHERE clicked_at < now() - interval '30 days' AND visitor_hash IS NOT NULL");
  await query("DELETE FROM social_login_attempts WHERE created_at < now() - interval '2 days'");
}

export async function linkDestination(automationId, index) {
  const rows = await query("SELECT resource_links FROM social_automations WHERE id=$1", [automationId]);
  const links = linksArray(rows[0]?.resource_links);
  const link = links[Number(index)];
  if (!link?.url) return null;
  const url = new URL(link.url);
  if (url.protocol !== "https:") return null;
  return url.toString();
}

export function visitorHash(req) {
  const address = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const key = process.env.SOCIAL_SESSION_SECRET || "social";
  return createHmac("sha256", key).update(address).digest("hex");
}

export function signatureValid(rawBody, signature) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret || typeof signature !== "string" || !signature.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const actual = signature.slice(7);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function webhookEventDigest(rawBody) {
  return createHash("sha256").update(rawBody).digest("hex");
}
