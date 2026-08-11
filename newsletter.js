/* The AI Drop page: signup submission and the issue archive.
   Issue HTML comes from Resend and is rendered inside a sandboxed iframe so a
   pasted embed in an issue can never reach into this page. */

const form = document.querySelector("[data-newsletter-form]");
const submit = document.querySelector("[data-newsletter-submit]");
const label = document.querySelector("[data-newsletter-label]");
const status = document.querySelector("[data-newsletter-status]");

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  submit.disabled = true;
  label.textContent = "Joining…";
  status.textContent = "";
  status.classList.remove("is-error");

  const formData = new FormData(form);

  try {
    const response = await fetch(form.action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formData.get("email"),
        company: formData.get("company"),
      }),
    });
    if (!response.ok) {
      throw new Error(
        response.status === 400
          ? "Enter a valid email address."
          : "Unable to subscribe right now. Please try again.",
      );
    }

    form.reset();
    label.textContent = "You're in";
    status.textContent = "Thanks — you'll get the next issue.";
  } catch (error) {
    label.textContent = "Join the newsletter";
    status.textContent = error.message || "Unable to subscribe right now. Please try again.";
    status.classList.add("is-error");
  } finally {
    submit.disabled = false;
  }
});

const archive = document.querySelector("[data-archive]");
const archiveState = document.querySelector("[data-archive-state]");

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function renderIssue(issue) {
  const item = document.createElement("article");
  item.className = "issue";

  const button = document.createElement("button");
  button.className = "issue-summary";
  button.type = "button";
  button.setAttribute("aria-expanded", "false");

  const heading = document.createElement("div");
  heading.className = "issue-heading";

  const subject = document.createElement("span");
  subject.className = "issue-subject";
  subject.textContent = issue.subject;
  heading.append(subject);

  if (issue.preview) {
    const preview = document.createElement("span");
    preview.className = "issue-preview";
    preview.textContent = issue.preview;
    heading.append(preview);
  }

  const date = document.createElement("span");
  date.className = "issue-date";
  date.textContent = formatDate(issue.sent_at);

  button.append(heading, date);

  const body = document.createElement("div");
  body.className = "issue-body";
  body.hidden = true;

  let loaded = false;
  button.addEventListener("click", async () => {
    const open = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", open ? "false" : "true");
    body.hidden = open;
    if (open || loaded) return;

    body.textContent = "Loading…";
    try {
      const response = await fetch(`/api/issues?id=${encodeURIComponent(issue.id)}`);
      if (!response.ok) throw new Error("unavailable");
      const detail = await response.json();

      const frame = document.createElement("iframe");
      frame.setAttribute("sandbox", "");
      frame.setAttribute("loading", "lazy");
      frame.title = issue.subject;
      frame.srcdoc = detail.html || `<pre>${detail.text || ""}</pre>`;
      body.replaceChildren(frame);
      loaded = true;
    } catch {
      body.textContent = "That issue could not be loaded right now.";
    }
  });

  item.append(button, body);
  return item;
}

async function loadArchive() {
  if (!archive) return;
  try {
    const response = await fetch("/api/issues");
    if (!response.ok) throw new Error("unavailable");
    const { issues = [] } = await response.json();

    if (!issues.length) {
      archiveState.textContent = "No issues have gone out yet. Subscribe above and you'll get the first one.";
      return;
    }

    archive.replaceChildren(...issues.map(renderIssue));
  } catch {
    archiveState.textContent = "The archive is unavailable right now.";
  }
}

loadArchive();
