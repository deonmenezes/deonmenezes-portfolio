import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("carousel resource ships at the clean URL with its prompt workflow", async () => {
  const html = await readFile(new URL("resources/carousels.html", root), "utf8");

  assert.match(html, /<link rel="canonical" href="https:\/\/deonmenezes\.com\/resources\/carousels">/);
  assert.match(html, /One idea\./);
  assert.match(html, /The master carousel prompt/);
  assert.match(html, /The money carousel from the Reel/);
  assert.match(html, /The ruthless editor prompt/);
  assert.match(html, /The visual system prompt/);
  assert.match(html, /data-copy-all/);
  assert.match(html, /data-copy-target="prompt-master"/);
  assert.match(html, /assets\/video\/deon-carousel-reel-2026-07-30\.mp4/);
  assert.match(html, /Read the full transcript/);
  assert.match(html, /<track kind="captions"/);
  assert.match(html, /id="newsletter"/);
  assert.match(html, /action="\/api\/newsletter"/);
  assert.match(html, /name="email" type="email"/);
  assert.match(html, /data-newsletter-status/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /href="\/privacy"/);
  assert.match(html, /Unsubscribe anytime/);
  assert.doesNotMatch(html, /lorem ipsum|coming soon/i);
});

test("carousel media and social preview assets are packaged", async () => {
  await Promise.all([
    access(new URL("assets/video/deon-carousel-reel-2026-07-30.mp4", root)),
    access(new URL("assets/video/deon-carousel-reel-2026-07-30.en.vtt", root)),
    access(new URL("assets/img/carousels-poster-2026-07-30.jpg", root)),
    access(new URL("assets/img/carousels-og-2026-07-31.png", root)),
    access(new URL("resources/carousels.css", root)),
    access(new URL("resources/carousels.js", root)),
  ]);
});

test("copy controls recover from repeated clicks and fallback failures", async () => {
  const script = await readFile(new URL("resources/carousels.js", root), "utf8");

  assert.match(script, /const originalLabels = new WeakMap\(\)/);
  assert.match(script, /window\.clearTimeout\(pendingTimer\)/);
  assert.match(script, /if \(!copied\) throw new Error/);
  assert.match(script, /fetch\(newsletterForm\.action/);
  assert.match(script, /newsletterForm\.reportValidity\(\)/);
  assert.match(script, /newsletterStatus\.classList\.add\("is-error"\)/);
  assert.match(script, /Enter a valid email address\./);
  assert.match(script, /newsletterLabel\.textContent = "Request received"/);
  assert.doesNotMatch(script, /contact_exists|already_subscribed/);

  const css = await readFile(new URL("resources/carousels.css", root), "utf8");
  assert.match(css, /input:focus \{ outline: 3px solid var\(--teal\)/);
  assert.match(css, /@media \(max-width: 360px\)[\s\S]*newsletter-stamp \{ display: none/);
});

test("resource hub links to the carousel prompt kit", async () => {
  const html = await readFile(new URL("resources.html", root), "utf8");

  assert.match(html, /href="\/resources\/carousels"/);
  assert.match(html, /Make Instagram carousels people actually swipe/);
});

test("Vercel clean URLs expose the nested carousel HTML page", async () => {
  const config = JSON.parse(await readFile(new URL("vercel.json", root), "utf8"));

  assert.equal(config.cleanUrls, true);
  assert.deepEqual(
    config.rewrites.find((rewrite) => rewrite.source === "/api/newsletter"),
    {
      source: "/api/newsletter",
      destination: "/api/stats?route=newsletter",
    },
  );
  const conflictingRedirect = config.redirects?.find(
    (redirect) => redirect.source === "/resources/carousels",
  );
  assert.equal(conflictingRedirect, undefined);
});

test("privacy policy explains newsletter processing and unsubscribe choices", async () => {
  const html = await readFile(new URL("privacy.html", root), "utf8");

  assert.match(html, /newsletter email addresses/i);
  assert.match(html, /processed by Resend/i);
  assert.match(html, /unsubscribe from the newsletter at any time/i);
});
