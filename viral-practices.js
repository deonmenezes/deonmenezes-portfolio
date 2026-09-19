/* Best practices shown in the /viral platform switcher.
   Every item says who is behind it, because creator advice is mostly folklore:
     official   the platform itself said it
     reported   credible reporting or a leak, not confirmed by the platform
     unconfirmed  widely believed by creators; the platform has not said it */

export const PRACTICES = {
  x: {
    intro: "X is the only one of the four that published its ranking code and weights, so these come straight from the source.",
    items: [
      { title: "Make it worth passing on", body: "Copying a post's link to share it elsewhere is weighted 20, the largest positive weight X publishes. A DM share is 5. Write the thing people drop into a group chat.", basis: "official", source: { label: "X For You ranker weights", url: "https://github.com/xai-org/x-algorithm/blob/main/home-mixer/params/param.rs" } },
      { title: "Earn replies and quotes, not likes", body: "A reply and a quote are each weighted 5, a repost 1, and a like 0.5. Write something people have to answer or add to.", basis: "official", source: { label: "X For You ranker weights", url: "https://github.com/xai-org/x-algorithm/blob/main/home-mixer/params/param.rs" } },
      { title: "Talk with your mutuals", body: "A reply between accounts that follow each other gets a further 15 on top of the 5. Conversations inside your own circle carry the furthest.", basis: "official", source: { label: "X For You ranker weights", url: "https://github.com/xai-org/x-algorithm/blob/main/home-mixer/params/param.rs" } },
      { title: "Give strangers a reason to follow", body: "A follow from the post is weighted 4. A profile click, once weighted 12, is now weighted 0, so curiosity alone no longer counts.", basis: "official", source: { label: "X For You ranker weights", url: "https://github.com/xai-org/x-algorithm/blob/main/home-mixer/params/param.rs" } },
      { title: "Don't annoy people", body: "\"Not interested\" is weighted -43.2, a mute -58.8, a block -31.2, and a report -234. X notes these multiply predicted probabilities, not counts, so one angry reader does not erase hundreds of likes.", basis: "official", source: { label: "X For You ranker weights", url: "https://github.com/xai-org/x-algorithm/blob/main/home-mixer/params/param.rs" } },
    ],
  },

  instagram: {
    intro: "Instagram publishes no numbers. Adam Mosseri and the Creators account have named the signals that matter most.",
    items: [
      { title: "Watch time comes first", body: "Instagram names watch time, likes per reach, and sends per reach as its three biggest ranking signals. Cut anything that doesn't earn its seconds.", basis: "official", source: { label: "Instagram ranking explained", url: "https://about.instagram.com/blog/announcements/instagram-ranking-explained" } },
      { title: "Make it worth sending", body: "Sends matter most for reaching people who don't follow you, likes for people who do. Make something a person would DM to one friend.", basis: "official", source: { label: "Instagram ranking explained", url: "https://about.instagram.com/blog/announcements/instagram-ranking-explained" } },
      { title: "Post original work", body: "Reposted and watermarked content is demoted, and accounts that mostly aggregate lose recommendations entirely. Add something that is yours.", basis: "official", source: { label: "TechCrunch on Instagram's originality update", url: "https://techcrunch.com/2024/04/30/instagram-is-updating-its-ranking-systems-to-surface-more-content-from-smaller-original-creators/" } },
      { title: "Win the first seconds", body: "Mosseri has told creators repeatedly that the opening decides whether a Reel is watched or skipped. Much video is watched muted, so lead visually.", basis: "reported", source: { label: "Instagram ranking explained", url: "https://about.instagram.com/blog/announcements/instagram-ranking-explained" } },
      { title: "Test with Trial Reels", body: "Trial Reels show a new idea to non-followers first, so you can see how it performs before your audience does.", basis: "official", source: { label: "Instagram: Trial Reels", url: "https://creators.instagram.com/blog/instagram-trial-reels" } },
      { title: "Hashtags won't carry you", body: "Mosseri has said hashtags help categorise posts for search but are not a way to get more reach.", basis: "reported", source: { label: "Instagram ranking explained", url: "https://about.instagram.com/blog/announcements/instagram-ranking-explained" } },
      { title: "Riding the moment", body: "Creators swear by tying a post to what everyone is watching right now. Instagram has not named timeliness as a ranking signal, so treat it as a way to earn watch time and sends, not a rule.", basis: "unconfirmed" },
    ],
  },

  tiktok: {
    intro: "TikTok publishes no numbers. Its own explainer and a leaked internal document describe what the For You feed rewards.",
    items: [
      { title: "Get finished, get rewatched", body: "TikTok says watching a video to the end is a strong signal, stronger than where the viewer lives. Completions and replays shape the feed.", basis: "official", source: { label: "How TikTok recommends videos", url: "https://newsroom.tiktok.com/en-us/how-tiktok-recommends-videos-for-you" } },
      { title: "Followers don't gate reach", body: "TikTok says neither follower count nor past hits are direct factors. A first post from a new account can reach millions.", basis: "official", source: { label: "How TikTok recommends videos", url: "https://newsroom.tiktok.com/en-us/how-tiktok-recommends-videos-for-you" } },
      { title: "Make it your own", body: "Reposted content with no creative edits, and videos carrying another app's watermark, are ineligible for the For You feed.", basis: "official", source: { label: "For You feed eligibility standards", url: "https://www.tiktok.com/community-guidelines/en/fyf-standards/" } },
      { title: "Write for search", body: "TikTok tells creators to put the words people search for naturally into captions and on-screen text.", basis: "official", source: { label: "Creator Search Insights", url: "https://www.tiktok.com/creator-academy/article/Creator-Search-Insights" } },
      { title: "Likes, comments, playtime", body: "A leaked 2021 document scored videos on predicted likes, comments, playtime, and whether it gets played at all. TikTok has not confirmed it still applies.", basis: "reported", source: { label: "NYT: How TikTok Reads Your Mind", url: "https://www.nytimes.com/2021/12/05/business/media/tiktok-algorithm.html" } },
      { title: "Trends and sounds", body: "Captions, sounds, and hashtags are listed as video information TikTok reads. Creators treat a rising sound as a boost; TikTok has not said how much it counts.", basis: "unconfirmed" },
    ],
  },

  youtube: {
    intro: "YouTube publishes no numbers, and says the importance of each signal changes with context. Its Help pages say what it looks for.",
    items: [
      { title: "Satisfaction, not just watch time", body: "YouTube surveys viewers about videos they watched to learn what they valued, so that it isn't optimising for watch time alone.", basis: "official", source: { label: "YouTube Help: recommendations", url: "https://support.google.com/youtube/answer/16089387" } },
      { title: "Earn the click honestly", body: "A title and thumbnail have to win the click, then the video has to deliver. Clickbait that disappoints loses on satisfaction.", basis: "reported", source: { label: "YouTube Help: recommendations", url: "https://support.google.com/youtube/answer/16089387" } },
      { title: "Be findable", body: "Search prioritises relevance, engagement, and quality, matching your title, description, and content to what was typed.", basis: "official", source: { label: "YouTube Help: search", url: "https://support.google.com/youtube/answer/9962575" } },
      { title: "Bring viewers back", body: "Watch history and subscriptions are named as primary signals. A viewer who returns tells YouTube more than one who clicked once.", basis: "official", source: { label: "YouTube Help: recommendations", url: "https://support.google.com/youtube/answer/16089387" } },
      { title: "Respect the \"not interested\"", body: "Likes, dislikes, \"not interested\", and \"don't recommend channel\" may be used to tune recommendations.", basis: "official", source: { label: "YouTube Help: manage recommendations", url: "https://support.google.com/youtube/answer/6342839" } },
      { title: "Shorts: stop the swipe", body: "YouTube Studio reports \"viewed vs swiped away\" for Shorts. The first screen decides which one you get.", basis: "official", source: { label: "YouTube Help: recommendations", url: "https://support.google.com/youtube/answer/16089387" } },
      { title: "Length and schedule", body: "YouTube's Help pages don't name upload frequency or video length as ranking factors. Make it as long as it stays good.", basis: "unconfirmed" },
    ],
  },
};

export const BASIS_LABELS = {
  official: "The platform said this",
  reported: "Reported, not confirmed",
  unconfirmed: "Creator belief, unconfirmed",
};
