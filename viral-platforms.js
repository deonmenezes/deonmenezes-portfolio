/* Platform definitions for /viral, shared by the page and the API so the two
   can never disagree about what is being scored.

   Honesty note that the page repeats: X published its ranker's weights, so the X
   numbers are real. Instagram, TikTok, and YouTube publish no numbers. Their
   weights here are estimates of relative importance, ordered by what each
   company has said publicly matters most.

   action fields
     weight   relative importance in the score (negative = hurts)
     ceiling  realistic per-view rate if every viewer would do it. Jev answers
              "would a typical viewer do this?", not "what share of viewers
              do", and ceiling * p^2 turns the first into the second.
     ask      the yes/no question put to Jev
     tip      advice shown when the signal is weak (or, for negatives, strong) */

const emotion = (noun) => ({
  type: "choice",
  instructions: `What is the main feeling this ${noun} creates in a viewer?`,
  criteria: {
    awe: "Surprise, amazement",
    humor: "It is funny",
    anger: "Outrage or disagreement",
    useful: "Practical value, a lesson, a tip",
    relatable: "A shared experience",
    nothing: "No real reaction",
  },
});

const hook = (instructions) => ({
  type: "score",
  instructions,
  criteria: ["No hook, easy to scroll past", "Mild curiosity", "Strong hook", "Impossible to scroll past"],
});

export const PLATFORMS = {
  x: {
    name: "X",
    noun: "post",
    weightsArePublished: true,
    weightsSource: { label: "X's open-source For You ranker", url: "https://github.com/xai-org/x-algorithm/blob/main/home-mixer/params/param.rs" },
    // Words the real app uses for the same places.
    chrome: { home: "Home", explore: "Explore", virality: "Virality", how: "How it works", profile: "Profile", post: "Post", foryou: "For you", following: "Following", handlePrefix: "@", showsName: true },
    composer: { placeholder: "Will you go viral?", button: "Simulate" },
    // Weights from home-mixer/params/param.rs in xai-org/x-algorithm, the current For You
    // ranker. Jev answers ten questions at most, so these are the eight signals that can
    // move a text post furthest. Left out: DM share (5), share (2), click (0.4), open link
    // (0.2), dwell (0.05), and profile click, which is now weighted 0.
    actions: {
      like: { weight: 0.5, ceiling: 0.06, label: "Like", ask: "Would a typical X (Twitter) user scrolling their feed tap like on this post?" },
      repost: { weight: 1, ceiling: 0.015, label: "Repost", ask: "Would a typical X user repost this post to their own followers?" },
      reply: { weight: 5, ceiling: 0.012, label: "Reply", ask: "Would a typical X user feel compelled to reply to this post?", tip: { below: 0.35, text: "Give people something to answer. A reply is weighted 5, ten times a like, and 20 when you and the replier follow each other." } },
      quote: { weight: 5, ceiling: 0.003, label: "Quote", ask: "Would a typical X user quote this post to add their own take on it?" },
      shareLink: { weight: 20, ceiling: 0.004, label: "Copies the link to share", ask: "Would a typical X user copy the link to this post to share it somewhere else, like a group chat or another app?", tip: { below: 0.25, text: "Nobody would carry this off the timeline. Copying a post's link is the heaviest positive signal X publishes, at 20, so make something worth passing on." } },
      follow: { weight: 4, ceiling: 0.003, label: "Follows you", ask: "Would a typical X user who doesn't follow the author follow them because of this post?", tip: { below: 0.2, text: "Nothing here makes a stranger want more from you. A follow is weighted 4, so show what you are about." } },
      negative: { weight: -43.2, ceiling: 0.004, label: "Not interested / mute / block", ask: 'Would a typical X user tap "not interested", mute, or block because of this post?', tip: { above: 0.3, text: "A lot of readers would tap \"not interested\". That is weighted -43.2, and a mute -58.8." } },
      report: { weight: -234, ceiling: 0.0006, label: "Report", ask: "Does this post break platform rules such that users would report it (spam, harassment, hate, scams)?", tip: { above: 0.3, text: "This reads like spam or a rule break. A report carries X's heaviest weight, -234." } },
    },
    hook: hook("How strong is the opening hook of this post?"),
    emotion: emotion("post"),
    hookTip: "The first line doesn't stop the scroll. Lead with the most surprising or specific thing you have.",
    // Calibrated on 9 labelled posts through live Jev with these weights: throwaway posts
    // scored 0.000-0.002, a mild hot take 0.018, a solid thread opener 0.033, the best 0.068.
    scoreFor100: 0.075,
    reach: { base: 0.1, boost: 4, discovery: 200_000 },
    metrics: [
      { key: "replies", label: "Replies", from: "reply", icon: "comment" },
      { key: "reposts", label: "Reposts", from: "repost", icon: "repost", tone: "green" },
      { key: "likes", label: "Likes", from: "like", icon: "heart", tone: "pink" },
      { key: "views", label: "Views", from: "views", icon: "bars" },
      { key: "bookmarks", label: "Bookmarks", from: "like", scale: 0.25, icon: "bookmark" },
    ],
  },

  instagram: {
    name: "Instagram",
    noun: "post",
    weightsArePublished: false,
    chrome: { home: "Home", explore: "Explore", virality: "Reels", how: "Insights", profile: "Profile", post: "Create", foryou: "For you", following: "Following", handlePrefix: "", showsName: false },
    composer: {
      placeholder: "Write a caption…",
      button: "Simulate",
      extra: { label: "Hook", placeholder: "What happens in the first 3 seconds? (optional)" },
      formats: ["Reel", "Carousel", "Photo"],
    },
    actions: {
      watch: { weight: 10, ceiling: 0.5, label: "Watches to the end", ask: "Would a typical Instagram user watch or read this all the way through instead of swiping past?", tip: { below: 0.45, text: "Watch time is the signal Instagram names first. Cut anything that doesn't earn its seconds." } },
      send: { weight: 10, ceiling: 0.012, label: "Sends to a friend", ask: "Would a typical Instagram user send this to a friend in a DM?", tip: { below: 0.3, text: "Sends are what carry a post to people who don't follow you. Make something a person would forward to one specific friend." } },
      like: { weight: 4, ceiling: 0.06, label: "Like", ask: "Would a typical Instagram user double-tap to like this?" },
      save: { weight: 5, ceiling: 0.012, label: "Save", ask: "Would a typical Instagram user save this to come back to later?" },
      comment: { weight: 4, ceiling: 0.005, label: "Comment", ask: "Would a typical Instagram user leave a comment on this?" },
      original: { weight: 6, ceiling: 0.08, label: "Reads as original", ask: "Does this read as the creator's own original content, rather than a repost, an aggregation, or a copy of a trend with nothing added?", tip: { below: 0.5, text: "This reads like a repost. Instagram removes aggregated and reposted content from recommendations, so add something that is yours." } },
      timely: { weight: 4, ceiling: 0.08, label: "Taps into the moment", ask: "Does this tap into something people are talking about or care about right now?", tip: { below: 0.3, text: "Nothing ties this to what people are paying attention to right now. A timely angle gives it a reason to travel today." } },
      negative: { weight: -60, ceiling: 0.004, label: "Not interested", ask: 'Would a typical Instagram user tap "not interested" or hide this?', tip: { above: 0.3, text: "A lot of viewers would hide this. That actively tells Instagram to stop showing it." } },
    },
    hook: hook("How strong is the opening, the first three seconds or the first line, at stopping someone mid-scroll?"),
    emotion: emotion("post"),
    hookTip: "The opening doesn't stop the scroll. On Reels most people decide in the first three seconds.",
    // Calibrated on 8 labelled posts through live Jev: flops reached 6-10% of a perfect post,
    // mids 17-26%, bangers 29-41%. Everything earns a baseline, so the scale starts above zero.
    scoreRange: { floor: 0.08, top: 0.42 },
    reach: { base: 0.12, boost: 3, discovery: 350_000 },
    metrics: [
      { key: "likes", label: "Likes", from: "like", icon: "heart", tone: "pink" },
      { key: "comments", label: "Comments", from: "comment", icon: "comment" },
      { key: "sends", label: "Sends", from: "send", icon: "send" },
      { key: "saves", label: "Saves", from: "save", icon: "bookmark" },
      { key: "views", label: "Views", from: "views", icon: "play" },
    ],
  },

  tiktok: {
    name: "TikTok",
    noun: "video",
    weightsArePublished: false,
    chrome: { home: "For You", explore: "Explore", virality: "Trending", how: "Insights", profile: "Profile", post: "Upload", foryou: "For You", following: "Following", handlePrefix: "", showsName: false },
    composer: {
      placeholder: "Describe your video…",
      button: "Simulate",
      extra: { label: "Hook", placeholder: "What happens or is said in the first 2 seconds? (optional)" },
      formats: ["Video", "Photo carousel"],
    },
    actions: {
      finish: { weight: 10, ceiling: 0.45, label: "Watches to the end", ask: "Would a typical TikTok user watch this video to the very end instead of swiping away?", tip: { below: 0.45, text: "Finishing the video is the strongest signal TikTok describes. Tighten it until nothing can be skipped." } },
      rewatch: { weight: 8, ceiling: 0.1, label: "Watches it again", ask: "Would a typical TikTok user let this loop and watch it a second time?", tip: { below: 0.2, text: "Nothing here rewards a second watch. A loop, a detail to catch, or a fast payoff earns rewatches." } },
      share: { weight: 6, ceiling: 0.012, label: "Share", ask: "Would a typical TikTok user share this with someone?" },
      save: { weight: 5, ceiling: 0.015, label: "Favorite", ask: "Would a typical TikTok user add this to their favorites?" },
      comment: { weight: 4, ceiling: 0.006, label: "Comment", ask: "Would a typical TikTok user comment on this?", tip: { below: 0.3, text: "Give people a reason to comment: a question, a take to argue with, or something to tag a friend in." } },
      like: { weight: 3, ceiling: 0.09, label: "Like", ask: "Would a typical TikTok user like this video?" },
      trend: { weight: 3, ceiling: 0.08, label: "Rides a trend or search", ask: "Does this ride a current trend, sound, or something people are searching for on TikTok right now?" },
      negative: { weight: -60, ceiling: 0.004, label: "Not interested", ask: 'Would a typical TikTok user long-press and tap "not interested" on this?', tip: { above: 0.3, text: "A lot of viewers would tap \"not interested\", which tells TikTok to stop showing it to people like them." } },
    },
    hook: hook("How strong is the first two seconds of this video at stopping someone from swiping?"),
    emotion: emotion("video"),
    hookTip: "The first two seconds don't stop the swipe. Open on the payoff, the conflict, or the question.",
    // Calibrated on 8 labelled posts through live Jev: flops reached 2-5% of a perfect post,
    // mids 12-17%, solids 17-25%, bangers 30-35%.
    scoreRange: { floor: 0.04, top: 0.42 },
    reach: { base: 0.04, boost: 2, discovery: 700_000 },
    metrics: [
      { key: "likes", label: "Likes", from: "like", icon: "heart", tone: "pink" },
      { key: "comments", label: "Comments", from: "comment", icon: "comment" },
      { key: "saves", label: "Favorites", from: "save", icon: "bookmark", tone: "amber" },
      { key: "shares", label: "Shares", from: "share", icon: "share" },
      { key: "views", label: "Views", from: "views", icon: "play" },
    ],
  },

  youtube: {
    name: "YouTube",
    noun: "video",
    weightsArePublished: false,
    chrome: { home: "Home", explore: "Shorts", virality: "Trending", how: "Insights", profile: "You", post: "Create", foryou: "All", following: "Subscriptions", handlePrefix: "@", showsName: true },
    composer: {
      placeholder: "Your video title…",
      button: "Simulate",
      extra: { label: "About", placeholder: "What is the video about, and what's on the thumbnail? (optional)" },
      formats: ["Video", "Short"],
    },
    actions: {
      click: { weight: 9, ceiling: 0.08, label: "Clicks the title", ask: "Seeing this title and thumbnail among other recommended videos, would a typical YouTube viewer click it?", tip: { below: 0.4, text: "The title doesn't earn the click. Promise one specific thing and make the viewer curious how it ends." } },
      watch: { weight: 10, ceiling: 0.4, label: "Watches most of it", ask: "Would a typical viewer who clicked watch most of this video rather than leaving early?", tip: { below: 0.45, text: "People would leave early. YouTube follows what viewers watch, so deliver on the title fast and keep delivering." } },
      satisfied: { weight: 9, ceiling: 0.3, label: "Feels it was worth it", ask: "After watching, would a typical viewer feel this was worth their time and that the title was honest?", tip: { below: 0.45, text: "Viewers wouldn't feel it was worth it. YouTube surveys for satisfaction, and clickbait that disappoints gets buried." } },
      like: { weight: 2, ceiling: 0.04, label: "Like", ask: "Would a typical YouTube viewer like this video?" },
      comment: { weight: 2, ceiling: 0.004, label: "Comment", ask: "Would a typical YouTube viewer leave a comment?" },
      share: { weight: 3, ceiling: 0.004, label: "Share", ask: "Would a typical YouTube viewer share this video with someone?" },
      subscribe: { weight: 5, ceiling: 0.004, label: "Subscribes", ask: "Would a typical viewer who isn't subscribed subscribe to the channel after this video?" },
      negative: { weight: -60, ceiling: 0.004, label: "Not interested", ask: 'Would a typical YouTube viewer choose "not interested" or "don\'t recommend channel" for this?', tip: { above: 0.3, text: "Many viewers would pick \"not interested\", one of the few explicit signals YouTube says it listens to." } },
    },
    hook: hook("How strong is this title and opening at making someone choose this video over the ones around it?"),
    emotion: emotion("video"),
    hookTip: "The title and opening don't make a case for this video over the ones next to it.",
    // Calibrated on 8 labelled posts through live Jev: bare titles reached 16-25% of a perfect
    // video, everyday vlogs 34-37%, clear tutorials and strong hooks 40-51%.
    scoreRange: { floor: 0.2, top: 0.62 },
    reach: { base: 0.06, boost: 3, discovery: 450_000 },
    metrics: [
      { key: "views", label: "Views", from: "views", icon: "play" },
      { key: "likes", label: "Likes", from: "like", icon: "thumb" },
      { key: "comments", label: "Comments", from: "comment", icon: "comment" },
      { key: "shares", label: "Shares", from: "share", icon: "share" },
      { key: "subscribers", label: "New subscribers", from: "subscribe", icon: "userplus", tone: "red" },
    ],
  },
};

export const PLATFORM_IDS = Object.keys(PLATFORMS);
export const DEFAULT_PLATFORM = "x";

/** The questions sent to Jev for a platform: one per action, plus hook and emotion. */
export function questionsFor(platformId) {
  const platform = PLATFORMS[platformId];
  const questions = {};
  for (const [action, { ask }] of Object.entries(platform.actions)) questions[action] = { type: "boolean", instructions: ask };
  questions.hook = platform.hook;
  questions.emotion = platform.emotion;
  return questions;
}
