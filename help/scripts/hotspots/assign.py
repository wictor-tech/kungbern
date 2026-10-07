import sys, json, os
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(__file__))
from detect import analyze, orange_mask
import numpy as np

def arrow_dir(mask, b):
    """Vilket håll pilen lämnar brickan åt: räkna orange pixlar i band utanför varje sida."""
    x, y, w, h = b['x'], b['y'], b['w'], b['h']; H, W = mask.shape
    def cnt(y0, y1, x0, x1):
        y0, y1, x0, x1 = max(0, y0), min(H, y1), max(0, x0), min(W, x1)
        return int(mask[y0:y1, x0:x1].sum()) if y1 > y0 and x1 > x0 else 0
    sides = {
        "left": cnt(y+h//4, y+3*h//4, x-14, x-2),
        "right": cnt(y+h//4, y+3*h//4, x+w+2, x+w+14),
        "up": cnt(y-14, y-2, x+w//4, x+3*w//4),
        "down": cnt(y+h+2, y+h+14, x+w//4, x+3*w//4),
    }
    best = max(sides, key=sides.get)
    return best if sides[best] >= 6 else None

def in_dir(cx, cy, bx, d):
    if d == "left": return bx['x'] < cx
    if d == "right": return bx['x'] + bx['w'] > cx
    if d == "up": return bx['y'] < cy
    if d == "down": return bx['y'] + bx['h'] > cy
    return True

CL2D = {0:2,1:3,2:1,3:4,4:5,5:6,6:1,7:3,8:7,9:2,10:1,11:6,13:3,14:4,15:2,16:4,17:5,18:6}
screens_dir, guides_json, out_json, verify_dir = sys.argv[1:5]
dj = json.load(open(os.path.join(os.path.dirname(out_json), "digits.json")))
guides = json.load(open(guides_json))["guides"]

def edge_dist(cx, cy, b):
    dx = max(b['x'] - cx, 0, cx - (b['x'] + b['w']))
    dy = max(b['y'] - cy, 0, cy - (b['y'] + b['h']))
    return (dx*dx + dy*dy) ** 0.5

result = {}
for g in guides:
    name = f"{g['number']:02d}.webp"
    p = os.path.join(screens_dir, name)
    W, H, _, boxes = analyze(p)
    mask = orange_mask(np.asarray(__import__("PIL.Image").Image.open(p).convert("RGB")))
    badges = [(r["d"], r) for r in dj.get(name, []) if r["best"] <= 0.15]
    spots = {}
    for n, b in badges:
        cx, cy = b['x'] + b['w']/2, b['y'] + b['h']/2
        # Rutor som inte innehåller brickan själv, närmast först
        d = arrow_dir(mask, b)
        pool = [bx for bx in boxes if in_dir(cx, cy, bx, d)] or boxes
        cands = sorted(((edge_dist(cx, cy, bx), bx) for bx in pool), key=lambda t: t[0])
        rect, src = None, "badge"
        if cands and cands[0][0] < 110:
            bx = cands[0][1]; rect = (bx['x'], bx['y'], bx['w'], bx['h']); src = "box"
        else:
            w, h = W*0.16, H*0.14
            rect = (max(0, cx - w/2), max(0, cy - h/2), w, h)
        spots[n] = dict(x=round(100*rect[0]/W, 1), y=round(100*rect[1]/H, 1), w=round(100*rect[2]/W, 1), h=round(100*rect[3]/H, 1), src=src)
    expected = len(g["hotspots"])
    result[g["id"]] = dict(expected=expected, found=sorted(spots), spots=spots)
    # verifieringsbild
    im = Image.open(p).convert("RGB"); d = ImageDraw.Draw(im)
    for n, s in spots.items():
        x, y, w, h = s['x']*W/100, s['y']*H/100, s['w']*W/100, s['h']*H/100
        col = (0, 160, 255) if s['src'] == "box" else (200, 0, 200)
        d.rectangle((x, y, x+w, y+h), outline=col, width=4)
        d.rectangle((x, y, x+34, y+30), fill=col); d.text((x+8, y+6), str(n), fill="white", font_size=22)
    im.thumbnail((1000, 1000)); im.save(os.path.join(verify_dir, f"{g['number']:02d}.png"))
json.dump(result, open(out_json, "w"), indent=1)
bad = {k: (v["expected"], v["found"]) for k, v in result.items() if v["found"] != list(range(1, v["expected"]+1))}
print("mismatch:", json.dumps(bad, ensure_ascii=False))
print("box-based:", sum(s['src']=='box' for v in result.values() for s in v['spots'].values()), "badge-only:", sum(s['src']=='badge' for v in result.values() for s in v['spots'].values()))
