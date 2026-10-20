"""Offline check: the loan / mortgage cards come with their numbers said out loud (text and voice).

usage: python scripts/test_figures.py [path to agent/ACN_Bank_CES_Demo]
"""
import json
import os
import sys
import types

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "agent", "ACN_Bank_CES_Demo")


class P:
    def __init__(s, text=None, function_call=None):
        s.text = text
        s.function_call = function_call

    @staticmethod
    def from_text(text):
        return P(text=text)


class C:
    def __init__(s, parts):
        s.parts = parts


class LR:
    def __init__(s, parts):
        s.content = C(parts)

    @staticmethod
    def from_parts(parts):
        return LR(list(parts))


G = dict(CallbackContext=object, Content=object, Part=P, LlmResponse=LR, LlmRequest=object, Tool=object)
ok = True


def chk(name, cond, extra=""):
    global ok
    ok &= bool(cond)
    print(("PASS " if cond else "FAIL ") + name + ((" -> " + str(extra)[:300]) if (extra and not cond) else ""))


def load(agent, kind):
    ns = dict(G)
    exec(open(f"{ROOT}/agents/{agent}/{kind}_callbacks/{kind}_callbacks_01/python_code.py", encoding="utf-8").read(), ns)
    return ns


def fc(n, **a):
    return types.SimpleNamespace(name=n, args=a)


def say(state):
    return json.loads(state.get("spoken_summary", "") or "{}").get("text", "")


VOICE = {"_session": json.dumps({"modality": "VOICE", "channel": "WEB_UI"})}
TEXT = {"_session": json.dumps({"modality": "TEXT", "channel": "WEB_UI"})}
ctx = lambda st: types.SimpleNamespace(state=st, user_content=None)
tool = lambda n: types.SimpleNamespace(name=n)

# The real result of mortgage_affordability_estimate for a 120,000 income and 80,000 down (as seen live)
AFFORD = {"status": "success", "affordable": True, "max_purchase_price_cad": 571000.0, "max_mortgage_cad": 506000.0, "loan_principal_cad": 491000.0,
          "down_payment_cad": 80000.0, "contract_rate_pct": 4.09, "contract_payment_cad": 2687.58, "qualifying_rate_pct": 6.09,
          "stress_test_gap_cad": 578.39, "gross_monthly_income_cad": 10000.0, "amortization_years": 25.0, "binding_constraint": "gds"}
PAYMENT = {"status": "success", "payment_per_period_cad": 2680.43, "payment_frequency_label": "Monthly", "interest_rate_pct": 4.5, "total_mortgage_cad": 480000.0,
           "down_payment_cad": 120000.0, "amortization_years_actual": 25.0, "total_interest_cad": 324000.0}
LOAN = {"status": "success", "monthly_payment": 466.37, "total_interest": 1789.32, "total_cost": 16789.32}

print("== after_tool builds the sentence from the tool's own figures")
for agent in ("acn_mortgage_application", "acn_loans_epp"):
    at = load(agent, "after_tool")
    st = {}
    at["_remember_result_summary"]("mortgage_affordability_estimate", {}, {"status": "success", "code": "OK", "data": AFFORD}, st)
    t = say(st)
    if agent == "acn_mortgage_application":
        chk(f"{agent}: affordability says the price, payment and stress-test gap",
            all(x in t for x in ("$120,000 a year", "$80,000 down", "$571,000", "$2,688 a month", "4.09%", "6.09%", "$578")) and "not an approval" in t, t)
        st = {}
        at["_remember_result_summary"]("mortgage_payment_estimate", {"property_price_cad": 600000.0}, {"status": "success", "data": PAYMENT}, st)
        t = say(st)
        chk(f"{agent}: payment estimate says price, down payment, rate, payment, years and interest",
            all(x in t for x in ("$600,000 home", "$120,000 down", "4.5%", "monthly payment", "$2,680.43", "$480,000", "25 years", "$324,000")), t)
        st = {}
        at["_remember_result_summary"]("mortgage_affordability_estimate", {}, {"status": "success", "data": {"status": "success", "affordable": False, "max_purchase_price_cad": 0.0}}, st)
        chk(f"{agent}: 'not affordable' is said honestly, without a price", "not within reach" in say(st) and "$" not in say(st), say(st))
    st = {}
    at["_remember_result_summary"]("calculate_loan_payment", {"principal": 15000, "annual_rate": 7.49, "term_months": 36}, {"status": "success", "data": LOAN}, st)
    t = say(st)
    chk(f"{agent}: loan says amount, term, rate, monthly payment and total interest",
        all(x in t for x in ("$15,000 loan", "36 months", "7.49%", "$466.37 a month", "$1,789")), t)
    st = {}
    at["_remember_result_summary"]("calculate_loan_payment", {"principal": 15000, "annual_rate": 7.49, "term_months": 36}, {"status": "validation_error", "data": {}}, st)
    chk(f"{agent}: a failed calculation says nothing", not say(st), st)
    st = {}
    at["_remember_result_summary"]("manageCustomerDatabase_getAccounts", {}, {"status": "success", "data": {}}, st)
    chk(f"{agent}: other tools untouched", not say(st), st)

print("== the real after_tool callback stores it")
at = load("acn_loans_epp", "after_tool")
st = {"customer_id": "CUST_DOC_1988", "auth_level": "2"}
at["after_tool_callback_impl"](tool("calculate_loan_payment"), {"principal": 15000, "annual_rate": 7.49, "term_months": 36}, ctx(st), dict(LOAN))
chk("acn_loans_epp: calculate_loan_payment through the whole callback leaves the sentence in state", "$466.37 a month" in say(st), st)

print("== text channel: the figures go in front of the card; no double speaking")
for agent, widget, fig in (("acn_mortgage_application", "mortgage_affordability", "$571,000"), ("acn_mortgage_application", "mortgage_calculator", "$2,680.43"),
                           ("acn_loans_epp", "loan_preapproval", "$466.37")):
    am = load(agent, "after_model")
    st = dict(TEXT)
    SENTENCE = {"$571,000": "you could afford a home up to about $571,000.", "$2,680.43": "your monthly payment would be about $2,680.43.",
                "$466.37": "works out to about $466.37 a month."}
    st["spoken_summary"] = json.dumps({"text": SENTENCE[fig], "ts": __import__("time").time()})
    r = am["_ensure_spoken_with_widget"](st, LR([P(text="Let me show you what you could afford."), P(function_call=fc(widget, payload={"name": widget}))]))
    txt = [p.text for p in r.content.parts if p.text] if r else []
    chk(f"{agent}/{widget}: model said only 'let me show you' -> the figures are added first", bool(txt) and fig in txt[0] and txt[1].startswith("Let me show you"), txt)
    chk(f"{agent}/{widget}: the widget call is still there", r is not None and any(p.function_call is not None for p in r.content.parts))
    chk(f"{agent}/{widget}: the sentence is used once", not st.get("spoken_summary"), st)
    st2 = dict(TEXT)
    st2["spoken_summary"] = json.dumps({"text": "your monthly payment would be about $9.", "ts": __import__("time").time()})
    r = am["_ensure_spoken_with_widget"](st2, LR([P(text="That works out to about $1,234 a month."), P(function_call=fc(widget, payload={"name": widget}))]))
    chk(f"{agent}/{widget}: the model already said the figures -> nothing is added", r is None, r)
    st4 = dict(TEXT)
    st4["spoken_summary"] = json.dumps({"text": SENTENCE[fig], "ts": __import__("time").time()})
    r = am["_ensure_spoken_with_widget"](st4, LR([P(function_call=fc(widget, payload={"name": widget}))]))
    txt = [p.text for p in r.content.parts if p.text] if r else []
    chk(f"{agent}/{widget}: the model said NOTHING -> the figures, then the usual next question", len(txt) == 1 and fig in txt[0] and txt[0].endswith("?"), txt)
    st3 = dict(TEXT)
    r = am["_ensure_spoken_with_widget"](st3, LR([P(text="Let me show you."), P(function_call=fc(widget, payload={"name": widget}))]))
    chk(f"{agent}/{widget}: no sentence available -> the reply is left as it is", r is None, r)

print("== voice: the speak-first gate makes the model say it before the card")
am = load("acn_mortgage_application", "after_model")
bt = load("acn_mortgage_application", "before_tool")
st = dict(VOICE)
st["spoken_summary"] = json.dumps({"text": "you could afford a home up to about $571,000.", "ts": __import__("time").time()})
am["_arm_speak_first"](st, LR([P(text="Let me show you what you could afford."), P(function_call=fc("mortgage_affordability", payload={"name": "mortgage_affordability"}))]))
chk("voice: pacing line only -> gate armed", str(st.get("speak_gate", "")).startswith("silent:"), st.get("speak_gate"))
blk = bt["_speak_first_block"](st, "mortgage_affordability")
chk("voice: the card call is turned back with the exact sentence to say", isinstance(blk, dict) and blk.get("error") == "SPEAK_FIRST" and "$571,000" in blk.get("message", ""), blk)
st = dict(VOICE)
st["spoken_summary"] = json.dumps({"text": "you could afford about $571,000.", "ts": __import__("time").time()})
am["_arm_speak_first"](st, LR([P(text="You could afford about $571,000. Want to see rates?"), P(function_call=fc("mortgage_affordability", payload={"name": "mortgage_affordability"}))]))
chk("voice: the model already said the figures -> not gated", not st.get("speak_gate"), st.get("speak_gate"))

print("== every other agent is unchanged")
import glob
changed = [f for f in glob.glob(f"{ROOT}/agents/*/after_tool_callbacks/*/python_code.py") if "_remember_result_summary" in open(f, encoding="utf-8").read()]
chk("only the loan and mortgage agents carry the new helper", sorted(os.path.basename(os.path.dirname(os.path.dirname(os.path.dirname(f)))) for f in changed) == ["acn_loans_epp", "acn_mortgage_application"], changed)

print("\nALL PASS" if ok else "\nSOME FAILED")
sys.exit(0 if ok else 1)
