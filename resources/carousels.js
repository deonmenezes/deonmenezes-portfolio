const copyButtons = document.querySelectorAll("[data-copy-target]");
const copyAllButton = document.querySelector("[data-copy-all]");
const toast = document.querySelector(".copy-toast");
const originalLabels = new WeakMap();
const resetTimers = new WeakMap();

[...copyButtons, copyAllButton].filter(Boolean).forEach((button) => {
  originalLabels.set(button, button.innerHTML);
});

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard copy was rejected");
}

function showCopied(button, message) {
  const pendingTimer = resetTimers.get(button);
  if (pendingTimer) window.clearTimeout(pendingTimer);

  const original = originalLabels.get(button) ?? button.innerHTML;
  button.classList.add("copied");
  button.innerHTML = '<span aria-hidden="true">✓</span> Copied';
  toast.textContent = message;
  toast.classList.add("visible");

  const timer = window.setTimeout(() => {
    button.classList.remove("copied");
    button.innerHTML = original;
    toast.classList.remove("visible");
    resetTimers.delete(button);
  }, 1800);
  resetTimers.set(button, timer);
}

copyButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const target = document.getElementById(button.dataset.copyTarget);
    if (!target) return;

    try {
      await copyText(target.textContent.trim());
      showCopied(button, "Prompt copied to your clipboard");
    } catch {
      toast.textContent = "Copy failed — select the prompt text manually";
      toast.classList.add("visible");
      window.setTimeout(() => toast.classList.remove("visible"), 2400);
    }
  });
});

copyAllButton?.addEventListener("click", async () => {
  const prompts = [...document.querySelectorAll(".prompt-code")]
    .map((prompt, index) => `${String(index + 1).padStart(2, "0")}\n\n${prompt.textContent.trim()}`)
    .join("\n\n────────────────────\n\n");

  try {
    await copyText(prompts);
    showCopied(copyAllButton, "All four prompts copied");
  } catch {
    toast.textContent = "Copy failed — copy the prompts one at a time";
    toast.classList.add("visible");
    window.setTimeout(() => toast.classList.remove("visible"), 2400);
  }
});

const newsletterForm = document.querySelector("[data-newsletter-form]");
const newsletterSubmit = document.querySelector("[data-newsletter-submit]");
const newsletterLabel = document.querySelector("[data-newsletter-label]");
const newsletterStatus = document.querySelector("[data-newsletter-status]");

newsletterForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!newsletterForm.reportValidity()) return;

  newsletterSubmit.disabled = true;
  newsletterLabel.textContent = "Joining…";
  newsletterStatus.textContent = "";
  newsletterStatus.classList.remove("is-error");

  const formData = new FormData(newsletterForm);

  try {
    const response = await fetch(newsletterForm.action, {
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

    newsletterForm.reset();
    newsletterLabel.textContent = "Request received";
    newsletterStatus.textContent = "Thanks—your newsletter request is recorded.";
  } catch (error) {
    newsletterLabel.textContent = "Join the newsletter";
    newsletterStatus.textContent = error.message || "Unable to subscribe right now. Please try again.";
    newsletterStatus.classList.add("is-error");
  } finally {
    newsletterSubmit.disabled = false;
  }
});
