/* Deon Menezes · polaroid portfolio interactions */
(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(pointer: fine)").matches;

  /* --- year --- */
  var y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();

  /* --- nav scroll state + progress bar --- */
  var nav = document.getElementById("nav");
  var progress = document.getElementById("progress");
  function onScroll() {
    var sc = window.scrollY || document.documentElement.scrollTop;
    if (nav) nav.classList.toggle("scrolled", sc > 20);
    if (progress) {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = (h > 0 ? (sc / h) * 100 : 0) + "%";
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* --- reveal on scroll --- */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -7% 0px" });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  }

  /* --- count-up (supports prefix + suffix) --- */
  function animateCount(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    var pre = el.getAttribute("data-prefix") || "";
    var suf = el.getAttribute("data-suffix") || "";
    if (reduce) { el.textContent = pre + target.toLocaleString() + suf; return; }
    var dur = 1400, start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = pre + Math.floor(eased * target).toLocaleString() + suf;
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = pre + target.toLocaleString() + suf;
    }
    requestAnimationFrame(step);
  }
  var seen = new WeakSet();
  if ("IntersectionObserver" in window) {
    var co = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && !seen.has(e.target)) { seen.add(e.target); animateCount(e.target); co.unobserve(e.target); }
      });
    }, { threshold: 0.5 });
    document.querySelectorAll("[data-count]").forEach(function (el) { co.observe(el); });
  } else {
    document.querySelectorAll("[data-count]").forEach(animateCount);
  }

  /* --- copy-for-agent --- */
  var mdEl = document.getElementById("agentMd");
  var md = mdEl ? mdEl.textContent.trim() : "";
  var toast = document.getElementById("toast");
  var toastTimer;
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 2600);
  }
  function copyAgent() {
    var done = function () { showToast("Copied. Paste it into your agent ✦"); };
    var fail = function () { showToast("Press ⌘C / Ctrl-C to copy"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(md).then(done).catch(function () { legacyCopy(done, fail); });
    } else { legacyCopy(done, fail); }
  }
  function legacyCopy(done, fail) {
    try {
      var ta = document.createElement("textarea");
      ta.value = md; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      ok ? done() : fail();
    } catch (e) { fail(); }
  }
  document.querySelectorAll("[data-copy]").forEach(function (b) {
    b.addEventListener("click", copyAgent);
  });

  /* --- flip moment cards (click + keyboard) --- */
  document.querySelectorAll(".moment").forEach(function (card) {
    function toggle() {
      var flipped = card.classList.toggle("flipped");
      var v = card.querySelector("video");
      if (v && flipped) v.pause();
    }
    card.addEventListener("click", toggle);
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); toggle(); }
    });
  });

  /* --- play moment videos on hover --- */
  document.querySelectorAll(".polaroid video").forEach(function (v) {
    var fig = v.closest(".polaroid");
    if (!fig) return;
    fig.addEventListener("mouseenter", function () {
      if (v.preload === "none") v.preload = "auto";
      var p = v.play(); if (p && p.catch) p.catch(function () {});
    });
    fig.addEventListener("mouseleave", function () { v.pause(); });
  });

  /* --- magnetic buttons (desktop) --- */
  if (finePointer && !reduce) {
    document.querySelectorAll(".btn").forEach(function (btn) {
      btn.addEventListener("mousemove", function (e) {
        var r = btn.getBoundingClientRect();
        var mx = e.clientX - r.left - r.width / 2;
        var my = e.clientY - r.top - r.height / 2;
        btn.style.transform = "translate(" + mx * 0.15 + "px," + my * 0.3 + "px)";
      });
      btn.addEventListener("mouseleave", function () { btn.style.transform = ""; });
    });
  }

  /* --- subtle parallax on hero stage --- */
  if (finePointer && !reduce) {
    var stage = document.querySelector(".hero-stage");
    if (stage) {
      var hero = document.querySelector(".hero");
      hero.addEventListener("mousemove", function (e) {
        var r = hero.getBoundingClientRect();
        var dx = (e.clientX - r.left) / r.width - 0.5;
        var dy = (e.clientY - r.top) / r.height - 0.5;
        var ph = stage.querySelector(".p-hero");
        var pf = stage.querySelector(".p-float");
        if (ph) ph.style.transform = "rotate(3.5deg) translate(" + dx * 14 + "px," + dy * 14 + "px)";
        if (pf) pf.style.transform = "rotate(-7deg) translate(" + dx * 28 + "px," + dy * 28 + "px)";
      });
      hero.addEventListener("mouseleave", function () {
        var ph = stage.querySelector(".p-hero"); var pf = stage.querySelector(".p-float");
        if (ph) ph.style.transform = ""; if (pf) pf.style.transform = "";
      });
    }
  }

  /* --- scroll-parallax for floating stickers --- */
  if (!reduce) {
    var confetti = document.querySelectorAll(".confetti span");
    var ticking = false;
    window.addEventListener("scroll", function () {
      if (ticking) return; ticking = true;
      requestAnimationFrame(function () {
        var sc = window.scrollY;
        confetti.forEach(function (s, i) {
          s.style.transform = "translateY(" + sc * (0.04 + i * 0.015) + "px)";
        });
        ticking = false;
      });
    }, { passive: true });
  }
})();
