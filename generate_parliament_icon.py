#!/usr/bin/env python3
"""
Parliament icon generator
─────────────────────────
Edit the PARTIES list below whenever seats change, then run:

    python3 generate_parliament_icon.py

Output: parliament_icon.svg (same directory)
"""

import math
from collections import Counter

# ── EDIT THIS SECTION ──────────────────────────────────────────────────────────
# (color, seats, label)
# Ordered left → right politically. Sectors will appear in this order clockwise.

PARTIES = [
    ('#009900', 1,  'Greens'),
    ('#E13940', 94, 'Labor'),
    ('#008B96', 7,  'Teal independents'),
    ('#808080', 3,  'Other independents'),
    ('#FF6600', 1,  'Centre Alliance'),
    ('#8B4513', 1,  "Katter's Australian Party"),
    ('#F36C21', 1,  'One Nation'),
    ('#006946', 14, 'Nationals'),
    ('#1C4F9C', 28, 'Liberal'),
]

OUTPUT_FILE = 'parliament_icon.svg'
# ── END OF EDITABLE SECTION ────────────────────────────────────────────────────


def generate():
    palette = []
    for color, seats, _ in PARTIES:
        palette.extend([color] * seats)

    total = len(palette)
    expected = 150  # update this if total seats changes
    if total != expected:
        print(f"⚠️  Warning: total seats = {total}, expected {expected}. Check your numbers.")
    else:
        print(f"✓  Total seats: {total}")

    CX, CY = 100, 100
    radii = [43, 56, 69, 82]
    total_r = sum(radii)
    counts = [round(r / total_r * total) for r in radii]
    counts[-1] += total - sum(counts)

    max_crs = [radii[k] * math.sin(math.pi / counts[k]) for k in range(4)]
    CR = round(min(max_crs) * 0.96, 3)

    # Assign palette colours by global angular order
    all_dots = []
    for k, n in enumerate(counts):
        for j in range(n):
            all_dots.append((j / n, k, j))
    all_dots.sort(key=lambda x: (x[0], x[1]))

    dot_color = {}
    for i, (_, k, j) in enumerate(all_dots):
        dot_color[(k, j)] = palette[i]

    # Verify counts
    cc = Counter(dot_color.values())
    all_ok = True
    for color, seats, name in PARTIES:
        actual = cc.get(color, 0)
        if actual != seats:
            print(f"  ✗ {name}: got {actual} dots, expected {seats}")
            all_ok = False
        else:
            print(f"  ✓ {name}: {seats}")
    if all_ok:
        print("✓  All party counts correct")

    lines = ['<svg viewBox="0 0 200 200" width="200" height="200" xmlns="http://www.w3.org/2000/svg">']
    for k, (r, n) in enumerate(zip(radii, counts)):
        for j in range(n):
            frac = j / n
            angle = -math.pi / 2 + frac * 2 * math.pi
            cx = round(CX + r * math.cos(angle), 2)
            cy = round(CY + r * math.sin(angle), 2)
            lines.append(f'<circle cx="{cx}" cy="{cy}" r="{CR}" fill="{dot_color[(k, j)]}"/>')
    lines.append('</svg>')

    with open(OUTPUT_FILE, 'w') as f:
        f.write('\n'.join(lines))
    print(f"✓  Saved to {OUTPUT_FILE}")


if __name__ == '__main__':
    generate()
