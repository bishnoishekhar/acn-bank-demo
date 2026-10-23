"""Offline security checks for the agent tools and callbacks (no network, no Firestore).

usage: python scripts/test_security.py [path to agent/ACN_Bank_CES_Demo]

Covers: identify_customer never guesses an unknown identifier into a customer, verify_pin has no default PIN and locks after
three wrong tries, and a travel notice is only written after the customer said yes to a read-back.
"""
import glob
import json
import os
import re
import sys
import time
import types

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "agent", "ACN_Bank_CES_Demo")
ok = True


def chk(name, cond, extra=""):
    global ok
    ok &= bool(cond)
    print(("PASS " if cond else "FAIL ") + name + ((" -> " + str(extra)[:240]) if (extra and not cond) else ""))


def load_tool(tool, fn):
    """Run a CES python tool with a dict standing in for the session variables."""
    variables = {}
    ns = {"get_variable": lambda k, d=None: variables.get(k, d), "set_variable": lambda k, v: variables.__setitem__(k, v)}
    exec(open(f"{ROOT}/tools/{tool}/python_function/python_code.py", encoding="utf-8").read(), ns)
    return ns[fn], variables


print("== identify_customer: unknown identifiers are not guessed into a customer")
ident, v = load_tool("identify_customer", "identify_customer")
r = ident("phone", "(416) 555-1234")
chk("the demo number identifies the demo customer", r.get("status") == "success" and v.get("customer_id") == "CUST_DOC_1988", r)
chk("...and is not the shared phone", v.get("identified_shared_phone") == "false", v)
for label, args in [("unknown phone", ("phone", "6475550000")), ("unknown caller id", ("caller_id", "+19995550000")),
                    ("unknown email", ("email", "nobody@example.com")), ("unknown web sign-in", ("webchat_sso", "someone-else")),
                    ("unknown whatsapp id", ("wa_id", "15550001111")), ("card + dob + postal (no lookup behind it)", ("card_dob_postal", "4111111111111111|1990-01-01|M5V1A1"))]:
    ident2, v2 = load_tool("identify_customer", "identify_customer")
    r = ident2(*args)
    chk(f"{label}: CUSTOMER_NOT_FOUND, nobody identified", r.get("code") == "CUSTOMER_NOT_FOUND" and not v2.get("customer_id") and not v2.get("auth_level"), (r, v2))
ident3, v3 = load_tool("identify_customer", "identify_customer")
r = ident3("email", "John.Doe@Example.com")
chk("a known email still matches, whatever its case", r.get("status") == "success" and v3.get("customer_id") == "6oq3lBNGOFWfqOamn9ob", (r, v3))
ident4, v4 = load_tool("identify_customer", "identify_customer")
ident4("phone", "217-858-2973")
chk("the shared demo mobile is flagged", v4.get("identified_shared_phone") == "true", v4)
r = ident4("phone", "")
chk("an empty identifier is refused", r.get("code") == "MISSING_PARAMS", r)

print("== verify_pin: no default PIN, 3 wrong tries lock")
vp, vv = load_tool("verify_pin", "verify_pin")
vv.update({"auth_level": "1", "identified_shared_phone": "false"})
r = vp("CUST_DOC_1988", "2244")
chk("the right PIN verifies", r["verified"] is True and vv.get("auth_level") == "2" and vv.get("pin_verified_at"), r)
for label, cid, pin in [("an id with no PIN on file + the old default 2244", "CUST-NOT-IN-LIST", "2244"), ("the same id + 1234", "CUST-NOT-IN-LIST", "1234"),
                        ("masked asterisks with no digits", "CUST_DOC_1988", "****"), ("an empty PIN", "CUST_DOC_1988", ""), ("a wrong PIN", "CUST_DOC_1988", "0000")]:
    vp2, vv2 = load_tool("verify_pin", "verify_pin")
    vv2.update({"auth_level": "1", "identified_shared_phone": "false"})
    r = vp2(cid, pin)
    chk(f"refused: {label}", r["verified"] is False and vv2.get("auth_level") == "1", (r, vv2))
vp3, vv3 = load_tool("verify_pin", "verify_pin")
vv3.update({"auth_level": "1", "identified_shared_phone": "false"})
r = vp3("CUST_DOC_1988", "1234")
chk("1234 does not turn CUST_DOC_1988 into CUST_DOC_7777 on an ordinary number", r["verified"] is False and vv3.get("customer_id") in (None, ""), (r, vv3))
vp4, vv4 = load_tool("verify_pin", "verify_pin")
vv4.update({"auth_level": "1", "identified_shared_phone": "true"})
r = vp4("CUST_DOC_1988", "1234")
chk("on the shared mobile, 1234 does identify CUST_DOC_7777", r["verified"] is True and r["customer_id"] == "CUST_DOC_7777", r)
vp5, vv5 = load_tool("verify_pin", "verify_pin")
vv5.update({"auth_level": "1", "identified_shared_phone": "false"})
codes = [vp5("CUST_DOC_1988", "0000") for _ in range(3)]
chk("attempts_left counts down 2, 1, 0 and the third wrong try reports locked", [c["attempts_left"] for c in codes] == [2, 1, 0] and codes[-1]["locked"] is True, codes)
r = vp5("CUST_DOC_1988", "2244")
chk("after three wrong tries even the right PIN is refused (PIN_LOCKED)", r.get("code") == "PIN_LOCKED" and r["verified"] is False and vv5.get("auth_level") == "1", (r, vv5))
vp6, vv6 = load_tool("verify_pin", "verify_pin")
vv6.update({"auth_level": "1", "identified_shared_phone": "false"})
vp6("CUST_DOC_1988", "0000"); vp6("CUST_DOC_1988", "0000")
r = vp6("CUST_DOC_1988", "2244")
chk("a right PIN after two wrong ones works and resets the count", r["verified"] is True and vv6.get("pin_attempts") == "0", (r, vv6))

print("== travel notice needs a spoken yes after a read-back (every agent)")
G = dict(CallbackContext=object, Content=object, Part=object, LlmResponse=object, LlmRequest=object, Tool=object)


def ctx(state, said=None):
    uc = types.SimpleNamespace(parts=[types.SimpleNamespace(text=said)]) if said is not None else None
    return types.SimpleNamespace(state=state, user_content=uc)


def run(impl, name, inp, state, said=None):
    return impl(types.SimpleNamespace(name=name), inp, ctx(state, said))


bad = []
files = sorted(glob.glob(f"{ROOT}/agents/*/before_tool_callbacks/*/python_code.py"))
for f in files:
    s = open(f, encoding="utf-8").read()
    reg = json.loads(re.search(r"_FSW_REGISTRY = json\.loads\('''(.*?)'''\)", s, re.S).group(1))
    if reg["update_customer_api_db_updateCard"].get("confirm_fields") != ["travelNotice"] or "_fsw_confirm = _confirm_block(" not in s:
        bad.append(f.replace("\\", "/").split("agents/")[1].split("/")[0])
chk(f"all {len(files)} before_tool files carry the confirmation gate", not bad, bad)

ns = dict(G)
exec(open(f"{ROOT}/agents/acn_card_management/before_tool_callbacks/before_tool_callbacks_01/python_code.py", encoding="utf-8").read(), ns)
impl = ns["before_tool_callback_impl"]
signed = {"customer_id": "CUST_DOC_1988", "auth_level": "2", "auth_state": json.dumps({"level": "2", "customer_id": "CUST_DOC_1988"})}
TN = {"customerId": "CUST_DOC_1988", "cardId": "CARD-1988-001", "travelNotice": {"countries": ["Japan"], "startDate": "2026-11-01", "endDate": "2026-11-10"}}


def fresh():
    st = dict(signed)
    st["pin_grant_ts"] = str(time.time())
    return st


st = fresh()
r1 = run(impl, "update_customer_api_db_updateCard", dict(TN), st, "set a travel notice for japan")
chk("first call is held back: CONFIRMATION_REQUIRED", isinstance(r1, dict) and r1.get("error") == "CONFIRMATION_REQUIRED", r1)
r2 = run(impl, "update_customer_api_db_updateCard", dict(TN), st, "set a travel notice for japan")
chk("same call in the same turn (no new customer message) is still held back", isinstance(r2, dict) and r2.get("error") == "CONFIRMATION_REQUIRED", r2)
r3 = run(impl, "update_customer_api_db_updateCard", dict(TN), st, "no, change the dates")
chk("a 'no / change' reply keeps it held back", isinstance(r3, dict) and r3.get("error") == "CONFIRMATION_REQUIRED", r3)
r4 = run(impl, "update_customer_api_db_updateCard", dict(TN), st, "Yes, set it")
chk("after a later 'yes' the same details go through the confirmation gate", not (isinstance(r4, dict) and r4.get("error") == "CONFIRMATION_REQUIRED"), r4)
st2 = fresh()
run(impl, "update_customer_api_db_updateCard", dict(TN), st2, "japan trip")
other = dict(TN, travelNotice={"countries": ["France"], "startDate": "2026-11-01", "endDate": "2026-11-10"})
r5 = run(impl, "update_customer_api_db_updateCard", other, st2, "yes")
chk("a 'yes' does not carry over to DIFFERENT details", isinstance(r5, dict) and r5.get("error") == "CONFIRMATION_REQUIRED", r5)
st3 = fresh()
r6 = run(impl, "update_customer_api_db_updateCard", {"customerId": "CUST_DOC_1988", "cardId": "CARD-1988-001", "status": "locked"}, st3, "lock my card")
chk("locking a card is not held back by the travel-notice gate", not (isinstance(r6, dict) and r6.get("error") == "CONFIRMATION_REQUIRED"), r6)

print("== a loan application needs a spoken yes after a read-back (a quote is not a yes)")
bad = []
for f in files:
    reg = json.loads(re.search(r"_FSW_REGISTRY = json\.loads\('''(.*?)'''\)", open(f, encoding="utf-8").read(), re.S).group(1))
    if reg["loan_applications_createLoanApplication"].get("confirm_fields") != ["amount"]:
        bad.append(f.replace("\\", "/").split("agents/")[1].split("/")[0])
chk(f"all {len(files)} before_tool files gate createLoanApplication", not bad, bad)
LOAN = {"type": "personal_loan", "amount": 15000, "term": 36, "purpose": "car"}
for agent in ("acn_loans_epp", "acn_mortgage_application"):
    ns = dict(G)
    exec(open(f"{ROOT}/agents/{agent}/before_tool_callbacks/before_tool_callbacks_01/python_code.py", encoding="utf-8").read(), ns)
    impl2 = ns["before_tool_callback_impl"]
    name = "loan_applications_createLoanApplication"
    st = fresh()
    r1 = run(impl2, name, dict(LOAN), st, "Check if I'm pre-approved for 15000 over 36 months")
    chk(f"{agent}: saving right after a quote request is held back (CONFIRMATION_REQUIRED)", isinstance(r1, dict) and r1.get("error") == "CONFIRMATION_REQUIRED", r1)
    chk(f"{agent}:    and the message talks about a loan, not about dates", "amount, term and purpose" in r1.get("message", "") and "Shall I go ahead" in r1.get("message", ""), r1)
    r2 = run(impl2, name, dict(LOAN), st, "Check if I'm pre-approved for 15000 over 36 months")
    chk(f"{agent}: the same call in the same turn (no new customer message) is still held back", isinstance(r2, dict) and r2.get("error") == "CONFIRMATION_REQUIRED", r2)
    r3 = run(impl2, name, dict(LOAN), st, "No, not yet, I want to think about it")
    chk(f"{agent}: a 'no' keeps it held back", isinstance(r3, dict) and r3.get("error") == "CONFIRMATION_REQUIRED", r3)
    r4 = run(impl2, name, dict(LOAN), st, "Yes, submit it")
    chk(f"{agent}: after a later 'yes' the same application goes through the gate", not (isinstance(r4, dict) and r4.get("error") == "CONFIRMATION_REQUIRED"), r4)
    st2 = fresh()
    run(impl2, name, dict(LOAN), st2, "I want a loan of 15000")
    r5 = run(impl2, name, dict(LOAN, amount=25000), st2, "yes")
    chk(f"{agent}: a 'yes' does not carry over to a DIFFERENT amount", isinstance(r5, dict) and r5.get("error") == "CONFIRMATION_REQUIRED", r5)
ns = dict(G)
exec(open(f"{ROOT}/agents/acn_mortgage_application/before_tool_callbacks/before_tool_callbacks_01/python_code.py", encoding="utf-8").read(), ns)
r6 = run(ns["before_tool_callback_impl"], "loan_applications_createLoanApplication", {"type": "mortgage_preapproval", "amount": 624000, "term": 25, "downPayment": 480000}, fresh(), "go on")
chk("a mortgage pre-approval request is held back the same way", isinstance(r6, dict) and r6.get("error") == "CONFIRMATION_REQUIRED", r6)
r7 = run(ns["before_tool_callback_impl"], "mortgage_payment_estimate", {"property_price_cad": 600000, "down_payment_cad": 120000, "interest_rate_pct": 4.5}, fresh(), "monthly payment?")
chk("the calculators are not held back", not (isinstance(r7, dict) and r7.get("error") == "CONFIRMATION_REQUIRED"), r7)

print("\nALL PASS" if ok else "\nSOME FAILED")
sys.exit(0 if ok else 1)
