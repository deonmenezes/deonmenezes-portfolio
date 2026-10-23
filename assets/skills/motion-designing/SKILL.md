---
name: motion-designing
description: Motion engineering for anything that moves on screen in Deon's videos - title cards, product/app demo shots, launch clips built from real product screens, logo reveals, face/photo runs, animated closes. Turns "make it look good" into a brief with frame numbers: what enters, when it lands, how long it stays readable, what owns the screen, which frame each sound hits. Use whenever Deon says "/motion-designing", "make the motion better", "the animation feels off / too fast / too slow", "make a launch video / launch clip / product demo video", "animate this app screen", "how does this reference move", "copy this entrance / transition", "Remotion", or when another skill's graphics need their timing designed or repaired. Not for cutting talking footage (video-edit), copying a whole reel style (reference-reel-edit, clean-explainer-style), or posting (post-video).
---

# motion-designing

Motion is engineered, not vibed. Every moving thing gets a job, a start frame, a landing frame, a readable hold and
an exit, written down before any code. Then it is built as a pure function of the frame number, checked as stills,
repaired one scoped edit at a time, and only then watched at speed.

Method distilled from beamnxw, "Motion Engineering with Opus 5.5: Build Launch Videos You Can Sell" (X article,
2026-10-09, https://x.com/beamnxw/status/2108616740846420354), adapted to this machine's video-edit pipeline.

Read before planning:
- [references/motion-rules.md](references/motion-rules.md): the craft rules with numbers (entrances, springs,
  reading windows, ownership, blur, sound, scene boundaries).
- If the piece lives inside a video-edit project: `~/.claude/skills/video-edit/references/house-style.md` and
  `machine.md`. His stated preferences beat anything here.
- If he wants a Remotion product clip: [references/remotion-lane.md](references/remotion-lane.md).

## Which lane

| the job | lane | renderer |
| --- | --- | --- |
| a card, title, panel or face run inside one of his edits | **anim lane** | the edit's `anim.html` + `render_anim.py` (video-edit) |
| a standalone launch clip / product demo from real screens, square or 16:9 | **Remotion lane** | `npx remotion` in its own project folder |
| a look copied from a whole reference reel | not this skill | clean-explainer-style / reference-reel-edit, then come back here for timing fixes |

Both lanes obey the same contract: **a frame is a pure function of its frame number.** No CSS transitions, no
timers, no unseeded randomness, no wall clock. That is what makes any frame reproducible, renderable as a still,
and editable without touching its neighbours.

## A run

`M=~/.claude/skills/motion-designing`

**0. Intake.** Write down his exact words. Find the assets: real product screens, logo, font, footage, audio. A
real screen beats a drawing of one. List what is missing and ask for it before building, not after.

**1. Reference (only if he gave one).** Give the reference ONE job: a card's controlled landing, a transition that
keeps the product in view, a cursor action that makes the result obvious. Not "the vibe".
```bash
python $M/scripts/refscan.py reference.mp4 --out ref                    # probe + 2 fps overview + contact sheet
python $M/scripts/refscan.py reference.mp4 --out ref --burst 3.2,7.5    # consecutive source frames around events
```
Read `ref/sheet.png`, then the burst sheets. Fill `ref/REFERENCE.md` (refscan writes the skeleton): entrance,
landing, hold and cut as source frame numbers; start and landing boxes; direction, duration, scale, opacity,
overshoot; the order product, headline and labels appear; the readable hold; the state carried into the next shot.
**Label every value MEASURED (read off a frame), ESTIMATED (eyeballed) or PROPOSED (our creative choice).**
Positions from vision are approximate: check any that matter against the extracted frame. Keep reference timings
in the reference's own frame rate, labelled with it.

**2. The brief.** Copy [templates/BRIEF.md](templates/BRIEF.md) into the project and fill it. Five decisions belong
in it: the goal and viewer, delivery (size, fps, length, assets), layout (boxes in pixels, palette, margins, layer
order), the scene timeline in frames, and the review stages. Write times in seconds first, convert to frames at the
chosen fps, and keep both. The brief is the contract; nothing gets built from the conversation.

**3. Check the timeline before building.** Write `timeline.json` (format in `scripts/timeline.py --help`), then:
```bash
python $M/scripts/timeline.py timeline.json
```
It prints the seconds-to-frames table and fails on: a reading hold shorter than its text needs, two things owning
the screen at once, events out of order, a scene-local frame that does not map back to its global frame.

**4. Check the longest copy.** Lay out the longest headline you expect to reuse, in the real font, and render its
landing frame. Three lines = stop: shorten the copy, widen the box, or move the extra line to its own shot. Record
the headline width, max lines, logo space and final positions in the brief.

**5. Build the first stage only.** The opening (or the one scene being changed). Every moving value comes from the
frame: interpolate or spring between stored constants (offset, destination, duration, landing settings kept
together so a revision touches one place). Then render stills, not the film:
- anim lane: `python vk.py render_anim --plan --stills` (or `render_anim <scene> <dur> <ev> --stills a,b,c`)
- Remotion lane: `npx remotion still <Comp> out/<name>.png --frame=<n>`

**6. The three-stills gate.** Opening frame, product-result frame, closing frame. Read them as images. Is the main
text readable? Is the result visible? Anything cropped or overlapping? Does the close have room? Fix what the stills
show. Then render a short moving range around each scene boundary (2 s) and look at how attention moves across it.

**7. Sound on its event frames.** Every cue sits on a visible event: the click on the press frame, the reveal hit
on the reveal frame, the riser's drop on the cut. A sound file's audible hit is rarely at its start:
```bash
python $M/scripts/hitpoint.py whoosh.wav --event 195 --fps 30     # where to place the file so its hit lands on 195
python $M/scripts/hitpoint.py mix.wav --check 6.50,7.00           # is there really an onset on these times?
```
Write the cue list next to the visual events in the brief. Music and effects stay on separate tracks with their own
level.

**8. Repair loop.** Every correction is written in the four-field form of
[templates/correction.md](templates/correction.md): location (global frame), observed problem, the one change,
what must stay fixed. Order: missing information and unreadable text first, then timing, then visual detail. One
scoped edit, re-render only the affected frames plus the neighbouring boundary, then play at normal speed.
For a critique, use a fresh agent that built nothing: give it the brief, the stills and the frames, ask for at most
five frame-specific corrections, accept or reject each, and send the accepted ones to the builder.

**9. Export what was approved.** Render the full piece only after picture and sound passes are accepted. Watch it
once at normal speed reading every line aloud. Probe it (size, `avg_frame_rate`, duration) against the brief. Keep
the approved render with its brief, timeline and cue list. Inside a video-edit project the normal QC and
`deliver` rules still apply.

## Rules

1. **Purpose before motion.** Each movement is one of: entrance (introduce the object), hold (time to read it),
   pointer/cursor move (show the next action), transition (carry the viewer to the next state). A movement with
   none of those jobs is cut.
2. **One owner at a time.** The button owns the screen until it responds, then the result owns the reading window.
   If two things fight (a cursor crossing a headline during an entrance), delay one or reroute it.
3. **Reading windows are counted from legibility,** not from the start of the entrance, and checked by reading
   aloud at normal speed. Labels are checked at phone size.
4. **Stills before film.** No full render until the stills pass. No new scene until the previous one is approved.
5. **One scoped edit per correction,** with the frames to re-check named in advance.
6. **Measured, estimated and proposed are never mixed** in a reference report or a status message.
7. **Nothing on screen that is not true:** real screens, his real numbers, real names spelled the way he gave them.

## Files

```
motion-designing/
  SKILL.md
  references/  motion-rules.md (the craft, with numbers), remotion-lane.md (setup, launch-clip package)
  templates/   BRIEF.md (five decisions + timeline), correction.md (four-field fix)
  scripts/     refscan.py (reference breakdown), timeline.py (frames, holds, ownership), hitpoint.py (sound hits),
               inlane.py (run a heavy render inside video-edit's machine lane), _lane.py (shared helpers)
```
