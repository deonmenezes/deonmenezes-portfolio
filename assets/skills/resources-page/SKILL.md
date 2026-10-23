---
name: resources-page
description: Build the web page a @deon_tech reel points at (a subpage under deonmenezes.com, usually deonmenezes.com/resources/<slug>) and ship it the way his sites really deploy, then hand the final URL to reel-automation. Use whenever Deon says "make a resources page for this", "make a subpage on how to use <repo>", "put it on deonmenezes.com", "make the page for the reel", "add a resource page", "send me the website link", "host it on deonmenezes.com", "push to main" or "push it" for deonmenezes.com or virelity.com (a bare "push it" that names no site means the site worked on last in this conversation; if there is none, ask which, and an app is app-status), or when a reel edit ends on "comment <word> and I'll DM you the link" and the link does not exist yet. Also holds the site -> repo -> clone -> deploy -> verify table. Not for the DM and the comment automation (reel-automation), the Will It Go Viral simulator or /jev and /viral (viral-project), editing the reel (video-edit) or posting it (post-video).
---

# resources-page

A reel ends on "comment <word>"; the DM hands over a link; that link is a page on his site that explains the thing
with the repo and a tutorial video. This skill builds that page and puts it live. `reel-automation` then sends it.
Last checked against the real sites on 2026-10-08.

```bash
R=<your-folder>/work/deonmenezes-portfolio                  # the clone every recent deploy came from, on main, .vercel linked
cd $R && git fetch origin && git status -sb      # must read "main...origin/main" with nothing else
cp ~/.claude/skills/resources-page/templates/page.html resources/<slug>.html   # fill the __TOKENS__
npx --yes serve@14 -l 8793 .                     # preview at http://127.0.0.1:8793/resources/<slug> (clean URLs work)
node --test test/resource-pages.test.js test/carousels-page.test.js test/harness-engineering-page.test.js test/resource-redirects.test.js   # 24 pass at HEAD; run all four (two pin exact hub titles)
# only when he asked for it live: prove prod == GitHub, then
npx vercel@latest deploy --prod --yes --scope YOUR_VERCEL_SCOPE
```

## 1. Collect before writing

- **What the reel promises**: the exact sentence and the comment word. The page must deliver that and nothing bigger.
- **The repo or tool link** (GitHub), its README, licence and who made it. Credit them by name.
- **The tutorial video**: a YouTube link. If he has not posted it, ask once; do not skip the section.
- **The slug**: short, lowercase, the thing's name (`ghost`, `muse`, `gta5`, `problems`).
Read the README yourself. Write only what it says; his script can run ahead of the repo (see `reel-automation`).

## 2. His rules

| rule | his words |
| --- | --- |
| **It lives on deonmenezes.com**, in his repo, deployed on his Vercel. | "it should be in deonmenezes.com look at my github and vercel on that" (2026-09-18) |
| **Simple things to understand, repo linked directly.** Plain steps in the README's order, no jargon. | "make the web page bettter man have simple things to understand link the rpsotiory directly" (2026-09-19) |
| **A link preview image on every page.** | "it doesnt have a poreview image ?? please ahve apreview image for this link" (2026-09-19) |
| **Every outside link opens a new tab.** `target="_blank" rel="noopener noreferrer"`. | "the links sould open a new tabnot do it in te same tba pleas" (2026-09-19) |
| **The YouTube tutorial is on the page.** The template embeds it and also links it. | "can u put this yotuube link as tutorial too pleaswe" (2026-09-19); first asked 2026-09-08 for the Blender MCP page |
| **The site navbar and the home page theme, everything.** Copy the nav block; never restyle it. | "have a navbar it is doenmenezes website man and it keep it to the home page theme verythign pelase" (2026-09-19) |
| **Clean Apple-style look, site-wide** (since 2026-10-09; it replaced the warm paper theme). White and soft-grey bands, system font, rounded media, pill buttons, blue links, one thin frosted navbar. Real images and references on every page. Still no loud gradients, no invented stats or graphics. | "can u redeisng the netire website more linke an apple based design sleek clean with iamges photos and refrences" and "can u make the complate redesign of a clean website please" (2026-10-09); earlier: "dont make it look vibe coded ... keep it normal" (2026-09-20) |
| **He wants the live link back**, not "it is pushed". | "ok send me the wbezite link u should host it on deonmenezes.com" (2026-10-07) |
| Page, then automation, in one go when he says so. | "put it in deonmenezes.com and please upload it in instant dm and automate the reel" (2026-09-08) |

"Embed" is my reading of the tutorial rule: he said "put the link as tutorial". The embed uses youtube-nocookie, as
`resources/harnessengineering.html` does.

## 3. Build the page

Default: hand-written `resources/<slug>.html` from `templates/page.html`. It is a copy of `resources/muse.html`: same
`site-nav.css` navbar, `start-a-startup.css` theme (restyled 2026-10-09 to the clean look: white, system font, blue `#0071e3`; the class names are unchanged, so the template still works. `resources/browser-games.html` is a second model that uses `/resources.css`), the three tags in `<head>`
(gtag `YOUR_GA_MEASUREMENT_ID`, `/ga.js`, `/metricool.js`), and no per-page CSP, so the iframe works. Hand-written pages need no
`vercel.json` block and no test edit. Do not use the data-driven route (`RESOURCE_SLUGS` in
`scripts/build-resource-pages.js`) unless he asks: its pages get a strict CSP with `default-src 'none'`, which blocks the
video embed, and every new slug means a `vercel.json` block plus two counts and two names in the test.

Checklist, tick each before preview:
- [ ] Nav copied verbatim, Resources marked `aria-current="page"`; footer line and "More free resources" link present.
- [ ] Hero: one-line title, two plain sentences, two buttons (repo, YouTube). Then tutorial embed, numbered steps taken
      from the README, Links list, closing card. A "Keep in mind" note when the tool has a catch (licence, risk, region).
- [ ] **Preview image**: set `og:image` and `twitter:image` to an absolute `https://deonmenezes.com/assets/img/<slug>/og.jpg`,
      1200x630, plus `twitter:card summary_large_image`. Make it by screenshotting the finished hero from the local
      preview (`chrome --headless=new --window-size=1200,630 --screenshot=...`) or from the repo's own artwork.
      `scripts/og-card.py` draws a Ghost phone, so it is not generic.
- [ ] Every external `<a>` has `target="_blank" rel="noopener noreferrer"`; only `/resources`, `/deon#...` stay in-tab.
- [ ] Mobile: Playwright (system `python`, not `-I`) at 390 px; `scrollWidth` must equal 390; read the screenshot.
- [ ] Hub card: add `<article class="resource-card" id="<slug>">` to `resources.html` with the next number (Muse is 19).
- [ ] Facts match the source; no em dashes; no invented numbers; run `grep -n "TODO\|EDIT:\|__[A-Z_]*__" resources/<slug>.html`.
`/deon` and `/` rewrites exist only on Vercel, so the nav's "/deon" links 404 under `serve`. That is expected.

## 4. Deploy deonmenezes.com

Pushing to GitHub `main` does NOT deploy it. The Vercel project `deonmenezes-portfolio` has no git link; every
production deploy is `source: cli`. Separately, a second Vercel project is git-linked to the same repo and deploys on every
push to its own `*.vercel.app` URL: the green "Vercel" check on a GitHub commit is that project, not the real site, and
each push spends one deploy of the daily quota.

Only do this when he asked for the page live ("put it on deonmenezes.com", "send me the link", "host it"). Otherwise
stop at the local preview and say it is not live. A Vercel preview (`deploy` without `--prod`) exists but 302s to
Vercel login for anyone logged out (tested 2026-10-08); use screenshots for him instead.

1. Clone state: `<your-folder>/work/deonmenezes-portfolio`, `core.autocrlf false`, `.vercel` already linked. Not
   `<your-home>/dmp` (second clone, 9 commits behind origin on 2026-10-08). Mac copy `~/Projects/deonmenezes-portfolio-icloud`
   is the old route and its `gh` token is expired; use Windows unless he asks otherwise.
2. **Prove prod == GitHub before your commit goes out**, or you ship or drop someone else's work:
   sha1-compare every static file live against `origin/main` (83 files, 30 s, 0 diffs on 2026-10-08, HEAD eab2185):
   ```bash
   for f in $(git ls-files '*.html' '*.css' '*.js' | grep -v '^\(api\|lib\|test\|scripts\|migrations\|services\)/' | sort -u); do
     case $f in index.html) u=/deon;; *.html) u=/${f%.html};; *) u=/$f;; esac   # "/" is a 308 to /deon
     [ "$(curl -s https://deonmenezes.com$u | sha1sum)" = "$(git show origin/main:$f | sha1sum)" ] || echo DIFF $f
   done
   ```
   Quick check: the newest production deployment's `meta.githubCommitSha` equals `git rev-parse origin/main`.
   Vercel API token is `%APPDATA%/com.vercel.cli/Data/auth.json`; it goes stale, so run `npx vercel@latest whoami` first or
   the API answers `invalidToken` (seen 2026-10-08). Never print it.
3. Commit the page (Windows `git` hangs on the credential UI, so push with the `gh auth token` header recipe in memory
   `github-cli-on-windows.md`), deploy with the command above, **then** push so GitHub and prod stay level.
4. **Quota**: 100 deploys per rolling 24 h per team. The first line the CLI prints on a refusal is only "Not authorized"; read
   further down for `api-deployments-free-per-day`. A bare "Not authorized" with `whoami` fine: retry once (2026-10-06 it worked
   on the second try). Count with `GET /v6/deployments?teamId=YOUR_VERCEL_TEAM_ID&since=<ms>`; 5 in the last 24 h on
   2026-10-08. A scheduled publisher on another machine once used it all up; check for one before
   blaming the CLI.

## 5. Verify it is live

```bash
U=https://deonmenezes.com/resources/<slug>
curl -s -o /dev/null -w "%{http_code}\n" $U                                  # 200
curl -s -A "facebookexternalhit/1.1" $U | grep -o 'og:image" content="[^"]*'  # what Instagram/Meta's crawler reads
curl -sI https://deonmenezes.com/assets/img/<slug>/og.jpg | grep -i "HTTP\|content-type"   # 200 image/jpeg
curl -s $U | sha1sum; sha1sum resources/<slug>.html                          # same bytes as the file you built
```
Then open it in a browser at phone width once, click the repo and YouTube links, and confirm the video plays.
No desktop (remote session): verify with headless Playwright and `curl`, and say "video playback not checked".
If he is away and the tutorial link is missing, ship without the embed and say so.

## 6. Hand off

When it is live, tell him the URL, then run `reel-automation`: `python ~/.claude/skills/reel-automation/scripts/reel.py new <slug>`,
`keywords` = his comment word, `url` = `https://deonmenezes.com/resources/<slug>`; `check` refuses a dead link. The link goes only
in the DM, never in a public reply, and the DM stays under 60 words with the link on its own line. Do not write the DM here.

## Other sites he says "push it" for

On virelity.com a push to `main` is a production deploy: push only on
his explicit ask in this conversation, after showing `git diff --stat`. The memory note `virelity-site.md` still says
pushing does not deploy; the Vercel deploy list on 2026-10-08 showed `source: git`, so treat a push as live.

| site | repo | local clone | how a deploy really happens (checked 2026-10-08) | verify live |
| --- | --- | --- | --- | --- |
| deonmenezes.com | deonmenezes/deonmenezes-portfolio | <your-folder>/work/deonmenezes-portfolio | CLI only. Project has no git link; push does nothing. a side project deploys on push but is not the site | latest prod deploy sha == HEAD; hashes; curl |
| virelity.com | its own repo (Vite) | <your-folder>/virelity-site | Memory says push does not deploy. Not true now: project is git-linked to main and production deploys with `source: git` on 2026-09-23 and 09-25. Push deploys; CLI is optional | latest prod deploy sha; `curl https://virelity.com/viral` 200 |

Virelity trap: its clone is one commit ahead (`01ae39b` "Revert the AI-transformation redesign", 2026-09-25, unpushed) and
that revert is not live; pushing from that clone deploys it. Ask before pushing anything there. Stray files `tatus --porcelain` and
`tatus --short` sit in its root; leave them.

## Traps already paid for

- **Green GitHub check is not live.** It is the side project. Check prod's sha and the page itself.
- **A page that is written but not deployed is a 404** sent to everyone who comments. Never arm the automation first.
- **Two shipped pages lack a preview image**: `gta5` and `problems` have only `twitter:card summary`, so they break his
  2026-09-19 rule. Fix them only if asked; say so if he shares one.
- **Generated vs hand-written**: a slug diff against `RESOURCE_SLUGS` does not list `carousels`, `harnessengineering`,
  `gpt-6-draw` or the hand-written pages. They are not missing. A deploy that "drops" them is a stale clone.
- **Rebasing two resource-page commits** conflicts in the build script and test file; a keep-both merge loses a closing `},`.
- Fresh Windows clones: set `core.autocrlf false` or the build dirties every generated file with CRLF.
- `vercel link` writes `.env.local` and edits `.gitignore`; the portfolio clone is already linked, so do not relink.

## Files

```
resources-page/
  SKILL.md
  templates/page.html      the page: nav, theme, OG tags, tutorial embed, steps, links, closing card
```
