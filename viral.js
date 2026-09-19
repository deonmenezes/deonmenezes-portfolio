/* Will It Go Viral: profile search, composer (media, GIF, poll, emoji), instant
   posting with animated engagement, local feed, leaderboard.
   Everything a visitor makes stays in this browser: posts and the chosen profile
   in localStorage, attached media in IndexedDB. The page CSP forbids inline
   styles, so layout variants are classes and bars are <meter>/<progress>. */

const STORAGE_POSTS = "viral_posts";
const STORAGE_PROFILE = "viral_profile";
const MAX_STORED_POSTS = 50;
const X_LIMIT = 280;
const DEFAULT_FOLLOWERS = 1000;
const AVATAR_PATTERN = /^https:\/\/(?:pbs|abs)\.twimg\.com\/[\w\-./]+$/u;
const HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/u;
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const ANIMATION_MS = 6500;

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
posts = Array.isArray(posts) ? posts.filter(isPost) : [];
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

const METRICS = ["replies", "reposts", "likes", "views", "bookmarks"];
// When each counter starts moving, as a fraction of the animation. Views lead,
// the rest follow, the way a real post picks up.
const METRIC_DELAY = { views: 0, likes: 0.08, replies: 0.16, reposts: 0.22, bookmarks: 0.3 };

function easeOut(progress) {
  return 1 - (1 - progress) ** 3;
}

function metricAt(target, metric, progress) {
  const delay = METRIC_DELAY[metric];
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

function animateMetrics(node, metrics) {
  return new Promise((resolve) => {
    const cells = Object.fromEntries(METRICS.map((metric) => {
      const value = node.querySelector(`[data-metric="${metric}"]`);
      return [metric, { value, item: value.closest("li"), shown: 0, lastFloater: 0 }];
    }));
    // Browsers pause requestAnimationFrame in a background tab, which would leave
    // the post stuck mid-count, so a hidden page gets the final numbers at once.
    if (reducedMotion.matches || document.hidden) {
      for (const metric of METRICS) {
        cells[metric].value.textContent = compact(metrics[metric]);
        cells[metric].item.classList.toggle("is-active", metrics[metric] > 0);
      }
      resolve();
      return;
    }

    const started = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - started) / ANIMATION_MS);
      for (const metric of METRICS) {
        const cell = cells[metric];
        const next = metricAt(metrics[metric], metric, progress);
        if (next === cell.shown) continue;
        const gained = next - cell.shown;
        cell.shown = next;
        cell.value.textContent = compact(next);
        cell.item.classList.add("is-active");
        if (metric !== "views" && now - cell.lastFloater > 420) {
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

  paintAvatar(find("[data-avatar]"), post.name, post.avatarUrl);
  find("[data-name]").textContent = post.name || "Anonymous";
  find("[data-verified]").toggleAttribute("hidden", !post.verified);
  find("[data-handle]").textContent = `@${post.handle || "anonymous"}`;
  find("[data-time]").textContent = timeAgo(post.createdAt);
  find("[data-text]").textContent = post.text;

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
  for (const metric of METRICS) {
    const value = find(`[data-metric="${metric}"]`);
    value.textContent = compact(post.metrics[metric]);
    value.closest("li").classList.toggle("is-active", post.metrics[metric] > 0);
  }
  fillAnalysis(node, post);
  return node;
}

function renderFeed() {
  const visible = pending.length || posts.length ? [...pending, ...posts] : EXAMPLES;
  feed.replaceChildren(...visible.map(renderPost));
}

function renderLeaderboard() {
  const ranked = [...(posts.length ? posts : EXAMPLES)].sort((a, b2) => b2.viralScore - a.viralScore).slice(0, 8);
  leaderboard.replaceChildren(...ranked.map((post, index) => {
    const node = rankTemplate.content.firstElementChild.cloneNode(true);
    const find = (selector) => node.querySelector(selector);
    find("[data-rank]").textContent = String(index + 1);
    find("[data-text]").textContent = post.text;
    paintAvatar(find("[data-avatar]"), post.name, post.avatarUrl);
    find("[data-handle]").textContent = `@${post.handle || "anonymous"}`;
    find("[data-time]").textContent = timeAgo(post.createdAt);
    paintVerdict(find("[data-verdict]"), post.verdict);
    find("[data-views]").textContent = `${compact(post.metrics.views)} views`;
    return node;
  }));
}

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
      body: JSON.stringify({ text: post.text, followers: post.followers, attachments: post.attachments, poll: post.poll }),
    });
    result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "Something went wrong. Try again.");
  } catch (error) {
    post.state = "failed";
    post.error = error.message || "Something went wrong. Try again.";
    renderFeed();
    return;
  }

  const { remainingToday, ...scored } = result;
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
  await animateMetrics(node, post.metrics);

  const verdict = node.querySelector("[data-verdict]");
  paintVerdict(verdict, post.verdict);
  verdict.classList.add("is-revealed");
  renderPoll(node.querySelector("[data-poll]"), post, true);
  fillAnalysis(node, post);
  node.querySelector("details").hidden = false;
  node.querySelector("details").open = true;
  node.classList.remove("is-live");
  renderLeaderboard();
  showToast(`${post.verdict}: ${compact(post.metrics.views)} views. ${remainingToday} simulations left today.`);
}

/* ------------------------------------------------------------- profile */

const ANONYMOUS = Object.freeze({ handle: "anonymous", name: "Anonymous", avatarUrl: null, verified: false, followers: DEFAULT_FOLLOWERS, followersKnown: false });

function cleanProfile(value) {
  if (!value || typeof value.handle !== "string") return null;
  const followers = Number(value.followers);
  const known = value.followersKnown !== false && value.followers != null && Number.isFinite(followers) && followers >= 0;
  return {
    handle: value.handle.replace(/[^A-Za-z0-9_]/gu, "").slice(0, 15) || ANONYMOUS.handle,
    name: String(value.name || value.handle).slice(0, 60),
    avatarUrl: typeof value.avatarUrl === "string" && AVATAR_PATTERN.test(value.avatarUrl) ? value.avatarUrl : null,
    verified: Boolean(value.verified),
    followers: known ? followers : DEFAULT_FOLLOWERS,
    followersKnown: known,
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
const searchInput = document.querySelector("#onboarding-handle");
const continueButton = document.querySelector("[data-onboarding-continue]");
const previewHint = document.querySelector("[data-preview-hint]");
const resultsList = document.querySelector("[data-results]");

let results = [];
let selected = null;
let searchTimer;
let searchSequence = 0;

function typedHandle() {
  const value = searchInput.value.trim().replace(/^@/u, "");
  return HANDLE_PATTERN.test(value) ? value : "";
}

function syncContinue() {
  continueButton.disabled = !selected && !typedHandle();
}

function showHint(message) {
  previewHint.textContent = message;
  previewHint.hidden = false;
  resultsList.hidden = true;
  searchInput.setAttribute("aria-expanded", "false");
}

function resultMeta(profile) {
  return profile.followersKnown ? `@${profile.handle} · ${compact(profile.followers)} followers` : `@${profile.handle}`;
}

function select(profile) {
  selected = profile;
  for (const option of resultsList.querySelectorAll(".result")) {
    const active = option.dataset.handle === profile?.handle;
    option.classList.toggle("is-selected", active);
    option.setAttribute("aria-selected", String(active));
  }
  syncContinue();
  if (!profile || profile.followersKnown) return;

  // Search results carry no follower count. Fetch it for the one they picked,
  // so the row shows it and the simulation uses their real audience.
  fetchProfile(profile.handle).then((full) => {
    if (!full) return;
    Object.assign(profile, full);
    const meta = resultsList.querySelector(`.result[data-handle="${CSS.escape(profile.handle)}"] [data-meta]`);
    if (meta) meta.textContent = resultMeta(profile);
  }).catch(() => {});
}

function showResults(profiles) {
  results = profiles;
  previewHint.hidden = true;
  resultsList.hidden = false;
  searchInput.setAttribute("aria-expanded", "true");
  resultsList.replaceChildren(...profiles.map((profile) => {
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
  const exact = profiles.find((profile) => profile.handle.toLowerCase() === typedHandle().toLowerCase());
  select(exact || (profiles.length === 1 ? profiles[0] : null));
}

async function fetchProfile(handle) {
  const response = await fetch(`/api/viral/profile?handle=${encodeURIComponent(handle)}`);
  if (!response.ok) return null;
  return cleanProfile((await response.json()).profile);
}

async function search(query) {
  const sequence = ++searchSequence;
  try {
    const response = await fetch(`/api/viral/search?q=${encodeURIComponent(query)}`);
    if (sequence !== searchSequence) return;
    const body = response.ok ? await response.json() : { profiles: [] };
    if (sequence !== searchSequence) return;
    let profiles = (body.profiles || []).map(cleanProfile).filter(Boolean);

    // Search can miss a small or new account; an exact handle lookup catches it.
    const handle = typedHandle();
    if (handle && !profiles.some((profile) => profile.handle.toLowerCase() === handle.toLowerCase())) {
      const exact = await fetchProfile(handle).catch(() => null);
      if (sequence !== searchSequence) return;
      if (exact) profiles = [exact, ...profiles];
    }

    if (profiles.length) showResults(profiles);
    else showHint(handle ? `No one found. You can still continue as @${handle}.` : "No one found. Try their exact handle.");
  } catch {
    if (sequence === searchSequence) showHint(typedHandle() ? "Search isn't answering. You can still continue with this handle." : "Search isn't answering right now.");
  }
}

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchSequence++;
  selected = null;
  results = [];
  syncContinue();
  const query = searchInput.value.trim();
  if (query.length < 2) {
    showHint("Type a name or handle to search…");
    return;
  }
  showHint(`Searching for ${query}…`);
  searchTimer = setTimeout(() => search(query), 350);
});

function openOnboarding() {
  searchInput.value = me && me.handle !== ANONYMOUS.handle ? me.handle : "";
  selected = null;
  results = [];
  syncContinue();
  showHint("Type a name or handle to search…");
  if (searchInput.value) search(searchInput.value);
  onboarding.showModal();
}

onboardingForm.addEventListener("submit", (event) => {
  if (event.submitter?.value !== "continue") {
    me = { ...ANONYMOUS };
  } else {
    // Enter with a list showing and nothing picked takes the top result.
    const choice = selected || (typedHandle() ? null : results[0]);
    me = choice || cleanProfile({ handle: typedHandle() || ANONYMOUS.handle, name: typedHandle() });
    // Typeahead results carry no follower count; fetch it so reach is real.
    if (!me.followersKnown && me.handle !== ANONYMOUS.handle) {
      const handle = me.handle;
      fetchProfile(handle).then((profile) => {
        if (!profile || me?.handle !== handle) return;
        me = profile;
        save(STORAGE_PROFILE, me);
        renderMe();
      }).catch(() => {});
    }
  }
  save(STORAGE_PROFILE, me);
  renderMe();
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

let attached = [];

function pollOptions() {
  return pollEditor.hidden ? [] : pollInputs.map((input) => input.value.trim()).filter(Boolean);
}

function syncComposer() {
  const length = textarea.value.length;
  counter.textContent = `${length} / ${X_LIMIT}`;
  counter.hidden = length === 0;
  counter.classList.toggle("is-over", length > X_LIMIT);
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
  const author = me || ANONYMOUS;
  const poll = pollOptions();

  const post = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    name: author.name,
    handle: author.handle,
    avatarUrl: author.avatarUrl,
    verified: author.verified,
    followers: author.followers,
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

renderMe();
renderFeed();
renderLeaderboard();
syncComposer();
if (!me) openOnboarding();
