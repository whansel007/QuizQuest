"""Measure how far the white icon ink sits from the centre of a talent badge.

Prints JSON: { w, h, inkPixels, cx, cy, dx, dy } where dx/dy are the offset of
the ink centroid from the image centre, in pixels (positive = right/down).
"""
import json
import sys

from PIL import Image

path = sys.argv[1]
im = Image.open(path).convert('RGB')
w, h = im.size
pixels = im.load()

xs = []
ys = []
for y in range(h):
    for x in range(w):
        r, g, b = pixels[x, y]
        # The icon is drawn white on a saturated blue badge.
        if r > 205 and g > 205 and b > 205:
            xs.append(x)
            ys.append(y)

if not xs:
    print(json.dumps({"w": w, "h": h, "inkPixels": 0, "dx": None, "dy": None}))
    sys.exit(0)

cx = sum(xs) / len(xs)
cy = sum(ys) / len(ys)
# Compare against the ink's own bounding box too: the centroid is pulled by any
# asymmetric stroke, the box centre shows the layout offset.
bx = (min(xs) + max(xs) + 1) / 2
by = (min(ys) + max(ys) + 1) / 2

print(json.dumps({
    "w": w,
    "h": h,
    "inkPixels": len(xs),
    "bbox": [min(xs), min(ys), max(xs), max(ys)],
    "centroid": [round(cx, 2), round(cy, 2)],
    "boxCentre": [round(bx, 2), round(by, 2)],
    "dx": round(cx - w / 2, 2),
    "dy": round(cy - h / 2, 2),
    "boxDx": round(bx - w / 2, 2),
    "boxDy": round(by - h / 2, 2),
}))
