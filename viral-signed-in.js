/* Where a Google or Apple sign-in ends. It tells the page that opened it (the
   post waiting there goes ahead), then closes. Opened as a full tab instead of
   a popup, it goes back to the simulator. */

const params = new URLSearchParams(location.search);
const to = params.get("to") === "/viral" ? "/viral" : "/";
const error = params.get("error");
const MESSAGES = {
  cancelled: "Sign-in was cancelled. Nothing was posted.",
  expired: "That sign-in took too long. Close this window and try again.",
  unavailable: "That sign-in option isn't available right now.",
  failed: "Couldn't sign you in. Close this window and try again.",
  use_email: "That email already has an account. Close this window and sign in with an email code instead.",
};

const message = { type: "virelity-auth", signedIn: !error, error: error || null, at: Date.now() };
try {
  new BroadcastChannel("virelity-auth").postMessage(message);
} catch { /* the storage event below still reaches the page */ }
try {
  localStorage.setItem("viral_auth_ping", JSON.stringify(message));
} catch { /* nothing else to do */ }

const title = document.querySelector("[data-title]");
const lead = document.querySelector("[data-lead]");
const back = document.querySelector("[data-back]");
back.href = to;
title.textContent = error ? "Not signed in" : "You're signed in";
lead.textContent = error ? MESSAGES[error] || MESSAGES.failed : "Your post is going up. You can close this window.";

if (params.get("tab") === "1") {
  location.replace(error ? to : `${to}?signed_in=1`);
} else {
  if (!error) window.close();
  // Still open: the browser wouldn't let a script close it, or there was a problem to read.
  setTimeout(() => { back.hidden = false; }, 300);
}
