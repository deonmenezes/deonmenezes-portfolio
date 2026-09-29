const doc = document.getElementById("doc");
const toast = document.querySelector(".copy-toast");
const frame = document.querySelector(".doc-frame");
const copyButtons = document.querySelectorAll("[data-copy-doc]");
const expandButton = document.querySelector("[data-expand-doc]");
const originalLabels = new WeakMap();
const resetTimers = new WeakMap();
let toastTimer;

copyButtons.forEach((button) => originalLabels.set(button, button.innerHTML));

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

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2200);
}

copyButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    try {
      await copyText(doc.textContent.trim() + "\n");
      window.clearTimeout(resetTimers.get(button));
      button.classList.add("copied");
      button.innerHTML = '<span aria-hidden="true">✓</span> Copied';
      showToast("Copied. Paste it into Claude Code or Codex.");
      resetTimers.set(
        button,
        window.setTimeout(() => {
          button.classList.remove("copied");
          button.innerHTML = originalLabels.get(button);
        }, 2000),
      );
    } catch {
      showToast("Copy failed. Use Download .md instead.");
    }
  });
});

expandButton?.addEventListener("click", () => {
  frame.classList.add("open");
  expandButton.setAttribute("aria-expanded", "true");
});
