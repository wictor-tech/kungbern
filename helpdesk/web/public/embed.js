/*!
 * LUP Hjälp – inbäddning i er programvara.
 *
 *   <script src="https://hjalp.exempel.se/embed.js" defer></script>
 *   <script>
 *     window.addEventListener("load", () => LupHelp.init({ page: "slideshow", role: "admin", lang: "sv" }));
 *     // När användaren byter sida/vy i appen:
 *     LupHelp.setContext({ page: "capacity" });
 *   </script>
 *
 * - Visar en "?"-knapp. Hjälpen vet vilken sida användaren står på.
 * - Interaktiv walkthrough: element med data-help="namn" markeras direkt i programmet och
 *   guiden går vidare när användaren klickar (eller skriver).
 * Inga beroenden. Allt tillstånd ligger i den här filen + iframen.
 */
(function () {
  "use strict";
  var script = document.currentScript;
  var BASE = (script && script.src ? new URL(script.src).origin : location.origin);
  var state = { page: undefined, role: undefined, lang: undefined, open: false, ready: false, frame: null, btn: null, tour: null };
  var css = [
    ".lh-btn{position:fixed;right:18px;bottom:18px;z-index:2147483000;width:60px;height:60px;border-radius:50%;border:0;background:#0ea5e9;color:#fff;font:700 28px/1 system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3);cursor:pointer}",
    ".lh-btn:focus-visible{outline:3px solid #fff;outline-offset:3px}",
    ".lh-panel{position:fixed;right:18px;bottom:90px;z-index:2147483001;width:420px;max-width:calc(100vw - 24px);height:min(720px,calc(100vh - 110px));border:0;border-radius:18px;box-shadow:0 12px 48px rgba(0,0,0,.35);background:#fff;display:none}",
    ".lh-panel.open{display:block}",
    "@media(max-width:640px){.lh-panel{inset:0;right:0;bottom:0;width:100vw;max-width:100vw;height:100dvh;border-radius:0}.lh-btn{right:14px;bottom:14px}}",
    ".lh-spot{position:fixed;z-index:2147483100;border-radius:10px;box-shadow:0 0 0 9999px rgba(8,25,38,.6),0 0 0 4px #e8431a;pointer-events:none;transition:all .25s ease}",
    ".lh-tip{position:fixed;z-index:2147483101;max-width:300px;background:#fff;color:#11283a;border-radius:14px;padding:14px 16px;box-shadow:0 10px 36px rgba(0,0,0,.4);font:16px/1.4 system-ui,sans-serif}",
    ".lh-tip b.n{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#e8431a;color:#fff;margin-right:8px;font-size:14px}",
    ".lh-tip .t{margin:6px 0 10px}.lh-tip .r{display:flex;gap:8px;justify-content:space-between;align-items:center}",
    ".lh-tip button{min-height:40px;padding:0 14px;border-radius:10px;border:1px solid #cfdbe4;background:#fff;font:600 15px system-ui;cursor:pointer}.lh-tip button.p{background:#0ea5e9;border-color:#0ea5e9;color:#04283d}",
    ".lh-tip small{color:#5d7285}"
  ].join("");

  function el(tag, cls, parent) { var e = document.createElement(tag); if (cls) e.className = cls; (parent || document.body).appendChild(e); return e; }
  function frameUrl() {
    var p = new URLSearchParams({ embed: "1" });
    if (state.page) p.set("page", state.page); if (state.role) p.set("role", state.role); if (state.lang) p.set("lang", state.lang);
    return BASE + "/?" + p.toString();
  }
  function postContext() {
    if (!state.frame || !state.frame.contentWindow) return;
    state.frame.contentWindow.postMessage({ type: "lup-help:context", page: state.page || "", role: state.role || "", lang: state.lang }, BASE);
  }
  function setOpen(open) {
    state.open = open;
    if (open && !state.frame) {
      state.frame = el("iframe", "lh-panel"); state.frame.title = "Hjälp"; state.frame.src = frameUrl();
      state.frame.setAttribute("allow", "clipboard-write");
    }
    if (state.frame) state.frame.classList.toggle("open", open);
    if (state.btn) { state.btn.textContent = open ? "×" : "?"; state.btn.setAttribute("aria-expanded", String(open)); }
    if (open) postContext();
  }

  // ---------- Interaktiv walkthrough ----------
  function stopTour(done) {
    var t = state.tour; if (!t) return;
    t.cleanup(); state.tour = null;
    if (done) toast("✓ Klart!");
  }
  function toast(msg) {
    var t = el("div", "lh-tip"); t.style.cssText = "left:50%;bottom:90px;transform:translateX(-50%);"; t.textContent = msg;
    setTimeout(function () { t.remove(); }, 2200);
  }
  function startTour(steps, title) {
    stopTour(false); setOpen(false);
    var spot = el("div", "lh-spot"), tip = el("div", "lh-tip");
    var i = 0, poll = null, off = null, cur = null;
    function cleanup() { clearInterval(poll); if (off) off(); spot.remove(); tip.remove(); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); }
    state.tour = { cleanup: cleanup };
    function place() {
      if (!cur) return;
      var r = cur.getBoundingClientRect(), pad = 6;
      spot.style.left = r.left - pad + "px"; spot.style.top = r.top - pad + "px"; spot.style.width = r.width + pad * 2 + "px"; spot.style.height = r.height + pad * 2 + "px";
      var tw = tip.offsetWidth, th = tip.offsetHeight, below = r.bottom + 14 + th < innerHeight;
      tip.style.top = Math.max(8, below ? r.bottom + 14 : r.top - th - 14) + "px";
      tip.style.left = Math.min(Math.max(8, r.left), innerWidth - tw - 8) + "px";
    }
    function render(s, n) {
      tip.innerHTML = "";
      var t = el("div", "t", tip);
      var b = el("b", "n", t); b.textContent = String(n + 1);
      // **fet** → <strong>, ingen innerHTML
      s.text.split(/(\*\*[^*]+\*\*)/).forEach(function (p) { if (/^\*\*.+\*\*$/.test(p)) { var st = document.createElement("strong"); st.textContent = p.slice(2, -2); t.appendChild(st); } else t.appendChild(document.createTextNode(p)); });
      var r = el("div", "r", tip);
      var sm = el("small", "", r); sm.textContent = (n + 1) + " / " + steps.length;
      var wrap = el("span", "", r);
      var skip = el("button", "", wrap); skip.textContent = "Avsluta"; skip.onclick = function () { stopTour(false); };
      if (s.advanceOn === "next") { var nx = el("button", "p", wrap); nx.style.marginLeft = "6px"; nx.textContent = n === steps.length - 1 ? "Klart" : "Nästa"; nx.onclick = next; }
    }
    function next() { if (off) { off(); off = null; } i++; show(); }
    function show() {
      if (i >= steps.length) { stopTour(true); try { if (state.frame) state.frame.contentWindow.postMessage({ type: "lup-help:tour-done" }, BASE); } catch (e) {} return; }
      var s = steps[i], tries = 0; cur = null; spot.style.display = "none";
      tip.style.left = "50%"; tip.style.top = "40%"; render(s, i);
      clearInterval(poll);
      poll = setInterval(function () {
        var node = null; try { node = document.querySelector(s.selector); } catch (e) {}
        if (node && node.getClientRects().length) {
          clearInterval(poll); cur = node; spot.style.display = "block";
          node.scrollIntoView({ block: "center", behavior: "smooth" });
          setTimeout(place, 350); place();
          var evt = s.advanceOn === "input" ? "input" : "click";
          if (s.advanceOn !== "next") {
            var h = function () { setTimeout(next, evt === "click" ? 250 : 600); };
            node.addEventListener(evt, h, { once: true, capture: true });
            off = function () { node.removeEventListener(evt, h, true); };
          }
        } else if (++tries > 40) { // ~10 s
          clearInterval(poll); tip.textContent = "";
          var m = el("div", "t", tip); m.textContent = "Hittar inte den här knappen. Följ stegen i hjälpen istället.";
          var b = el("button", "p", tip); b.textContent = "Öppna hjälpen"; b.onclick = function () { stopTour(false); setOpen(true); };
        }
      }, 250);
    }
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    show();
  }

  window.addEventListener("message", function (e) {
    if (!state.frame || e.source !== state.frame.contentWindow || e.origin !== BASE) return; // bara vår egen iframe
    var d = e.data || {};
    if (d.type === "lup-help:ready") { state.ready = true; postContext(); }
    if (d.source === "lup-help" && d.type === "start-walkthrough" && Array.isArray(d.steps)) startTour(d.steps.slice(0, 30), d.title);
  });

  window.LupHelp = {
    init: function (opts) {
      opts = opts || {};
      state.page = opts.page; state.role = opts.role; state.lang = opts.lang;
      if (!document.getElementById("lh-css")) { var s = document.createElement("style"); s.id = "lh-css"; s.textContent = css; document.head.appendChild(s); }
      if (!state.btn) {
        state.btn = el("button", "lh-btn"); state.btn.textContent = "?"; state.btn.setAttribute("aria-label", opts.label || "Behöver du hjälp?");
        state.btn.onclick = function () { setOpen(!state.open); };
      }
    },
    /** Berätta för hjälpen vilken sida användaren står på. */
    setContext: function (c) { c = c || {}; if ("page" in c) state.page = c.page; if ("role" in c) state.role = c.role; if ("lang" in c) state.lang = c.lang; postContext(); },
    open: function () { setOpen(true); }, close: function () { setOpen(false); },
    stopTour: function () { stopTour(false); }
  };
})();
