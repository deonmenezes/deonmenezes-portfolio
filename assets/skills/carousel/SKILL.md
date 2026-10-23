---
name: carousel
description: Make an Instagram carousel for @deon_tech out of other people's video clips (usually X posts) around one idea - a Gemini-made cover, one 4:5 video slide per clip with a title, a one-line point and the credit, Deon's profile-picture watermark, a "Follow @deon_tech" end slide, optional music on the cover and end slide - then QC it, put it in Drive and post it. Use whenever Deon says "make a carousel", "Instagram carousel", "carousel post", "swipe post", gives X/Twitter video links to turn into a post, "add a watermark / end screen / music to the carousel", or "post the carousel". Not for editing his own footage (video-edit) or posting a single video (post-video).
---

# Instagram carousel from clips

Deon gives a topic and a few X links. You deliver a finished carousel: cover, clip slides, end slide, caption. First made 2026-10-06 (AI game mashups, https://www.instagram.com/p/DeKTDhODEtL/); that project, `<your-folder>/game-carousel`, is the worked example.

What Deon asked for that night, in order, so do all of it without being asked again:
- **At least 8 video slides.** He gives 2-3 links and expects you to find the rest.
- **Cover made with Gemini**, headline on it.
- **Watermark on every slide:** his profile picture + `@deon_tech`.
- **End slide:** "Follow @deon_tech for more".
- **Music on the first and last slide** when he gives a track.
- **Copy to Drive** when it's done.
- **Post only when he says so.**

Scripts are in this skill's `scripts/`. Run ffmpeg jobs one at a time; this PC crashes under heavy parallel load.

## 1. Project folder

`<your-folder>/<topic>-carousel/` with `src/` (downloaded clips, nothing else), `assets/`, `music/`, `out/`, `tmp/`. Keep scripts out of `src/`.

## 2. Get the clips

Deon's links first:

```bash
cd <your-folder>/<topic>-carousel/src
yt-dlp --no-warnings --skip-download --print "%(id)s | %(uploader_id)s | %(duration)s s | %(width)sx%(height)s | %(like_count)s likes | %(description)s" "<x url>"
yt-dlp --no-warnings -q -o "%(uploader_id)s_%(id)s.%(ext)s" -f "bv*[height<=1080]+ba/b[height<=1080]/b" --merge-output-format mp4 "<x url>"
```

- One post can hold several videos; each becomes its own file. Cap the height, or a screen recording arrives as a 300 MB 3024x1896 file.
- Keep the post text and like count. They are your only source for what the clip claims.

Then find more until you have at least 8 good ones:
- WebSearch (extended) for write-ups of the trend. They name the creators and the pairings, rarely the URLs.
- X search in Deon's logged-in Chrome: navigate to `https://x.com/search?q=<terms> filter:videos min_faves:2000 since:<date>&f=top`, then run `scripts/x_search.js` through `javascript_tool`. It returns `/handle id | likes | text` lines. Two or three targeted queries beat one broad one.
- A 403 on one download is normal; move on to the next candidate.

## 3. Choose the cuts by looking

```bash
python <skill>/scripts/sheet.py src/<clip>.mp4 tmp/sheet_<name>.jpg            # 20 frames across the clip
python <skill>/scripts/sheet.py src/<clip>.mp4 tmp/cut.jpg 7.2 9.0 8           # zoom in on a cut
```

Read the sheets. Pick 13-18 s per clip (up to ~28 s for a labelled compilation), starting on the most striking moment. Carousel videos must be 3-60 s.

- **Start and end on a clean cut.** In a compilation, sample 0.2 s apart around the cut and start just after it. ffmpeg scene detection misses crossfades and lied by 0.15 s here.
- A side-by-side comparison clip beats a long gameplay clip for a "rebuilt X in Y" claim.
- Skip clips that only repeat an earlier slide.

## 4. Cover with Gemini

There was no working Gemini API key on this PC. Use gemini.google.com in Chrome: Deon is signed in. Prompt shape that worked first try:

> Generate an image in 4:5 portrait aspect ratio for an Instagram carousel cover. Scene: <one concrete scene that shows the idea>. Cinematic, high contrast, vivid colors, sharp. The top third is darker so text reads clearly. Big bold headline at the top in heavy white condensed sans-serif capitals with a black outline, exactly: "<HEADLINE>". Below it, smaller, in bright yellow capitals, exactly: "<SUBLINE>". Small white text at the bottom right, exactly: "SWIPE >". No other text, no logos, no watermark.

Wait about 40 s, click the download icon on the image. The file lands at the root of **<your-folder>/** as `Gemini_Generated_Image_*.png`; move it to `assets/cover_raw.png`. Read it and check the spelling of every word. Leave Gemini's small sparkle mark alone and tell Deon it is there.

## 5. carousel.json

Copy `assets/example-carousel.json` and edit. Fields:

| Field | Meaning |
|---|---|
| `tag` | small yellow line above each title; the builder appends ` 3 / 9` |
| `handle` | watermark text, default `@deon_tech` |
| `cover.image` | the Gemini PNG |
| `music`, `cover.music`, `end.music` | track path and `[in-point s, duration s]` for each still; leave out for silent 5 s stills |
| `end.lines` | default `FOLLOW` / `@deon_tech` / `FOR MORE` |
| `slides[]` | `src`, `start`, `dur`, `title`, `point`, `credit` |
| `accent` | optional `[r, g, b]` theme colour for the tag, × marks, window lines, end-slide ring and handle (default yellow); `[230, 32, 40]` gave the red theme on the Roadster carousel |
| `panel` | optional `[r, g, b, a]` tint over the blurred bands above and below the clip (default `[0, 0, 0, 120]`; red theme used `[38, 0, 4, 150]`) |
| `loudnorm` | `true` levels every clip's audio (X clips arrived 13 dB apart on 2026-10-16); always worth turning on |
| `slides[].tag` | optional: this slide shows that tag instead of the numbered one and is left out of the `n / N` count (an intro slide such as "START HERE") |

Writing the three text lines per slide:
- **title:** the pairing in capitals with ` × ` between games/things, e.g. `MINECRAFT × ELDEN RING`. Three-way titles fit; four won't.
- **point:** one sentence, max two lines (about 75 characters), describing **what is visible in this cut**. Not what the full video shows, not what the tweet promises. The reviewer failed two slides on exactly this.
- **credit:** `@handle on X` when the poster made it, `via @handle on X` when they are reposting or you can't tell, `compilation by @handle on X` for a compilation.
- Don't write that AI made something unless the post says so. Don't call an unfinished thing finished (one clip's own debug label read "FEEL CHECKS FAIL", so the point said "being rebuilt").

## 6. Music (when Deon gives a track)

```bash
cd <your-folder>/<topic>-carousel/music && yt-dlp --no-warnings -q --no-playlist -f ba -x --audio-format wav -o "track.%(ext)s" "<youtube url>"
```

Find the chorus by its words, not its loudness (mastered tracks are flat): cut a 16 kHz mono segment and transcribe it with faster-whisper `small.en`, `device='cpu'`, `compute_type='int8'`, `word_timestamps=True`. Put the first chorus line under the cover and the next line under the end slide, starting each about 0.5 s before its first word, 8-9 s long. Add `Music: <song> by <artist>` to the caption and tell Deon a commercial song may get those slides muted.

## 7. Build

```bash
python <skill>/scripts/build.py <your-folder>/<topic>-carousel          # everything
python <skill>/scripts/build.py <your-folder>/<topic>-carousel 03 10    # just those slides
```

Output is `out/slide_01.mp4` (cover) … `slide_NN.mp4` (end), all 1080x1350 H.264/AAC 30 fps. The cover and end slide are stills rendered as video so every item can be uploaded without a public URL. The builder stops with a clear message if a point is too long for its space or a clip is outside 3-60 s.

The watermark picture is `assets/deon_tech_pfp.jpg` (face crop in `pfp_box`). It is not included in this download: put your own square profile picture there. Refresh it from the Graph API (`fields=profile_picture_url` on IG user `YOUR_IG_BUSINESS_ACCOUNT_ID`) if you change it.

## 8. QC, then an independent check

Look yourself first: grab a frame at 0 s, the middle and the last 0.2 s of each slide, tile them, Read the tile.

Then hand it to a `verifier` agent (sonnet), read-only, scratch frames to `tmp/qc/`, one ffmpeg at a time. Give it the files, the config, and the source post texts, and ask per slide for:
1. Specs: 1080x1350, h264 yuv420p, AAC, 30 fps, 3-60 s, moov before mdat.
2. Visual: clipped or unreadable text, text over the gameplay window, leftover frames from a neighbouring clip at the start or end.
3. Truth: does the title pairing and each point match what is on screen in this cut?
4. Spelling everywhere, counter running in order.

Fix what it finds, rebuild those slides, and send it the changed slide numbers to re-check. Don't post on your own say-so.

## 9. Caption

Write `out/caption.txt`: what is happening in two short paragraphs, an honest caveat if the claims are unverified, a question, credits, hashtags. Plain and human, no hype.

**Write X handles without the `@`** ("Clips from X (Twitter): TobynJacobs, rehan_shei"). On Instagram `@name` tags whoever owns that name there. The post script warns if it sees one.

## 10. Drive

Copy `out/slide_*.mp4` and `caption.txt` to `<X>:\My Drive\<your edits folder>\<YYYY-MM-DD> <topic>-carousel\`. Find the drive by that path; G: and H: swap. Verify with sha1 after copying (files written on this PC have come out corrupted before).

## 11. Post (only when Deon asks)

```bash
python <skill>/scripts/post_carousel.py <your-folder>/<topic>-carousel --check     # account, files, caption; uploads nothing
python <skill>/scripts/post_carousel.py <your-folder>/<topic>-carousel --dry-run   # uploads, builds the container, no publish
python <skill>/scripts/post_carousel.py <your-folder>/<topic>-carousel             # publishes, prints the permalink
```

- The caption is fixed when the container is built, so finish the caption before the dry run.
- `tmp/post_state.json` makes re-runs safe; it refuses to publish twice.
- 11 video items went through on 2026-10-06, so the old 10-item cap no longer applies; the script allows up to 20.
- After publishing, confirm the item count the script prints and give Deon the link. Then refresh the Drive folder if anything changed after the first copy.

## Report to Deon

Give the link or folder, a table of slides with whose clip each one is, and the things he should know: where the cover came from, silent slides, any claim you softened and why, any music or copyright risk, and what the independent check did and didn't cover.
