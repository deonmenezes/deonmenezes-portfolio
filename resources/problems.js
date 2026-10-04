/* Problems worth solving: filter by field and difficulty, search, sort, and keep the view in the URL. */
(function () {
  "use strict";

  var all = window.PROBLEMS || [];
  var LEVELS = [
    { id: 1, slug: "easy", name: "Easy" },
    { id: 2, slug: "medium", name: "Medium" },
    { id: 3, slug: "hard", name: "Hard" },
    { id: 4, slug: "moonshot", name: "Moonshot" }
  ];

  function slugify(name) {
    return name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  var FIELDS = [];
  all.forEach(function (p) {
    if (!FIELDS.some(function (f) { return f.name === p.field; })) FIELDS.push({ name: p.field, slug: slugify(p.field) });
  });
  FIELDS.sort(function (a, b) { return a.name.localeCompare(b.name); });

  var state = { q: "", fields: [], levels: [], sort: "easy" };

  var $q = document.getElementById("q");
  var $levels = document.getElementById("levels");
  var $fields = document.getElementById("fields");
  var $sort = document.getElementById("sort");
  var $count = document.getElementById("count");
  var $list = document.getElementById("list");
  var $empty = document.getElementById("empty");
  var $reset = document.getElementById("reset");
  var $resetEmpty = document.getElementById("reset-empty");
  var $total = document.getElementById("total");

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function levelOf(id) {
    return LEVELS.filter(function (l) { return l.id === id; })[0];
  }

  /* URL <-> state */
  function readUrl() {
    var params = new URLSearchParams(window.location.search);
    var known = function (list, raw) {
      return (raw || "").split(",").filter(function (s) { return list.some(function (x) { return x.slug === s; }); });
    };
    state.q = (params.get("q") || "").slice(0, 80);
    state.fields = known(FIELDS, params.get("field"));
    state.levels = known(LEVELS, params.get("level"));
    state.sort = params.get("sort") === "hard" ? "hard" : "easy";
  }

  function writeUrl() {
    var params = new URLSearchParams();
    if (state.q) params.set("q", state.q);
    if (state.fields.length) params.set("field", state.fields.join(","));
    if (state.levels.length) params.set("level", state.levels.join(","));
    if (state.sort !== "easy") params.set("sort", state.sort);
    var query = params.toString().replace(/%2C/g, ",");
    window.history.replaceState(null, "", window.location.pathname + (query ? "?" + query : ""));
  }

  /* Matching */
  function matchesText(p, q) {
    if (!q) return true;
    var hay = (p.title + " " + p.field + " " + p.pays + " " + p.why + " " + p.step).toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(function (word) { return hay.indexOf(word) !== -1; });
  }

  function matchesLevel(p) {
    return !state.levels.length || state.levels.indexOf(levelOf(p.level).slug) !== -1;
  }

  function matchesField(p) {
    return !state.fields.length || state.fields.indexOf(slugify(p.field)) !== -1;
  }

  /* Rendering */
  function toggleButton(label, count, pressed, extraClass) {
    var b = el("button", "pill" + (extraClass ? " " + extraClass : ""));
    b.type = "button";
    b.setAttribute("aria-pressed", pressed ? "true" : "false");
    b.appendChild(el("span", "pill-name", label));
    b.appendChild(el("span", "pill-count", String(count)));
    if (!count && !pressed) b.classList.add("pill-none");
    return b;
  }

  function toggle(list, slug) {
    var i = list.indexOf(slug);
    if (i === -1) list.push(slug); else list.splice(i, 1);
  }

  function renderFilters() {
    var byText = all.filter(function (p) { return matchesText(p, state.q); });

    $levels.textContent = "";
    LEVELS.forEach(function (l) {
      var n = byText.filter(function (p) { return p.level === l.id && matchesField(p); }).length;
      var b = toggleButton(l.name, n, state.levels.indexOf(l.slug) !== -1, "pill-level-" + l.id);
      b.addEventListener("click", function () { toggle(state.levels, l.slug); update(); });
      $levels.appendChild(b);
    });

    $fields.textContent = "";
    FIELDS.forEach(function (f) {
      var n = byText.filter(function (p) { return p.field === f.name && matchesLevel(p); }).length;
      var b = toggleButton(f.name, n, state.fields.indexOf(f.slug) !== -1);
      b.addEventListener("click", function () { toggle(state.fields, f.slug); update(); });
      $fields.appendChild(b);
    });
  }

  function row(label, text) {
    var wrap = el("div");
    wrap.appendChild(el("dt", null, label));
    wrap.appendChild(el("dd", null, text));
    return wrap;
  }

  function card(p) {
    var li = el("li", "problem");
    var meta = el("p", "meta");
    meta.appendChild(el("span", "level level-" + p.level, levelOf(p.level).name));
    meta.appendChild(el("span", "field", p.field));
    li.appendChild(meta);
    li.appendChild(el("h2", null, p.title));
    var dl = el("dl");
    dl.appendChild(row("Who pays", p.pays));
    dl.appendChild(row("Why it is still open", p.why));
    dl.appendChild(row("First step this month", p.step));
    li.appendChild(dl);
    if (p.source) {
      var src = el("p", "source");
      src.appendChild(el("q", null, p.source.quote));
      var a = el("a", null, p.source.by + " ↗");
      a.href = p.source.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      src.appendChild(a);
      li.appendChild(src);
    }
    return li;
  }

  function renderList() {
    var shown = all.filter(function (p) { return matchesText(p, state.q) && matchesLevel(p) && matchesField(p); });
    var dir = state.sort === "hard" ? -1 : 1;
    shown.sort(function (a, b) { return (a.level - b.level) * dir || a.id - b.id; });

    $list.textContent = "";
    var frag = document.createDocumentFragment();
    shown.forEach(function (p) { frag.appendChild(card(p)); });
    $list.appendChild(frag);

    var filtered = state.q || state.fields.length || state.levels.length;
    $count.textContent = filtered
      ? shown.length + " of " + all.length + (all.length === 1 ? " problem" : " problems")
      : "All " + all.length + " problems";
    $empty.hidden = shown.length !== 0;
    $list.hidden = shown.length === 0;
    $reset.hidden = !filtered && state.sort === "easy";
  }

  function update() {
    writeUrl();
    renderFilters();
    renderList();
  }

  function reset() {
    state = { q: "", fields: [], levels: [], sort: "easy" };
    $q.value = "";
    $sort.value = "easy";
    update();
  }

  if (!all.length) {
    $count.textContent = "The list did not load. Reload the page.";
    return;
  }

  readUrl();
  $q.value = state.q;
  $sort.value = state.sort;
  if ($total) $total.textContent = String(all.length);

  var typing;
  $q.addEventListener("input", function () {
    window.clearTimeout(typing);
    typing = window.setTimeout(function () { state.q = $q.value.trim(); update(); }, 120);
  });
  $sort.addEventListener("change", function () { state.sort = $sort.value; update(); });
  $reset.addEventListener("click", reset);
  $resetEmpty.addEventListener("click", reset);

  renderFilters();
  renderList();
})();
