/* fx.js · awwwards motion kit for the scrapbook
   custom cursor · magnetic buttons · split-text reveals · polaroid tilt
   scroll-velocity marquees · parallax · preloader
   All transform/opacity only. Exits early under reduced motion. */
(function () {
  "use strict";
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  /* ---------- 1 · preloader (once per session, < 1.2s) ---------- */
  if (!sessionStorage.dmSeen) {
    sessionStorage.dmSeen = "1";
    var load = document.createElement("div");
    load.className = "dmload";
    load.innerHTML =
      '<div class="dmload-in"><span class="dmload-pin"></span>' +
      '<span class="dmload-name">Deon&nbsp;Menezes</span>' +
      '<em class="dmload-sub">developing the film…</em></div>';
    document.body.appendChild(load);
    document.body.classList.add("dm-loading");
    setTimeout(function () {
      load.classList.add("done");
      document.body.classList.remove("dm-loading");
      setTimeout(function () { load.remove(); }, 700);
    }, 950);
  }

  /* ---------- 2 · split-text masked word reveals ---------- */
  function split(el) {
    if (!el || el.dataset.split) return;
    el.dataset.split = "1";
    var wi = 0;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var w = document.createElement("span"); w.className = "w";
            var i = document.createElement("span"); i.className = "wi";
            i.style.setProperty("--wi", wi++); i.textContent = part;
            w.appendChild(i); frag.appendChild(w);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== "BR") walk(n);
      });
    })(el);
  }
  document.querySelectorAll(".hero-name, .head h2, .svc-hero-txt h1, .svc-cta h2, .connect h2")
    .forEach(split);

  /* ---------- 3 · custom cursor ---------- */
  if (fine) {
    var dot = document.createElement("div"); dot.className = "cur cur-dot";
    var ring = document.createElement("div"); ring.className = "cur cur-ring";
    ring.innerHTML = "<span>open&nbsp;↗</span>";
    document.body.appendChild(dot); document.body.appendChild(ring);
    document.body.classList.add("fx-cursor");
    var mx = innerWidth / 2, my = innerHeight / 2, dx = mx, dy = my, rx = mx, ry = my, seen = false;
    addEventListener("mousemove", function (e) {
      mx = e.clientX; my = e.clientY;
      if (!seen) { seen = true; dx = rx = mx; dy = ry = my; dot.style.opacity = ring.style.opacity = 1; }
      var t = e.target;
      var view = t.closest && t.closest(".cat-card, .p-book, a.polaroid");
      var hov = t.closest && t.closest("a, button, .link");
      ring.classList.toggle("view", !!view);
      ring.classList.toggle("on", !!hov && !view);
    }, { passive: true });
    (function curLoop() {
      dx = lerp(dx, mx, 0.7); dy = lerp(dy, my, 0.7);
      rx = lerp(rx, mx, 0.16); ry = lerp(ry, my, 0.16);
      dot.style.transform = "translate3d(" + dx + "px," + dy + "px,0) translate(-50%,-50%)";
      ring.style.transform = "translate3d(" + rx + "px," + ry + "px,0) translate(-50%,-50%)";
      requestAnimationFrame(curLoop);
    })();
    document.documentElement.addEventListener("mouseleave", function () {
      dot.style.opacity = ring.style.opacity = 0;
    });
    document.documentElement.addEventListener("mouseenter", function () {
      dot.style.opacity = ring.style.opacity = 1;
    });
  }

  /* ---------- 4 · magnetic buttons ---------- */
  if (fine) {
    document.querySelectorAll(".btn, .chip").forEach(function (el) {
      var r;
      el.addEventListener("mouseenter", function () { r = el.getBoundingClientRect(); });
      el.addEventListener("mousemove", function (e) {
        if (!r) r = el.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.24;
        var y = (e.clientY - r.top - r.height / 2) * 0.3;
        el.style.transform = "translate(" + x + "px," + (y - 2) + "px)";
      });
      el.addEventListener("mouseleave", function () { el.style.transform = ""; r = null; });
    });
  }

  /* ---------- 5 · polaroid tilt (composes with --rot via CSS var chain) ---------- */
  if (fine) {
    document.querySelectorAll(".polaroid").forEach(function (el) {
      el.addEventListener("animationend", function () { el.classList.add("popped"); });
      el.addEventListener("mousemove", function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty("--ry", ((e.clientX - r.left) / r.width - 0.5) * 10 + "deg");
        el.style.setProperty("--rx", (0.5 - (e.clientY - r.top) / r.height) * 8 + "deg");
      });
      el.addEventListener("mouseleave", function () {
        el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg");
      });
    });
  }

  /* ---------- 6 · scroll-velocity marquee skew + parallax ---------- */
  var skewEls = document.querySelectorAll(".ticker, .cat-row, .svc-tech, .logo-row, .sponsor-row");
  var plxEls = [];
  document.querySelectorAll(".p-float").forEach(function (e) { plxEls.push([e, -0.055]); });
  document.querySelectorAll(".p-hero").forEach(function (e) { plxEls.push([e, -0.02]); });
  document.querySelectorAll(".svc-polaroid").forEach(function (e) { plxEls.push([e, -0.035]); });
  var lastY = scrollY, vel = 0;
  (function scrollLoop() {
    var y = scrollY;
    vel = lerp(vel, y - lastY, 0.12); lastY = y;
    var skew = Math.max(-5, Math.min(5, vel * 0.35));
    skewEls.forEach(function (el) {
      el.style.transform = "skewX(" + skew.toFixed(3) + "deg)";
    });
    plxEls.forEach(function (p) {
      var r = p[0].getBoundingClientRect();
      if (r.bottom < -80 || r.top > innerHeight + 80) return;
      var c = (r.top + r.height / 2 - innerHeight / 2) * p[1];
      p[0].style.setProperty("--ply", c.toFixed(1) + "px");
    });
    requestAnimationFrame(scrollLoop);
  })();
})();
