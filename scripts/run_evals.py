"""Run CX Agent Studio evaluations (the same ones as the console's Evaluate tab) from the terminal and print what failed and why.

Why this exists: `cxas run` first lists every agent of the app, and for this app that answer is over gRPC's 4 MB limit, so it crashes
("Received message larger than max"). This script talks to the evaluation API directly and never lists the agents.

  python scripts/run_evals.py --app sandbox --tags golden_m5_auth            every test with that tag
  python scripts/run_evals.py --app sandbox --prefix tc_m5_                  every test whose name starts with tc_m5_
  python scripts/run_evals.py --app sandbox --names tc_m5_001_l1_caller_id_identification tc_m5_003_l2_pin_authentication_voice
  python scripts/run_evals.py --app sandbox --tags P0 --max 60               more than 25 tests needs --max (they use the same LLM quota as the web UI)
  python scripts/run_evals.py --app live --tags golden_m5_auth --modality audio

--app is `sandbox`, `live`, or a full projects/.../apps/... name. Tests run on the app's DRAFT (what is pushed there), not on a deployment.
Exit code 0 = every selected test passed, 1 = at least one failed or errored.
"""
import argparse
import json
import os
import sys
import time

from google.api_core import exceptions as gexc
from google.cloud import ces_v1beta as ces
from google.protobuf import json_format
from cxas_scrapi.core.evaluations import Evaluations

APPS = {
    "sandbox": "projects/emvnzir-canada-song/locations/us/apps/ee1b7258-c8b9-4eb3-bba5-4a13e2c723c5",
    "live": "projects/emvnzir-canada-song/locations/us/apps/e29e31ff-b686-46c8-8f02-f431f1422f1d",
}
LIVE_DEPLOYMENT = "b2abf514-25c0-4beb-9a04-87ccb714e213"      # the deployment the web UI uses
DEFAULT_LIMIT = 25      # more than this needs an explicit --max: each test is a whole conversation on the shared LLM quota
BATCH = 10              # tests per run request


def short(text, n=170):
    text = " ".join(str(text or "").split())
    return text if len(text) <= n else text[: n - 1] + "…"


def with_retry(fn, what):
    for attempt in range(6):
        try:
            return fn()
        except (gexc.ResourceExhausted, gexc.ServiceUnavailable, gexc.DeadlineExceeded) as e:
            wait = 20 * (attempt + 1)
            print(f"   ({what}: {type(e).__name__}, waiting {wait}s)")
            time.sleep(wait)
    return fn()


def chunk_text(resp):
    return " ".join((c.text or "") for c in (resp.chunks or []) if getattr(c, "text", ""))


def verdict(result, strict):
    """PASS / FAIL for one result. Scenarios are judged by their rules (strict=True uses the platform's own verdict, which also needs the
    simulated customer to have 'completed its task' and so flips from run to run when every rule passed)."""
    sc = result.scenario_result
    if not strict and sc.task and len(sc.evaluation_expectation_results):
        rules = [er.outcome.name for er in sc.evaluation_expectation_results]
        return "PASS" if all(x == "PASS" for x in rules) else "FAIL"
    return result.evaluation_status.name


def explain(result):
    """The reasons a result failed, as short lines."""
    lines = []
    g = result.golden_result
    for i, turn in enumerate(g.turn_replay_results, 1):
        for eo in turn.expectation_outcome:
            if eo.outcome.name != "FAIL":
                continue
            d = json_format.MessageToDict(type(eo).pb(eo))
            exp = d.get("expectation", {})
            note = exp.get("note", "")
            if exp.get("agentTransfer"):
                got = d.get("observedAgentTransfer", {}).get("displayName", "")
                lines.append(f"turn {i}: expected a hand-over to {exp['agentTransfer'].get('displayName')}"
                             + (f", but it went to {got}" if got else ", but there was no hand-over (the agent answered or asked something first)")
                             + (f"   [{note}]" if note else ""))
            elif d.get("observedAgentTransfer") and not exp:
                lines.append(f"turn {i}: an EXTRA hand-over to {d['observedAgentTransfer'].get('displayName')} that the recorded script does not have "
                             "(for example the hub passing the customer on to its specialist)")
            elif exp.get("agentResponse", {}).get("chunks"):
                lines.append(f"turn {i}: expected reply  {short(' '.join(c.get('text', '') for c in exp['agentResponse']['chunks']), 120)}")
                lines.append(f"        agent said       {short(chunk_text(eo.observed_agent_response), 120)}")
            elif exp.get("toolCall"):
                lines.append(f"turn {i}: expected tool call {exp['toolCall'].get('displayName')} (not called, or called differently)")
            else:
                lines.append(f"turn {i}: an expectation failed: {short(json.dumps(d), 200)}")
        sim = turn.semantic_similarity_result
        if sim.outcome.name == "FAIL":
            lines.append(f"turn {i}: meaning differs (score {sim.score}, {sim.label}): {short(sim.explanation, 200)}")
    for er in g.evaluation_expectation_results:
        if er.outcome.name == "FAIL":
            lines.append(f"rule failed: {short(er.prompt, 110)}")
            lines.append(f"   because:  {short(er.explanation, 220)}")
        elif er.outcome.name not in ("PASS", "SKIPPED"):
            lines.append(f"rule not scored ({er.outcome.name}): {short(er.prompt, 110)}")
    sc = result.scenario_result
    for er in sc.evaluation_expectation_results:
        if er.outcome.name == "FAIL":
            lines.append(f"rule failed: {short(er.prompt, 110)}")
            lines.append(f"   because:  {short(er.explanation, 240)}")
        elif er.outcome.name not in ("PASS", "SKIPPED"):
            lines.append(f"rule not scored ({er.outcome.name}): {short(er.prompt, 110)}")
    for ro in sc.rubric_outcomes:
        if ro.score < 1:
            lines.append(f"rubric not met: {short(ro.rubric, 110)}: {short(ro.score_explanation, 160)}")
    if sc.task and not sc.task_completed and not sc.evaluation_expectation_results:
        lines.append("the simulated customer did not finish its task in the allowed turns")
    if result.error_info and str(result.error_info).strip():
        lines.append("error: " + short(str(result.error_info), 220))
    return lines


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--app", default="sandbox", help="sandbox | live | full app resource name (default sandbox)")
    ap.add_argument("--tags", nargs="+", help="run tests that have ANY of these tags")
    ap.add_argument("--prefix", help="run tests whose name starts with this")
    ap.add_argument("--names", nargs="+", help="run these tests (exact names)")
    ap.add_argument("--skip-invalid", action="store_true", help="leave out tests the platform marks invalid (stale references)")
    ap.add_argument("--modality", choices=["text", "audio"], default="text")
    ap.add_argument("--golden-run-method", choices=["STABLE", "NAIVE"], default="STABLE")
    ap.add_argument("--max", type=int, default=DEFAULT_LIMIT, help=f"most tests to run in one go (default {DEFAULT_LIMIT})")
    ap.add_argument("--run-count", type=int, default=1, help="how many times to run each test (the platform's own default is 5 per scenario)")
    ap.add_argument("--version", help="run against a saved VERSION instead of the draft: a version id, a full version name, or 'deployed' "
                    "(the version the live web deployment serves, i.e. what customers get)")
    ap.add_argument("--list", action="store_true", help="only list what would run")
    ap.add_argument("--report", help="write the full results to this JSON file")
    ap.add_argument("--strict", action="store_true", help="use the platform's own verdict for scenarios too (it also needs the simulated customer to finish its task)")
    ap.add_argument("--details", type=int, default=12, help="how many failing tests to explain (default 12)")
    a = ap.parse_args()
    if not (a.tags or a.prefix or a.names):
        ap.error("choose what to run: --tags, --prefix or --names")

    app = APPS.get(a.app, a.app)
    ev = Evaluations(app_name=app)
    everything = list(ev.client.list_evaluations(request=ces.types.ListEvaluationsRequest(parent=app)))
    chosen = []
    for e in everything:
        if a.names and e.display_name in a.names:
            chosen.append(e)
        elif a.tags and set(a.tags) & set(e.tags):
            chosen.append(e)
        elif a.prefix and e.display_name.startswith(a.prefix):
            chosen.append(e)
    if a.names:
        missing = sorted(set(a.names) - {e.display_name for e in chosen})
        if missing:
            print("not found in this app:", ", ".join(missing))
    invalid = [e for e in chosen if e.invalid]
    if a.skip_invalid:
        chosen = [e for e in chosen if not e.invalid]
    chosen.sort(key=lambda e: e.display_name)
    print(f"app: {app.split('/')[-1]}  |  {len(everything)} tests in the app, {len(chosen)} selected"
          f"{'' if a.skip_invalid else f' ({len(invalid)} of them marked invalid)'}")
    if not chosen:
        return 1
    if len(chosen) > a.max:
        print(f"{len(chosen)} tests is more than --max {a.max}. Narrow it down, or pass --max {len(chosen)} if you really want all of them.")
        return 2
    if a.list:
        for e in chosen:
            print(("  invalid " if e.invalid else "          ") + e.display_name)
        return 0

    version = ""
    if a.version:
        if a.version == "deployed":
            from cxas_scrapi.core.deployments import Deployments
            version = Deployments(app_name=APPS["live"]).get_deployment(LIVE_DEPLOYMENT).app_version
        else:
            version = a.version if a.version.startswith("projects/") else f"{app}/versions/{a.version}"
        print("running against version:", version.split("/")[-1], "(not the draft)")
    rows, started = [], time.time()
    for i in range(0, len(chosen), BATCH):
        part = chosen[i:i + BATCH]
        req = ces.types.RunEvaluationRequest(app=app, evaluations=[e.name for e in part])
        req.golden_run_method = getattr(ces.types.GoldenRunMethod, a.golden_run_method)
        req.run_count = a.run_count
        if version:
            req.app_version = version
        if a.modality == "audio":
            req.config.evaluation_channel = ces.types.EvaluationConfig.EvaluationChannel.AUDIO
        print(f"running {len(part)} test(s) [{i + 1}-{i + len(part)}] ...")
        op = with_retry(lambda: ev.client.run_evaluation(request=req), "start")
        run_name = op.result(timeout=900).evaluation_run
        for _ in range(180):
            run = with_retry(lambda: ev.client.get_evaluation_run(name=run_name), "poll")
            if run.state.name not in ("RUNNING", "PENDING", "STATE_UNSPECIFIED") and len(run.evaluation_results) >= len(part) * a.run_count:
                break
            time.sleep(6)
        by_eval = {e.name: e for e in part}
        for rn in run.evaluation_results:
            r = with_retry(lambda: ev.client.get_evaluation_result(name=rn), "result")
            ename = rn.split("/results/")[0]
            rows.append((by_eval.get(ename), r))

    rows.sort(key=lambda x: x[0].display_name if x[0] else "")
    passed = sum(1 for _, r in rows if verdict(r, a.strict) == "PASS")
    print(f"\n{'RESULT':8} {'TEST':62} NOTE")
    for e, r in rows:
        note = "marked invalid (reference may be stale)" if e and e.invalid else ""
        if verdict(r, a.strict) != r.evaluation_status.name:
            note = (note + " ").lstrip() + f"(platform says {r.evaluation_status.name}: all rules passed but the simulated customer did not finish its task)"
        print(f"{verdict(r, a.strict):8} {(e.display_name if e else '?')[:62]:62} {note}")
    print(f"\n{passed}/{len(rows)} passed in {int(time.time() - started)}s  ({'version ' + version.split('/')[-1][:8] if version else 'app draft'}, modality {a.modality}, {a.golden_run_method})")

    shown = 0
    for e, r in rows:
        if verdict(r, a.strict) == "PASS" or shown >= a.details:
            continue
        shown += 1
        print(f"\n--- why {e.display_name if e else '?'} failed")
        for line in explain(r) or ["(no detail in the result)"]:
            print("   " + line)
    if sum(1 for _, r in rows if verdict(r, a.strict) != "PASS") > shown:
        print(f"\n(+ more failures; raise --details or open the report)")

    if a.report:
        os.makedirs(os.path.dirname(os.path.abspath(a.report)), exist_ok=True)
        json.dump([{"test": e.display_name if e else "?", "status": verdict(r, a.strict), "platform_status": r.evaluation_status.name, "invalid": bool(e and e.invalid), "why": explain(r)} for e, r in rows],
                  open(a.report, "w", encoding="utf-8"), indent=1)
        print("report written to", a.report)
    return 0 if passed == len(rows) else 1


if __name__ == "__main__":
    sys.exit(main())
