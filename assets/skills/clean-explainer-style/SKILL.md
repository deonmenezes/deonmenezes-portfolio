---
name: clean-explainer-style
description: The animation look Deon asked for after the @speedy_devv "PewDiePie Ajax" reel - one clean light or dark canvas, captions fixed at the top with the spoken word bold and one keyword inside a blue design-tool selection box, real posts and pages redrawn as white cards, serif-italic hero words, numbers that count while they are said, scenes that whip out in 4 frames and focus in over 12, objects that change in place instead of cutting. Use whenever Deon says "make it like the reference", "that aesthetic animation style", "like speedy devv", "like the PewDiePie / Ajax reel", "the selection box captions", "clean animated explainer", "animate it like the Starlink video", "make the animations so good", "fully animated, no face", sends a reference video and says "reverse engineer it" or "I want it to be like that", or asks what styles were learned from a reference. Also use it to plan the visuals of any narrated explainer (reel or long-form) once the script exists, and to take a new reference video apart. It holds the style rules, a tested HTML kit that renders frame by frame, and the script that breaks a reference down. Not for writing narration (youtube-script), the voice / build / upload chain of a long-form video (youtube-video), cutting footage he filmed (video-edit), or matching the neon-caption creator-ad look (reference-reel-edit).
---

# clean-explainer-style

A narrated explainer with nobody on camera, where every picture is the thing the sentence is about and the whole
video looks like one designed object. The rules below were read off one reference reel
([the breakdown](references/reference-breakdown.md), with frames) and then proved by rebuilding its components
in `assets/` and rendering them.

Look at `references/ref_detail_type_and_cards.jpg`, `references/kit_dark.png` and `references/kit_comparison.png`
before reading on. The pictures explain the look faster than the words do.

## The look, in seven rules

Each rule has its reason, because the reason is what tells you what to do in a case this file does not cover.

1. **One canvas, one subject.** Off-white `#F8F8F8` or near-black `#100C0C`, with a grid so faint it only shows on
   a still. One thing in the middle, a lot of empty space, nothing touching the edge. Emptiness is what makes
   the one thing look chosen. Light is for people, companies and documents; dark is for the abstract mechanism
   and anything that glows. The canvas changes only on a hard cut, and only where the story changes register.

2. **Every picture is the thing the sentence is about, moving while it is said.** No stock clips, no B-roll, no
   decorative shapes, no icons standing in for ideas. If the line names a post, the post is on screen; if it
   gives a number, the number is counting. This is the rule the rest serve, and it is also Deon's own
   ("show like actual animations", 2026-10-07). The test for any frame: cover the captions; can you still tell
   which sentence it belongs to?

3. **Real things, redrawn clean.** Posts, notifications, model pages, papers, repositories and profiles appear as
   white cards with 18 px corners and a soft wide shadow, laid out like the real interface. The exact line that
   matters gets the selection box. A card is a quotation: it may only carry words and numbers that are in the
   source.

4. **Captions in one fixed place.** Top centre, about 2 to 6 words at a time, two lines at most. The word being spoken is bold and
   full contrast; words already spoken drop to regular weight and mid grey; a new word arrives blurred and a few
   pixels low and is sharp in 3 frames. One keyword per clause gets the **selection box**: a thin blue outline,
   pale fill, two round handles at opposite corners, drawn on just after the word lands. It looks like someone
   selecting the word in a design tool, which is why it reads as "look at this" without shouting.

5. **Three typefaces, one job each.** A geometric sans for captions and interface text (Figtree here; the
   reference's is in the Google Sans family). A serif italic for hero words, names and terms being defined
   (Instrument Serif Italic). A monospace for data, dates, small labels and source chips (JetBrains Mono).
   Matched by eye. If a fourth face appears, something is wrong.

6. **Almost no colour, so colour means something.** Black, white and greys, plus one accent per idea: purple for
   the model, red for refusal or damage, amber for a warning. The selection blue belongs to the selection box and
   nothing else. Before adding a colour, say what it stands for; if the answer is "it looks nice", leave it out.

7. **Leave fast, arrive soft, never sit still, and do not cut.** The old scene whips upward with heavy vertical
   motion blur in about 4 frames. The new one comes up from just below, slightly tilted and out of focus, and
   takes about 12 frames to settle. After that it keeps drifting, slowly, for as long as it is on screen. And a
   new idea is a change to the thing already there (the logo drops into the laptop, the flat map tilts into the
   floor of a 3D space), not a new slide. The reference has 7 hard cuts in 131 seconds.

What it never does: stock footage, a talking head, lower thirds, progress bars, shadows or gradients behind text,
two ideas on screen at once, a transition that is only decoration.

## Deon's rules sit on top of the reference

Where they disagree with the reference, his win.

| his rule | what it changes here |
| --- | --- |
| Every technical term is defined in a full sentence, on screen, where it first appears | The definition card (`.def`): the term in serif italic, and under it the SAME sentence the narration speaks. One place on the stage for all of them |
| Nothing on screen the source does not support | Cards carry only words seen on the source. A question stays a question (keep the question mark). Estimates are labelled as someone's estimate |
| Real pages and posts beat designed ones | Capture the real thing first (the `shots` tool in video-edit). Redraw it as a card only when the capture is unusable at this size, and keep the wording exact. If all you were given is the wording (no page to open), redraw from that wording, invent nothing around it (no avatar, handle, like count or logo you have not seen), and say in the plan and to Deon that the card is a redraw |
| Real people: real photos only | Feathered cut-out portraits with the licence recorded. No AI or composited images of real people |
| Every source is shown | The source chip (`.chip`), bottom left, mono, grey: outlet and date, whenever something real is on screen |
| One heavy job at a time on this PC | Stills and strips first; one mp4 render at a time |

Do not copy the reference creator's own assets: the watermark, the logo, the follow animation. The system is
what is being borrowed.

## How to use it

### 1. Plan before drawing

The narration comes first (`youtube-script`), and the word timings come from the voice, so a scene can be planned
before the voice exists but can only be timed after.

Give each chapter one **world**: a single scene that everything in the chapter happens inside (a time rail that
posts land on, a rail of documents, a map with a gate). Inside a chapter nothing cuts. A hard cut and a canvas
flip happen between chapters. In a short reel, one world can carry the whole middle; the reference holds a
single map metaphor for 63 seconds.

Pick one world to be the **held metaphor**: the picture the viewer will remember, introduced once and returned
to with one thing added each time.

Then write one row per narration beat:

| beat | on the stage | kw | motion |
| --- | --- | --- | --- |
| what the line says, in four words | the real thing or object, and the number if there is one | the caption words that get the selection box (about one per clause) | how it changes from the frame before |

If the "on the stage" cell says "text", "icon" or "graphic", the beat is not planned yet. Name the thing.
A finished example with 33 beats is `<your-folder>/starlink-ambani-video/visual_plan.md`.

What to put on stage, by what the line is about:

| the line is about | put this on stage |
| --- | --- |
| something someone posted or published | the post or page as a card, the key words selected inside it |
| a number | the number, large, counting to its value as it is said, with a small grey label under it |
| a new term | the word in serif italic, built or revealed, with its sentence under it |
| a sequence of events | a rail with marks at the real times or dates, and the gaps counted |
| a comparison | the two things as the same shape at true scale (bars, dot fields) |
| a mechanism | one physical metaphor, held and changed in place. An everyday object (a smoke alarm, a gate, a queue) beats a diagram |
| a person | a real photo, once, feathered into the canvas; after that, their words on cards |
| an opinion of the narrator's | less on screen, not more: the question in serif italic and the object it is about |

### 2. Build with the kit

Copy `assets/` (kit.css, kit.js, scene.html, fonts/) into the project, for example `<project>/anim/`, and replace
the two demo scenes in `scene.html` with the video's own. Open `scene.html` to see the pattern; it is short.

A scene is `{ canvas, dur, build(stage, ev), draw(t, parts, ev) }`. `build` creates every element once. `draw`
runs per frame and must be a **pure function of t**: no CSS transitions, no timers, no randomness. Frames are
screenshotted one at a time, sometimes out of order, so anything driven by the clock renders wrong.

| helper | what it does |
| --- | --- |
| `K.captions(stage, words)` | the caption system. `words = [{t, w, sel, join, nl, clear}]`: `t` = second the word is spoken, `sel` = give it the selection box, `join` = put it inside the previous word's box, `nl` = start line two, `clear` = start a new phrase |
| `K.life(el, t, {...})` | one element's whole life: soft arrival at `in`, slow drift, fast whip-out at `out` |
| `K.selHTML(text, id)` + `K.sel(span, t, t0)` | the selection box on words inside a card, drawn on at `t0` |
| `K.count(el, t, t0, dur, from, to)` | a number that runs while it is being said |
| `K.dots(parent, {cols, rows, size, gap, color})` | a field of dots for a comparison at true scale; `.fill(k)` lights the first k |
| `K.blur`, `K.out`, `K.out5`, `K.inn`, `K.io`, `K.p`, `K.lerp` | focus + vertical motion blur, easings, progress |

`K.life` options (the object is rebuilt every frame, so any of them may be computed from `t`, which is how a
card steps aside or a number moves to a new place):

| option | meaning | default |
| --- | --- | --- |
| `x`, `y` | where it rests: its centre, or with `anchor: "left"` the middle of its left edge | required |
| `anchor` | `"left"` for source chips, labels and counters, so a changing width does not shove them | centre |
| `in`, `out` | second it starts arriving / leaving (no `out`: it stays) | `in` required |
| `leave` | `"fade"`: dissolve in place in 6 frames, for one thing leaving while its neighbours stay | whip up |
| `tilt`, `rest` | degrees it arrives tilted by / rests at. Cards: `tilt: -2.5` | 0 |
| `rise`, `blur` | px it comes up from / px out of focus on arrival (small text: 4-6) | 70, 14 |
| `scale` | resting scale | 1 |
| `inDur`, `whip` | arrival and exit, seconds | 0.40, 0.14 |
| `drift` | `0` holds it dead still: rails, ticks, chips | drifting |
| `dim` | `{at, to}`: step back to opacity `to` from second `at`, behind a newer card | none |

Components in `kit.css`: `.card.post` (a social post), `.card.quote` (a line someone said as an outlet reported
it: outlet, the words, who and when; use it so a news quote does not pass for a tweet), `.card.doc` (a
document), `.card.shot` (a framed capture), `.def`, `.big`, `.chip`, `.rail` / `.tick` / `.gap`. Colours and
sizes are tokens at the top of the file; change the token, not the component.

Where things live on a 1920 x 1080 stage: the definition card rests at about (1505, 590), the right third, and
keeps that place for a whole chapter; the source chip is `anchor: "left"` at (72, 1008); the subject is centred
at about x 815-960, y 560-630, depending on what shares the stage. Captions always draw on top.

Elements that `K.life` moves need the class `it`, and nothing may set `position` on them again (a
`position: relative` on a card silently stacks the cards down the page).

Caption timing: take the voice's word timings (`words.json` from video-edit's `transcribe` or from
`breakdown.py`) and set each word's `t` to its start. Keep all of a scene's times in one object at the top of
the scene, so re-timing to a new take is one edit. Break phrases where the speaker breathes, not every N words.

Choose the boxed word by asking which single word the clause would be pointless without. One box per clause,
even when the clause is split across two phrases. When the keyword is more than one word (a spoken number like
"twenty lakh", a two-word name), box the whole thing: `sel` on the first word, `sel` + `join` on the rest, and
the box widens as it is said.

### 3. Check it as pictures

```bash
python ~/.claude/skills/clean-explainer-style/scripts/render.py anim/scene.html <scene> --stills 0.7,1.6,3.5
python ~/.claude/skills/clean-explainer-style/scripts/render.py anim/scene.html <scene> --strip 1.45:0.5
python ~/.claude/skills/clean-explainer-style/scripts/render.py anim/scene.html <scene> --mp4
```

Read the stills and at least one strip (every frame of an arrival or an exit) before any mp4. A full scene is
30 screenshots a second, so a wrong layout found after the render costs minutes; found on a still it costs
nothing. Put a still next to `references/ref_detail_type_and_cards.jpg` and ask:

- Is there one subject, with empty space round it?
- With the captions covered, is it obvious which sentence this frame belongs to?
- Is every word on a card in the source?
- Is exactly one caption word boxed per clause, and is it the right one?
- Does every colour stand for something?
- In the strip: does the old thing leave in about 4 frames? Does the new one do most of its travel in the
  first 5 frames and keep sharpening until about frame 10?
- A strip shows order and speed only. For tilt, focus and blur, take one full-size still in the middle of the
  move. For drift, compare two stills a few seconds apart: it is about 1 px a second, invisible in a strip.

Scenes also render through video-edit's `render_anim.py` (same page contract: `window.setT(t)`, title `READY`),
which is the route when the scene is an overlay inside one of his filmed edits.

### 4. Put it together

The rendered scenes are the picture; the voice and the build chain belong to `youtube-video` (long-form) or
`video-edit` (a reel cut from his footage). The reference's sound, as measured: fast narration (211 words a
minute), pauses that are never silent (a quiet bed about 13 dB under the voice), a bass-heavy sting after the
last word. For long-form, speak at a normal 160-170 and let the drift carry the slower pace.

## Motion numbers (30 fps)

| move | frames | notes |
| --- | --- | --- |
| a caption word arriving | 3 | from blurred and 7 px low |
| the selection box drawing on | 6-7 | first handle, box wipes left to right, second handle; starts 2 frames after the word |
| a card or object arriving | 12 | from 70 px below, tilted 2-3 degrees, out of focus; most of the travel in the first 5 frames, focus resolving to about frame 10; no bounce |
| a scene leaving | 4 | straight up, accelerating, vertical blur only |
| a counter | as long as the number takes to say | ease-out; starts on the number's first word, ends on its last (15-25 frames for a short one) |
| drift | always | about 1 px a second upward and a fraction of a percent of scale |
| a new visual event | every 1-2 s in a reel, 2-3 s in long-form | always on the word it belongs to |

## Vertical (9:16)

The reference itself is vertical. On a 1080 x 1920 stage: captions at about 14-20% down the frame
(`--cap-top` near 270 px, `--cap-size` near 72 px), the subject centred in the middle third, cards about 85% of
the width, the source chip bottom left above the platform's own interface. Pass `--size 1080x1920` to
`render.py`. The demo scenes are laid out for 1920 x 1080 and need new coordinates, not scaling.

## When he sends a new reference

```bash
python ~/.claude/skills/clean-explainer-style/scripts/breakdown.py <video> <project>/reference
```

It writes time-stamped contact sheets, frame-by-frame strips at the cuts, the canvas colour per second, the hard
cuts, and (unless `--no-transcript`) the narration's pace and how loud the pauses are. Read every sheet, then ask
for strips at the moments where something arrives, leaves or turns into something else (`--strip 11.5:1.2`).
Write up what it does in the same seven headings as above, labelling anything judged by eye. If the new reference
is a different look, it gets its own tokens and its own notes; do not bend this skill's rules to fit it unless he
says the new one replaces this one.

## What the kit does not do yet

- **No 3D.** The reference's rotating logo, cluster space and glass plate need three.js (or Blender for stills).
  The kit covers the flat layer: captions, cards, counters, rails, definitions, and the motion.
- **No object-to-object morph helper.** "The logo drops into the laptop" is two `K.life` calls with matching
  positions today, written by hand.
- **Not tested at 9:16**, and not yet used in a finished video. The first full use is the Starlink long-form
  (`<your-folder>/starlink-ambani-video`), not built as of 2026-10-10.
- **Tested once by a fresh agent** (2026-10-10): it built `references/kit_comparison.png` from this file alone.
  Its sixteen notes were folded back in (joined selection boxes, left anchors, fade exits, the quote card, the
  dot field, bigger strips).

## Files

| file | what it is |
| --- | --- |
| `assets/kit.css` | tokens and components |
| `assets/kit.js` | the motion helpers, all pure functions of t |
| `assets/scene.html` | two demo scenes (dark `post`, light `trail`) to copy from |
| `assets/fonts/` | Figtree, Instrument Serif, JetBrains Mono with their open-font licences, so renders do not depend on the network |
| `scripts/render.py` | stills, frame strips or an mp4 from a scene |
| `scripts/breakdown.py` | takes a reference video apart |
| `references/reference-breakdown.md` | the reference, measured and described, with frames |
