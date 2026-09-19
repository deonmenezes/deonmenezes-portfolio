/* Will It Go Viral: handle onboarding, composer, local feed, leaderboard.
   Posts and the chosen profile are stored only in this browser. The page CSP
   forbids inline styles, so avatar colours are classes and bars are <meter>s. */

const STORAGE_POSTS = "viral_posts";
const STORAGE_PROFILE = "viral_profile";
const MAX_STORED_POSTS = 50;
const X_LIMIT = 280;
const DEFAULT_FOLLOWERS = 1000;
const AVATAR_PATTERN = /^https:\/\/(?:pbs|abs)\.twimg\.com\/[\w\-./]+$/u;

const b = (action, label, weight, probability, contribution) => ({ action, label, weight, probability, contribution });

// Real Jev output for two posts, so the feed isn't empty on a first visit.
const EXAMPLES = [
  {
    id: "example-banger", example: true, name: "Will It Go Viral", handle: "sample", verified: true, createdAt: null,
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
    id: "example-mid", example: true, name: "Will It Go Viral", handle: "sample", verified: true, createdAt: null,
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
const rankTemplate = document.querySelector("#leaderboard-template");
const composerAvatar = document.querySelector("[data-composer-avatar]");
const template = document.querySelector("#post-template");

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

// Avatar URLs come from localStorage and the API, so only X's image hosts are
// ever turned into an <img>; anything else falls back to an initial.
function paintAvatar(node, name, avatarUrl) {
  const label = (name || "?").trim();
  const initial = (label[0] || "?").toUpperCase();
  const hue = [...label].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 6;
  node.className = `avatar avatar-${hue}`;
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

const VERDICTS = new Set(["banger", "solid", "mid", "flop"]);

function paintVerdict(node, verdict) {
  const key = String(verdict).toLowerCase();
  node.textContent = verdict;
  node.className = `verdict verdict-${VERDICTS.has(key) ? key : "mid"}`;
}

function renderPost(post, { animate = false } = {}) {
  const node = template.content.firstElementChild.cloneNode(true);
  const find = (selector) => node.querySelector(selector);

  paintAvatar(find("[data-avatar]"), post.name, post.avatarUrl);
  find("[data-name]").textContent = post.name || "Anonymous";
  find("[data-verified]").toggleAttribute("hidden", !post.verified);
  find("[data-handle]").textContent = `@${post.handle || "anonymous"}`;
  find("[data-time]").textContent = timeAgo(post.createdAt);
  find("[data-text]").textContent = post.text;

  paintVerdict(find("[data-verdict]"), post.verdict);

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
  const ranked = [...(posts.length ? posts : EXAMPLES)].sort((a, b2) => b2.viralScore - a.viralScore).slice(0, 8);
  leaderboard.replaceChildren(...ranked.map((post, index) => {
    const node = rankTemplate.content.firstElementChild.cloneNode(true);
    const find = (selector) => node.querySelector(selector);
    find("[data-rank]").textContent = String(index + 1);
    find("[data-text]").textContent = post.text;
    paintAvatar(find("[data-avatar]"), post.name, post.avatarUrl);
    find("[data-avatar]").classList.add("avatar-mini");
    find("[data-handle]").textContent = `@${post.handle || "anonymous"}`;
    find("[data-time]").textContent = timeAgo(post.createdAt);
    paintVerdict(find("[data-verdict]"), post.verdict);
    find("[data-views]").textContent = `${compact(post.metrics.views)} views`;
    return node;
  }));
}

function setStatus(message, isError = false) {
  statusLine.textContent = message;
  statusLine.classList.toggle("is-error", isError);
}

/* ------------------------------------------------------------- profile */

const ANONYMOUS = Object.freeze({ handle: "anonymous", name: "Anonymous", avatarUrl: null, verified: false, followers: DEFAULT_FOLLOWERS });

function cleanProfile(value) {
  if (!value || typeof value.handle !== "string") return null;
  const followers = Number(value.followers);
  return {
    handle: value.handle.replace(/[^A-Za-z0-9_]/gu, "").slice(0, 15) || ANONYMOUS.handle,
    name: String(value.name || value.handle).slice(0, 60),
    avatarUrl: typeof value.avatarUrl === "string" && AVATAR_PATTERN.test(value.avatarUrl) ? value.avatarUrl : null,
    verified: Boolean(value.verified),
    followers: value.followers != null && Number.isFinite(followers) && followers >= 0 ? followers : DEFAULT_FOLLOWERS,
  };
}

let me = cleanProfile(load(STORAGE_PROFILE, null));

function renderMe() {
  const profile = me || ANONYMOUS;
  paintAvatar(composerAvatar, profile.name, profile.avatarUrl);
}

/* ---------------------------------------------------------- onboarding */

const onboarding = document.querySelector("[data-onboarding]");
const onboardingForm = document.querySelector("[data-onboarding-form]");
const handleInput = document.querySelector("#onboarding-handle");
const continueButton = document.querySelector("[data-onboarding-continue]");
const previewHint = document.querySelector("[data-preview-hint]");
const previewProfile = document.querySelector("[data-preview-profile]");

let previewed = null;
let lookupTimer;
let lookupSequence = 0;

function showHint(message) {
  previewed = null;
  previewHint.textContent = message;
  previewHint.hidden = false;
  previewProfile.hidden = true;
}

function showPreview(profile) {
  previewed = profile;
  previewHint.hidden = true;
  previewProfile.hidden = false;
  paintAvatar(document.querySelector("[data-preview-avatar]"), profile.name, profile.avatarUrl);
  document.querySelector("[data-preview-name]").textContent = profile.name;
  document.querySelector("[data-preview-verified]").toggleAttribute("hidden", !profile.verified);
  document.querySelector("[data-preview-meta]").textContent = `@${profile.handle} · ${compact(profile.followers)} followers`;
}

async function lookup(handle) {
  const sequence = ++lookupSequence;
  showHint(`Looking up @${handle}…`);
  try {
    const response = await fetch(`/api/viral/profile?handle=${encodeURIComponent(handle)}`);
    if (sequence !== lookupSequence) return;
    if (response.status === 404) {
      showHint(`Couldn't find @${handle}. You can still continue with it.`);
      return;
    }
    if (!response.ok) throw new Error("lookup failed");
    const { profile } = await response.json();
    if (sequence === lookupSequence) showPreview(cleanProfile(profile));
  } catch {
    if (sequence === lookupSequence) showHint("X isn't answering right now. You can still continue with this handle.");
  }
}

handleInput.addEventListener("input", () => {
  const handle = handleInput.value.replace(/[^A-Za-z0-9_]/gu, "").slice(0, 15);
  if (handle !== handleInput.value) handleInput.value = handle;
  clearTimeout(lookupTimer);
  lookupSequence++;
  continueButton.disabled = !handle;
  if (!handle) {
    showHint("Type a handle to preview…");
    return;
  }
  showHint(`Looking up @${handle}…`);
  lookupTimer = setTimeout(() => lookup(handle), 450);
});

function openOnboarding() {
  handleInput.value = me && me.handle !== ANONYMOUS.handle ? me.handle : "";
  continueButton.disabled = !handleInput.value;
  showHint("Type a handle to preview…");
  if (handleInput.value) lookup(handleInput.value);
  onboarding.showModal();
}

onboardingForm.addEventListener("submit", (event) => {
  const handle = handleInput.value;
  if (event.submitter?.value === "continue" && handle) {
    // Continuing before the lookup lands, or after it failed, keeps the handle
    // and simulates with the default audience.
    me = previewed && previewed.handle.toLowerCase() === handle.toLowerCase()
      ? previewed
      : cleanProfile({ handle, name: handle });
  } else {
    me = { ...ANONYMOUS };
  }
  save(STORAGE_PROFILE, me);
  renderMe();
});

// Escape closes the dialog without saving a choice, so the question comes back
// on the next visit; until then the composer posts as Anonymous.
onboarding.addEventListener("close", () => textarea.focus());
for (const trigger of document.querySelectorAll("[data-open-onboarding]")) trigger.addEventListener("click", openOnboarding);

/* ------------------------------------------------------------ composer */

function syncComposer() {
  const length = textarea.value.length;
  counter.textContent = `${length} / ${X_LIMIT}`;
  counter.hidden = length === 0;
  counter.classList.toggle("is-over", length > X_LIMIT);
  simulateButton.disabled = !textarea.value.trim();
  // Grow with the text, like the box it imitates.
  textarea.rows = Math.min(12, Math.max(2, textarea.value.split("\n").length + Math.floor(length / 55)));
}

textarea.addEventListener("input", syncComposer);

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

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = textarea.value.trim();
  if (!text) return;
  const author = me || ANONYMOUS;

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
      avatarUrl: author.avatarUrl,
      verified: author.verified,
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
    syncComposer();
    renderFeed(post.id);
    renderLeaderboard();
    setStatus(`${post.verdict}. ${result.remainingToday} simulations left today.`);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    syncComposer();
  }
});

renderMe();
renderFeed();
renderLeaderboard();
if (!me) openOnboarding();
