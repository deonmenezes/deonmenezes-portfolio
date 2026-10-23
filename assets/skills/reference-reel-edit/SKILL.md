---
name: reference-reel-edit
description: Edit Deon's footage to match a reference reel - the "sejcurates" creator-ad style (kinetic neon keyword captions, split-screen UI graphics, light-leak transitions, music bed + whoosh/click SFX) or any reel in his Drive "Refrence video" folder. Use when Deon says "see the reference video", "edit it like the reference", "same style/fonts/sound as the reference", "copy this reel", or gives a clip plus a reference.
---

# Edit a reel to match a reference

Deon drops reference reels in `<your-folder>/My Drive\YOUR_DRIVE_FOLDER\Refrence video\` (Drive for Desktop mount; note the spelling).
"The reference" = the **newest** file there unless he names one. His footage is usually on `<your-folder>/` (e.g. `<your-folder>/0922-copy.mp4`).
Deliver to `<your-folder>/<source>-<name>.mp4` **and** copy to `<your-folder>/My Drive\YOUR_DRIVE_FOLDER\Video edits of myself\`.

## Workflow
1. `ls -t "<your-folder>/My Drive/YOUR_DRIVE_FOLDER/Refrence video/"` (the drive letter can change: `python ~/.claude/skills/drive-save/scripts/drive.py where` prints the real path), then copy the newest file locally and run
   `python ~/.claude/skills/reference-reel-edit/analyze_reference.py <ref.mp4> <workdir>`.
   You get the cut list, sheets every 0.5s, a transcript and sound-design hints. Read every sheet, then pull full-res frames for the text and layout.
2. Write down the reference's beat map: cut frames, text per shot, where the text sits, and the audio events (music start/stop, whooshes, the end sting).
3. Map Deon's clips onto that beat map. Build segments with ffmpeg (`minterpolate` for slow-mo, speed>1 via setpts) and composite
   frame-by-frame in Python (PIL text → numpy → ffmpeg pipe). Working template: `<your-folder>/viral-promo\burj\influencer.py`
   (segments, IG logo drawer, text helpers, audio from the reference with `apad`/trim).
4. Verify before delivering: the cut frames match the reference, audio correlates with the reference if reused, a still of every caption, and no stray frame from the next shot inside a segment (scan frame diffs).

## Deon's non-negotiables (learned the hard way)
- **He is the highlight.** At a landmark, the hero shot is Deon next to it (e.g. in the suit at the Burj Khalifa), never the empty landmark. Keep him in frame; use a tracking zoom if the camera pans off him.
- **No watermark and no handle end card.** Drop the reference's corner IG logo + @handle and the IG-logo end screen. Also cut the reference's end **sound** (the Instagram sting): end the video on the music hit, just before the sting.
- **Captions are inspiring and tech-focused**: learn technology, be exceptional, build with AI, win hackathons, be a good speaker, build the future, change the world with AI. Never lifestyle filler ("work from anywhere"), and nothing like "shoot for Mars".
- **Text appears instantly.** No typewriter animation.
- **Every white text gets a thin black stroke** (`stroke_width ≈ font.size/16`, min 3) so it reads on bright shots.
- Don't make claims beyond what he has said on camera. Keep a short list of your own true, public bio lines here and use only those.
- For his own caption-only edits (no reference) see the caption-style memory: white Montserrat Black with a black stroke, highlights #8BDFDD / #FFF9D6, never yellow or red, and keep the middle of the frame clear.

## Style A - "sejcurates" creator-ad reel (latest reference, 72s, 2026-09-24)
Frames: `refs/sejcurates_hi_*.jpg`. It's a voiceover talking-head ad (a ChatGPT "executive assistant" story) with 47 cuts in 72s, about one every 1.5s.

**Structure**
- Hook (0-7s): relatable line over fast travel b-roll (door/suitcase, sunset field, plane wing, car selfie, hills with radial zoom blur). Cut every 0.4-0.6s.
- Problem beat: a B&W shot with a question ("so what's the **plan** Sej?"). The keyword is red **#B80317** and the rest is white.
- Demo body: a **split screen**. Top ~45% is a clean UI or motion graphic on a pale background; the bottom ~55% is the talking head (talking into a phone or typing). Between them sits a dark bar (#1E1E1E-ish, about 45px at 720w) with a centred lowercase subtitle of the phrase being said, in light sans.
- Between tasks: full-frame A-roll with kinetic captions ("Second thing…", "next is to do the **finances**").
- Payoff line on A-roll ("but when you have **executive** assistant…"), then a blue pill CTA, then an IG end card (skip the end card for Deon).

**Kinetic captions** (the signature look)
- Words appear one by one, in sync with the voice. They stack vertically as a loose left- or centre-aligned block placed in open space (the top third, or beside the subject). They don't sit in a fixed band.
- The **keyword** is huge and heavy, in a geometric grotesk (SF Pro Display Heavy / Inter Tight Black look) with very tight tracking (about -4%). It's in **neon #E6FD2B**, or white on busy shots.
- Connector words are small, regular or light weight, white, sitting just above or below the keyword ("my / **favourite part** / of being a creator").
- There's no box behind the text, only a soft shadow. For Deon, add a thin black stroke too.
- Local fonts: `Montserrat.ttf` (variable, Black/Light) in `<your-folder>/viral-promo\captions\`. For the tight-grotesk look, use Montserrat Black with letter-spacing -4 to -6px, or `C:\Windows\Fonts\segoeuib.ttf`.

**Motion graphics (top half of the split)**
- 3D-glassy iOS-style icons on white or pale-blue gradient backgrounds. Blue folder icons with a gradient, a Mail icon, and a dark calendar widget ("Brand Meetings / Sept 10", with day numbers in green). Each icon has a blue pill label (#2F7BFF-ish, white text: "Files", "Emails").
- Icons pop in with a scale overshoot, and folders slide in a row.
- A ChatGPT-style prompt bar (dark pill, mic icon, blue send button) on a pale-blue blurred background. The prompt text types into it (the one place typing is OK, because it's UI).
- Screen recordings of the actual product (docs, Drive grid, spreadsheet, pie chart), with a slow zoom and pan.
- A memoji plus a big blue word ("EDITOR") for people.

**Transitions**
- White/yellow **light-leak / film-burn** flashes: 3-6 frames of blown-out white, or a yellow #F5F542 wash with a vertical streak. Used at section changes (9.0s, 43.5s, 57.0s).
- A pixel/grain dissolve into the split screen (9.0s), radial zoom blur on b-roll (3.5s), and hard cuts everywhere else.
- Slight colour grade: warm, clean, a bit of contrast. The B&W shot is the only desaturated moment.

**Sound design**
- The voiceover is the lead, clean and dry.
- A **music bed runs throughout** (~112 BPM, soft pop/lo-fi, tonal). It sits around -13 dB relative in the pauses and is ducked under the voice (voice RMS about -17 dB relative). It never stops until the end.
- **Whooshes** (broadband noise swooshes) land on light leaks and split-screen entries (29.3s, 43.5s, 59.7s).
- **UI SFX**: short high-pitched click/pop ticks when an icon or pill pops in, plus a keyboard/click texture during typing shots.
- **End**: the music cuts, then the Instagram-logo sting (the same sting as the influencer-trend reference, corr about 0.45). **For Deon, end before the sting.**
- **SFX library: `<your-folder>/SFX Library\`** (1,600+ sounds in 17 themed folders: whoosh, suspense, risers, impacts, glitch/tech, UI clicks/pops, dings, typing, camera, success, crowd, meme, rewind, clock/heartbeat, bass drops, vocal hype). `_index.csv` lists durations. Pick the sounds from there first.
- No music-generation API keys are set (`<your-folder>/OpenMontage\.env` entries are empty). Use local tracks you have the rights to: `<your-music-folder>/<hype track>.mp3` for hype, `<your-music-folder>/<licence-free track>.mp3` otherwise. The SFX pack is `<your-sfx-folder>/<whoosh pack>.mp3` (slice single whooshes by onset). Mix: voice about -16 LUFS short-term, bed 12-15 dB under the voice, whoosh peaks about -10 dBFS, then `loudnorm I=-14 TP=-1.5`.

## Style B - "Omg that's so cringe… trying to be an influencer lol" trend (15s)
Frame: `refs/influencer_trend.jpg`. Delivered for Deon as `<your-folder>/0922-influencer-burj.mp4` (template `<your-folder>/viral-promo\burj\influencer.py`).
- 0-5.27s: a slow-mo hero shot (Deon at the Burj in the suit, at 0.19x). Quote centred at about 46% height in white bold sans: *'Omg that's so cringe! Deon's trying to be an influencer lol'*.
- Then hard cuts at frames 158/185/210/236/259/283/309 (30fps), on the beat drop. The small line "Yeah… influence you to" sits at y≈505 (1080×1920), with a punchy caption right below it in Montserrat Black caps, shown instantly.
- The reference audio is reused 1:1. The music ends on a hit at 11.03s and the IG sting starts at about 11.5s, so the video ends at 11.4s (342 frames).
