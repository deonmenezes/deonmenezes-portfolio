/* Will It Go Viral: profile search, composer (media, GIF, poll, emoji), instant
   posting with animated engagement, local feed, leaderboard.
   Everything a visitor makes stays in this browser: posts and the chosen profile
   in localStorage, attached media in IndexedDB. The page CSP forbids inline
   styles, so layout variants are classes and bars are <meter>/<progress>. */

import { DEFAULT_PLATFORM, PLATFORMS } from "/viral-platforms.js";
import { BASIS_LABELS, PRACTICES } from "/viral-practices.js";

const STORAGE_POSTS = "viral_posts";
const STORAGE_PLATFORM = "viral_platform";
const STORAGE_PRIVATE = "viral_private";
const FEED_POLL_MS = 6000;
// How much of the box each platform really gives you, capped at what the API takes.
const TEXT_LIMITS = { x: 280, instagram: 1000, tiktok: 1000, youtube: 100 };
const STORAGE_PROFILE = "viral_profile";
const STORAGE_PROFILES = "viral_profiles";
const MAX_STORED_POSTS = 50;
const DEFAULT_FOLLOWERS = 1000;
// X avatars load from X's image hosts; the other platforms' are served by this site.
const AVATAR_PATTERN = /^(?:https:\/\/(?:pbs|abs)\.twimg\.com\/[\w\-./]+|\/api\/viral\/avatar\?platform=(?:instagram|tiktok|youtube)&handle=[\w.%-]{1,90})$/u;
const HANDLE_PATTERNS = {
  x: /^[A-Za-z0-9_]{1,15}$/u,
  instagram: /^[A-Za-z0-9._]{1,30}$/u,
  tiktok: /^[A-Za-z0-9._]{2,24}$/u,
  youtube: /^[A-Za-z0-9._-]{3,30}$/u,
};
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const ANIMATION_MS = 6500;

const b = (action, label, weight, probability, contribution) => ({ action, label, weight, probability, contribution });

// Real Jev output for two posts, so the feed isn't empty on a first visit.
const EXAMPLES = [
  {
    id: "example-banger", example: true, platform: "x", name: "Will It Go Viral", handle: "sample", verified: true, createdAt: null,
    text: "I quit my $400k job at Google to build a startup. 18 months later I am broke, divorced, and happier than I have ever been. Here is what nobody tells you:",
    viralScore: 63, verdict: "Banger", hook: 2.75, emotion: "awe",
    metrics: { views: 42508, likes: 563, replies: 229, reposts: 112, bookmarks: 141 },
    breakdown: [
      b("like", "Like", 0.5, 0.47, 0.00663), b("repost", "Repost", 1, 0.42, 0.00265), b("reply", "Reply", 13.5, 0.67, 0.07272),
      b("profileClick", "Profile click", 12, 0.5, 0.06), b("dwell", "Opens and stays 2+ min", 10, 0.56, 0.12544),
      b("negative", "Not interested / mute / block", -74, 0.39, -0.04502), b("report", "Report", -369, 0.1, -0.00221),
    ],
    tips: ["A lot of readers would tap \"not interested\". That signal weighs -74, about 150 likes' worth of damage each."],
  },
  {
    id: "example-mid", example: true, platform: "x", name: "Will It Go Viral", handle: "sample", verified: true, createdAt: null,
    text: "good morning everyone have a nice day",
    viralScore: 15, verdict: "Mid", hook: 0, emotion: "nothing",
    metrics: { views: 215, likes: 0, replies: 0, reposts: 0, bookmarks: 0 },
    breakdown: [
      b("like", "Like", 0.5, 0.18, 0.00097), b("repost", "Repost", 1, 0.11, 0.00018), b("reply", "Reply", 13.5, 0.17, 0.00468),
      b("profileClick", "Profile click", 12, 0.12, 0.00346), b("dwell", "Opens and stays 2+ min", 10, 0.34, 0.04624),
      b("negative", "Not interested / mute / block", -74, 0.12, -0.00426), b("report", "Report", -369, 0.03, -0.0002),
    ],
    tips: [
      "Give people something to answer. A reply is weighted 13.5, which is 27 likes.",
      "The first line doesn't stop the scroll. Lead with the most surprising or specific thing you have.",
    ],
  },
];

const EMOTIONS = {
  awe: "it surprises people", humor: "it's funny", anger: "it provokes disagreement",
  useful: "it's useful", relatable: "it's relatable", nothing: "it doesn't spark much of a reaction",
};

const EMOJIS = "😀 😂 🤣 😊 😍 🥹 😎 🤔 😭 😤 🤯 🥳 😴 🙃 😅 🫡 👀 🙏 👏 🙌 💪 🤝 👍 👎 🔥 ✨ 💯 ❤️ 💔 🚀 🎉 💡 📈 📉 💰 🧵 🤖 ⚡ ☕ 🌍".split(" ");

const composer = document.querySelector("[data-composer]");
const textarea = document.querySelector("#composer-text");
const counter = document.querySelector("[data-count]");
const simulateButton = document.querySelector("[data-simulate]");
const statusLine = document.querySelector("[data-status]");
const feed = document.querySelector("[data-feed]");
const leaderboard = document.querySelector("[data-leaderboard]");
const composerAvatar = document.querySelector("[data-composer-avatar]");
const template = document.querySelector("#post-template");
const rankTemplate = document.querySelector("#leaderboard-template");
const resultTemplate = document.querySelector("#result-template");
const toast = document.querySelector("[data-toast]");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

/* -------------------------------------------------------------- storage */

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: the feed just won't persist */ }
}

// Stored posts come back from localStorage, so drop anything that lost its shape.
const isPost = (post) => post && typeof post.text === "string" && typeof post.verdict === "string"
  && Number.isFinite(post.viralScore) && post.metrics && Array.isArray(post.breakdown);

let posts = load(STORAGE_POSTS, []);
posts = (Array.isArray(posts) ? posts.filter(isPost) : []).map((post) => ({ ...post, platform: PLATFORMS[post.platform] ? post.platform : DEFAULT_PLATFORM }));

const requestedPlatform = new URLSearchParams(location.search).get("p") || load(STORAGE_PLATFORM, DEFAULT_PLATFORM);
let platformId = PLATFORMS[requestedPlatform] ? requestedPlatform : DEFAULT_PLATFORM;
const platform = () => PLATFORMS[platformId];

// The shared feed and leaderboard, when the site has a database behind it.
let remote = { enabled: false, posts: [], leaderboard: [] };
// Posts being simulated right now. They are never written to storage.
let pending = [];

// Attached files are too big for localStorage. They live in IndexedDB, keyed by
// post id, with an in-memory copy so a browser without IndexedDB still shows
// them until the tab closes.
const mediaMemory = new Map();
let mediaDbPromise;

function mediaDb() {
  mediaDbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("viral", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("media");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return mediaDbPromise;
}

async function mediaRequest(mode, run) {
  const db = await mediaDb();
  return new Promise((resolve, reject) => {
    const request = run(db.transaction("media", mode).objectStore("media"));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putMedia(id, files) {
  mediaMemory.set(id, files);
  try { await mediaRequest("readwrite", (store) => store.put(files, id)); } catch { /* memory copy still works */ }
}

async function getMedia(id) {
  if (mediaMemory.has(id)) return mediaMemory.get(id);
  try {
    const files = await mediaRequest("readonly", (store) => store.get(id));
    if (Array.isArray(files)) mediaMemory.set(id, files);
    return Array.isArray(files) ? files : [];
  } catch {
    return [];
  }
}

async function deleteMedia(id) {
  mediaMemory.delete(id);
  try { await mediaRequest("readwrite", (store) => store.delete(id)); } catch { /* nothing stored */ }
}

/* -------------------------------------------------------------- helpers */

function compact(number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(number);
}

function timeAgo(timestamp) {
  if (!timestamp) return "sample";
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}

// Avatar URLs come from localStorage and the API, so only X's image hosts are
// ever turned into an <img>; anything else falls back to an initial.
function paintAvatar(node, name, avatarUrl) {
  const label = (name || "?").trim();
  const initial = (label[0] || "?").toUpperCase();
  const hue = [...label].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 6;
  const mini = node.classList.contains("avatar-mini");
  node.className = `avatar avatar-${hue}${mini ? " avatar-mini" : ""}`;
  if (typeof avatarUrl === "string" && AVATAR_PATTERN.test(avatarUrl)) {
    const image = document.createElement("img");
    image.src = avatarUrl;
    image.alt = "";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => node.replaceChildren(initial));
    node.replaceChildren(image);
  } else {
    node.replaceChildren(initial);
  }
}

const VERDICTS = new Set(["banger", "solid", "mid", "flop"]);

function paintVerdict(node, verdict) {
  const key = String(verdict).toLowerCase();
  node.textContent = verdict;
  node.className = `verdict verdict-${VERDICTS.has(key) ? key : "mid"}`;
}

function setStatus(message, isError = false) {
  statusLine.textContent = message;
  statusLine.classList.toggle("is-error", isError);
}

let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
}

function hashText(text) {
  let hash = 2166136261;
  for (const character of text) hash = Math.imul(hash ^ character.codePointAt(0), 16777619);
  return hash >>> 0;
}

/* ---------------------------------------------------------------- media */

function mediaKind(file) {
  if (file.type === "image/gif") return "gif";
  if (file.type.startsWith("video/")) return "video";
  return file.type.startsWith("image/") ? "image" : null;
}

// `files` are { kind, blob }. Image object URLs are revoked once decoded.
function renderMedia(container, files, { onRemove } = {}) {
  container.replaceChildren();
  container.hidden = files.length === 0;
  container.className = `media-grid media-${Math.min(files.length, MAX_IMAGES)}`;
  files.forEach((file, index) => {
    const cell = document.createElement("div");
    cell.className = "media-cell";
    const url = URL.createObjectURL(file.blob);
    let element;
    if (file.kind === "video") {
      element = document.createElement("video");
      element.controls = true;
      element.muted = true;
      element.playsInline = true;
      element.preload = "metadata";
    } else {
      element = document.createElement("img");
      element.alt = "";
      element.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
    }
    element.src = url;
    cell.append(element);
    if (file.kind === "gif") {
      const tag = document.createElement("span");
      tag.className = "media-tag";
      tag.textContent = "GIF";
      cell.append(tag);
    }
    if (onRemove) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "media-remove";
      remove.setAttribute("aria-label", "Remove attachment");
      remove.textContent = "✕";
      remove.addEventListener("click", () => onRemove(index));
      cell.append(remove);
    }
    container.append(cell);
  });
}

// Instagram, TikTok, and YouTube posts are built around a picture. When nothing
// is attached, a generated cover stands in: the format, and the hook or text.
function paintCover(cover, post) {
  const visual = post.platform !== "x" && !post.mediaCount;
  cover.hidden = !visual;
  if (!visual) return;
  const format = post.format || PLATFORMS[post.platform].composer.formats?.[0] || "";
  const still = /photo|carousel/iu.test(format);
  cover.className = `post-cover cover-${hashText(post.text) % 6}${still ? " is-still" : ""}`;
  cover.querySelector("[data-cover-format]").textContent = format;
  cover.querySelector("[data-cover-text]").textContent = (post.extra || post.text).slice(0, 110);
}

function renderPoll(container, post, revealed) {
  const options = post.poll || [];
  container.hidden = options.length < 2;
  if (container.hidden) return;
  // Deterministic split from the option text, so a reload shows the same result.
  const weights = options.map((option, index) => 35 + (hashText(`${post.text}|${option}|${index}`) % 65));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const shares = weights.map((weight) => Math.round((weight / total) * 100));
  const winner = shares.indexOf(Math.max(...shares));

  container.replaceChildren(...options.map((option, index) => {
    const row = document.createElement("div");
    row.className = `poll-row${revealed && index === winner ? " is-winner" : ""}`;
    const bar = document.createElement("progress");
    bar.max = 100;
    bar.value = revealed ? shares[index] : 0;
    const label = document.createElement("span");
    label.className = "poll-label";
    label.textContent = option;
    const share = document.createElement("span");
    share.className = "poll-share";
    share.textContent = revealed ? `${shares[index]}%` : "";
    row.append(bar, label, share);
    return row;
  }));
  const votes = document.createElement("p");
  votes.className = "poll-votes";
  votes.textContent = revealed ? `${compact(Math.round((post.metrics?.views || 0) * 0.03))} votes · Final results` : "Counting votes…";
  container.append(votes);
}

/* ---------------------------------------------------------------- posts */

// Views lead and the rest follow, the way a real post picks up.
function metricDelay(metric, index, metrics) {
  if (metric.from === "views") return 0;
  const others = metrics.filter((entry) => entry.from !== "views");
  return 0.08 + 0.22 * (others.indexOf(metric) / Math.max(1, others.length - 1));
}

function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
}

function buildMetrics(list, post) {
  const metrics = PLATFORMS[post.platform].metrics;
  list.replaceChildren(...metrics.map((metric) => {
    const item = document.createElement("li");
    item.className = `metric tone-${metric.tone || "accent"}`;
    item.title = metric.label;
    const value = document.createElement("span");
    value.dataset.metric = metric.key;
    value.textContent = "0";
    item.append(icon(metric.icon), value);
    return item;
  }));
  if (post.platform === "x") {
    const share = document.createElement("li");
    share.className = "metric tone-accent";
    share.setAttribute("aria-hidden", "true");
    share.append(icon("upload"));
    list.append(share);
  }
}

function easeOut(progress) {
  return 1 - (1 - progress) ** 3;
}

function metricAt(target, delay, progress) {
  const local = Math.min(1, Math.max(0, (progress - delay) / (1 - delay)));
  return Math.round(target * easeOut(local));
}

function pulse(item) {
  item.classList.remove("is-pulsing");
  // Reading a layout property restarts the CSS animation.
  void item.offsetWidth;
  item.classList.add("is-pulsing");
}

function spawnFloater(item, amount) {
  const floater = document.createElement("span");
  floater.className = "floater";
  floater.textContent = `+${compact(amount)}`;
  floater.addEventListener("animationend", () => floater.remove());
  item.append(floater);
}

function animateMetrics(node, post) {
  const definitions = PLATFORMS[post.platform].metrics;
  return new Promise((resolve) => {
    const cells = definitions.map((metric, index) => {
      const value = node.querySelector(`[data-metric="${metric.key}"]`);
      return { metric, value, item: value.closest("li"), target: post.metrics[metric.key] || 0, delay: metricDelay(metric, index, definitions), shown: 0, lastFloater: 0 };
    });
    // Browsers pause requestAnimationFrame in a background tab, which would leave
    // the post stuck mid-count, so a hidden page gets the final numbers at once.
    if (reducedMotion.matches || document.hidden) {
      for (const cell of cells) {
        cell.value.textContent = compact(cell.target);
        cell.item.classList.toggle("is-active", cell.target > 0);
      }
      resolve();
      return;
    }

    const started = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - started) / ANIMATION_MS);
      for (const cell of cells) {
        const next = metricAt(cell.target, cell.delay, progress);
        if (next === cell.shown) continue;
        const gained = next - cell.shown;
        cell.shown = next;
        cell.value.textContent = compact(next);
        cell.item.classList.add("is-active");
        if (cell.metric.from !== "views" && now - cell.lastFloater > 420) {
          cell.lastFloater = now;
          pulse(cell.item);
          spawnFloater(cell.item, gained);
        }
      }
      if (progress < 1) requestAnimationFrame(tick); else resolve();
    };
    requestAnimationFrame(tick);
  });
}

function fillAnalysis(node, post) {
  const find = (selector) => node.querySelector(selector);
  find("details").hidden = !Array.isArray(post.breakdown);
  if (!Array.isArray(post.breakdown)) return;
  find("[data-score]").textContent = `${post.viralScore}/100`;
  find("[data-summary]").textContent = `Jev thinks ${EMOTIONS[post.emotion] || EMOTIONS.nothing}, with a hook of ${Number(post.hook).toFixed(1)} out of 3.`;

  find("[data-bars]").replaceChildren(...post.breakdown.map((item) => {
    const row = document.createElement("div");
    row.className = "bar-row";
    const label = document.createElement("span");
    label.textContent = `${item.label} (${item.weight > 0 ? "+" : ""}${item.weight})`;
    const meter = document.createElement("meter");
    meter.min = 0;
    meter.max = 1;
    meter.value = item.probability;
    const figure = document.createElement("span");
    figure.className = "bar-figure";
    figure.textContent = `${Math.round(item.probability * 100)}%`;
    row.append(label, meter, figure);
    return row;
  }));

  find("[data-tips]").replaceChildren(...(post.tips || []).map((tip) => {
    const item = document.createElement("li");
    item.textContent = tip;
    return item;
  }));
}

function renderPost(post) {
  const node = template.content.firstElementChild.cloneNode(true);
  const find = (selector) => node.querySelector(selector);
  node.dataset.postId = post.id;

  const { chrome } = PLATFORMS[post.platform];
  const handle = post.handle || "anonymous";
  paintAvatar(find("[data-avatar]"), post.name, post.avatarUrl);
  // Instagram and TikTok lead with the username; X and YouTube with the name.
  find("[data-name]").textContent = chrome.showsName ? post.name || "Anonymous" : handle;
  find("[data-verified]").toggleAttribute("hidden", !post.verified);
  find("[data-handle]").textContent = chrome.showsName ? `${chrome.handlePrefix}${handle}` : post.name || "";
  find("[data-time]").textContent = timeAgo(post.createdAt);
  find("[data-text]").textContent = post.text;
  find("[data-caption-handle]").textContent = handle;
  paintCover(find("[data-cover]"), post);
  find("[data-private]").hidden = !post.private;
  buildMetrics(find("[data-metrics]"), post);

  if (post.mediaCount) getMedia(post.id).then((files) => renderMedia(find("[data-media]"), files));

  const verdict = find("[data-verdict]");
  const details = find("details");
  if (post.state === "pending" || post.state === "failed") {
    node.classList.add(post.state === "pending" ? "is-pending" : "is-failed");
    verdict.textContent = post.state === "pending" ? "Simulating" : "Not simulated";
    verdict.className = "verdict verdict-pending";
    details.hidden = true;
    renderPoll(find("[data-poll]"), post, false);
    if (post.state === "failed") {
      find("[data-failed]").hidden = false;
      find("[data-failed-message]").textContent = post.error;
      find("[data-retry]").addEventListener("click", () => simulate(post));
      find("[data-discard]").addEventListener("click", () => discard(post));
    }
    return node;
  }

  paintVerdict(verdict, post.verdict);
  renderPoll(find("[data-poll]"), post, true);
  for (const { key } of PLATFORMS[post.platform].metrics) {
    const value = find(`[data-metric="${key}"]`);
    value.textContent = compact(post.metrics[key] || 0);
    value.closest("li").classList.toggle("is-active", post.metrics[key] > 0);
  }
  fillAnalysis(node, post);
  return node;
}

// This browser's copy of a post wins over the shared one: it has the score
// breakdown and knows where its attached media lives.
function visiblePosts() {
  const mine = posts.filter((post) => post.platform === platformId);
  if (!remote.enabled) return mine;
  const byId = new Map(mine.map((post) => [post.id, post]));
  const shared = remote.posts.map((post) => byId.get(post.id) || post);
  const unshared = mine.filter((post) => !remote.posts.some((entry) => entry.id === post.id));
  return [...shared, ...unshared].sort((a, b2) => (b2.createdAt || 0) - (a.createdAt || 0));
}

// Ids already shown, so a live update can tell what just arrived.
let shownIds = new Set();

// What the feed should show right now: posts being simulated, then real posts,
// or the samples when there is nothing else.
function feedPosts() {
  const waiting = pending.filter((post) => post.platform === platformId);
  const real = visiblePosts();
  return waiting.length || real.length ? [...waiting, ...real] : EXAMPLES.filter((post) => post.platform === platformId);
}

function renderFeed({ announce = false } = {}) {
  const visible = feedPosts();
  // A live refresh must not slam shut a breakdown someone is reading.
  const open = new Set([...feed.querySelectorAll("details[open]")].map((details) => details.closest(".post").dataset.postId));
  feed.replaceChildren(...visible.map((post) => {
    const node = renderPost(post);
    if (open.has(post.id)) node.querySelector("details").open = true;
    if (announce && !shownIds.has(post.id)) node.classList.add("is-new");
    return node;
  }));
  shownIds = new Set(visible.map((post) => post.id));
  newPostsButton.hidden = true;
  feedEmpty.hidden = visible.length > 0;
  feedEmpty.textContent = `Nothing simulated on ${platform().name} yet. Write the first one.`;
  feedEnd.textContent = remote.enabled
    ? "Public posts join the shared feed for everyone, live. Private ones and all attached media stay in your browser."
    : "Posts live only in this browser. Nothing is published anywhere.";
}

function renderLeaderboard() {
  const pool = remote.enabled ? remote.leaderboard : visiblePosts();
  const candidates = pool.length ? pool : EXAMPLES.filter((post) => post.platform === platformId);
  const ranked = [...candidates].sort((a, b2) => b2.viralScore - a.viralScore).slice(0, 8);
  leaderboardEmpty.hidden = ranked.length > 0;
  leaderboard.replaceChildren(...ranked.map((post, index) => {
    const node = rankTemplate.content.firstElementChild.cloneNode(true);
    const find = (selector) => node.querySelector(selector);
    find("[data-rank]").textContent = String(index + 1);
    find("[data-text]").textContent = post.text;
    paintAvatar(find("[data-avatar]"), post.name, post.avatarUrl);
    find("[data-handle]").textContent = `${PLATFORMS[post.platform].chrome.handlePrefix}${post.handle || "anonymous"}`;
    find("[data-time]").textContent = timeAgo(post.createdAt);
    paintVerdict(find("[data-verdict]"), post.verdict);
    find("[data-views]").textContent = `${compact(post.metrics.views)} views`;
    return node;
  }));
}

let feedSequence = 0;
async function refreshRemote() {
  const sequence = ++feedSequence;
  try {
    const response = await fetch(`/api/viral/feed?platform=${encodeURIComponent(platformId)}`);
    if (!response.ok) throw new Error("feed unavailable");
    const body = await response.json();
    if (sequence !== feedSequence) return;
    const clean = (list) => (Array.isArray(list) ? list : []).filter((post) => post && typeof post.text === "string"
      && typeof post.verdict === "string" && Number.isFinite(post.viralScore) && post.metrics && PLATFORMS[post.platform]);
    remote = { enabled: Boolean(body.enabled), posts: clean(body.posts), leaderboard: clean(body.leaderboard) };
  } catch {
    if (sequence !== feedSequence) return;
    remote = { enabled: false, posts: [], leaderboard: [] };
  }
  renderLeaderboard();
  const next = feedPosts();
  const arrived = next.filter((post) => !shownIds.has(post.id)).length;
  const changed = arrived > 0 || next.length !== shownIds.size;
  // Leave a post alone while its numbers are climbing.
  if (!changed || feed.querySelector(".is-live")) return;
  if (!live || scrollY < 300) {
    renderFeed({ announce: live });
  } else if (arrived > 0) {
    newPostsButton.textContent = `Show ${arrived} ${arrived === 1 ? "post" : "posts"}`;
    newPostsButton.hidden = false;
  }
}

// `live` is false for the first load of a platform, so its posts don't all
// animate in as if they had just been written.
let live = false;
const refreshLive = () => refreshRemote().then(() => { live = true; });

setInterval(() => {
  if (!document.hidden && remote.enabled && !onboarding.open) refreshLive();
}, FEED_POLL_MS);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && remote.enabled) refreshLive();
});

/* ----------------------------------------------------------- simulation */

function discard(post) {
  pending = pending.filter((entry) => entry.id !== post.id);
  deleteMedia(post.id);
  renderFeed();
}

// The post is already on screen. This asks Jev, then plays the result out.
async function simulate(post) {
  post.state = "pending";
  renderFeed();

  let result;
  try {
    const response = await fetch("/api/viral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: post.id,
        platform: post.platform,
        text: post.text,
        extra: post.extra,
        format: post.format,
        followers: post.followers,
        attachments: post.attachments,
        poll: post.poll,
        publish: !post.private,
        ...(post.private ? {} : { author: { handle: post.handle, name: post.name, avatarUrl: post.avatarUrl, verified: post.verified } }),
      }),
    });
    result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "Something went wrong. Try again.");
  } catch (error) {
    post.state = "failed";
    post.error = error.message || "Something went wrong. Try again.";
    renderFeed();
    return;
  }

  const { remainingToday, published, ...scored } = result;
  Object.assign(post, scored, { state: "done" });
  delete post.error;
  pending = pending.filter((entry) => entry.id !== post.id);
  posts = [post, ...posts].slice(0, MAX_STORED_POSTS);
  save(STORAGE_POSTS, posts.map(({ state, followers, ...stored }) => stored));

  // Animate in place rather than re-rendering, so the numbers visibly climb.
  const node = feed.querySelector(`[data-post-id="${CSS.escape(post.id)}"]`);
  if (!node) {
    renderFeed();
    renderLeaderboard();
    return;
  }
  node.classList.remove("is-pending");
  node.classList.add("is-live");
  await animateMetrics(node, post);

  const verdict = node.querySelector("[data-verdict]");
  paintVerdict(verdict, post.verdict);
  verdict.classList.add("is-revealed");
  renderPoll(node.querySelector("[data-poll]"), post, true);
  fillAnalysis(node, post);
  // Shown closed: the breakdown is there for whoever wants it, not pushed on them.
  node.querySelector("details").hidden = false;
  node.classList.remove("is-live");
  renderLeaderboard();
  if (published) refreshLive();
  showToast(post.private ? `${post.verdict}: ${compact(post.metrics.views)} views. Private, only you can see it.` : `${post.verdict}: ${compact(post.metrics.views)} views. ${remainingToday} simulations left today.`);
}

/* ------------------------------------------------------------- profile */

// One identity per platform: someone's Instagram is not their X.
const ANONYMOUS = Object.freeze({ handle: "anonymous", name: "Anonymous", avatarUrl: null, verified: false, followers: DEFAULT_FOLLOWERS, followersKnown: false });

function cleanProfile(value) {
  if (!value || typeof value.handle !== "string") return null;
  const followers = Number(value.followers);
  const known = value.followersKnown !== false && value.followers != null && Number.isFinite(followers) && followers >= 0;
  return {
    handle: value.handle.replace(/[^A-Za-z0-9._-]/gu, "").slice(0, 30) || ANONYMOUS.handle,
    name: String(value.name || value.handle).slice(0, 60),
    avatarUrl: typeof value.avatarUrl === "string" && AVATAR_PATTERN.test(value.avatarUrl) ? value.avatarUrl : null,
    verified: Boolean(value.verified),
    followers: known ? Math.min(Math.floor(followers), 500_000_000) : DEFAULT_FOLLOWERS,
    followersKnown: known,
  };
}

function loadProfiles() {
  const stored = load(STORAGE_PROFILES, {});
  const profiles = {};
  for (const id of Object.keys(PLATFORMS)) {
    const profile = cleanProfile(stored?.[id]);
    if (profile) profiles[id] = profile;
  }
  // Before there were platforms there was one X profile.
  if (!profiles.x) {
    const legacy = cleanProfile(load(STORAGE_PROFILE, null));
    if (legacy) profiles.x = legacy;
  }
  return profiles;
}

const profiles = loadProfiles();
const me = () => profiles[platformId] || null;

function setMe(profile) {
  profiles[platformId] = profile;
  save(STORAGE_PROFILES, profiles);
  renderMe();
}

function renderMe() {
  const profile = me() || ANONYMOUS;
  paintAvatar(composerAvatar, profile.name, profile.avatarUrl);
}

/* ---------------------------------------------------------- onboarding */

const onboarding = document.querySelector("[data-onboarding]");
const onboardingForm = document.querySelector("[data-onboarding-form]");
const searchInput = document.querySelector("#onboarding-handle");
const continueButton = document.querySelector("[data-onboarding-continue]");
const previewHint = document.querySelector("[data-preview-hint]");
const resultsList = document.querySelector("[data-results]");
const audienceField = document.querySelector("[data-audience]");
const audienceInput = document.querySelector("[data-audience-input]");
const lookupButton = document.querySelector("[data-lookup]");

let results = [];
let selected = null;
let searchTimer;
let searchSequence = 0;
// X can be searched by name as you type. The others are looked up by exact
// handle, on request, because each lookup is a paid scrape.
const searchesByName = () => platformId === "x";

function typedHandle() {
  const value = searchInput.value.trim().replace(/^@/u, "");
  return HANDLE_PATTERNS[platformId].test(value) ? value : "";
}

function syncContinue() {
  continueButton.disabled = !selected && !typedHandle() && !(audienceInput.value !== "" && !searchesByName());
  lookupButton.disabled = !typedHandle();
}

function showHint(message) {
  previewHint.textContent = message;
  previewHint.hidden = false;
  resultsList.hidden = true;
  searchInput.setAttribute("aria-expanded", "false");
}

function resultMeta(profile) {
  const audience = platformId === "youtube" ? "subscribers" : "followers";
  return profile.followersKnown ? `@${profile.handle} · ${compact(profile.followers)} ${audience}` : `@${profile.handle}`;
}

function select(profile) {
  selected = profile;
  for (const option of resultsList.querySelectorAll(".result")) {
    const active = option.dataset.handle === profile?.handle;
    option.classList.toggle("is-selected", active);
    option.setAttribute("aria-selected", String(active));
  }
  syncContinue();
  if (!profile || profile.followersKnown || !searchesByName()) return;

  // X search results carry no follower count. Fetch it for the one they picked,
  // so the row shows it and the simulation uses their real audience.
  fetchProfile(profile.handle).then((full) => {
    if (!full) return;
    Object.assign(profile, full);
    const meta = resultsList.querySelector(`.result[data-handle="${CSS.escape(profile.handle)}"] [data-meta]`);
    if (meta) meta.textContent = resultMeta(profile);
  }).catch(() => {});
}

function showResults(found) {
  results = found;
  previewHint.hidden = true;
  resultsList.hidden = false;
  searchInput.setAttribute("aria-expanded", "true");
  resultsList.replaceChildren(...found.map((profile) => {
    const node = resultTemplate.content.firstElementChild.cloneNode(true);
    const option = node.querySelector(".result");
    option.dataset.handle = profile.handle;
    paintAvatar(node.querySelector("[data-avatar]"), profile.name, profile.avatarUrl);
    node.querySelector("[data-name]").textContent = profile.name;
    node.querySelector("[data-verified]").toggleAttribute("hidden", !profile.verified);
    node.querySelector("[data-meta]").textContent = resultMeta(profile);
    option.addEventListener("click", () => select(profile));
    option.addEventListener("dblclick", () => onboardingForm.requestSubmit(continueButton));
    return node;
  }));
  // An exact handle match is almost certainly who they mean.
  const exact = found.find((profile) => profile.handle.toLowerCase() === typedHandle().toLowerCase());
  select(exact || (found.length === 1 ? found[0] : null));
}

async function fetchProfile(handle, id = platformId) {
  const response = await fetch(`/api/viral/profile?platform=${encodeURIComponent(id)}&handle=${encodeURIComponent(handle)}`);
  if (!response.ok) {
    const error = new Error("lookup failed");
    error.status = response.status;
    throw error;
  }
  return cleanProfile((await response.json()).profile);
}

async function search(query) {
  const sequence = ++searchSequence;
  try {
    const response = await fetch(`/api/viral/search?q=${encodeURIComponent(query)}`);
    if (sequence !== searchSequence) return;
    const body = response.ok ? await response.json() : { profiles: [] };
    if (sequence !== searchSequence) return;
    let found = (body.profiles || []).map(cleanProfile).filter(Boolean);

    // Search can miss a small or new account; an exact handle lookup catches it.
    const handle = typedHandle();
    if (handle && !found.some((profile) => profile.handle.toLowerCase() === handle.toLowerCase())) {
      const exact = await fetchProfile(handle).catch(() => null);
      if (sequence !== searchSequence) return;
      if (exact) found = [exact, ...found];
    }

    if (found.length) showResults(found);
    else showHint(handle ? `No one found. You can still continue as @${handle}.` : "No one found. Try their exact handle.");
  } catch {
    if (sequence === searchSequence) showHint(typedHandle() ? "Search isn't answering. You can still continue with this handle." : "Search isn't answering right now.");
  }
}

// Instagram, TikTok, and YouTube: one exact lookup, only when asked for.
async function lookUp() {
  const handle = typedHandle();
  if (!handle) return;
  const sequence = ++searchSequence;
  const name = platform().name;
  lookupButton.disabled = true;
  showHint(`Looking up @${handle} on ${name}… this can take up to 20 seconds.`);
  try {
    const profile = await fetchProfile(handle);
    if (sequence !== searchSequence) return;
    showResults([profile]);
  } catch (error) {
    if (sequence !== searchSequence) return;
    const messages = {
      404: `Couldn't find @${handle} on ${name}. Check the spelling, or enter your followers below.`,
      429: "That's the lookup limit for today. Enter your followers below instead.",
      503: `${name} lookup isn't set up yet. Enter your followers below instead.`,
    };
    showHint(messages[error.status] || `${name} isn't answering right now. Enter your followers below instead.`);
  } finally {
    syncContinue();
  }
}

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchSequence++;
  selected = null;
  results = [];
  syncContinue();
  const query = searchInput.value.trim();
  if (!searchesByName()) {
    showHint(typedHandle() ? "Press Look up to fetch your profile." : `Type your ${platform().name} handle.`);
    return;
  }
  if (query.length < 2) {
    showHint("Type a name or handle to search…");
    return;
  }
  showHint(`Searching for ${query}…`);
  searchTimer = setTimeout(() => search(query), 350);
});

searchInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || searchesByName() || selected) return;
  event.preventDefault();
  lookUp();
});
lookupButton.addEventListener("click", lookUp);
audienceInput.addEventListener("input", syncContinue);

function openOnboarding() {
  const current = me();
  const name = platform().name;
  searchInput.value = current && current.handle !== ANONYMOUS.handle ? current.handle : "";
  searchInput.placeholder = searchesByName() ? "name or handle" : "handle";
  selected = null;
  results = [];
  searchSequence++;
  document.querySelector("[data-onboarding-title]").textContent = `What's your ${name} handle?`;
  document.querySelector("[data-onboarding-lead]").textContent = searchesByName()
    ? "We'll grab your profile pic so your posts look like yours"
    : `We'll grab your profile pic and ${platformId === "youtube" ? "subscriber" : "follower"} count`;
  lookupButton.hidden = searchesByName();
  audienceField.hidden = searchesByName();
  document.querySelector("[data-audience-platform]").textContent = name;
  document.querySelector("[data-audience-noun]").textContent = platformId === "youtube" ? "subscribers" : "followers";
  audienceInput.value = "";
  showHint(searchesByName() ? "Type a name or handle to search…" : `Type your ${name} handle.`);
  if (searchInput.value && searchesByName()) search(searchInput.value);
  syncContinue();
  onboarding.showModal();
}

onboardingForm.addEventListener("submit", (event) => {
  if (event.submitter?.value !== "continue") {
    setMe({ ...ANONYMOUS });
    return;
  }
  // Enter with a list showing and nothing picked takes the top result.
  const handle = typedHandle();
  let profile = selected || (handle ? null : results[0]) || cleanProfile({ handle: handle || ANONYMOUS.handle, name: handle });
  // A number they typed themselves wins over nothing, never over a real lookup.
  if (!profile.followersKnown && audienceInput.value !== "") {
    profile = cleanProfile({ ...profile, followers: audienceInput.value, followersKnown: true });
  }
  setMe(profile);

  // X results picked before their follower count arrived: fill it in after.
  if (searchesByName() && !profile.followersKnown && profile.handle !== ANONYMOUS.handle) {
    const chosenOn = platformId;
    fetchProfile(profile.handle, chosenOn).then((full) => {
      if (!full || profiles[chosenOn]?.handle !== profile.handle) return;
      profiles[chosenOn] = full;
      save(STORAGE_PROFILES, profiles);
      renderMe();
    }).catch(() => {});
  }
});

// Escape closes the dialog without saving a choice, so the question comes back
// on the next visit; until then the composer posts as Anonymous.
onboarding.addEventListener("close", () => textarea.focus());
for (const trigger of document.querySelectorAll("[data-open-onboarding]")) trigger.addEventListener("click", openOnboarding);

/* ------------------------------------------------------------ composer */

const composerMedia = document.querySelector("[data-composer-media]");
const pollEditor = document.querySelector("[data-poll-editor]");
const pollInputs = [...document.querySelectorAll("[data-poll-option]")];
const emojiPop = document.querySelector("[data-emoji-pop]");
const emojiButton = document.querySelector('[data-tool="emoji"]');
const fileMedia = document.querySelector("[data-file-media]");
const fileGif = document.querySelector("[data-file-gif]");
const mediaTools = [document.querySelector('[data-tool="media"]'), document.querySelector('[data-tool="gif"]')];
const pollTool = document.querySelector('[data-tool="poll"]');
const extraField = document.querySelector("[data-composer-extra]");
const extraInput = document.querySelector("#composer-extra-text");
const formatSelect = document.querySelector("[data-format]");
const visibilityButton = document.querySelector("[data-visibility]");
const newPostsButton = document.querySelector("[data-new-posts]");
const feedEmpty = document.querySelector("[data-feed-empty]");
const feedEnd = document.querySelector("[data-feed-end]");
const leaderboardEmpty = document.querySelector("[data-leaderboard-empty]");

let attached = [];

function pollOptions() {
  return pollEditor.hidden ? [] : pollInputs.map((input) => input.value.trim()).filter(Boolean);
}

function syncComposer() {
  const length = textarea.value.length;
  const limit = TEXT_LIMITS[platformId];
  counter.textContent = `${length} / ${limit}`;
  counter.hidden = length === 0;
  counter.classList.toggle("is-over", length > limit);
  const pollReady = pollEditor.hidden || pollOptions().length >= 2;
  simulateButton.disabled = !textarea.value.trim() || !pollReady;
  // Grow with the text, like the box it imitates.
  textarea.rows = Math.min(12, Math.max(2, textarea.value.split("\n").length + Math.floor(length / 55)));

  // Same rules as the real composer: a poll or media, not both; one video or GIF alone.
  const full = attached.length >= MAX_IMAGES || attached.some((file) => file.kind !== "image");
  for (const tool of mediaTools) tool.disabled = full || !pollEditor.hidden;
  pollTool.disabled = attached.length > 0;
}

function renderAttached() {
  renderMedia(composerMedia, attached, {
    onRemove: (index) => {
      attached = attached.filter((_, position) => position !== index);
      renderAttached();
    },
  });
  syncComposer();
}

function attach(fileList) {
  for (const blob of fileList) {
    const kind = mediaKind(blob);
    if (!kind) {
      setStatus("That file type isn't supported. Use an image, GIF, or video.", true);
      continue;
    }
    if (blob.size > (kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) {
      setStatus(kind === "video" ? "Videos need to be under 80 MB." : "Images need to be under 10 MB.", true);
      continue;
    }
    const alone = kind !== "image";
    if ((alone && attached.length) || attached.some((file) => file.kind !== "image") || attached.length >= MAX_IMAGES) {
      setStatus("Attach up to 4 photos, or a single video or GIF.", true);
      break;
    }
    attached.push({ kind, blob });
    setStatus("");
  }
  renderAttached();
}

mediaTools[0].addEventListener("click", () => fileMedia.click());
mediaTools[1].addEventListener("click", () => fileGif.click());
for (const input of [fileMedia, fileGif]) {
  input.addEventListener("change", () => {
    attach(input.files);
    input.value = "";
  });
}

// Pasting or dropping a file into the box attaches it, like the real thing.
textarea.addEventListener("paste", (event) => {
  const files = [...(event.clipboardData?.files || [])];
  if (!files.length) return;
  event.preventDefault();
  attach(files);
});
composer.addEventListener("dragover", (event) => event.preventDefault());
composer.addEventListener("drop", (event) => {
  event.preventDefault();
  attach(event.dataTransfer?.files || []);
});

pollTool.addEventListener("click", () => {
  pollEditor.hidden = false;
  pollInputs[0].focus();
  syncComposer();
});
document.querySelector("[data-poll-remove]").addEventListener("click", () => {
  pollEditor.hidden = true;
  for (const input of pollInputs) input.value = "";
  syncComposer();
});
for (const input of pollInputs) input.addEventListener("input", syncComposer);

emojiPop.replaceChildren(...EMOJIS.map((emoji) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "emoji";
  button.textContent = emoji;
  button.addEventListener("click", () => {
    const { selectionStart, selectionEnd, value } = textarea;
    textarea.value = value.slice(0, selectionStart) + emoji + value.slice(selectionEnd);
    textarea.selectionStart = textarea.selectionEnd = selectionStart + emoji.length;
    textarea.focus();
    syncComposer();
  });
  return button;
}));

function toggleEmoji(open) {
  emojiPop.hidden = !open;
  emojiButton.setAttribute("aria-expanded", String(open));
}

emojiButton.addEventListener("click", () => toggleEmoji(emojiPop.hidden));
document.addEventListener("click", (event) => {
  if (!emojiPop.hidden && !event.target.closest("[data-emoji-pop], [data-tool='emoji']")) toggleEmoji(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !emojiPop.hidden) toggleEmoji(false);
});

textarea.addEventListener("input", syncComposer);
textarea.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !simulateButton.disabled) composer.requestSubmit();
});

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = textarea.value.trim();
  if (!text) return;
  const author = me() || ANONYMOUS;
  const poll = pollOptions();

  const post = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    name: author.name,
    handle: author.handle,
    avatarUrl: author.avatarUrl,
    verified: author.verified,
    followers: author.followers,
    platform: platformId,
    ...(isPrivate ? { private: true } : {}),
    ...(extraInput.value.trim() && !extraField.hidden ? { extra: extraInput.value.trim() } : {}),
    ...(formatSelect.hidden ? {} : { format: formatSelect.value }),
    createdAt: Date.now(),
    attachments: attached.map((file) => file.kind),
    mediaCount: attached.length,
    ...(poll.length >= 2 ? { poll } : {}),
    state: "pending",
  };

  // Post first, score second: the post shows up the moment Simulate is hit.
  // putMedia fills its in-memory copy synchronously, so the feed can render the
  // attachments now while the IndexedDB write finishes in the background.
  if (attached.length) putMedia(post.id, attached);
  pending = [post, ...pending];
  textarea.value = "";
  extraInput.value = "";
  attached = [];
  pollEditor.hidden = true;
  for (const input of pollInputs) input.value = "";
  toggleEmoji(false);
  setStatus("");
  renderAttached();
  simulate(post);
});

/* ---------------------------------------------------------------- tabs */

const tabs = [...document.querySelectorAll("[data-tab]")];

function showTab(name) {
  for (const tab of tabs) {
    const active = tab.dataset.tab === name;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  }
  for (const panel of document.querySelectorAll("[data-panel]")) panel.hidden = panel.dataset.panel !== name;
}

for (const tab of tabs) tab.addEventListener("click", () => showTab(tab.dataset.tab));
for (const jump of document.querySelectorAll("[data-tab-jump]")) {
  jump.addEventListener("click", () => {
    showTab(jump.dataset.tabJump);
    scrollTo({ top: 0 });
  });
}

document.querySelector("[data-leaderboard-close]")?.addEventListener("click", () => {
  document.querySelector("[data-leaderboard-card]").hidden = true;
});

document.querySelector("[data-focus-composer]")?.addEventListener("click", () => {
  showTab("foryou");
  textarea.focus();
});

/* ----------------------------------------------------------- visibility */

// Public is the default: simulated posts join the shared feed. Private keeps a
// post in this browser and tells the server not to store it.
let isPrivate = load(STORAGE_PRIVATE, false) === true;

function renderVisibility() {
  visibilityButton.setAttribute("aria-pressed", String(isPrivate));
  visibilityButton.title = isPrivate ? "Private: only you will see this post" : "Public: this post joins the shared feed";
  document.querySelector("[data-visibility-label]").textContent = isPrivate ? "Private" : "Public";
}

visibilityButton.addEventListener("click", () => {
  isPrivate = !isPrivate;
  save(STORAGE_PRIVATE, isPrivate);
  renderVisibility();
});
newPostsButton.addEventListener("click", () => {
  renderFeed({ announce: true });
  scrollTo({ top: 0, behavior: "smooth" });
});
renderVisibility();

/* ------------------------------------------------------------ platforms */

const switcher = document.querySelector("[data-switcher]");
const switcherTrigger = document.querySelector("[data-switcher-trigger]");
const platformOptions = [...document.querySelectorAll("[data-platform-option]")];

function renderPractices(id) {
  const { intro, items } = PRACTICES[id];
  document.querySelector("[data-practices-name]").textContent = PLATFORMS[id].name;
  document.querySelector("[data-practices-intro]").textContent = intro;
  document.querySelector("[data-practices]").replaceChildren(...items.map((item) => {
    const row = document.createElement("li");
    row.className = "practice";
    const title = document.createElement("p");
    title.className = "practice-title";
    title.textContent = item.title;
    const basis = document.createElement("span");
    basis.className = `basis basis-${item.basis}`;
    basis.textContent = BASIS_LABELS[item.basis];
    title.append(" ", basis);
    const body = document.createElement("p");
    body.className = "practice-body";
    body.textContent = item.body;
    row.append(title, body);
    if (item.source) {
      const link = document.createElement("a");
      link.className = "practice-source";
      link.href = item.source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = `${item.source.label} ↗`;
      row.append(link);
    }
    return row;
  }));
}

function renderAbout() {
  const current = platform();
  document.querySelector("[data-about-platform]").textContent = current.name;
  const note = document.querySelector("[data-about-weights]");
  if (current.weightsArePublished) {
    const link = document.createElement("a");
    link.href = current.weightsSource.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `${current.weightsSource.label} ↗`;
    note.replaceChildren("Those estimates are scored with the weights X published in ", link, ":");
  } else {
    note.textContent = `${current.name} publishes no numbers. These weights are estimates of relative importance, ordered by what ${current.name} has said matters most. See the best practices for the sources.`;
  }
  document.querySelector("[data-weights]").replaceChildren(...Object.values(current.actions)
    .sort((a, b2) => b2.weight - a.weight)
    .map(({ label, weight }) => {
      const row = document.createElement("div");
      const term = document.createElement("dt");
      term.textContent = label;
      const value = document.createElement("dd");
      value.textContent = `${weight > 0 ? "+" : "−"}${Math.abs(weight)}`;
      if (weight < 0) value.className = "is-negative";
      row.append(term, value);
      return row;
    }));
}

function setPlatform(id, { persist = true } = {}) {
  platformId = PLATFORMS[id] ? id : DEFAULT_PLATFORM;
  if (persist) save(STORAGE_PLATFORM, platformId);
  document.documentElement.dataset.platform = platformId;
  document.querySelector("[data-switcher-name]").textContent = platform().name;
  for (const option of platformOptions) option.setAttribute("aria-pressed", String(option.dataset.platformOption === platformId));

  // The rail and tabs use each app's own words for the same places.
  const { chrome } = platform();
  for (const node of document.querySelectorAll("[data-rail]")) node.textContent = chrome[node.dataset.rail];
  for (const node of document.querySelectorAll("[data-tab-label]")) node.textContent = chrome[node.dataset.tabLabel];

  const { placeholder, extra, formats } = platform().composer;
  textarea.placeholder = placeholder;
  textarea.maxLength = Math.min(1000, TEXT_LIMITS[platformId]);
  extraField.hidden = !extra;
  if (extra) {
    document.querySelector("[data-extra-label]").textContent = extra.label;
    extraInput.placeholder = extra.placeholder;
  }
  formatSelect.hidden = !formats;
  formatSelect.replaceChildren(...(formats || []).map((format) => new Option(format, format)));
  // Polls and GIFs are an X thing; the other three take photos and video.
  pollTool.hidden = platformId !== "x";
  mediaTools[1].hidden = platformId !== "x";
  if (platformId !== "x" && !pollEditor.hidden) document.querySelector("[data-poll-remove]").click();

  remote = { enabled: false, posts: [], leaderboard: [] };
  live = false;
  renderMe();
  renderPractices(platformId);
  renderAbout();
  renderFeed();
  renderLeaderboard();
  syncComposer();
  refreshLive();
}

// Hovering a platform previews its best practices; clicking switches to it.
for (const option of platformOptions) {
  option.addEventListener("mouseenter", () => renderPractices(option.dataset.platformOption));
  option.addEventListener("focus", () => renderPractices(option.dataset.platformOption));
  option.addEventListener("click", () => {
    setPlatform(option.dataset.platformOption);
    // Drop focus too, or :focus-within keeps the panel open after the choice.
    option.blur();
    closeSwitcher();
    if (!me()) openOnboarding();
  });
}

function closeSwitcher() {
  switcher.classList.remove("is-open");
  switcherTrigger.setAttribute("aria-expanded", "false");
  renderPractices(platformId);
}

// The panel opens on hover through CSS. The button covers touch and keyboards.
switcherTrigger.addEventListener("click", () => {
  const open = !switcher.classList.contains("is-open");
  switcher.classList.toggle("is-open", open);
  switcherTrigger.setAttribute("aria-expanded", String(open));
});
switcher.addEventListener("mouseleave", () => renderPractices(platformId));
document.addEventListener("click", (event) => {
  if (!event.target.closest("[data-switcher]")) closeSwitcher();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSwitcher();
});
renderMe();
setPlatform(platformId, { persist: false });
if (!me()) openOnboarding();
