---
name: reel-automation
description: Set up the comment-to-DM automation behind one of Deon's @deon_tech reels in InstantDM (he says "instandm") - write the DM and the keyword into a spec, arm the Next Post Automation slot before he posts, attach it to the reel once it is up, and diagnose a reel that "isn't sending DMs". Use whenever Deon says "set up the automation", "next post automation", "automate my next reel/post", "setup instant dm / instandm", "reel is up", "video uploaded, check automation", "the automation stopped", "it's not automated", "nobody is getting the DM", "add/remove the follow gate", or when a reel edit ends on "comment <word>". Not for editing the reel (video-edit), posting it (post-video) or manual DMs from the browser.
---

# reel-automation

Every reel of his ends on "comment <word> and I'll send it to your DMs". This skill makes that sentence true:
someone comments the word, InstantDM sends them one DM with the thing he promised and posts a short public reply.

One spec file per reel, one script for everything: `S=~/.claude/skills/reel-automation/scripts/reel.py`.
Nothing is written to InstantDM without `--apply`; every command prints what is there first.

```bash
python $S new <slug>                     # flows/spec-<slug>.json from the template
python $S check <slug>                   # links live, DM short and link-first, no link in public lines, gate on
python $S arm <slug> --apply             # onto the Next Post slot, read back and verified
python $S attach <slug> latest --apply   # after he posts: onto the reel, verified, record saved, slot disarmed
python $S status [n]                     # the slot and the newest n posts               (read-only)
python $S diag [n | post_id]             # what happened to the last 30 comments on each (read-only)
python $S disarm --apply                 # switch the slot off
```

Specs and records live in `<your-home>/instantdm-api-docs/flows/` (`spec-<slug>.json`, `next-post-<slug>.json`,
`quick-<post_id>.json`). The token comes from Chrome by itself (`extract_token2.py`); it is never printed. If the
script says there is no token, Chrome on this PC is logged out of app.instantdm.com: Deon has to log in.

## His rules

| rule | his words |
| --- | --- |
| **Follow gate ON for every reel.** Never off unless he says "remove / turn off the follow gate" for a named reel. | "Bro there is no follow gate on. The youtube video wtf is wrong with u" (2026-10-05), after one day ungated |
| **No follow request inside the DM text.** The gate card asks; the DM delivers. | "keep it quick automation dont request or beg for a follow" (2026-10-04) |
| **Public replies: one short line, no link.** The link goes only in the DM. | standing rule; the script refuses a link in any public line |
| **Quick automation, not a Flow Editor flow.** One text DM. | same message, 2026-10-04 |
| **Short DM in plain words.** Opening line, the link, at most three short bullets, one line of setup if it needs one. 60 words at most, links not counted. No specs, no jargon, no second link. | "can u make it like bettter in understand and lesss words wtf is that make sure all instant dm automations are like that from now on" (2026-10-08), about the 150-word Muse DM |
| **The link is the highlight.** On its own line right under the opening line, with a 👉. Nothing above it but the greeting. | "and keep the link as highlight" (2026-10-08) |
| The newsletter pitch, if one is ever added, is two short lines. | asked 2026-09-07 |

The gate has a cost he knows and accepted (2026-09-27): a non-follower gets the follow card and no DM until they
follow. Report it when asked; do not "fix" it.

`reel.py` enforces the first five (over 60 words, or a link that is not on its own line under the opening, is refused; any "follow" in the DM is refused except "follow-up" and "follow these
steps"; any `word.tld` in a public line counts as a link). A write counts only when the read-back matches every
field sent; "NOT ARMED" / "NOT ATTACHED" means exactly that. To arm ungated it needs `"gate_on": false` in the spec AND
`--gate-off "<his exact words>"`, which go into the record.

## A run

**1. What is being delivered.** The DM must hand over what the reel promised, and the link must be real and live.
- A repo or tool he is talking about: link it directly. Setup goes in the bullets only if it fits the 60 words;
  otherwise the repo's README carries it. (The older YouTube, mobile-app and Instagram agent DMs had a
  three-step setup and run long: do not copy them.)
- Write it for someone who has never heard of the thing: what it does for them, not how it is built. The Muse DM
  in `flows/spec-muse.json` is the model.
- "The guide / the list / the page": a page on deonmenezes.com/resources/<x>. Check it is deployed; pushing to
  main does not deploy that site.
- Credit whoever made the thing, by name.
- If what he asked to send is dead, unlicensed or not what the reel says, tell him and offer the nearest true
  thing. (2026-10-06: the archived playgta5.com copy did not load; he picked a page on his site instead.)
- Say only what the source says. His script can run ahead of it ("automates your account" for skills that write
  drafts): the DM stays accurate without arguing with the reel.

**2. The spec.** `python $S new <slug>`, then fill in `keywords` (the word he says; case variants are added for
you), `url`, `dm` (a list of lines; `{url}` is replaced), `replies` (3-6), `gate`. The edit's `package.md` and
`brief.md` usually hold the word and the facts. One DM is at most 60 words and 1000 bytes; `check` counts both.

**3. Arm.** `python $S check <slug>`, read the DM it prints as a commenter would, then `arm <slug> --apply`.
Tell Deon it is armed and with which word.

**4. When he says it is up** ("reel is up", "video uploaded, check automation"), do not trust the slot:
```bash
python $S status 3                        # is the new reel there, and did the slot land on it?
python $S attach <slug> latest --apply    # attach by hand either way; same config, verified, slot disarmed
```
`attach` prints a STOP and writes nothing if the caption does not contain the keyword as a word (wrong post), if
`latest` is not a video or is more than 6 hours old (the reel is not up yet: give the post id if it really is that
one), if a Flow Editor flow is already on the post (people would be DM'd twice), if another automation is switched
on there, or if a DM link has stopped answering. `--force` passes every STOP at once, so read them first.
It switches the slot off only when the slot still holds this reel's DM; a slot armed for a different reel is left
alone and it says so. If it ends with "SLOT STILL ARMED" or "could not be read", the reel is attached but the slot
is not safe yet: run `disarm --apply`.
Comments that arrived before the attach got nothing and cannot be backfilled: `diag <post_id>` and say how many.

**5. "It's not automated / it stopped".** Run `python $S diag 3` before anything else. Nearly every time the DMs
are going out and what he sees is one of: comments without the keyword; non-followers held by the gate
(`DM not sent`, subcode 1545133); `Comment Not enabled`, where the DM went but no public reply was posted, so the
reel looks dead. Give him the counts.

## Traps already paid for

- **The slot fires on ANY next post** (a story, a carousel, an unrelated reel) and then resets to the default
  template. Check `status` right before he posts; re-arm if something else ate it.
- **The slot is unreliable.** It had not fired minutes after posting on 2026-09-25, 10-05 and 10-06, and on
  2026-10-03 the armed config was gone before the reel went up. Twice it did fire by itself (10-03 evening,
  10-04). Step 4 exists because you cannot tell which it will be.
- **No backfill.** Minutes matter after posting. A 2 h 28 min gap once lost 18 comments.
- **`get-health-status` overstates.** `total_errors_24h` is an all-time sum, and old issues stay listed; `diag`
  marks the stale ones.
- **`auto_reply.enable` reads false on Flow Editor posts.** That is normal for the ~55 older flow posts. Never
  open an API-made flow in the Flow Editor UI and save: it overwrites the flow with an empty canvas.
- **OpenReply campaigns stay OFF** (the older self-hosted stack), or commenters get two DMs.
- **Records on disk can be mojibake.** Build from a spec, not by cloning an old `quick-*.json`.
- A page-injected timer cannot watch for a new post (Chrome freezes the tab). Wait for him to say it is up.

## Files

```
reel-automation/
  SKILL.md
  scripts/reel.py          new, check, status, arm, attach, disarm, diag
  templates/base.json      the quick-automation body every reel shares
  templates/spec.json      what a spec holds
<your-home>/instantdm-api-docs/
  flows/                   specs and the record of every live automation
  extract_token2.py        the token, from Chrome's local storage
  HANDOFF.md, idm.py, build_room_flow.py    the older Flow Editor route; not used for new reels
```

The per-reel scripts in that folder (`arm_gta.py`, `attach_app.py`, ...) are what this replaced. Leave them: they
document the reels they were written for.
