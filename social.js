(function () {
  "use strict";

  var API_ROOT = "/api/social";
  var ROUTES = ["overview", "automations", "posts", "inbox", "analytics", "health"];
  var state = {
    data: null,
    route: "overview",
    period: 30,
    automationFilter: "all",
    automationQuery: "",
    conversationQuery: "",
    selectedConversationId: null,
    deleteAutomationId: null,
    chartGeometry: new Map(),
  };

  var dom = {};

  function byId(id) { return document.getElementById(id); }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function clear(node) {
    if (node) node.replaceChildren();
  }

  function append(parent) {
    for (var index = 1; index < arguments.length; index += 1) {
      var child = arguments[index];
      if (child) parent.appendChild(child);
    }
    return parent;
  }

  function text(value, fallback) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
    return fallback || "";
  }

  function first(object, keys, fallback) {
    if (!object) return fallback;
    for (var index = 0; index < keys.length; index += 1) {
      var value = object[keys[index]];
      if (value !== undefined && value !== null) return value;
    }
    return fallback;
  }

  function numberFrom(object, keys, fallback) {
    var value = Number(first(object, keys, fallback === undefined ? 0 : fallback));
    return Number.isFinite(value) ? value : (fallback || 0);
  }

  function booleanFrom(object, keys, fallback) {
    var value = first(object, keys, fallback);
    if (value === "true" || value === 1) return true;
    if (value === "false" || value === 0) return false;
    return Boolean(value);
  }

  function array(value) { return Array.isArray(value) ? value : []; }

  function formatNumber(value) {
    var number = Number(value) || 0;
    if (Math.abs(number) >= 1000000) return (number / 1000000).toFixed(number >= 10000000 ? 0 : 1).replace(/\.0$/u, "") + "M";
    if (Math.abs(number) >= 10000) return (number / 1000).toFixed(1).replace(/\.0$/u, "") + "K";
    return new Intl.NumberFormat("en-US").format(number);
  }

  function formatPercent(value) {
    var number = Number(value) || 0;
    return number.toFixed(number % 1 ? 1 : 0) + "%";
  }

  function dateValue(value) {
    var parsed = new Date(value || 0);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  function shortDate(value) {
    var parsed = dateValue(value);
    return parsed ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(parsed) : "—";
  }

  function relativeTime(value) {
    var parsed = dateValue(value);
    if (!parsed) return "—";
    var seconds = Math.round((parsed.getTime() - Date.now()) / 1000);
    var absolute = Math.abs(seconds);
    var unit = "second";
    var divisor = 1;
    if (absolute >= 86400) { unit = "day"; divisor = 86400; }
    else if (absolute >= 3600) { unit = "hour"; divisor = 3600; }
    else if (absolute >= 60) { unit = "minute"; divisor = 60; }
    return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(Math.round(seconds / divisor), unit);
  }

  function safeUrl(value) {
    try {
      var url = new URL(String(value));
      return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
    } catch (_error) {
      return "";
    }
  }

  function initials(value) {
    var pieces = text(value, "Deon Tech").split(/\s+|_/u).filter(Boolean);
    return pieces.slice(0, 2).map(function (piece) { return piece.charAt(0).toUpperCase(); }).join("") || "DT";
  }

  function makeAvatar(name, url, sizeClass) {
    var avatar = element("div", "avatar" + (sizeClass ? " " + sizeClass : ""), initials(name));
    var source = safeUrl(url);
    if (source) {
      var image = element("img");
      image.alt = "";
      image.src = source;
      image.addEventListener("error", function () { image.remove(); });
      avatar.appendChild(image);
    }
    return avatar;
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
      button.dataset.originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = label || "Working…";
    } else {
      button.disabled = false;
      if (button.dataset.originalLabel) button.textContent = button.dataset.originalLabel;
      delete button.dataset.originalLabel;
    }
  }

  function apiErrorMessage(payload, status) {
    return text(payload && (payload.error || payload.message), status === 401 ? "Private access required." : "The request could not be completed.");
  }

  function ApiError(message, status) {
    this.name = "ApiError";
    this.message = message;
    this.status = status;
  }
  ApiError.prototype = Object.create(Error.prototype);

  async function request(path, options) {
    var settings = options || {};
    var response = await fetch(path, {
      method: settings.method || "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: settings.body ? { "Accept": "application/json", "Content-Type": "application/json" } : { "Accept": "application/json" },
      body: settings.body ? JSON.stringify(settings.body) : undefined,
    });
    var payload = null;
    var contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try { payload = await response.json(); } catch (_error) { payload = null; }
    }
    if (!response.ok) throw new ApiError(apiErrorMessage(payload, response.status), response.status);
    return payload || {};
  }

  function cacheDom() {
    dom.authScreen = byId("auth-screen");
    dom.dashboard = byId("dashboard");
    dom.loginForm = byId("login-form");
    dom.password = byId("password");
    dom.loginSubmit = byId("login-submit");
    dom.loginMessage = byId("login-message");
    dom.loading = byId("loading-state");
    dom.views = byId("views");
    dom.globalError = byId("global-error");
    dom.globalErrorText = byId("global-error-text");
    dom.drawer = byId("automation-drawer");
    dom.drawerBackdrop = byId("drawer-backdrop");
    dom.drawerForm = byId("automation-form");
    dom.deleteDialog = byId("delete-dialog");
    dom.toastRegion = byId("toast-region");
  }

  function showLogin(message, isError) {
    dom.dashboard.hidden = true;
    dom.authScreen.hidden = false;
    dom.password.disabled = false;
    dom.loginSubmit.disabled = false;
    dom.loginMessage.textContent = message || "Enter the private dashboard password.";
    dom.loginMessage.classList.toggle("is-error", Boolean(isError));
    if (isError) dom.password.focus();
  }

  function showDashboard() {
    dom.authScreen.hidden = true;
    dom.dashboard.hidden = false;
  }

  function showLoadState() {
    showDashboard();
    dom.loading.hidden = false;
    dom.views.hidden = true;
    dom.globalError.hidden = true;
  }

  function showGlobalError(message) {
    showDashboard();
    dom.loading.hidden = true;
    dom.views.hidden = true;
    dom.globalErrorText.textContent = message;
    dom.globalError.hidden = false;
  }

  async function loadDashboard(options) {
    var initial = options && options.initial;
    if (!initial) showLoadState();
    try {
      var payload = await request(API_ROOT);
      state.data = normalizePayload(payload);
      showDashboard();
      dom.globalError.hidden = true;
      dom.loading.hidden = true;
      dom.views.hidden = false;
      renderAll();
      routeFromHash();
    } catch (error) {
      if (error.status === 401) {
        state.data = null;
        showLogin("Enter the private dashboard password.", false);
      } else if (initial) {
        showLogin(error.message || "The dashboard API is not available yet.", true);
      } else {
        showGlobalError(error.message || "Try again in a moment.");
      }
    }
  }

  function normalizePayload(payload) {
    return {
      account: payload && payload.account ? payload.account : {},
      stats: payload && payload.stats ? payload.stats : {},
      daily: array(payload && payload.daily),
      automations: array(payload && payload.automations),
      media: array(payload && payload.media),
      conversations: array(payload && payload.conversations),
      health: payload && payload.health ? payload.health : {},
    };
  }

  async function handleLogin(event) {
    event.preventDefault();
    var password = dom.password.value;
    dom.loginMessage.classList.remove("is-error");
    if (!password) {
      dom.loginMessage.textContent = "Enter your password to continue.";
      dom.loginMessage.classList.add("is-error");
      dom.password.focus();
      return;
    }
    setBusy(dom.loginSubmit, true, "Opening…");
    dom.password.disabled = true;
    dom.loginMessage.textContent = "Starting your secure session…";
    try {
      await request(API_ROOT + "/login", { method: "POST", body: { password: password } });
      dom.password.value = "";
      await loadDashboard();
    } catch (error) {
      showLogin(error.message || "That password did not work.", true);
    } finally {
      setBusy(dom.loginSubmit, false);
      dom.password.disabled = false;
    }
  }

  async function handleLogout(event) {
    var button = event && event.currentTarget instanceof HTMLElement ? event.currentTarget : byId("logout-button");
    setBusy(button, true, "…");
    try { await request(API_ROOT + "/logout", { method: "POST" }); } catch (_error) { /* The local session is cleared by showing login. */ }
    state.data = null;
    showLogin("You’re signed out.", false);
    setBusy(button, false);
  }

  function routeFromHash() {
    var candidate = window.location.hash.replace(/^#/u, "").split("?")[0];
    setRoute(ROUTES.includes(candidate) ? candidate : "overview", false);
  }

  function setRoute(route, updateHash) {
    if (!ROUTES.includes(route)) route = "overview";
    state.route = route;
    if (updateHash !== false && window.location.hash !== "#" + route) window.location.hash = route;
    document.querySelectorAll("[data-route]").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.route === route);
    });
    document.querySelectorAll("[data-view]").forEach(function (view) {
      view.classList.toggle("is-active", view.dataset.view === route);
    });
    var titles = {
      overview: ["Workspace", "Overview"], automations: ["Manage", "Automations"], posts: ["Library", "Posts"],
      inbox: ["Activity", "Inbox"], analytics: ["Insights", "Analytics"], health: ["Operations", "Health & settings"],
    };
    byId("page-kicker").textContent = titles[route][0];
    byId("page-title").textContent = titles[route][1];
    if (route === "overview" || route === "analytics") window.requestAnimationFrame(drawAllCharts);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderAll() {
    renderAccount();
    renderMetrics();
    renderAutomations();
    renderPosts();
    renderConversations();
    renderAnalytics();
    renderHealth();
    populateMediaSelect();
    window.requestAnimationFrame(drawAllCharts);
  }

  function accountName() {
    var account = state.data.account;
    return text(first(account, ["name", "displayName", "display_name"]), text(first(account, ["username", "handle"]), "Deon"));
  }

  function accountUsername() {
    var username = text(first(state.data.account, ["username", "handle"]), "");
    return username ? (username.charAt(0) === "@" ? username : "@" + username) : "Not connected";
  }

  function renderAccount() {
    var account = state.data.account;
    var name = accountName();
    var username = accountUsername();
    byId("sidebar-name").textContent = name;
    byId("sidebar-handle").textContent = username;
    byId("greeting-name").textContent = name.split(/\s+/u)[0] || "Deon";
    var avatar = byId("sidebar-avatar");
    avatar.textContent = initials(name);
    var imageUrl = safeUrl(first(account, ["profilePictureUrl", "profile_picture_url", "avatarUrl", "avatar_url"], ""));
    if (imageUrl) {
      var image = element("img");
      image.alt = "";
      image.src = imageUrl;
      image.addEventListener("error", function () { image.remove(); });
      avatar.appendChild(image);
    }
    var connected = booleanFrom(account, ["connected", "isConnected", "is_connected"], Boolean(first(account, ["id", "username"], "")));
    var pill = byId("connection-pill");
    pill.classList.toggle("is-healthy", connected);
    pill.classList.toggle("is-error", !connected);
    pill.querySelector("span").textContent = connected ? username + " connected" : "Account attention needed";
  }

  function metricDefinitions() {
    var stats = state.data.stats;
    var dms = numberFrom(stats, ["dmsToday", "dms_today", "dmsSent", "dms_sent"]);
    var clicks = numberFrom(stats, ["clicksToday", "clicks_today", "linkClicks", "link_clicks"]);
    var comments = numberFrom(stats, ["commentsToday", "comments_today", "matchedComments", "matched_comments"]);
    var active = numberFrom(stats, ["activeAutomations", "active_automations"], state.data.automations.filter(isAutomationEnabled).length);
    return [
      { label: "Matched comments", value: formatNumber(comments), trend: numberFrom(stats, ["commentsChange", "comments_change"]), note: "vs previous period", icon: "⌁", color: "#a976ff" },
      { label: "DMs sent", value: formatNumber(dms), trend: numberFrom(stats, ["dmsChange", "dms_change"]), note: "vs previous period", icon: "✉", color: "#f16fc6" },
      { label: "Link clicks", value: formatNumber(clicks), trend: numberFrom(stats, ["clicksChange", "clicks_change"]), note: "vs previous period", icon: "↗", color: "#53dac5" },
      { label: "Active automations", value: formatNumber(active), trend: null, note: active === 1 ? "flow currently live" : "flows currently live", icon: "✦", color: "#67db9c" },
    ];
  }

  function metricCard(definition) {
    var card = element("article", "metric-card");
    card.style.setProperty("--metric-color", definition.color);
    var top = element("div", "metric-top");
    append(top, element("span", "", definition.label), element("span", "metric-icon", definition.icon));
    var value = element("strong", "metric-value", definition.value);
    var foot = element("div", "metric-foot");
    if (definition.trend !== null && definition.trend !== undefined) {
      var change = element("span", "metric-change" + (definition.trend < 0 ? " is-negative" : ""), (definition.trend >= 0 ? "↑ " : "↓ ") + formatPercent(Math.abs(definition.trend)));
      foot.appendChild(change);
    }
    foot.appendChild(element("span", "", definition.note));
    return append(card, top, value, foot);
  }

  function renderMetrics() {
    var target = byId("metric-grid");
    clear(target);
    metricDefinitions().forEach(function (definition) { target.appendChild(metricCard(definition)); });
  }

  function normalizeAutomation(raw) {
    var publicReplyValue = first(raw, ["publicReply", "public_reply"], null);
    var publicReplyObject = publicReplyValue && typeof publicReplyValue === "object" ? publicReplyValue : {};
    var links = array(first(raw, ["links", "resources", "resourceLinks", "resource_links"], []));
    if (!links.length && first(raw, ["resourceUrl", "resource_url"], "")) {
      links = [{ label: text(first(raw, ["resourceLabel", "resource_label"]), "Resource"), url: first(raw, ["resourceUrl", "resource_url"], "") }];
    }
    return {
      raw: raw,
      id: String(first(raw, ["id", "automationId", "automation_id"], "")),
      name: text(first(raw, ["name", "title"]), "Untitled automation"),
      mediaId: String(first(raw, ["mediaId", "media_id"], "")),
      keyword: text(first(raw, ["keyword", "trigger"], ""), "—").toUpperCase(),
      responseText: text(first(raw, ["responseText", "response_text"], "")),
      enabled: isAutomationEnabled(raw),
      followGate: first(raw, ["followGateMode", "follow_gate_mode"], "")
        ? first(raw, ["followGateMode", "follow_gate_mode"], "") === "strict"
        : booleanFrom(raw, ["followGate", "follow_gate"], false),
      publicReplyEnabled: booleanFrom(publicReplyObject, ["enabled"], booleanFrom(raw, ["publicReplyEnabled", "public_reply_enabled"], Boolean(publicReplyValue))),
      publicReplyText: text(typeof publicReplyValue === "string" ? publicReplyValue : first(publicReplyObject, ["text"], first(raw, ["publicReplyText", "public_reply_text"], ""))),
      links: links.map(function (link) { return { label: text(first(link, ["label", "name"]), "Resource"), url: text(first(link, ["url", "href"]), "") }; }),
      dms: numberFrom(raw, ["dms", "dmsSent", "dms_sent", "deliveries"]),
      clicks: numberFrom(raw, ["clicks", "linkClicks", "link_clicks"]),
      updatedAt: first(raw, ["updatedAt", "updated_at", "createdAt", "created_at"], ""),
      status: text(first(raw, ["status"], ""), ""),
    };
  }

  function isAutomationEnabled(raw) {
    return booleanFrom(raw, ["enabled", "active", "isActive", "is_active"], text(first(raw, ["status"], "")).toLowerCase() === "active");
  }

  function normalizedAutomations() { return state.data.automations.map(normalizeAutomation); }

  function normalizeMedia(raw) {
    return {
      raw: raw,
      id: String(first(raw, ["id", "mediaId", "media_id"], "")),
      shortcode: text(first(raw, ["shortcode", "code"]), ""),
      caption: text(first(raw, ["caption", "title"]), "Untitled Instagram post"),
      thumbnail: safeUrl(first(raw, ["thumbnailUrl", "thumbnail_url", "mediaUrl", "media_url"], "")),
      permalink: safeUrl(first(raw, ["permalink", "url"], "")),
      type: text(first(raw, ["mediaType", "media_type", "type"]), "Post"),
      timestamp: first(raw, ["timestamp", "createdAt", "created_at"], ""),
      comments: numberFrom(raw, ["commentsCount", "comments_count", "comments"]),
    };
  }

  function normalizedMedia() { return state.data.media.map(normalizeMedia); }
  function mediaForId(id) { return normalizedMedia().find(function (item) { return item.id === String(id); }); }

  function makeThumbnail(media) {
    var thumb = element("div", "automation-thumb", "▦");
    if (media && media.thumbnail) {
      var image = element("img");
      image.alt = "";
      image.src = media.thumbnail;
      image.addEventListener("error", function () { image.remove(); });
      thumb.appendChild(image);
    }
    return thumb;
  }

  function statePill(automation) {
    var failed = automation.status.toLowerCase() === "error" || automation.status.toLowerCase() === "failed";
    var className = "state-pill" + (failed ? " is-error" : automation.enabled ? "" : " is-paused");
    return element("span", className, failed ? "Needs attention" : automation.enabled ? "Live" : "Paused");
  }

  function automationRow(automation, options) {
    var row = element("article", "automation-row");
    var main = element("div", "automation-main");
    var copy = element("div");
    append(copy, element("strong", "", automation.name), element("small", "", automation.followGate ? "Follow gate · " + automation.links.length + " link" + (automation.links.length === 1 ? "" : "s") : automation.links.length + " resource link" + (automation.links.length === 1 ? "" : "s")));
    append(main, makeThumbnail(mediaForId(automation.mediaId)), copy);
    var keyword = element("div", "automation-meta");
    append(keyword, element("span", "keyword-pill", automation.keyword), element("small", "", "Exact comment"));
    var dmStat = element("div", "automation-stat");
    append(dmStat, element("strong", "", formatNumber(automation.dms)), element("small", "", "DMs"));
    var clickStat = element("div", "automation-stat");
    append(clickStat, element("strong", "", formatNumber(automation.clicks)), element("small", "", "Clicks"));
    var actions = element("div", "row-actions");
    if (options && options.full) {
      var testButton = element("button", "button button-secondary", "Test");
      testButton.type = "button";
      testButton.addEventListener("click", function () { testAutomation(automation.id, testButton); });
      actions.appendChild(testButton);
    }
    var editButton = element("button", "button button-secondary", "Edit");
    editButton.type = "button";
    editButton.addEventListener("click", function () { openDrawer(automation); });
    actions.appendChild(editButton);
    if (options && options.full) {
      var deleteButton = element("button", "icon-button", "×");
      deleteButton.type = "button";
      deleteButton.setAttribute("aria-label", "Disable " + automation.name);
      deleteButton.addEventListener("click", function () { requestDelete(automation.id); });
      actions.appendChild(deleteButton);
    }
    return append(row, main, keyword, dmStat, clickStat, append(element("div", "row-state"), statePill(automation), actions));
  }

  function emptyState(title, message, actionLabel, action) {
    var wrapper = element("div", "empty-state");
    append(wrapper, element("span", "empty-state-icon", "✦"), element("strong", "", title), element("p", "", message));
    if (actionLabel && action) {
      var button = element("button", "button button-primary", actionLabel);
      button.type = "button";
      button.addEventListener("click", action);
      wrapper.appendChild(button);
    }
    return wrapper;
  }

  function renderAutomations() {
    var automations = normalizedAutomations();
    var recentTarget = byId("recent-automations");
    clear(recentTarget);
    if (!automations.length) recentTarget.appendChild(emptyState("No automations yet", "Create your first exact-keyword flow to start delivering resources.", "Create automation", function () { openDrawer(); }));
    else automations.slice().sort(function (a, b) { return (dateValue(b.updatedAt) || 0) - (dateValue(a.updatedAt) || 0); }).slice(0, 4).forEach(function (automation) { recentTarget.appendChild(automationRow(automation)); });
    renderFilteredAutomations();
  }

  function renderFilteredAutomations() {
    if (!state.data) return;
    var target = byId("automations-list");
    var query = state.automationQuery.toLowerCase();
    var filtered = normalizedAutomations().filter(function (automation) {
      var statusMatch = state.automationFilter === "all" || (state.automationFilter === "active" ? automation.enabled : !automation.enabled);
      var textMatch = !query || (automation.name + " " + automation.keyword).toLowerCase().includes(query);
      return statusMatch && textMatch;
    });
    clear(target);
    if (!filtered.length) {
      var message = normalizedAutomations().length ? "No automations match the current search and status filter." : "Create a flow, connect it to one post, and keep every delivery idempotent.";
      target.appendChild(emptyState(normalizedAutomations().length ? "Nothing matched" : "No automations yet", message, normalizedAutomations().length ? null : "Create automation", normalizedAutomations().length ? null : function () { openDrawer(); }));
      return;
    }
    filtered.forEach(function (automation) { target.appendChild(automationRow(automation, { full: true })); });
  }

  function renderPosts() {
    var target = byId("posts-grid");
    var summary = byId("posts-summary");
    var media = normalizedMedia();
    var automations = normalizedAutomations();
    clear(target);
    clear(summary);
    append(summary, element("span", "", formatNumber(media.length) + " posts synced"), element("span", "", formatNumber(automations.filter(function (automation) { return automation.enabled; }).length) + " live flows"));
    if (!media.length) {
      target.appendChild(emptyState("No posts available", "Run a sync after the Instagram account and app permissions are ready.", "Refresh posts", syncDashboard));
      return;
    }
    media.forEach(function (post) {
      var automation = automations.find(function (item) { return item.mediaId === post.id; });
      var card = element("article", "post-card");
      var visual = element("div", "post-visual");
      if (post.thumbnail) {
        var image = element("img");
        image.src = post.thumbnail;
        image.alt = "Instagram post thumbnail";
        image.loading = "lazy";
        image.addEventListener("error", function () { image.remove(); visual.appendChild(element("span", "empty-state-icon", "▦")); });
        visual.appendChild(image);
      } else visual.appendChild(element("span", "empty-state-icon", "▦"));
      visual.appendChild(element("span", "post-type", post.type.replace(/_/gu, " ")));
      var body = element("div", "post-body");
      body.appendChild(element("p", "", post.caption));
      var status = element("div", "post-status");
      if (automation) append(status, element("span", "keyword-pill", automation.keyword), statePill(automation));
      else append(status, element("span", "", shortDate(post.timestamp)), element("span", "state-pill is-paused", "No flow"));
      var button = element("button", "button " + (automation ? "button-secondary" : "button-primary"), automation ? "Edit automation" : "Automate this post");
      button.type = "button";
      button.addEventListener("click", function () { openDrawer(automation || null, post.id); });
      append(body, status, button);
      append(card, visual, body);
      target.appendChild(card);
    });
  }

  function normalizeConversation(raw) {
    return {
      id: String(first(raw, ["id", "conversationId", "conversation_id"], "")),
      name: text(first(raw, ["name", "username", "handle"]), "Instagram user"),
      username: text(first(raw, ["username", "handle"]), ""),
      avatar: safeUrl(first(raw, ["avatarUrl", "avatar_url", "profilePictureUrl", "profile_picture_url"], "")),
      lastMessage: text(first(raw, ["lastMessage", "last_message", "preview"]), "No message preview"),
      updatedAt: first(raw, ["updatedAt", "updated_at", "timestamp"], ""),
      unread: booleanFrom(raw, ["unread", "isUnread", "is_unread"], false),
      messages: array(first(raw, ["messages"], [])).map(function (message) {
        return {
          id: String(first(message, ["id", "messageId", "message_id"], "")),
          text: text(first(message, ["text", "message"]), "Message content unavailable"),
          outbound: booleanFrom(message, ["outbound", "isOutbound", "is_outbound"], text(first(message, ["direction"], "")).toLowerCase() === "outbound"),
          createdAt: first(message, ["createdAt", "created_at", "timestamp"], ""),
        };
      }),
    };
  }

  function normalizedConversations() { return state.data.conversations.map(normalizeConversation); }

  function renderConversations() {
    var conversations = normalizedConversations();
    var unread = conversations.filter(function (conversation) { return conversation.unread; }).length;
    var badge = byId("nav-unread");
    badge.textContent = String(unread);
    badge.hidden = unread === 0;
    if (!state.selectedConversationId && conversations.length) state.selectedConversationId = conversations[0].id;
    renderConversationList();
    renderConversationDetail();
  }

  function renderConversationList() {
    var target = byId("conversation-list");
    clear(target);
    var query = state.conversationQuery.toLowerCase();
    var conversations = normalizedConversations().filter(function (conversation) { return !query || (conversation.name + " " + conversation.username + " " + conversation.lastMessage).toLowerCase().includes(query); });
    if (!conversations.length) {
      target.appendChild(emptyState(state.data.conversations.length ? "No results" : "Inbox is quiet", state.data.conversations.length ? "Try a different name or message search." : "Automation-started conversations will appear here."));
      return;
    }
    conversations.forEach(function (conversation) {
      var button = element("button", "conversation-item" + (conversation.id === state.selectedConversationId ? " is-active" : ""));
      button.type = "button";
      var copy = element("div");
      append(copy, element("strong", "", conversation.name), element("p", "", conversation.lastMessage));
      var meta = element("div");
      append(meta, element("time", "", relativeTime(conversation.updatedAt)), conversation.unread ? element("i", "unread-dot") : null);
      append(button, makeAvatar(conversation.name, conversation.avatar), copy, meta);
      button.addEventListener("click", function () {
        state.selectedConversationId = conversation.id;
        renderConversationList();
        renderConversationDetail();
        if (window.innerWidth <= 680) byId("conversation-detail").classList.add("is-mobile-open");
      });
      target.appendChild(button);
    });
  }

  function renderConversationDetail() {
    var target = byId("conversation-detail");
    clear(target);
    var conversation = normalizedConversations().find(function (item) { return item.id === state.selectedConversationId; });
    if (!conversation) {
      target.appendChild(emptyState("Choose a conversation", "Select a person to review the messages sent by your automations."));
      return;
    }
    var header = element("header", "conversation-header");
    var copy = element("div");
    append(copy, element("strong", "", conversation.name), element("span", "", conversation.username ? "@" + conversation.username.replace(/^@/u, "") : "Instagram conversation"));
    append(header, makeAvatar(conversation.name, conversation.avatar), copy);
    header.addEventListener("click", function () { if (window.innerWidth <= 680) target.classList.remove("is-mobile-open"); });
    var messages = element("div", "messages");
    if (!conversation.messages.length) messages.appendChild(emptyState("No message history", "The API returned this conversation without message details."));
    else conversation.messages.slice().sort(function (a, b) { return (dateValue(a.createdAt) || 0) - (dateValue(b.createdAt) || 0); }).forEach(function (message) {
      var bubble = element("div", "message" + (message.outbound ? " is-outbound" : ""), message.text);
      bubble.appendChild(element("time", "", relativeTime(message.createdAt)));
      messages.appendChild(bubble);
    });
    var note = element("footer", "conversation-readonly", "◇ This inbox is read-only. Reply from Instagram when needed.");
    append(target, header, messages, note);
  }

  function analyticsDefinitions() {
    var stats = state.data.stats;
    var points = dailyForPeriod();
    var dms = points.reduce(function (sum, point) { return sum + point.dms; }, 0);
    var clicks = points.reduce(function (sum, point) { return sum + point.clicks; }, 0);
    var clickRate = numberFrom(stats, ["clickRate", "click_rate"], dms ? (clicks / dms) * 100 : 0);
    var deliveryRate = numberFrom(stats, ["deliveryRate", "delivery_rate"], 100);
    return [
      { label: "Total DMs", value: formatNumber(dms), trend: numberFrom(stats, ["dmsChange", "dms_change"]), note: "selected period", icon: "✉", color: "#a976ff" },
      { label: "Total clicks", value: formatNumber(clicks), trend: numberFrom(stats, ["clicksChange", "clicks_change"]), note: "selected period", icon: "↗", color: "#53dac5" },
      { label: "Click rate", value: formatPercent(clickRate), trend: null, note: "clicks per delivered DM", icon: "◎", color: "#f16fc6" },
      { label: "Delivery rate", value: formatPercent(deliveryRate), trend: null, note: "successful private replies", icon: "✓", color: "#67db9c" },
    ];
  }

  function renderAnalytics() {
    var metrics = byId("analytics-metrics");
    clear(metrics);
    analyticsDefinitions().forEach(function (definition) { metrics.appendChild(metricCard(definition)); });
    renderFunnel();
    var target = byId("top-automations");
    clear(target);
    var sorted = normalizedAutomations().sort(function (a, b) { return b.clicks - a.clicks; }).slice(0, 5);
    if (!sorted.length) target.appendChild(emptyState("No performance data", "Top automations will rank here after deliveries and clicks arrive."));
    else sorted.forEach(function (automation) { target.appendChild(automationRow(automation)); });
  }

  function renderFunnel() {
    var points = dailyForPeriod();
    var comments = points.reduce(function (sum, point) { return sum + point.comments; }, 0);
    var dms = points.reduce(function (sum, point) { return sum + point.dms; }, 0);
    var clicks = points.reduce(function (sum, point) { return sum + point.clicks; }, 0);
    var values = [
      { label: "Matched comments", value: comments },
      { label: "DMs delivered", value: dms },
      { label: "Links clicked", value: clicks },
    ];
    var maximum = Math.max(1, comments, dms, clicks);
    var target = byId("conversion-funnel");
    clear(target);
    values.forEach(function (item, index) {
      var row = element("div", "funnel-row");
      var label = element("div", "funnel-label");
      append(label, element("span", "", item.label), element("strong", "", formatNumber(item.value)));
      var track = element("div", "funnel-track");
      var fill = element("div", "funnel-fill");
      fill.style.width = Math.max(item.value ? 5 : 0, (item.value / maximum) * (100 - index * 5)) + "%";
      track.appendChild(fill);
      append(row, label, track);
      target.appendChild(row);
    });
  }

  function healthStatus(raw, fallback) {
    var value = text(raw, fallback || "unknown").toLowerCase();
    if (["ok", "healthy", "connected", "active", "ready"].includes(value)) return { label: "Healthy", className: "", icon: "✓" };
    if (["warning", "degraded", "pending", "limited"].includes(value)) return { label: "Check soon", className: " is-paused", icon: "!" };
    return { label: "Needs attention", className: " is-error", icon: "×" };
  }

  function renderHealth() {
    var health = state.data.health;
    var definitions = [
      { label: "Instagram API", value: first(health, ["instagram", "api", "instagramApi", "instagram_api"], "unknown"), note: "Comment and message access" },
      { label: "Webhook", value: first(health, ["webhook", "webhookStatus", "webhook_status"], "unknown"), note: "Inbound comment events" },
      { label: "Database", value: first(health, ["database", "db", "databaseStatus", "database_status"], "unknown"), note: "Rules and delivery state" },
      { label: "Delivery worker", value: first(health, ["worker", "delivery", "workerStatus", "worker_status"], "unknown"), note: "Last sync " + relativeTime(first(health, ["lastSync", "last_sync"], "")) },
    ];
    var target = byId("health-grid");
    clear(target);
    definitions.forEach(function (definition) {
      var status = healthStatus(definition.value);
      var card = element("article", "health-card");
      var top = element("div", "health-card-top");
      append(top, element("span", "health-icon", status.icon), element("span", "state-pill" + status.className, status.label));
      var copy = element("div");
      append(copy, element("strong", "", definition.label), element("p", "", definition.note));
      append(card, top, copy);
      target.appendChild(card);
    });
    renderAccountDetail();
  }

  function renderAccountDetail() {
    var account = state.data.account;
    var name = accountName();
    var target = byId("account-detail");
    clear(target);
    var copy = element("div", "account-copy");
    append(copy, element("strong", "", name), element("span", "", accountUsername() + " · " + formatNumber(numberFrom(account, ["followers", "followersCount", "followers_count"])) + " followers"));
    var profileUrl = safeUrl(first(account, ["profileUrl", "profile_url", "permalink"], ""));
    if (profileUrl) {
      var link = element("a", "", "Open Instagram profile →");
      link.href = profileUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      copy.appendChild(link);
    }
    append(target, makeAvatar(name, first(account, ["profilePictureUrl", "profile_picture_url", "avatarUrl", "avatar_url"], "")), copy);
  }

  function normalizeDaily(raw, index) {
    return {
      date: first(raw, ["date", "day", "timestamp"], String(index + 1)),
      comments: numberFrom(raw, ["comments", "matchedComments", "matched_comments"]),
      dms: numberFrom(raw, ["dms", "dmsSent", "dms_sent", "messages"]),
      clicks: numberFrom(raw, ["clicks", "linkClicks", "link_clicks"]),
    };
  }

  function dailyForPeriod() {
    var daily = state.data.daily.map(normalizeDaily).sort(function (a, b) {
      var aDate = dateValue(a.date);
      var bDate = dateValue(b.date);
      return aDate && bDate ? aDate - bDate : 0;
    });
    return daily.slice(-state.period);
  }

  function drawAllCharts() {
    if (!state.data) return;
    drawChart(byId("performance-chart"), dailyForPeriod(), byId("chart-tooltip"));
    drawChart(byId("analytics-chart"), dailyForPeriod(), null);
  }

  function drawChart(canvas, points, tooltip) {
    if (!canvas || canvas.offsetParent === null) return;
    var context = canvas.getContext("2d");
    if (!context) return;
    var bounds = canvas.getBoundingClientRect();
    var width = Math.max(300, Math.floor(bounds.width));
    var height = Math.max(180, Math.floor(bounds.height));
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    var empty = byId("chart-empty");
    if (canvas.id === "performance-chart") empty.hidden = points.length > 0;
    if (!points.length) return;

    var pad = { top: 24, right: 17, bottom: 30, left: 36 };
    var chartWidth = width - pad.left - pad.right;
    var chartHeight = height - pad.top - pad.bottom;
    var maximum = Math.max(1, Math.max.apply(null, points.map(function (point) { return Math.max(point.dms, point.clicks); })));
    maximum = Math.ceil(maximum * 1.16);
    context.font = "9px Inter, sans-serif";
    context.textAlign = "right";
    context.textBaseline = "middle";
    for (var grid = 0; grid <= 4; grid += 1) {
      var y = pad.top + chartHeight * (grid / 4);
      context.strokeStyle = "rgba(255,255,255,.055)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(pad.left, y);
      context.lineTo(width - pad.right, y);
      context.stroke();
      context.fillStyle = "rgba(167,157,184,.58)";
      context.fillText(formatNumber(maximum * (1 - grid / 4)), pad.left - 8, y);
    }
    var positions = points.map(function (point, index) {
      return {
        x: pad.left + (points.length === 1 ? chartWidth / 2 : (index / (points.length - 1)) * chartWidth),
        dmY: pad.top + chartHeight - (point.dms / maximum) * chartHeight,
        clickY: pad.top + chartHeight - (point.clicks / maximum) * chartHeight,
        point: point,
      };
    });
    drawSeries(context, positions, "dmY", "#a976ff", chartHeight, pad, true);
    drawSeries(context, positions, "clickY", "#53dac5", chartHeight, pad, false);
    var labelStep = Math.max(1, Math.ceil(points.length / 6));
    context.fillStyle = "rgba(167,157,184,.62)";
    context.textAlign = "center";
    context.textBaseline = "top";
    positions.forEach(function (position, index) {
      if (index % labelStep === 0 || index === positions.length - 1) context.fillText(shortDate(position.point.date), position.x, height - pad.bottom + 11);
    });
    state.chartGeometry.set(canvas.id, { positions: positions, tooltip: tooltip });
  }

  function drawSeries(context, positions, yKey, color, chartHeight, pad, fill) {
    if (!positions.length) return;
    context.beginPath();
    positions.forEach(function (position, index) { if (index === 0) context.moveTo(position.x, position[yKey]); else context.lineTo(position.x, position[yKey]); });
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.stroke();
    if (fill) {
      var gradient = context.createLinearGradient(0, pad.top, 0, pad.top + chartHeight);
      gradient.addColorStop(0, "rgba(169,118,255,.20)");
      gradient.addColorStop(1, "rgba(169,118,255,0)");
      context.lineTo(positions[positions.length - 1].x, pad.top + chartHeight);
      context.lineTo(positions[0].x, pad.top + chartHeight);
      context.closePath();
      context.fillStyle = gradient;
      context.fill();
    }
    positions.forEach(function (position) {
      context.beginPath();
      context.arc(position.x, position[yKey], 2.4, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
    });
  }

  function handleChartPointer(event) {
    var geometry = state.chartGeometry.get(event.currentTarget.id);
    if (!geometry || !geometry.tooltip || !geometry.positions.length) return;
    var bounds = event.currentTarget.getBoundingClientRect();
    var x = event.clientX - bounds.left;
    var nearest = geometry.positions.reduce(function (best, position) { return Math.abs(position.x - x) < Math.abs(best.x - x) ? position : best; }, geometry.positions[0]);
    var tooltip = geometry.tooltip;
    tooltip.textContent = shortDate(nearest.point.date) + " · " + formatNumber(nearest.point.dms) + " DMs · " + formatNumber(nearest.point.clicks) + " clicks";
    tooltip.style.left = nearest.x + "px";
    tooltip.style.top = Math.min(nearest.dmY, nearest.clickY) + "px";
    tooltip.hidden = false;
  }

  function hideChartTooltip(event) {
    var geometry = state.chartGeometry.get(event.currentTarget.id);
    if (geometry && geometry.tooltip) geometry.tooltip.hidden = true;
  }

  function populateMediaSelect(selectedId) {
    var select = byId("automation-media");
    clear(select);
    var placeholder = element("option", "", "Select a post");
    placeholder.value = "";
    select.appendChild(placeholder);
    normalizedMedia().forEach(function (media) {
      var option = element("option", "", shortDate(media.timestamp) + " · " + media.caption.slice(0, 70));
      option.value = media.id;
      select.appendChild(option);
    });
    select.value = selectedId || "";
    renderSelectedPost();
  }

  function renderSelectedPost() {
    var target = byId("selected-post-preview");
    var media = mediaForId(byId("automation-media").value);
    clear(target);
    target.hidden = !media;
    if (!media) return;
    var visual;
    if (media.thumbnail) {
      visual = element("img");
      visual.src = media.thumbnail;
      visual.alt = "";
      visual.addEventListener("error", function () { visual.replaceWith(element("span", "selected-post-fallback", "▦")); });
    } else visual = element("span", "selected-post-fallback", "▦");
    var copy = element("div");
    append(copy, element("strong", "", media.caption), element("small", "", media.type.replace(/_/gu, " ") + " · " + shortDate(media.timestamp)));
    append(target, visual, copy);
  }

  function addResourceRow(resource) {
    var target = byId("resource-links");
    var row = element("div", "resource-row");
    var labelWrap = element("label", "", "Label");
    var labelInput = element("input");
    labelInput.className = "resource-label";
    labelInput.required = true;
    labelInput.maxLength = 80;
    labelInput.placeholder = "Setup guide";
    labelInput.value = text(resource && resource.label, "");
    labelWrap.appendChild(labelInput);
    var urlWrap = element("label", "", "HTTPS URL");
    var urlInput = element("input");
    urlInput.className = "resource-url";
    urlInput.type = "url";
    urlInput.required = true;
    urlInput.placeholder = "https://example.com/resource";
    urlInput.value = text(resource && resource.url, "");
    urlWrap.appendChild(urlInput);
    var remove = element("button", "icon-button", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", "Remove resource link");
    remove.addEventListener("click", function () {
      if (target.children.length === 1) { labelInput.value = ""; urlInput.value = ""; labelInput.focus(); }
      else row.remove();
    });
    append(row, labelWrap, urlWrap, remove);
    target.appendChild(row);
  }

  function openDrawer(automation, mediaId) {
    var editing = automation || null;
    byId("automation-id").value = editing ? editing.id : "";
    byId("drawer-kicker").textContent = editing ? "Edit flow" : "New flow";
    byId("drawer-title").textContent = editing ? "Edit automation" : "Create automation";
    byId("automation-name").value = editing ? editing.name : "";
    byId("automation-keyword").value = editing ? editing.keyword : "";
    byId("response-text").value = editing ? editing.responseText : "Here’s what you asked for:";
    byId("public-reply").value = editing ? editing.publicReplyText : "Sent it — check your DMs ✦";
    byId("public-reply-enabled").checked = editing ? editing.publicReplyEnabled : true;
    syncPublicReplyField();
    byId("follow-gate").checked = editing ? editing.followGate : false;
    byId("automation-enabled").checked = editing ? editing.enabled : true;
    byId("automation-test").hidden = !editing;
    byId("drawer-form-message").textContent = "";
    byId("drawer-form-message").classList.remove("is-error");
    clear(byId("resource-links"));
    var links = editing && editing.links.length ? editing.links : [{ label: "", url: "" }];
    links.forEach(addResourceRow);
    populateMediaSelect(editing ? editing.mediaId : mediaId || "");
    dom.drawer.hidden = false;
    dom.drawerBackdrop.hidden = false;
    dom.dashboard.inert = true;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(function () {
      dom.drawer.classList.add("is-open");
      dom.drawerBackdrop.classList.add("is-open");
      byId("automation-name").focus();
    });
  }

  function closeDrawer() {
    dom.drawer.classList.remove("is-open");
    dom.drawerBackdrop.classList.remove("is-open");
    dom.dashboard.inert = false;
    document.body.style.overflow = "";
    window.setTimeout(function () { dom.drawer.hidden = true; dom.drawerBackdrop.hidden = true; }, 230);
  }

  function syncPublicReplyField() {
    var enabled = byId("public-reply-enabled").checked;
    byId("public-reply").disabled = !enabled;
  }

  function collectAutomation() {
    var links = Array.from(byId("resource-links").querySelectorAll(".resource-row")).map(function (row) {
      return { label: row.querySelector(".resource-label").value.trim(), url: row.querySelector(".resource-url").value.trim() };
    });
    if (!byId("automation-media").value) throw new Error("Choose an Instagram post.");
    if (!byId("automation-name").value.trim()) throw new Error("Give this automation a name.");
    if (!byId("automation-keyword").value.trim()) throw new Error("Enter an exact comment keyword.");
    links = links.filter(function (link) { return link.label || link.url; });
    if (links.some(function (link) { return !link.label || !link.url; })) throw new Error("Every resource needs a label and URL.");
    links.forEach(function (link) {
      var url;
      try { url = new URL(link.url); } catch (_error) { throw new Error("Every resource must use a valid HTTPS URL."); }
      if (url.protocol !== "https:") throw new Error("Every resource must use a valid HTTPS URL.");
      link.url = url.toString();
    });
    return {
      name: byId("automation-name").value.trim(),
      mediaId: byId("automation-media").value,
      keyword: byId("automation-keyword").value.trim().toUpperCase(),
      responseText: byId("response-text").value.trim(),
      links: links,
      followGate: byId("follow-gate").checked,
      publicReply: { enabled: byId("public-reply-enabled").checked, text: byId("public-reply").value.trim() },
      enabled: byId("automation-enabled").checked,
    };
  }

  async function saveAutomation(event) {
    event.preventDefault();
    var message = byId("drawer-form-message");
    var submit = dom.drawerForm.querySelector('button[type="submit"]');
    message.classList.remove("is-error");
    var body;
    try { body = collectAutomation(); } catch (error) { message.textContent = error.message; message.classList.add("is-error"); return; }
    var id = byId("automation-id").value;
    setBusy(submit, true, "Saving…");
    message.textContent = "Saving your automation…";
    try {
      await request(API_ROOT + "/automations" + (id ? "?id=" + encodeURIComponent(id) : ""), { method: id ? "PATCH" : "POST", body: body });
      closeDrawer();
      toast(id ? "Automation updated." : "Automation created.");
      await loadDashboard();
    } catch (error) {
      message.textContent = error.message || "Could not save this automation.";
      message.classList.add("is-error");
    } finally { setBusy(submit, false); }
  }

  async function testAutomation(id, button) {
    if (!id) return;
    setBusy(button, true, "Sending…");
    try {
      await request(API_ROOT + "/test", { method: "POST", body: { automationId: id } });
      toast("Meta connection and message preview verified.");
    } catch (error) { toast(error.message || "The test could not be sent.", true); }
    finally { setBusy(button, false); }
  }

  function requestDelete(id) {
    state.deleteAutomationId = id;
    if (typeof dom.deleteDialog.showModal === "function") dom.deleteDialog.showModal();
  }

  async function confirmDelete(event) {
    event.preventDefault();
    var id = state.deleteAutomationId;
    if (!id) return;
    var button = byId("confirm-delete");
    setBusy(button, true, "Disabling…");
    try {
      await request(API_ROOT + "/automations?id=" + encodeURIComponent(id), { method: "DELETE" });
      dom.deleteDialog.close();
      state.deleteAutomationId = null;
      toast("Automation disabled.");
      await loadDashboard();
    } catch (error) { toast(error.message || "The automation could not be disabled.", true); }
    finally { setBusy(button, false); }
  }

  async function syncDashboard(event) {
    var button = event && event.currentTarget instanceof HTMLElement ? event.currentTarget : byId("sync-button");
    setBusy(button, true, "Syncing…");
    try {
      await request(API_ROOT + "/sync", { method: "POST" });
      toast("Instagram sync started.");
      await loadDashboard();
    } catch (error) { toast(error.message || "Sync could not start.", true); }
    finally { setBusy(button, false); }
  }

  function toast(message, isError) {
    var item = element("div", "toast" + (isError ? " is-error" : ""));
    append(item, element("i", "", isError ? "!" : "✓"), element("span", "", message));
    dom.toastRegion.appendChild(item);
    window.requestAnimationFrame(function () { item.classList.add("is-visible"); });
    window.setTimeout(function () { item.classList.remove("is-visible"); window.setTimeout(function () { item.remove(); }, 200); }, 3600);
  }

  function handlePeriod(button) {
    state.period = Number(button.dataset.period) || 30;
    document.querySelectorAll("[data-period]").forEach(function (item) { item.classList.toggle("is-active", Number(item.dataset.period) === state.period); });
    window.requestAnimationFrame(drawAllCharts);
  }

  function bindEvents() {
    dom.loginForm.addEventListener("submit", handleLogin);
    byId("toggle-password").addEventListener("click", function (event) {
      var visible = dom.password.type === "text";
      dom.password.type = visible ? "password" : "text";
      event.currentTarget.textContent = visible ? "Show" : "Hide";
      event.currentTarget.setAttribute("aria-label", visible ? "Show password" : "Hide password");
    });
    byId("logout-button").addEventListener("click", handleLogout);
    byId("settings-logout-button").addEventListener("click", handleLogout);
    byId("retry-button").addEventListener("click", function () { loadDashboard(); });
    document.querySelectorAll("[data-route]").forEach(function (button) { button.addEventListener("click", function () { setRoute(button.dataset.route); }); });
    document.querySelectorAll("[data-go]").forEach(function (button) { button.addEventListener("click", function () { setRoute(button.dataset.go); }); });
    document.querySelectorAll(".new-automation").forEach(function (button) { button.addEventListener("click", function () { openDrawer(); }); });
    document.querySelectorAll("[data-period]").forEach(function (button) { button.addEventListener("click", function () { handlePeriod(button); }); });
    document.querySelectorAll("[data-filter]").forEach(function (button) {
      button.addEventListener("click", function () {
        state.automationFilter = button.dataset.filter;
        document.querySelectorAll("[data-filter]").forEach(function (item) { item.classList.toggle("is-active", item === button); });
        renderFilteredAutomations();
      });
    });
    byId("automation-search").addEventListener("input", function (event) { state.automationQuery = event.target.value.trim(); renderFilteredAutomations(); });
    byId("conversation-search").addEventListener("input", function (event) { state.conversationQuery = event.target.value.trim(); renderConversationList(); });
    byId("sync-button").addEventListener("click", syncDashboard);
    byId("posts-sync-button").addEventListener("click", syncDashboard);
    byId("health-sync-button").addEventListener("click", syncDashboard);
    byId("connection-pill").addEventListener("click", function () { setRoute("health"); });
    byId("drawer-close").addEventListener("click", closeDrawer);
    dom.drawerBackdrop.addEventListener("click", closeDrawer);
    dom.drawerForm.addEventListener("submit", saveAutomation);
    byId("automation-media").addEventListener("change", renderSelectedPost);
    byId("public-reply-enabled").addEventListener("change", syncPublicReplyField);
    byId("automation-keyword").addEventListener("input", function (event) { event.target.value = event.target.value.toUpperCase(); });
    byId("add-resource").addEventListener("click", function () { addResourceRow({ label: "", url: "" }); });
    byId("automation-test").addEventListener("click", function (event) { testAutomation(byId("automation-id").value, event.currentTarget); });
    byId("confirm-delete").addEventListener("click", confirmDelete);
    byId("performance-chart").addEventListener("mousemove", handleChartPointer);
    byId("performance-chart").addEventListener("mouseleave", hideChartTooltip);
    window.addEventListener("hashchange", routeFromHash);
    var resizeTimer;
    window.addEventListener("resize", function () { window.clearTimeout(resizeTimer); resizeTimer = window.setTimeout(drawAllCharts, 100); });
    document.addEventListener("keydown", function (event) { if (event.key === "Escape" && !dom.drawer.hidden) closeDrawer(); });
  }

  function start() {
    cacheDom();
    bindEvents();
    dom.password.disabled = true;
    dom.loginSubmit.disabled = true;
    loadDashboard({ initial: true });
  }

  start();
}());
