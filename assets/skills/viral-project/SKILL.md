---
name: viral-project
description: Context and working rules for Deon's "Will It Go Viral?" simulator and the Deon X Jev API (deonmenezes.com/viral, /jev, and <standalone-project>.vercel.app). Load this before touching that project, when asked to continue the viral site, fix a platform layout, change scoring, or redeploy it.
---

# Will It Go Viral? + Deon X Jev

A post simulator for X, Instagram, TikTok, and YouTube. The visitor writes a post, it appears
instantly, and Jev (TypeSafe AI's decision model, via Vercel AI Gateway) predicts each engagement
action. Those predictions are scored with platform weights and played out as animated metrics.
It started as the user's take on willitgoviral.app.

Before editing anything, run `git status --short --branch` in the repo and read the last few
commits. Another Claude session sometimes commits to this repo too.

## Where everything lives

| Thing | Location |
| --- | --- |
| Source of truth (git repo `deonmenezes/deonmenezes-portfolio`) | `<your-home>\dmp` |
| Live on the portfolio | https://deonmenezes.com/viral and https://deonmenezes.com/jev |
| Standalone copy (not a git repo) | `<your-folder>/willitgoviral` → https://<standalone-project>.vercel.app (serves the page at `/` and `/viral`). Since 2026-09-25 it is **https://virelity.com/viral**: the Virelity company site proxies `/viral`, `/viral.css`, `/viral.js`, `/viral-*`, `/api/viral*` to this project via rewrites in its `vercel.json`. Page links stay on `/viral` (sync.py no longer rewrites them to `/`) |
| virelity.com itself | its own Vercel project and repo, clone at `<your-folder>/virelity-site`. Pivoted 2026-09-25 to a clean "AI transformation company" homepage. Deploy with `npx vercel deploy --prod --yes --scope YOUR_VERCEL_SCOPE` from that folder; keep the /viral rewrites FIRST in its rewrites list |
| Tiny local Jev client | `<your-folder>/jev-ai` (`jev.mjs`, the gateway key in your own `.env`) |

Vercel scope is `YOUR_VERCEL_SCOPE`. Projects: `deonmenezes-portfolio` and `<standalone-project>`.

### Files in the repo

- `viral.html`, `viral.css`, `viral.js` - the page. One shared markup, themed by `<html data-platform>`.
- `viral-platforms.js` (repo root) - THE single source of truth per platform: Jev questions, action
  weights and ceilings, metrics, reach, `scoreRange`, composer fields, and `chrome` (each app's own
  words for the rail, tabs, and main button). Imported by both the page and the API.
- `viral-practices.js` - sourced best practices shown in the hover switcher.
- `viral-trends.js` - dated "trending now" topics, formats, and content gaps per platform (not X). Sent to
  Jev inside the state (`today`, `trendingNow`) and shown in a side card. Expires 30 days after
  `TRENDS_AS_OF`; then it is neither sent nor shown. REFRESH IT when working on scoring: redo the research
  (YouTube search sorted by views is the most reliable source), replace the topics, move the date. `sync.py` copies it.
- `viral-checks.js` - pure, sourced draft checks that run as you type (no Jev call). `sync.py` copies it.
- `lib/viral.js` - `POST /api/viral` scoring handler and pure `scorePost`.
- `lib/viral-profile.js` - X profile lookup and people search (FxTwitter).
- `lib/viral-social.js` - Instagram/TikTok/YouTube lookup through Apify, avatar serving.
- `lib/viral-store.js` - MongoDB feed, leaderboard, `savePost`.
- `lib/viral-look.js` - `POST /api/viral/look`: the browser sends up to 6 small JPEG frames (384px; three from
  a video's first 3 seconds) or the attached photos; DeepSeek V4 Flash Vision on GMI describes them; the client
  passes that text to `/api/viral` as `visual`, which reaches Jev as `whatViewersSee` (only when there are
  attachments). Own usage bucket `look:*` with per-network and site-wide daily caps; about $0.0007
  a video. `VIRAL_LOOK=off` disables it. On image requests GMI rejects `thinking: {type: "disabled"}`
  ("Unsupported conversion: cursor_claude"); use `reasoning_effort: "none"`. Never log the request body.
  Sound too: the browser decodes the video's soundtrack (Web Audio), keeps the first 40 s as 16 kHz mono WAV
  (skipped if silent, over 80 MB, over 10 min, or undecodable) and sends it in the same request as `audio`;
  Gemini 3.5 Flash-Lite on GMI (`input_audio` content part, $0.30/M in, $2.50/M out, ~32 tokens a second)
  quotes the opening words and describes delivery and music. Its prompt says "do not guess" because it
  invented background music without that. The two calls run side by side and either may fail alone. Sight plus
  sound is about $0.001 a video. Other Gemini models on GMI often return 429 "overloaded"; 3.5 Flash-Lite has
  been reliable. Standalone wrapper: `api/viral/look.js`.
  To test the sound path in the hidden automation tab: attach a WAV file typed as `video/webm` (frames fail,
  sound goes through). Do not `await audioContext.resume()` there; without a user gesture it never settles.
- `lib/viral-media.js` - `POST /api/viral/media` (actions `grant`, `attach`): since 2026-09-20 a PUBLIC post's video is
  uploaded to Vercel Blob (store `viral-media`, `BLOB_READ_WRITE_TOKEN` on both projects) so others can play it. The
  owner chose this over keeping files local, and over MongoDB (keeps the shared cluster out of it). The
  browser PUTs straight to `https://vercel.com/api/blob/` with a client token. Rules from a security review that
  must survive: `savePost` returns true ONLY when it inserted (a replayed id earns no `mediaKey`); one grant per
  post, for one exact server-chosen path stored as `mediaPath`, with `addRandomSuffix: false` and
  `allowOverwrite: false` inside the token; attach requires that exact URL; eviction happens at attach, never at
  grant; unattached grants are swept after 30 min. Blob's CORS rejects `x-add-random-suffix` and
  `x-allow-overwrite` headers from a browser, so those ride in the token only. It has per-network and site-wide daily caps and a rolling store budget
  (`VIRAL_MEDIA_BUDGET_MB`); set your own numbers. `VIRAL_MEDIA=off` disables it. Other visitors download nothing until they click the
  cover. Add your own moderation before you open uploads to the public.
  Standalone wrapper: `api/viral/media.js`.
- `lib/viral-ideas.js` - `POST /api/viral/ideas`: 3 rewrites + 5 persona reactions from DeepSeek V4.1 Flash
  on GMI Cloud (the user asked for that model and host). Standalone wrapper: `api/viral/ideas.js`.
- `lib/jev.js` - the public Deon X Jev API plus shared `callJev`, `claimRequest`, `reconcileUsage`.
- `api/stats.js` - EVERY endpoint routes through this one function via `?route=` and rewrites in
  `vercel.json`. The project sits at Vercel's 12-function limit. Never add a new file under `api/`.
- Tests: `test/viral*.test.js`, `test/jev.test.js`. Run `npm test` (Node's test runner). All must pass.

## Deploying (pushing does NOT deploy)

```bash
cd <your-home>/dmp && npm test
git add <files> && git commit   # end messages with the Co-Authored-By line
GIT_TERMINAL_PROMPT=0 git -c credential.helper= -c "credential.helper=!gh auth git-credential" push origin main
npx vercel deploy --prod --yes --scope YOUR_VERCEL_SCOPE

cd <your-folder>/willitgoviral && python sync.py            # copies page + lib files from the repo
npx vercel deploy --prod --yes --scope YOUR_VERCEL_SCOPE
```

The plain `git push` hangs on a Git Credential Manager dialog; the form above avoids it.
`sync.py` does not create API wrappers. A new endpoint also needs a one-line file in
`<your-folder>/willitgoviral\api\viral\` (see `feed.js`, `avatar.js`, `search.js`) and an entry in that
folder's `vercel.json`. After deploying, verify on the live URL, not just locally.

If dependencies are missing: `npx --yes pnpm@9 install --frozen-lockfile` (the repo uses pnpm).

## How scoring works

1. `questionsFor(platform)` builds at most 10 Jev questions: one yes/no per action, plus `hook` and
   `emotion`. Jev takes 10 questions maximum per request.
2. Each action contributes `weight * ceiling * p^2`. `ceiling` is a realistic per-view rate, because
   Jev answers "would a typical viewer do this?", not "what share of viewers do".
3. X uses absolute `scoreFor100: 0.35`. The other three use `scoreRange: {floor, top}` as a share of a
   perfect post, fitted on 8 labelled posts each, because every post earns a baseline there.
4. Verdicts: Banger >= 60, Solid >= 35, Mid >= 15, else Flop.

Only X's weights are real. Since 2026-09 they come from `home-mixer/params/param.rs` in
xai-org/x-algorithm, the current For You ranker: fav 0.5, retweet 1, reply 5 (+15 between mutual
follows), quote 5, share via copy-link 20, DM share 5, follow 4, profile click 0, not interested
-43.2, mute -58.8, block -31.2, report -234. The site models eight of them (Jev's 10-question cap)
with `scoreFor100: 0.075`, fitted on 9 labelled posts through live Jev. The 2023 numbers from
twitter/the-algorithm-ml (reply 13.5, profile click 12, -74, -369) are out of date; re-check
param.rs before quoting weights, it is synced from live config. Instagram, TikTok, and YouTube
publish no numbers, so theirs are estimates and the page says so. Keep that honesty. Instagram has
NOT named timeliness as a ranking signal; that practice is tagged "unconfirmed" on purpose even
though the user believes in it.

Jev only reads text. Format, hook, and attachment types are described to it in the state.

## What the September 2026 validation found (read before "tuning" anything)

Scoring was checked against real posts: 20 YouTube videos (title, subscribers, views) and 54 TikToks
(per-view likes, favorites, shares, comments; 14 with follower counts). Instagram hides views from the
open web, so it has no real check.
- On text alone Jev's answers did NOT track real results (YouTube rank correlation -0.18; TikTok per-action
  0.03 to 0.26). Changing weights cannot fix that. Topic timing was what mattered.
- With the trend list and a strict timeliness question ("specifically about one of the topics in
  trendingNow, or another named event... a general subject does not count"), YouTube reached 0.74:
  7 of 8 breakouts score Banger, 0 of 12 others. A lenient wording saturated at 0.8+ for everything.
  Caveat: the list came from the same month's videos, so this is partly circular.
- TikTok captions still do not predict breakouts (-0.15). The page says so in "How it works"
  (`check` on each platform in viral-platforms.js). Keep that honesty.
- Per-view ceilings for TikTok are least-squares fits so Jev's typical p gives real average rates.
  Instagram's are matched to published benchmark averages. "Not interested" ceilings were raised to
  0.02 so a post most people would hide actually sinks.
- Reach uses `baseCurve` (share of followers falls with size) on Instagram and TikTok, and
  `boostPower` / `discoveryPower` per platform.
The calibration scripts lived in the job's tmp dir and are gone. The method: run real posts through
`describePost` + `questionsFor` with the jev.mjs client in <your-folder>/jev-ai, then compare to views per follower.

## Services and secrets

Never print, commit, or paste secret values. All are set as sensitive env vars on BOTH Vercel projects.

- `AI_GATEWAY_API_KEY` - Vercel AI Gateway. Model id `typesafe-ai/jev`, raw endpoint
  `https://ai-gateway.vercel.sh/v4/ai/evaluation-model`. Jev is NOT on GMI Cloud. Set a budget on the account.
- `JEV_HASH_SECRET` - salts IP hashes. Each project has its own.
- `MONGODB_URI` - an Atlas cluster, its own database. The cluster is SHARED with other apps' databases: never touch
  those and never reset that database user's password.
- `APIFY_TOKEN` - Apify FREE plan ($5 a month). Every lookup is cached in Mongo, misses
  included, and capped per network and site-wide each day.
- `GMICLOUD_API_KEY` - GMI Cloud, used only by Ideas (`https://api.gmi-serving.com/v1/chat/completions`,
  model `deepseek-ai/DeepSeek-V4.1-Flash`, $0.30/M in, $1.20/M out, about $0.0004 a call). The request MUST
  send `thinking: {type: "disabled"}`: with thinking on, the model burned all its output tokens reasoning and
  returned an empty answer. GMI reports tokens but no cost, so cost is computed from list price. Ideas meter
  their own bucket (global key `ideas:*`, with per-network and site-wide daily caps)
  so they can never pause Jev. `VIRAL_IDEAS=off` disables them. Keep your local copy of the key in a private `.env` file.
- `DATABASE_URL` - Neon Postgres, used for the Jev usage caps.

Spend guards that must survive any change: per-network and site-wide daily request caps, a
site-wide input-token budget reserved BEFORE each Jev call, and a pause if billed cost passes
a daily limit. Test SQL against the real database, not only stubs; a security review once caught a
skipped advisory lock that stubs hid.

## Behaviours to preserve

- Post first, score second. Simulate puts the post on screen at once, then animates the numbers
  (eased count-up, pulse, floating "+N", verdict pop, toast). A hidden tab or reduced-motion setting
  jumps to the end.
- The score breakdown stays closed behind an "Advanced view" button. Never auto-open it.
- The side card is the "Virality Leaderboard". "Banger" is still a verdict tier.
- Public is the default. A Public/Private switch sits beside Simulate; the server publishes only
  when the request says `publish: true`. Private posts show "Only you" and stay in the browser.
- The public feed accepts ANY handle. The user chose this knowingly, like the original site.
  Posts Jev thinks would be reported are scored but never published.
- The feed is live: 6 second polling while visible, new posts slide in near the top, otherwise a
  "Show N posts" bar. A refresh must not close open breakdowns or touch an animating post.
- Photos never leave the browser (IndexedDB). A public post's video is uploaded (see `lib/viral-media.js`) unless the
  visitor unticks "Let everyone play the video"; private posts upload nothing. Since 2026-09-20, at the owner's
  request, a few small frames do, to be described for Jev, unless the visitor unticks "Analyse the video".
  The page says so beside the checkbox and in the feed footer. Frames are not stored or logged. Only text and
  numbers are stored.
- X is searched by name as you type (FxTwitter typeahead). Instagram, TikTok, and YouTube are
  looked up by exact handle on a "Look up" button, because each lookup is a paid scrape. Their
  avatars are served from `/api/viral/avatar` because those platforms' image URLs expire and refuse
  to hot-link. Each platform keeps its own identity in `localStorage.viral_profiles`.
- Strict CSP: no inline styles or scripts. Use classes, `<meter>`/`<progress>`, and the SVG sprite
  (`<use href="#i-name">`). Render user text with `textContent` only.
- No link to the Jev API page from the viral site.

## What the user wants it to look like

Each platform must look like the real app, not X's layout recoloured. They rejected an original
dark/teal design, and then a colours-only theme. Current native layouts, driven by
`[data-platform]` with `.post-body { display: contents }`:

- X: white timeline, For you / Following / Jev tabs, blue Simulate pill, outline icons.
- Instagram: centred 470px card, ringed avatar, square media, icon row with Save on the right,
  username-led caption, Create button.
- TikTok: dark, tall 9:16 video, creator avatar on a vertical action column, Upload button.
- YouTube: two-column thumbnail grid, title, channel line, action chips, filter chips as tabs.

Deliberate differences: a bolt mark instead of any platform's logo, and a "not affiliated" line.
A page that looks like X, carries its logo, and asks for a handle can be flagged as phishing.
Say so if asked to add logos rather than silently refusing.

## Working with this user

- They write fast and loosely. Read for intent, act, and verify; do not interrogate.
- They want things shipped and proven. Test on the live site and report plainly what worked, what
  did not, and what was not checked.
- Use the browser to look at real references when they point at one. Do not copy another site's code
  or assets; build an original implementation of the same behaviour.
- Browser limits that hold even when asked: do not type, create, reset, or copy passwords, API keys,
  or card numbers through web pages. Setting a secret the user supplied, through the Vercel CLI, is
  fine. Purchases need an explicit yes on the exact total, and the user enters card details.

## Features added from the 2026-09 competitor and open-source review

Draft checks as you type, Compare (two scored posts side by side, own posts and samples only since
it needs the breakdown), Save image (canvas PNG that says "Simulated"), and a "Fix first" label on
the leading tip. Platform logos (Simple Icons, CC0) sit in the rail and switcher; the handle dialog
keeps the bolt on purpose. Attached videos play as reels off X. Then, on "implement everything":
Ideas (rewrites + imagined persona reactions, own posts only, cached on the post so they are paid
for once), hook / risk / followers-vs-discovery stats and a goal picker in the Advanced view (goals
re-read the same Jev answers; they do not change the score), and a "Your history" side card with a
score line, a real-views log per post (`post.actualViews`) and CSV export. Still not built, and why:
best-time hints (no platform confirms them), thumbnail A/B tests (need real accounts and traffic),
re-scoring rewrites automatically (each would be another metered Jev call; "Try this" loads one
into the composer instead).

Testing note: the automation browser tab runs hidden, and Chrome will not decode or seek video in a hidden
tab, so video playback and video frame capture cannot be verified there (photo capture can). If frame
capture fails the post is simply scored on its words.

Testing note: the automation browser shares localStorage with whoever uses that Chrome profile.
Remove only your own test posts from `viral_posts`; never overwrite or delete the whole key.

## Open items

- Still the best improvement available: the user's own past posts with real view counts (20 to 30 per
  platform), especially Instagram, which has no real-data check at all. The history card's CSV export
  collects this.
- The trend list (2026-09-20) is mostly Indian-American culture plus three AI items, at the owner's request, sourced
  from dated news ("reported", not measured). Visitors can add up to 8 topics of their own (`viral_topics` in
  localStorage, sent as `topics`, cleaned by `cleanTopics`); Jev trusts them, and the card says so.
- Creator context (2026-09-20): Jev's state now carries `creator` (followers, `verifiedPublicFigure`, bio, category,
  `trackRecord`), built by `describeCreator` in `lib/viral.js` from the Mongo lookup cache (`cachedCreator` in
  `lib/viral-social.js`), never from the visitor's claims beyond followers and badge. Instagram's track record comes
  free from `latestPosts` in the same scrape; TikTok and YouTube use lifetime averages because each extra video is
  billed. Profiles cached before this are re-fetched once. Measured on live Jev: followers alone barely move the
  score (57 to 61 vs 67 with none); the track record moves it a lot (same post: 18 for a weak small account, 75 for
  a small account with breakouts, 84 for a verified star). `scoreRange` was fitted WITHOUT this context, so
  verdict thresholds have shifted; refit if real labelled data arrives. Reach uses the looked-up follower count
  over the one the visitor sent. The Advanced view shows what Jev was told. When there is a track record, the
  post is ALSO scored with no creator (a second Jev call, reserved up front, run in parallel, allowed to fail):
  the result carries `content: {viralScore, verdict}`, the Advanced view shows "Post on its own" and "What your
  account adds", and a gap of 15+ puts an account tip first (`accountTip`). The owner wanted this: a cold account
  is useful feedback ("needs warm-up"), but the post's own merit must still be visible. The warm-up advice is
  labelled general advice, not platform-confirmed; keep that.
- Authors can delete their posts: `/api/viral` returns a `deleteKey` (HMAC of `delete:<id>`) to the request that
  created a public post; the browser keeps it on its copy; `POST /api/viral/delete` (in `lib/viral-media.js`)
  removes the post and its video. Posts published before 2026-09-20 have no key, so only the local copy goes.
  The Delete button asks twice instead of opening a dialog.
- Public comments (2026-09-20): REAL comments typed by visitors, never AI-generated; the owner was explicit about
  that. `lib/viral-comments.js` (`GET/POST /api/viral/comments`): stored on the post document (newest 100), fetched
  only when opened, any handle accepted, each screened by Jev's report question first (any failure = not stored),
  own bucket `comment:*` with daily caps. Deletable by the writer (key kept in
  `localStorage.viral_comment_keys`) or the post's author (post delete key). `VIRAL_COMMENTS=off` disables
  posting. Page side is its own module, `viral-comments-ui.js`. The UI labels them "not part of the simulation".
- Sharing, menu, icons (`viral-share.js`): share sheet with Copy link, native share, X, WhatsApp, Facebook,
  LinkedIn, Reddit, Telegram, Email; Instagram/TikTok/YouTube have NO web share link, so that button copies the
  link and saves the image instead (say so if asked for "real" IG sharing). Permalink: `/viral?p=<platform>&post=<id>`
  (the feed endpoint takes `post=` to include one older post). Three-dot menu: Share, Copy link, Save image,
  Comments, Hide (local, `viral_hidden`), Report, Delete. Report: `POST /api/viral/delete {action:"report"}`, once
  per network; enough reports hide a post from the feed (`REPORTS_TO_HIDE`). Like and save icons are the visitor's own,
  local (`viral_reactions`), and never change the simulated numbers. New page modules must be added to `sync.py`.
- Videos autoplay muted while on screen on every platform, including other people's shared videos (preload none
  until visible). The owner asked for this knowing it uses Blob bandwidth. A feed refresh reuses any post node
  whose video is playing or whose comment box has focus.
- Live trends (2026-09-20, `lib/viral-live-trends.js`, `GET /api/viral/trends`): topics cached in Mongo
  `live_trends`, shown as "Live today" in the trends card, and sent to Jev between the visitor's own topics and the
  researched list (`trendContext(platform, now, own, live)`). Sources: Google Trending now RSS for US + India (free,
  every 6 h); Instagram via Apify `s-r~instagram-trending-scraper` (about $0.02, daily, labelled EXPERIMENTAL
  because Instagram publishes no trend feed and the actor is unproven; keep that label); TikTok via
  `clockworks~tiktok-trends-scraper` is built (two-step start/collect, because it outlasts a request) but PAUSED:
  it returned zero rows three times, and it refuses a charge ceiling under $0.50. Every source's next run is
  claimed atomically before it runs, so visitors cannot trigger extra paid runs; failures retry after 12 h.
  Scoring only reads the cache. `VIRAL_LIVE_TRENDS=off` stops the paid sources. To re-run a source at once you
  must change its id (its `nextAt` lives in Mongo). The standalone project is at 11 of 12 functions.
- Metric animations: numbers always count up (a hidden tab jumps to the end). Per-icon effects (heart beat, send
  flies, bookmark drops, sparks, a first-like heart burst) are skipped when the device asks for reduced motion,
  unless the visitor turns them on (`viral_motion` = "full", `<html data-motion="full">`). The owner's own Chrome
  reports reduced motion, which is why they never saw the count-up before.
- Instagram's Create button opens a real Create flow (pick or drop files, caption beside the preview, Share). It
  fills the normal composer underneath, so there is still one scoring path.
- `/newsletter` still has the old unstyled header after a site-wide restyle. Also out of scope.
- Sign-in (2026-09-21, `lib/viral-auth.js`, `viral-auth-ui.js`, `viral-signed-in.html/.js`): asked for ONLY when a visitor
  hits Simulate (the owner's wording: "only after they try to post"); browsing, feed, comments stay open. Google + Apple
  (OIDC code flow, popup so the draft and attached video survive; Apple uses form_post) and a 6-digit email code via
  Resend from `YOUR_SENDER_EMAIL`. Users, sessions (hashed tokens with a TTL), email codes and auth limits live in Mongo. Published
  posts carry `userId` (never in the feed). Each provider turns on when its env vars exist: `GOOGLE_CLIENT_ID/SECRET`,
  `APPLE_CLIENT_ID/TEAM_ID/KEY_ID/PRIVATE_KEY`, `RESEND_API_KEY`. `/api/viral` returns 401 `sign_in_required` whenever
  any provider is on; `VIRAL_AUTH=off` turns the whole thing off. Redirect URIs: `https://<host>/api/viral/auth/callback/<provider>`
  for virelity.com, www.virelity.com, deonmenezes.com (host allowlist in the module). Security-review rules to keep:
  a non-Gmail/non-Workspace Google email never links to an existing account (`linkable`), a second Google/Apple id
  never replaces the first, indexes fail closed, email limits spend network and site counters before the address one,
  IPv6 counted per /64. Email codes are capped per address, per network and site-wide. COOP on the
  page is `same-origin-allow-popups` for the popup. The standalone project is now at 12 of 12 functions
  (`api/viral/auth.js`): any new endpoint there must be folded into an existing one.
