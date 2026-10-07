import sys, json
import numpy as np
from PIL import Image
from scipy import ndimage

def orange_mask(a):
    r,g,b = a[...,0].astype(int), a[...,1].astype(int), a[...,2].astype(int)
    # markeringsfärg ~ #e8431a
    return (r>200)&(g>40)&(g<110)&(b<70)

def analyze(path):
    im = Image.open(path).convert("RGB"); a = np.asarray(im); H,W = a.shape[:2]
    m = orange_mask(a)
    lab, n = ndimage.label(m, structure=np.ones((3,3)))
    objs = ndimage.find_objects(lab)
    badges, boxes = [], []
    for i, sl in enumerate(objs, 1):
        ys, xs = sl; h = ys.stop-ys.start; w = xs.stop-xs.start
        comp = (lab[sl]==i); fill = comp.sum()/(w*h)
        if 14<=w<=40 and 14<=h<=40 and abs(w-h)<=6 and fill>0.5:
            badges.append(dict(x=xs.start,y=ys.start,w=w,h=h))
        elif w>30 and h>12 and fill<0.35:
            boxes.append(dict(x=xs.start,y=ys.start,w=w,h=h,fill=round(fill,2)))
    return W,H,badges,boxes

if __name__ == "__main__":
  for p in sys.argv[1:]:
    W,H,b,bx = analyze(p)
    print(p.split('/')[-1], W,H, "badges",len(b), [ (d['x'],d['y'],d['w']) for d in b][:12], "boxes",len(bx), [(d['x'],d['y'],d['w'],d['h']) for d in bx][:12])
