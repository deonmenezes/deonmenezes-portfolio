/* Real comments from visitors on public /viral posts, kept apart from the
   simulated counts. The page hands in what it owns (who the visitor is, which
   posts are shared, toasts); this module owns the comment state and the DOM
   under each post's [data-comments] section. */

const STORAGE_KEYS = "viral_comment_keys";
const PROMPTS = { x: "Post your reply", instagram: "Add a comment…", tiktok: "Add comment…", youtube: "Add a comment…" };

export function createComments({ template, load, save, paintAvatar, timeAgo, showToast, author, sharedPost, ownPost }) {
  const keys = load(STORAGE_KEYS, {});
  const open = new Set();
  const loaded = new Map();

  const send = (body) => fetch("/api/viral/comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);

  function paint(section, post) {
    const count = loaded.get(post.id)?.length ?? sharedPost(post.id)?.realComments ?? 0;
    const isOpen = open.has(post.id);
    const toggle = section.querySelector("[data-comments-toggle]");
    toggle.textContent = isOpen ? "Hide comments" : count ? `View ${count === 1 ? "1 comment" : `all ${count} comments`}` : "Be the first to comment";
    toggle.setAttribute("aria-expanded", String(isOpen));
    section.querySelector("[data-comments-panel]").hidden = !isOpen;
    if (!isOpen) return;

    section.querySelector("[data-comments-list]").replaceChildren(...(loaded.get(post.id) || []).map((comment) => {
      const node = template.content.firstElementChild.cloneNode(true);
      paintAvatar(node.querySelector("[data-avatar]"), comment.name, comment.avatarUrl);
      node.querySelector("[data-name]").textContent = comment.handle || "anonymous";
      node.querySelector("[data-text]").textContent = comment.text;
      node.querySelector("[data-time]").textContent = timeAgo(comment.createdAt);
      // Whoever wrote a comment can remove it, and so can the author of the post it sits on.
      const key = keys[comment.id] || ownPost(post.id)?.deleteKey;
      const remove = node.querySelector("[data-comment-delete]");
      remove.hidden = !key;
      remove.addEventListener("click", async () => {
        const response = await send({ action: "delete", id: post.id, commentId: comment.id, deleteKey: key });
        if (!response?.ok) {
          showToast("Couldn't delete that comment. Try again.");
          return;
        }
        loaded.set(post.id, (loaded.get(post.id) || []).filter((entry) => entry.id !== comment.id));
        delete keys[comment.id];
        save(STORAGE_KEYS, keys);
        paint(section, post);
      });
      return node;
    }));
  }

  async function refresh(section, post) {
    const response = await fetch(`/api/viral/comments?id=${encodeURIComponent(post.id)}`).catch(() => null);
    if (!response?.ok) return;
    loaded.set(post.id, (await response.json()).comments || []);
    if (section.isConnected) paint(section, post);
  }

  /** Wire one rendered post. Only posts in the shared feed can be commented on: samples and private posts cannot. */
  function arm(node, post) {
    const section = node.querySelector("[data-comments]");
    section.hidden = !sharedPost(post.id);
    if (section.hidden) return;
    const input = section.querySelector("[data-comment-input]");
    const submit = section.querySelector("[data-comment-form] button");
    const status = section.querySelector("[data-comment-status]");
    input.placeholder = PROMPTS[post.platform];
    input.addEventListener("input", () => { submit.disabled = !input.value.trim(); });

    section.querySelector("[data-comments-toggle]").addEventListener("click", () => {
      if (open.has(post.id)) open.delete(post.id);
      else {
        open.add(post.id);
        refresh(section, post);
      }
      paint(section, post);
      if (open.has(post.id)) input.focus();
    });

    section.querySelector("[data-comment-form]").addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      submit.disabled = true;
      status.textContent = "Posting…";
      const { handle, name, avatarUrl, verified } = author();
      const response = await send({ action: "add", id: post.id, text, author: { handle, name, avatarUrl, verified } });
      const body = (await response?.json().catch(() => null)) || {};
      if (!response?.ok) {
        status.textContent = body.message || "Couldn't post that. Try again.";
        submit.disabled = false;
        return;
      }
      keys[body.comment.id] = body.deleteKey;
      save(STORAGE_KEYS, keys);
      loaded.set(post.id, [...(loaded.get(post.id) || []), body.comment]);
      input.value = "";
      status.textContent = "";
      paint(section, post);
    });

    paint(section, post);
    if (open.has(post.id) && !loaded.has(post.id)) refresh(section, post);
  }

  /** Open a post's comments from elsewhere, such as its comment icon. */
  function show(node, post) {
    const section = node.querySelector("[data-comments]");
    if (section.hidden) return false;
    if (!open.has(post.id)) section.querySelector("[data-comments-toggle]").click();
    else section.querySelector("[data-comment-input]").focus();
    return true;
  }

  return { arm, show };
}
