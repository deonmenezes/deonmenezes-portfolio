import { query } from "./db.js";
import { sendMessage } from "./meta.js";

export function broadcastMessage(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 1000) throw new Error("Broadcast text is required and must be under 1000 characters.");
  return { text };
}

async function queueBroadcastRecipients(broadcastId, tagFilter) {
  const tag = String(tagFilter || "").trim().toLocaleLowerCase("en-US");
  const rows = await query(
    `INSERT INTO social_broadcast_deliveries (broadcast_id,contact_id)
     SELECT $1,c.id FROM social_contacts c
     ${tag ? "JOIN social_contact_tags ct ON ct.contact_id=c.id JOIN social_tags t ON t.id=ct.tag_id AND t.name=$2" : ""}
     WHERE c.status='active'
     ON CONFLICT (broadcast_id,contact_id) DO NOTHING
     RETURNING id`,
    tag ? [broadcastId, tag] : [broadcastId],
  );
  return rows.length;
}

async function recoverStaleBroadcasts() {
  await query(
    `UPDATE social_broadcast_deliveries d SET status='retryable',last_error='stale_broadcast_send_recovered'
     FROM social_broadcasts b
     WHERE d.broadcast_id=b.id AND d.status='sending' AND b.updated_at < now() - interval '10 minutes'`,
  );
  await query(
    `UPDATE social_broadcasts SET status='scheduled',scheduled_at=now(),last_error='stale_broadcast_recovered',updated_at=now()
     WHERE status='sending' AND updated_at < now() - interval '10 minutes'`,
  );
}

export async function processBroadcastQueue(limit = 20) {
  await recoverStaleBroadcasts();
  const due = await query(
    `SELECT id,tag_filter FROM social_broadcasts
     WHERE status='scheduled' AND scheduled_at <= now()
     ORDER BY scheduled_at,id LIMIT $1`,
    [Math.max(1, Math.min(20, Number(limit) || 20))],
  );
  for (const broadcast of due) {
    await query("UPDATE social_broadcasts SET status='sending',updated_at=now() WHERE id=$1 AND status='scheduled'", [broadcast.id]);
    await queueBroadcastRecipients(broadcast.id, broadcast.tag_filter);
  }

  const rows = await query(
    `SELECT d.*,b.message
     FROM social_broadcast_deliveries d JOIN social_broadcasts b ON b.id=d.broadcast_id
     WHERE d.status IN ('pending','retryable') AND b.status='sending'
     ORDER BY d.created_at,d.id LIMIT $1`,
    [Math.max(1, Math.min(100, Number(limit) || 20))],
  );
  const totals = { sent: 0, failed: 0 };
  for (const row of rows) {
    const claimed = await query(
      `UPDATE social_broadcast_deliveries SET status='sending',attempts=attempts+1
       WHERE id=$1 AND status IN ('pending','retryable') RETURNING attempts`,
      [row.id],
    );
    if (!claimed[0]) continue;
    try {
      const result = await sendMessage(row.contact_id, row.message);
      const messageId = String(result?.message_id || `broadcast:${row.broadcast_id}:${row.contact_id}`);
      await query(
        `INSERT INTO social_messages (id,participant_id,direction,body,created_at)
         VALUES ($1,$2,'outbound',$3,now()) ON CONFLICT (id) DO NOTHING`,
        [messageId, row.contact_id, row.message.text || ""],
      );
      await query("UPDATE social_broadcast_deliveries SET status='sent',message_id=$2,sent_at=now(),last_error=NULL WHERE id=$1", [row.id, messageId]);
      totals.sent += 1;
    } catch (error) {
      const attempts = Number(claimed[0].attempts || 1);
      const retryable = error?.status === 429 && attempts < 5;
      await query(
        `UPDATE social_broadcast_deliveries SET status=$2,last_error=$3 WHERE id=$1`,
        [row.id, retryable ? "retryable" : "failed", String(error?.message || "broadcast_send_failed").slice(0, 300)],
      );
      totals.failed += 1;
    }
  }
  await query(
    `UPDATE social_broadcasts b SET status=CASE
       WHEN EXISTS (SELECT 1 FROM social_broadcast_deliveries d WHERE d.broadcast_id=b.id AND d.status IN ('pending','sending','retryable')) THEN 'sending'
       WHEN EXISTS (SELECT 1 FROM social_broadcast_deliveries d WHERE d.broadcast_id=b.id AND d.status='failed') THEN 'failed'
       ELSE 'sent' END,
       sent_at=CASE WHEN NOT EXISTS (SELECT 1 FROM social_broadcast_deliveries d WHERE d.broadcast_id=b.id AND d.status IN ('pending','sending','retryable')) THEN COALESCE(b.sent_at,now()) ELSE b.sent_at END,
       updated_at=now()
     WHERE b.status='sending'`,
  );
  return totals;
}
