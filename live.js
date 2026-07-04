/* live.js · paints live counts from /api/stats into [data-live] slots.
   Static HTML already carries recent numbers, so this only ever
   freshens — a failed fetch changes nothing. */
(function () {
  "use strict";
  function fmtK(n) {
    if (n >= 10000) {
      var k = (n / 1000).toFixed(1).replace(/\.0$/, "");
      return k + "K";
    }
    return n.toLocaleString("en-US");
  }
  function set(key, text) {
    document.querySelectorAll('[data-live="' + key + '"]').forEach(function (el) {
      el.textContent = text;
    });
  }
  fetch("/deon/api/stats")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.mantishackStars) {
        set("mantis-stars", "★ " + d.mantishackStars);
        set("mantis-chip", "Mantishack · " + d.mantishackStars + "★");
        // hero counter: retarget, and hard-set after the count-up settles
        document.querySelectorAll('b[data-suffix="★"][data-count]').forEach(function (b) {
          b.dataset.count = d.mantishackStars;
          setTimeout(function () { b.textContent = d.mantishackStars + "★"; }, 2600);
        });
      }
      if (d.opentradexStars) set("otx-stars", "★ " + d.opentradexStars);
      if (d.ghFollowers) set("gh-followers", "@deonmenezes · " + fmtK(d.ghFollowers) + " followers");
      if (d.discordMembers) set("discord", fmtK(d.discordMembers) + " builders");
      if (d.igFollowers) set("ig", "@deon_tech · " + fmtK(d.igFollowers));
      if (d.xFollowers) set("x", "@DeonMen · " + fmtK(d.xFollowers));
      if (d.liFollowers) set("li", fmtK(d.liFollowers) + " followers");
    })
    .catch(function () { /* static numbers stay */ });
})();
