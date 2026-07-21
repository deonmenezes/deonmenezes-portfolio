(function () {
  "use strict";

  var prompts = [
    ["/clarify", "Find the real brief", "Think", "When your idea is still fuzzy.", "Before answering, ask me the 3 highest-impact questions needed to understand my goal, audience, constraints, and definition of success. Then restate the brief in one paragraph."],
    ["/angles", "Open up the options", "Think", "When the first idea feels too obvious.", "Generate 10 meaningfully different approaches to [GOAL]. Group them as safe, bold, and unconventional. For each, give the core idea, likely upside, and biggest risk. Avoid cosmetic variations."],
    ["/decide", "Make a reasoned choice", "Think", "When several options look good.", "Compare [OPTIONS] for [GOAL]. First propose 5 weighted criteria, explain the weights, score each option from 1–10, run a sensitivity check, and recommend one. State what new fact could change the decision."],
    ["/teach", "Build a mental model", "Learn", "When you want understanding, not trivia.", "Teach me [TOPIC] at a [BEGINNER/INTERMEDIATE/ADVANCED] level. Start with an intuitive mental model, then the mechanics, one worked example, common misconceptions, and a 5-question self-test with answers hidden below a divider."],
    ["/socratic", "Learn by being guided", "Learn", "When active recall matters.", "Coach me through [TOPIC] using the Socratic method. Ask one question at a time, adapt to my answer, give a small hint before revealing anything, and finish with a concise summary of the gaps I should review."],
    ["/analogy", "Make complexity click", "Learn", "When the explanation is too abstract.", "Explain [CONCEPT] through 3 analogies: everyday life, business, and a technical system. Map each part of the analogy to the real concept, then clearly identify where each analogy breaks down."],
    ["/draft", "Create a strong first version", "Write", "When the blank page is the problem.", "Draft a [FORMAT] about [TOPIC] for [AUDIENCE]. Goal: [OUTCOME]. Voice: [VOICE]. Include [MUST-HAVES], avoid [EXCLUSIONS], and keep it to [LENGTH]. Lead with the strongest point, not background."],
    ["/rewrite", "Improve without losing meaning", "Write", "When the content is right but the delivery is not.", "Rewrite the text below for clarity, energy, and natural rhythm while preserving every material claim. Remove repetition and jargon. Match this voice: [VOICE]. Return the rewrite first, followed by 3 notable edits. TEXT: [PASTE]."],
    ["/repurpose", "Turn one idea into a system", "Write", "When one source should power many channels.", "Repurpose [SOURCE] into: a 5-post social thread, a 150-word newsletter, a 30-second video script, and 5 headline options. Adapt the hook and pacing to each format; do not merely shorten the same copy."],
    ["/research", "Create an evidence plan", "Research", "When you need current, sourced information.", "Research [QUESTION] using current reliable sources if browsing is available. Separate established facts, expert interpretation, and uncertainty. Cite each time-sensitive claim with a direct link and publication date. If browsing is unavailable, say so before answering."],
    ["/compare", "See trade-offs clearly", "Research", "When a feature list is not enough.", "Compare [A] and [B] for [USE CASE] in a table covering cost, setup, capability, limitations, privacy, and best-fit user. Follow with the 3 trade-offs that matter most and a recommendation by user type."],
    ["/verify", "Pressure-test the answer", "Research", "When accuracy matters more than speed.", "Audit the following answer claim by claim. Label each as supported, uncertain, outdated, or incorrect. Explain why, provide a corrected version, and list the sources or primary evidence needed to verify any unresolved claim. ANSWER: [PASTE]."],
    ["/plan", "Turn a goal into action", "Build", "When you know the outcome but not the path.", "Create an execution plan for [GOAL] given [CONTEXT/CONSTRAINTS]. Break it into milestones, concrete tasks, dependencies, owner, effort, and success metric. Identify the critical path and the smallest useful first step I can do today."],
    ["/prototype", "Design the smallest test", "Build", "When you need evidence before commitment.", "Design a low-cost prototype to test this assumption: [ASSUMPTION]. Define the target user, test artifact, procedure, pass/fail metric, sample size, timebox, and what we will do for each possible result."],
    ["/code", "Specify before coding", "Build", "When you want usable implementation, not a snippet dump.", "Act as a senior [STACK] engineer. Build [FEATURE] within these constraints: [CONSTRAINTS]. First list assumptions and file changes. Then provide production-ready code, edge cases, accessibility/security considerations, and focused tests. Do not invent unavailable APIs."],
    ["/critique", "Get useful, specific feedback", "Refine", "When 'make it better' is too vague.", "Critique this [WORK] against [GOAL] for [AUDIENCE]. Evaluate clarity, accuracy, structure, persuasion, and distinctiveness. Rank issues by impact, quote the exact weak point, and propose a concrete fix for each. WORK: [PASTE]."],
    ["/redteam", "Expose hidden weaknesses", "Refine", "Before a launch or high-stakes decision.", "Red-team this plan from the perspectives of a skeptical customer, competitor, operator, and risk reviewer. Find fragile assumptions, failure modes, abuse cases, and second-order effects. Rank by likelihood × impact and propose mitigations."],
    ["/polish", "Run the final quality pass", "Refine", "When the work is almost ready to ship.", "Perform a final quality pass on [WORK]. Check factual consistency, logic, completeness, tone, formatting, accessibility, and obvious edge cases. Fix safe issues directly, flag changes that require my judgment, and return a short pre-publish checklist."]
  ];

  var grid = document.getElementById("promptGrid");
  var toast = document.querySelector(".codes-toast");
  var toastTimer;

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, function (char) {
      return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"}[char];
    });
  }

  function render(filter) {
    if (!grid) return;
    var visible = filter === "All" ? prompts : prompts.filter(function (item) { return item[2] === filter; });
    grid.innerHTML = visible.map(function (item) {
      var originalIndex = prompts.indexOf(item) + 1;
      return '<article class="prompt-card">' +
        '<div class="prompt-card-topline"><span class="prompt-number">' + String(originalIndex).padStart(2, "0") + '</span>' +
        '<span class="prompt-category category-' + item[2].toLowerCase() + '">' + item[2] + '</span></div>' +
        '<h3>' + escapeHtml(item[0]) + '</h3><h4>' + escapeHtml(item[1]) + '</h4>' +
        '<p class="prompt-use">' + escapeHtml(item[3]) + '</p>' +
        '<div class="prompt-copy"><p>' + escapeHtml(item[4]) + '</p>' +
        '<button type="button" class="no-print" data-copy="' + originalIndex + '" aria-label="Copy ' + escapeHtml(item[0]) + ' prompt">▣ Copy prompt</button></div></article>';
    }).join("");
  }

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("is-visible"); }, 1800);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      var copied = document.execCommand("copy");
      document.body.removeChild(area);
      copied ? resolve() : reject(new Error("Copy failed"));
    });
  }

  document.querySelectorAll("[data-filter]").forEach(function (button) {
    button.addEventListener("click", function () {
      document.querySelectorAll("[data-filter]").forEach(function (item) { item.classList.remove("is-active"); });
      button.classList.add("is-active");
      render(button.getAttribute("data-filter"));
    });
  });

  if (grid) {
    grid.addEventListener("click", function (event) {
      var button = event.target.closest("[data-copy]");
      if (!button) return;
      var item = prompts[Number(button.getAttribute("data-copy")) - 1];
      copyText(item[4]).then(function () {
        button.textContent = "✓ Copied";
        showToast(item[0] + " copied");
        setTimeout(function () { button.textContent = "▣ Copy prompt"; }, 1800);
      }).catch(function () { showToast("Select the prompt and copy manually"); });
    });
  }

  var menuButton = document.querySelector(".codes-menu-button");
  var links = document.querySelector(".codes-links");
  if (menuButton && links) {
    menuButton.addEventListener("click", function () {
      var open = links.classList.toggle("is-open");
      menuButton.setAttribute("aria-expanded", String(open));
      menuButton.textContent = open ? "×" : "☰";
    });
    links.addEventListener("click", function () {
      links.classList.remove("is-open");
      menuButton.setAttribute("aria-expanded", "false");
      menuButton.textContent = "☰";
    });
  }

  render("All");
})();
