"""Skriver content/hotspots.sv.json: markeringarnas positioner + vilket steg som pekar på vilken markering.
Kör: python3 scripts/hotspots/steps.py /tmp/hs/hotspots.json content/guides.sv.json content/hotspots.sv.json public/screens
"""
import sys, json, re
from PIL import Image

hs, gj, out, scr = sys.argv[1:5]
hs = json.load(open(hs)); guides = json.load(open(gj))["guides"]

def norm(s): return re.sub(r"\s+", " ", s.lower()).strip()

res = {}
for g in guides:
    W, H = Image.open(f"{scr}/{g['number']:02d}.webp").size
    spots = {}
    for n, r in hs[g["id"]]["spots"].items():
        if r["w"] * r["h"] > 0.45 * 100 * 100:
            continue  # för stor yta – ingen nytta att zooma
        spots[str(n)] = {k: r[k] for k in ("x", "y", "w", "h")}
    steps = {}
    for st in g["steps"]:
        t = norm(st["text"]); best = None
        for h in g["hotspots"]:
            # Knappnamnen i markeringen, t.ex. "Add bay" eller "Edit och Delete" → ["edit", "delete"]
            for lab in re.split(r"\s+(?:och|eller|/)\s+|,\s*", h["label"]):
                lab = norm(lab)
                if len(lab) >= 3 and re.search(r"(?<![a-zåäö])" + re.escape(lab) + r"(?![a-zåäö])", t):
                    if str(h["n"]) in spots and (best is None or len(lab) > best[1]):
                        best = (h["n"], len(lab))
        if best:
            steps[str(st["n"])] = best[0]
    res[g["id"]] = {"size": [W, H], "hotspots": spots, "steps": steps}

json.dump({"_comment": "Genererat från skärmbilderna: markeringarnas position (procent) och vilket steg som pekar på vilken markering. Kan justeras i admin.", "guides": res},
          open(out, "w"), ensure_ascii=False, indent=1)
print("klart:", out)
