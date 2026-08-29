import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SITE_ORIGIN = "https://deonmenezes.com";
const RESOURCE_DIRECTORY = fileURLToPath(
  new URL("../resources/", import.meta.url),
);

const RESOURCE_PAGES = Object.freeze({
  "f1-status-checklist": {
    eyebrow: "International-student rule update",
    title: "F-1 fixed-admission rule: official source guide",
    summary:
      "The July 17, 2026 DHS final rule discussed in the Reel, plus a source-first checklist for acting on it safely.",
    offer:
      "Read the final rule itself, confirm its current implementation, and take questions about your situation to your DSO or a qualified immigration lawyer.",
    steps: [
      "Read the Federal Register final rule and confirm its current effective date before relying on a summary.",
      "Write down the provision, effective date, and transition details that could apply to your program or status.",
      "Ask your DSO or a qualified immigration lawyer before changing travel, enrollment, work, or status plans.",
    ],
    links: [
      {
        label: "DHS final rule in the Federal Register",
        url: "https://www.federalregister.gov/documents/2026/07/17/2026-14439/establishing-a-fixed-time-period-of-admission-and-an-extension-of-stay-procedure-for-nonimmigrant",
        note:
          "Primary legal source; published July 17, 2026 and scheduled to take effect September 15, 2026, subject to later changes.",
      },
      {
        label: "Study in the States",
        url: "https://studyinthestates.dhs.gov/",
      },
    ],
    note:
      "This is general information, not legal advice. Immigration rules, dates, or implementation may change through agency guidance, litigation, congressional review, or later government action.",
  },
  "edge-city-ai-community": {
    eyebrow: "Community guide",
    title: "Edge City: a neighborhood for the AI era",
    summary:
      "The quick context behind the Reel: temporary communities where builders, researchers, artists, and founders live and work together.",
    offer:
      "Start with the official Edge City site, read the India announcement for the local format, then apply with code ECI-DEON20 for 20% off.",
    steps: [
      "Read the format and decide whether a temporary builder community fits your goals.",
      "Review the location, dates, residency, and participation details on the announcement.",
      "Apply through the official Edge City India page and enter the code ECI-DEON20 for 20% off.",
    ],
    links: [
      {
        label: "Apply to Edge City India",
        url: "https://www.edgecity.live/india26",
        note: "Use code ECI-DEON20 for 20% off.",
      },
      {
        label: "Edge City official site",
        url: "https://edgecity.live/",
      },
      {
        label: "Edge City India announcement",
        url: "https://edgecityindia2026.substack.com/p/welcome-to-edge-city-india",
      },
    ],
    note:
      "There is no direct checkout link. Edge City reviews every application, so apply through the site above and enter ECI-DEON20 at the appropriate step. Ticket prices have already increased once, and the discount applies to the current price rather than an older one.",
  },
  "edge-city-india-application": {
    eyebrow: "India pop-up village",
    title: "Edge City India: application starting point",
    summary:
      "A clean starting page for the Edge City India application offer from the Reel.",
    offer:
      "Apply directly on the Edge City India page and use the code ECI-DEON20 for 20% off. There is no direct checkout link, because every application is reviewed first.",
    steps: [
      "Read the announcement end to end before applying.",
      "Check dates, location, ticketing, residency, and scholarship details.",
      "Apply at edgecity.live/india26 and enter the code ECI-DEON20 for 20% off.",
      "Keep a copy of your submission and only use links published by Edge City.",
    ],
    links: [
      {
        label: "Apply to Edge City India",
        url: "https://www.edgecity.live/india26",
        note: "Use code ECI-DEON20 for 20% off.",
      },
      {
        label: "Edge City India 2026",
        url: "https://edgecityindia2026.substack.com/p/welcome-to-edge-city-india",
      },
      {
        label: "Edge City official site",
        url: "https://edgecity.live/",
      },
    ],
    note:
      "Edge City filters applications for quality, so there is no shortcut checkout link. Ticket prices have already increased once, and ECI-DEON20 takes 20% off the current price rather than an older one.",
  },
  "claude-start-here": {
    eyebrow: "AI trading workflow",
    title: "Claude + TradingView MCP: safe setup guide",
    summary:
      "The TradingView MCP repository referenced in the Reel, for bringing chart context into Claude.",
    offer:
      "Inspect the open-source integration first, then use it for chart analysis and replay practice. It is not a trading bot; it does not execute real trades.",
    steps: [
      "Read the repository README and code before installing or granting access.",
      "Begin with a historical chart or TradingView replay scenario and compare Claude’s analysis with what happened.",
      "Verify calculations and market claims yourself; never treat a model response as financial advice.",
    ],
    links: [
      {
        label: "TradingView MCP repository",
        url: "https://github.com/tradesdontlie/tradingview-mcp",
      },
      {
        label: "Open Claude",
        url: "https://claude.ai/new",
      },
      {
        label: "TradingView",
        url: "https://www.tradingview.com/",
      },
    ],
    note:
      "This is a software integration guide, not financial advice or a promise of trading performance.",
  },
  "tradingview-mcp-with-claude": {
    eyebrow: "Open-source setup",
    title: "TradingView MCP with Claude",
    summary:
      "The public repository behind the Claude + TradingView MCP offer.",
    offer:
      "Read the repository before installing, then practice with historical charts or TradingView replay. It is not a trading bot; it does not execute real trades.",
    steps: [
      "Read the repository README and inspect the permissions it requests.",
      "Run the setup locally with a sample or historical chart before relying on its analysis.",
      "Use replay to compare the analysis with later price action and document where it was wrong.",
    ],
    links: [
      {
        label: "TradingView MCP repository",
        url: "https://github.com/tradesdontlie/tradingview-mcp",
      },
    ],
    note: "This is a software setup resource, not financial advice.",
  },
  "claude-tradingview-workflow": {
    eyebrow: "AI trading workflow",
    title: "Claude + TradingView: workflow checklist",
    summary:
      "A safety-first checklist for the Reel about using Claude with TradingView.",
    offer:
      "Start with chart analysis and replay practice. This MCP is not a trading bot; it does not execute real trades.",
    steps: [
      "Choose a chart, timeframe, and question, then review the tool configuration.",
      "Ask Claude for a structured chart analysis with assumptions and invalidation conditions.",
      "Use TradingView replay to test the reasoning, and verify every conclusion yourself.",
    ],
    links: [
      {
        label: "TradingView MCP repository",
        url: "https://github.com/tradesdontlie/tradingview-mcp",
      },
      {
        label: "Claude",
        url: "https://claude.ai/new",
      },
    ],
    note:
      "Nothing on this page is financial advice or a promise of trading performance.",
  },
  "mantishack-mcp": {
    eyebrow: "Authorized security research",
    title: "MantisHack: repository + MCP history",
    summary:
      "The MantisHack repository promised in the Reel, with an important update about how the project has changed since that video.",
    offer:
      "Use the maintained repository as the source of truth. The Reel-era independent Rust daemon and MCP agent stack were retired; the current Codex-based project has a different MCP capability layer and setup.",
    steps: [
      "Read the current README and changelog before choosing an installation or workflow.",
      "Run security tooling in an isolated environment and only against systems you own or have explicit permission to test.",
      "Define the scope, protect credentials and findings, and use the target’s responsible-disclosure channel.",
    ],
    links: [
      {
        label: "MantisHack GitHub repository",
        url: "https://github.com/deonmenezes/mantishack",
      },
      {
        label: "MantisHack project site",
        url: "https://mantishack.com/",
      },
    ],
    note:
      "For authorized defensive use only. The old setup is not supported merely because the current project also uses MCP; follow the current README and project history.",
  },
  "x-tips": {
    eyebrow: "Social workflow",
    title: "X tips from @DeonMen",
    summary:
      "A direct path to the public profile and the tips promised in the Reel.",
    offer:
      "Follow the profile for the latest threads and save the ideas that fit your own publishing workflow.",
    steps: [
      "Open the profile and read the newest relevant thread.",
      "Save one idea you can test this week.",
      "Adapt it to your voice instead of copying it blindly.",
    ],
    links: [
      {
        label: "Open @DeonMen on X",
        url: "https://x.com/DeonMen",
      },
    ],
  },
  "research-papers": {
    eyebrow: "Research workflow",
    title: "Top research-paper starting points",
    summary:
      "A practical starting kit for finding, filtering, and checking technology research papers.",
    offer:
      "Use primary indexes and paper metadata first. Treat summaries and viral claims as leads, not evidence.",
    steps: [
      "Search a focused question in Google Scholar, arXiv, or NASA ADS.",
      "Read the abstract, methods, limitations, and cited sources.",
      "Save the DOI or canonical paper URL so someone else can verify it.",
    ],
    links: [
      {
        label: "Google Scholar",
        url: "https://scholar.google.com/",
      },
      {
        label: "arXiv",
        url: "https://arxiv.org/",
      },
      {
        label: "NASA ADS",
        url: "https://ui.adsabs.harvard.edu/",
      },
    ],
    note:
      "This page gives you the research workflow; the Reel caption did not include a fixed list of ten paper URLs.",
  },
  "mythos-interview": {
    eyebrow: "Model research · interview pending",
    title: "Claude Mythos Preview: verified source pack",
    summary:
      "Anthropic’s official Mythos overview and system card, without mislabeling them as the external interview promised in the Reel.",
    offer:
      "Use these primary sources to check the model and benchmark claims now. The exact external interview URL could not be verified from the Reel caption or available project evidence.",
    steps: [
      "Read Anthropic’s Mythos overview for the official product context and availability.",
      "Use the system card for evaluation methods, limitations, and its separate automated model-interview section.",
      "Treat a CEO interview, a model self-interview, and a system card as different artifacts; wait for the canonical episode URL before calling one the promised interview.",
    ],
    links: [
      {
        label: "Official Mythos Preview research report",
        url: "https://www.anthropic.com/research/mythos-preview?hl=en-US",
      },
      {
        label: "Current Claude Mythos overview",
        url: "https://www.anthropic.com/claude/mythos",
      },
      {
        label: "Claude Mythos Preview system card",
        url: "https://www-cdn.anthropic.com/7624816413e9b4d2e3ba620c5a5e091b98b190a5/Claude%20Mythos%20Preview%20System%20Card.pdf",
        note:
          "Official technical report; not presented here as the unverified external interview.",
      },
    ],
    note:
      "Interview status: the caption promises a full interview but does not identify its canonical URL. This page intentionally does not invent or substitute one.",
  },
  "ar-vr-starting-points": {
    eyebrow: "Immersive computing",
    title: "AR/VR: build from the standards",
    summary:
      "A practical AR/VR starting kit for the Reel’s “all you need to know” offer.",
    offer:
      "Start with the standards and browser APIs, then choose a device or engine based on the experience you want to build.",
    steps: [
      "Learn the OpenXR concepts that make immersive apps more portable.",
      "Try a small WebXR demo in a supported browser.",
      "Prototype comfort, interaction, and privacy before adding complexity.",
    ],
    links: [
      {
        label: "Khronos OpenXR",
        url: "https://www.khronos.org/openxr/",
      },
      {
        label: "MDN WebXR Device API",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API",
      },
    ],
  },
  "higgsfield-offer-status": {
    eyebrow: "Promotion status",
    title: "Higgsfield offer: current status",
    summary:
      "The exact Reel-era Higgsfield offer could not be recovered or verified, so this page does not claim that a promotion is live.",
    offer:
      "Check Higgsfield’s official pricing page and the terms shown at checkout before subscribing. Offers, eligibility, billing periods, and regional pricing can change.",
    steps: [
      "Open the official pricing page and review the plans available for your location.",
      "Before paying, confirm any promotion, renewal price, credit limits, billing period, and expiration in the official checkout.",
      "If the offer does not appear on Higgsfield’s official site or in your checkout, assume it is not available.",
    ],
    links: [
      {
        label: "Higgsfield official site",
        url: "https://higgsfield.ai/",
      },
      {
        label: "Higgsfield official pricing",
        url: "https://higgsfield.ai/pricing",
      },
      {
        label: "Higgsfield terms of use",
        url: "https://higgsfield.ai/terms-of-use-agreement",
      },
    ],
    note:
      "Status checked August 4, 2026. Higgsfield’s official pricing and checkout are the source of truth; this page does not verify a particular promotion as active.",
  },
  "ai-room-redesign-prompts": {
    eyebrow: "Interior-design workflow",
    title: "AI Room Redesign Prompt Pack",
    summary: "Five copy-ready ChatGPT prompts that turn a room photo into realistic concepts, a dimensioned plan, and a budget-aware shopping list.",
    offer: "Go from “what should I change?” to a room you can actually build—while preserving the architecture, openings, and real dimensions already in your space.",
    steps: [
      "Photograph the room from two opposite corners in daylight, then note the wall lengths, ceiling height, door and window sizes, and anything that cannot move.",
      "Run the prompts in order. Answer the clarification questions before asking for images so the concepts respect how you really use the room.",
      "Choose one concept, verify every measurement yourself, and use the final plan and shopping list as a brief—not as construction drawings.",
    ],
    links: [
      {
        label: "Open ChatGPT",
        url: "https://chatgpt.com/",
        note: "Upload your room photos in a new chat, then paste the prompts below one at a time.",
      },
    ],
    prompts: [
      {
        title: "01 · Analyze the room before designing",
        when: "Start here after uploading 2–4 photos and your measurements.",
        text: "Act as a professional interior designer and space planner. Analyze the room photos and measurements I uploaded before proposing any design.\n\nRoom purpose: [WHAT I USE THE ROOM FOR]\nPeople using it: [WHO / HOW MANY]\nLocation and climate: [CITY / COUNTRY]\nMust keep: [FURNITURE, ART, STORAGE, ETC.]\nCannot move: [WINDOWS, DOORS, RADIATORS, PLUMBING, BUILT-INS]\nMain problems: [CLUTTER, LIGHT, LAYOUT, STORAGE, ETC.]\nStyle direction: warm modern, calm, functional, and realistic.\n\nPreserve the existing architecture, wall positions, ceiling height, windows, doors, and room dimensions. Do not invent hidden measurements or structural changes.\n\nFirst, give me:\n1. Observed facts from the photos\n2. Assumptions you need me to verify\n3. Layout, lighting, storage, and circulation problems\n4. The room’s strongest existing features\n5. Up to five high-impact clarification questions\n\nDo not generate a redesign yet. Wait for my answers.",
      },
      {
        title: "02 · Generate three distinct concepts",
        when: "Use after answering the room-analysis questions.",
        text: "Using the verified room analysis above, create three distinct warm-modern interior concepts for this exact room.\n\nKeep the existing architecture, dimensions, camera viewpoint, windows, doors, and all non-movable elements unchanged. Every concept must be functional, realistic, and possible to implement in the real room.\n\nFor Concept A, B, and C, include:\n- A memorable concept name and one-sentence idea\n- Furniture layout and circulation logic\n- Color palette with wall, wood, textile, and accent colors\n- Materials, lighting layers, storage, and styling\n- What stays, what moves, and what gets replaced\n- The main benefit and tradeoff\n- A realistic implementation difficulty: easy, moderate, or involved\n\nMake the three directions meaningfully different—not the same room with different cushions. Then generate one photorealistic image for each concept, clearly labeled A, B, and C. If image generation would require changing the room geometry, stop and explain the conflict instead.",
      },
      {
        title: "03 · Refine the selected render",
        when: "Paste this after choosing Concept A, B, or C.",
        text: "Refine Concept [A / B / C] using the original room photo as the visual base.\n\nKeep the exact room geometry, camera angle, ceiling, floor footprint, windows, doors, and fixed architectural details. Do not widen the room, raise the ceiling, add openings, hide doors, or place furniture where it blocks circulation.\n\nApply these refinements:\n- Keep: [ITEMS / FEATURES]\n- Change: [COLORS / FURNITURE / LIGHTING]\n- Add: [STORAGE / ART / PLANTS / TEXTILES]\n- Remove: [ITEMS]\n- Mood: warm modern, inviting, uncluttered, and lived-in\n- Practical needs: [KIDS / PETS / RENTAL / WORK-FROM-HOME / ACCESSIBILITY]\n\nCreate a photorealistic revised image with believable proportions, natural material texture, and realistic daylight. After the image, list every visible change you made and flag anything whose fit still depends on a measurement.",
      },
      {
        title: "04 · Turn the concept into an implementation plan",
        when: "Use only after you have supplied measurements and approved a concept.",
        text: "Turn the approved room concept into a practical implementation plan using my verified measurements.\n\nClearly separate:\n- Measurements I provided\n- Your recommended dimensions\n- Any measurement that is still missing\n\nInclude:\n1. A wall-by-wall layout with furniture placement and walking clearances\n2. Maximum furniture dimensions that will fit each position\n3. Paint direction with finish, undertone, and sample color references; do not invent a manufacturer code\n4. Lighting plan with fixture type, position, color temperature, brightness range, and control strategy\n5. Window treatments, rug size, art scale, storage, and cable management\n6. A step-by-step order of work from clearing the room to final styling\n7. A pre-purchase verification checklist\n\nUse centimeters and inches. Never claim the layout is precisely scaled unless all required measurements are present. Flag electrical, structural, or installation work that needs a qualified professional.",
      },
      {
        title: "05 · Build a prioritized shopping list",
        when: "Finish with this prompt once the implementation plan is settled.",
        text: "Create a budget-aware shopping list for the approved room plan.\n\nLocation: [CITY / COUNTRY]\nCurrency: [CURRENCY]\nTotal budget: [AMOUNT]\nItems I already own: [LIST]\nQuality priorities: [WHERE TO INVEST]\nDeadline: [DATE]\n\nOrganize the list into:\nA. Essentials that make the room function\nB. High-impact improvements\nC. Nice-to-have finishing touches\n\nFor every item include quantity, target dimensions, material or finish, color, realistic price range, useful search terms, and one lower-cost alternative. Add estimated subtotals, delivery or installation allowances, and a 10–15% contingency.\n\nDo not invent live prices, stock, discounts, or product links. If current products are needed, ask permission to search the web and verify each item. End with the best purchase order so I do not buy decor before solving layout, lighting, and storage.",
      },
    ],
    note: "AI images can change scale, windows, doors, or circulation without warning. Check the proposal against your measurements and consult a qualified professional before structural, electrical, plumbing, or load-bearing work.",
  },
  "photo-search-prompts": {
    eyebrow: "Digital-footprint workflow",
    title: "Find photos of you: ChatGPT prompt pack",
    summary: "The five copy-ready ChatGPT prompts from the Reel for finding possible public photos, checking each result, requesting removal, and tracking follow-up.",
    offer: "Turn a selfie into a careful search description, investigate public results, verify every possible match yourself, and organize removal requests without treating facial similarity as proof.",
    steps: [
      "Upload a clear, recent photo that you have the right to use, then run the prompts in order.",
      "Treat every search result as a lead. Open the original page and personally verify the visible details before taking action.",
      "Use the site or platform's official removal process, keep a record of each request, and follow local law when legal rights are involved.",
    ],
    links: [
      {
        label: "Open ChatGPT",
        url: "https://chatgpt.com/",
        note: "Upload your photo in a new chat, then paste the prompts below one at a time.",
      },
    ],
    prompts: [
      {
        title: "01 · Analyze your selfie",
        when: "Upload a clear, recent photo first. A plain background works best.",
        text: "Analyze this photo and describe the visible, non-sensitive features that could help distinguish me in other public photos online. Focus on things like face shape, hairstyle, glasses, facial hair, clothing, accessories, and other visible details. Do not guess my identity, ethnicity, health, personality, or any other sensitive traits. Give me a concise search description I can review and edit.",
      },
      {
        title: "02 · Look for possible matches",
        when: "Use ChatGPT's web or agent tools if they are available to you.",
        text: "Using the photo I uploaded and the search description we created, help me look for publicly accessible webpages that may contain this same photo or a visually similar photo of me. Use available web-search or reverse-image-search tools where supported. Search likely sources such as event galleries, public social profiles, news pages, blogs, and image results. Return a table with the page title, direct URL, where the image appears, why it might be a match, and a confidence level. Do not claim a match as certain based on appearance alone.",
      },
      {
        title: "03 · Verify every result",
        when: "Never report or remove an image until you have checked it yourself.",
        text: "Review the possible matches one by one. For each result, compare only clearly visible details from my uploaded photo with the image on the page. List the details that match, the details that do not match, and anything that is unclear. Label each result as likely match, possible match, or unlikely match. Include the direct source link. Remind me that I need to make the final decision and that facial similarity is not proof of identity.",
      },
      {
        title: "04 · Write a takedown request",
        when: "Replace the brackets, then send it to the site owner or platform.",
        text: "Help me write a polite, clear photo-removal request for this webpage: [PASTE URL]. The photo appears here: [DESCRIBE WHERE]. My reason for requesting removal is: [YOUR REASON]. Write a short subject line and a human-sounding email. Ask them to remove the image and any cached copies they control, and to confirm when it is done. Do not make legal threats or claim rights I may not have. If the site has a specific privacy, copyright, or removal process, summarize the appropriate next step separately.",
      },
      {
        title: "05 · Track everything",
        when: "Paste your results so ChatGPT can turn them into a simple checklist.",
        text: "Turn these photo-search results into a clean removal tracker. Use these columns: website, image URL, page URL, match confidence, contact or removal form, date contacted, response, status, and next follow-up date. Flag any result I have not personally verified. Then give me a short, prioritized action list, starting with the clearest matches and the simplest official removal processes.",
      },
    ],
    note: "ChatGPT cannot guarantee it will find every photo, and visual matching can miss results or confuse one person for another. Do not use these prompts to identify, track, harass, or investigate another person without consent. Avoid children's photos, intimate images, IDs, and other sensitive material.",
  },
  "chatgpt-carousel-workflow": {
    eyebrow: "Creator workflow",
    title: "ChatGPT Instagram carousel workflow",
    summary: "A copy-ready workflow for turning one useful idea into a focused seven-slide Instagram carousel with a strong hook, real substance, and a clear call to action.",
    offer: "Plan the story before styling it, write one job per slide, and generate a visual brief that stays consistent across the whole carousel.",
    steps: [
      "Choose one audience, one problem, and one result for the carousel.",
      "Run the prompts in order and fact-check every claim before designing slides.",
      "Build the slides in your preferred design tool, check them at phone size, and export at a consistent aspect ratio.",
    ],
    links: [
      {
        label: "Open ChatGPT",
        url: "https://chatgpt.com/",
        note: "Paste the prompts below in one conversation so the context carries forward.",
      },
    ],
    prompts: [
      {
        title: "01 · Plan the seven-slide story",
        when: "Start with one narrow topic and a clearly defined reader.",
        text: "Act as an experienced Instagram carousel editor. Plan a seven-slide educational carousel about [TOPIC] for [AUDIENCE]. The reader's current problem is [PROBLEM], and the useful result I want to give them is [RESULT].\n\nCreate:\n1. A specific, curiosity-driven cover hook without clickbait\n2. A slide-by-slide story arc with exactly one job per slide\n3. One concrete example, proof point, or demonstration\n4. A final slide with a natural call to action: [CTA]\n\nKeep each slide skimmable on a phone. Flag any factual claim that needs a source. Do not write final slide copy yet; first show the structure and explain why each slide earns the next swipe.",
      },
      {
        title: "02 · Write concise slide copy",
        when: "Use after approving the story arc.",
        text: "Write the final copy for the approved seven-slide Instagram carousel.\n\nFor every slide provide:\n- A short heading\n- No more than 35 words of body copy\n- One optional visual cue\n\nUse plain, natural language. Vary sentence length, remove filler, and avoid generic hype. Preserve any source notes beside factual claims so I can verify them before publishing. End with the approved call to action, not a new sales pitch.",
      },
      {
        title: "03 · Create one visual system",
        when: "Finish with this before opening your design tool.",
        text: "Turn the approved carousel into a consistent visual brief.\n\nDefine one layout system for all seven slides: typography hierarchy, safe margins, grid, color palette, image treatment, icon style, and progress indicator. Make the cover visually distinct while keeping the remaining slides recognizably part of the same set.\n\nFor each slide, describe the composition and the single most important visual element. Prioritize readability at phone size, strong contrast, and accessible text. Do not generate fake charts, fake screenshots, logos I do not own, or visual evidence that was not supplied.",
      },
    ],
    note: "This reproduces the workflow shown in the Reel as an editable prompt pack. It does not pretend an unidentified private custom-GPT URL is public.",
  },
  "human-sounding-chatgpt-instructions": {
    eyebrow: "Writing personalization",
    title: "Human-sounding ChatGPT custom instruction",
    summary: "The exact compact custom instruction shown in the Reel, plus the safe path for adding it to ChatGPT personalization.",
    offer: "Ask ChatGPT to revise for clarity, precision, repetition, and factual accuracy before it returns the final draft—without claiming any detector can prove who wrote it.",
    steps: [
      "Open ChatGPT settings and choose Personalization.",
      "Paste the instruction below into Custom instructions and save it.",
      "Review every important draft yourself; personalization changes style, not factual reliability or authorship proof.",
    ],
    links: [
      {
        label: "Open ChatGPT",
        url: "https://chatgpt.com/",
      },
    ],
    prompts: [
      {
        title: "Custom instruction from the Reel",
        when: "Paste this into ChatGPT → Settings → Personalization → Custom instructions.",
        text: "Before responding, revise once to improve clarity, flow, and precision. Cut unnecessary words, check for repetition, verify factual claims when possible, and ensure the final result reads like thoughtful, well-edited writing created for a real reader.",
      },
    ],
    note: "No instruction can guarantee a particular AI-detector score. Use this to improve editing quality, disclose AI assistance when required, and verify claims before publishing.",
  },
  "opentradex": {
    eyebrow: "Open-source trading cockpit",
    title: "OpenTradex: repository + paper-first setup",
    summary: "The exact public repository displayed in the Reel, with its current paper-first quickstart and safety constraints.",
    offer: "Read the maintained README, keep paper-only mode on, and understand every connector and credential before considering live trading.",
    steps: [
      "Read the current README and security notes before installing anything.",
      "Start with the documented paper-only onboarding flow and use test credentials where a provider supports them.",
      "Review every proposed action yourself. Do not give an agent unrestricted live-trading authority or funds you cannot afford to lose.",
    ],
    links: [
      {
        label: "OpenTradex GitHub repository",
        url: "https://github.com/deonmenezes/opentradex",
      },
      {
        label: "OpenTradex releases",
        url: "https://github.com/deonmenezes/opentradex/releases",
      },
    ],
    note: "OpenTradex is open-source software, not financial advice, a performance claim, or a guarantee. Its current README is the source of truth because the project has changed since the Reel.",
  },
  "modern-robotics-roadmap": {
    eyebrow: "Beginner-to-builder path",
    title: "Modern robotics roadmap",
    summary: "A staged route from programming and electronics through kinematics, control, ROS 2, simulation, and a portfolio-ready robot project.",
    offer: "Use the official Northwestern Modern Robotics materials for foundations, then learn ROS 2 in order and prove each stage with a small working project.",
    steps: [
      "Foundation: learn Python, basic linear algebra, mechanics, circuits, sensors, and microcontroller I/O.",
      "Robot math: work through frames, rigid-body motion, kinematics, dynamics, planning, and control using Modern Robotics.",
      "Robot software: complete the ROS 2 beginner path, use simulation before hardware, then build and document one complete robot system.",
    ],
    links: [
      {
        label: "Modern Robotics textbook and course materials",
        url: "https://hades.mech.northwestern.edu/index.php/Modern_Robotics",
      },
      {
        label: "ROS 2 official tutorials",
        url: "https://docs.ros.org/en/lyrical/Tutorials.html",
      },
      {
        label: "NVIDIA Isaac Sim documentation",
        url: "https://docs.isaacsim.omniverse.nvidia.com/latest/index.html",
      },
      {
        label: "Python official tutorial",
        url: "https://docs.python.org/3/tutorial/",
      },
    ],
    note: "There is no single universal robotics stack. Choose hardware only after your first simulated project defines the sensors, actuators, compute, and safety requirements you actually need.",
  },
  "important-apis-starter-list": {
    eyebrow: "2026 builder stack",
    title: "Important APIs: official starting list",
    summary: "A practical list of official API entry points for AI, payments, email, messaging, data, authentication, maps, source control, and deployment.",
    offer: "Pick APIs by the capability your product needs, read the official authentication and limits pages, and test the smallest server-side request before adding a full SDK.",
    steps: [
      "Define the user outcome first; do not add an API because it is popular.",
      "Read the provider's official quickstart, authentication, rate-limit, pricing, and webhook-security pages.",
      "Keep credentials server-side, use the narrowest permissions available, verify webhook signatures, and budget for retries and outages.",
    ],
    links: [
      {
        label: "OpenAI API quickstart",
        url: "https://platform.openai.com/docs/quickstart/make-your-first-api-request",
      },
      {
        label: "Stripe API reference",
        url: "https://docs.stripe.com/api",
      },
      {
        label: "Resend API reference",
        url: "https://resend.com/docs/api-reference/introduction",
      },
      {
        label: "Twilio API request guide",
        url: "https://www.twilio.com/docs/usage/requests-to-twilio",
      },
      {
        label: "Supabase JavaScript reference",
        url: "https://supabase.com/docs/reference/javascript/introduction",
      },
      {
        label: "Clerk Backend API",
        url: "https://clerk.com/docs/reference/backend-api",
      },
      {
        label: "Google Maps Platform documentation",
        url: "https://developers.google.com/maps/documentation",
      },
      {
        label: "GitHub REST API",
        url: "https://docs.github.com/en/rest",
      },
      {
        label: "Vercel REST API",
        url: "https://vercel.com/docs/rest-api",
      },
    ],
    note: "The Reel promises an API list but does not publish an original fixed list in its caption. This page is a maintained official-documentation starting point, not a claim that every product needs every provider.",
  },  "open-source-models": {
    eyebrow: "Run AI locally · from the Reel",
    title: "Best open-source models you can run locally",
    summary: "The three tiers from the Reel — an 8 GB laptop, a 24 GB gaming GPU, and your own servers — with the official model cards, the benchmark numbers shown on screen, and the tools that run them.",
    offer: "Match the model to the hardware you already own, install Ollama or LM Studio, pull the official weights, and only think about H100s if you genuinely need frontier scores on your own metal.",
    steps: [
      "8 GB RAM laptop, no GPU needed: run Qwen 3.5 4B (MMLU-Pro 79.1, GPQA Diamond 76.2, LiveCodeBench 55.8) or Gemma 4 E4B (69.4 / 58.6 / 52.0). Qwen is the stronger all-rounder; Gemma adds image and audio input.",
      "24 GB VRAM card such as an RTX 4090 (an RTX 4080 works with a smaller quantisation): run Qwen 3.5 27B (86.1 / 85.5 / 80.7) or Gemma 4 31B (85.2 / 84.3 / 80.0) for frontier-class scores at home.",
      "Your own servers: Kimi K3 is a 2.8-trillion-parameter MoE (104B active, 1M-token context) scoring GPQA Diamond 93.5, BrowseComp 91.2, Terminal-Bench 88.3 and SWE-bench Verified 76.8. Plan on six to eight H100s.",
      "Setup: install Ollama and run \"ollama run qwen3.5\" or \"ollama run gemma4\", or use LM Studio's GUI. Pick a quantisation that fits your RAM or VRAM with headroom, and keep the model card's recommended sampling settings.",
      "The price tag: one H100 80 GB is $25K–$40K, an 8× HGX H100 server $250K–$320K, and cloud rental $2–7 per GPU-hour, versus roughly $20 a month for a hosted subscription. Run small models locally for free; rent GPUs only for bursts.",
    ],
    links: [
      {
        label: "Qwen 3.5 4B model card",
        url: "https://huggingface.co/Qwen/Qwen3.5-4B",
        note: "The 8 GB laptop pick.",
      },
      {
        label: "Qwen 3.5 27B model card",
        url: "https://huggingface.co/Qwen/Qwen3.5-27B",
        note: "The 24 GB VRAM pick; 262K-token context natively.",
      },
      {
        label: "Gemma 4 E4B (instruction-tuned) model card",
        url: "https://huggingface.co/google/gemma-4-E4B-it",
        note: "Text, image, and audio input on a laptop.",
      },
      {
        label: "Gemma 4 31B (instruction-tuned) model card",
        url: "https://huggingface.co/google/gemma-4-31B-it",
      },
      {
        label: "Kimi K3 model card",
        url: "https://huggingface.co/moonshotai/Kimi-K3",
        note: "2.8T total / 104B activated MoE; the server-class option.",
      },
      {
        label: "Ollama: Qwen 3.5",
        url: "https://ollama.com/library/qwen3.5",
      },
      {
        label: "Ollama: Gemma 4",
        url: "https://ollama.com/library/gemma4",
      },
      {
        label: "Ollama: Kimi K3",
        url: "https://ollama.com/library/kimi-k3",
      },
      {
        label: "Download Ollama",
        url: "https://ollama.com/download",
      },
      {
        label: "LM Studio",
        url: "https://lmstudio.ai/",
      },
      {
        label: "llama.cpp on GitHub",
        url: "https://github.com/ggml-org/llama.cpp",
      },
    ],
    note: "Scores are the ones shown in the Reel, taken from each vendor's official model card at recording time; vendors revise their evals, so re-check the card before quoting a number. Local runs use quantised weights, which trade a little accuracy for fitting in memory.",
  },
});

export const RESOURCE_SLUGS = Object.freeze(Object.keys(RESOURCE_PAGES));

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderSteps(steps) {
  return steps
    .map(
      (step, index) => `
          <li>
            <span aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
            <p>${escapeHtml(step)}</p>
          </li>`,
    )
    .join("");
}

function renderLinks(links) {
  return links
    .map(
      (link) => `
          <li>
            <a href="${escapeHtml(link.url)}">
              <span>${escapeHtml(link.label)}</span>
              <span aria-hidden="true">↗</span>
            </a>
            ${
              link.note
                ? `<p class="source-note">${escapeHtml(link.note)}</p>`
                : ""
            }
          </li>`,
    )
    .join("");
}

function renderPrompts(prompts) {
  return prompts
    .map(
      (prompt) => `
          <li>
            <p class="prompt-title">${escapeHtml(prompt.title)}</p>
            <p class="prompt-when">${escapeHtml(prompt.when)}</p>
            <pre class="prompt-text">${escapeHtml(prompt.text)}</pre>
          </li>`,
    )
    .join("");
}

function renderPage(slug, resource) {
  const canonicalUrl = `${SITE_ORIGIN}/resources/${slug}`;
  const prompts = resource.prompts?.length
    ? `
      <section class="prompts" aria-labelledby="prompts-title">
        <p class="section-label">Copy these</p>
        <h2 id="prompts-title">The prompts</h2>
        <ol class="prompt-list">${renderPrompts(resource.prompts)}
        </ol>
      </section>`
    : "";
  const note = resource.note
    ? `
        <aside class="note" aria-labelledby="note-title">
          <p class="section-label" id="note-title">Keep in mind</p>
          <p>${escapeHtml(resource.note)}</p>
        </aside>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(resource.title)} · Deon Menezes</title>
  <meta name="description" content="${escapeHtml(resource.summary)}">
  <meta name="author" content="Deon Menezes">
  <link rel="canonical" href="${canonicalUrl}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(resource.title)}">
  <meta property="og:description" content="${escapeHtml(resource.summary)}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta name="twitter:card" content="summary">
  <link rel="stylesheet" href="/resources/detail.css">
</head>
<body>
  <a class="skip-link" href="#main">Skip to the resource</a>
  <header class="site-header">
    <a class="brand" href="/deon" aria-label="Deon Menezes portfolio">
      <span class="brand-mark" aria-hidden="true">D</span>
      <span>Deon Menezes</span>
    </a>
    <a class="all-resources" href="/resources">All resources</a>
  </header>

  <main id="main">
    <article>
      <header class="hero">
        <p class="eyebrow">${escapeHtml(resource.eyebrow)}</p>
        <h1>${escapeHtml(resource.title)}</h1>
        <p class="summary">${escapeHtml(resource.summary)}</p>
        <p class="offer">${escapeHtml(resource.offer)}</p>
      </header>

      <div class="resource-grid">
        <section class="checklist" aria-labelledby="checklist-title">
          <p class="section-label">Use this safely</p>
          <h2 id="checklist-title">A practical starting checklist</h2>
          <ol>${renderSteps(resource.steps)}
          </ol>
        </section>

        <section class="sources" aria-labelledby="sources-title">
          <p class="section-label">Source links</p>
          <h2 id="sources-title">Open the source, not a summary</h2>
          <ul>${renderLinks(resource.links)}
          </ul>
        </section>
      </div>
      ${prompts}
      ${note}
    </article>
  </main>

  <footer>
    <p>Free to read. No signup required.</p>
    <a href="/resources">Browse the resource library</a>
  </footer>
</body>
</html>`;
}

export function renderResourcePage(slug) {
  if (!Object.prototype.hasOwnProperty.call(RESOURCE_PAGES, slug)) {
    throw new TypeError(`Unknown resource slug: ${slug}`);
  }
  return renderPage(slug, RESOURCE_PAGES[slug]);
}

export async function buildResourcePages() {
  await mkdir(RESOURCE_DIRECTORY, { recursive: true });
  await Promise.all(
    RESOURCE_SLUGS.map((slug) =>
      writeFile(
        new URL(`../resources/${slug}.html`, import.meta.url),
        `${renderResourcePage(slug)}\n`,
        "utf8",
      ),
    ),
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  await buildResourcePages();
  console.log(`Generated ${RESOURCE_SLUGS.length} static resource pages.`);
}
