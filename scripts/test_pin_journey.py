"""Offline check: one PIN per JOURNEY (a payment, an application), a new PIN for every new request.

usage: python scripts/test_pin_journey.py [path to agent/ACN_Bank_CES_Demo]
"""
import glob
import json
import os
import re
import sys
import time
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
    print(("PASS " if cond else "FAIL ") + name + ((" -> " + str(extra)[:260]) if (extra and not cond) else ""))


def load(agent, kind):
    ns = dict(G)
    exec(open(f"{ROOT}/agents/{agent}/{kind}_callbacks/{kind}_callbacks_01/python_code.py", encoding="utf-8").read(), ns)
    return ns


def fc(n, **a):
    return types.SimpleNamespace(name=n, args=a)


def ctx(said=None, state=None):
    uc = types.SimpleNamespace(parts=[types.SimpleNamespace(text=said)]) if said is not None else None
    return types.SimpleNamespace(state=state, user_content=uc)


def signed_in(**kw):
    st = {"customer_id": "CUST_DOC_1988", "customerId": "CUST_DOC_1988", "auth_level": "2",
          "auth_state": json.dumps({"level": "2", "mode": "pin", "customer_id": "CUST_DOC_1988"})}
    st.update(kw)
    return st


def with_pin(**kw):
    return signed_in(pin_grant_ts=str(time.time() - 5), **kw)


def reply(text=None, widget=None, **args):
    parts = []
    if text:
        parts.append(P(text=text))
    if widget:
        parts.append(P(function_call=fc(widget, payload=args or {"name": widget})))
    return LR(parts)


def blocked(bt, st, tool="manageCustomerDatabase_getBeneficiaries"):
    r = bt["_reauth_block"](st, tool, ctx("x", st))
    return isinstance(r, dict) and r.get("error") == "REAUTH_REQUIRED"


print("== a transfer: ONE PIN from the first payee list to the receipt")
bt, am, at = load("acn_payments", "before_tool"), load("acn_payments", "after_model"), load("acn_payments", "after_tool")
st = with_pin()
am["_consume_pin_grant"](st, reply("Let me show you your saved payees.", "acn-payee-selector"), ctx("I want to make a transfer to my brother", st))
chk("payee list shown -> PIN kept, journey open", st.get("pin_flow_open") == "1" and not st.get("pin_consumed_ts"), st)
chk("   the next account tool (get payees again) runs without a new PIN", not blocked(bt, st))
am["_consume_pin_grant"](st, reply("How much would you like to send?", "acn-amount-input"), ctx("Transfer to Raj Bishnoi", st))
chk("amount box shown -> PIN kept", st.get("pin_flow_open") == "1" and not st.get("pin_consumed_ts"), st)
am["_consume_pin_grant"](st, reply("Just to confirm: CAD 25.00 to Raj Bishnoi today. Is that right?", "quick_actions"), ctx("send 25", st))
chk("confirmation question -> PIN kept", st.get("pin_flow_open") == "1" and not st.get("pin_consumed_ts"), st)
chk("   'Yes' -> createTransaction is not asked for a PIN again", not blocked(bt, st, "createTransaction"))
at["after_tool_callback_impl"](types.SimpleNamespace(name="createTransaction"), {}, ctx(None, st), {"status": "success", "data": {"id": "TXN-1"}})
chk("the transfer went through -> journey marked done", st.get("pin_flow_done") == "1" and not st.get("pin_flow_open"), st)
am["_consume_pin_grant"](st, reply("Your transfer is done. Is there anything else I can help with?"), ctx("yes", st))
chk("final reply (even ending in a question) spends the PIN", bool(st.get("pin_consumed_ts")) and not st.get("pin_flow_open"), st)
chk("the NEXT request needs a NEW PIN", blocked(bt, st, "manageCustomerDatabase_getAccounts"))

print("== a one-off view still asks again for the next request")
bt, am = load("acn_banking_hub", "before_tool"), load("acn_banking_hub", "after_model")
st = with_pin()
am["_consume_pin_grant"](st, reply("Your balance is $3,842.17. Would you like to pay your Enbridge bill now?", "acn-insight-card"), ctx("check my balance", st))
chk("balance answered (banking hub, ends in a question) -> PIN spent", bool(st.get("pin_consumed_ts")), st)
chk("   'now make a payment' -> asked for the PIN again", blocked(bt, st, "createTransaction"))
st = with_pin()
am["_consume_pin_grant"](st, reply("You can afford about $571,000."), ctx("what can I afford", st))
chk("plain answer -> PIN spent", bool(st.get("pin_consumed_ts")), st)

print("== a confirmation question keeps the PIN in ANY agent (bill payment: 'Shall I go ahead?')")
st = with_pin()
am["_consume_pin_grant"](st, reply("To confirm, pay CAD 187.40 to Enbridge Gas from your chequing account. Shall I go ahead?", "quick_actions"), ctx("pay the bill", st))
chk("confirm question -> kept", st.get("pin_flow_open") == "1" and not st.get("pin_consumed_ts"), st)

print("== walking away ends the journey")
bt, am = load("acn_payments", "before_tool"), load("acn_payments", "after_model")
for said in ("No, cancel that", "never mind", "no", "stop", "that's all, thanks"):
    st = with_pin(pin_flow_open="1", pin_flow_ts=str(time.time()))
    am["_consume_pin_grant"](st, reply("No problem. Is there anything else I can help with?"), ctx(said, st))
    chk(f"customer says '{said}' -> PIN spent", bool(st.get("pin_consumed_ts")) and not st.get("pin_flow_open"), st)

print("== time limits")
now = time.time()
st = signed_in(pin_grant_ts=str(now - 400), pin_flow_open="1", pin_flow_ts=str(now - 60))
chk("PIN 400 s old, journey active a minute ago -> still good", not blocked(bt, st))
st = signed_in(pin_grant_ts=str(now - 400), pin_flow_open="1", pin_flow_ts=str(now - 240))
chk("journey idle for 4 minutes -> new PIN", blocked(bt, st))
st = signed_in(pin_grant_ts=str(now - 1000), pin_flow_open="1", pin_flow_ts=str(now - 5))
chk("one PIN never covers more than 15 minutes", blocked(bt, st))
st = signed_in(pin_grant_ts=str(now - 400))
chk("no journey open: the old 5-minute rule applies", blocked(bt, st))
st = with_pin(pin_flow_open="1", pin_flow_ts=str(now - 100), pin_flow_done="1")
st["pin_grant_ts"] = str(now - 400)
chk("a finished journey does not keep the PIN alive", blocked(bt, st))

print("== a multi-turn application (journey agents): a question does not cost a second PIN")
for agent in ("acn_account_opening", "acn_loans_epp", "acn_mortgage_application", "acn_card_management", "acn_credit_cards"):
    am = load(agent, "after_model")
    st = with_pin()
    am["_consume_pin_grant"](st, reply("I have your mobile, email and address on file. Has anything changed?"), ctx("I'm already a customer", st))
    chk(f"{agent}: a question mid-journey -> PIN kept", st.get("pin_flow_open") == "1" and not st.get("pin_consumed_ts"), st)
for agent in ("acn_banking_hub", "acn_accounts_insights", "acn_rewards_loyalty", "acn_investments_registered", "acn_lead_orchestrator", "acn_products_hub"):
    am = load(agent, "after_model")
    st = with_pin()
    am["_consume_pin_grant"](st, reply("Here are your holdings. Would you like more detail?"), ctx("show my holdings", st))
    chk(f"{agent}: a view that ends with a question -> PIN spent", bool(st.get("pin_consumed_ts")), st)

print("== a tool call in the same reply never spends the PIN")
am = load("acn_payments", "after_model")
st = with_pin()
am["_consume_pin_grant"](st, LR([P(function_call=fc("manageCustomerDatabase_getBeneficiaries"))]), ctx("transfer", st))
chk("still working (tool call) -> nothing spent", not st.get("pin_consumed_ts"), st)

print("== after the PIN the model is told what the request was (no stall)")
for agent in ("acn_payments", "acn_banking_hub", "acn_loans_epp"):
    bt, at = load(agent, "before_tool"), load(agent, "after_tool")
    st = signed_in()
    bt["_reauth_block"](st, "manageCustomerDatabase_getBeneficiaries", ctx("Okay, now continue with the transfer to my brother", st))
    chk(f"{agent}: the request that needed the PIN is remembered", st.get("reauth_request") == "Okay, now continue with the transfer to my brother", st)
    bt["_reauth_block"](st, "manageCustomerDatabase_getBeneficiaries", ctx("2244", st))
    chk(f"{agent}: a typed PIN never replaces it", st.get("reauth_request", "").startswith("Okay, now continue"), st.get("reauth_request"))
    ts = time.time()
    out = at["_harvest_identity_hub"]({"data": {"response": f"verified [[AUTH_RESULT customer_id=CUST_DOC_1988 auth_level=2 auth_mode=pin identified_by=phone pin_verified_at={ts}]]"}}, st, "PIN entered 2244. Re-verify PIN for this request.")
    txt = json.dumps(out)
    chk(f"{agent}: the hub's answer carries the request and 'carry on'", "continue with the transfer to my brother" in txt and "Carry on" in txt and "AUTH_RESULT" not in txt, txt)
    chk(f"{agent}: the reminder is used once", not st.get("reauth_request") and not st.get("pin_flow_open") and not st.get("pin_flow_done"), st)
st = signed_in()
out = at["_harvest_identity_hub"]({"data": {"response": "ok [[AUTH_RESULT customer_id=CUST_DOC_1988 auth_level=2 pin_verified_at=-]]"}}, st, "x")
chk("no fresh PIN -> no reminder added", "Carry on" not in json.dumps(out), out)

print("== a fresh PIN starts a clean journey")
at = load("acn_payments", "after_tool")
st = signed_in(pin_flow_open="1", pin_flow_done="1", pin_flow_ts=str(time.time()))
at["_harvest_identity_hub"]({"data": {"response": f"x [[AUTH_RESULT customer_id=CUST_DOC_1988 auth_level=2 pin_verified_at={time.time()}]]"}}, st, "x")
chk("flags reset when a new PIN is verified", not st.get("pin_flow_open") and not st.get("pin_flow_done"), st)

print("== a cancel plus a NEW request in one message does not reuse the journey's PIN")
bt = load("acn_payments", "before_tool")
for said in ("Actually, I've changed my mind. I'd like to cancel that transfer, please. Could you just show me my account balance one more time instead?",
             "cancel that and show my balance", "never mind, what's my balance", "no thanks, show me my accounts instead"):
    st = with_pin(pin_flow_open="1", pin_flow_ts=str(time.time()))
    r = bt["_reauth_block"](st, "manageCustomerDatabase_getAccounts", ctx(said, st))
    chk(f"'{said[:48]}...' -> the balance needs a NEW PIN", isinstance(r, dict) and r.get("error") == "REAUTH_REQUIRED", r)
    chk("   ...and the journey is closed", not st.get("pin_flow_open") and bool(st.get("pin_consumed_ts")), st)
for said in ("send 25", "Transfer to Raj Bishnoi", "Yes, set it", "I don't mind the fee, send 25"):
    st = with_pin(pin_flow_open="1", pin_flow_ts=str(time.time()))
    r = bt["_reauth_block"](st, "manageCustomerDatabase_getBeneficiaries", ctx(said, st))
    chk(f"'{said}' keeps the journey's PIN", r is None, r)
st = with_pin()
r = bt["_reauth_block"](st, "manageCustomerDatabase_getAccounts", ctx("cancel", st))
chk("no journey open: the plain one-request PIN is unaffected by the word cancel", r is None, r)

print("== every agent that has the PIN gate carries the new logic")
bad, journey = [], []
for f in sorted(glob.glob(f"{ROOT}/agents/*/after_model_callbacks/*/python_code.py")):
    agent = f.replace("\\", "/").split("agents/")[1].split("/")[0]
    s = open(f, encoding="utf-8").read()
    if "def _consume_pin_grant" not in s:
        continue
    b = open(f.replace("after_model", "before_tool"), encoding="utf-8").read()
    a = open(f.replace("after_model", "after_tool"), encoding="utf-8").read()
    if "_pin_journey_continues" not in s or "_PIN_FLOW_IDLE_SECONDS" not in b or "_reauth_remember_request" not in b or "pin_flow_done" not in a:
        bad.append(agent)
    if "_PIN_JOURNEY_AGENT = True" in s:
        journey.append(agent)
chk("28 agents carry the journey logic", not bad, bad)
chk("only the multi-turn agents treat a question as 'journey goes on'", sorted(journey) == sorted(["acn_payments", "acn_payee_management", "acn_account_opening", "acn_card_management", "acn_loans_epp",
    "acn_mortgage_application", "acn_credit_cards", "acn_cc_credit_decision", "acn_cc_kyc", "acn_cc_verification", "acn_cheque_services", "acn_pad_management", "acn_foreign_exchange"]), journey)

print("\nALL PASS" if ok else "\nSOME FAILED")
sys.exit(0 if ok else 1)
