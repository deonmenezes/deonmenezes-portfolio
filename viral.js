/* Will It Go Viral: profile search, composer (media, GIF, poll, emoji), instant
   posting with animated engagement, local feed, leaderboard.
   Everything a visitor makes stays in this browser: posts and the chosen profile
   in localStorage, attached media in IndexedDB. The page CSP forbids inline
   styles, so layout variants are classes and bars are <meter>/<progress>. */

import { draftChecks } from "/viral-checks.js";
import { DEFAULT_PLATFORM, PLATFORMS } from "/viral-platforms.js";
import { BASIS_LABELS, PRACTICES } from "/viral-practices.js";
import { MAX_OWN_TOPICS, TRENDS, TRENDS_AS_OF, TRENDS_SCOPE, cleanTopics, trendsFor } from "/viral-trends.js";

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
    text: "A 19 year old just open-sourced a tool that does in 4 seconds what our team of 12 spent two years building. I read the code. It is 300 lines. Here is how it works:",
    viralScore: 90, verdict: "Banger", hook: 2.72, emotion: "awe",
    metrics: { views: 134236, likes: 3197, replies: 882, reposts: 631, bookmarks: 799 },
    breakdown: [
      b("like", "Like", 0.5, 0.63, 0.01191), b("repost", "Repost", 1, 0.56, 0.0047), b("reply", "Reply", 5, 0.74, 0.03286),
      b("quote", "Quote", 5, 0.71, 0.00756), b("shareLink", "Copies the link to share", 20, 0.47, 0.01767), b("follow", "Follows you", 4, 0.37, 0.00164),
      b("negative", "Not interested / mute / block", -43.2, 0.22, -0.00836), b("report", "Report", -234, 0.06, -0.00051),
    ],
    tips: [],
  },
  {
    id: "example-mid", example: true, platform: "x", name: "Will It Go Viral", handle: "sample", verified: true, createdAt: null,
    text: "Hot take: tabs are better than spaces.",
    viralScore: 24, verdict: "Mid", hook: 1.57, emotion: "relatable",
    metrics: { views: 819, likes: 5, replies: 3, reposts: 1, bookmarks: 1 },
    breakdown: [
      b("like", "Like", 0.5, 0.32, 0.00307), b("repost", "Repost", 1, 0.25, 0.00094), b("reply", "Reply", 5, 0.52, 0.01622),
      b("quote", "Quote", 5, 0.5, 0.00375), b("shareLink", "Copies the link to share", 20, 0.16, 0.00205), b("follow", "Follows you", 4, 0.1, 0.00012),
      b("negative", "Not interested / mute / block", -43.2, 0.21, -0.00762), b("report", "Report", -234, 0.04, -0.00022),
    ],
    tips: [
      "Nobody would carry this off the timeline. Copying a post's link is the heaviest positive signal X publishes, at 20, so make something worth passing on.",
      "Nothing here makes a stranger want more from you. A follow is weighted 4, so show what you are about.",
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

// Plays a reel only while most of it is on screen.
const reelWatcher = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => {
    for (const { target, intersectionRatio } of entries) {
      if (intersectionRatio < 0.6) target.pause();
      else if (!document.hidden) target.play().catch(() => {});
    }
  }, { threshold: [0, 0.6] })
  : null;

// Coming back to the tab re-runs the check, since nothing starts while hidden.
document.addEventListener("visibilitychange", () => {
  if (document.hidden || !reelWatcher) return;
  for (const video of document.querySelectorAll(".is-reel video")) {
    reelWatcher.unobserve(video);
    reelWatcher.observe(video);
  }
});

// `files` are { kind, blob }. Image object URLs are revoked once decoded.
function renderMedia(container, files, { onRemove, reel = false } = {}) {
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
      element.muted = true;
      element.playsInline = true;
      element.preload = "metadata";
      // Off X a video behaves like a reel: it loops silently while on screen,
      // a tap pauses it, and the corner button turns the sound on.
      if (reel) {
        element.loop = true;
        cell.classList.add("is-reel");
        element.addEventListener("click", () => (element.paused ? element.play().catch(() => {}) : element.pause()));
        reelWatcher?.observe(element);
        const sound = document.createElement("button");
        sound.type = "button";
        sound.className = "media-sound";
        const paintSound = () => {
          sound.setAttribute("aria-label", element.muted ? "Turn sound on" : "Turn sound off");
          sound.replaceChildren(icon(element.muted ? "muted" : "sound"));
        };
        sound.addEventListener("click", () => {
          element.muted = !element.muted;
          paintSound();
        });
        paintSound();
        cell.append(sound);
      } else {
        element.controls = true;
      }
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
  const visual = find("[data-visual]");
  visual.hidden = !post.visual;
  visual.textContent = post.visual ? `What the AI saw and heard: ${post.visual}` : "";
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

  fillStats(node, post);
  fillGoal(node, post);
  const actual = find("[data-actual]");
  actual.closest("label").hidden = !posts.includes(post);
  actual.value = post.actualViews ?? "";
  actual.onchange = () => {
    const views = Math.floor(Number(actual.value));
    if (actual.value !== "" && Number.isFinite(views) && views >= 0) post.actualViews = views;
    else delete post.actualViews;
    storePosts();
    renderHistory();
  };

  find("[data-tips]").replaceChildren(...(post.tips || []).map((tip) => {
    const item = document.createElement("li");
    item.textContent = tip;
    return item;
  }));
}

/* ------------------------------------------------- compare and save image */

let compareFirst = null;
const compareDialog = document.querySelector("[data-compare-dialog]");
document.querySelector("[data-compare-close]").addEventListener("click", () => compareDialog.close());

const percent = (probability) => `${Math.round(probability * 100)}%`;

// Two scored posts, signal by signal. The better figure in each row is marked;
// for signals that hurt, lower is better.
function showComparison(first, second) {
  const label = (post) => (post.text.length > 60 ? `${post.text.slice(0, 57)}…` : post.text);
  compareDialog.querySelector("[data-compare-a]").textContent = label(first);
  compareDialog.querySelector("[data-compare-b]").textContent = label(second);
  const gap = Math.abs(first.viralScore - second.viralScore);
  const leader = first.viralScore >= second.viralScore ? "first" : "second";
  compareDialog.querySelector("[data-compare-winner]").textContent = gap < 5
    ? "Too close to call. A gap under 5 points is small enough to be noise."
    : `The ${leader} post wins by ${gap} points.`;

  const rows = [
    ["Viral score", first.viralScore, second.viralScore, String, true],
    ["Views", first.metrics.views, second.metrics.views, compact, true],
    ["Hook, out of 3", Number(first.hook) || 0, Number(second.hook) || 0, (value) => value.toFixed(1), true],
  ];
  const other = new Map(second.breakdown.map((item) => [item.action, item]));
  for (const item of first.breakdown) {
    const match = other.get(item.action);
    if (match) rows.push([item.label, item.probability, match.probability, percent, item.weight > 0]);
  }
  compareDialog.querySelector("[data-compare-rows]").replaceChildren(...rows.map(([name, a, b2, format, higherWins]) => {
    const row = document.createElement("tr");
    const head = document.createElement("th");
    head.scope = "row";
    head.textContent = name;
    const cells = [a, b2].map((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = format(value);
      const rival = index === 0 ? b2 : a;
      if (value !== rival && (value > rival) === higherWins) cell.className = "is-better";
      return cell;
    });
    row.append(head, ...cells);
    return row;
  }));
  compareDialog.showModal();
}

function pickForCompare(post) {
  if (compareFirst === post.id) {
    compareFirst = null;
  } else if (compareFirst) {
    const first = feedPosts().find((entry) => entry.id === compareFirst);
    compareFirst = null;
    if (first) showComparison(first, post);
  } else {
    compareFirst = post.id;
    showToast("Now pick a second post to compare it with.");
  }
  for (const button of feed.querySelectorAll("[data-compare]")) {
    button.setAttribute("aria-pressed", String(button.closest(".post").dataset.postId === compareFirst));
  }
}

function wrapLines(context, text, maxWidth, maxLines) {
  const lines = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/u)) {
      const next = line ? `${line} ${word}` : word;
      if (context.measureText(next).width <= maxWidth || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1].replace(/.{0,3}$/u, "")}…`;
  return kept;
}

const VERDICT_COLOURS = { Banger: "#00ba7c", Solid: "#1d9bf0", Mid: "#b7791f", Flop: "#f4212e" };

// A picture of the result, drawn in the browser. It says "simulated" on its face
// so it can't pass for a screenshot of real numbers.
async function saveImage(post) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 675;
  const context = canvas.getContext("2d");
  const dark = post.platform === "tiktok";
  const ink = dark ? "#ffffff" : "#0f1419";
  const muted = dark ? "#9aa0a6" : "#536471";
  const font = (weight, size) => `${weight} ${size}px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  context.fillStyle = dark ? "#000000" : "#ffffff";
  context.fillRect(0, 0, 1200, 675);

  context.fillStyle = ink;
  context.font = font(700, 30);
  context.fillText(`${PLATFORMS[post.platform].chrome.handlePrefix || "@"}${post.handle || "anonymous"}`, 64, 92);
  context.fillStyle = muted;
  context.font = font(400, 26);
  context.fillText(`on ${PLATFORMS[post.platform].name}`, 64, 130);

  context.fillStyle = ink;
  context.font = font(400, 40);
  wrapLines(context, post.text, 1072, 6).forEach((line, index) => context.fillText(line, 64, 210 + index * 54));

  context.fillStyle = VERDICT_COLOURS[post.verdict] || ink;
  context.font = font(800, 64);
  context.fillText(post.verdict, 64, 585);
  const verdictWidth = context.measureText(post.verdict).width;
  context.fillStyle = ink;
  context.font = font(700, 40);
  context.fillText(`${post.viralScore}/100`, 64 + verdictWidth + 24, 585);

  context.fillStyle = muted;
  context.font = font(400, 26);
  const figures = PLATFORMS[post.platform].metrics.map((metric) => `${compact(post.metrics[metric.key] || 0)} ${metric.label.toLowerCase()}`).join("  ·  ");
  context.fillText(figures, 64, 632);
  context.textAlign = "right";
  context.fillText("Simulated · Will It Go Viral?", 1136, 92);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return showToast("Couldn't make the image in this browser.");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `will-it-go-viral-${post.verdict.toLowerCase()}-${post.viralScore}.png`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  return showToast("Image saved.");
}

function storePosts() {
  save(STORAGE_POSTS, posts.map(({ state, followers, lookFiles, looking, ...stored }) => stored));
}

/* ------------------------------------------------------ looking at media */

const FRAME_EDGE = 384;
const FRAME_WAIT_MS = 4000;

function shrink(source, width, height) {
  const scale = Math.min(1, FRAME_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.6);
}

const waitFor = (target, event) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("timeout")), FRAME_WAIT_MS);
  target.addEventListener(event, () => {
    clearTimeout(timer);
    resolve();
  }, { once: true });
  target.addEventListener("error", () => {
    clearTimeout(timer);
    reject(new Error("unreadable"));
  }, { once: true });
});

// Six stills: three from the opening seconds, where a viewer decides, and three
// from the rest. Only these small pictures ever leave the browser.
async function videoFrames(blob) {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const url = URL.createObjectURL(blob);
  const frames = [];
  try {
    video.src = url;
    await waitFor(video, "loadeddata");
    const length = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 4;
    const times = [...new Set([0.3, 1.5, 3, length * 0.45, length * 0.7, length * 0.92].map((time) => Math.min(time, Math.max(0, length - 0.1)).toFixed(2)))].map(Number).sort((a, b2) => a - b2);
    for (const time of times) {
      video.currentTime = time;
      await waitFor(video, "seeked");
      frames.push(shrink(video, video.videoWidth, video.videoHeight));
    }
  } catch {
    // Whatever was captured before the problem is still worth sending.
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
  return frames;
}

async function imageFrame(blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    return shrink(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

const SOUND_SECONDS = 40;
const SOUND_RATE = 16_000;
// Decoding holds the whole soundtrack in memory, so long uploads are not listened to.
const SOUND_MAX_BYTES = 80 * 1024 * 1024;
const SOUND_MAX_SECONDS = 600;

// The first 40 seconds of a video's sound as a small mono WAV data URI, or "" if
// it has none or cannot be decoded. Only this clip leaves the browser.
async function openingSound(blob) {
  if (blob.size > SOUND_MAX_BYTES || typeof OfflineAudioContext === "undefined") return "";
  let decoder;
  try {
    decoder = new AudioContext();
    const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
    if (decoded.duration > SOUND_MAX_SECONDS) return "";
    const seconds = Math.min(SOUND_SECONDS, decoded.duration);
    if (seconds < 0.5) return "";
    const offline = new OfflineAudioContext(1, Math.ceil(seconds * SOUND_RATE), SOUND_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const samples = (await offline.startRendering()).getChannelData(0);
    // Silence is not worth a request.
    if (!samples.some((sample) => Math.abs(sample) > 0.01)) return "";

    const wav = new DataView(new ArrayBuffer(44 + samples.length * 2));
    const text = (offset, value) => [...value].forEach((character, index) => wav.setUint8(offset + index, character.charCodeAt(0)));
    text(0, "RIFF");
    wav.setUint32(4, 36 + samples.length * 2, true);
    text(8, "WAVEfmt ");
    wav.setUint32(16, 16, true);
    wav.setUint16(20, 1, true);
    wav.setUint16(22, 1, true);
    wav.setUint32(24, SOUND_RATE, true);
    wav.setUint32(28, SOUND_RATE * 2, true);
    wav.setUint16(32, 2, true);
    wav.setUint16(34, 16, true);
    text(36, "data");
    wav.setUint32(40, samples.length * 2, true);
    samples.forEach((sample, index) => wav.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true));

    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]*;/u, "data:audio/wav;"));
      reader.onerror = () => resolve("");
      reader.readAsDataURL(new Blob([wav], { type: "audio/wav" }));
    });
  } catch {
    return "";
  } finally {
    decoder?.close().catch(() => {});
  }
}

// Returns the description, or "" when anything goes wrong.
async function lookAt(post) {
  try {
    const video = post.lookFiles.find((file) => file.kind === "video");
    const frames = video
      ? await videoFrames(video.blob)
      : (await Promise.allSettled(post.lookFiles.slice(0, MAX_IMAGES).map((file) => imageFrame(file.blob)))).filter((result) => result.status === "fulfilled").map((result) => result.value);
    const audio = video ? await openingSound(video.blob) : "";
    if (!frames.length && !audio) return "";
    const response = await fetch("/api/viral/look", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: post.platform, kind: video ? "video" : "images", frames, ...(audio ? { audio } : {}) }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 429) showToast(result.message || "Video analysis has hit today's limit.");
      return "";
    }
    return typeof result.description === "string" ? result.description : "";
  } catch {
    return "";
  }
}



/* ------------------------------------------------- hook, risk, reach, goal */

const STORAGE_GOALS = "viral_goals";
let goals = load(STORAGE_GOALS, {});

function stat(label, value, tone) {
  const row = document.createElement("div");
  const term = document.createElement("dt");
  term.textContent = label;
  const detail = document.createElement("dd");
  detail.textContent = value;
  if (tone) detail.className = `is-${tone}`;
  row.append(term, detail);
  return row;
}

// Three quick reads of the same Jev answers: the opening, the odds of putting
// people off, and where the views would come from.
function fillStats(node, post) {
  const hook = Number(post.hook) || 0;
  const rows = [stat("Hook", `${hook.toFixed(1)} / 3`, hook >= 2 ? "good" : hook >= 1 ? "warn" : "bad")];
  const risky = post.breakdown.filter((item) => item.weight < 0);
  if (risky.length) {
    const worst = Math.max(...risky.map((item) => item.probability));
    rows.push(stat("Risk of putting people off", worst >= 0.4 ? "High" : worst >= 0.25 ? "Medium" : "Low", worst >= 0.4 ? "bad" : worst >= 0.25 ? "warn" : "good"));
  }
  if (post.reach) rows.push(stat("Views from", `${compact(post.reach.followers)} followers · ${compact(post.reach.discovery)} discovery`));
  node.querySelector("[data-stats]").replaceChildren(...rows);
}

// The score is about reach. A goal reads the same answers for something narrower.
function fillGoal(node, post) {
  const available = PLATFORMS[post.platform].goals || {};
  const select = node.querySelector("[data-goal]");
  const readout = node.querySelector("[data-goal-readout]");
  select.replaceChildren(new Option("Reach", "reach"), ...Object.entries(available).map(([id, goal]) => new Option(goal.label, id)));
  const paint = () => {
    const goal = available[select.value];
    if (!goal) {
      readout.textContent = "The viral score above is the measure.";
      return;
    }
    const parts = post.breakdown.filter((item) => goal.actions.includes(item.action));
    if (!parts.length) {
      readout.textContent = "This post was scored before that signal was asked about.";
      return;
    }
    const average = parts.reduce((sum, item) => sum + item.probability, 0) / parts.length;
    const grade = average >= 0.5 ? "Strong" : average >= 0.3 ? "Fair" : "Weak";
    readout.textContent = `${grade}. ${parts.map((item) => `${item.label} ${percent(item.probability)}`).join(", ")}.`;
  };
  select.value = available[goals[post.platform]] ? goals[post.platform] : "reach";
  select.onchange = () => {
    goals = { ...goals, [post.platform]: select.value };
    save(STORAGE_GOALS, goals);
    paint();
  };
  paint();
}

/* ---------------------------------------------------------------- ideas */

// Which posts have their ideas showing, so a live feed refresh neither closes nor reopens them.
const openIdeas = new Set();

function renderIdeas(panel, post) {
  const { rewrites = [], reactions = [] } = post.ideas;
  const children = [];
  const heading = (text) => {
    const node = document.createElement("h3");
    node.textContent = text;
    return node;
  };
  if (rewrites.length) {
    const list = document.createElement("ul");
    list.append(...rewrites.map((rewrite) => {
      const item = document.createElement("li");
      const tag = document.createElement("span");
      tag.className = "ideas-tag";
      tag.textContent = rewrite.angle;
      const text = document.createElement("p");
      text.className = "ideas-text";
      text.textContent = rewrite.text;
      const use = document.createElement("button");
      use.type = "button";
      use.className = "post-tool";
      use.textContent = "Try this";
      use.addEventListener("click", () => {
        textarea.value = rewrite.text;
        syncComposer();
        textarea.focus();
        textarea.scrollIntoView({ block: "center", behavior: reducedMotion.matches ? "auto" : "smooth" });
        showToast("Loaded into the composer. Simulate it to see how it scores.");
      });
      item.append(tag, text, use);
      return item;
    }));
    children.push(heading("Three ways to rewrite it"), list);
  }
  if (reactions.length) {
    const list = document.createElement("ul");
    list.append(...reactions.map((reaction) => {
      const item = document.createElement("li");
      const who = document.createElement("strong");
      who.textContent = reaction.persona;
      const action = document.createElement("span");
      action.className = "ideas-action";
      action.textContent = ` ${reaction.action}`;
      const comment = document.createElement("p");
      comment.className = reaction.comment ? "ideas-text" : "ideas-text ideas-quiet";
      comment.textContent = reaction.comment || "Says nothing. Most people do.";
      item.append(who, action, comment);
      return item;
    }));
    children.push(heading("How five readers might react"), list);
  }
  const note = document.createElement("p");
  note.className = "ideas-note";
  note.textContent = "Written by a text model (DeepSeek), not by Jev, and shaped by Jev's estimates for this post. The reactions are imagined, not predictions. A rewrite has no score until you simulate it.";
  children.push(note);
  panel.replaceChildren(...children);
  panel.hidden = false;
}

async function showIdeas(node, post) {
  const panel = node.querySelector("[data-ideas-panel]");
  const button = node.querySelector("[data-ideas]");
  if (post.ideas) {
    if (panel.hidden) {
      openIdeas.add(post.id);
      renderIdeas(panel, post);
    } else {
      openIdeas.delete(post.id);
      panel.hidden = true;
    }
    return;
  }
  button.disabled = true;
  button.textContent = "Thinking…";
  try {
    const response = await fetch("/api/viral/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: post.platform,
        text: post.text,
        extra: post.extra,
        format: post.format,
        estimates: Object.fromEntries(post.breakdown.map((item) => [item.action, item.probability])),
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "Couldn't get ideas. Try again.");
    post.ideas = { rewrites: result.rewrites || [], reactions: result.reactions || [] };
    openIdeas.add(post.id);
    storePosts();
    // The feed may have re-rendered while this was in flight.
    const current = feed.querySelector(`[data-post-id="${CSS.escape(post.id)}"]`) || node;
    renderIdeas(current.querySelector("[data-ideas-panel]"), post);
    showToast(`${result.remainingToday} more sets of ideas today.`);
  } catch (error) {
    showToast(error.message || "Couldn't get ideas. Try again.");
  } finally {
    button.disabled = false;
    button.textContent = "Ideas";
  }
}

/* --------------------------------------------------------- shared video */

const MAX_SHARED_VIDEO_BYTES = 50 * 1024 * 1024;
const BLOB_API = "https://vercel.com/api/blob/";

// A public post's video goes straight from the browser to the site's file store,
// with a short-lived token that only the post's publisher can get. Any failure
// leaves the post as it was: playable here, a cover for everyone else.
async function shareVideo(post, mediaKey) {
  try {
    const video = (await getMedia(post.id)).find((file) => file.kind === "video");
    if (!video) return;
    if (video.blob.size > MAX_SHARED_VIDEO_BYTES) {
      showToast("That video is over 50 MB, so only you can play it.");
      return;
    }
    const ask = (body) => fetch("/api/viral/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: post.id, mediaKey, ...body }),
    });
    const granted = await ask({ action: "grant", contentType: video.blob.type, size: video.blob.size });
    const grant = await granted.json().catch(() => ({}));
    if (!granted.ok) {
      showToast(grant.message || "Couldn't share the video, so only you can play it.");
      return;
    }
    const uploaded = await fetch(`${BLOB_API}?pathname=${encodeURIComponent(grant.pathname)}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${grant.token}`,
        "x-api-version": "12",
        "x-vercel-blob-access": "public",
        "x-content-type": grant.contentType,
        "x-add-random-suffix": "0",
        "x-allow-overwrite": "0",
      },
      body: video.blob,
    });
    const { url } = await uploaded.json().catch(() => ({}));
    if (!uploaded.ok || !url) throw new Error(`upload ${uploaded.status}`);
    const attached = await ask({ action: "attach", url });
    if (!attached.ok) throw new Error(`attach ${attached.status}`);
    showToast("Your video is up. Everyone can play it now.");
    refreshLive();
  } catch {
    showToast("Couldn't share the video, so only you can play it.");
  }
}

// Someone else's video: nothing is downloaded until they press play.
function armRemoteVideo(cover, media, post) {
  cover.classList.add("is-playable");
  cover.setAttribute("role", "button");
  cover.tabIndex = 0;
  cover.setAttribute("aria-label", "Play video");
  const play = () => {
    cover.hidden = true;
    const cell = document.createElement("div");
    cell.className = "media-cell is-reel";
    const video = document.createElement("video");
    video.playsInline = true;
    video.loop = post.platform !== "x";
    video.controls = true;
    video.autoplay = true;
    video.src = post.mediaUrl;
    video.addEventListener("error", () => {
      cell.remove();
      media.hidden = true;
      cover.hidden = false;
    }, { once: true });
    cell.append(video);
    media.className = "media-grid media-1";
    media.replaceChildren(cell);
    media.hidden = false;
    cover.closest(".post").dataset.watching = "";
  };
  cover.addEventListener("click", play, { once: true });
  cover.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      play();
    }
  }, { once: true });
}

/* --------------------------------------------------------------- trends */

const TREND_BASIS = { measured: "Measured", reported: "Reported", inferred: "Our read" };
const trendsCard = document.querySelector("[data-trends]");

// The same dated list Jev is given. Shown so a low timeliness score has an answer.
function renderTrends() {
  const trends = trendsFor(platformId);
  // The visitor's own topics work even after the researched list has gone stale. X has neither.
  trendsCard.hidden = !Object.hasOwn(TRENDS, platformId);
  trendsCard.querySelector("[data-trends-listed]").hidden = !trends;
  if (trendsCard.hidden) return;
  renderOwnTopics();
  if (!trends) {
    trendsCard.querySelector("[data-trends-scope]").textContent = `Jev is given your topics with every ${platform().noun}, so it can tell what is new.`;
    return;
  }
  const asOf = new Date(`${TRENDS_AS_OF}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  trendsCard.querySelector("[data-trends-scope]").textContent = `In ${TRENDS_SCOPE}, as of ${asOf}. Jev is given this list with every ${platform().noun}, so it can tell what is new.`;
  const items = (list) => list.map((entry) => {
    const item = document.createElement("li");
    item.textContent = typeof entry === "string" ? entry : entry.text;
    if (entry.basis) {
      const tag = document.createElement("span");
      tag.className = `basis basis-${entry.basis === "measured" ? "official" : entry.basis === "reported" ? "reported" : "unconfirmed"}`;
      tag.textContent = TREND_BASIS[entry.basis];
      item.append(tag);
    }
    return item;
  });
  trendsCard.querySelector("[data-trends-topics]").replaceChildren(...items(trends.topics));
  trendsCard.querySelector("[data-trends-formats]").replaceChildren(...items(trends.formats));
  trendsCard.querySelector("[data-trends-gaps]").replaceChildren(...items(trends.gaps));
  trendsCard.querySelector("[data-trends-source]").textContent = `Source: ${trends.source.label}.`;
}

// Topics the visitor adds for their own niche. They lead the list Jev reads.
const STORAGE_TOPICS = "viral_topics";
const ownTopicsList = trendsCard.querySelector("[data-own-topics]");
const ownTopicForm = trendsCard.querySelector("[data-own-topic-form]");
const ownTopicInput = trendsCard.querySelector("[data-own-topic-input]");
let ownTopics = cleanTopics(load(STORAGE_TOPICS, []));

function renderOwnTopics() {
  ownTopicsList.replaceChildren(...ownTopics.map((topic) => {
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = topic;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "own-topic-remove";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${topic}`);
    remove.addEventListener("click", () => {
      ownTopics = ownTopics.filter((entry) => entry !== topic);
      save(STORAGE_TOPICS, ownTopics);
      renderOwnTopics();
    });
    item.append(label, remove);
    return item;
  }));
  ownTopicsList.hidden = ownTopics.length === 0;
  const full = ownTopics.length >= MAX_OWN_TOPICS;
  ownTopicForm.hidden = full;
  trendsCard.querySelector("[data-own-topics-note]").textContent = full
    ? `That's the limit of ${MAX_OWN_TOPICS}. Remove one to add another.`
    : "Jev takes your word for these. Add only what really is trending, or the timeliness score flatters you.";
}

ownTopicForm.addEventListener("submit", (event) => {
  event.preventDefault();
  ownTopics = cleanTopics([...ownTopics, ownTopicInput.value]);
  save(STORAGE_TOPICS, ownTopics);
  ownTopicInput.value = "";
  renderOwnTopics();
});

/* -------------------------------------------------------------- history */

const historyCard = document.querySelector("[data-history]");

function myScoredPosts() {
  return posts.filter((post) => post.platform === platformId && Number.isFinite(post.viralScore)).sort((a, b2) => (a.createdAt || 0) - (b2.createdAt || 0));
}

// Your own scores over time, and how far the predictions were from what you
// later logged as the real result.
function renderHistory() {
  const mine = myScoredPosts().slice(-20);
  historyCard.hidden = mine.length < 2;
  if (historyCard.hidden) return;
  const step = 300 / (mine.length - 1);
  historyCard.querySelector("[data-history-points]").setAttribute("points", mine.map((post, index) => `${(index * step).toFixed(1)},${(56 - post.viralScore * 0.52).toFixed(1)}`).join(" "));
  const scores = mine.map((post) => post.viralScore);
  const average = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  historyCard.querySelector("[data-history-summary]").textContent = `Last ${mine.length} on ${platform().name}: average ${average}, best ${Math.max(...scores)}, latest ${scores.at(-1)}.`;

  const logged = myScoredPosts().filter((post) => post.actualViews > 0 && post.metrics?.views > 0);
  const reality = historyCard.querySelector("[data-history-reality]");
  reality.hidden = logged.length === 0;
  if (logged.length) {
    const ratios = logged.map((post) => Math.max(post.metrics.views / post.actualViews, post.actualViews / post.metrics.views)).sort((a, b2) => a - b2);
    const median = ratios[Math.floor(ratios.length / 2)];
    reality.textContent = `${logged.length} real ${logged.length === 1 ? "result" : "results"} logged. Predicted views were off by a median of ${median.toFixed(1)}×.`;
  }
}

document.querySelector("[data-history-export]").addEventListener("click", () => {
  // A leading =, +, - or @ would run as a formula in a spreadsheet, so it is defused.
  const cell = (value) => `"${String(value ?? "").replace(/^[=+\-@]/u, "'$&").replaceAll('"', '""')}"`;
  const lines = [["date", "platform", "text", "score", "verdict", "predicted_views", "actual_views"].join(",")];
  for (const post of posts.filter((entry) => Number.isFinite(entry.viralScore))) {
    lines.push([new Date(post.createdAt || Date.now()).toISOString(), post.platform, post.text, post.viralScore, post.verdict, post.metrics?.views, post.actualViews].map(cell).join(","));
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
  link.download = "will-it-go-viral-history.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
});

// Both tools need a finished score; comparing also needs the breakdown, which
// only this browser's own posts and the samples carry.
function armTools(node, post) {
  const compare = node.querySelector("[data-compare]");
  compare.hidden = !Array.isArray(post.breakdown);
  compare.setAttribute("aria-pressed", String(compareFirst === post.id));
  compare.onclick = () => pickForCompare(post);
  const image = node.querySelector("[data-save-image]");
  image.hidden = false;
  image.onclick = () => saveImage(post);
  // Ideas cost money, so they are for posts this browser wrote, not samples or the shared feed.
  const mine = posts.includes(post);
  const ideas = node.querySelector("[data-ideas]");
  ideas.hidden = !mine || !Array.isArray(post.breakdown);
  ideas.onclick = () => showIdeas(node, post);
  if (post.ideas && mine && openIdeas.has(post.id)) renderIdeas(node.querySelector("[data-ideas-panel]"), post);
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

  if (!post.mediaCount && post.mediaUrl) armRemoteVideo(find("[data-cover]"), find("[data-media]"), post);
  if (post.mediaCount) getMedia(post.id).then((files) => renderMedia(find("[data-media]"), files, { reel: post.platform !== "x" }));

  const verdict = find("[data-verdict]");
  const details = find("details");
  if (post.state === "pending" || post.state === "failed") {
    node.classList.add(post.state === "pending" ? "is-pending" : "is-failed");
    verdict.textContent = post.state === "pending" ? (post.looking ? "Watching it" : "Simulating") : "Not simulated";
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
  armTools(node, post);
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
  // Nor restart a shared video someone is watching.
  const watching = new Map([...feed.querySelectorAll(".post[data-watching]")].map((node) => [node.dataset.postId, node]));
  feed.replaceChildren(...visible.map((post) => {
    if (watching.has(post.id)) return watching.get(post.id);
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
    ? "Public posts join the shared feed for everyone, live. Private posts and all photos stay in your browser. A public post's video is uploaded so others can play it, unless you untick that. If you leave analysis on, a few small frames and a video's opening sound are described by AI models and not kept."
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

  // A vision model describes the attached video or photos first, so Jev can weigh
  // more than the caption. If that fails, the post is scored on its words alone.
  if (post.lookFiles?.length && !post.visual) {
    post.looking = true;
    renderFeed();
    post.visual = await lookAt(post);
    delete post.looking;
    if (!post.visual) delete post.visual;
    renderFeed();
  }

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
        visual: post.visual,
        topics: ownTopics,
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

  // The media key is a one-time permission slip, not part of the post: never stored.
  const { remainingToday, published, mediaKey, ...scored } = result;
  Object.assign(post, scored, { state: "done" });
  delete post.error;
  pending = pending.filter((entry) => entry.id !== post.id);
  posts = [post, ...posts].slice(0, MAX_STORED_POSTS);
  storePosts();

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
  armTools(node, post);
  node.classList.remove("is-live");
  renderLeaderboard();
  renderHistory();
  if (published) refreshLive();
  if (published && mediaKey && post.shareMedia) shareVideo(post, mediaKey);
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

// A lookup still in the air is shared, so pressing Look up and then Continue
// never pays for the same scrape twice.
const pendingProfiles = new Map();

function fetchProfile(handle, id = platformId) {
  const key = `${id}:${handle.toLowerCase()}`;
  if (!pendingProfiles.has(key)) {
    pendingProfiles.set(key, requestProfile(handle, id).finally(() => pendingProfiles.delete(key)));
  }
  return pendingProfiles.get(key);
}

async function requestProfile(handle, id) {
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
  showHint(`Looking up @${handle} on ${name}… no need to wait. Press Continue and your picture and count fill in when they arrive.`);
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

  // Nobody waits for a lookup: the dialog closes now, and the picture and
  // follower count are filled in when they arrive.
  if ((!selected || !profile.followersKnown) && profile.handle !== ANONYMOUS.handle) {
    const chosenOn = platformId;
    const chosenName = platform().name;
    fetchProfile(profile.handle, chosenOn).then((full) => {
      if (!full || profiles[chosenOn]?.handle !== profile.handle) return;
      // A number they typed themselves stays if the lookup found none.
      profiles[chosenOn] = full.followersKnown || !profile.followersKnown
        ? full
        : { ...full, followers: profile.followers, followersKnown: true };
      save(STORAGE_PROFILES, profiles);
      renderMe();
    }).catch((error) => {
      if (chosenOn === "x" || profiles[chosenOn]?.handle !== profile.handle) return;
      if (error.status === 404) showToast(`Couldn't find @${profile.handle} on ${chosenName}. Posting with that handle anyway.`);
      else if (!profile.followersKnown) showToast(`Couldn't fetch your ${chosenName} profile. Tap your avatar to enter your followers.`);
    });
  }
});

// Escape closes the dialog without saving a choice, so the question comes back
// on the next visit; until then the composer posts as Anonymous.
onboarding.addEventListener("close", () => textarea.focus());
for (const trigger of document.querySelectorAll("[data-open-onboarding]")) trigger.addEventListener("click", openOnboarding);

/* ------------------------------------------------------------ composer */

const composerMedia = document.querySelector("[data-composer-media]");
const checkList = document.querySelector("[data-checks]");
const lookToggle = document.querySelector("[data-look]");
const lookInput = document.querySelector("[data-look-input]");
const shareToggle = document.querySelector("[data-share]");
const shareInput = document.querySelector("[data-share-input]");
const pollEditor = document.querySelector("[data-poll-editor]");
const pollInputs = [...document.querySelectorAll("[data-poll-option]")];
const emojiPop = document.querySelector("[data-emoji-pop]");
const emojiButton = document.querySelector('[data-tool="emoji"]');
const fileMedia = document.querySelector("[data-file-media]");
const fileVideo = document.querySelector("[data-file-video]");
const videoTool = document.querySelector('[data-tool="video"]');
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
  lookToggle.hidden = attached.length === 0;
  const hasVideo = attached.some((file) => file.kind === "video");
  shareToggle.hidden = !hasVideo || isPrivate;
  document.querySelector("[data-look-label]").textContent = hasVideo ? "Analyse the video." : "Analyse the pictures.";
  document.querySelector("[data-look-note]").textContent = hasVideo
    ? "A few small frames and the first 40 seconds of sound go to AI models, which describe them to Jev. They are not stored."
    : "Small copies go to a vision model, which describes them to Jev. They are not stored.";
  const checks = draftChecks(platformId, textarea.value);
  checkList.hidden = checks.length === 0;
  checkList.replaceChildren(...checks.map((check) => {
    const item = document.createElement("li");
    item.textContent = check.text;
    item.title = `Source: ${check.source}`;
    return item;
  }));
  // Grow with the text, like the box it imitates.
  textarea.rows = Math.min(12, Math.max(2, textarea.value.split("\n").length + Math.floor(length / 55)));

  // Same rules as the real composer: a poll or media, not both; one video or GIF alone.
  const full = attached.length >= MAX_IMAGES || attached.some((file) => file.kind !== "image");
  for (const tool of mediaTools) tool.disabled = full || !pollEditor.hidden;
  videoTool.disabled = attached.length > 0 || !pollEditor.hidden;
  pollTool.disabled = attached.length > 0;
}

function renderAttached() {
  renderMedia(composerMedia, attached, {
    reel: platformId !== "x",
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
    // A video is a Reel on Instagram and a Video elsewhere: the first format listed.
    if (kind === "video" && !formatSelect.hidden) formatSelect.selectedIndex = 0;
  }
  renderAttached();
}

mediaTools[0].addEventListener("click", () => fileMedia.click());
mediaTools[1].addEventListener("click", () => fileGif.click());
videoTool.addEventListener("click", () => fileVideo.click());
for (const input of [fileMedia, fileGif, fileVideo]) {
  input.addEventListener("change", () => {
    if (createDialog.open) createAttach(input.files);
    else attach(input.files);
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
    ...(!isPrivate && shareInput.checked && attached.some((file) => file.kind === "video") ? { shareMedia: true } : {}),
    // Held in memory only, for the vision step; never stored with the post.
    ...(attached.length && lookInput.checked ? { lookFiles: attached } : {}),
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

/* ----------------------------------------------------- Instagram's Create */

// Instagram posts start from Create: pick the media, write the caption beside
// it, Share. It fills the same composer underneath, so scoring has one path.
const createDialog = document.querySelector("[data-create]");
const createPick = createDialog.querySelector("[data-create-pick]");
const createEdit = createDialog.querySelector("[data-create-edit]");
const createMedia = createDialog.querySelector("[data-create-media]");
const createCaption = createDialog.querySelector("[data-create-caption]");
const createHook = createDialog.querySelector("[data-create-hook]");
const createShare = createDialog.querySelector("[data-create-share]");
const createBack = createDialog.querySelector("[data-create-back]");
const createNote = createDialog.querySelector("[data-create-note]");
const CREATE_NOTE = createNote.textContent;

function renderCreate() {
  const editing = attached.length > 0;
  createPick.hidden = editing;
  createEdit.hidden = !editing;
  createBack.hidden = !editing;
  createShare.hidden = !editing;
  createShare.disabled = !createCaption.value.trim();
  createDialog.querySelector("[data-create-count]").textContent = `${createCaption.value.length} / ${TEXT_LIMITS[platformId]}`;
}

// Only when the files change: redrawing on every keystroke would restart a playing video.
function renderCreateMedia() {
  renderCreate();
  renderMedia(createMedia, attached, {
    reel: true,
    onRemove: (index) => {
      attached = attached.filter((_, position) => position !== index);
      renderAttached();
      renderCreateMedia();
    },
  });
}

function createAttach(files) {
  const before = attached.length;
  attach(files);
  // attach() explains a refused file in the composer's status line, which the dialog covers.
  const refused = attached.length === before && [...files].length > 0;
  createNote.textContent = refused ? "Use up to 4 photos, or one video: images under 10 MB, videos under 80 MB." : CREATE_NOTE;
  createNote.classList.toggle("is-error", refused);
  renderCreateMedia();
  if (attached.length) createCaption.focus();
}

function openCreate() {
  const author = me() || ANONYMOUS;
  paintAvatar(createDialog.querySelector("[data-create-avatar]"), author.name, author.avatarUrl);
  createDialog.querySelector("[data-create-handle]").textContent = author.handle;
  createCaption.value = textarea.value;
  createHook.value = extraInput.value;
  createNote.textContent = CREATE_NOTE;
  createNote.classList.remove("is-error");
  renderCreateMedia();
  createDialog.showModal();
}

createDialog.querySelector("[data-create-select]").addEventListener("click", () => fileMedia.click());
createDialog.querySelector("[data-create-close]").addEventListener("click", () => createDialog.close());
createCaption.addEventListener("input", renderCreate);
createBack.addEventListener("click", () => {
  attached = [];
  renderAttached();
  renderCreateMedia();
});
createPick.addEventListener("dragover", (event) => {
  event.preventDefault();
  createPick.classList.add("is-over");
});
createPick.addEventListener("dragleave", () => createPick.classList.remove("is-over"));
createPick.addEventListener("drop", (event) => {
  event.preventDefault();
  createPick.classList.remove("is-over");
  createAttach(event.dataTransfer?.files || []);
});
// Closing keeps the draft: whatever was written carries into the composer.
createDialog.addEventListener("close", () => {
  textarea.value = createCaption.value;
  extraInput.value = createHook.value;
  syncComposer();
});
createShare.addEventListener("click", () => {
  textarea.value = createCaption.value;
  extraInput.value = createHook.value;
  // The close handler runs after this; emptied, it cannot put the caption back.
  createCaption.value = "";
  createHook.value = "";
  createDialog.close();
  syncComposer();
  if (!simulateButton.disabled) composer.requestSubmit();
});

document.querySelector("[data-focus-composer]")?.addEventListener("click", () => {
  showTab("foryou");
  if (platformId === "instagram") openCreate();
  else textarea.focus();
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
  syncComposer();
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
  document.querySelector("[data-about-check]").textContent = current.check || "";
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
  // The rail and the switcher carry the mark of the app being simulated.
  document.querySelector("[data-brand-logo]").setAttribute("href", `#i-logo-${platformId}`);
  document.querySelector("[data-switcher-logo]").setAttribute("href", `#i-logo-${platformId === "instagram" ? "instagram-color" : platformId}`);
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
  renderTrends();
  renderHistory();
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
