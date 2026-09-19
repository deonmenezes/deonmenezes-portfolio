/* What is being talked about right now, per platform, for /viral.

   Why this exists: in September 2026 the scoring was checked against real posts
   (20 YouTube videos, 54 TikToks, with their real view counts). Judged on the
   text alone, Jev's answers barely tracked which ones did well. The one thing
   that did was whether a post was about something brand new. Jev cannot know
   what is new, so a dated list is handed to it with each post, and shown on the
   page.

   This list goes stale fast. After MAX_AGE_DAYS it is neither sent nor shown,
   and the timeliness signal falls back to Jev's unaided guess. To refresh it,
   replace the topics and move AS_OF. Everything here is tech, AI, and creator
   economy, because that is what was researched; the page says so.

   basis: measured  seen in view counts or search results on the date given
          reported  a named trend report said so
          inferred  our reading of the above; nobody has measured supply */

export const TRENDS_AS_OF = "2026-09-19";
export const TRENDS_MAX_AGE_DAYS = 30;
export const TRENDS_SCOPE = "tech, AI, and the creator economy";

const NEWS = [
  "GPT-6 Astra, OpenAI's new model (released 3 Sep 2026)",
  "Claude Fable 5.1, Anthropic's new model (released 1 Sep 2026)",
  "Jev, a new AI model launched mid-September 2026",
  "Running AI locally on Apple's new Macs",
  "Humanoid robots having a 'GPT-3 moment'",
  "Agent harnesses and 'software factory' coding workflows",
  "The backlash against vibe coding and who is hiring",
  "Nvidia acquiring Hugging Face",
];

export const TRENDS = {
  youtube: {
    topics: [...NEWS, "YouTube counting a view from the first frame since 24 Aug 2026", "Omarchy", "Researchers' pause-AI letters"],
    formats: ["A short verdict on a brand-new model or tool, posted within three days of launch", "'I let <new model> play or build <something>'", "Head-to-head builds between two new models"],
    gaps: [
      { text: "Practical builds and cost comparisons with a model that launched this week", basis: "inferred" },
      { text: "Debunking fake demos of new models", basis: "inferred" },
      { text: "What YouTube's new view counting means for sponsorship rates", basis: "inferred" },
      { text: "San Francisco on-the-ground angles on AI news", basis: "inferred" },
    ],
    source: { label: "YouTube search sorted by views, and recent uploads from 13 channels", date: "2026-09-19", basis: "measured" },
  },
  instagram: {
    topics: [...NEWS, "'Potential-maxxing' with hard numbers", "Flop-core", "'10/10 habits'", "Hometown pride ('Someone's gotta hold it down')", "'Rate my startup idea' product demos"],
    formats: ["A relatable-tension opener that resolves into an app reveal", "Serialised comedy", "Reels of 30 to 60 seconds, which reach furthest", "Carousels for saves; they now out-reach Reels on accounts over 50K"],
    gaps: [
      { text: "Niche education carousels written for one specific buyer", basis: "reported" },
      { text: "Founder process stories with real build metrics", basis: "reported" },
      { text: "'AI will replace you' humour", basis: "reported" },
      { text: "San Francisco hometown pride crossed with AI", basis: "inferred" },
    ],
    source: { label: "New Engen and Lightreel trend reports, Socialinsider Reels study", date: "2026-09-12", basis: "reported" },
  },
  tiktok: {
    topics: [...NEWS, "Claude Code plugins and skills", "Token-saving and open-source agent repos on GitHub", "'AI-made scripts, human deadpan'", "'My American Girl Doll' audio", "'How could this day get any better'"],
    formats: ["'N repos, plugins, or tools' lists of 40 to 60 seconds, which get saved more than liked", "Videos over a minute, which earn the most views and qualify for Creator Rewards", "Captions written as the search someone would type"],
    gaps: [
      { text: "Claude Code plugins, skills, and token-saving repos: small accounts are drawing two to three times their followers per post", basis: "measured" },
      { text: "Open-source agent tools explained for non-developers", basis: "inferred" },
    ],
    source: { label: "54 tech videos sampled 26 Aug to 18 Sep 2026, New Engen trend report", date: "2026-09-18", basis: "measured" },
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

/** What is added to the state Jev reads, so it can judge timeliness. Empty when stale. */
export function trendContext(platformId, now = Date.now()) {
  const trends = trendsFor(platformId, now);
  return trends ? { today: new Date(now).toISOString().slice(0, 10), trendingNow: trends.topics } : {};
}
