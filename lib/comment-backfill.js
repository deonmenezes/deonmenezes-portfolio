/* Work out which commenters on a post never got their link.
 *
 * Meta only allows a private reply to a comment within 7 days of that comment,
 * once per comment. Everything here is about deciding who is genuinely both
 * eligible and owed a message, so a send never becomes a blast.
 */

export const PRIVATE_REPLY_WINDOW_DAYS = 7;

export function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}

/** A comment counts as asking when the keyword appears as a whole word. */
export function asksFor(text, keyword) {
  const haystack = normalize(text);
  const needle = normalize(keyword);
  if (!needle) return false;
  return new RegExp(`(^| )${needle}( |$)`, "u").test(haystack);
}

export function hoursLeftInWindow(commentTimestamp, now) {
  const commented = new Date(commentTimestamp).getTime();
  if (Number.isNaN(commented)) return 0;
  const deadline = commented + PRIVATE_REPLY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(0, (deadline - now.getTime()) / (60 * 60 * 1000));
}

/**
 * Splits comments into who to message and why the rest were left out.
 *
 * `alreadyHandled` holds sender ids and usernames already served by the live
 * automation, so nobody gets the link twice. Replies from the account itself
 * are dropped: replying privately to your own comment is nonsense.
 */
export function planBackfill(comments, {
  keyword = "link",
  alreadyHandled = [],
  ownUsername = "",
  now = new Date(),
} = {}) {
  const handled = new Set([...alreadyHandled].map((value) => String(value).toLowerCase()).filter(Boolean));
  const own = String(ownUsername).toLowerCase();

  const eligible = [];
  const skipped = { notAsking: 0, windowExpired: 0, alreadyHandled: 0, ownComment: 0, noSender: 0, duplicate: 0 };
  const seenSenders = new Set();

  for (const comment of Array.isArray(comments) ? comments : []) {
    const username = String(comment?.username || comment?.from?.username || "").toLowerCase();
    const senderId = String(comment?.from?.id || "");

    if (own && username === own) {
      skipped.ownComment += 1;
      continue;
    }
    if (!asksFor(comment?.text, keyword)) {
      skipped.notAsking += 1;
      continue;
    }
    if (handled.has(username) || (senderId && handled.has(senderId.toLowerCase()))) {
      skipped.alreadyHandled += 1;
      continue;
    }
    if (hoursLeftInWindow(comment?.timestamp, now) <= 0) {
      skipped.windowExpired += 1;
      continue;
    }
    if (!comment?.id) {
      skipped.noSender += 1;
      continue;
    }
    // One message per person, even if they commented five times.
    const key = senderId || username;
    if (key && seenSenders.has(key)) {
      skipped.duplicate += 1;
      continue;
    }
    if (key) seenSenders.add(key);

    eligible.push({
      comment_id: comment.id,
      username,
      sender_id: senderId,
      text: String(comment.text || "").slice(0, 60),
      timestamp: comment.timestamp,
      hours_left: Math.round(hoursLeftInWindow(comment.timestamp, now)),
    });
  }

  // Most urgent first: whoever is closest to falling out of the window.
  eligible.sort((a, b) => a.hours_left - b.hours_left);
  return { eligible, skipped, total: Array.isArray(comments) ? comments.length : 0 };
}
