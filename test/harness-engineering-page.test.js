import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const pageUrl = new URL("resources/harnessengineering.html", root);
const styleUrl = new URL("resources/harnessengineering.css", root);
const hubUrl = new URL("resources.html", root);
const vercelConfigUrl = new URL("vercel.json", root);

const videos = [
  {
    id: "HKVIMMrFvGQ",
    title: "The LLM Interview Series #9: What Is Harness Engineering?",
    publisher: "Vizuara",
    duration: "21:04",
  },
  {
    id: "rvRyBhILrls",
    title: "You Can Learn AI Agent Harness In Real Code In 20 Min | Loop Engineering, Memory, Eval, Open Source",
    publisher: "Sean‘s AI Stories",
    duration: "20:49",
  },
  {
    id: "am_oeAoUhew",
    title: "Harness Engineering: How to Build Software When Humans Steer, Agents Execute — Ryan Lopopolo, OpenAI",
    publisher: "AI Engineer",
    duration: "46:20",
  },
  {
    id: "C_GG5g38vLU",
    title: "Harnesses in AI: A Deep Dive — Tejas Kumar, IBM",
    publisher: "AI Engineer",
    duration: "20:26",
  },
  {
    id: "mR-WAvEPRwE",
    title: "Anthropic Workshop: Build Agents That Run for Hours — Ash Prabaker &amp; Andrew Wilson",
    publisher: "AI Engineer",
    duration: "75:40",
  },
  {
    id: "hcm5zIWASCM",
    title: "What is an Agent Harness? (And How We Built One)",
    publisher: "AWS Developers",
    duration: "5:02",
  },
];

test("harness engineering resource ships at the requested clean URL", async () => {
  const [html, hub, vercelConfig] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(hubUrl, "utf8"),
    readFile(vercelConfigUrl, "utf8"),
  ]);

  assert.match(html, /<title>Harness Engineering Learning Path · Deon Menezes<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/deonmenezes\.com\/resources\/harnessengineering">/);
  assert.match(html, /href="\/resources\/harnessengineering\.css"/);
  assert.match(html, /href="\/assets\/fonts\/fonts\.css"/);
  assert.match(html, /href="\/resources">All resources<\/a>/);
  assert.match(hub, /href="\/resources\/harnessengineering"/);
  assert.match(hub, /Grow your harness engineering skills/);
  assert.equal(JSON.parse(vercelConfig).cleanUrls, true);
  await access(styleUrl);
});

test("learning path contains the six exact privacy-enhanced YouTube embeds", async () => {
  const html = await readFile(pageUrl, "utf8");
  const iframeTags = html.match(/<iframe[\s\S]*?<\/iframe>/g) ?? [];
  const videoCards = html.match(/<article class="video-card[\s\S]*?<\/article>/g) ?? [];

  assert.equal(iframeTags.length, videos.length);
  assert.equal(videoCards.length, videos.length);
  assert.equal((html.match(/youtube-nocookie\.com\/embed\//g) ?? []).length, videos.length);
  assert.doesNotMatch(html, /www\.youtube\.com\/embed\//);

  for (const video of videos) {
    const matchingIframe = iframeTags.find((iframe) => iframe.includes(`/embed/${video.id}`));
    const matchingCard = videoCards.find((card) => card.includes(`/embed/${video.id}`));
    assert.ok(matchingIframe, `missing embed for ${video.id}`);
    assert.ok(matchingCard, `missing card for ${video.id}`);
    assert.match(matchingIframe, /loading="lazy"/);
    assert.match(matchingIframe, /referrerpolicy="strict-origin-when-cross-origin"/);
    assert.match(matchingIframe, /allowfullscreen/);
    assert.ok(matchingIframe.includes(`title="${video.title}"`), `wrong iframe title for ${video.id}`);
    assert.ok(matchingCard.includes(`<h3>${video.title}</h3>`), `wrong heading for ${video.id}`);
    assert.ok(matchingCard.includes(`<span>${video.publisher}</span>`), `wrong publisher for ${video.id}`);
    assert.ok(matchingCard.includes(`<span>${video.duration}</span>`), `wrong duration for ${video.id}`);
  }

  const uniqueIds = new Set(
    [...html.matchAll(/youtube-nocookie\.com\/embed\/([A-Za-z0-9_-]{11})/g)].map((match) => match[1]),
  );
  assert.deepEqual(uniqueIds, new Set(videos.map((video) => video.id)));
});

test("page teaches the harness system and includes a practical build path", async () => {
  const html = await readFile(pageUrl, "utf8");

  assert.match(html, /instructions, tools, memory, an execution environment, a control loop, recovery, evaluation/i);
  assert.match(html, /6<\/strong> videos/);
  assert.match(html, /3h 09m/);
  assert.match(html, /id="watch"/);
  assert.match(html, /id="build"/);
  assert.match(html, /Build a tiny harness/);
  assert.match(html, /Define done/);
  assert.match(html, /Limit the tools/);
  assert.match(html, /Persist state/);
  assert.match(html, /Run the loop/);
  assert.match(html, /Design failure/);
  assert.match(html, /Write five evals/);
  assert.match(html, /Keep a human gate/);
});

test("official reading cards link to primary OpenAI and Anthropic sources", async () => {
  const html = await readFile(pageUrl, "utf8");
  const officialLinks = [
    "https://openai.com/index/harness-engineering/",
    "https://www.anthropic.com/engineering/harness-design-long-running-apps",
    "https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents",
  ];

  assert.match(html, /id="read"/);
  for (const link of officialLinks) {
    assert.ok(html.includes(`href="${link}"`), `missing official reading: ${link}`);
  }
  assert.equal((html.match(/target="_blank" rel="noreferrer"/g) ?? []).length, officialLinks.length);
});

test("page includes accessibility and responsive safeguards without placeholders", async () => {
  const [html, css] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(styleUrl, "utf8"),
  ]);

  assert.match(html, /<html lang="en">/);
  assert.match(html, /class="skip-link" href="#main"/);
  assert.match(html, /<main id="main">/);
  assert.match(html, /<nav aria-label="Page navigation">/);
  assert.match(html, /<ol class="build-list">/);
  assert.match(css, /@media \(max-width: 660px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /a:focus-visible/);
  assert.doesNotMatch(html, /\b(?:TODO|TBD|lorem ipsum|placeholder)\b/i);
});
