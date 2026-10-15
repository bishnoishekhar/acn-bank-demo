# Debug: RESOURCE_EXHAUSTED at PIN step (mortgage flow)

## Diagnosis (complete — via direct code inspection, not eval triage)
Root cause: L1->L2 auth deadlock in acn_mortgage_application (+19 other agents).
`acn_identity_security_hub` agent-tool defaults to TOOL_MIN_AUTH required=2,
but it is the tool that GRANTS L2 -> blocked forever -> unbounded model retry
-> ~19k tok/iteration x 6 guardrails x composite-v1 legs -> TPM quota death.

## Iteration Loop (from references/debug.md)
1. [x] Verify prerequisites
2. [x] Apply fixes 1-5  (155 callback files + app.json; syntax-clean)
3. [x] Lint (dispatch agents/lint-fixer.md) — NEVER run cxas lint on main thread
4. [ ] `cxas push` agent code  (USER DOES THIS — push promotes live traffic)
5. [~] Run evals + triage  (BLOCKED: app over 4 MB cap)

## Fixes
- [x] F1 acn_identity_security_hub: 0 in TOOL_MIN_AUTH (20 agents)
- [x] F2 STATE_MAP snake_case auth_level for verify_pin / verify_otp
- [x] F3 Declare 9 auth variables in app.json
- [x] F4 Classify mortgage's 21 unmapped tools (calculators/widgets -> L0/L1)
- [x] F5 Loop breaker on repeated AUTH_LEVEL_INSUFFICIENT

## Verification (A/B replay of the real callback logic)
Harness: scratchpad/sim/run_sim.py — execs the actual patched callback modules
with platform globals stubbed, replays mortgage -> identify -> PIN -> tools.

                                   PRE-FIX (git HEAD)      POST-FIX
  hub reachable at L1              BLOCKED (deadlock)      ALLOWED
  auth_state after correct PIN     level=1 mode=pin  <-BUG level=2 mode=pin
  7 mortgage tools post-PIN        7/7 BLOCKED             7/7 ALLOWED
  repeated block attempts          1..5 unbounded          aborts at 3 -> escalates

The pre-fix run reproduces the reported symptom exactly, including the
`level=1 / mode=pin` signature (PIN accepted, level never advanced).

## Round 2 — deadlock #2, alias hedge, prune (all verified)
- [x] F6 BT-1 exempt set omitted the identity hub in all 30 non-orchestrator
      agents -> hub also blocked at L0 before customer_id exists. Second
      deadlock, same shape. Pre-fix: BLOCKED. Post-fix: ALLOWED.
- [x] F7 agentTool resource-ID aliases (call_identity_hub/call_faq/call_cie)
      added alongside displayName keys — runtime form not determinable
      statically, so both map to the same level.
- [x] F8 Dead-code prune of all 155 callback files (7.06 -> 1.90 MB).
      APP TOTAL 8.02 -> 2.92 MB == UNDER THE 4 MB CAP.
- [x] F9 temperature 0.3 -> 1.0 (lint A010). NOT cosmetic: composite-v1 gets
      "deterministic acoustic repetition deadlocks" at low temp — a 4th path
      to the same runaway-retry symptom. Keep at 1.0.

## Lint: 179/41 -> 4 errors / 8 warnings / 1 info
87 of the original "179 errors" were a linter bug (schema.py::_resolve_paths
compares "agents/" against a backslash path). ALWAYS run as:
    cd agent/ACN_Bank_CES_Demo && cxas lint --app-dir . --json
All 13 remaining are deliberate (guardrail prompts = compliance sign-off,
V001 = confirmed false positive, V006 = platform stub, I006 = verbatim CDIC
disclosure + KBA decoys). Post-prune callback lint: 0 violations.

## Callback files are now GENERATED — do not hand-edit
Canonical: callbacks_src/ (16 variants) + manifest.json -> 155 paths.
    python scripts/prune_callbacks.py --regenerate callbacks_src agent/ACN_Bank_CES_Demo

## Remaining (user's call)
4. [ ] cxas push  — USER ONLY; --create-version promotes live traffic
5. [~] Evals — now unblocked by the size fix, not yet run
