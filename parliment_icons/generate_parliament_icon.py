#!/usr/bin/env python3
"""
Parliament icon generator
─────────────────────────
Generates a circular dot-grid SVG icon showing seat distribution by party.

Usage:
    python3 generate_parliament_icon.py           # House of Representatives
    python3 generate_parliament_icon.py house     # House of Representatives
    python3 generate_parliament_icon.py senate    # Senate
    python3 generate_parliament_icon.py both      # Both chambers

Output:
    parliament_icon_house.svg
    parliament_icon_senate.svg

To update seats: edit the HOUSE or SENATE dicts below and re-run.
"""

import math
import sys
from collections import Counter

# ── EDIT THESE SECTIONS ────────────────────────────────────────────────────────
# Each entry: (hex_colour, seats, label)
# Order left → right politically — sectors appear clockwise in that order.

HOUSE = {
    'expected': 150,
    'output': 'parliament_icon_house.svg',
    'parties': [
        ('#009900', 1,  'Greens'),
        ('#E13940', 94, 'Labor'),
        ('#00B4B4', 6,  'Teal independents'),
        ('#808080', 4,  'Other independents'),
        ('#4B9FB4', 1,  'Centre Alliance'),
        ('#8B4513', 1,  "Katter's Australian Party"),
        ('#F36C21', 2,  'One Nation'),
        ('#006946', 14, 'Nationals'),
        ('#1C4F9C', 27, 'Liberal'),
    ],
}

SENATE = {
    'expected': 76,
    'output': 'parliament_icon_senate.svg',
    'parties': [
        ('#009900', 10, 'Greens'),
        ('#E13940', 29, 'Labor'),
        ('#808080', 4,  'Independents'), #Thorpe, Payman, Tyrrell
        ('#00B4B4', 1,  'Teal independents'),              # Pocock, 
        ('#FFD700', 1,  'Jacqui Lambie Network'),
        ('#8B008B', 1,  'United Australia Party'),
        ('#F36C21', 4,  'One Nation'),
        ('#006946', 4,  'Nationals'),
        ('#1C4F9C', 23, 'Liberal'),
    ],
}

# ── END OF EDITABLE SECTION ────────────────────────────────────────────────────


def generate(chamber: dict):
    parties = chamber['parties']
    expected = chamber['expected']
    output = chamber['output']

    palette = []
    for color, seats, _ in parties:
        palette.extend([color] * seats)

    total = len(palette)
    if total != expected:
        print(f"  WARNING: total seats = {total}, expected {expected}. Check your numbers.")
    else:
        print(f"  Total seats: {total} (correct)")

    CX, CY = 100, 100

    # 3 rings for Senate (76 seats), 4 rings for House (150 seats)
    radii = [40, 56, 72] if total <= 80 else [43, 56, 69, 82]

    total_r = sum(radii)
    counts = [round(r / total_r * total) for r in radii]
    counts[-1] += total - sum(counts)

    # CR: largest radius where adjacent dots on the same ring don't overlap
    max_crs = [radii[k] * math.sin(math.pi / counts[k]) for k in range(len(radii))]
    CR = round(min(max_crs) * 0.96, 3)

    # Assign palette colours by global angular order so sectors align across rings
    all_dots = []
    for k, n in enumerate(counts):
        for j in range(n):
            all_dots.append((j / n, k, j))
    all_dots.sort(key=lambda x: (x[0], x[1]))

    dot_color = {}
    for i, (_, k, j) in enumerate(all_dots):
        dot_color[(k, j)] = palette[i]

    # Verify party counts
    cc = Counter(dot_color.values())
    all_ok = True
    for color, seats, name in parties:
        actual = cc.get(color, 0)
        if actual != seats:
            print(f"  MISMATCH {name}: got {actual} dots, expected {seats}")
            all_ok = False
        else:
            print(f"  {name}: {seats}")
    if all_ok:
        print("  All party counts correct")

    lines = ['<svg viewBox="0 0 200 200" width="200" height="200" xmlns="http://www.w3.org/2000/svg">']
    for k, (r, n) in enumerate(zip(radii, counts)):
        for j in range(n):
            frac = j / n
            angle = -math.pi / 2 + frac * 2 * math.pi
            cx = round(CX + r * math.cos(angle), 2)
            cy = round(CY + r * math.sin(angle), 2)
            lines.append(f'<circle cx="{cx}" cy="{cy}" r="{CR}" fill="{dot_color[(k, j)]}"/>')
    lines.append('</svg>')

    with open(output, 'w') as f:
        f.write('\n'.join(lines))
    print(f"  Saved: {output}\n")


if __name__ == '__main__':
    arg = sys.argv[1].lower() if len(sys.argv) > 1 else 'house'

    if arg == 'senate':
        print("Senate ─────────────────────────")
        generate(SENATE)
    elif arg == 'house':
        print("House of Representatives ───────")
        generate(HOUSE)
    elif arg == 'both':
        print("House of Representatives ───────")
        generate(HOUSE)
        print("Senate ─────────────────────────")
        generate(SENATE)
    else:
        print(f"Unknown argument '{arg}'. Use: house, senate, or both")
        sys.exit(1)
