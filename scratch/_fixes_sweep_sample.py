from PIL import Image
import json, math

# Pixel angles (canvas y-down): 270deg = 12 o'clock, 0deg = 3 o'clock,
# 90deg = 6 o'clock. A 25% clockwise sweep from 12 o'clock therefore covers
# pixel angles 270..360. Expected: bright inside that arc, dark outside.
im = Image.open('scratch/_fixes_sweep.png').convert('RGB')
pts = json.load(open('scratch/_fixes_sweep_points.json'))
print(f"image {im.size}")
ok = True
for slot, p in pts.items():
    cx, cy, inner = p['cx'], p['cy'], p['inner']
    r = inner * 0.9
    print(f"\n{slot}: center=({cx:.0f},{cy:.0f}) sample_r={r:.0f}")
    for deg, expect in ((285, 'bright'), (330, 'bright'), (15, 'dark'), (90, 'dark'), (180, 'dark')):
        a = math.radians(deg)
        x, y = round(cx + math.cos(a) * r), round(cy + math.sin(a) * r)
        px = im.getpixel((x, y))
        bright = px[0] > 150 and px[1] < 110
        got = 'bright' if bright else ('dark' if max(px) < 110 else f'other {px}')
        good = (got == expect)
        ok = ok and good
        print(f"  {deg:>3}deg (expect {expect:>6}) -> {px}  {'OK' if good else 'MISMATCH'}")
print('\nSWEEP DIRECTION:', 'PASS - bright arc runs clockwise from 12 o clock (25%)' if ok else 'FAIL')
