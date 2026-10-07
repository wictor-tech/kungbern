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
    "@media (prefers-reduced-motion:reduce){.lup-help-panel{transition:none}}";
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

  window.LupHelp = {
    open: open,
    close: close,
    /** Anropa när användaren byter sida utan omladdning. */
    setPage: function (page, app) {
      state.page = page || null;
      if (app) state.app = app;
      if (panel.classList.contains("open")) frame.src = url();
    },
  };
})();
