/* Will It Go Viral: composer, local feed, leaderboard.
   Posts are stored only in this browser. The page CSP forbids inline styles,
   so avatar colours are classes and bars are <meter> elements. */

const STORAGE_POSTS = "viral_posts";
const STORAGE_PROFILE = "viral_profile";
const MAX_STORED_POSTS = 50;
const X_LIMIT = 280;

const b = (action, label, weight, probability, contribution) => ({ action, label, weight, probability, contribution });

// Real Jev output for two posts, so the feed isn't empty on a first visit.
const EXAMPLES = [
  {
    id: "example-banger", example: true, name: "Sample post", handle: "sample", createdAt: null,
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
    id: "example-mid", example: true, name: "Sample post", handle: "sample", createdAt: null,
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

const composer = document.querySelector("[data-composer]");
const textarea = document.querySelector("#composer-text");
const counter = document.querySelector("[data-count]");
const simulateButton = document.querySelector("[data-simulate]");
const statusLine = document.querySelector("[data-status]");
const feed = document.querySelector("[data-feed]");
const leaderboard = document.querySelector("[data-leaderboard]");
const leaderboardEmpty = document.querySelector("[data-leaderboard-empty]");
const composerAvatar = document.querySelector("[data-composer-avatar]");
const template = document.querySelector("#post-template");
const profileInputs = { name: composer.elements.name, handle: composer.elements.handle, followers: composer.elements.followers };

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
posts = Array.isArray(posts) ? posts.filter(isPost) : [];

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

function paintAvatar(node, name) {
  const label = (name || "?").trim();
  node.textContent = (label[0] || "?").toUpperCase();
  const hue = [...label].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 6;
  node.className = `avatar avatar-${hue}`;
}

function countUp(node, target) {
  if (!target || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    node.textContent = compact(target || 0);
    return;
  }
  const started = performance.now();
  const duration = 1100;
  const tick = (now) => {
    const progress = Math.min(1, (now - started) / duration);
    node.textContent = compact(Math.round(target * (1 - (1 - progress) ** 3)));
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function renderPost(post, { animate = false } = {}) {
  const node = template.content.firstElementChild.cloneNode(true);
  const find = (selector) => node.querySelector(selector);

  paintAvatar(find("[data-avatar]"), post.name);
  find("[data-name]").textContent = post.name || "Anonymous";
  find("[data-handle]").textContent = `@${post.handle || "anonymous"}`;
  find("[data-time]").textContent = timeAgo(post.createdAt);
  find("[data-text]").textContent = post.text;

  const badge = find("[data-verdict]");
  badge.textContent = post.verdict;
  badge.classList.add(`badge-${post.verdict.toLowerCase()}`);

  for (const metric of node.querySelectorAll("[data-metric]")) {
    const value = post.metrics[metric.dataset.metric];
    if (animate) countUp(metric, value); else metric.textContent = compact(value);
  }

  find("[data-score]").textContent = `${post.viralScore}/100`;
  find("[data-summary]").textContent = `Jev thinks ${EMOTIONS[post.emotion] || EMOTIONS.nothing}, with a hook of ${Number(post.hook).toFixed(1)} out of 3.`;

  const bars = find("[data-bars]");
  for (const item of post.breakdown) {
    const row = document.createElement("div");
    row.className = "bar-row";
    const label = document.createElement("span");
    label.textContent = `${item.label} (${item.weight > 0 ? "+" : ""}${item.weight})`;
    const meter = document.createElement("meter");
    meter.min = 0;
    meter.max = 1;
    meter.value = item.probability;
    if (item.weight < 0) meter.className = "is-negative";
    const figure = document.createElement("span");
    figure.className = "bar-figure";
    figure.textContent = `${Math.round(item.probability * 100)}%`;
    row.append(label, meter, figure);
    bars.append(row);
  }

  const tips = find("[data-tips]");
  for (const tip of post.tips || []) {
    const item = document.createElement("li");
    item.textContent = tip;
    tips.append(item);
  }
  if (animate) find("details").open = true;
  return node;
}

function renderFeed(newestId) {
  const visible = posts.length ? posts : EXAMPLES;
  feed.replaceChildren(...visible.map((post) => renderPost(post, { animate: post.id === newestId })));
}

function renderLeaderboard() {
  const ranked = [...posts].sort((a, b2) => b2.viralScore - a.viralScore).slice(0, 8);
  leaderboardEmpty.hidden = ranked.length > 0;
  leaderboard.replaceChildren(...ranked.map((post) => {
    const item = document.createElement("li");
    const text = document.createElement("p");
    text.className = "leaderboard-text";
    text.textContent = post.text;
    const meta = document.createElement("p");
    meta.className = "leaderboard-meta";
    const verdict = document.createElement("span");
    verdict.className = `badge badge-${post.verdict.toLowerCase()}`;
    verdict.textContent = post.verdict;
    meta.append(`${post.viralScore}/100 · ${compact(post.metrics.views)} views · `, verdict);
    item.append(text, meta);
    return item;
  }));
}

function setStatus(message, isError = false) {
  statusLine.textContent = message;
  statusLine.classList.toggle("is-error", isError);
}

/* ------------------------------------------------------------- profile */

const profile = load(STORAGE_PROFILE, {});
if (typeof profile.name === "string") profileInputs.name.value = profile.name;
if (typeof profile.handle === "string") profileInputs.handle.value = profile.handle;
if (profile.followers) profileInputs.followers.value = String(profile.followers);

function currentProfile() {
  return {
    name: profileInputs.name.value.trim().slice(0, 40),
    handle: profileInputs.handle.value.replace(/[^A-Za-z0-9_]/gu, "").slice(0, 15),
    followers: Number(profileInputs.followers.value) || 1000,
  };
}

function syncProfile() {
  const next = currentProfile();
  save(STORAGE_PROFILE, next);
  paintAvatar(composerAvatar, next.name || next.handle);
}

for (const input of Object.values(profileInputs)) input.addEventListener("input", syncProfile);

/* ------------------------------------------------------------ composer */

textarea.addEventListener("input", () => {
  const length = textarea.value.length;
  counter.textContent = `${length} / ${X_LIMIT}`;
  counter.classList.toggle("is-over", length > X_LIMIT);
});

document.querySelector("[data-focus-composer]")?.addEventListener("click", () => textarea.focus());

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = textarea.value.trim();
  if (!text) return;
  const author = currentProfile();

  simulateButton.disabled = true;
  setStatus("Jev is reading your post…");
  try {
    const response = await fetch("/api/viral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, followers: author.followers }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "Something went wrong. Try again.");

    const post = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      name: author.name,
      handle: author.handle,
      createdAt: Date.now(),
      viralScore: result.viralScore,
      verdict: result.verdict,
      metrics: result.metrics,
      breakdown: result.breakdown,
      hook: result.hook,
      emotion: result.emotion,
      tips: result.tips,
    };
    posts = [post, ...posts].slice(0, MAX_STORED_POSTS);
    save(STORAGE_POSTS, posts);

    textarea.value = "";
    counter.textContent = `0 / ${X_LIMIT}`;
    renderFeed(post.id);
    renderLeaderboard();
    setStatus(`${post.verdict}. ${result.remainingToday} simulations left today.`);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    simulateButton.disabled = false;
  }
});

syncProfile();
renderFeed();
renderLeaderboard();
