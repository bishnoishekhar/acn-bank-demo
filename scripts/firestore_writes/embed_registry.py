"""Put registry.json into every agent's before_tool callback (all 31 carry an identical copy: CES has no shared module).

  python scripts/firestore_writes/embed_registry.py <app dir> <registry.json>            dry run: says how many files would change
  python scripts/firestore_writes/embed_registry.py <app dir> <registry.json> --apply    rewrites them (CRLF / LF kept as found)

Only the text between `_FSW_REGISTRY = json.loads('''` and `''')` is replaced. Run gen_firestore_writes.py first.
"""
import glob
import json
import os
import sys

app, reg_path = sys.argv[1], sys.argv[2]
APPLY = "--apply" in sys.argv
HEAD, TAIL = "_FSW_REGISTRY = json.loads('''", "''')"
new_json = json.dumps(json.load(open(reg_path, encoding="utf-8")), sort_keys=True, separators=(",", ":"))

changed = total = 0
for f in sorted(glob.glob(os.path.join(app, "agents", "*", "before_tool_callbacks", "*", "python_code.py"))):
    s = open(f, encoding="utf-8", newline="").read()
    i = s.find(HEAD)
    if i < 0:
        continue
    total += 1
    j = s.index(TAIL, i + len(HEAD))
    if s[i + len(HEAD):j] == new_json:
        continue
    changed += 1
    if APPLY:
        open(f, "w", encoding="utf-8", newline="").write(s[:i + len(HEAD)] + new_json + s[j:])
print(("rewrote" if APPLY else "would rewrite"), changed, "of", total, "before_tool files")
