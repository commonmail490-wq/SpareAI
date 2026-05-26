#!/usr/bin/env python3
"""Generate excel-inventory-baseline.json from spareai_real_data.sql."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL = ROOT / "spareai_real_data.sql"
OUT = ROOT / "src" / "main" / "webapp" / "assets" / "excel-inventory-baseline.json"

text = SQL.read_text(encoding="utf-8")
m = re.search(
    r"INSERT INTO inventory_items\s*\([^)]+\)\s*VALUES\s*(.*?);",
    text,
    re.S | re.I,
)
if not m:
    raise SystemExit("inventory_items INSERT not found")

rows = {}
for line in m.group(1).splitlines():
    line = line.strip().rstrip(",")
    if not line.startswith("("):
        continue
    inner = line[1:-1] if line.endswith(")") else line[1:]
    # Split on commas not inside quotes
    parts = []
    cur = []
    in_q = False
    for ch in inner:
        if ch == "'" and (not cur or cur[-1] != "\\"):
            in_q = not in_q
            cur.append(ch)
        elif ch == "," and not in_q:
            parts.append("".join(cur).strip())
            cur = []
        else:
            cur.append(ch)
    if cur:
        parts.append("".join(cur).strip())
    if len(parts) < 8:
        continue
    code = parts[0].strip("'")
    stock = float(parts[5])
    reorder = float(parts[6])
    cost = float(parts[7])
    rows[code] = {
        "reorder_level": reorder,
        "stock_qty": stock,
        "unit_cost": cost,
    }

OUT.write_text(json.dumps(rows, indent=2), encoding="utf-8")
print(f"Wrote {len(rows)} materials to {OUT}")
