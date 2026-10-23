---
name: video-edit
description: Edit one of Deon's own videos end to end with a small team of agents - cut the pauses, fillers and repeated takes, add word-timed captions and keyword pop-ups, real news-source and tweet cards, split-screen explainer animations, full-frame graphics, B-roll with a cinematic grade, then QC and deliver. Use whenever Deon says "edit this video", "edit the latest/newest clip", "cut the silences", "remove the fillers", "tighten this", "add captions", "add sources", "add graphics/animations", "split screen", "add b-roll", "make it cinematic", "explain the terms on screen", "two-font title", "font combination like the IG Edits reel", gives a raw clip (<your-folder>/, Downloads, Drive "Unedited videos") with instructions, or asks to change an edit made this way. Not for matching a reference reel (reference-reel-edit), writing narration (youtube-script) or posting (post-video).
---

# video-edit

One raw clip of Deon talking in, one finished video out, built by a lead (you) and up to six agents with one job
each. Every agent's work ends in something that can be checked: a transcript diff, a still to look at, a source
page with the sentence highlighted, a QC verdict.

**Nothing gets posted here.** The run ends with the file in his folders and one question: ship it, or change it?

Read two files before planning, every time:
- [references/house-style.md](references/house-style.md): what he wants, in his own words, with dates. His
  defaults are no music, no sound effects, hard cuts, real screenshots over designed cards, and less editing.
- [references/looks.md](references/looks.md): which look his request means and how that look is built.

[references/machine.md](references/machine.md) has the rules for this PC and the traps already paid for.

## What it can do

| he asks for | tool | what comes out |
| --- | --- | --- |
| "cut the silences / fillers" | `edl pauses` | pauses found on the voice envelope, 70 ms kept on each side |
| "if I repeated something keep the better one" | `edl retakes` | restarted lines and hanging fillers suggested; the second take stays |
| (always, after a cut) | `edl verify` | the cut audio transcribed again and diffed: no word lost, none left over |
| "add captions" | `captions` | 2-3 word captions and big keyword pop-ups in his style |
| "add sources", "show the article" | `search`, `shots`, `cards` | the real page, its masthead, the sentence highlighted |
| "show the tweet" | `tweet` | the real tweet as an image, no login |
| "split screen", "explain it" | `render_anim`, `compose` | animation panel on top, him below, each term defined |
| "graphics on everything I say" | `compose` (card / anim) | full-frame cards and animations, dimmed behind |
| "two-font title", "font combo", "like the IG Edits fonts" | `title_pair` + a `card` segment | one huge word plus a contrasting accent word (magari / airone / tallica), see house-style "Two-font title pairs" |
| "make the motion better", "animation feels off", timing of titles / face runs / closes | `motion-designing` skill | frame-numbered brief, hold + ownership check, three stills, sounds on their hit frames |
| "b-roll", "cinematic" | `compose` (broll), `mix --music` | photos and clips over his voice, graded, music ducked |
| "add music", "song for this vibe" | `mix --music` from `<your-folder>/reference-library` | a song picked by vibe from the downloaded library (README table), started at its best 15 s |
| "don't over edit, just the sources" | `overlay` | untouched HLG picture and audio, cards on his own jump cuts |
| (always) | `qc`, `deliver` | measured checks and a contact sheet; hash-verified copies to E: and Drive |

## The team

| agent | job | brief | runs |
| --- | --- | --- | --- |
| **lead** (you) | intake, the brief, assembly, renders, the gate | this file | throughout |
| **cutter** | what is removed | [agents/cutter.md](agents/cutter.md) | first wave |
| **researcher** | a real source for each claim | [agents/researcher.md](agents/researcher.md) | first wave |
| **graphics** | panels, animations, B-roll placement | [agents/graphics.md](agents/graphics.md) | first wave |
| **packager** | caption, title, hashtags, credits, CTA word | [agents/packager.md](agents/packager.md) | first wave |
| **content checker** | background noise removed; every talking cut starts 0.10 s before his mouth opens | [agents/content-check.md](agents/content-check.md) | after the cutter, and on the finished file |
| **captioner** | captions and pop-ups | [agents/captioner.md](agents/captioner.md) | after the cutter |
| **qc** | an independent verdict on the finished file | [agents/qc.md](agents/qc.md) | after the render |

Use the smallest team the request needs. More agents is more cost and more to reconcile, not a better video.

| request | team |
| --- | --- |
| cut and captions only | lead does the cut and captions itself; **qc** |
| sources on hard cuts (overlay lane) | **researcher** (one: its files and its browser are not shared), **packager**; **qc** |
| split screen / graphics on every line | **cutter** + **graphics** + **researcher** (if he states facts) + **packager** together, then **captioner**; **qc** |
| b-roll and grade | **cutter** + **graphics** + **packager**, then **captioner**; **qc** |

QC is never skipped, and never done by an agent that built any part of the edit. The **content checker** runs on
every edit that has his voice in it, whatever the team (2026-10-15, his ask after a posted reel lost attention to
loose cuts): it measures noise and denoises the dialogue, and checks every talking cut against his mouth opening.
For a montage it is the lead's own first step on each talking clip; for a talking-head edit it is its own agent,
after `edl verify` and before captions.

| he asks for | tool | what comes out |
| --- | --- | --- |
| "no background noise" (always) | `contentcheck.py noise`, `denoise` | floor/SNR/wind/hum verdict; DeepFilterNet-cleaned dialogue |
| "start 0.1 s before I open my mouth" (always) | `contentcheck.py heads`, `check` | IN/OUT per phrase from lip landmarks; PASS/FAIL per kept range |

## A run

`S=~/.claude/skills/video-edit/scripts`. From an edit folder, `python vk.py <tool> --help` prints any tool's usage
without running it.

**0. Intake.** Write down his exact words. Find the clip: the path he gave, else the newest video in
`<your-home>/Downloads`, `<your-folder>/`, or "Unedited videos" on the Drive (list by name; never scan a whole Drive mount).
If two clips fit, say which you picked and why. Ask him a question only if the answer changes the whole edit and
his words, house-style.md and the clip itself cannot settle it; otherwise decide, and say what you decided.

**1. Scout** (lead).
```bash
python $S/new_project.py "<clip>" <slug>      # <your-folder>/<slug>-edit: source copy, project.json, vo16.wav, sheet.png, templates
cd <your-folder>/<slug>-edit
python vk.py transcribe                       # words.json + words.txt (about a minute per minute of video)
```
Read `sheet.png` (framing, where his eyes are, captions already burned in?) and `words.txt`. `project.json` says
whether the clip is HLG. Choose the look and the lane, then fill in `brief.md`: his words, the decisions, who owns
what. The brief is the contract; agents work from it, not from the conversation.

**2. First wave** (in parallel, one message, one Agent call each). Brief every agent the same way:

> You are the **<role>** on a video edit for Deon. Edit folder: `<your-folder>/<slug>-edit`. Read
> `~/.claude/skills/video-edit/agents/<role>.md` and follow it; it lists what else to read. The brief is
> `brief.md` in the edit folder. Your scope: <the one or two things specific to this edit>. You own only the files
> your brief names. Run tools as `python vk.py <tool>` from the edit folder. Report in the format your brief ends
> with.

Use `general-purpose` agents for the builders (a fork also works when you already hold context they need).
While they work, do not do their work too. If a requirement changes mid-flight, edit `brief.md` and tell the
agent in a new message once it has reported; do not message a running agent with a changed spec.

**3. Merge** (lead). Read every report. Put the researcher's card lines into `plan.py` or `overlay.json`. Resolve
clashes: two graphics at the same second, a pop-up under a card, a card over a split. Anything an agent flagged as
going beyond what he said gets cut back to what is true, and goes into your final message to him.

**3b. Content check.** Start the **content checker** once `edl verify` has passed. It denoises the dialogue into
`clean/` and returns IN/OUT fixes; apply them to `edl.txt` (then `edl apply` -> `edl verify` again) and use the
cleaned wav in `mix`. It runs once more on the finished file, alongside QC.

**4. Captions.** Start the **captioner** once `edl verify` has passed (or do it yourself on a simple edit).

**5. Assemble** (lead, one step at a time).
```bash
# compose lane
python vk.py captions
python vk.py mix --voice                           # voice only; --music <file> only if he asked for music
python vk.py render_anim --plan                    # only if plan.py has split/anim segments
python vk.py compose --stills 0.8,5.0,12.6,30.2    # LOOK before the full render: Read stills/sheet.png
python vk.py compose -o "<slug>_v1.mp4"

# overlay lane
python vk.py probe --jumpcuts                      # the frames where he cut: cards switch on those
python vk.py overlay preview                       # Read preview.png
python vk.py overlay render
```
Pick still times that hit every graphic's middle, one frame either side of a hard-cut card, every pop-up, and the
last second. Fix what the stills show before rendering in full.

Everything downstream of the cut is built FROM the cut. Whenever `edl.txt` changes, the order is
`edl apply` -> `edl verify` -> `captions` -> `mix` -> `render_anim --plan` -> `compose`. The tools enforce it:
each refuses, by name, an input that was made for an earlier cut or plan, so follow what the message says to run.

**6. QC.** A fresh agent that built nothing (`oh-my-claudecode:verifier` if it is available, else a new
`general-purpose` one; not a fork, a fork has seen what you meant to make). Give it only the edit folder, the file
name and `agents/qc.md`. A FAIL goes back to the lane that owns it; then rebuild from that lane onward in the order
above (a cut fix means captions, mix, animation frames and the render are all redone) and QC the new file. After
three rounds without a pass, stop and tell Deon what is still wrong instead of shipping it.

**7. Deliver and ask.**
```bash
python vk.py deliver "<slug>_v1.mp4" "<Title>"     # refuses a file qc has not passed
```
Tell him, in this order: where the file is; what you changed (seconds removed, what was dropped, what is on
screen); anything you kept back or cut down because the facts did not support it; what QC looked at; the
packager's caption options. Then: **ship it, or change it?** Post only when he says so, with the `post-video` skill.

When he corrects the edit, fix it, and add the rule to `references/house-style.md` with the date and his words.

## Rules the lead holds

1. **One heavy job at a time.** This PC corrupts memory under load. The tools queue themselves on a machine-wide
   lock, so agents can overlap, but never start a raw `ffmpeg` encode or a whisper run outside the tools, and
   builders make stills, not full renders. Tell Deon before anything that will load the machine for more than a
   few minutes.
2. **Every written time is in ORIGINAL seconds**, read off `words.txt`: cuts, segments, events, pop-ups, caption
   skips. The tools map them onto the cut timeline. Only `compose --stills` and `--range` take new-timeline seconds.
3. **One owner per file, one writer at a time.** cutter: `edl.txt`. graphics: `anim.html`, `assets/`, `broll/`,
   and all of `plan.py` except POPS while it is running. researcher: `jobs.json`, `cards.json`, `shots/`,
   `cards/`, `sources.md`; it never touches `plan.py` or `overlay.json` and hands the lead its lines instead.
   packager: `package.md`. Once graphics has reported, `plan.py` is the lead's (to merge the card lines), and then
   the captioner's for POPS only, together with `captions.json`. Everything else is the lead's.
4. **Look at it.** A still, a card, a contact sheet is Read as an image by whoever made it, before it is called done.
5. **Nothing on screen he did not say or a source does not show.** No invented numbers. When his line overstates,
   show what is true and tell him.
6. **A check that did not run is reported as not run.** "QC passed" means `qc.py` printed PASS on this exact file
   and an independent agent read the sheet.

## The fine print

- **It does not publish**, and it does not set up the comment-to-DM automation. It hands over the keyword; the
  `reel-automation` skill takes it from there (spec, next-post slot, attach once the reel is up).
- **`edl retakes` matches words.** It finds a line restarted with the same opening. It cannot see a thought said
  again in different words, or know which of two different takes is better; an agent reads the transcript for that.
- **`edl verify` hears through a transcriber.** It catches a lost or changed word, and a line still said twice.
  It cannot hear a consonant that was shaved but still transcribes correctly; the 70 ms margins are the protection
  against that, not the check. Words that straddle the edge of a removed take are judged by position, which can
  be wrong: read the "heard across each removed take" lines it prints, every time.
- **`qc.py` measures; it has no taste.** Length, loudness, colour tags, black and frozen frames, words. Whether a
  card is ugly or late is for the agent reading the sheet.
- **Two lanes, one trade-off.** `overlay` keeps the HLG picture and the original audio but cannot cut, caption or
  animate. `compose` does all of that and outputs SDR. Dolby Vision is lost in both, as with any re-encode.
- **`anim.html` ships four scene types** (term, list, stat, cta). Anything else is hand-written by the graphics agent.
- **The render lock is cooperative.** It protects the machine only from jobs started through these tools.
- **Built on his 1080x1920 talking-head reels at 30 fps, SDR and HLG.** One horizontal clip was run end to end as
  a check; a 60 fps clip has not been, and would come out at 30. Narrated long-form videos are a different
  pipeline (`<your-folder>/religion-video`), not this compositor.

## Files

```
video-edit/
  SKILL.md
  agents/      cutter, researcher, graphics, captioner, packager, qc      one brief each
  references/  house-style.md, looks.md, machine.md
  scripts/     new_project, probe, transcribe, edl, captions, mix, render_anim, compose, overlay,
               search, shots, tweet, cards, title_pair, qc, deliver      (vkit, timemap, planlib are shared code)
  templates/   plan.py, anim.html, captions.json, overlay.json, jobs.json, brief.md, vk.py   copied into each edit
```

Inspired by Jake Schincariol's youtube-agent-skill (MIT): one job per skill, a real tool behind each one, a style
file every agent reads, and a gate at the end instead of an auto-publish.
