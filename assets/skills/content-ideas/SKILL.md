---
name: content-ideas
description: Answer "what should I post / make today" for Deon (@deon_tech on Instagram, about 51k followers; YouTube "Deon Does Research") with a short ranked list of ideas grounded in what is trending right now and in what actually worked on his own account, each with a spoken hook, the format, what he films, and the comment keyword plus what the InstantDM would send. Use whenever Deon says "what video should I make today", "what should I post", "what's trending", "what is trending today", "is this on trend", "is it according to the viral trend", "give me reel ideas", "ideas for today", "what worked", "how are my reels doing", "what did well this week", "analyze my last videos", "what should my next reel be", or sends a topic and asks whether it is worth a reel. Not for editing (video-edit), writing a long-form script (youtube-script), posting (post-video), building the automation (reel-automation) or the Will It Go Viral simulator (viral-project).
---

# content-ideas

Deon asks this almost daily (2026-10-05 "what video should i make today on instagram", 2026-10-06 "analyze my last few
videos and understand what video should i make today about and also see what is trending today what worked etc.").
The answer is five ideas at most, each tied to a dated trend and to something his own reels already proved.
Read-only: this skill never posts, schedules, arms or changes anything.

```bash
S=~/.claude/skills/content-ideas/scripts/gather.py
python -I $S                                  # everything, compact text, about 35 s, nothing written anywhere
python -I $S --only my_reels,my_youtube       # his numbers only (a few seconds)
python -I $S --only hn,github,ai_news,reddit,producthunt,yt_today,tiktok,gtrends_us
python -I $S --list | --json                  # source names | raw items
```

Run from a neutral folder (`cd /tmp`). It imports the collectors from `<your-folder>/trending/server.py` and calls them directly,
each with a 75 s timeout, so the dashboard on localhost:8780 does not have to be running (it usually is not; check with
`curl -s -m 3 127.0.0.1:8780/api/data`, and if it answers you may read that JSON instead). Do not start the server and
do not kill anything. The script never touches `<your-folder>/trending/data`, so it has no 24 h view gain: compare reels by
age instead, or say "no gain figure".

## Which source tells you what (checked 2026-10-08)

| need | source | notes |
| --- | --- | --- |
| His reel views, reach, saves, shares, likes, comments | `my_reels` (Graph API, token in `~/.config/meta/credentials.env`; check its data-access expiry with debug_token) | real numbers, live. The only per-reel source to quote. |
| Same plus avg watch time, retention | Metricool tools (brand YOUR_METRICOOL_BRAND_ID): `getAnalyticsDataByMetrics`, reels fields IGRE02 date (UTC), IGRE03 text, IGRE23 views, IGRE11 reach, IGRE24 avg watch time | lags the Graph API (741k vs 818k on the same reel). Retention came back null. Use for watch time and for `getBestTimeToPostByNetwork` (instagram, Asia/Calcutta). |
| His YouTube views | `my_youtube` (channel RSS) | Metricool has almost nothing for YouTube or TikTok. |
| What launched today | `hn`, `ai_news`, `reddit`, `github`, `producthunt` | points and comments are the evidence. |
| What people watch | `yt_today`, `yt_week` (views, age), `tiktok` (plays, age) | general trending lists (`yt_trend_*`, `x_*`, `top_news`) are mostly film, music and politics: ignore unless a story is AI. |
| Search interest | `gtrends_us`, `gtrends_in` | only an AI or tech row counts. |
| Instagram hashtag top posts | `instagram` | carousels and photos only, never reels, no views. Weak. |

Needs Deon or a logged-in desktop: X likes and views (Claude-in-Chrome on this PC, logged in), InstantDM comment
and DM counts (`reel.py diag`, needs Chrome logged in to app.instantdm.com), YouTube Studio retention, TikTok numbers.

## His account, what the numbers said on 2026-10-08

Recompute from `my_reels`; do not reuse these. 30 reels, 2026-09-20 to 10-08: median 8.4k views, total 1.42M, and six
reels over 50k made 84% of it. The six: Meta Muse reel 818k (2.5k comments, 37.8k shares, posted 2026-10-07),
GTA 5 free-link reel 106k (10.9k comments), hackathon roadmap 87k, "AI roadmap" with the OpenAI/n8n/X CEOs 77k,
Claude x YouTube 56k, the convocation handshake 55k. 16 of 30 stayed under 10k: plain commentary with no named thing to
get (Codex reset 2.0k, XR 6.7k, Trump "SI" 4.9k), personal or motivation clips, small-tool explainers.
YouTube is far weaker (15 latest videos: 2 to 576 views each, 2026-10-08 RSS). Do not promise YouTube numbers.

What my reading of that says (n is small, say so): a big recognisable name or launch (Meta, GTA, OpenAI, Claude) plus a
free thing to get worked. A comment word alone did not: "founder", "inference", "link" and most "virality" reels sat at
4k to 14k. Check the new data against this before ranking.

## His rules (apply to every idea)

| rule | his words / date |
| --- | --- |
| Every reel ends "comment <word>" and the DM delivers a real, live link | `reel-automation`; DM is link-first, 60 words max, no follow request (2026-10-04, 10-08) |
| Graphics show the product doing the thing, not a command box and a definition | "actual animations" (2026-10-07) |
| Split screen, not overlay, each term explained | 2026-10-03 |
| Talking-head reels: voice only, no music | removed twice (2026-09-30, 10-02) |
| Say only what the source says. Repo READMEs beat his script; panels were softened to the README (Instagram and YouTube agent repos, Muse) | 2026-10-03, 10-07 |
| Never invent a number about him; use only figures he has confirmed | 2026-10-02 |
| Long-form scripts must sound human, not generated | "our script sounds so generated and sloppy" (2026-10-04) |
| Short, easy-to-read text; no big paragraphs | "people will find it boring to read" (2026-10-07) |
| No em dashes in text we write; no `@handle` of X accounts in IG captions | 2026-10-08, 10-06 |
| Plain news-source screenshots for "show the sources" edits | 2026-10-04 |

## Steps

1. **Gather.** Run the script. Read `my_reels` first, newest to oldest, and mark which formats gained: topic, whether
   it had a named launch, the keyword, the format (talking head, split screen, carousel). A reel under 24 h old is not
   a verdict yet.
2. **Find the candidates.** Pull AI and tech items from the news sources that clear a bar: HN 300+ points, a GitHub
   repo with big stars today, a launch on two or more sources, a YouTube video over 100k views in under 24 h, a Google
   Trends AI row. Prefer something he can hand over (a repo, a free tool, a guide, a page on deonmenezes.com).
   Also check his own unfinished work: finished edits not yet posted (see the memory index) are ready ideas.
3. **Is it already covered?** Compare with his last 30 reels and his last YouTube videos. If he posted the topic in
   the last 5 days, either skip it or propose the angle he has not done.
4. **Rank** by: trend strength (dated), fit with what worked, whether there is something to deliver, and how fast he
   can ship (footage he already has beats a new shoot). Timing: Metricool's best hours were weekdays about 10:00 IST,
   second peak 18:00 (2026-10-08); weekends are about half as strong.
5. **Fact-check what he would say.** For each idea add a note: what the primary source actually says, and any claim in
   the obvious script that goes further than it (the Muse, Instagram-agent and YouTube-agent reels all had one).
   Open the primary link (repo README, vendor post) before listing a claim as fact.
6. **Answer** in the format below. End with one line asking which to start, then hand off.

## Output format

At most five ideas, ranked, with a one-line "pick this first because". For each:

```
1. <working title>
   Trend:   <what, numbers, source, date/time>   e.g. "HN front page 863 pts / 417 comments (hn, 2026-10-07)"
   Proof:   <his own reel that shows this works or that it is a gap; views from my_reels with date>
   Hook:    "<the first spoken line, one breath, names the thing>"
   Format:  talking-head reel | split-screen explainer | carousel | long-form
   He films/supplies: <what he records; what we make; footage already in Drive "Unedited videos" if any>
   Comment: "<word>" -> DM sends <the one live link, in plain words>
   Fact note: <what to verify or soften>
   Next:    <skill>
```

Which skill carries it next: reel from his footage `video-edit` (or `reference-reel-edit` when he gives a reference),
swipe post of other people's clips `carousel`, long-form `youtube-script` then the `youtube-video` skill, a page for the
link `resources-page`, the keyword and DM `reel-automation` (arm before he posts), posting `post-video`.

## Honesty rules

- Every trend has a source and a date or time. Anything not re-checked today is marked "not verified today".
- Views, likes and counts come from a source you just ran. No invented numbers, no "going viral" without one. If
  the number is a snapshot (a video's views at fetch time), say "at fetch time".
- Never write that an idea "will" perform. Say what the data suggests and how small the sample is.
- Never print or copy a token, key or password. `credentials.env` is read only by the script.
- Do not send, post, arm, schedule or edit anything from this skill. Hand off and wait for him.

## When a source is down

Say it in one line ("Reddit: HTTP 403, skipped") and carry on with the rest. The script prints `## name FAILED:` for
each. If `my_reels` fails (Graph token expired or offline), use Metricool's reels fields and say they lag; if both fail,
give trend-only ideas and say his numbers were unavailable. If news sources all fail, say the trend side is empty
rather than guessing from memory. If the dashboard answers on 8780 but a source shows an error there, use the script.

## Traps

- `yt_today` pads with off-topic and non-English items, and a reel's `reach` can exceed `views` (Muse: 915k vs 818k).
- The `instagram` hashtag source cannot show reels; do not call a carousel a reel trend.
- Metricool timestamps are UTC; the best-time call returns hours in the brand timezone (Asia/Calcutta).
- A trend that is a news story about him (Nana Patekar, Margaret Hamilton) is not his niche: skip it.
- Muse-style launch reels peak in the first 24 h. If the news is two days old, say so and rank it lower.

```
content-ideas/
  SKILL.md
  scripts/gather.py   read-only snapshot of all sources + his reels + his YouTube channel
```
