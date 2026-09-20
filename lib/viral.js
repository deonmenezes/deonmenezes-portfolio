/* /viral: "will this go viral?" simulator for X, Instagram, TikTok, and YouTube.
   Jev estimates how likely a typical viewer is to take each engagement action a
   platform cares about. Those estimates are combined with that platform's
   weights (viral-platforms.js) and the score drives simulated metrics.
   It is a toy. X's weights are the ones it published; the other platforms
   publish none, so theirs are estimates ordered by what each has said matters. */

import { createHmac } from "node:crypto";
import { query } from "./social/db.js";
import { logError, readJson, requireMethod, sameOrigin, sendJson } from "./social/http.js";
import { callJev, claimRequest, estimateInputTokens, reconcileUsage, requestIp } from "./jev.js";
import { cleanAuthor, savePost, storeEnabled } from "./viral-store.js";
import { DEFAULT_PLATFORM, PLATFORMS, questionsFor } from "../viral-platforms.js";
import { cleanTopics, trendContext } from "../viral-trends.js";
import { deleteKeyFor, mediaEnabled, mediaKeyFor } from "./viral-media.js";
import { cachedCreator } from "./viral-social.js";
import { liveTrendsFor } from "./viral-live-trends.js";

const MAX_BODY_BYTES = 8 * 1024;
const MAX_POST_CHARS = 1000;
const MAX_EXTRA_CHARS = 300;
// What a vision model saw in the attached video or photos (see viral-look.js).
const MAX_VISUAL_CHARS = 1100;
const DEFAULT_FOLLOWERS = 1000;
const MAX_FOLLOWERS = 500_000_000;
const ATTACHMENT_TYPES = new Set(["image", "gif", "video"]);
const MAX_ATTACHMENTS = 4;
const MAX_POLL_OPTIONS = 4;
const MAX_POLL_OPTION_CHARS = 25;
// A platform with no calibration of its own: 0 at nothing, 100 at this share of
// a perfect post.
const DEFAULT_SCORE_RANGE = { floor: 0, top: 0.41 };
// Posts Jev thinks people would report are scored but never published.
const PUBLISH_MAX_REPORT_PROBABILITY = 0.5;
export const VIRAL_DAILY_REQUESTS_PER_NETWORK = 40;

// Kept for callers and tests that predate the other platforms.
export const ACTIONS = PLATFORMS.x.actions;
export const QUESTIONS = questionsFor("x");

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

// X is calibrated in absolute terms (scoreFor100). The others are calibrated as a
// range of "share of a perfect post", because every post earns a baseline there.
function viralScoreFor(platform, raw) {
  if (platform.scoreFor100) return Math.round(100 * Math.min(1, Math.max(0, raw) / platform.scoreFor100));
  const perfect = Object.values(platform.actions)
    .filter(({ weight }) => weight > 0)
    .reduce((sum, { weight, ceiling }) => sum + weight * ceiling, 0);
  const { floor, top } = platform.scoreRange ?? DEFAULT_SCORE_RANGE;
  return Math.round(100 * Math.min(1, Math.max(0, (raw / perfect - floor) / (top - floor))));
}

// Strongest problems first: anything actively hurting, then the hook, then the
// weakest of the signals that matter most.
function tipsFor(platform, probabilities, hook, textLength) {
  const actions = Object.entries(platform.actions);
  const byImportance = (a, b) => Math.abs(b[1].weight) - Math.abs(a[1].weight);
  const tips = actions
    .filter(([action, { tip }]) => tip?.above != null && probabilities[action] >= tip.above)
    .sort(byImportance)
    .map(([, { tip }]) => tip.text);
  if (hook < 1.5) tips.push(platform.hookTip);
  tips.push(...actions
    .filter(([action, { tip }]) => tip?.below != null && probabilities[action] < tip.below)
    .sort(byImportance)
    .map(([, { tip }]) => tip.text));
  if (textLength < 25) tips.push("It's very short, so there's little for anyone to react to.");
  return tips.slice(0, 3);
}

/** Pure scoring: Jev answers + audience in, verdict and simulated metrics out. */
export function scorePost(answers, { platform: platformId = DEFAULT_PLATFORM, followers = DEFAULT_FOLLOWERS, textLength = 0 } = {}) {
  const platform = PLATFORMS[platformId] || PLATFORMS[DEFAULT_PLATFORM];
  const probabilities = {};
  const breakdown = [];
  let raw = 0;
  for (const [action, { weight, ceiling, label }] of Object.entries(platform.actions)) {
    const probability = clamp01(answers?.[action]?.probability);
    const contribution = weight * ceiling * probability ** 2;
    raw += contribution;
    probabilities[action] = probability;
    breakdown.push({ action, label, weight, probability, contribution: Number(contribution.toFixed(5)) });
  }

  const viralScore = viralScoreFor(platform, raw);
  const verdict = VERDICTS.find(([floor]) => viralScore >= floor)[1];
  const hook = Number(answers?.hook?.score) || 0;

  // In-network reach grows with the score; past that, out-of-network
  // distribution is what makes something actually travel.
  const strength = viralScore / 100;
  const { base, baseCurve, boost, boostPower = 3, discovery, discoveryPower = 4 } = platform.reach;
  // Bigger accounts reach a smaller share of their followers, where a platform's data shows it.
  const floor = baseCurve
    ? Math.min(baseCurve.max, Math.max(baseCurve.min, baseCurve.scale * Math.max(1, followers) ** baseCurve.exponent))
    : base;
  const fromFollowers = Math.round(followers * (floor + boost * strength ** boostPower));
  const fromDiscovery = Math.round(discovery * strength ** discoveryPower);
  const views = fromFollowers + fromDiscovery;
  const metrics = {};
  for (const { key, from, scale = 1 } of platform.metrics) {
    metrics[key] = from === "views"
      ? views
      : Math.round(views * platform.actions[from].ceiling * probabilities[from] ** 2 * scale);
  }

  return {
    platform: PLATFORMS[platformId] ? platformId : DEFAULT_PLATFORM,
    viralScore,
    verdict,
    metrics,
    // Where the views come from: people who follow you, and recommendations to people who don't.
    reach: { followers: fromFollowers, discovery: fromDiscovery },
    breakdown,
    hook,
    emotion: typeof answers?.emotion?.choice === "string" ? answers.emotion.choice : "nothing",
    tips: tipsFor(platform, probabilities, hook, textLength),
  };
}

const ACCOUNT_GAP = 15;

/** When the same post scores clearly differently on its own than from this account, say which one is doing the work. */
export function accountTip(fromAccount, alone) {
  if (alone - fromAccount >= ACCOUNT_GAP) {
    return `The account is holding this back, not the post: on its own it scores ${alone}, from your account ${fromAccount}. Your recent posts have reached few people, so expect a new one to be tried on a small audience first. Warming the account up (posting steadily, in one niche) should close that gap; that part is general advice, not something a platform has confirmed.`;
  }
  if (fromAccount - alone >= ACCOUNT_GAP) {
    return `Your account is carrying this one: on its own the post scores ${alone}, from your account ${fromAccount}. The idea would struggle from a newer account.`;
  }
  return null;
}

const plural = (number, word) => `${number.toLocaleString("en-US")} ${word}${number === 1 ? "" : "s"}`;

/** Who is posting, in words Jev can weigh: size, whether they are a verified public figure, what they
    say they do, and how their posts have done. Built from the looked-up profile, never from the visitor's say-so,
    except the follower count and badge they already give. */
export function describeCreator(platformId, { followers, verified, creator } = {}) {
  const known = creator || {};
  const audience = platformId === "youtube" ? "subscriber" : "follower";
  const record = [];
  if (known.recentPosts > 1 && known.medianLikes != null) record.push(`Their last ${known.recentPosts} posts got about ${plural(known.medianLikes, "like")} each.`);
  if (known.recentVideos > 1 && known.medianViews != null) record.push(`Their last ${known.recentVideos} videos got about ${plural(known.medianViews, "view")} each.`);
  if (known.recentVideos > 1 && known.breakouts != null) record.push(`${known.breakouts} of those ${known.recentVideos} videos reached more people than ${audience === "subscriber" ? "subscribe to" : "follow"} the account.`);
  if (known.lifetimePosts > 1 && known.viewsPerPost != null) record.push(`Across ${plural(known.lifetimePosts, "video")} they average ${plural(known.viewsPerPost, "view")} a video.`);
  if (known.lifetimePosts > 1 && known.likesPerPost != null) record.push(`Across ${plural(known.lifetimePosts, "video")} they average ${plural(known.likesPerPost, "like")} a video.`);
  return {
    [`${audience}s`]: known.followers ?? followers,
    verifiedPublicFigure: Boolean(known.verified ?? verified),
    ...(known.bio ? { bio: known.bio } : {}),
    ...(known.category ? { category: known.category } : {}),
    ...(record.length ? { trackRecord: record.join(" ") } : {}),
  };
}

// Jev only reads text, so everything else about a post is described to it: the
// platform, the format, the opening, and what kind of media it carries.
export function describePost({ platformId, text, extra, format, attachments, poll, visual = "", topics = [], liveTopics = [], creator, now = Date.now() }) {
  const media = {
    ...(attachments.length ? { attachments } : {}),
    // Only meaningful alongside media, so a caller cannot use it to pad a text post.
    ...(attachments.length && visual ? { whatViewersSee: visual } : {}),
    ...(poll.length >= 2 ? { poll } : {}),
  };
  if (platformId === "x") return { post: text, ...media, ...(creator ? { creator } : {}) };

  const platform = PLATFORMS[platformId];
  const extraKey = platform.composer.extra?.label.toLowerCase();
  return {
    platform: platform.name,
    ...(format ? { format } : {}),
    [platformId === "youtube" ? "title" : "caption"]: text,
    ...(extra && extraKey ? { [extraKey]: extra } : {}),
    ...media,
    ...(creator ? { creator } : {}),
    // Jev cannot know what is new this week, so a dated list is handed to it while it is fresh,
    // led by any topics the visitor added for their own niche.
    ...trendContext(platformId, now, topics, liveTopics),
  };
}

const REPORT_QUESTION = {
  report: { type: "boolean", instructions: "Does this break platform rules such that users would report it (spam, harassment, hate, sexual content, scams)?" },
};

// X's own question set already asks whether a post would be reported. The other
// platforms spend their ten questions on ranking signals, so a post headed for
// the public feed gets one extra, tiny check. Any failure means "don't publish".
async function wouldBeReported({ answers, state, gatewayKey, fetchFn, retryDelayMs }) {
  if (answers?.report) return clamp01(answers.report.probability) >= PUBLISH_MAX_REPORT_PROBABILITY;
  try {
    const { upstream, payload } = await callJev({ state, questions: REPORT_QUESTION, gatewayKey, fetchFn, retryDelayMs });
    if (!upstream.ok) return true;
    return clamp01(payload.answers?.report?.probability) >= PUBLISH_MAX_REPORT_PROBABILITY;
  } catch {
    return true;
  }
}

export function createViralHandler({ queryFn = query, fetchFn = (...args) => fetch(...args), retryDelayMs, saveFn = savePost, storeEnabledFn = storeEnabled, creatorFn = cachedCreator, liveTrendsFn = liveTrendsFor } = {}) {
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

    const platformId = body?.platform == null ? DEFAULT_PLATFORM : String(body.platform);
    if (!Object.hasOwn(PLATFORMS, platformId)) return sendJson(res, 400, { error: "unknown_platform" });
    const platform = PLATFORMS[platformId];

    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) return sendJson(res, 400, { error: "empty_post", message: "Write something first." });
    if (text.length > MAX_POST_CHARS) return sendJson(res, 400, { error: "post_too_long", message: `Keep it under ${MAX_POST_CHARS} characters.` });
    const extra = typeof body?.extra === "string" ? body.extra.trim().slice(0, MAX_EXTRA_CHARS) : "";
    const format = platform.composer.formats?.includes(body?.format) ? body.format : platform.composer.formats?.[0];
    const requestedFollowers = Math.floor(Number(body?.followers));
    const followers = Number.isFinite(requestedFollowers) && requestedFollowers >= 0
      ? Math.min(requestedFollowers, MAX_FOLLOWERS)
      : DEFAULT_FOLLOWERS;

    const gatewayKey = process.env.AI_GATEWAY_API_KEY?.trim();
    const hashSecret = process.env.JEV_HASH_SECRET?.trim();
    if (!gatewayKey || !hashSecret) return sendJson(res, 503, { error: "viral_unavailable" });

    const attachments = (Array.isArray(body?.attachments) ? body.attachments : [])
      .filter((type) => ATTACHMENT_TYPES.has(type))
      .slice(0, MAX_ATTACHMENTS);
    const poll = (Array.isArray(body?.poll) ? body.poll : [])
      .filter((option) => typeof option === "string")
      .map((option) => option.trim().slice(0, MAX_POLL_OPTION_CHARS))
      .filter(Boolean)
      .slice(0, MAX_POLL_OPTIONS);
    const visual = typeof body?.visual === "string" ? body.visual.replace(/\s+/gu, " ").trim().slice(0, MAX_VISUAL_CHARS) : "";
    const topics = cleanTopics(body?.topics);
    // Who is posting matters to how a post lands. The handle only reads this site's own lookup cache.
    const handle = typeof body?.handle === "string" ? body.handle : body?.author?.handle;
    const known = await creatorFn(platformId, handle);
    const creator = describeCreator(platformId, { followers, verified: body?.verified === true || body?.author?.verified === true, creator: known });
    // Today's live topics, read from the cache only; scoring never triggers a paid refresh.
    const liveTopics = platformId === "x" ? [] : (await liveTrendsFn(platformId)).flatMap((source) => source.topics);
    const state = describePost({ platformId, text, extra, format, attachments, poll, visual, topics, liveTopics, creator });
    const questions = questionsFor(platformId);

    const usageKey = `viral:${createHmac("sha256", hashSecret).update(`ip:${requestIp(req)}`).digest("hex")}`;
    // With a track record to weigh, the post is also scored with no creator at all, so the visitor can
    // tell what the post earns from what the account earns. Both calls are reserved for up front.
    const contentState = creator.trackRecord ? describePost({ platformId, text, extra, format, attachments, poll, visual, topics, liveTopics }) : null;
    const reservedTokens = estimateInputTokens({ state, questions }) + (contentState ? estimateInputTokens({ state: contentState, questions }) : 0);
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
    let contentPayload;
    try {
      // The second opinion is a bonus: if it fails, the result simply goes without it.
      const contentCall = contentState
        ? callJev({ state: contentState, questions, gatewayKey, fetchFn, retryDelayMs }).then((content) => (content.upstream.ok ? content.payload : null), () => null)
        : null;
      ({ upstream, payload } = await callJev({ state, questions, gatewayKey, fetchFn, retryDelayMs }));
      contentPayload = await contentCall;
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

    const spent = (name) => (Number(payload?.usage?.[name]) || 0) + (Number(contentPayload?.usage?.[name]) || 0);
    const cost = (Number(payload?.providerMetadata?.gateway?.cost) || 0) + (Number(contentPayload?.providerMetadata?.gateway?.cost) || 0);
    await reconcileUsage(queryFn, { usageKey, reservedTokens, claim, payload: { usage: { inputTokens: spent("inputTokens") }, providerMetadata: { gateway: { cost } } } });
    // A looked-up audience beats the number the visitor sent.
    const audience = known?.followers ?? followers;
    const scored = scorePost(payload.answers, { platform: platformId, followers: audience, textLength: text.length });
    if (contentPayload?.answers) {
      const alone = scorePost(contentPayload.answers, { platform: platformId, followers: audience, textLength: text.length });
      scored.content = { viralScore: alone.viralScore, verdict: alone.verdict };
      const tip = accountTip(scored.viralScore, alone.viralScore);
      if (tip) scored.tips = [tip, ...scored.tips].slice(0, 3);
    }

    // Sharing to the public feed is best effort: a storage problem never costs
    // the visitor their result.
    let published = false;
    // Publishing is something the visitor asks for. A private simulation sends
    // no `publish`, and nothing about it is stored.
    const author = cleanAuthor(body?.author);
    if (body?.publish === true && author && typeof body?.id === "string" && storeEnabledFn()
      && !await wouldBeReported({ answers: payload.answers, state, gatewayKey, fetchFn, retryDelayMs })) {
      try {
        published = await saveFn({ id: body.id, platform: platformId, text, extra, format, attachments, poll, author, scored });
      } catch (error) {
        logError("viral.save", error);
      }
    }

    return sendJson(res, 200, {
      ...scored,
      // Shown in the Advanced view, so the visitor can see what Jev was told about them.
      creator,
      published,
      // Whoever created a public post may take it down again, and nobody else.
      ...(published ? { deleteKey: deleteKeyFor(body.id, hashSecret) } : {}),
      // Only the visitor who published a video post may upload its video.
      ...(published && attachments.includes("video") && mediaEnabled() ? { mediaKey: mediaKeyFor(body.id, hashSecret) } : {}),
      remainingToday: Math.max(0, VIRAL_DAILY_REQUESTS_PER_NETWORK - Number(claim.key_requests) - 1),
    });
  };
}

export default createViralHandler();
