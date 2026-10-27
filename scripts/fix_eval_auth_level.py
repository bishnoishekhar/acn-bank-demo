"""Make the recorded evaluations runnable: turn `"auth_level": 2.0` (a number) into `"auth_level": "2"` (text) in the test cases.

Why: app.json declares auth_level as STRING, but 172 test cases set it as a number. The platform rejects the whole session with
"Invalid value provided for auth_level: Expected `String`, received `kotlin.Double`", so those tests crash before the agent says a word.

  python scripts/fix_eval_auth_level.py            dry run: says how many settings would change, writes nothing
  python scripts/fix_eval_auth_level.py --apply    rewrites the files under agent/ACN_Bank_CES_Demo/evaluations (then push the app so the platform has them)

Only that one variable is touched, and only its type (2.0 -> "2"). Safe to run twice.
"""
import glob
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "agent", "ACN_Bank_CES_Demo")
APPLY = "--apply" in sys.argv
PAT = re.compile(r'("auth_level"\s*:\s*)(-?\d+)(?:\.0+)?(\s*[,}\n\r])')

settings = files = 0
for f in sorted(glob.glob(os.path.join(ROOT, "evaluations", "*", "*.json"))):
    s = open(f, encoding="utf-8", newline="").read()
    t, k = PAT.subn(lambda m: m.group(1) + '"' + m.group(2) + '"' + m.group(3), s)
    if not k:
        continue
    json.loads(t)                      # never write something that is not valid JSON
    settings += k
    files += 1
    if APPLY:
        open(f, "w", encoding="utf-8", newline="").write(t)
print(("converted" if APPLY else "would convert"), settings, "auth_level setting(s) in", files, "test file(s)")
if not APPLY and settings:
    print("run again with --apply to write the change")
