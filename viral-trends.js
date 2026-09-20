/* What is being talked about right now, per platform, for /viral.

   Why this exists: in September 2026 the scoring was checked against real posts
   (20 YouTube videos, 54 TikToks, with their real view counts). Judged on the
   text alone, Jev's answers barely tracked which ones did well. The one thing
   that did was whether a post was about something brand new. Jev cannot know
   what is new, so a dated list is handed to it with each post, and shown on the
   page.

   This list goes stale fast. After MAX_AGE_DAYS it is neither sent nor shown,
   and the timeliness signal falls back to Jev's unaided guess. To refresh it,
   replace the topics and move AS_OF. It is mostly Indian-American culture, at
   the owner's request, with a few tech items; the page says so, and a visitor
   in another niche can add their own topics. The culture topics come from dated
   news reports, not view counts: YouTube search would not load for that pass
   and Instagram and TikTok cannot be read from the open web.

   basis: measured  seen in view counts or search results on the date given
          reported  a named trend report or dated news article said so
          inferred  our reading of the above; nobody has measured supply */

export const TRENDS_AS_OF = "2026-09-20";
export const TRENDS_MAX_AGE_DAYS = 30;
export const TRENDS_SCOPE = "Indian-American culture, with some tech and AI";

const CULTURE = [
  "The $100,000 H-1B fee extended for another year (announced 18 Sep 2026)",
  "A judge blocking the F-1 'duration of status' rule (14 Sep 2026)",
  "Green-card numbers resetting on 1 Oct, with EB-2 India unavailable until then",
  "Raja Krishnamoorthi's reply 'I'm staying. So is the curry' (16 Sep 2026)",
  "Kristen Fischer debunking an AI-made 'dirty India' video with 28M views",
  "Mirzapur: The Movie (released 4 Sep 2026) passing $2M in North America",
  "Karan Aujla's US arena tour, announced 16 Sep 2026, ending at Madison Square Garden",
  "US Garba tours before Navratri: Falguni Pathak, Geeta Rabari, Kinjal Dave",
  "Navratri 11 to 19 Oct, Dussehra 20 Oct, Diwali 8 Nov 2026",
  "The stalled India-US trade deal and tariff talks",
  "Vivek Ramaswamy trailing narrowly in the Ohio governor race (poll, Sep 2026)",
];

const TECH = [
  "GPT-6 Astra, OpenAI's new model (released 3 Sep 2026)",
  "Claude Fable 5.1, Anthropic's new model (released 1 Sep 2026)",
  "Jev, a new AI model launched mid-September 2026",
];

export const TRENDS = {
  youtube: {
    topics: [...CULTURE, ...TECH, "Minor League Cricket's US season (17 to 27 Sep 2026)"],
    formats: [
      { text: "Short news explainers on a visa ruling, posted the same week", basis: "inferred" },
      { text: "'Indian in the US' reactions and rebuttals to a viral clip", basis: "inferred" },
      { text: "Immigration-lawyer questions and answers", basis: "inferred" },
      { text: "A short verdict on a brand-new model or tool, within three days of launch", basis: "measured" },
    ],
    gaps: [
      { text: "A plain-English explainer of the F-1 ruling, since the articles contradict each other", basis: "inferred" },
      { text: "What the October green-card reset means for EB-2 India", basis: "inferred" },
      { text: "Founder maths on the $100,000 H-1B fee for San Francisco startups", basis: "inferred" },
      { text: "Minor League Cricket coverage", basis: "inferred" },
    ],
    source: { label: "dated news reports, 4 to 19 Sep 2026; no view counts this time (tech items: YouTube search by views, 19 Sep)", date: "2026-09-20", basis: "reported" },
  },
  instagram: {
    topics: [...CULTURE, ...TECH, "Hometown pride ('Someone's gotta hold it down')"],
    formats: [
      { text: "Talking-head debunk Reels, like Kristen Fischer's", basis: "reported" },
      { text: "Garba outfit and steps Reels", basis: "inferred" },
      { text: "Commentary over a screenshot of a viral X post", basis: "inferred" },
      { text: "Reels of 30 to 60 seconds, which reach furthest", basis: "reported" },
      { text: "Carousels for saves; they now out-reach Reels on accounts over 50K", basis: "reported" },
    ],
    gaps: [
      { text: "A city-by-city US Garba calendar", basis: "inferred" },
      { text: "A ticket guide to Karan Aujla's tour", basis: "inferred" },
      { text: "How to spot AI-made anti-India clips", basis: "inferred" },
      { text: "San Francisco hometown pride from a desi founder's view", basis: "inferred" },
    ],
    source: { label: "dated news reports about Reels, 4 to 19 Sep 2026; Socialinsider Reels study. Instagram itself cannot be read from the open web", date: "2026-09-20", basis: "reported" },
  },
  tiktok: {
    topics: [...CULTURE, ...TECH, "'How I sound when...' lip-syncs", "'2025 me getting a recap from 2026 me'"],
    formats: [
      { text: "'Someone has to hold it down in...' flipped to a niche", basis: "reported" },
      { text: "Desi versions of this month's audios", basis: "inferred" },
      { text: "Videos over a minute, which earn the most views and qualify for Creator Rewards", basis: "reported" },
      { text: "Captions written as the search someone would type", basis: "reported" },
    ],
    gaps: [
      { text: "US theatre reactions to Mirzapur: The Movie", basis: "inferred" },
      { text: "An F-1 student's day under the new forms", basis: "inferred" },
      { text: "Regional Indian food in America: Kerala dishes, chai cafes", basis: "reported" },
    ],
    source: { label: "Ramdam TikTok trend tracker (updated 14 Sep 2026) and dated news reports; desi-specific TikTok data was not available", date: "2026-09-20", basis: "reported" },
  },
};

export function trendsAreFresh(now = Date.now()) {
  const age = (now - Date.parse(`${TRENDS_AS_OF}T00:00:00Z`)) / 86_400_000;
  return age >= -1 && age <= TRENDS_MAX_AGE_DAYS;
}

/** The trends for a platform while they are fresh, else null. X has none: its ranker was not part of this research. */
export function trendsFor(platformId, now = Date.now()) {
  return Object.hasOwn(TRENDS, platformId) && trendsAreFresh(now) ? TRENDS[platformId] : null;
}

export const MAX_OWN_TOPICS = 8;
export const MAX_OWN_TOPIC_CHARS = 80;

/** Topics a visitor added for their own niche: short plain strings, a handful at most. */
export function cleanTopics(list) {
  const seen = new Set();
  const topics = [];
  for (const entry of Array.isArray(list) ? list : []) {
    if (typeof entry !== "string") continue;
    const topic = entry.replace(/[\p{Cc}\s]+/gu, " ").trim().slice(0, MAX_OWN_TOPIC_CHARS).trim();
    if (!topic || seen.has(topic.toLowerCase())) continue;
    seen.add(topic.toLowerCase());
    topics.push(topic);
    if (topics.length === MAX_OWN_TOPICS) break;
  }
  return topics;
}

/** What is added to the state Jev reads, so it can judge timeliness. Empty when stale and the visitor added nothing.
    X gets neither: its ranker was not part of this research. */
export function trendContext(platformId, now = Date.now(), ownTopics = []) {
  if (!Object.hasOwn(TRENDS, platformId)) return {};
  const topics = [...cleanTopics(ownTopics), ...(trendsFor(platformId, now)?.topics || [])];
  return topics.length ? { today: new Date(now).toISOString().slice(0, 10), trendingNow: topics } : {};
}
