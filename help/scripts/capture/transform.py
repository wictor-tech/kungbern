"""
Gör om en genomgång av appen (capture.mjs) till innehåll för hjälpen:
  - svenska skärmbilder (WebP) i public/screens/app/
  - ordlista engelska → svenska knappnamn (content/ui-terms.json)
  - markeringarnas positioner per guide, hämtade från knapparnas riktiga plats (content/app-capture.sv.json)

  python3 scripts/capture/transform.py <capture-dir> content/guides.sv.json content public/screens/app
"""
import sys, json, os, re
from collections import Counter, defaultdict
from PIL import Image

cap, guides_json, content_dir, screens_out = sys.argv[1:5]
guides = json.load(open(guides_json, encoding="utf-8"))["guides"]
# Nya guider (drafts.sv.json) som har egna markeringar fångas också.
drafts_path = os.path.join(os.path.dirname(guides_json), "drafts.sv.json")
if os.path.exists(drafts_path):
    guides += [g for g in json.load(open(drafts_path, encoding="utf-8"))["guides"] if g.get("hotspots")]
os.makedirs(screens_out, exist_ok=True)
VW, VH = 1440, 900
LETTER = re.compile(r"[A-Za-zÅÄÖåäö]")

def load(gid, lang):
    p = os.path.join(cap, f"{gid}.{lang}.json")
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else None

def pair(en, sv):
    """Para ihop element på samma plats i båda språken (samma tagg, nästan samma y, närmast i x)."""
    used, pairs = set(), []
    for e in en:
        best, bd = None, 1e9
        for j, s in enumerate(sv):
            if j in used or s["tag"] != e["tag"]:
                continue
            dy = abs(s["y"] - e["y"])
            if dy > 8:
                continue
            d = dy * 4 + abs(s["x"] - e["x"]) + abs((s["x"] + s["w"]) - (e["x"] + e["w"])) * 0.2
            if d < bd:
                best, bd = j, d
        if best is not None and bd < 400:
            used.add(best)
            pairs.append((e, sv[best]))
    return pairs

terms = defaultdict(Counter)
views = {}
for g in guides:
    en, sv = load(g["id"], "en"), load(g["id"], "sv")
    if not en or not sv:
        continue
    ps = pair(en["texts"], sv["texts"])
    for e, s in ps:
        a, b = e["text"].strip(), s["text"].strip()
        if a and b and a != b and LETTER.search(a) and len(a) <= 60 and not re.search(r"\d{4}|#\d", a):
            terms[a][b] += 1
    views[g["id"]] = (en, sv, ps)

term_map = {a: c.most_common(1)[0][0] for a, c in terms.items()}

def norm(t):
    return re.sub(r"\s+", " ", t.strip().lower().rstrip(":*").strip())

anchors_path = os.path.join(content_dir, "hotspot-anchors.json")
ANCHORS = json.load(open(anchors_path, encoding="utf-8")) if os.path.exists(anchors_path) else {}

def near_sv(e, sv_texts):
    """Samma element i den svenska bilden: översatt eller oöversatt text, närmast den engelska positionen."""
    targets = {norm(e["text"]), norm(term_map.get(e["text"].strip(), e["text"]))}
    cands = [s for s in sv_texts if norm(s["text"]) in targets and s["tag"] == e["tag"]]
    if not cands:
        return None
    best = min(cands, key=lambda s: abs(s["y"] - e["y"]) * 2 + abs(s["x"] - e["x"]))
    return best if abs(best["y"] - e["y"]) < 120 else None

def find_boxes(label, ps, en_texts, parts=None, sv_texts=()):
    """Hitta elementen som en markering syftar på ("Edit och Delete" → två element).
    Returnerar rutor i den svenska bilden; saknas en svensk motsvarighet används den engelska positionen
    (layouten är densamma på båda språken)."""
    if parts is None:
        parts = [p for p in re.split(r"\s+(?:och|eller|/)\s+|,\s*", label) if p.strip()]
    paired = {id(e): s for e, s in ps}
    out = []
    pref = {"button": 0, "a": 0, "summary": 0, "label": 1, "th": 1, "input": 2, "select": 2, "span": 3, "div": 4}
    for part in parts:
        want = norm(part)
        if len(want) < 2:
            continue
        cands = [e for e in en_texts if norm(e["text"]) == want]
        if not cands:
            cands = [e for e in en_texts if norm(e["text"]).startswith(want) and len(want) >= 4]
        if not cands:
            continue
        cands.sort(key=lambda e: (pref.get(e["tag"], 5), e["y"]))
        e = cands[0]
        out.append(near_sv(e, sv_texts) or paired.get(id(e)) or e)
    return out

result = {}
for g in guides:
    if g["id"] not in views:
        continue
    en, sv, ps = views[g["id"]]
    src = os.path.join(cap, f"{g['id']}.sv.png")
    im = Image.open(src).convert("RGB")
    FW, FH = im.size
    # Beskär: sidomenyn i Location Admin tar plats utan att hjälpa (utom i guiden som handlar om den),
    # och tom yta längst ned tas bort så att det viktiga blir större.
    left = 350 if sv["url"] == "/home" and g["id"] != "hitta-ratt-installning" else 0
    content = [t for t in sv["texts"] if t["x"] + t["w"] > left and t["y"] < FH and not re.search(r"OpenStreetMap|Leaflet|ny plats|new location|Flytta till plats|Move to location|^Adress$|^Mark", t["text"])]
    bottom = max([t["y"] + t["h"] for t in content] + [400]) + 36
    bottom = min(FH, max(bottom, 420))
    im = im.crop((left, 0, FW, bottom))
    W, H = im.size
    out_name = f"{g['id']}.webp"
    im.save(os.path.join(screens_out, out_name), "WEBP", quality=84, method=6)
    spots = {}
    for h in g["hotspots"]:
        anchor = ANCHORS.get(g["id"], {}).get(str(h["n"]))
        en_texts = [t for t in en["texts"] if not (en["url"] == "/home" and t["x"] < 350 and g["id"] != "hitta-ratt-installning")]
        rect = ANCHORS.get(g["id"], {}).get(f"rect{h['n']}")
        boxes = [dict(zip("xywh", rect))] if rect else find_boxes(h["label"], ps, en_texts, anchor, sv["texts"])
        if not boxes:
            continue
        x0 = min(b["x"] for b in boxes) - left; y0 = min(b["y"] for b in boxes)
        x1 = max(b["x"] + b["w"] for b in boxes) - left; y1 = max(b["y"] + b["h"] for b in boxes)
        pad = 4
        x0, y0, x1, y1 = max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad)
        if x1 <= x0 or y1 <= y0:
            continue
        spots[str(h["n"])] = {
            "x": round(100 * x0 / W, 2), "y": round(100 * y0 / H, 2),
            "w": round(100 * (x1 - x0) / W, 2), "h": round(100 * (y1 - y0) / H, 2),
        }
    result[g["id"]] = {"screenshot": f"/screens/app/{out_name}", "size": [W, H], "url": sv["url"], "hotspots": spots}

json.dump(dict(sorted(term_map.items())), open(os.path.join(content_dir, "ui-terms.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump({"_comment": "Genererat av scripts/capture/transform.py från en genomgång av app.lupnumber.com (svenska).", "guides": result},
          open(os.path.join(content_dir, "app-capture.sv.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
tot = sum(len(g["hotspots"]) for g in guides if g["id"] in result)
found = sum(len(v["hotspots"]) for v in result.values())
print(f"vyer: {len(result)}  termer: {len(term_map)}  markeringar med position: {found}/{tot}")
