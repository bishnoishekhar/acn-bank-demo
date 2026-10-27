"""Run every offline check in one go (no network, no Firestore, no LLM). Exit code 0 only if all of them pass.

  python scripts/check_all.py

Run this after ANY change under agent/ACN_Bank_CES_Demo/agents/*/ callbacks, and especially after the generated callbacks
(before_tool / after_model / after_tool, 31 agents) have been regenerated or pruned from the canonical module.
The generated files are copies, so a regeneration silently removes whatever is not in the canonical module. What these checks guard:

  test_security.py      login stub (unknown phone, no default PIN, 3-strikes lock), travel-notice and loan "yes" gates in all 31 agents
  test_pin_journey.py   one PIN per journey: kept through payee list / amount / confirm, spent by a write, cancel words or a final answer
  test_figures.py       the loan / mortgage cards say their numbers out loud
  test_*.mjs            the web chat bridge and widget resolution

If one fails after a regeneration, the fix is to re-apply the missing logic to the canonical module, not to relax the test.
"""
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault("PYTHONUTF8", "1")

CHECKS = [(sys.executable, "test_security.py"), (sys.executable, "test_pin_journey.py"), (sys.executable, "test_figures.py")]
node = shutil.which("node")
if node:
    CHECKS += [(node, "test_gecx_bidi_bridge.mjs"), (node, "test_widget_resolution.mjs")]
else:
    print("note: node not found, skipping the two .mjs checks")

failed = []
for exe, name in CHECKS:
    r = subprocess.run([exe, os.path.join(HERE, name)], capture_output=True, text=True, encoding="utf-8", errors="replace")
    last = [ln for ln in (r.stdout + r.stderr).strip().splitlines() if ln.strip()][-1:] or [""]
    print(("ok    " if r.returncode == 0 else "FAIL  ") + name.ljust(30) + last[0][:80])
    if r.returncode:
        failed.append(name)
print("\nALL CHECKS PASS" if not failed else "\nFAILED: " + ", ".join(failed))
sys.exit(1 if failed else 0)
