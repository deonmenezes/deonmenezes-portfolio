---
name: post-video
description: Post one of Deon's videos publicly to Instagram Reels, YouTube Shorts, TikTok and X (Twitter). Use whenever Deon says "post this video", "post it", "upload to tiktok/insta/youtube/x", "post on twitter", gives a video path plus a caption, or asks about the auto-posting setup (CrossPost, the drop folder, TikTok/X browser posting, reconnecting accounts).
---

# Post a video to Instagram, YouTube, TikTok and X

Deon gives one video (and usually a caption). You post it to all four. Deon has said to do all of it yourself without asking, including the public TikTok and X posts. Still never type passwords or create accounts; hand those steps to him.

| Platform | How | Result |
|---|---|---|
| Instagram Reels (@deon_tech) | CrossPost API (`post.py`) | public right away |
| YouTube Shorts (channel "Deon Does Research", @deonmenezes) | CrossPost API (`post.py`) | public (confirmed 2026-09-23: youtu.be/8GTF5b9G2LU came out `privacyStatus: public`). If one ever comes back "locked to Private", that's the API audit lock |
| TikTok (deon_techy) | **browser: TikTok Studio upload** (steps below) | public ("Everyone") |
| X / Twitter (@DeonMen) | **browser: x.com home composer** (step 2b) | public ("Everyone") |

The TikTok API app is an unaudited sandbox and can only post drafts. TikTok won't audit a personal upload tool, so **public TikTok posts go through the browser**.

## 0. Preflight

```bash
python -W ignore <your-home>/crosspost/autopost/post.py --status
```
- If it says "CrossPost isn't running", start it with `cd <your-home>/crosspost && (nohup node server.js > <scratchpad>/crosspost.log 2>&1 &)`, or double-click `start.cmd`.
- All three accounts should say `connected`. For reconnecting, see Troubleshooting.
- **TikTok is not available in every country.** If TikTok Studio does not load where you are, use the drafts fallback below or skip TikTok.

## 1. Instagram + YouTube (one command)

```bash
python -W ignore <your-home>/crosspost/autopost/post.py "<video>" "<caption>" --only instagram,youtube [--title "YouTube title"]
```
- It waits for both and prints each result and link. Exit 0 means both finished `done`.
- `--test` checks everything without publishing (a good first run on a new kind of file).
- The YouTube title defaults to the first caption line; `#Shorts` is handled by CrossPost. Vertical videos of 3 minutes or less become Shorts.
- CrossPost converts formats as needed and never double-posts. Use **Retry** on http://localhost:5055 for failures; it checks before resending.

## 2. TikTok, public, through the browser

Tools: `mcp__claude-in-chrome__*` (load them with ToolSearch). The bridge's `file_upload` caps each call at **10 MB**. So split the video into chunks, upload the chunks into a helper input, then stitch them back together in the page. (The page can't fetch from `127.0.0.1` either: uBlock/Chrome block it.)

1. **Split:**
   `python <your-home>/crosspost/autopost/split_for_browser.py "<video>" "<scratchpad>/tiktok-chunks"`
   This prints the chunk paths. Chunks must sit somewhere the bridge accepts, and the session scratchpad works.
2. **Open** `https://www.tiktok.com/tiktokstudio/upload` in the MCP tab and wait about 6 s. It should show "Select video to upload". A login page means Deon has to log in himself.
3. **Add the helper input** with `javascript_tool`:
   ```js
   window.__parts = [];
   let h = document.getElementById('__chunk_holder');
   if (!h) { h = document.createElement('input'); h.type='file'; h.id='__chunk_holder';
     h.setAttribute('aria-label','chunk holder');
     h.style.cssText='position:fixed;top:0;left:0;width:10px;height:10px;opacity:0.01;z-index:99999';
     h.addEventListener('change',()=>{for(const f of h.files) window.__parts.push(f);});
     document.body.appendChild(h); }
   'ok'
   ```
4. Use `find` for "file input labelled 'chunk holder'" to get its ref. Then call `file_upload` **once per chunk, in order** (part000, part001, …).
   Check with `window.__parts.map(f=>f.size)`: the sizes should add up to the video's size.
5. **Stitch and inject:**
   ```js
   const file = new File(window.__parts, 'video.mp4', {type:'video/mp4'});
   const input = document.querySelector('input[type=file][accept^="video"]');
   const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
   input.dispatchEvent(new Event('change',{bubbles:true}));
   document.getElementById('__chunk_holder')?.remove();
   (file.size/1048576).toFixed(2)
   ```
   Wait 10-30 s, until the page shows "Uploaded (xx MB)".
6. **Popups:** a "Turn on automatic content checks?" dialog sometimes appears (usually on the first upload). Click **Cancel**; it's an account setting, so leave it alone unless Deon says otherwise.
7. **Caption:** the Description box is prefilled with the file name. Click into it, select all (`ctrl+a`), press Backspace, then `type` the caption. Hashtags open a suggestion list, so press `Escape` after each `#tag`, or type the tags last and then press Escape. Take a screenshot to check the text.
8. **Settings:** check that "When to post" is **Now** and "Who can see this post" is **Everyone**.
9. Use `find` to locate the **Post** button, `scroll_to` it and click it. Wait about 10 s. The page should say it's posting or uploaded, or move to Posts. Check https://www.tiktok.com/tiktokstudio/content, where the newest post should be the caption you typed.
10. Clean up: delete `<scratchpad>/tiktok-chunks`.

**After posting:** the new post first shows **"Only me" + "Content under review"** in Studio, even when Everyone was chosen. The privacy menu is greyed out until TikTok finishes (up to 12 h); it then goes out as Everyone. Tell Deon; don't re-upload.

**Fallback (the browser fails):** `post.py "<video>" "<caption>" --only tiktok` sends the video to TikTok **drafts** through the API. Deon then taps Post in the app. Tell him that's what happened.

## 2b. X (Twitter), public, through the browser

Deon picked browser posting over the X API (the API charges for posting). It uses the same chunk trick as TikTok. Chrome is already logged in as **@DeonMen**.

**Limits (no Premium):** caption up to **280 characters** (a URL counts as 23), video up to **2:20** and 512 MB. If the caption is longer, shorten it; keep the hook and 1-2 hashtags. If the video is longer than 2:20, tell Deon and trim or skip X; don't cut it silently.

1. **Split:** `python <your-home>/crosspost/autopost/split_for_browser.py "<video>" "<scratchpad>/x-chunks"` (reuse the TikTok chunks if they already exist).
2. **Open** `https://x.com/home` and wait about 5 s. (`/compose/post` redirects to `/home` while files load, so use the home page's inline composer from the start.) If you see a login page, Deon logs in himself.
3. **Helper input + chunks:** same JS and `file_upload` loop as TikTok steps 3-4. Check that `window.__parts` sizes add up to the file size.
4. **Stitch and inject.** The only difference from TikTok is the selector:
   ```js
   const file = new File(window.__parts, 'video.mp4', {type:'video/mp4'});
   const input = document.querySelector('input[data-testid="fileInput"]');
   const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
   input.dispatchEvent(new Event('change',{bubbles:true}));
   document.getElementById('__chunk_holder')?.remove();
   (file.size/1048576).toFixed(2)
   ```
   Wait about 8 s. A preview of the video should appear under "What's happening?".
5. **Caption:** click the text box (`[data-testid="tweetTextarea_0"]`), `type` the caption, then press `Escape` to close the hashtag suggestions. Check `document.querySelector('[data-testid="tweetTextarea_0"]').innerText`.
6. **Wait for processing:** X keeps the video uploading/processing for a while. Poll until `[data-testid="tweetButtonInline"]` has no `aria-disabled="true"` and any `[role=progressbar]` is gone or at 100.
7. **Post:** click `[data-testid="tweetButtonInline"]`. Wait about 5 s, then check `https://x.com/DeonMen`: the top post should be the caption with the video. Get its link from the post's timestamp (`/DeonMen/status/<id>`).
8. Clean up: delete `<scratchpad>/x-chunks`.

**If it stalls (learned on the first real post, 2026-10-09):**
- **"Preparing media..." never ends, Post stays greyed:** the tab is hidden (`document.visibilityState === 'hidden'`). Chrome will not load video in a tab that has never been shown, and the MCP tab opens as a background tab in Deon's main window. Show it once (click the tab with Windows-MCP), then re-add the video.
- **Post stays disabled after that, even with text only:** the inline composer is stuck on the first failed attachment. Don't reload (that loses `window.__parts`). Clear the inline text, click the sidebar **Post** button to open the pop-up composer, and inject into `[role=dialog] input[data-testid="fileInput"]`; its button is `[data-testid="tweetButton"]`. Don't press `Escape` there (it closes the pop-up); end the caption with a space instead.
- Sort `window.__parts` by `name` before stitching, so chunk order never depends on call order.
- **"Browser extension is not connected":** claude.ai is signed out in Chrome (it happened along with X after an unclean shutdown). Deon signs in to both himself.
- After posting, the toast holds the link (`[data-testid="toast"] a`).

**Discarding without posting** (dry runs): `document.querySelector('[aria-label="Remove media"]').click()`, then click the text box and press `ctrl+a Backspace`.

## 3. Report back

Give one line per platform: the link from post.py for IG and YT, for TikTok the confirmation or the Studio content link, and for X the `x.com/DeonMen/status/...` link. Say plainly if YouTube went up private.

## Drop folder (runs without Claude)

- `<your-home>\crosspost\autopost\inbox\`: drop `clip.mp4` and optionally `clip.txt` (the caption; the first line can be `title: ...`).
- The watcher (`watch.py`; it no longer starts at login since 2026-10-05, start it by hand with `start-watcher.bat` in `<your-home>\crosspost\autopost`) posts to **every connected account through the API**. That means TikTok gets a **draft**, not a public post.
- Results go to `posted\`, or to `failed\` with a JSON or error report.
- Settings are in `autopost\.env`: `TIKTOK_MODE=inbox|direct`, `TIKTOK_PRIVACY`, `YOUTUBE_PRIVACY`.

## Where everything lives

- **CrossPost** (Node, localhost:5055): `<your-home>\crosspost`. `.env` has the Google and TikTok keys. `data/tokens.json` holds the OAuth grants (private). Instagram uses `~/.config/meta/credentials.env`. Run `npm test` for its 98 tests.
- **Instagram:** your Meta app (`YOUR_META_APP_NAME`, id `YOUR_META_APP_ID`) and its Instagram app ID `YOUR_INSTAGRAM_APP_ID`. Its app secret sits behind a Facebook password prompt; never submit that.
- **YouTube:** your Google Cloud project (`YOUR_GCP_PROJECT_ID`, used for CrossPost). OAuth app "CrossPost" is In production. The Web client "CrossPost local" has redirect `http://localhost:5055/auth/youtube/callback`. Public uploads need the audit form at https://support.google.com/youtube/contact/yt_api_form.
- **TikTok:** your dev app (`YOUR_TIKTOK_APP_ID`), sandbox "crosspost". Desktop redirect `http://localhost:5055/auth/tiktok/callback`, scopes user.info.basic, video.upload and video.publish. Target user: deon_techy.
- Postiz at `<your-folder>/postiz` was abandoned. Don't use it.

## Troubleshooting

- **Reconnect YouTube or TikTok:** open http://localhost:5055 and click Connect. The extension **can't click on accounts.google.com or tiktok.com/v2/auth**, so Deon approves there himself. Sign-in errors go to CrossPost's stdout as `[sign-in <platform>] ...`.
- **"TikTok: The request parameters are malformed"** was fixed on 2026-09-23 in `lib/http.js`: form bodies are sent as a string with a plain `application/x-www-form-urlencoded` type, because TikTok rejects `;charset=UTF-8`. Don't undo that.
- **TikTok Studio layout changed:** fall back to `read_page`/`find` for "Description editor", "Who can see this post" and "Post button". The upload input is `input[type=file][accept^="video"]`.
- **Videos over about 500 MB:** the chunk count gets large. Consider compressing first with ffmpeg: `-c:v libx264 -crf 20 -preset medium -c:a aac -b:a 160k -movflags +faststart`.

_X verified 2026-09-23: dry run of 2b steps 1-5 with a 10 MB, 2-chunk clip (stitch, inject, caption, Post button enabled), then discarded. First real X post 2026-10-09 (73 MB, 8 chunks, pop-up composer): x.com/DeonMen/status/2108422878932971946._

_First real TikTok post 2026-09-23 (Jev top-10 short) went through steps 1-9._

_Verified 2026-09-23: two dry runs of steps 1-8 with a 16 MB clip (upload, caption with #tags, Everyone), both discarded; the Post button is there. No real post yet._
