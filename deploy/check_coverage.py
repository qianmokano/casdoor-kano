#!/usr/bin/env python3
"""Enforce statement coverage of the added Kano policy modules."""
import sys
from pathlib import Path

rows = [line.split() for line in Path(sys.argv[1]).read_text().splitlines()[1:]]
failed = False
for filename in ("controllers/kano_mfa.go", "object/kano.go"):
    blocks = [row for row in rows if row[0].split(":")[0].endswith("/" + filename)]
    total = sum(int(row[1]) for row in blocks)
    covered = sum(int(row[1]) for row in blocks if int(row[2]) > 0)
    percentage = covered * 100 / total if total else 0
    print(f"{filename}: {percentage:.1f}% ({covered}/{total} statements)")
    failed |= percentage < 80
raise SystemExit(1 if failed else 0)
