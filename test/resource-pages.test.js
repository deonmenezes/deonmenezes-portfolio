import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { basename } from "node:path";

import {
  getResource,
  getResourceByLegacyPath,
  getResourceUrl,
  renderResourceCards,
  resources,
} from "../resource.js";
import {
  buildResourcePages,
  GENERATED_MARKER,
  renderResourcePage,
} from "../scripts/build-resource-pages.js";

const expectedRoutes = {
  "/reels/international-students.html": "/resources/f1-status-checklist",
  "/reels/edge-city.html": "/resources/edge-city-ai-community",
  "/reels/edge-city-application.html": "/resources/edge-city-india-application",
  "/reels/claude-trading.html": "/resources/claude-start-here",
  "/reels/doomscroll-learning.html": "/resources/doomscroll-learning-app",
  "/reels/security-guide.html": "/resources/neet-jee-security-starting-points",
  "/reels/techscroll-beta.html": "/resources/techscroll-beta",
  "/reels/techscroll-iphone.html": "/resources/techscroll-iphone",
  "/reels/tradingview-mcp.html": "/resources/tradingview-mcp-with-claude",
  "/reels/tradingview-workflow.html": "/resources/claude-tradingview-workflow",
  "/reels/mantishack-mcp.html": "/resources/mantishack-mcp",
  "/reels/x-tips.html": "/resources/x-tips",
  "/reels/research-profile.html": "/resources/research-papers",
  "/reels/mythos-interview.html": "/resources/mythos-interview",
  "/reels/ar-vr-guide.html": "/resources/ar-vr-starting-points",
};

const expectedPageFiles = resources
  .map(({ slug }) => `${slug}.html`)
  .sort((left, right) => left.localeCompare(right));

function projectFile(path) {
  return new URL(`../${path}`, import.meta.url);
}

async function readProjectFile(path) {
  return readFile(projectFile(path), "utf8");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

test("resource data contains the complete, unique 15-Reel mapping", () => {
  assert.equal(resources.length, 15);
  assert.equal(new Set(resources.map(({ slug }) => slug)).size, 15);
  assert.equal(new Set(resources.map(({ ruleId }) => ruleId)).size, 15);
  assert.equal(new Set(resources.map(({ legacyReelPath }) => legacyReelPath)).size, 15);

  for (const [legacyPath, cleanPath] of Object.entries(expectedRoutes)) {
    const resource = getResourceByLegacyPath(legacyPath);
    assert.ok(resource, `missing resource for ${legacyPath}`);
    assert.equal(getResourceByLegacyPath(legacyPath.replace(/\.html$/, "")), resource);
    assert.equal(getResourceUrl(resource), cleanPath);
    assert.equal(getResource(resource.slug), resource);
  }

  assert.ok(getResource("mantishack-mcp"));
  assert.equal(getResource("tradingview-mcp"), undefined);
});

test("every resource has safe, usable detail-page content", () => {
  for (const resource of resources) {
    assert.match(resource.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.match(resource.shortcode, /^[A-Za-z0-9_-]+$/);

    for (const key of ["title", "eyebrow", "summary", "offer", "keyword", "shortcode"]) {
      assert.ok(resource[key]?.trim(), `${resource.slug} is missing ${key}`);
    }

    assert.equal(resource.steps.length, 3, `${resource.slug} should have three steps`);
    assert.ok(resource.links.length >= 1, `${resource.slug} needs at least one destination`);

    for (const link of resource.links) {
      const url = new URL(link.url);
      assert.equal(url.protocol, "https:", `${resource.slug} contains a non-HTTPS URL`);
      assert.equal(url.username, "", `${resource.slug} contains URL credentials`);
      assert.equal(url.password, "", `${resource.slug} contains URL credentials`);
      assert.ok(link.label.trim(), `${resource.slug} contains an unlabeled link`);
    }
  }
});

test("unavailable Android beta and Mythos interview links are not invented", () => {
  const beta = getResource("techscroll-beta");
  const mythos = getResource("mythos-interview");

  assert.match(`${beta.eyebrow} ${beta.summary} ${beta.note}`, /no public|does not invent/i);
  assert.ok(beta.links.every(({ url }) => !url.includes("play.google.com")));

  assert.match(`${mythos.eyebrow} ${mythos.offer} ${mythos.note}`, /pending|could not be verified|does not invent/i);
  assert.ok(mythos.links.every(({ url }) => /anthropic\.com/.test(new URL(url).hostname)));

  const serialized = JSON.stringify(resources);
  assert.doesNotMatch(serialized, /youtu\.be|setup video|extensionofstay|GoElite|webinar/i);
});

test("hub card renderer links all resources to clean URLs", () => {
  const html = renderResourceCards();
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(hrefs, resources.map(getResourceUrl));
  assert.ok(hrefs.every((href) => href.startsWith("/resources/")));
  assert.doesNotMatch(html, /\/reels\//);
});

test("generator deterministically writes exactly 15 complete static pages", async () => {
  const generatedPaths = await buildResourcePages();
  assert.deepEqual(
    generatedPaths.map((path) => basename(path)).sort((left, right) => left.localeCompare(right)),
    expectedPageFiles,
  );

  const directoryFiles = (await readdir(projectFile("resources/")))
    .filter((name) => name.endsWith(".html"))
    .sort((left, right) => left.localeCompare(right));
  assert.deepEqual(directoryFiles, expectedPageFiles);

  for (const resource of resources) {
    const html = await readProjectFile(`resources/${resource.slug}.html`);
    assert.equal(html, renderResourcePage(resource), `${resource.slug} is stale`);
    assert.ok(html.startsWith(`<!doctype html>\n${GENERATED_MARKER}\n`));
    assert.ok(html.includes(`<title>${escapeHtml(resource.title)} · Deon Menezes</title>`));
    assert.ok(html.includes(`<meta name="description" content="${escapeHtml(resource.summary)}">`));
    assert.ok(html.includes(`<link rel="canonical" href="https://deonmenezes.com/resources/${resource.slug}">`));
    assert.ok(html.includes(`<h1>${escapeHtml(resource.title)}</h1>`));
    assert.ok(html.includes(escapeHtml(resource.offer)));
    assert.ok(html.includes(`https://www.instagram.com/reel/${resource.shortcode}/`));

    for (const step of resource.steps) assert.ok(html.includes(escapeHtml(step)));
    for (const link of resource.links) {
      assert.ok(html.includes(`href="${escapeHtml(link.url)}"`));
      assert.ok(html.includes(escapeHtml(link.label)));
      if (link.note) assert.ok(html.includes(escapeHtml(link.note)));
    }
    if (resource.note) assert.ok(html.includes(escapeHtml(resource.note)));

    assert.doesNotMatch(html, /resource\.js|data-resource-detail|Loading your guide/);
  }

  await assert.rejects(
    access(projectFile("resources/not-a-real-slug.html")),
    (error) => error.code === "ENOENT",
  );
  await assert.rejects(access(projectFile("resource.html")), (error) => error.code === "ENOENT");
});

test("static renderer escapes resource content before writing HTML", () => {
  const unsafeResource = structuredClone(resources[0]);
  unsafeResource.title = '\"><img src=x onerror="alert(1)">';
  unsafeResource.summary = 'summary"><script>alert(1)</script>';

  const html = renderResourcePage(unsafeResource);
  assert.doesNotMatch(html, /<img src=x|<script>alert/);
  assert.match(html, /&lt;img src=x/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("Vercel serves static clean URLs and keeps only extensionless legacy redirects", async () => {
  const config = JSON.parse(await readProjectFile("vercel.json"));
  assert.equal(config.cleanUrls, true);
  assert.ok(!config.rewrites.some(({ source }) => source === "/resources/:slug"));

  const legacyRedirects = config.redirects.filter(({ source }) => source.startsWith("/reels/"));
  assert.equal(legacyRedirects.length, 15);
  assert.ok(legacyRedirects.every(({ source }) => !source.endsWith(".html")));

  for (const [htmlPath, destination] of Object.entries(expectedRoutes)) {
    const extensionlessPath = htmlPath.replace(/\.html$/, "");
    const redirect = legacyRedirects.find(({ source }) => source === extensionlessPath);
    assert.ok(redirect, `missing redirect for ${extensionlessPath}`);
    assert.equal(redirect.destination, destination);
    assert.equal(redirect.permanent, true);
  }

  assert.ok(config.rewrites.some(({ source }) => source === "/go/:automation/:index"));
  assert.ok(config.rewrites.some(({ source }) => source === "/deon/:path*"));
  assert.ok(config.redirects.some(({ source }) => source === "/book"));
  assert.ok(config.redirects.some(({ source }) => source === "/resources/reverse-image"));
  assert.ok(config.crons.some(({ path }) => path === "/api/instagram/process?sync=1"));
});

test("resource routes receive the required browser security headers", async () => {
  const config = JSON.parse(await readProjectFile("vercel.json"));

  for (const source of ["/resources", "/resources/:path*"]) {
    const rule = config.headers.find((candidate) => candidate.source === source);
    assert.ok(rule, `missing header rule for ${source}`);
    const headers = Object.fromEntries(rule.headers.map(({ key, value }) => [key, value]));
    assert.match(headers["Content-Security-Policy"], /default-src 'self'/);
    assert.match(headers["Content-Security-Policy"], /frame-ancestors 'none'/);
    assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
  }
});

test("build scripts generate resources and the hub alone loads the client module", async () => {
  const [hub, packageJson] = await Promise.all([
    readProjectFile("resources.html"),
    readProjectFile("package.json").then(JSON.parse),
  ]);

  assert.equal(packageJson.scripts["build:resources"], "node scripts/build-resource-pages.js");
  assert.equal(packageJson.scripts["vercel-build"], "pnpm run build:resources");
  assert.match(hub, /id="instagram-drops"/);
  assert.match(hub, /data-resource-grid/);
  assert.match(hub, /src="\/resource\.js"/);
});
