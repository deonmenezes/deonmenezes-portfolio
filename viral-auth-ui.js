/* Sign-in, asked for only when a visitor tries to post. The page hands in what
   it owns (toasts, the draft); this module owns the dialog, the popup, and who
   is signed in. `gate()` answers at once: true means go ahead; false means the
   dialog is open and `onSignedIn` will run once they are in. */

const CHANNEL = "virelity-auth";
const DRAFT_KEY = "viral_auth_draft";
const ERRORS = {
  cancelled: "Sign-in was cancelled.",
  expired: "That took too long. Try again.",
  unavailable: "That option isn't available right now.",
  failed: "Couldn't sign you in. Try again.",
  use_email: "That email already has an account. Sign in with an email code instead.",
};

export function createAuth({ dialog, account, showToast, onSignedIn, saveDraft, restoreDraft }) {
  const find = (selector) => dialog.querySelector(selector);
  const status = find("[data-auth-status]");
  const options = find("[data-auth-options]");
  const emailForm = find("[data-auth-email]");
  const emailInput = find("[data-auth-email-input]");
  const codeForm = find("[data-auth-code]");
  const codeInput = find("[data-auth-code-input]");
  const providerButtons = [...dialog.querySelectorAll("[data-auth-provider]")];

  // Unknown until the first answer from the server.
  let state = null;
  let waiting = false;
  let email = "";

  const returnPath = location.pathname === "/viral" ? "/viral" : "/";

  function say(message, error = false) {
    status.textContent = message || "";
    status.classList.toggle("is-error", Boolean(error && message));
  }

  function paintAccount() {
    const user = state?.user;
    account.hidden = !user;
    if (user) account.querySelector("[data-auth-who]").textContent = user.email || user.name || "you";
  }

  function paintDialog() {
    const offered = new Set(state?.providers || []);
    for (const button of providerButtons) button.hidden = !offered.has(button.dataset.authProvider);
    emailForm.hidden = !offered.has("email");
    find("[data-auth-or]").hidden = !(offered.has("email") && (offered.has("google") || offered.has("apple")));
  }

  function showStep(step) {
    options.hidden = step !== "options";
    codeForm.hidden = step !== "code";
  }

  async function refresh() {
    try {
      const response = await fetch("/api/viral/auth?action=me", { cache: "no-store" });
      if (response.ok) state = await response.json();
    } catch { /* keep what we had */ }
    paintAccount();
    paintDialog();
    return state;
  }

  async function finish() {
    await refresh();
    if (!state?.user) return;
    const go = waiting;
    waiting = false;
    if (dialog.open) dialog.close();
    showToast(`Signed in as ${state.user.email || state.user.name || "you"}.`);
    if (go) onSignedIn();
  }

  function open() {
    waiting = true;
    say("");
    showStep("options");
    paintDialog();
    if (!dialog.open) dialog.showModal();
    // The first answer may still be on its way; if it says they're already in, carry on.
    if (!state) refresh().then(() => { if (state?.user || (state && !state.required)) finish(); });
  }

  function gate() {
    if (state && !state.required) return true;
    if (state?.user) return true;
    open();
    return false;
  }

  // A popup keeps the draft (and any attached video) alive in this page. If the
  // browser blocks it, the whole tab goes, and only the words can come back.
  function startProvider(provider) {
    const url = `/api/viral/auth?action=start&provider=${provider}&to=${encodeURIComponent(returnPath)}`;
    const popup = window.open(url, "virelity-auth", "popup,width=500,height=680");
    if (popup) {
      say("Finish signing in in the window that opened.");
      return;
    }
    saveDraft(DRAFT_KEY);
    location.assign(`${url}&mode=tab`);
  }

  for (const button of providerButtons) {
    button.addEventListener("click", () => startProvider(button.dataset.authProvider));
  }

  const post = (action, body) => fetch(`/api/viral/auth?action=${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (response) => ({ ok: response.ok, ...(await response.json().catch(() => ({}))) }), () => ({ ok: false }));

  emailForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    email = emailInput.value.trim();
    if (!email) return say("Enter your email first.", true);
    const button = emailForm.querySelector("button");
    button.disabled = true;
    say("Sending…");
    const result = await post("email-start", { email });
    button.disabled = false;
    if (!result.ok) return say(result.message || "Couldn't send the code. Try again.", true);
    find("[data-auth-sent]").textContent = `Enter the 6-digit code we sent to ${email}`;
    say("");
    showStep("code");
    codeInput.value = "";
    codeInput.focus();
  });

  codeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = codeForm.querySelector("button[type='submit']");
    button.disabled = true;
    say("Checking…");
    const result = await post("email-verify", { email, code: codeInput.value });
    button.disabled = false;
    if (!result.ok) return say(result.message || "That didn't work. Try again.", true);
    say("");
    finish();
  });

  find("[data-auth-back]").addEventListener("click", () => {
    say("");
    showStep("options");
    emailInput.focus();
  });

  find("[data-auth-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { waiting = false; });

  account.querySelector("[data-auth-signout]").addEventListener("click", async () => {
    await post("signout", {});
    await refresh();
    showToast("Signed out.");
  });

  // The popup reports back on a channel, with a storage event as the fallback.
  // Both routes usually deliver the same message; act on it once.
  let lastHeard = 0;
  function heard(message) {
    if (message?.type !== CHANNEL || message.at === lastHeard) return;
    lastHeard = message.at;
    if (message.signedIn) finish();
    else if (dialog.open) say(ERRORS[message.error] || ERRORS.failed, true);
  }
  try {
    new BroadcastChannel(CHANNEL).addEventListener("message", (event) => heard(event.data));
  } catch { /* the storage event covers it */ }
  addEventListener("storage", (event) => {
    if (event.key !== "viral_auth_ping" || !event.newValue) return;
    try { heard(JSON.parse(event.newValue)); } catch { /* ignore */ }
  });

  // Back from a full-tab sign-in: put the words back and let them press Simulate.
  refresh().then(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has("signed_in")) return;
    params.delete("signed_in");
    history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}${location.hash}`);
    if (state?.user && restoreDraft(DRAFT_KEY)) showToast("You're signed in. Your words are back; add any media again and hit Simulate.");
  });

  return { gate, open, refresh };
}
