/* Sharing a /viral post, and the three-dot menu on each post.

   A public post has a link that opens the simulator on that exact post. X,
   WhatsApp, Facebook, LinkedIn, Reddit, Telegram, and email all take a link
   from the web. Instagram, TikTok, and YouTube do not: there the link is
   copied and the post's image saved, for the visitor to post themselves. */

const TARGETS = [
  { name: "X", url: ({ text, link }) => `https://twitter.com/intent/tweet?text=${text}&url=${link}` },
  { name: "WhatsApp", url: ({ both }) => `https://wa.me/?text=${both}` },
  { name: "Facebook", url: ({ link }) => `https://www.facebook.com/sharer/sharer.php?u=${link}` },
  { name: "LinkedIn", url: ({ link }) => `https://www.linkedin.com/sharing/share-offsite/?url=${link}` },
  { name: "Reddit", url: ({ text, link }) => `https://www.reddit.com/submit?url=${link}&title=${text}` },
  { name: "Telegram", url: ({ text, link }) => `https://t.me/share/url?url=${link}&text=${text}` },
  { name: "Email", url: ({ text, both }) => `mailto:?subject=${text}&body=${both}` },
];

export function postLink(post) {
  return `${location.origin}${location.pathname}?p=${encodeURIComponent(post.platform)}&post=${encodeURIComponent(post.id)}`;
}

export function createShare({ dialog, isShared, saveImage, showToast }) {
  const grid = dialog.querySelector("[data-share-grid]");
  const note = dialog.querySelector("[data-share-note]");
  dialog.querySelector("[data-share-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });

  async function copy(value, done) {
    try {
      await navigator.clipboard.writeText(value);
      showToast(done);
    } catch {
      showToast("Couldn't copy. Your browser blocked the clipboard.");
    }
  }

  const button = (label, onClick) => {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "share-target";
    node.textContent = label;
    node.addEventListener("click", onClick);
    return node;
  };

  function open(post) {
    const shared = isShared(post);
    const link = shared ? postLink(post) : `${location.origin}${location.pathname}`;
    const words = `"${post.text.slice(0, 100)}${post.text.length > 100 ? "…" : ""}" scored ${post.viralScore}/100 (${post.verdict}) on Virelity`;
    const encoded = { text: encodeURIComponent(words), link: encodeURIComponent(link), both: encodeURIComponent(`${words} ${link}`) };
    note.textContent = shared
      ? "The link opens this exact post. It is a simulation, and says so."
      : "This post is private or only in your browser, so the link goes to the simulator, not to the post.";

    const items = [button("Copy link", () => copy(link, "Link copied."))];
    if (navigator.share) {
      items.push(button("More apps…", () => navigator.share({ title: "Virelity", text: words, url: link }).catch(() => {})));
    }
    for (const target of TARGETS) {
      const anchor = document.createElement("a");
      anchor.className = "share-target";
      anchor.href = target.url(encoded);
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.textContent = target.name;
      items.push(anchor);
    }
    // These three have no share link on the web, so the pieces are handed over instead.
    items.push(button("Instagram, TikTok, YouTube", async () => {
      await copy(link, "Link copied and image saved. Post them from the app.");
      saveImage(post);
    }));
    grid.replaceChildren(...items);
    dialog.showModal();
  }

  return { open, copyLink: (post) => copy(postLink(post), "Link copied.") };
}

/** The three-dot menu. `items` is a list of [label, action, { danger }]; empty entries are skipped. */
export function armMenu(trigger, menu, items) {
  const close = () => {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  };
  menu.replaceChildren(...items.filter(Boolean).map(([label, action, { danger = false } = {}]) => {
    const node = document.createElement("button");
    node.type = "button";
    node.setAttribute("role", "menuitem");
    node.className = danger ? "is-danger" : "";
    node.textContent = label;
    node.addEventListener("click", () => {
      close();
      action();
    });
    return node;
  }));
  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    const opening = menu.hidden;
    for (const other of document.querySelectorAll("[data-menu]:not([hidden])")) other.hidden = true;
    menu.hidden = !opening;
    trigger.setAttribute("aria-expanded", String(opening));
  });
  menu.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
}

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-menu]")) return;
  for (const menu of document.querySelectorAll("[data-menu]:not([hidden])")) menu.hidden = true;
});
