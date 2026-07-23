const copyStatus = document.querySelector(".copy-status");

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.select();
  const copied = document.execCommand("copy");
  textArea.remove();
  if (!copied) throw new Error("Copy command failed");
}

document.querySelectorAll(".copy-button").forEach((button) => {
  let resetTimer;
  button.addEventListener("click", async () => {
    const prompt = button.closest(".prompt-card").querySelector(".prompt-box p").textContent.trim();
    const icon = button.children[0];
    const label = button.children[1];

    try {
      await copyText(prompt);
      document.querySelectorAll(".copy-button.copied").forEach((otherButton) => {
        if (otherButton !== button) {
          otherButton.classList.remove("copied");
          otherButton.children[0].textContent = "⧉";
          otherButton.children[1].textContent = "Copy prompt";
        }
      });
      button.classList.add("copied");
      icon.textContent = "✓";
      label.textContent = "Copied!";
      copyStatus.textContent = `${button.getAttribute("aria-label").replace(/^Copy /, "")} copied to clipboard.`;
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        button.classList.remove("copied");
        icon.textContent = "⧉";
        label.textContent = "Copy prompt";
      }, 1800);
    } catch {
      label.textContent = "Select + copy";
      copyStatus.textContent = "Could not copy automatically. Select the prompt text and copy it manually.";
    }
  });
});

document.querySelector("#year").textContent = new Date().getFullYear();
