/* Draft checks for /viral: things that can be read straight off the text, so they
   cost no Jev call and run as you type. Each one says where the rule comes from.
   Nothing here feeds the score. */

const X_TEXT_SCORER = "X's open-source text scorer (TweetTextScorer, 2023)";

const count = (text, pattern) => (text.match(pattern) || []).length;

/** Share of letters that are capitals, ignoring text too short to judge. */
export function capsRatio(text) {
  const letters = text.match(/\p{L}/gu) || [];
  if (letters.length < 12) return 0;
  return letters.filter((letter) => letter !== letter.toLowerCase()).length / letters.length;
}

/** Warnings for a draft, most useful first. Each is { id, text, source }. */
export function draftChecks(platformId, text) {
  const draft = String(text || "").trim();
  if (!draft) return [];
  const checks = [];
  const hashtags = count(draft, /(^|\s)#[\p{L}\p{N}_]+/gu);
  const firstLine = draft.split("\n")[0];

  if (platformId === "x") {
    if (capsRatio(draft) > 0.5) checks.push({ id: "shout", text: "Mostly capitals. Shouting is one of five things X's text-quality score marks down.", source: X_TEXT_SCORER });
    if (hashtags > 2) checks.push({ id: "hashtags", text: `${hashtags} hashtags. X's ranking code carries a damping factor for posts with several.`, source: "X's open-source ranking parameters (2023)" });
    if (/https?:\/\//iu.test(draft)) checks.push({ id: "link", text: "Has a link. The open code has no link penalty, but opening a link is weighted 0.2 against 5 for a reply, so give people a reason to respond here too.", source: "X For You ranker weights" });
    if (draft.length < 25) checks.push({ id: "short", text: "Very short. Length is half of X's text-quality score.", source: X_TEXT_SCORER });
  }

  if (platformId === "instagram") {
    if (hashtags > 5) checks.push({ id: "hashtags", text: `${hashtags} hashtags. Instagram's own advice is three to five.`, source: "@creators, Instagram" });
    if (firstLine.length > 125) checks.push({ id: "fold", text: "The first line runs past about 125 characters, where the feed cuts a caption off behind \"more\". Put the point before the cut.", source: "How the app displays captions" });
  }

  if (platformId === "tiktok" && draft.length > 150 && !draft.includes("\n")) {
    checks.push({ id: "fold", text: "A long unbroken caption. TikTok shows a line or two before \"more\", so lead with what matters.", source: "How the app displays captions" });
  }

  if (platformId === "youtube") {
    if (draft.length > 70) checks.push({ id: "title", text: `${draft.length} characters. Titles are cut off at around 70 in most places they appear, so front-load the promise.`, source: "How the app displays titles" });
  }

  return checks.slice(0, 3);
}
