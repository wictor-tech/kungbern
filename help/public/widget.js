/*!
 * LUP Hjälp – "?"-knapp för LUPNUMBER.
 *
 * Lägg in på varje sida i produkten:
 *   <script src="https://<hjälp-domän>/widget.js" data-page="slideshow-settings" data-app="location-admin" defer></script>
 *
 * Byter sidan innehåll utan omladdning (SPA):
 *   window.LupHelp.setPage("capacity-timeslots", "location-admin");
 * Öppna hjälpen med en färdig fråga, t.ex. från en egen länk:
 *   window.LupHelp.open("Hur ändrar jag öppettider?");
 */
(function () {
  if (window.LupHelp) return;
  var script = document.currentScript;
  var base = new URL(script.src).origin;
  var state = { page: script.dataset.page || null, app: script.dataset.app || null };
  var label = script.dataset.label || "Behöver du hjälp?";

  var css =
    ".lup-help-btn{position:fixed;right:20px;bottom:20px;z-index:2147483000;display:flex;align-items:center;gap:8px;" +
    "height:48px;padding:0 18px 0 8px;border:0;border-radius:24px;background:#0da0ec;color:#fff;font:500 15px/1 Rubik,system-ui,sans-serif;" +
    "box-shadow:0 6px 20px rgba(12,74,110,.25);cursor:pointer}" +
    ".lup-help-btn:hover{background:#0886c9}.lup-help-btn:focus-visible{outline:3px solid #064769;outline-offset:2px}" +
    ".lup-help-btn span{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:#fff;color:#0da0ec;font-size:18px}" +
    ".lup-help-panel{position:fixed;top:0;right:0;bottom:0;z-index:2147483001;width:min(560px,100vw);background:#f8fafc;" +
    "box-shadow:-8px 0 30px rgba(12,74,110,.2);transform:translateX(100%);transition:transform .2s ease;display:flex;flex-direction:column}" +
    ".lup-help-panel.open{transform:none}" +
    ".lup-help-head{display:flex;align-items:center;justify-content:space-between;height:52px;padding:0 12px 0 16px;background:#fff;border-bottom:1px solid #e2e8f0;font:700 16px system-ui,sans-serif;color:#064769}" +
    ".lup-help-head button{border:0;background:none;font-size:22px;cursor:pointer;color:#64748b;width:40px;height:40px}" +
    ".lup-help-panel iframe{flex:1;border:0;width:100%}" +
    "@media (prefers-reduced-motion:reduce){.lup-help-panel{transition:none}}" +
    /* Genomgång i appen */
    ".lup-tour-hl{position:fixed;z-index:2147483002;pointer-events:none;border:3px solid #0da0ec;border-radius:10px;" +
    "box-shadow:0 0 0 9999px rgba(6,71,105,.28),0 0 0 6px rgba(13,160,236,.25);transition:all .15s ease}" +
    ".lup-tour-tip{position:fixed;z-index:2147483003;width:min(340px,calc(100vw - 24px));background:#fff;border-radius:14px;" +
    "box-shadow:0 12px 40px rgba(6,71,105,.3);padding:14px 16px;font:15px/1.45 Rubik,system-ui,sans-serif;color:#2f3337}" +
    ".lup-tour-tip small{display:block;color:#5f656b;font-size:12px;margin-bottom:4px;font-weight:600;letter-spacing:.02em}" +
    ".lup-tour-tip p{margin:0 0 12px}.lup-tour-tip .lup-tour-miss{background:#fff3cd;color:#7a5300;border-radius:8px;padding:8px 10px;font-size:13px;margin:0 0 12px}" +
    ".lup-tour-tip .row{display:flex;gap:8px;justify-content:flex-end}" +
    ".lup-tour-tip button{min-height:40px;border-radius:10px;padding:0 14px;font:600 14px Rubik,system-ui,sans-serif;cursor:pointer;border:1px solid #dfe5ea;background:#fff;color:#064769}" +
    ".lup-tour-tip button.primary{background:#0da0ec;border-color:#0da0ec;color:#fff}";
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var btn = document.createElement("button");
  btn.className = "lup-help-btn";
  btn.type = "button";
  btn.setAttribute("aria-haspopup", "dialog");
  btn.innerHTML = '<span aria-hidden="true">?</span>';
  btn.appendChild(document.createTextNode(label));

  var panel = document.createElement("div");
  panel.className = "lup-help-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Hjälp");
  panel.hidden = true;
  panel.innerHTML = '<div class="lup-help-head">Hjälp<button type="button" aria-label="Stäng hjälpen">✕</button></div>';
  var frame = document.createElement("iframe");
  frame.title = "LUP Hjälp";
  panel.appendChild(frame);

  function url(q) {
    var p = new URLSearchParams({ embed: "1" });
    if (state.page) p.set("page", state.page);
    if (state.app) p.set("app", state.app);
    if (q) p.set("q", q);
    return base + "/?" + p.toString();
  }
  function open(q) {
    var target = url(q);
    if (frame.src !== target) frame.src = target;
    panel.hidden = false;
    requestAnimationFrame(function () { panel.classList.add("open"); });
    btn.setAttribute("aria-expanded", "true");
  }
  function close() {
    panel.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");
    setTimeout(function () { panel.hidden = true; }, 200);
    btn.focus();
  }
  btn.addEventListener("click", function () { panel.classList.contains("open") ? close() : open(); });
  panel.querySelector(".lup-help-head button").addEventListener("click", close);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && panel.classList.contains("open")) close(); });

  function mount() { document.body.appendChild(btn); document.body.appendChild(panel); }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);

  // ---------- Genomgång direkt i appen ----------
  // Hjälpen (i panelen) skickar stegen; här markeras rätt knapp på sidan, ett steg i taget.
  var tour = null;
  var INTERACTIVE = "button,a,[role=button],[role=tab],[role=menuitem],summary,label,select,input[type=button],input[type=submit]";
  var ANY = INTERACTIVE + ",th,legend,h2,h3,h4,li,td,strong,span,div";
  function norm(t) { return (t || "").replace(/\s+/g, " ").trim().toLowerCase(); }
  function visible(el) {
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    var cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity !== 0;
  }
  function ours(el) { return panel.contains(el) || btn.contains(el) || (tour && (tour.tip.contains(el) || tour.hl.contains(el))); }
  function textOf(el) {
    return norm(el.getAttribute("aria-label") || el.innerText || el.value || "");
  }
  function findTarget(name) {
    var want = norm(name);
    if (!want) return null;
    var best = null, bestScore = Infinity;
    var els = document.querySelectorAll(ANY);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (ours(el) || !visible(el)) continue;
      var t = textOf(el);
      if (!t) continue;
      var exact = t === want, starts = !exact && want.length >= 4 && t.indexOf(want) === 0 && t.length < want.length + 25;
      if (!exact && !starts) continue;
      var r = el.getBoundingClientRect();
      // Knappar och länkar först, sedan exakt träff, sedan minsta elementet.
      var score = (el.matches(INTERACTIVE) ? 0 : 1e7) + (exact ? 0 : 1e6) + r.width * r.height;
      if (score < bestScore) { best = el; bestScore = score; }
    }
    return best;
  }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function renderTip(target) {
    var t = tour, step = t.steps[t.i], last = t.i === t.steps.length - 1;
    var miss = step.target && !target
      ? '<p class="lup-tour-miss">Leta efter <b>' + esc(step.target) + "</b>. Syns den inte? Gör föregående steg först, eller öppna rätt sida.</p>"
      : "";
    t.tip.innerHTML = "<small>" + esc(t.title) + " · steg " + (t.i + 1) + " av " + t.steps.length + "</small><p>" + esc(step.text) + "</p>" + miss +
      '<div class="row"><button type="button" data-a="end">Avsluta</button>' +
      (t.i > 0 ? '<button type="button" data-a="back">Tillbaka</button>' : "") +
      '<button type="button" class="primary" data-a="next">' + (last ? "Klar" : "Nästa") + "</button></div>";
  }
  function place() {
    if (!tour) return;
    var step = tour.steps[tour.i];
    var target = step.target ? findTarget(step.target) : null;
    if (target !== tour.target || !tour.rendered) { tour.target = target; tour.rendered = true; renderTip(target); }
    var tip = tour.tip, hl = tour.hl;
    if (target) {
      var r = target.getBoundingClientRect();
      if (r.top < 0 || r.bottom > innerHeight) target.scrollIntoView({ block: "center" });
      r = target.getBoundingClientRect();
      hl.style.display = "block";
      hl.style.left = r.left - 6 + "px"; hl.style.top = r.top - 6 + "px";
      hl.style.width = r.width + 12 + "px"; hl.style.height = r.height + 12 + "px";
      var below = r.bottom + 14 + tip.offsetHeight < innerHeight;
      tip.style.top = (below ? r.bottom + 14 : Math.max(12, r.top - tip.offsetHeight - 14)) + "px";
      tip.style.left = Math.min(Math.max(12, r.left), innerWidth - tip.offsetWidth - 12) + "px";
    } else {
      hl.style.display = "none";
      tip.style.top = innerHeight - tip.offsetHeight - 90 + "px";
      tip.style.left = (innerWidth - tip.offsetWidth) / 2 + "px";
    }
  }
  function go(i) {
    if (!tour) return;
    if (i >= tour.steps.length) return endTour(true);
    tour.i = Math.max(0, i); tour.target = null; tour.rendered = false; place();
  }
  function onDocClick(e) {
    if (!tour) return;
    var a = e.target.closest && e.target.closest("[data-a]");
    if (a && tour.tip.contains(a)) {
      var act = a.getAttribute("data-a");
      if (act === "end") endTour(false); else if (act === "back") go(tour.i - 1); else go(tour.i + 1);
      return;
    }
    // Användaren klickade på den markerade knappen → nästa steg när appen hunnit reagera.
    if (tour.target && (tour.target === e.target || tour.target.contains(e.target))) {
      var at = tour.i;
      setTimeout(function () { if (tour && tour.i === at) go(at + 1); }, 450);
    }
  }
  function endTour(done) {
    if (!tour) return;
    clearInterval(tour.timer);
    document.removeEventListener("click", onDocClick, true);
    tour.hl.remove();
    if (done) {
      var tip = tour.tip;
      tip.innerHTML = '<small>' + esc(tour.title) + '</small><p><b>Klart!</b> Löste det ditt problem?</p><div class="row"><button type="button" data-x="help">Öppna hjälpen</button><button type="button" class="primary" data-x="close">Stäng</button></div>';
      tip.addEventListener("click", function (e) {
        var x = e.target.getAttribute && e.target.getAttribute("data-x");
        if (!x) return;
        tip.remove();
        if (x === "help") open();
      });
    } else {
      tour.tip.remove();
    }
    tour = null;
    btn.style.display = "";
  }
  function startTour(data) {
    if (tour) endTour(false);
    if (!data || !data.steps || !data.steps.length) return;
    close();
    btn.style.display = "none";
    tour = { title: data.title || "Hjälp", steps: data.steps, i: 0, target: null, rendered: false, hl: el("div", "lup-tour-hl"), tip: el("div", "lup-tour-tip") };
    tour.tip.setAttribute("role", "dialog");
    tour.tip.setAttribute("aria-live", "polite");
    document.body.appendChild(tour.hl);
    document.body.appendChild(tour.tip);
    document.addEventListener("click", onDocClick, true);
    tour.timer = setInterval(place, 400);
    place();
  }
  window.addEventListener("message", function (e) {
    if (e.origin !== base || !e.data || e.data.type !== "lup-help:tour") return;
    startTour(e.data);
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && tour) endTour(false); });

  window.LupHelp = {
    open: open,
    /** Starta en genomgång direkt (t.ex. från en egen länk): { title, steps: [{ text, target }] }. */
    tour: startTour,
    close: close,
    /** Anropa när användaren byter sida utan omladdning. */
    setPage: function (page, app) {
      state.page = page || null;
      if (app) state.app = app;
      if (panel.classList.contains("open")) frame.src = url();
    },
  };
})();
