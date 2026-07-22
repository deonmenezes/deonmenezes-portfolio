# deonmenezes.com · portfolio

A single-page, dependency-free portfolio for **Deon Menezes** · Agentic Harness Engineer, founder, author.
Vibrant aurora aesthetic, glassmorphism, scroll-reveal, count-up stats. Pure HTML/CSS/JS (no build step).

## Structure
```
index.html        # all markup
styles.css        # design system + sections
script.js         # nav state, reveal, count-up, cursor glow, video hover
assets/img/       # samaltman-linkedin.png, peter.jpg, yc.jpg, book.png
assets/video/     # IMG_6109.mp4 + IMG_5785.mp4 (+ posters)
vercel.json       # static hosting + long-cache for /assets
```

## Sections
1. **Hero** · name, role, stats (14× wins · 100+ clients · 344★ · $35K PaaS)
2. **OpenAI chapter** · Sam Altman interview, Romain Huet, Codex, security harness partnership
3. **Ventures** · Virelity (CIO), Mantishack (344★), OpenTradeX (48★)
4. **Patch-as-a-Service** · $35K delivered, 100+ clients, Mantishack AI terminal
5. **Experience & expansion** · India → Dubai → San Francisco · Virelity / SecureNet / Emerson
6. **The Book** · How to Build a Business in the Age of AI (Amazon)
7. **Moments** · Y Combinator, Peter Steinberger, event videos
8. **Connect** · Instagram @deon_tech, Discord, LinkedIn, email

The canonical portfolio URL is `https://deonmenezes.com/deon`. The bare domain
redirects to that path, while Virelity remains linked in the nav and footer.

## Run locally
```bash
python3 -m http.server 8745
# open http://localhost:8745
```

## Deploy (Vercel)
```bash
vercel --prod        # then add the deonmenezes.com domain in the Vercel dashboard
```

## Instagram automation setup

The private `/social` workspace is ready for Instagram Graph API delivery, but Meta must be configured separately before real comments or DMs can be sent. Set these server-side environment variables in Vercel:

```text
INSTAGRAM_ACCESS_TOKEN
INSTAGRAM_ACCOUNT_ID
META_APP_ID
META_APP_SECRET
META_WEBHOOK_VERIFY_TOKEN
CRON_SECRET
SOCIAL_ADMIN_PASSWORD_HASH
SOCIAL_SESSION_SECRET
PUBLIC_SITE_URL=https://deonmenezes.com
```

Configure the Meta webhook callback as `https://deonmenezes.com/api/instagram/webhook` and subscribe the Instagram account to comments, messages, messaging postbacks, mentions, and live comments. The GitHub Actions worker calls `/api/instagram/process` every five minutes to deliver queued flow steps, retries, and broadcasts. The dashboard Health view reports whether the Graph token, webhook, database, and worker are ready.

Contacts can opt out by sending `STOP` (or `UNSUBSCRIBE`, `CANCEL`, `END`, or `QUIT`); `START`, `UNSTOP`, and `RESUME` opt them back in. The dashboard can also block or reactivate a contact manually.

## Editing client logos
The Patch-as-a-Service / Ventures copy uses verified figures (100+ clients, $35K, GitHub stars).
Drop a client logo wall into the `#work` section when you have approved logos to display.
