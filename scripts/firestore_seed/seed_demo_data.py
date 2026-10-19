"""Seed the EMPTY demo collections of acn-bank-fs-db so the CES agent has real answers instead of "not available".

  python seed_demo_data.py                 dry run: prints the plan and checks every target id is free (writes nothing)
  python seed_demo_data.py --apply         creates the documents (create-only: documentId + currentDocument.exists=false,
                                           so an existing document is NEVER overwritten; it is reported and skipped)
  python seed_demo_data.py --rollback F    deletes the documents listed in manifest F, only if they still carry demo_seed=true

Every document carries demo_seed=true. Values are DEMO values (rates, fees, hours, addresses are fictional).
Needs Application Default Credentials (gcloud auth application-default login).
"""
import json, sys, os, datetime, urllib.request, urllib.error
import google.auth, google.auth.transport.requests

PROJECT_DB = "projects/emvnzir-canada-song/databases/acn-bank-fs-db/documents"
BASE = "https://firestore.googleapis.com/v1/" + PROJECT_DB
CUST = "CUST_DOC_1988"          # the demo persona behind the login 4165551234 / PIN 2244
NOW = "2026-10-17T00:00:00Z"
TAG = {"demo_seed": True, "seeded_at": NOW}

# ----------------------------------------------------------------------------------------------- data
def fx():
    mid = {"USD": 1.3720, "EUR": 1.4890, "GBP": 1.7340, "AUD": 0.9020, "MXN": 0.0745, "JPY": 0.00915}
    out = []
    for ccy, m in mid.items():
        nd = 5 if ccy == "JPY" else 4
        out.append(("fx_rates", f"{ccy}_CAD", {
            "pair": f"{ccy}/CAD", "base_currency": ccy, "quote_currency": "CAD", "mid_rate": m,
            "buy_rate": round(m * 0.985, nd),      # ACN buys the foreign currency from the customer (customer sells)
            "sell_rate": round(m * 1.015, nd),     # ACN sells the foreign currency to the customer (customer buys)
            "indicative": True, "as_of": NOW,
            "note": f"CAD per 1 {ccy}. Indicative rate, subject to change."}))
    return out

def gic():
    rows = [(6, "6 months", 3.45), (12, "1 year", 3.80), (24, "2 years", 3.75), (36, "3 years", 3.70), (48, "4 years", 3.65), (60, "5 years", 3.65)]
    return [("gic_rates", f"GIC-{m}M", {
        "gic_id": f"GIC-{m}M", "term_months": m, "term_label": lbl, "rate_pct": r, "min_deposit_cad": 500, "currency": "CAD",
        "interest_paid": "at maturity", "redeemable": False, "registered_eligible": ["TFSA", "RRSP", "FHSA"],
        "cdic_eligible": True, "effective_date": "2026-10-01"}) for m, lbl, r in rows]

def products():
    P = [
        ("acn-everyday-chequing", "Everyday Chequing", "chequing", 14.95, "Fee waived with a $3,000 minimum monthly balance", None, 0,
         ["Unlimited debit transactions", "Interac e-Transfer", "Mobile cheque deposit", "Overdraft protection available"], 18),
        ("acn-student-chequing", "Student Chequing", "chequing", 0.0, "No monthly fee for full-time students", None, 0,
         ["Unlimited debit transactions", "Interac e-Transfer", "Mobile cheque deposit"], 16),
        ("acn-premium-chequing", "Premium Chequing", "chequing", 29.95, "Fee waived with a $7,500 minimum monthly balance", None, 0,
         ["Unlimited transactions", "Free ACN Bank cheques", "Preferred foreign exchange rates", "Travel medical insurance"], 18),
        ("acn-hisa", "High-Interest Savings", "savings", 0.0, "No monthly fee", 2.00, 0,
         ["4.50% promotional rate for the first 6 months on new deposits, then 2.00%", "No minimum balance", "Free transfers to your chequing account"], 18),
        ("acn-tfsa-savings", "TFSA Savings", "registered_savings", 0.0, "No monthly fee", 2.25, 0,
         ["Tax-free growth and withdrawals", "Contribution room tracked for you", "No minimum balance"], 18),
    ]
    return [("account_products", pid, {
        "product_id": pid, "name": name, "type": typ, "monthly_fee_cad": fee, "fee_waiver": waiver,
        "interest_rate_pct": rate, "min_opening_deposit_cad": dep, "features": feats, "currency": "CAD",
        "eligibility": {"min_age": age, "residency": "Canadian resident", "id_required": ["Government-issued photo ID", "Social Insurance Number"]},
        "cdic_eligible": True, "available_online": True}) for pid, name, typ, fee, waiver, rate, dep, feats, age in P]

BRANCHES = [
    {"branch_id": "BR-TOR-001", "name": "ACN Bank Toronto Financial District", "address": "100 King Street West", "city": "Toronto", "province": "ON",
     "postal_code": "M5X 1A9", "phone": "(416) 555-0141", "services": ["account_opening", "mortgage", "investments", "general"],
     "hours": {"mon_fri": "9:00 AM - 5:00 PM", "sat": "10:00 AM - 3:00 PM", "sun": "Closed"}, "atm": True, "safe_deposit_boxes": True},
    {"branch_id": "BR-MIS-001", "name": "ACN Bank Mississauga Square One", "address": "100 City Centre Drive", "city": "Mississauga", "province": "ON",
     "postal_code": "L5B 2C9", "phone": "(905) 555-0172", "services": ["account_opening", "mortgage", "general"],
     "hours": {"mon_fri": "9:30 AM - 5:30 PM", "sat": "10:00 AM - 4:00 PM", "sun": "Closed"}, "atm": True, "safe_deposit_boxes": False},
]

def slots():
    out = []
    for b in BRANCHES:
        for day in ("2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-26"):
            for start, end in (("10:00", "10:30"), ("14:00", "14:30")):
                sid = f"SLOT-{b['branch_id']}-{day.replace('-', '')}-{start.replace(':', '')}"
                out.append(("appointment_slots", sid, {
                    "slot_id": sid, "branch_id": b["branch_id"], "branch_name": b["name"], "date": day, "start_time": start, "end_time": end,
                    "duration_minutes": 30, "service_types": b["services"], "status": "available", "timezone": "America/Toronto"}))
    return out

FAQ_CATS = [("accounts", "Accounts & banking"), ("payments", "Payments & transfers"), ("cards", "Cards & rewards"),
            ("security", "Security & fraud"), ("borrowing", "Mortgages & loans"), ("fees", "Fees & overdraft")]
CDIC = " CDIC protects eligible deposits at member institutions up to $100,000 per depositor per insured category."
FAQS = [
    ("accounts", "How do I open a chequing account?", "You can open an Everyday Chequing account online, in the ACN Bank app or at any branch. You need to be 18 or older, a Canadian resident, and have government-issued photo ID and your Social Insurance Number. There is no minimum opening deposit." + CDIC, True, "open_account"),
    ("accounts", "What is the difference between a TFSA and an RRSP?", "With a TFSA, contributions are not tax-deductible but your growth and withdrawals are tax-free, and withdrawn room is added back the next year. With an RRSP, contributions reduce your taxable income now, and you pay tax when you withdraw. This is general information, not personalized financial advice.", False, ""),
    ("accounts", "Where can I find my statements and tax documents?", "Statements and tax slips are in online banking and the ACN Bank app under Documents. You can also ask for paper statements at any branch.", False, ""),
    ("accounts", "How do I update my address, phone number or email?", "You can update your contact details in the ACN Bank app under Profile. Some changes need an extra security check with your PIN, and I can help you with that.", True, "update_profile"),
    ("payments", "How do I pay a bill?", "Add the company as a payee, then choose the account to pay from, the amount and the date. I can set up and make the payment for you right now.", True, "pay_bill"),
    ("payments", "How long does an Interac e-Transfer take?", "Interac e-Transfers usually arrive within minutes once the recipient accepts them. New recipients may need an extra security check first.", True, "send_money"),
    ("payments", "How do I cancel a pre-authorized debit?", "Tell me which company it is, and I will confirm the details and cancel the authorization. You may still owe the company any outstanding balance, so it is a good idea to let them know too.", True, "cancel_pad"),
    ("cards", "What should I do if my card is lost or stolen?", "Tell me straight away. I will suspend the card immediately so no new purchases can go through, and then I can arrange a replacement.", True, "report_lost_card"),
    ("cards", "How do I activate my new card?", "You can activate a new card in the ACN Bank app under Cards, or ask me and I will show you how.", True, "activate_card"),
    ("cards", "How does ACN Rewards work?", "You earn 1 point for every dollar you spend and 3 points per dollar on travel and dining. 100 points is worth $1 when you redeem for statement credit, and I can check your balance any time.", True, "rewards_balance"),
    ("security", "How can I tell if a message from ACN Bank is genuine?", "ACN Bank will never ask for your PIN, password or one-time code by call, text or email. If someone does, do not share anything, hang up and call us at 1-800-ACN-BANK.", False, ""),
    ("security", "What if I forget my online banking password?", "I can send you a password reset link. Please open it only on a device you trust, and never share your password with anyone.", True, "password_reset"),
    ("borrowing", "What is the mortgage stress test?", "Federal rules require you to qualify at the higher of your contract rate plus 2% or the Bank of Canada benchmark rate, so you can still afford payments if rates rise. This is general information, not personalized financial advice.", True, "mortgage_affordability"),
    ("borrowing", "How do I get a mortgage pre-approval?", "I can estimate what you could afford and start a pre-approval with you. It needs your consent to a credit check, which can affect your credit score, and a few details about your income and down payment.", True, "mortgage_preapproval"),
    ("fees", "What does Everyday Chequing cost?", "Everyday Chequing is $14.95 a month, and the fee is waived when you keep a $3,000 minimum monthly balance.", False, ""),
    ("fees", "How do I avoid an NSF fee?", "An NSF fee applies when a payment is returned because there were not enough funds in the account. Keeping a buffer, turning on low-balance alerts or enrolling in overdraft protection can help, and I can check your overdraft settings.", True, "overdraft_help"),
]

def faq_docs():
    out = [("faq_categories", cid, {"category_id": cid, "name": name, "language": "en", "sort_order": i + 1}) for i, (cid, name) in enumerate(FAQ_CATS)]
    for i, (cat, q, a, act, intent) in enumerate(FAQS, 1):
        fid = f"FAQ-{i:03d}"
        out.append(("faqs", fid, {"faq_id": fid, "category": cat, "language": "en", "question": q, "answer": a,
                                  "keywords": sorted({w.strip("?,.").lower() for w in (q + " " + a).split() if len(w) > 5})[:12],
                                  "action_available": act, "intent_code": intent}))
    return out

def customer():
    c = f"customers/{CUST}"
    base = {"customer_id": CUST}
    d = []
    d.append((f"{c}/rewards", "balance", {**base, "program_name": "ACN Rewards", "tier": "Gold", "points_balance": 48250,
              "cash_value_cad": 482.50, "points_expiring_90_days": 0, "earn_rate": "1 point per $1; 3 points per $1 on travel and dining",
              "redemption_rate": "100 points = $1", "last_updated": NOW}))
    hist = [("2026-10-12", "earn", 128, "Loblaws groceries"), ("2026-10-05", "earn", 540, "Travel booking: ACN Travel Store (3x)"),
            ("2026-09-28", "earn", 90, "Shoppers Drug Mart"), ("2026-09-20", "redeem", -5000, "Statement credit $50.00"),
            ("2026-09-02", "earn", 1250, "Gold tier anniversary bonus"), ("2026-08-18", "earn", 312, "Dining (3x)")]
    for i, (dt, typ, pts, desc) in enumerate(hist, 1):
        d.append((f"{c}/rewards_history", f"RWH-1988-{i:03d}", {**base, "history_id": f"RWH-1988-{i:03d}", "date": dt, "type": typ, "points": pts, "description": desc}))
    d.append((f"{c}/intelligence", "segment", {**base, "segment": "mass_market", "life_stage_signal": "stable", "model_version": "nba-demo-v1",
              "scored_at": "2026-09-30T00:00:00Z", "marketing_opt_out": False}))
    d.append((f"{c}/intelligence", "next_best_actions", {**base, "model_version": "nba-demo-v1", "scored_at": "2026-09-30T00:00:00Z", "next_best_action": [
        {"id": "upgrade_credit_card", "priority": "1", "type": "product_offer", "eligible": True, "product_id": "acn-prestige-visa",
         "title": "Upgrade to ACN Prestige Visa", "description": "Based on your spending, you qualify for our Prestige Visa with better travel rewards"},
        {"id": "open_savings_account", "priority": "2", "type": "product_offer", "eligible": True, "product_id": "acn-hisa",
         "title": "Open a High-Interest Savings Account", "description": "Earn 4.5% interest on your savings"}]}))
    d.append((f"{c}/pads", "PAD-1988-001", {**base, "pad_id": "PAD-1988-001", "merchant_name": "Netflix Canada", "payee_name": "Netflix Canada", "amount": 20.99,
              "frequency": "monthly", "type": "fixed", "account_id": "ACC-1988-CHQ-001", "reference": "NF-CA-1988",
              "authorization_date": "2023-01-15", "next_debit_date": "2026-11-01", "status": "active"}))
    d.append((f"{c}/pads", "PAD-1988-002", {**base, "pad_id": "PAD-1988-002", "merchant_name": "Rogers Communications", "payee_name": "Rogers Communications", "amount": 98.50,
              "frequency": "monthly", "type": "fixed", "account_id": "ACC-1988-CHQ-001", "reference": "RG-1988-5521",
              "authorization_date": "2022-06-10", "next_debit_date": "2026-11-05", "status": "active"}))
    d.append((f"{c}/contribution_room", "summary", {**base, "tax_year": 2026, "tfsa_room_cad": 12400.00, "rrsp_room_cad": 25560.00,
              "fhsa_room_cad": 8000.00, "as_of": NOW}))
    d.append((f"{c}/investment_accounts", "INV-1988-TFSA", {**base, "account_id": "INV-1988-TFSA", "account_type": "TFSA", "nickname": "Tax-Free Savings",
              "balance": 41800.00, "currency": "CAD", "status": "active", "opened_date": "2020-02-10"}))
    d.append((f"{c}/investment_accounts", "INV-1988-RRSP", {**base, "account_id": "INV-1988-RRSP", "account_type": "RRSP", "nickname": "Retirement Savings",
              "balance": 86420.55, "currency": "CAD", "status": "active", "opened_date": "2019-09-01"}))
    for hid, acct, name, kind, val in [("HLD-1988-001", "INV-1988-TFSA", "ACN Canadian Equity Fund", "mutual_fund", 26100.00),
                                       ("HLD-1988-002", "INV-1988-TFSA", "ACN Global Bond Fund", "mutual_fund", 15700.00),
                                       ("HLD-1988-003", "INV-1988-RRSP", "ACN Dividend Growth Fund", "mutual_fund", 52000.00),
                                       ("HLD-1988-004", "INV-1988-RRSP", "ACN Balanced Portfolio", "mutual_fund", 34420.55)]:
        d.append((f"{c}/investment_holdings", hid, {**base, "holding_id": hid, "account_id": acct, "name": name, "type": kind, "market_value": val, "currency": "CAD", "as_of": NOW}))
    d.append((f"{c}/nsf_history", "NSF-1988-001", {**base, "nsf_id": "NSF-1988-001", "date": "2026-10-03", "fee_amount": 48.00, "returned_item": "Rogers Communications",
              "returned_amount": 215.40, "account_id": "ACC-1988-CHQ-001", "reversible": True, "status": "charged"}))
    return d

def all_docs():
    docs = fx() + gic() + products() + faq_docs() + slots() + customer()
    docs.append(("config", "branches", {"config_key": "branches", "branches": BRANCHES, "updated_at": NOW}))
    return [(p, i, {**f, **TAG}) for p, i, f in docs]

# ------------------------------------------------------------------------------------------------ http
def enc(v):
    if v is None: return {"nullValue": None}
    if isinstance(v, bool): return {"booleanValue": v}
    if isinstance(v, int): return {"integerValue": str(v)}
    if isinstance(v, float): return {"doubleValue": v}
    if isinstance(v, str): return {"stringValue": v}
    if isinstance(v, (list, tuple)): return {"arrayValue": {"values": [enc(x) for x in v]}}
    if isinstance(v, dict): return {"mapValue": {"fields": {k: enc(x) for k, x in v.items()}}}
    raise TypeError(type(v))

creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/datastore"])
creds.refresh(google.auth.transport.requests.Request())

def http(method, url, body=None):
    import time
    last = None
    for attempt in range(5):
        req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, method=method,
                                     headers={"Authorization": "Bearer " + creds.token, "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.status, json.loads(r.read() or b"null")
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode()[:300]
        except Exception as e:                       # network / TLS hiccup: retry, a create is safe to repeat (409 if it landed)
            last = repr(e)[:200]; time.sleep(2 * (attempt + 1))
    return 0, last

def main():
    args = sys.argv[1:]
    if "--rollback" in args:
        manifest = json.load(open(args[args.index("--rollback") + 1]))
        n = 0
        for path in manifest["created"]:
            s, r = http("GET", f"{BASE}/{path}")
            if s != 200: print("gone/unreadable", path, s); continue
            f = r.get("fields", {})
            if not f.get("demo_seed", {}).get("booleanValue"): print("NOT a seed doc, left alone:", path); continue
            s, _ = http("DELETE", f"{BASE}/{path}"); n += s == 200
            print("deleted" if s == 200 else f"delete failed {s}", path)
        print("rolled back", n, "documents"); return
    docs = all_docs()
    apply = "--apply" in args
    by = {}
    for p, i, _ in docs: by[p.split("/")[-1] if p.startswith("customers/") else p] = by.get(p.split("/")[-1] if p.startswith("customers/") else p, 0) + 1
    print("PLAN:", ", ".join(f"{k}={v}" for k, v in by.items()), "| total", len(docs), "| mode", "APPLY" if apply else "DRY RUN")
    created, existing, failed, seeded_before = [], [], [], []
    for parent, doc_id, fields in docs:
        path = f"{parent}/{doc_id}"
        s, r = http("GET", f"{BASE}/{path}")
        if s == 200:
            if (r.get("fields", {}).get("demo_seed", {}) or {}).get("booleanValue"): seeded_before.append(path)   # ours, from an interrupted run
            else: existing.append(path)
            continue
        if s != 404: failed.append((path, s)); continue
        if not apply: continue
        s, r = http("POST", f"{BASE}/{parent}?documentId={doc_id}", {"fields": {k: enc(v) for k, v in fields.items()}})
        if s == 409:
            seeded_before.append(path)               # landed on an earlier attempt
        else:
            (created if s == 200 else failed).append(path if s == 200 else (path, s, r))
    print(f"already exist, NOT ours (skipped): {len(existing)}", existing[:5])
    print(f"already seeded by this script earlier: {len(seeded_before)}")
    print(f"failed: {len(failed)}", failed[:5])
    if apply:
        os.makedirs(os.path.dirname(os.path.abspath(__file__)), exist_ok=True)
        mf = os.path.join(os.path.dirname(os.path.abspath(__file__)), "manifest_" + datetime.datetime.now().strftime("%Y%m%d_%H%M%S") + ".json")
        json.dump({"created": seeded_before + created, "at": datetime.datetime.now().isoformat()}, open(mf, "w"), indent=1)
        print(f"created now: {len(created)} (+{len(seeded_before)} from an earlier run)  manifest: {mf}")
    else:
        print("free to create:", len(docs) - len(existing) - len(failed))

main()
