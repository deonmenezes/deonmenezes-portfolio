import { isAdmin } from "../../lib/social/auth.js";
import { query } from "../../lib/social/db.js";
import { logError, requireMethod, sendJson } from "../../lib/social/http.js";
import { getAccount, getSubscribedApps } from "../../lib/social/meta.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["GET"])) return;
  if (!isAdmin(req)) return sendJson(res, 401, { error: "authentication_required" });
  try {
    const [accountRows, statsRows, daily, automations, media, conversationRows, contacts, broadcasts, healthRows] = await Promise.all([
      query("SELECT * FROM social_account_snapshots ORDER BY captured_at DESC LIMIT 1"),
      query(`SELECT
        (SELECT COUNT(*)::int FROM social_automations) AS automations,
        (SELECT COUNT(*)::int FROM social_automations WHERE enabled AND NOT needs_setup) AS active,
        (SELECT COUNT(*)::int FROM social_automations WHERE needs_setup) AS needs_setup,
        (SELECT COUNT(*)::int FROM social_media) AS posts,
        (SELECT COUNT(*)::int FROM social_deliveries) AS matched_comments,
        (SELECT COUNT(*)::int FROM social_deliveries WHERE created_at >= date_trunc('day', now())) AS comments_today,
        (SELECT COUNT(*)::int FROM social_messages WHERE direction='outbound') AS dms_sent,
        (SELECT COUNT(*)::int FROM social_messages WHERE direction='outbound' AND created_at >= date_trunc('day', now())) AS dms_today,
        (SELECT COUNT(*)::int FROM social_messages WHERE direction='inbound') AS dms_received,
        (SELECT COUNT(*)::int FROM social_link_clicks) AS link_clicks,
        (SELECT COUNT(*)::int FROM social_link_clicks WHERE clicked_at >= date_trunc('day', now())) AS clicks_today,
        (SELECT COUNT(*)::int FROM social_contacts WHERE status='active') AS contacts,
        COALESCE((SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status='sent') / NULLIF(COUNT(*),0),1) FROM social_deliveries),0) AS delivery_rate,
        COALESCE((SELECT ROUND(100.0 * (SELECT COUNT(*) FROM social_link_clicks) / NULLIF(COUNT(*),0),1) FROM social_messages WHERE direction='outbound'),0) AS click_rate`),
      query(`WITH days AS (
        SELECT generate_series((current_date - interval '89 days')::date, current_date, interval '1 day')::date AS day
      ) SELECT to_char(days.day, 'YYYY-MM-DD') AS date,
        COUNT(DISTINCT d.id)::int AS comments,
        COUNT(DISTINCT m.id) FILTER (WHERE m.direction='outbound')::int AS dms,
        COUNT(DISTINCT m.id) FILTER (WHERE m.direction='inbound')::int AS received,
        COUNT(DISTINCT c.id)::int AS clicks
      FROM days
      LEFT JOIN social_deliveries d ON d.created_at::date=days.day
      LEFT JOIN social_messages m ON m.created_at::date=days.day
      LEFT JOIN social_link_clicks c ON c.clicked_at::date=days.day
      GROUP BY days.day ORDER BY days.day`),
      query(`SELECT a.*, m.shortcode, m.caption, m.permalink, m.thumbnail_url, m.published_at,
        m.comments_count, m.like_count,
        (SELECT COUNT(*)::int FROM social_deliveries d WHERE d.automation_id=a.id AND d.status='sent') AS deliveries,
        (SELECT COUNT(*)::int FROM social_link_clicks c WHERE c.automation_id=a.id) AS clicks
      FROM social_automations a LEFT JOIN social_media m ON m.id=a.media_id
      ORDER BY a.enabled DESC, a.needs_setup DESC, COALESCE(m.published_at,a.updated_at) DESC`),
      query(`SELECT m.*, a.id AS automation_id, a.keyword, a.enabled, a.needs_setup
        FROM social_media m LEFT JOIN social_automations a ON a.media_id=m.id
        ORDER BY m.published_at DESC LIMIT 250`),
      query(`WITH participants AS (
        SELECT COALESCE(participant_id,conversation_id,id) AS id, MAX(created_at) AS updated_at, COUNT(*)::int AS message_count
        FROM social_messages GROUP BY COALESCE(participant_id,conversation_id,id)
      ) SELECT p.id, COALESCE(latest.participant_username,'Instagram user') AS name,
        latest.participant_username AS username, latest.body AS last_message, p.updated_at, p.message_count,
        COALESCE(history.messages,'[]'::json) AS messages
      FROM participants p
      JOIN LATERAL (
        SELECT participant_username,body FROM social_messages
        WHERE COALESCE(participant_id,conversation_id,id)=p.id ORDER BY created_at DESC LIMIT 1
      ) latest ON true
      JOIN LATERAL (
        SELECT json_agg(json_build_object('id',h.id,'text',h.body,'direction',h.direction,'created_at',h.created_at) ORDER BY h.created_at) AS messages
        FROM (SELECT id,body,direction,created_at FROM social_messages
          WHERE COALESCE(participant_id,conversation_id,id)=p.id ORDER BY created_at DESC LIMIT 100) h
      ) history ON true
      ORDER BY p.updated_at DESC LIMIT 100`),
      query(`SELECT c.*, COALESCE(tags.tags,'[]'::json) AS tags
        FROM social_contacts c
        LEFT JOIN LATERAL (
          SELECT json_agg(t.name ORDER BY t.name) AS tags
          FROM social_contact_tags ct JOIN social_tags t ON t.id=ct.tag_id
          WHERE ct.contact_id=c.id
        ) tags ON true
        ORDER BY c.last_seen_at DESC LIMIT 500`),
      query(`SELECT b.*,COUNT(d.id)::int AS recipients,
        COUNT(d.id) FILTER (WHERE d.status='sent')::int AS sent,
        COUNT(d.id) FILTER (WHERE d.status='failed')::int AS failed
        FROM social_broadcasts b LEFT JOIN social_broadcast_deliveries d ON d.broadcast_id=b.id
        GROUP BY b.id ORDER BY b.updated_at DESC LIMIT 100`),
      query(`SELECT
        (SELECT completed_at FROM social_sync_runs WHERE status='completed' ORDER BY completed_at DESC LIMIT 1) AS last_sync,
        (SELECT COUNT(*)::int FROM social_webhook_events WHERE status IN ('pending','retryable','processing')) AS queued_events,
        (SELECT COUNT(*)::int FROM social_webhook_events WHERE status='failed') AS failed_events,
        (SELECT COUNT(*)::int FROM social_flow_queue WHERE status IN ('pending','processing','retryable')) AS queued_steps,
        (SELECT COUNT(*)::int FROM social_flow_queue WHERE status='failed') AS failed_steps,
        (SELECT COUNT(*)::int FROM social_broadcasts WHERE status='scheduled') AS scheduled_broadcasts,
        (SELECT COUNT(*)::int FROM social_broadcasts WHERE status='failed') AS failed_broadcasts,
        (SELECT COUNT(*)::int FROM social_deliveries WHERE status IN ('failed','unknown') OR last_error IS NOT NULL) AS failed_deliveries,
        (SELECT received_at FROM social_webhook_events ORDER BY received_at DESC LIMIT 1) AS last_webhook,
        (SELECT COUNT(*)::int FROM social_deliveries WHERE status='awaiting_follow') AS awaiting_follow`),
    ]);

    const account = accountRows[0] || { username: "deon_tech", followers_count: 0, follows_count: 0, media_count: media.length };
    const stats = statsRows[0] || {};
    let graphStatus = "error";
    let graphError = null;
    let webhookSubscription = "unknown";
    let webhookSubscriptionFields = [];
    let webhookSubscriptionError = null;
    if (process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_ACCOUNT_ID) {
      try {
        await getAccount();
        graphStatus = "connected";
      } catch (error) {
        graphError = String(error?.message || "Instagram Graph API rejected the configured credentials.").slice(0, 180);
      }
      if (graphStatus === "connected") {
        try {
          const subscription = await getSubscribedApps();
          webhookSubscriptionFields = [...new Set((Array.isArray(subscription?.data) ? subscription.data : [])
            .flatMap((entry) => Array.isArray(entry?.subscribed_fields) ? entry.subscribed_fields : []))];
          webhookSubscription = webhookSubscriptionFields.includes("comments") && webhookSubscriptionFields.includes("messages") ? "active" : "pending";
        } catch (error) {
          webhookSubscriptionError = String(error?.message || "Meta did not return the account webhook subscription.").slice(0, 180);
          webhookSubscription = "pending";
        }
      }
    } else {
      graphError = "Instagram Graph API credentials are not configured.";
    }
    const health = {
      ...(healthRows[0] || {}),
      instagram: graphStatus,
      instagramError: graphError,
      webhook: healthRows[0]?.last_webhook ? "active" : "pending",
      database: "healthy",
      worker: Number(healthRows[0]?.failed_events || 0) > 0 || Number(healthRows[0]?.failed_deliveries || 0) > 0 || Number(healthRows[0]?.failed_steps || 0) > 0 || Number(healthRows[0]?.failed_broadcasts || 0) > 0 ? "degraded" : "active",
      graphConfigured: Boolean(process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_ACCOUNT_ID),
      webhookConfigured: Boolean(process.env.META_APP_SECRET && process.env.META_WEBHOOK_VERIFY_TOKEN),
      webhookUrl: "https://deonmenezes.com/api/instagram/webhook",
      webhookSubscription,
      webhookSubscriptionFields,
      webhookSubscriptionError,
      appReviewWarning: stats.dms_sent === 0 && Number(stats.posts || 0) > 0,
    };
    return sendJson(res, 200, { account, stats, daily, automations, media, conversations: conversationRows, contacts, broadcasts, health });
  } catch (error) {
    logError("social.dashboard", error);
    return sendJson(res, 500, { error: "dashboard_unavailable" });
  }
}
