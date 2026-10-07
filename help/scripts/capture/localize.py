"""
Byter de engelska knappnamnen i guiderna mot det användaren ser i den svenska appen.
Översättningen tas i första hand från samma vy (vad just den skärmen visar), i andra hand från den gemensamma ordlistan.
Knappnamn markeras med **…** så att de visas i fetstil.

  python3 scripts/capture/localize.py <capture-dir> content
Skriver content/localized.sv.json (används av seed.ts ovanpå guides.sv.json/drafts.sv.json).
"""
import sys, json, os, re
sys.path.insert(0, os.path.dirname(__file__))

cap, content = sys.argv[1:3]
G = json.load(open(f"{content}/guides.sv.json", encoding="utf-8"))["guides"]
D = json.load(open(f"{content}/drafts.sv.json", encoding="utf-8"))["guides"]
glob = json.load(open(f"{content}/ui-terms.json", encoding="utf-8"))
fixes = json.load(open(f"{content}/ui-terms-fixes.json", encoding="utf-8"))
FIXES = {k: v for k, v in fixes.items() if not k.startswith("_")}
glob.update(FIXES)
NAV = {k: v for k, v in json.load(open(f"{content}/ui-nav.json", encoding="utf-8")).items() if not k.startswith("_")}

def view_terms(gid):
    """Termer från just den här vyn: parade element på samma plats i engelsk och svensk version."""
    pe, ps = f"{cap}/{gid}.en.json", f"{cap}/{gid}.sv.json"
    if not (os.path.exists(pe) and os.path.exists(ps)):
        return {}
    en, sv = json.load(open(pe)), json.load(open(ps))
    out = {}
    for e in en["texts"]:
        best = None
        for s in sv["texts"]:
            if s["tag"] != e["tag"] or abs(s["y"] - e["y"]) > 8:
                continue
            d = abs(s["x"] - e["x"]) + abs(s["y"] - e["y"]) * 4
            if best is None or d < best[0]:
                best = (d, s)
        if best and best[0] < 200:
            out[e["text"].strip()] = best[1]["text"].strip()
    return out

WORD = r"(?<![\wåäöÅÄÖ*])"
END = r"(?![\wåäöÅÄÖ*])"
# Ord som också kan vara vanliga ord byts bara när de står som knappnamn ("Tryck Add", "i In").
NEVER = {"In", "To", "None"}
# Korta, vanliga ord byts bara när de står som knappnamn efter ett verb ("Tryck Add", "Välj Track").
VERB = r"(?:[Tt]ryck(?:er)?|[Kk]licka(?:r)?(?: på)?|[Vv]älj(?:er)?|[Kk]ryssa(?: i| ur)?|[Bb]ocka(?: i| ur)?|[Ss]täng med|[Ff]liken|[Kk]olumnen|[Rr]utan|[Kk]nappen|[Öö]ppna|under|i|på|och|eller)\s+"

def localize_text(t, vt):
    if not t:
        return t
    terms = {**glob, **vt, **{k: v for k, v in NAV.items() if k not in vt or vt[k] == v}, **FIXES}
    # "Öppna X": X är menyns namn, inte dialogens rubrik.
    t = re.sub(r"(Öppna |öppna )([A-Z][\w &/+-]+?)(?=[.,]| och | i |$)", lambda m: m.group(1) + (f"**{NAV[m.group(2)]}**" if m.group(2) in NAV else m.group(2)), t)
    keys = sorted((k for k in terms if len(k) >= 2 and terms[k] and re.search(r"[A-Za-z]", k)), key=len, reverse=True)
    out = t
    for k in keys:
        v = terms[k]
        if k in NEVER:
            pat = re.compile(r"(" + VERB + r")" + re.escape(k) + END)
            out = pat.sub(lambda m: m.group(1) + f"**{v}**", out)
        else:
            pat = re.compile(WORD + re.escape(k) + END)
            out = pat.sub(f"**{v}**", out) if v != k else pat.sub(f"**{k}**", out)
    return out

def strip_bold(s):
    return s.replace("**", "")

SECTIONS = ("Adress & kontakt", "Incheckningstillgänglighet", "Veckans öppettider", "Stängda datum & allmänna helgdagar")

def tidy(s):
    # Sektionerna i Redigera platsinformation är hopfällda i den nya appen.
    for sec in SECTIONS:
        s = s.replace(f"scrolla till **{sec}**", f"fäll ut **{sec}**")
    s = s.replace("****", "")
    s = re.sub(r"\*\*(\*\*)+", "**", s)
    return s

res = {}
for g in G + D:
    vt = view_terms(g["id"])
    L = lambda s: tidy(localize_text(s, vt))
    crumbs = []
    for c in g["breadcrumb"]:
        if c == "DEMO LUP":
            crumbs.append("Din plats")
        else:
            crumbs.append(NAV.get(c) or glob.get(c) or strip_bold(L(c)))
    res[g["id"]] = {
        "summary": L(g["summary"]),
        "breadcrumb": crumbs,
        "steps": [{**s, "text": L(s["text"])} for s in g["steps"]],
        "notes": [{**n, "text": L(n["text"])} for n in g["notes"]],
        "hotspots": [{**h, "label": strip_bold(L(h["label"])), "text": L(h["text"])} for h in g.get("hotspots", [])],
        "englishTerms": sorted({k for k in vt if vt[k] != k and re.search(r"[A-Za-z]{3}", k)} & set(re.findall(r"[A-Z][\w&/ +-]+", " ".join([*g["breadcrumb"], *[s["text"] for s in g["steps"]], *[h["label"] for h in g.get("hotspots", [])]]))))[:12],
    }
over = json.load(open(f"{content}/localized-overrides.json", encoding="utf-8"))
for gid, o in over.items():
    if gid.startswith("_") or gid not in res:
        continue
    for n, text in o.get("steps", {}).items():
        for s in res[gid]["steps"]:
            if str(s["n"]) == n:
                s["text"] = text
json.dump({"_comment": "Genererat av scripts/capture/localize.py: guidetexter med appens svenska knappnamn (**fetstil**).", "guides": res},
          open(f"{content}/localized.sv.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("guider:", len(res))
