import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

import {
  RESOURCE_SLUGS,
  renderResourcePage,
} from "../scripts/build-resource-pages.js";

const root = new URL("../", import.meta.url);

const expectedPages = Object.freeze({
  "f1-status-checklist": {
    title: "F-1 fixed-admission rule: official source guide",
    marker: "September 15, 2026",
    link:
      "https://www.federalregister.gov/documents/2026/07/17/2026-14439/establishing-a-fixed-time-period-of-admission-and-an-extension-of-stay-procedure-for-nonimmigrant",
  },
  "edge-city-ai-community": {
    title: "Edge City: a neighborhood for the AI era",
    marker: "temporary communities",
    link: "https://edgecity.live/",
  },
  "edge-city-india-application": {
    title: "Edge City India: application starting point",
    marker: "scholarship details",
    link:
      "https://edgecityindia2026.substack.com/p/welcome-to-edge-city-india",
  },
  "claude-start-here": {
    title: "Claude + TradingView MCP: safe setup guide",
    marker: "not a trading bot; it does not execute real trades",
    link: "https://claude.ai/new",
  },
  "tradingview-mcp-with-claude": {
    title: "TradingView MCP with Claude",
    marker: "not a trading bot; it does not execute real trades",
    link: "https://github.com/tradesdontlie/tradingview-mcp",
  },
  "claude-tradingview-workflow": {
    title: "Claude + TradingView: workflow checklist",
    marker: "not a trading bot; it does not execute real trades",
    link: "https://github.com/tradesdontlie/tradingview-mcp",
  },
  "mantishack-mcp": {
    title: "MantisHack: repository + MCP history",
    marker: "independent Rust daemon and MCP agent stack were retired",
    link: "https://github.com/deonmenezes/mantishack",
  },
  "x-tips": {
    title: "X tips from @DeonMen",
    marker: "Adapt it to your voice",
    link: "https://x.com/DeonMen",
  },
  "research-papers": {
    title: "Top research-paper starting points",
    marker: "summaries and viral claims as leads, not evidence",
    link: "https://arxiv.org/",
  },
  "mythos-interview": {
    title: "Claude Mythos Preview: verified source pack",
    marker: "does not identify its canonical URL",
    link: "https://www.anthropic.com/research/mythos-preview?hl=en-US",
  },
  "ar-vr-starting-points": {
    title: "AR/VR: build from the standards",
    marker: "comfort, interaction, and privacy",
    link: "https://www.khronos.org/openxr/",
  },
  "higgsfield-offer-status": {
    title: "Higgsfield offer: current status",
    marker: "could not be recovered or verified",
    link: "https://higgsfield.ai/pricing",
  },
  "ai-room-redesign-prompts": {
    title: "AI Room Redesign Prompt Pack",
    marker: "Go from “what should I change?” to a room you can actually build—while preserving the architecture, openings, and real dimensions already in your space.",
    link: "https://chatgpt.com/",
  },
  "photo-search-prompts": {
    title: "Find photos of you: ChatGPT prompt pack",
    marker: "Turn a selfie into a careful search description, investigate public results, verify every possible match yourself, and organize removal requests without treating facial similarity as proof.",
    link: "https://chatgpt.com/",
  },
  "chatgpt-carousel-workflow": {
    title: "ChatGPT Instagram carousel workflow",
    marker: "Plan the story before styling it, write one job per slide, and generate a visual brief that stays consistent across the whole carousel.",
    link: "https://chatgpt.com/",
  },
  "human-sounding-chatgpt-instructions": {
    title: "Human-sounding ChatGPT custom instruction",
    marker: "Ask ChatGPT to revise for clarity, precision, repetition, and factual accuracy before it returns the final draft—without claiming any detector can prove who wrote it.",
    link: "https://chatgpt.com/",
  },
  "opentradex": {
    title: "OpenTradex: repository + paper-first setup",
    marker: "Read the maintained README, keep paper-only mode on, and understand every connector and credential before considering live trading.",
    link: "https://github.com/deonmenezes/opentradex",
  },
  "modern-robotics-roadmap": {
    title: "Modern robotics roadmap",
    marker: "Use the official Northwestern Modern Robotics materials for foundations, then learn ROS 2 in order and prove each stage with a small working project.",
    link: "https://hades.mech.northwestern.edu/index.php/Modern_Robotics",
  },
  "important-apis-starter-list": {
    title: "Important APIs: official starting list",
    marker: "Pick APIs by the capability your product needs, read the official authentication and limits pages, and test the smallest server-side request before adding a full SDK.",
    link: "https://platform.openai.com/docs/quickstart/make-your-first-api-request",
  },  "open-source-models": {
    title: "Best open-source models you can run locally",
    marker: "only think about H100s if you genuinely need frontier scores on your own metal",
    link: "https://huggingface.co/Qwen/Qwen3.5-4B",
  },
});

async function listJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
      if (entry.isDirectory()) return listJavaScriptFiles(url);
      return entry.isFile() && entry.name.endsWith(".js") ? [url] : [];
    }),
  );
  return nested.flat();
}

test("all twenty resources are deterministic static HTML pages at clean URLs", async () => {
  assert.deepEqual(new Set(RESOURCE_SLUGS), new Set(Object.keys(expectedPages)));
  assert.equal(RESOURCE_SLUGS.length, 20);

  for (const [slug, expected] of Object.entries(expectedPages)) {
    const pageUrl = new URL(`resources/${slug}.html`, root);
    const html = await readFile(pageUrl, "utf8");

    assert.equal(
      html,
      `${renderResourcePage(slug)}\n`,
      `${slug}: committed HTML differs from the deterministic build`,
    );
    assert.ok(
      html.includes(
        `<link rel="canonical" href="https://deonmenezes.com/resources/${slug}">`,
      ),
      `${slug}: missing exact canonical URL`,
    );
    assert.ok(
      html.includes(`<h1>${expected.title}</h1>`),
      `${slug}: missing specific title`,
    );
    assert.ok(
      html.includes(expected.marker),
      `${slug}: missing specific resource copy`,
    );
    assert.ok(
      html.includes(`href="${expected.link}"`),
      `${slug}: missing source link`,
    );
    assert.match(html, /<html lang="en">/u, slug);
    assert.match(html, /<main id="main">/u, slug);
    assert.match(html, /<article>/u, slug);
    assert.match(html, /<section class="checklist"/u, slug);
    assert.match(html, /<section class="sources"/u, slug);
    assert.match(html, /Free to read\. No signup required\./u, slug);
    assert.doesNotMatch(html, /<script(?:\s|>)/iu, slug);
    assert.doesNotMatch(html, /<form(?:\s|>)/iu, slug);
  }
});

test("TradingView resources accurately limit the MCP to analysis and replay practice", async () => {
  const tradingSlugs = [
    "claude-start-here",
    "tradingview-mcp-with-claude",
    "claude-tradingview-workflow",
  ];

  for (const slug of tradingSlugs) {
    const html = await readFile(
      new URL(`resources/${slug}.html`, root),
      "utf8",
    );
    assert.match(html, /not a trading bot; it does not execute real trades/u);
    assert.match(html, /replay/u);
    assert.doesNotMatch(
      html,
      /connect(?:ing)? (?:a|any|your) broker|execute (?:an )?order|live execution/iu,
    );
  }
});

test("Higgsfield page is explicit about the unverified offer and uses only official sources", async () => {
  const html = await readFile(
    new URL("resources/higgsfield-offer-status.html", root),
    "utf8",
  );

  assert.match(
    html,
    /exact Reel-era Higgsfield offer could not be recovered or verified/u,
  );
  assert.match(
    html,
    /does not verify a particular promotion as active/u,
  );
  assert.doesNotMatch(html, /\$\d+|\d+%\s*off|claim (?:this|the) offer/iu);

  const absoluteLinks = [
    ...html.matchAll(/href="(https:\/\/[^"]+)"/gu),
  ].map((match) => match[1]);
  assert.deepEqual(absoluteLinks, [
    "https://deonmenezes.com/resources/higgsfield-offer-status",
    "https://higgsfield.ai/",
    "https://higgsfield.ai/pricing",
    "https://higgsfield.ai/terms-of-use-agreement",
  ]);
});

test("Vercel applies the strict security policy to exactly the twenty static paths", async () => {
  const config = JSON.parse(
    await readFile(new URL("vercel.json", root), "utf8"),
  );
  const expectedPaths = RESOURCE_SLUGS.map((slug) => `/resources/${slug}`);
  const expectedPathSet = new Set(expectedPaths);
  const resourceHeaderRules = config.headers.filter(({ source }) =>
    expectedPathSet.has(source),
  );

  assert.equal(resourceHeaderRules.length, 20);
  assert.deepEqual(
    new Set(resourceHeaderRules.map(({ source }) => source)),
    expectedPathSet,
  );

  for (const path of expectedPaths) {
    const route = resourceHeaderRules.find(({ source }) => source === path);
    const headers = Object.fromEntries(
      route.headers.map(({ key, value }) => [key, value]),
    );
    const policy = headers["Content-Security-Policy"];

    assert.match(policy, /default-src 'none'/u, path);
    assert.match(policy, /script-src 'none'/u, path);
    assert.match(policy, /style-src 'self'/u, path);
    assert.match(policy, /frame-ancestors 'none'/u, path);
    assert.match(policy, /form-action 'none'/u, path);
    assert.equal(headers["Cross-Origin-Opener-Policy"], "same-origin", path);
    assert.equal(headers["X-Content-Type-Options"], "nosniff", path);
    assert.equal(headers["X-Frame-Options"], "DENY", path);
    assert.equal(headers["Referrer-Policy"], "no-referrer", path);
    assert.match(headers["Permissions-Policy"], /camera=\(\)/u, path);
  }

  const otherResourceHeaderRules = config.headers.filter(
    ({ source }) =>
      source.startsWith("/resources/")
      && !expectedPathSet.has(source),
  );
  assert.deepEqual(otherResourceHeaderRules, []);
});

test("clean URLs expose the static files without rewrites, conflicts, or an unknown catch-all", async () => {
  const config = JSON.parse(
    await readFile(new URL("vercel.json", root), "utf8"),
  );
  const expectedPaths = RESOURCE_SLUGS.map((slug) => `/resources/${slug}`);
  const redirectSources = new Set(
    config.redirects.map(({ source }) => source),
  );

  assert.equal(config.cleanUrls, true);
  assert.equal(
    config.rewrites.some(
      ({ source, destination }) =>
        source.startsWith("/resources/")
        || destination.startsWith("/api/resource"),
    ),
    false,
  );
  for (const source of expectedPaths) {
    assert.equal(
      redirectSources.has(source),
      false,
      `${source} must not have a competing redirect`,
    );
  }
  assert.equal(
    config.redirects.find(
      ({ source }) => source === "/resources/gift-claude-subscription",
    )?.destination,
    "https://support.claude.com/en/articles/12938627-how-to-gift-a-claude-subscription",
  );

  await assert.rejects(
    access(new URL("resources/not-an-approved-resource.html", root)),
    { code: "ENOENT" },
  );
});

test("static resources do not create a thirteenth Serverless Function", async () => {
  const apiDirectory = new URL("api/", root);
  const apiFiles = await listJavaScriptFiles(apiDirectory);

  assert.equal(apiFiles.length, 12);
  assert.equal(
    apiFiles.some((url) => url.pathname.endsWith("/api/resource.js")),
    false,
  );
  await assert.rejects(access(new URL("api/resource.js", root)), {
    code: "ENOENT",
  });
});

test("shared detail stylesheet is responsive, accessible, and script-free", async () => {
  const css = await readFile(
    new URL("resources/detail.css", root),
    "utf8",
  );

  assert.match(css, /--teal:\s*#087f75/u);
  assert.match(css, /--paper:\s*#ffffff/u);
  assert.match(css, /a:focus-visible/u);
  assert.match(css, /outline:\s*3px solid #075f58/u);
  assert.match(css, /@media \(max-width: 760px\)/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.doesNotMatch(css, /javascript:|expression\s*\(/iu);
});
