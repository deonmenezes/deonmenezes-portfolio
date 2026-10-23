---
name: youtube-script
description: How to write narration scripts for Deon's long-form YouTube videos (channel "Deon Does Research") so they sound like a person telling a story, in the style of ColdFusion and Founders Podcast, and not like generated text. Use BEFORE writing or editing any script.py / narration for a YouTube video or explainer (<your-folder>/rust-video, <your-folder>/harness-video, <your-folder>/sonnet55-video, <your-folder>/inference-video and any new one), and whenever Deon says "write the script", "the script sounds AI / generated / sloppy", "make it human", or "like ColdFusion / Founders".
---

# Writing a YouTube script that sounds human

Deon's complaint (2026-10-04): "our script sounds so generated and sloppy, please make it human", with ColdFusion and Founders Podcast as the bar. This file is the fix. Read it before the first line of narration, and run the linter before any voice is generated.

The rules below come from reading real transcripts: ColdFusion's Dropbox, Flappy Bird and AI-industry episodes, and Founders' Claude Shannon and Elon episodes. To re-check against a fresh episode, pull the captions with `yt-dlp --skip-download --write-auto-subs --sub-langs en-orig --sub-format json3 <url>`.

## What was wrong with our scripts

The old scripts were accurate and still read as generated, for five reasons.

1. **They opened with a list of sections.** "In this video, we'll walk through its first four chapters. Chapter one..." All four scripts did this. ColdFusion does say "in this episode", but what follows is the questions it will answer, never the sections.
2. **Nobody was telling the story.** The inference script uses "I" twice in 4,000 words (0.5 per thousand) and the harness script never does. The references run from 3 per thousand (ColdFusion's Dropbox) to 24 (Founders).
3. **They were lists of features, with no person and no order of events.** "It landed BSN. Solari. DLSS support." A viewer can't follow a list; they follow someone who wanted something.
4. **Reveals were announced over and over.** "And here's where it gets ridiculous." "Now for the part that changes everything." "And that's the punchline." The Rust script did it five times in eight minutes. A ColdFusion episode twice that length does it once or twice.
5. **Paragraphs ended on slogans.** "Same tool, same week, opposite discipline." "So delegate the task, never the judgment."
6. **Sources were summarised and never heard.** The inference script has 1.7 "said / wrote / told" per thousand words. The references have 3 to 7.

Hype words were the smallest part of the problem. ColdFusion and Founders say "genuinely", "essentially" and "simply" two to five times per thousand words. Only the Rust script was over that (eight); the other three were under it and still sounded generated. Removing adjectives from a feature list leaves a feature list.

## Before writing: four things to have

Don't draft until each of these has an answer in one plain sentence.

1. **The question.** One thing the viewer wants answered and can't answer themselves. ColdFusion asks it out loud in the first minute: why does it feel like nobody uses Dropbox anymore? Why would he delete a game earning $50,000 a day?
2. **The person.** Whose story is this? A name, an age, a place, what they wanted. For a technical topic it is whoever built the thing or hit the problem first. A book summary still has one: the author, or the engineer the chapter is about.
3. **The receipts.** At least three direct quotes with who said them and where, and the dates and numbers the story turns on. Find these in primary sources during research, and fact-check before any voice is generated (re-voicing burns a full pass of credits).
4. **The take.** What Deon thinks, in a sentence a friend could disagree with. If it isn't obvious from what he has said, ask him one question before writing. Never invent a personal story for him. Keep a short list of things about you that are true and usable, and use only those.

## Structure

1. **Cold open on a moment.** A date, a place, a person doing something, or the best quote from the source read straight with no introduction. ColdFusion's Dropbox episode opens on the 2008 demo and the waiting list of nearly 200,000. Founders opens on the strongest passage of the book and only afterwards says what it was.
2. **The question, asked plainly.** Then one or two sentences of what the viewer will know by the end, stated as a claim and not as a list of sections. Often it is the common version of the story followed by what that version leaves out.
3. **The story in the order it happened.** Each section answers the question the previous one raised. Move forward with "but", "so", "then", "meanwhile", "by 2014". If two paragraphs can swap places without anything breaking, it is still a list.
4. **Let the sources talk.** Read the quote, name the speaker, then say in plain words what it means or why it stuck with you. This is most of what Founders is.
5. **Be fair once.** One honest "to be fair" or "to be clear" where the other side gets its best argument. It makes the rest more believable.
6. **End on meaning, then stop.** What this says about something bigger than the topic, in Deon's own view. Return to the opening image or quote. One question to the viewer, one line of sign-off. No recap of the sections.

## Sentences

- **Say the fact and let it land.** "Drew said no." "People hated this game." No sentence should tell the viewer how to feel about the next sentence.
- **Give a number something to stand next to.** Two gigabytes free against Google's fifteen. Fifteen months from 100,000 users to four million.
- **Use the detail nobody would make up.** The rented Zipcar on the way to meet Steve Jobs. Milestone printouts that ran out of wall and went on the ceiling. One of these is worth a paragraph of adjectives.
- **Turn the abstract into a picture.** Founders explains fire control as a gun the size of a two-storey house, on a moving ship, aiming at a plane doing 350 miles an hour.
- **Talk to one person.** "You" is one viewer. Ask them things: when did you last open Dropbox?
- **Mix lengths.** About one sentence in eight should be five words or fewer, and it should follow a long one. They must be complete sentences with a verb, because clipped fragments sounded robotic in the voice.
- **Leave a thread open.** "Hold that thought." "We'll get to that." Then pay it off.
- **Repeat the one line that matters.** Founders says the key line twice, the second time in his own words.
- **Asides are allowed.** A short dry remark in Deon's voice, once or twice a video.

## Wording limits

These were counted on the five reference transcripts, and the linter enforces them.

**Never** (zero uses in the references):
- A hook that lists the sections: "we'll break down A, B, and C", "we'll walk through", "over the next few minutes".
- "Let's dive in", "let's start with the basics", "let's unpack".
- "Now for the part that", "the punchline", "the kicker", "changes everything", "let that sink in".
- Three in a row for rhythm: "three games, three studios, three engines". Use the number of items the facts have.
- delve, leverage, seamless, game-changing, revolutionary, "at its core", "in essence".
- A slogan to close a paragraph. End on the last fact. (The linter prints every short closing line so they can be read aloud.)

**Rarely** (the references do each of these once or twice in an 18-minute episode; the linter allows one per 1,500 words):
- An announced reveal: "here's what I find craziest", "this is where things get strange".
- A question the script answers itself: "Why?"
- "It wasn't X. It was Y."

**Five or fewer per thousand words:** genuinely, truly, literally, wild, insane, massive, quietly, simply, essentially, basically, ultimately.

## Rules that still apply from earlier feedback

- Every technical term is defined out loud the moment it first appears, in a complete sentence, and shown as a definition card. Work the definition into the story ("a diff, which is the list of lines a change adds and removes") so it doesn't stop the story.
- Spoken form for the voice: acronyms letter-spaced ("M W two", "W G P U"), numbers written as words, no symbols.
- One beat is one paragraph is one voice take.
- Quote sources in under 15 words or paraphrase, and put every source link in the description.

## Check before voicing

```bash
python ~/.claude/skills/youtube-script/lint_script.py <your-folder>/<project>/script.py
```

It lists every phrase over its limit with segment and beat, and compares first-person use, "you", questions, quoted sources and short sentences with the reference numbers. Fix everything marked `FIX` and re-run until it prints `OK`.

A pass only covers wording. The linter can't see whether the script has a question, a person and a story, and the old inference script comes close to passing on wording alone. So after it passes:

1. Check the four things under "Before writing" are on the page: the question is asked in the first minute, the person is named, at least three sources are quoted, and Deon's take is said once.
2. Read the hook and the ending aloud. Anything you would not say to a friend across a table gets rewritten.

## Worked example: the Rust video hook

Before (what shipped):

> Watch this. A soldier in full Modern Warfare two gear quick scopes a cow, in an endless Minecraft world, then rides away on a skateboard and kicks a kickflip off the explosion. Three games, from three different studios, running on three different engines, playing as one. And here's the part that sounds completely made up. This is not a mod.
>
> Over the next few minutes, we'll break down what this thing actually is, the from scratch Rust rewrites hiding underneath it, the A I agents that wrote most of the code, and the bigger Rust game engine wave that quietly made all of this possible.

After (same facts):

> At the end of September twenty twenty six, a YouTuber called Chasm uploaded a clip that looks like a joke edit. A soldier in Modern Warfare two gear quick scopes a cow. The cow is standing in a Minecraft world. Then the soldier gets on a skateboard and kickflips away from the explosion.
>
> It isn't an edit. You can download it and play it tonight. It is one zip file with one executable inside, and you point it at games you already own. Nothing gets injected into those games, because the originals never run.
>
> So what is running? Three separate rewrites, built from scratch by a handful of hobbyists, in a programming language called Rust. And the readme of the one underneath all of it says the whole project was written by an L L M. So how do a few hobbyists and an A I rebuild Modern Warfare two? I went through the repositories and what the developers wrote about them. This is the story of how it happened.

The whole script rewritten this way is at `<your-folder>/rust-video/script_human_draft.py` (a draft for comparison; the published video still uses `script.py`).

And a middle beat. Before:

> And here's where it gets ridiculous. It reads M W two's zone assets natively, but it can also read assets from M W three, and from Black Ops, into the same intermediate representation. That means M W two mechanics, M W three maps, and Black Ops weapons, all running in one executable, with zero manual asset conversion.

After:

> I W four L reads Modern Warfare two's asset files directly. It also reads the files from Modern Warfare three and from Black Ops, and turns all of them into the same internal format. So you can load a Modern Warfare three map, pick up a Black Ops weapon, and move the way Modern Warfare two moves, inside one program. Nobody converted a single asset by hand.
