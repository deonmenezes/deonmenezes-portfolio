---
name: youtube-video
description: Make a long-form YouTube video for Deon's channel "Deon Does Research" end to end from a topic, a link, a PDF or a thread - choose the visual style and the existing pipeline folder to start from, research and fact-check, hand the narration to the youtube-script skill, voice it (a Vapi voice, his ElevenLabs clone, or his own recording), build the visuals (real-screenshot documentary cards, clips, Remotion explainer, hand-drawn sketch, Manim 3Blue1Brown, Blender 3D, cartoon), render gently on this PC, QC, save to Drive, upload to YouTube with a custom thumbnail and a title/thumbnail A/B test. Use whenever Deon says "make a video about X", "make a youtube video", "make a video on this" with a link, "long-form video on X", "you know the drill of how we make youtube videos", "fully animated video", "like 3blue1brown", "coldfusion style", "continue / finish the youtube video", "upload it and do some ab testing", "what happened to the thumbnail", or asks where a long-form video is. Not for writing the narration itself (youtube-script), editing footage he filmed (video-edit), matching a reference reel (reference-reel-edit), posting a reel or short (post-video), carousels (carousel) or choosing today's topic (content-ideas).
---

# youtube-video

A topic, a link or a PDF in. A long-form video on "Deon Does Research" out: file in Drive, custom thumbnail,
title test running, and one message telling him where everything is. This skill is everything around the
script: which pipeline, in what order, on a PC that crashes under load.

It hands off four jobs and does not redo them: the narration (`youtube-script`, whose linter gates the voice),
cutting a recording of his own voice (`video-edit` tools), the Drive copy (`drive-save`), and CrossPost setup or
any reel/short cut-down (`post-video`).

```bash
python ~/.claude/skills/youtube-video/scripts/preflight.py   # read-only: tools, templates, disk, Drive, CrossPost, heavy jobs
# the default (documentary) pipeline, from <your-folder>/<slug>-video. One line at a time, never two at once.
python ~/.claude/skills/youtube-script/lint_script.py script.py   # until it prints OK
python vapi_narrate.py && python tail_check.py   # voice + timing, then: was every take spoken to its last word
python build.py cards && python build.py check   # cards from shots/, then every shot and overlay resolved, no render
python build.py cut                              # out/<seg>_base.mp4, one segment after another
python watch_mem.py overlay                      # overlays + narration; stops itself under 5 GB free RAM
python verify_ov.py && python build.py concat    # every overlay really in the picture, then join + music bed
python qc_final.py                               # stream facts, chapter offsets, contact sheets to Read
python upload_yt.py                              # creates the post ONCE (public at once), then polls; later only --poll
```

Read the reference file for a step before starting it: [pipelines](reference/pipelines.md) (each style's folder,
chain and what to change in a copy), [voice](reference/voice.md), [publish](reference/publish.md) (Drive,
description, upload, thumbnail, A/B test), [traps](reference/traps.md) (everything that already went wrong).

## His rules

Quotes are his, spelling tidied. Where there is no quote, the second column says what the rule cost.

| rule | his words, or the cost |
| --- | --- |
| **Fact-check before any voice is made.** | Two full ElevenLabs passes burned on Sonnet 5.5; 22 of 35 paragraphs re-recorded on the Vals video. |
| **Every technical term is defined** out loud in a full sentence where it first appears, and shown on screen. | "i want proper definitions of everything ... each word which is coming should gather a definition" (2026-09-28); "put definition for each major term we get to and have complete sentences" (2026-09-29) |
| **One voice, the same from start to finish.** No picking between takes, no setting changes mid-video. | "the quality of voice keeps on changing" (2026-09-28) |
| **Say which voice before spending on it, and never change how his clone sounds without telling him.** | "r u using eleven labs and using my voice?", "but it is not my voice" (2026-09-29) |
| **The script sounds like a person.** The `youtube-script` skill writes it; its linter passes before voicing. | "our script sounds so generated and sloppy please make it human" (2026-10-04) |
| **Show the thing happening**, not a definition on a card. Real pages, real posts and real footage beat anything designed. | "show like actual animations" (2026-10-07); designed cards and flat motion graphics were "vibe coded" (2026-09-28, 09-29) |
| **Nothing on screen or in the title that the source does not support.** If his framing overstates, the video says what is true and he is told. | "openai solved 700+ math problems" became "Did OpenAI Just Solve 700 Math Problems?" (2026-10-07) |
| **One heavy job at a time, gently, and tell him before anything that loads the PC for more than a few minutes.** | "LAST TIME MY PC CRASHED PLEASE SEE WHY AND MAKE SURE DOESN'T HAPPEN AGAIN", then "STOP RENDER FOR NOW" (2026-10-04) |
| **Important outputs are hash-verified.** | This PC has flipped bits in files. |
| **The finished file goes in Drive "Video edits of myself".** | "it should be in video edits of myself" (2026-10-03) |
| **Every upload gets a custom thumbnail and a title/thumbnail A/B test with short titles.** | "what happened to thumbnail add that too" (2026-10-02); "the title can be ab tested and short, have multiple titles and thumbnails" (2026-10-06); "upload it and do some ab testing" (2026-10-07) |
| **Tell him where it is before he has to ask.** | "where is the video" (2026-09-28, 09-29), "is the video live" (10-02), "did u upload on youtube" (10-08) |

## 0. Which video is this

Pick one row, say which in your first message, and start a NEW folder `<your-folder>/<slug>-video` from that template's
code (E: is full). Templates are finished videos: copy from them, never edit or render inside them.

| style | start from | use when |
| --- | --- | --- |
| **Documentary: real screenshots and source cards** (default, "the drill") | `<your-folder>/openai-math-video` | a release, a paper, a thread, a claim in the news: anything whose sources can be shown |
| the same, with clips and soundbites | same `build.py`; clip tools in `<your-folder>/religion-video` | real footage exists and people can be heard saying it themselves |
| Calm motion-graphics explainer (Remotion) | `<your-folder>/sonnet55-video` | a launch explained with benchmarks and what people built, out the same day |
| Hand-drawn sketch (Remotion) | `<your-folder>/sonnet55-sketch` | he says "hand-drawn", "plain white, artistic", wants reactions on screen |
| Manim, 3Blue1Brown style | `<your-folder>/harness-video` | a book, a paper or one idea built from first principles; "like 3blue1brown", no 3D |
| Blender 3D with Remotion cards | `<your-folder>/inference-video` | only when he asks for "3D" or "cinematic"; hours of GPU, never published so far |
| Cartoon, his own recorded voice | `<your-folder>/mashup-edit` | he says "animated", points at the Agent Flappy reference, or narrates a countdown himself |

`<your-folder>/rust-video` is the oldest clip edit: not a template (its cut cache ignores changed shots). If he filmed
himself talking, the whole job is `video-edit`, not this skill.

## A run

**1. Intake.** Write down his exact words. Run `preflight.py`. Choose the style and the voice
([voice.md](reference/voice.md): a Vapi voice unless he asks for his own; if he says "my voice", ask whether he
will record it or wants the clone). Tell him in one message: style, voice, rough length, and that heavy steps are
coming later. Ask a question only if the answer changes the whole video.

**2. Research.** Up to three research agents in parallel, one angle each, each writing `research/<letter>_<angle>.md`
with a source for every fact. A quote seen in the primary source is tagged `[RAW]`; one seen only through a news
article is tagged `[2ND]` and can only be said as "told <outlet>". Research must come back with what the
`youtube-script` skill needs: the question, the person, at least three quotes, the dates and numbers.
Fetching recipes for sites that block the shell are in traps.md.

**3. Script.** Load `youtube-script` and follow it. `script.py` holds `SEGMENTS`; one paragraph is one voice
take. Ask him one question for his own take. If he gives none, the closing opinion is yours: mark it `# TAKE`
and carry that into the report. Lint until `OK`.

**4. Fact-check, before any voice.** A fresh agent that wrote none of it reads `script.py` against the research
files and the live sources and writes `research/D_factcheck.md` (WRONG / OUT OF DATE / OVERSTATED / UNSUPPORTED
/ FAIRNESS / QUOTE, most serious first, a fix for each). It does not edit the script. You apply the fixes and
lint again.

**5. Voice.** [voice.md](reference/voice.md). Then `tail_check.py` (or, for his own recording, the `video-edit`
cut and `edl verify`). Listen to anything flagged. A re-voiced paragraph uses the same voice and settings.

**6. Visuals.** Follow the style's chain in [pipelines.md](reference/pipelines.md). In every style:
- each term's definition is on screen when it is first said (`def` overlay, `DEFS` card);
- a claim is backed by the real page with the sentence highlighted, the real post, or the real clip;
- a quote overlay carries the source's exact words, and ends with its sentence (`{"to": ..., "hold": 0.4}`);
- scene or card authors may work in parallel because writing is light; they make stills, never full renders;
- look at contact sheets as images before anything is rendered in full.

**7. Render.** Tell him first, with a time estimate. One step at a time, one segment at a time, through the
template's own gentle settings (`watch_mem.py` for the documentary build). Check nothing else heavy is running
(`preflight.py`). If he says stop, stop your own job by its exact PID. Then `verify_ov.py`, then `concat`.

**8. QC.** `qc_final.py`, the checklist below, and a render-review agent that built nothing: give it the file,
`script.py`, `shots.py` and the research folder; it writes `research/E_render_review.md` with defects by time.
Fix, rebuild from the step that owns the defect, review the new file. After three rounds without a pass, stop
and tell him what is still wrong.

**9. Deliver.** Final and thumbnails into Drive with the `drive-save` skill; record the SHA-256.

**No desktop (remote session).** Gemini thumbnails and the Studio A/B test need his signed-in Chrome. With no browser
connected: make the thumbnails without Gemini, upload and set the thumbnail by API, and send him the three
title/thumbnail pairs with "A/B test not set, do it in Studio". If the PC rebooted mid-render, run the
`session-recovery` skill and move partial files in `out/` aside before rebuilding. If he said reel, short or Instagram,
this is the wrong skill: his own footage goes to `video-edit`.

**10. Publish**, only if he said to upload (in the request or since). `upload_yt.py` in the command block above is behind this gate too. [publish.md](reference/publish.md):
description under 5,000 bytes with chapters, `upload_yt.py` once, thumbnail through the API, the A/B test in
Studio. If he has not said, report and ask: upload it, or change it?

## QC before it is called done

1. 1920x1080, 30 fps, H.264 yuv420p + AAC; audio and video the same length; nothing cut by `-shortest`.
2. Integrated loudness about -16 to -14 LUFS (the documentary build normalises to -16, the Remotion mux to -14),
   true peak under -1 dBTP; the voice clear over the music throughout.
3. Every take spoken to its last word (`tail_check.py` flags listened to); no paragraph missing or doubled.
4. Every overlay present (`verify_ov.py` exits 0); none sits over the next card.
5. No black or frozen stretch; the last frame is a held pose, not mid-motion.
6. Contact sheets read as images: no empty glyph boxes, no text off the edge, no cookie banner or popup in a
   capture, and each card is about the sentence being said.
7. Every technical term has its definition on screen at first mention.
8. Every number, date and quote on screen is in a research file with its source; no number he or a source did not give.
9. The independent render review has no open defect, or each open one is listed for him.
10. Description: under 5,000 bytes, chapters start at 0:00 and match the file, sources listed.
11. Final hashed twice with the same result; the Drive copy matches (`drive-save` prints MATCH).
12. After upload: the link opens, the thumbnail shows (re-check later if it is still the auto frame), the test is set.

A check that did not run is reported as not run.

## What to tell him

In this order, in one message: the link and whether it is public; the Drive file name and the local path;
length, style and voice; what is in it that he did not ask for or has not seen (the `# TAKE` paragraphs, a
changed title, the description, anything added); where the facts differed from how he framed it; what QC covered
and what it did not; the three title/thumbnail pairs and whether the test is running; what is left for him
(sign-ins, credits, a decision). If the build will take hours, say so at the start and again when it is done.

## Traps that cost the most

Full list, by step, in [traps.md](reference/traps.md).

- **Voicing before the fact-check.** Paid for twice. Step 4 exists for this.
- **Parallel heavy jobs.** Older templates still render 4 at once (`build.py render` in harness and inference),
  2 at once (`render_all.py`), or run whisper on all cores. Set them to 1 in your copy.
- **ffmpeg stalls or drops overlays** when joined clips differ in colour tags: `-reinit_filter 0` and windowed
  inputs (`-itsoffset t0 -loop 1 -t n`), already in the documentary `build.py`; `verify_ov.py` proves it.
- **Stale cut files** reused silently in `<your-folder>/rust-video/build_edit.py`: delete `out/<seg>_cut*`, `_base` and
  `<seg>.mp4` there, or better, do not start from it.
- **The upload poll drops on a file near 1 GB** while the upload is fine. Never re-run a create: `upload_yt.py --poll`.
- **Vapi cuts a paragraph short or drops a phrase**: `tail_check.py` every time.
- **The clone on eleven_v3 or extreme settings is "not my voice"**: v2 settings only (voice.md).
- **Quiet mix** from his own recording (-16.8 LUFS): gain plus `alimiter` to about -14.
- **Words stamped early after a pause** put captions and cartoon events in dead air: add about 0.2 s.
- **E: is full; Drive letters swap; a copy into the Drive mount is not yet an upload.** `preflight.py`, `drive-save`.

## Not yet confirmed by him

Treat these as how it has been done, not as approved: Vapi "Brian" as the default voice (he said "any voice is
fine"); the quiet music bed under long-form narration; the "The narration is an AI voice" description line;
real gameplay clips inside the cartoon video ("only animated" may have meant cartoon only); uploading straight
to public without him watching first when he said "upload once done". When he corrects one, fix the video and
add the rule to the table above with the date and his words.

## Files

```
youtube-video/
  SKILL.md
  scripts/preflight.py      read-only readiness check (--voices also asks ElevenLabs if the clone is reachable)
  reference/pipelines.md    the seven styles: folder, chain, what to change in a copy, what each published video used
  reference/voice.md        Vapi, his own recording, the clone: settings, credits, what he rejected
  reference/publish.md      Drive, description, titles, thumbnails, upload, thumbnail API, A/B test
  reference/traps.md        every trap by step, with its fix
```
