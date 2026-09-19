/* /viral: "will this post go viral?" simulator.
   Jev estimates how likely a typical reader is to take each engagement action.
   Those estimates are combined with the engagement weights X published with its
   open-sourced heavy ranker (twitter/the-algorithm-ml, projects/home/recap), and
   the resulting score drives a simulated set of post metrics. It is a toy: the
   weights are real, the probabilities are one model's judgement. */

import { createHmac } from "node:crypto";
import { query } from "./social/db.js";
import { logError, readJson, requireMethod, sameOrigin, sendJson } from "./social/http.js";
import { callJev, claimRequest, estimateInputTokens, reconcileUsage, requestIp } from "./jev.js";

const MAX_BODY_BYTES = 8 * 1024;
const MAX_POST_CHARS = 1000;
const DEFAULT_FOLLOWERS = 1000;
const MAX_FOLLOWERS = 500_000_000;
export const VIRAL_DAILY_REQUESTS_PER_NETWORK = 40;

// weight: X's published heavy-ranker weight for the action.
// ceiling: a realistic per-impression rate for a post everyone would act on.
// Jev answers "would a typical reader do this?", not "what fraction of
// impressions do"; ceiling * p^2 turns the first into something like the second.
export const ACTIONS = Object.freeze({
  like: { weight: 0.5, ceiling: 0.06, label: "Like" },
  repost: { weight: 1, ceiling: 0.015, label: "Repost" },
  reply: { weight: 13.5, ceiling: 0.012, label: "Reply" },
  profileClick: { weight: 12, ceiling: 0.02, label: "Profile click" },
  dwell: { weight: 10, ceiling: 0.04, label: "Opens and stays 2+ min" },
  negative: { weight: -74, ceiling: 0.004, label: "Not interested / mute / block" },
  report: { weight: -369, ceiling: 0.0006, label: "Report" },
});

// Calibrated on real Jev output: "Hello" lands near 10, a strong personal-story
// hook in the 60s.
const SCORE_FOR_100 = 0.35;

export const QUESTIONS = Object.freeze({
  like: { type: "boolean", instructions: "Would a typical X (Twitter) user scrolling their feed tap like on this post?" },
  reply: { type: "boolean", instructions: "Would a typical X user feel compelled to reply to this post?" },
  repost: { type: "boolean", instructions: "Would a typical X user repost or quote this post to their own followers?" },
  profileClick: { type: "boolean", instructions: "Would a typical X user tap through to the author's profile after reading this post?" },
  dwell: { type: "boolean", instructions: "Would a typical X user stop scrolling, open this post, and spend a couple of minutes on it and its replies?" },
  negative: { type: "boolean", instructions: 'Would a typical X user tap "not interested", mute, or block because of this post?' },
  report: { type: "boolean", instructions: "Does this post break platform rules such that users would report it (spam, harassment, hate, scams)?" },
  hook: {
    type: "score",
    instructions: "How strong is the opening hook of this post?",
    criteria: ["No hook, easy to scroll past", "Mild curiosity", "Strong hook", "Impossible to scroll past"],
  },
  emotion: {
    type: "choice",
    instructions: "What is the main feeling this post creates in a reader?",
    criteria: {
      awe: "Surprise, amazement",
      humor: "It is funny",
      anger: "Outrage or disagreement",
      useful: "Practical value, a lesson, a tip",
      relatable: "A shared experience",
      nothing: "No real reaction",
    },
  },
});

const VERDICTS = [
  [60, "Banger"],
  [35, "Solid"],
  [15, "Mid"],
  [-Infinity, "Flop"],
];

function clamp01(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0;
}

function tipsFor(probabilities, hook, textLength) {
  const tips = [];
  if (probabilities.report >= 0.3) tips.push("This reads like spam or a rule break. A report carries a weight of -369, enough to bury a post on its own.");
  if (probabilities.negative >= 0.3) tips.push("A lot of readers would tap \"not interested\". That signal weighs -74, about 150 likes' worth of damage each.");
  if (probabilities.reply < 0.35) tips.push("Give people something to answer. A reply is weighted 13.5, which is 27 likes.");
  if (hook < 1.5) tips.push("The first line doesn't stop the scroll. Lead with the most surprising or specific thing you have.");
  if (probabilities.profileClick < 0.25) tips.push("Nothing here makes a stranger curious about you. A profile click is weighted 12, so hint at who is talking.");
  if (textLength < 25) tips.push("It's very short, so there's little for anyone to react to.");
  return tips.slice(0, 3);
}

/** Pure scoring: Jev answers + follower count in, verdict and simulated metrics out. */
export function scorePost(answers, { followers = DEFAULT_FOLLOWERS, textLength = 0 } = {}) {
  const probabilities = {};
  const breakdown = [];
  let raw = 0;
  for (const [action, { weight, ceiling, label }] of Object.entries(ACTIONS)) {
    const probability = clamp01(answers?.[action]?.probability);
    const rate = ceiling * probability ** 2;
    const contribution = weight * rate;
    raw += contribution;
    probabilities[action] = probability;
    breakdown.push({ action, label, weight, probability, contribution: Number(contribution.toFixed(5)) });
  }

  const viralScore = Math.round(100 * Math.min(1, Math.max(0, raw) / SCORE_FOR_100));
  const verdict = VERDICTS.find(([floor]) => viralScore >= floor)[1];
  const hook = Number(answers?.hook?.score) || 0;

  // In-network reach grows with the score; past that, out-of-network
  // distribution is what makes a post actually travel.
  const strength = viralScore / 100;
  const views = Math.round(followers * (0.1 + 4 * strength ** 3) + 200_000 * strength ** 4);
  const rate = (action) => ACTIONS[action].ceiling * probabilities[action] ** 2;
  const likes = Math.round(views * rate("like"));
  const metrics = {
    views,
    likes,
    replies: Math.round(views * rate("reply")),
    reposts: Math.round(views * rate("repost")),
    bookmarks: Math.round(likes * 0.25),
  };

  return {
    viralScore,
    verdict,
    metrics,
    breakdown,
    hook,
    emotion: typeof answers?.emotion?.choice === "string" ? answers.emotion.choice : "nothing",
    tips: tipsFor(probabilities, hook, textLength),
  };
}

export function createViralHandler({ queryFn = query, fetchFn = (...args) => fetch(...args), retryDelayMs } = {}) {
  return async function handler(req, res) {
    if (!requireMethod(req, res, ["POST"])) return;
    if (!sameOrigin(req)) return sendJson(res, 403, { error: "invalid_origin" });

    let body;
    try {
      body = await readJson(req, MAX_BODY_BYTES);
      if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY_BYTES) throw new Error("payload_too_large");
    } catch (error) {
      const tooLarge = error?.message === "payload_too_large";
      return sendJson(res, tooLarge ? 413 : 400, { error: tooLarge ? "payload_too_large" : "invalid_json" });
    }

    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) return sendJson(res, 400, { error: "empty_post", message: "Write something first." });
    if (text.length > MAX_POST_CHARS) return sendJson(res, 400, { error: "post_too_long", message: `Keep it under ${MAX_POST_CHARS} characters.` });
    const requestedFollowers = Math.floor(Number(body?.followers));
    const followers = Number.isFinite(requestedFollowers) && requestedFollowers >= 0
      ? Math.min(requestedFollowers, MAX_FOLLOWERS)
      : DEFAULT_FOLLOWERS;

    const gatewayKey = process.env.AI_GATEWAY_API_KEY?.trim();
    const hashSecret = process.env.JEV_HASH_SECRET?.trim();
    if (!gatewayKey || !hashSecret) return sendJson(res, 503, { error: "viral_unavailable" });

    const state = { post: text };
    const usageKey = `viral:${createHmac("sha256", hashSecret).update(`ip:${requestIp(req)}`).digest("hex")}`;
    const reservedTokens = estimateInputTokens({ state, questions: QUESTIONS });
    let claim;
    try {
      claim = await claimRequest(queryFn, { usageKey, reservedTokens, dailyRequests: VIRAL_DAILY_REQUESTS_PER_NETWORK, requireKey: false });
    } catch (error) {
      logError("viral.claim", error);
      return sendJson(res, 503, { error: "viral_unavailable" });
    }
    if (claim?.status !== "ok") {
      res.setHeader("Retry-After", "3600");
      return sendJson(res, 429, { error: claim?.status || "site_limit_reached", message: "That's the daily limit. It resets at 00:00 UTC." });
    }

    let upstream;
    let payload;
    try {
      ({ upstream, payload } = await callJev({ state, questions: QUESTIONS, gatewayKey, fetchFn, retryDelayMs }));
    } catch (error) {
      logError("viral.upstream", error);
      return sendJson(res, 502, { error: "viral_upstream_failed" });
    }
    if (!upstream.ok) {
      logError("viral.upstream", new Error(`gateway ${upstream.status}: ${String(payload?.error?.message || "").slice(0, 200)}`));
      const busy = upstream.status === 429;
      if (busy) res.setHeader("Retry-After", "30");
      return sendJson(res, busy ? 429 : 502, {
        error: busy ? "jev_busy" : "viral_upstream_failed",
        message: busy ? "Jev is busy right now. Try again in a minute." : "Couldn't reach Jev. Try again.",
      });
    }

    await reconcileUsage(queryFn, { usageKey, reservedTokens, claim, payload });
    return sendJson(res, 200, {
      ...scorePost(payload.answers, { followers, textLength: text.length }),
      remainingToday: Math.max(0, VIRAL_DAILY_REQUESTS_PER_NETWORK - Number(claim.key_requests) - 1),
    });
  };
}

export default createViralHandler();
