import sys, json, glob, os
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from detect import analyze

SCR = sys.argv[1]; OUT = sys.argv[2]
def crop(name, b, size=28):
    im = Image.open(f"{SCR}/{name}").convert("L")
    pad = 3
    c = im.crop((b['x']-pad, b['y']-pad, b['x']+b['w']+pad, b['y']+b['h']+pad)).resize((size+6, size+6))
    a = np.asarray(c).astype(np.float32)
    return (a > 170).astype(np.float32)  # vit siffra

items = []
for p in sorted(glob.glob(SCR + "/*.webp")):
    name = os.path.basename(p)
    W,H,badges,_ = analyze(p)
    for b in badges: items.append((name, b, crop(name, b)))

# Mallar: kända siffror (fil, ungefärlig x, y) avlästa från verifieringsbilderna.
known = {1: ("06.webp", 1485, 88), 2: ("06.webp", 1277, 171), 3: ("06.webp", 1473, 385), 4: ("06.webp", 1474, 274),
         5: ("06.webp", 1145, 624), 6: ("06.webp", 1145, 683), 7: ("01.webp", 450, 606)}
def find(name, x, y):
    return min((it for it in items if it[0]==name), key=lambda it: abs(it[1]['x']-x)+abs(it[1]['y']-y))
T = {d: find(*v)[2] for d, v in known.items()}
def core(a, dx, dy):  # centrerat utsnitt med förskjutning
    return a[3+dy:3+dy+28, 3+dx:3+dx+28]
def score(a, t):
    tc = core(t, 0, 0)
    return min(np.abs(core(a, dx, dy) - tc).mean() for dx in range(-3,4) for dy in range(-3,4))
res = {}
for name, b, a in items:
    sc = sorted((score(a, t), d) for d, t in T.items())
    res.setdefault(name, []).append(dict(d=int(sc[0][1]), conf=round(float(sc[1][0]-sc[0][0]), 3), best=round(float(sc[0][0]), 3), **{k: int(v) for k, v in b.items()}))
json.dump(res, open(OUT, "w"), indent=1)
guides = json.load(open("/home/user/kungbern/help/content/guides.sv.json"))["guides"]
for g in guides:
    name = f"{g['number']:02d}.webp"; exp = len(g['hotspots'])
    ds = sorted(r['d'] for r in res.get(name, []))
    flag = "" if ds == list(range(1, exp+1)) else "  <-- " + str(ds)
    low = [ (r['d'], r['x'], r['y'], r['best'], r['conf']) for r in res.get(name, []) if r['conf'] < 0.04 or r['best'] > 0.15]
    if flag or low: print(name, "expected", exp, flag, "low:", low)
