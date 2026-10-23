"""Put the test cases of a YAML file into an app, so they show up in the console (Evaluate > View test cases / Start a run).

  python scripts/push_evals.py --app sandbox                                  dry run: says what it would add or update, writes nothing
  python scripts/push_evals.py --app sandbox --apply                          adds / updates the tests (matched by name; nothing is deleted)
  python scripts/push_evals.py --app live --apply --yes                       the live app needs --yes as well
  python scripts/push_evals.py --file other.yaml --app sandbox --apply

Two file formats are understood:
  scenarios:      a simulated customer (task + user_facts) judged by plain-English expectations   (evals/acn_demo_scenarios.yaml)
  conversations:  the recorded "golden" format with user/agent turns                              (see .agents/skills/.../evals/goldens)

Why not `cxas push-eval`: it first lists every agent of the app, which is over gRPC's 4 MB limit for this app and crashes.
This only creates / updates evaluations (and the plain-English rules they use). It never changes agents, tools or app settings.
"""
import argparse
import os
import sys

import yaml

from cxas_scrapi.core.evaluations import Evaluations
from cxas_scrapi.utils.eval_utils import EvalUtils

APPS = {
    "sandbox": "projects/emvnzir-canada-song/locations/us/apps/ee1b7258-c8b9-4eb3-bba5-4a13e2c723c5",
    "live": "projects/emvnzir-canada-song/locations/us/apps/e29e31ff-b686-46c8-8f02-f431f1422f1d",
}
DEFAULT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "evals", "acn_demo_scenarios.yaml")


class DryClient:
    """Stands in for the real client on a dry run: no expectation resources get created."""

    def find_or_create_evaluation_expectation(self, llm_prompt, display_name=None):
        return "(rule) " + llm_prompt[:60]


class AgentNames(dict):
    """Agent display name -> full resource name, without listing the agents (that answer is over gRPC's 4 MB limit)."""

    def __init__(self, app):
        super().__init__()
        self.app = app

    def get(self, name, default=None):
        return name if str(name).startswith("projects/") else f"{self.app}/agents/{name}"


def scenarios_from_yaml(data, client):
    out = []
    for s in data["scenarios"]:
        rules = [client.find_or_create_evaluation_expectation(llm_prompt=p) for p in s.get("expectations", [])]
        out.append({
            "displayName": s["name"],
            "tags": s.get("tags", []),
            "scenario": {
                "task": " ".join(str(s["task"]).split()),
                "userFacts": [{"name": k, "value": str(v)} for k, v in (s.get("user_facts") or {}).items()],
                "maxTurns": int(s.get("max_turns", 10)),
                "evaluationExpectations": rules,
                **({"userGoalBehavior": s["user_goal_behavior"]} if s.get("user_goal_behavior") else {}),
                **({"taskCompletionBehavior": s["task_completion_behavior"]} if s.get("task_completion_behavior") else {}),
            },
        })
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--app", default="sandbox", help="sandbox | live | full app resource name")
    ap.add_argument("--file", default=DEFAULT_FILE)
    ap.add_argument("--apply", action="store_true", help="really write (default is a dry run)")
    ap.add_argument("--yes", action="store_true", help="needed on top of --apply for the live app")
    a = ap.parse_args()

    app = APPS.get(a.app, a.app)
    if a.apply and app == APPS["live"] and not a.yes:
        print("The live app needs --yes as well as --apply. (It only adds test cases; agents are not touched.)")
        return 2

    client = Evaluations(app_name=app)
    writer = client if a.apply else DryClient()
    data = yaml.safe_load(open(a.file, encoding="utf-8"))
    if "scenarios" in data:
        evals = scenarios_from_yaml(data, writer)
    else:
        loader = object.__new__(EvalUtils)        # the normal constructor lists all agents (too big); the loader does not need them
        loader.app_name = app
        loader.eval_client = writer
        loader.agent_map = AgentNames(app)
        loader.tool_map = {}
        evals = loader.load_golden_evals_from_yaml(a.file)
    if not evals:
        print("No test cases found in", a.file)
        return 1

    existing = {e.display_name: e.name for e in client.list_evaluations(app)}
    print(f"app {app.split('/')[-1]}: {len(existing)} tests already there; file has {len(evals)} test case(s)")
    for e in evals:
        body = e.get("scenario") or e.get("golden")
        kind = "scenario" if e.get("scenario") else "golden  "
        rules = len(body.get("evaluationExpectations", []))
        print(f"  {'update' if e['displayName'] in existing else 'add   '} {kind} {e['displayName']}   ({rules} rules)")
        if a.apply:
            client.update_evaluation(evaluation=e, app_name=app)
    print("\ndone." if a.apply else "\nDRY RUN: nothing written. Add --apply to write.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
