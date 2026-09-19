/* Deon X Jev page: key generation, the try-it box, and copyable snippets.
   The page CSP forbids inline styles, so results use <meter> instead of
   width-styled bars. */

const STORAGE_KEY = "djev_key";
const PLACEHOLDER = "YOUR_DJEV_KEY";

const createButton = document.querySelector("[data-key-create]");
const keyBox = document.querySelector("[data-key-box]");
const keyValue = document.querySelector("[data-key-value]");
const keyStatus = document.querySelector("[data-key-status]");
const snippets = [...document.querySelectorAll("[data-snippet]")];
const templates = new Map(snippets.map((node) => [node, node.textContent]));

function storedKey() {
  try { return localStorage.getItem(STORAGE_KEY) || ""; } catch { return ""; }
}

function setStatus(node, message, isError = false) {
  node.textContent = message;
  node.classList.toggle("is-error", isError);
}

function showKey(key) {
  keyValue.textContent = key;
  keyBox.hidden = false;
  createButton.textContent = "Generate another key";
  for (const [node, template] of templates) node.textContent = template.replaceAll(PLACEHOLDER, key);
}

async function copyText(button, text) {
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Copied";
  } catch {
    button.textContent = "Press Ctrl+C";
  }
  setTimeout(() => { button.textContent = original; }, 1600);
}

createButton?.addEventListener("click", async () => {
  createButton.disabled = true;
  setStatus(keyStatus, "Generating…");
  try {
    const response = await fetch("/api/jev/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (response.status === 429) throw new Error("You've made 3 keys today. Try again tomorrow.");
    if (!response.ok) throw new Error("Couldn't create a key right now. Please try again.");
    const { key } = await response.json();
    try { localStorage.setItem(STORAGE_KEY, key); } catch { /* private mode: the key still shows once */ }
    showKey(key);
    setStatus(keyStatus, "Done. Copy it now — it won't be shown again on another device.");
  } catch (error) {
    setStatus(keyStatus, error.message, true);
  } finally {
    createButton.disabled = false;
  }
});

document.querySelector("[data-copy-key]")?.addEventListener("click", (event) => {
  copyText(event.currentTarget, keyValue.textContent);
});

for (const button of document.querySelectorAll("[data-copy-snippet]")) {
  button.addEventListener("click", () => {
    copyText(button, button.parentElement.querySelector("[data-snippet]").textContent);
  });
}

/* ------------------------------------------------------------- try it */

const tryForm = document.querySelector("[data-try-form]");
const trySubmit = document.querySelector("[data-try-submit]");
const tryStatus = document.querySelector("[data-try-status]");
const tryResults = document.querySelector("[data-try-results]");

function percent(value) {
  return `${Math.round(Number(value) * 100)}%`;
}

function meterRow(labelText, value, max = 1) {
  const row = document.createElement("div");
  row.className = "jev-meter-row";
  const label = document.createElement("span");
  label.textContent = labelText;
  const meter = document.createElement("meter");
  meter.min = 0;
  meter.max = max;
  meter.value = Number(value);
  const figure = document.createElement("span");
  figure.className = "jev-figure";
  figure.textContent = max === 1 ? percent(value) : `${Number(value).toFixed(2)} / ${max}`;
  row.append(label, meter, figure);
  return row;
}

function renderAnswer(name, answer, question) {
  const card = document.createElement("div");
  card.className = "jev-answer";

  const title = document.createElement("p");
  title.className = "jev-answer-name";
  title.textContent = name;

  const verdict = document.createElement("p");
  verdict.className = "jev-answer-verdict";
  card.append(title, verdict);

  if (answer.type === "boolean") {
    verdict.textContent = answer.probability >= 0.5 ? "Yes" : "No";
    card.append(meterRow("Chance of yes", answer.probability));
  } else if (answer.type === "choice") {
    verdict.textContent = answer.choice;
    const ranked = Object.entries(answer.probabilities || {}).sort((a, b) => b[1] - a[1]);
    for (const [option, probability] of ranked) card.append(meterRow(option, probability));
  } else if (answer.type === "score") {
    const levels = Array.isArray(question?.criteria) ? question.criteria : [];
    const nearest = levels[Math.round(answer.score)];
    verdict.textContent = nearest ? `${nearest}` : String(answer.score);
    card.append(meterRow("Score", answer.score, Math.max(1, levels.length - 1)));
  }
  return card;
}

tryForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const key = storedKey();
  if (!key) {
    setStatus(tryStatus, "Generate your key in step 1 first.", true);
    document.querySelector("#get-key")?.scrollIntoView({ behavior: "smooth" });
    return;
  }

  const data = new FormData(tryForm);
  let questions;
  try {
    questions = JSON.parse(String(data.get("questions")));
  } catch {
    setStatus(tryStatus, "The questions box isn't valid JSON. Check for a missing comma or quote.", true);
    return;
  }

  trySubmit.disabled = true;
  setStatus(tryStatus, "Asking Jev…");
  const started = performance.now();
  try {
    const response = await fetch("/api/jev", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ state: String(data.get("state")), questions }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || "Jev couldn't answer right now. Please try again.");

    const cards = Object.entries(body.answers).map(([name, answer]) => renderAnswer(name, answer, questions[name]));
    tryResults.replaceChildren(...cards);
    tryResults.hidden = false;
    setStatus(tryStatus, `Answered in ${Math.round(performance.now() - started)} ms. ${body.remainingToday} requests left today.`);
  } catch (error) {
    setStatus(tryStatus, error.message, true);
  } finally {
    trySubmit.disabled = false;
  }
});

const existing = storedKey();
if (existing) showKey(existing);
