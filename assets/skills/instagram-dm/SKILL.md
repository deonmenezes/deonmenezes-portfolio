---
name: instagram-dm
description: Find the right people in Deon's @deon_tech Instagram DMs and send them a manual DM from his signed-in Chrome - story repliers ("everyone I promised"), question-box responders, people who texted for something, a named set of commenters - with a dry run, a pacing rule and a sent-log so nobody is messaged twice. Use whenever Deon says "DM everyone I promised", "dm everyone", "send the link to everyone who replied to my story", "reply to the people who answered the question box", "did you send the instagram dm to anyone who texted for <thing>", "did you send it to everyone", "check my instagram DMs", "who replied to my story", "message requests", or "send it to the people who asked". Reading his DMs is always allowed; sending only when he asked for that send. Not for the comment-to-DM automation on a reel (reel-automation), brand and collab mail (paid-collab), posting (post-video) or WhatsApp.
---

# instagram-dm

The manual path: a person did something in his DMs or his stories, and he wants a message sent to them by hand.
The automatic path is different: someone comments the keyword under a reel and InstantDM sends the DM by itself.
That is `reel-automation` (`reel.py status|diag`). If he says "nobody got the DM from my reel", run its `diag` first.

```text
1 browser   list_connected_browsers -> select_browser -> a tab on instagram.com. Run snippets.js block A: viewer must be deon_tech.
2 audience  which group did he mean? (table below) Wrong group is the usual mistake. Ask if two fit.
3 list      blocks B-H in snippets.js build it; read the threads' tails; drop who is already answered or already logged.
4 dry run   show Deon: list size, three sample names, the exact message. Wait for his go. Nothing is sent before this.
5 send      one person per cycle: open thread -> paste (block I) -> screenshot -> send -> confirm (block J) -> log -> wait.
6 report    sent / skipped / failed counts and the skipped names with the reason. Not "done".
```

Files: `snippets.js` (copy-ready blocks A-J, edit the `<<...>>` placeholders), `dmlog.py` + `sent-log.jsonl` (who was
messaged), this file. Run the log with `python ~/.claude/skills/instagram-dm/dmlog.py` (see `--help`).

## His rules

| rule | his words |
| --- | --- |
| **"Everyone I promised" = people who replied to his STORY**, not reel commenters, not an InstantDM job. | "its not any ree l i posted a story and ipromised to igve codex to anyone who replies" (2026-10-06) |
| Look only at what he pointed at. Do not widen the search to 30 days of inbox. | "no bro the ideo i sent onyl check from that" ... "not reel story" (2026-10-06) |
| **Only people who already have a DM thread with him.** No cold DMs to question-box answerers who never wrote. | "yes only people who have had the dm" (2026-10-06) |
| He wants the send done, not described. | "did u send the instazagram dm to anyone who texted ... make surei ts done", then "so send it" (2026-10-06) |
| Short plain DMs, link as the highlight, no follow begging. Same as the reel DMs. | "dont request or beg for a follow" (2026-10-04); "make it ... lesss words" and "keep the link as highlight" (2026-10-08) |
| Links never go in public comment replies, only in DMs. | "dont have link in the commments please" (2026-09-06) |

Calls I made on 2026-10-06 that he did not contradict (not his words): skip a thread he already answered himself; skip
a reply that needs a real human answer (a personal intro); different texts for repliers in different situations.

## Authority to send

- Reading is always fine: "check my DMs", "who replied", "did you send it" are answered from the inbox and the log.
- Sending DMs on his behalf happens only if he asked for that send in the current conversation. "Did you send it?" is a
  question, not a send. Answer it, say what is unsent, and offer.
- Confirm before sending when the list is bigger than he implied (he said "the 14", the scan finds 40), when it holds
  people outside the group he named (message requests, question-box answerers, reactions instead of replies, people from
  another story), or when the text is not the one he approved. Different group, different text: ask.
- Never send an API key, password, token or login. A key does not go into a DM. Send a claim link or code he gives you, or tell him to paste it himself.
- Never ask recipients for an email, account name, login or any personal detail. A request to DM question-box answerers asking for an account email was refused by the safety check (answerers can include minors). Do not word around it, do not retry another way, and do not try to get past the block.

## Pick the browser

`list_connected_browsers`, then `select_browser`. The Claude-in-Chrome extension has been on the Mac and on Windows
("Browser 1", Windows, since 2026-09-11); on 2026-10-06 only the Windows Chrome was listed and it was signed in as
@deon_tech. Use the one that block A says is deon_tech. If both are, prefer Windows (awake, on mains). A MacBook with its
lid closed is unusable. "Browser extension is not connected" after Chrome closed mid-task: reopen Chrome, wait,
list again once. A remote session (claude.ai/code on the always-on PC) runs with no desktop, so it has no Windows Chrome: only a
listed Mac Chrome works. If nothing is listed, stop and tell him the browser is not reachable. Do not fall back to a token
or the Graph API (see What cannot be done).

## Pick the audience, build the list

| he says | group | how |
| --- | --- | --- |
| "everyone I promised", "replied to my story", "dm everyone" after a story | repliers to ONE story | B (live) or C (archive) for the story pk with him, then D, E, F `story` |
| "answered the question box", "the responses" | question-box answers | C, G: newest 20 only. If the total is bigger, ask for a screen recording or tell him to Reply from the phone. Then F `names`. |
| "texted for <thing>", "asked for <thing>" | inbound DMs by keyword | ask which story or reel and what window. F `keyword` over that window. Zero hits: ask him, do not widen. |
| "the people who commented <word>" | named commenters | H2 is untested; `reel.py diag <post_id>` lists the newest 30. Then D and F `names`: no thread = cannot be DMed from the web. |
| "check my DMs" | read only | D, E, H. Report counts and who is waiting. No send. |

Story pk with him, not from memory. His own pk is YOUR_IG_USER_PK. Scan windows: at his volume ~90 pages covers 2.5 days.
Run D with both folders, then H for message requests: the 2026-10-06 list was 14 in the inbox plus 4 in requests, and
Instagram counted 21 replies, so some are always unreadable. Say the gap out loud.

For every candidate: F gives `mineAfter` (he or the automation already wrote after their reply). Drop the person if that
is above 0 and the thread shows he answered, if `dmlog.py has <campaign> <user>` says sent, or if their text needs a
human. Check again at send time: the screenshot before the send and block I's output show the thread tail. Keep the
type: a `reply` is a reply; a `reaction` is an emoji and goes to the "outside the group" confirmation.

## Dry run (mandatory)

Show, in chat, before any send: how many people, the breakdown (replies, reactions, requests, skipped and why), three
sample names with what each wrote, the exact message in a code block, and the pace. Then wait for his go. Skip the wait
only when he already approved this exact text and the list is not larger than he said. Start the log:
`python dmlog.py start <campaign> --audience "..." --text "<exact message>"`. Campaign id: `<thing>-<story|box|keyword>-<date>`.

## Message style

Short, plain, a person wrote it. Greeting line saying why they are getting it ("As promised"), the link or code on its
own line right under it, at most three short steps, one line of setup. Under 60 words, links not counted. No follow ask,
no "please share", no jargon, one link. Below is the text he approved on 2026-10-06 (he chose "Send this"), kept as a sample of the shape only: that campaign
is finished, so never reuse its coupon or wording for a new send, and put the link on its own line as the rule above says.

```text
Hey! 👋 As promised, here's the thing you asked for: <what it is>.

How to get it:
1. Open <link>
2. <one short step>
3. Enter code <CODE>

<one line of setup or expiry, if any>
```

## Send

Block I fills the box and sends nothing; the send is a separate step. Per person: navigate to `/direct/t/<tid>/` (tid
from F; it redirects), wait 10 s, run I with `WANT`, `MARKER`, `MSG`; take a screenshot (the send only lands after one);
press Return or click the Send button where the screenshot shows it; wait 5 s; run J; then
`python dmlog.py add <campaign> <user> sent|skipped|failed --note "..."`. A click that did not register (3 of 13) gets one
more click or Return, never a second paste. I refuses when the person is not on screen, the box has text, or the
thread already contains the marker. Fill, screenshot, send and verify are one batch for one person; never queue several.

Pacing (Claude's choice, not his words or a known Instagram limit): at least 30 s between sends, at most 25 in a run without asking again. The first run did 13 in about 30 minutes. Instagram
does limit accounts that send too fast, so this is not a theoretical risk. At the first sign of a block, stop: "try again later", "action blocked", "couldn't send", a
login or challenge page, HTTP 429/401/403 from any fetch, a box that stays full after the one retry. Do not retry in a
loop, do not switch tools to push the rest through. Log the failure, report how many went out and who has not been
messaged, and let him decide when to resume.

## What cannot be done from the web session

- Question-box answers beyond the newest 20 (paging says "useragent mismatch" or 404). Message `pending_inbox`
  (404), `get_by_participants` (404), `ranked_recipients` (empty), `create_group_thread` (403): do not retry them.
- Cold DMs to people with no thread. The profile page has no usable Message button here and the "New message" dialog
  keeps earlier recipients selected after one use (a group chat): if it must be used, reload the inbox first.
- Hidden Requests (never opened). Replying inside a Message Request accepts it, which shows his activity status and read
  receipts to that person: tell him first. Opening a request clears its unread dot but sends no receipt.
- Sending through the Graph API or the InstantDM token: Instagram DMs on the API are gated on Meta App Review.
- Reading a story video in a screenshot (black): overlay `image_versions2` in an `<img>` instead.
- Anything in a remote session with no Chrome listed.

## Traps already paid for

- A script call dies at 45 s: D starts a background loop, E polls. The inbox page and each thread take about 10 s to render.
- `thread_message_limit=10` shows only each thread's last 10 items: a long thread can hide the story reply, so read the tail.
- The tool blocks results that contain cookies or query strings: return summaries, never the day_shells URL. No block reads
  cookies or tokens and none should.
- Handles read from a phone screen recording can be off by a dot or underscore (2026-10-05). Match every handle to a
  real thread; a name with no thread is reported, not guessed.
- Chrome closed under a running job once; reopen it and reconnect, then re-check the log before resuming.
- **Finding one person's thread (2026-10-09, 20 sends).** The inbox API fetch in blocks A and D now answers with an HTML page, and `ig.me/m/<user>` is "page isn't available". What works: on `/direct/inbox/`, focus `input[placeholder="Search"]` from the script tool (`focus(); click(); select()`), type the exact username with the keyboard tool, wait 8 s, click the result row whose username line matches exactly, wait 10 s, then read the thread tail. The first thing typed after a fresh inbox load is lost: check the input's value and type again. `ctrl+a` types an "a"; use `select()`.
- **Never click by remembered coordinates.** One such click opened a Notes reply popup on someone else's note (closed with Escape, nothing sent). Use refs from `find`, or script the focus.
- **Brand leads and people who only typed a keyword usually sit in Message Requests.** Opening one from search shows "Accept message request" with the focus on **Block**: press no key, navigate away. The fill script must refuse when that banner is on screen.
- **An incoming Instagram call puts a modal over the page** ("<name> is calling") and can ring for minutes. Do not answer or decline, and do not press Return while it is up; reloading the thread URL clears it.
- **The auto-mode safety check** allowed one person per batch (fill + screenshot, then Return + verify) and refused, as "Real-World Transactions": a scripted click on Send, a batch that sent to one person and opened the next, and, after 20 sends in one run, a further group Deon had not seen. When it refuses, stop and report; do not rephrase the same send.
- **Check the thread's topic before reusing a template.** One person was listed under one topic and the thread was about another; a `REQUIRE` regex on the thread tail caught it.
- **Accepting a Message Request (2026-10-09, 7 done after Deon chose "Accept and send").** Only when he said yes to accepting. Open the thread from search, confirm the banner names the person, `find` the Accept button and click it by ref, then `find` and click "General" in the "Move messages from <user> into:" dialog (my choice of folder, not his words). The message box appears after about 6 s; fill, screenshot, Return, verify as usual. A keyword typer whose thread has no message from Deon's side is almost always a request.
- **A /goal is not enough for new texts (2026-10-09).** Deon set a goal to "text frustrated people personally and reply to opportunities". The safety check still refused the first fill of a text he had not seen, and then refused a read-only check right after an Accept click on a person outside the list he had approved. Reads on their own stayed allowed. So under a broad goal: read and triage everything, write the exact replies, show them, and send only after he says yes to those texts.
- **Hidden Chrome window.** When `document.visibilityState` is `hidden` (window minimised or behind another), text typed into the search box does not land. Set the search box from the script instead (native value setter + `input` event), then click the row: a whole run of sends went out that way with the window hidden. Return in the message box (focused by the fill script) and ref clicks on Accept / General did land; one Accept click was lost once, so check for the "Move messages from" dialog before going on.
- **Stale request banner.** Right after switching threads the page can still hold the previous thread's "Accept message request" banner. Test for the banner of this person (`'(' + username + ')?'` in the page text) and wait for the path to change; do not test for the bare phrase. Long threads do not repeat the username in the message pane, so confirm the person by the header link `a[href="/<username>/"]`.
- **Screenshots can time out while the window is hidden** ("Page.captureScreenshot timed out after 30000ms"). Do not wait on them: read the box text, the header link count and the request banner from the script as the pre-send check, then press Return. Sends have gone out that way.
- Brand leads accepted from Message Requests go into Primary.
- **Search box on a brand-new tab** can drop the typing even after `focus(); click(); select()`: `find` the Search input and click it by ref once, then type. The Chrome can also be signed out of Instagram (2026-10-09): Deon has to sign in himself.
