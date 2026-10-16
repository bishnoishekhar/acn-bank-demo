import sys, json
REPO, REGF = sys.argv[1], sys.argv[2]
reg = json.load(open(REGF))

def load(kind, agent):
    src = open(f"{REPO}/agents/{agent}/{kind}_callbacks/{kind}_callbacks_01/python_code.py", encoding="utf8").read()
    g = {n: object for n in ("Tool", "CallbackContext", "LlmRequest", "LlmResponse", "Content", "Part")}
    exec(compile(src, kind, "exec"), g)
    return g

class T:
    def __init__(s, n): s.name = n
class Ctx:
    def __init__(s, st): s.state = st

bt = load("before_tool", "acn_service_hub")["before_tool_callback_impl"]
at = load("after_tool", "acn_service_hub")["after_tool_callback_impl"]

def st(level, cid="CUST_DOC_1988"):
    d = {"auth_state": json.dumps({"level": str(level)})}
    if cid:
        d["customer_id"] = cid
    return d

res = {"pass": 0, "fail": 0}
fails = []

def check(name, ok, detail=""):
    res["pass" if ok else "fail"] += 1
    if not ok:
        fails.append(f"{name} {detail}")

def val(prop):
    return {"amount": 12.5, "quantity": 2, "points": 500, "enabled": True, "emailEnabled": True,
            "overdraftLimit": 300, "sendConfirmationEmail": False, "limit": 5}.get(prop, "v_" + prop)

def sample_args(cfg):
    return {p: val(p) for p in cfg["allow"]}

def call(name, args, level=3, cid="CUST_DOC_1988"):
    d = json.loads(json.dumps(args))
    s = st(level, cid)
    r = bt(T(name), d, Ctx(s))
    return r, d, s

STEP = {"addPayee", "updatePayee", "deletePayee", "updateProfile", "createFXOrder", "createFXDraft"}

for name, cfg in sorted(reg.items()):
    op = cfg["op"]; kind = cfg["kind"]
    pathvals = {pp: ("CUST-ATTACKER" if pp == "customerId" else "ID-123") for pp in cfg["path"]}
    base = {**sample_args(cfg), **pathvals}
    if kind == "query" and op == "queryCustomers":
        base = {"identifierType": "phone", "identifierValue": "4165551234"}
    r, d, s = call(name, base, level=3)
    check(f"{name}: accepted at L3", r is None, str(r))
    if r is not None:
        continue
    if kind == "create":
        did = d.get("documentId", "")
        check(f"{name}: documentId", did.count("-") == 1 and len(did.split("-")[1]) == 16, str(did))
        check(f"{name}: typed fields", isinstance(d["fields"], dict) and all(isinstance(v, dict) and len(v) == 1 for v in d["fields"].values()))
        check(f"{name}: createdAt added", "createdAt" in d["fields"])
        check(f"{name}: no updateMask on create", "updateMask.fieldPaths" not in d)
        extra = set(d["fields"]) - set(cfg["allow"]) - {"createdAt", "customerId"} - set(cfg.get("set", {}))
        check(f"{name}: only allowed fields stored", not extra, str(extra))
        if cfg["cust_field"]:
            check(f"{name}: customerId field forced", d["fields"]["customerId"] == {"stringValue": "CUST_DOC_1988"})
        r2, d2, _ = call(name, {**base, "isAdmin": True, "status_override": "x"})
        check(f"{name}: unknown keys dropped", r2 is None and "isAdmin" not in d2["fields"] and "status_override" not in d2["fields"])
        r3, d3, _ = call(name, base)
        check(f"{name}: retry gives same documentId", d3["documentId"] == d["documentId"])
        free = [k for k in cfg["allow"] if k != "customerId"]
        if free:
            k0 = free[0]
            r4, d4, _ = call(name, {**base, k0: "different-value"})
            check(f"{name}: changed data -> new id", d4["documentId"] != d["documentId"])
        for req in cfg["required"]:
            b2 = {k: v for k, v in base.items() if k != req}
            r5, _, _ = call(name, b2)
            check(f"{name}: missing {req} rejected", isinstance(r5, dict) and r5["error"] == "MISSING_FIELD", str(r5))
        wrapped = {"fields": {k: v for k, v in base.items() if k in cfg["allow"]}}
        wrapped.update({k: v for k, v in base.items() if k in cfg["path"]})
        r6, d6, _ = call(name, wrapped)
        check(f"{name}: fields-wrapped equals flat", r6 is None and set(d6["fields"]) == set(d["fields"]))
    elif kind == "patch":
        mask = d["updateMask.fieldPaths"]
        check(f"{name}: updateMask == stored keys", sorted(mask) == sorted(d["fields"].keys()), str(mask))
        check(f"{name}: document must exist", d.get("currentDocument.exists") is True)
        check(f"{name}: updatedAt added", "updatedAt" in d["fields"] and "updatedAt" in mask)
        check(f"{name}: no createdAt on patch", "createdAt" not in d["fields"])
        extra = set(d["fields"]) - set(cfg["allow"]) - {"updatedAt"} - set(cfg.get("set", {}))
        check(f"{name}: only allowed fields stored", not extra, str(extra))
        check(f"{name}: no documentId on patch", "documentId" not in d)
        r2, d2, _ = call(name, {**base, "role": "admin"})
        check(f"{name}: unknown keys dropped", r2 is None and "role" not in d2["fields"])
        if cfg["cust_path"]:
            check(f"{name}: path customerId forced", d["customerId"] == "CUST_DOC_1988", str(d.get("customerId")))
        for pp in cfg["path"]:
            if pp == "customerId":
                continue
            for bad in ("a/b", "..", "x/../y", "", None, "a b", "a?b=1"):
                r3, _, _ = call(name, {**base, pp: bad})
                check(f"{name}: bad {pp} {bad!r} rejected", isinstance(r3, dict) and r3["error"] == "MISSING_FIELD", str(r3))
        only_paths = {k: v for k, v in base.items() if k in cfg["path"]}
        if not cfg.get("set"):
            r4, _, _ = call(name, only_paths)
            check(f"{name}: empty update rejected", isinstance(r4, dict) and r4["error"] in ("NOTHING_TO_UPDATE", "MISSING_FIELD"), str(r4))
        for req in cfg["required"]:
            b2 = {k: v for k, v in base.items() if k != req}
            r5, _, _ = call(name, b2)
            check(f"{name}: missing {req} rejected", isinstance(r5, dict) and r5["error"] == "MISSING_FIELD", str(r5))
    elif kind == "delete":
        check(f"{name}: path only", set(d) == set(cfg["path"]), str(d))
        if cfg["cust_path"]:
            check(f"{name}: path customerId forced", d["customerId"] == "CUST_DOC_1988")
        for pp in cfg["path"]:
            if pp == "customerId":
                continue
            r3, _, _ = call(name, {**base, pp: "a/b"})
            check(f"{name}: bad id rejected", isinstance(r3, dict) and r3["error"] == "MISSING_FIELD")
    elif kind == "query":
        sq = d["structuredQuery"]
        check(f"{name}: collection", sq["from"][0]["collectionId"] == cfg["col"], str(sq["from"]))
        check(f"{name}: limit set", 1 <= sq["limit"] <= 50)
        check(f"{name}: only structuredQuery sent", set(d) == {"structuredQuery"})
        if op == "queryCustomers":
            flt = sq["where"]["compositeFilter"]["filters"]
            check(f"{name}: matches identifier AND session customer doc",
                  len(flt) == 2 and flt[0]["fieldFilter"]["field"]["fieldPath"] == "registered_mobile"
                  and flt[1]["fieldFilter"]["value"]["referenceValue"].endswith("/customers/CUST_DOC_1988"), json.dumps(flt)[:200])
            r2, d2, _ = call(name, {"identifierType": "nonsense", "identifierValue": "x"})
            check(f"{name}: bad identifierType rejected", isinstance(r2, dict) and r2["error"] == "MISSING_FIELD")
        elif cfg["cust_field"]:
            r2, d2, _ = call(name, {**base, "customerId": "CUST-ATTACKER"})
            w = json.dumps(d2["structuredQuery"]["where"])
            check(f"{name}: customerId filter forced to session", "CUST_DOC_1988" in w and "CUST-ATTACKER" not in w, w[:160])
    r7, _, _ = call(name, base, level=3, cid=None)
    check(f"{name}: no customer -> blocked unless public",
          (isinstance(r7, dict) and r7["error"] == "AUTH_LEVEL_INSUFFICIENT") or (kind == "query" and not cfg["cust_field"] and op != "queryCustomers"), str(r7))
    r8, _, _ = call(name, base, level=2)
    if cfg["stepup"]:
        check(f"{name}: step-up at L2", isinstance(r8, dict) and r8["error"] == "STEP_UP_REQUIRED", str(r8))
    else:
        check(f"{name}: allowed at L2 (no step-up)", r8 is None or (isinstance(r8, dict) and r8["error"] != "STEP_UP_REQUIRED"), str(r8))

check("stepup set == policy", {c["op"] for c in reg.values() if c["stepup"]} == STEP)

def after(name, resp, tool, want):
    s = st(3)
    r = at(T(tool), {}, Ctx(s), resp)
    check(f"after: {name}", want(r), json.dumps(r)[:140])

DOC = {"data": {"name": "projects/p/databases/d/documents/customers/C/beneficiaries/PAYEE-1", "fields": {
    "name": {"stringValue": "Sam"}, "amount": {"doubleValue": 5.5}, "n": {"integerValue": "7"},
    "m": {"mapValue": {"fields": {"a": {"booleanValue": True}}}}, "l": {"arrayValue": {"values": [{"stringValue": "x"}]}}}}}
after("create -> friendly", DOC, "update_customer_api_db_addPayee",
      lambda r: r["status"] == "success" and r["data"]["id"] == "PAYEE-1" and r["data"]["name"] == "Sam" and r["data"]["n"] == 7 and r["data"]["m"] == {"a": True} and r["data"]["l"] == ["x"])
after("patch -> friendly Updated", DOC, "update_customer_api_db_updatePayee", lambda r: r["status"] == "success" and r["data"]["message"] == "Updated.")
after("delete {} -> deleted", {"data": {}}, "update_customer_api_db_deletePayee", lambda r: r["status"] == "success" and r["data"]["deleted"] is True)
after("delete bare {} -> deleted", {}, "update_customer_api_db_deletePayee", lambda r: r["status"] == "success" and r["data"]["deleted"] is True)
after("query list -> documents", {"data": [{"document": DOC["data"], "readTime": "t"}, {"readTime": "t"}]}, "new_transaction_api_db_listRecurringSchedules",
      lambda r: r["status"] == "success" and r["data"]["count"] == 1 and r["data"]["documents"][0]["id"] == "PAYEE-1")
after("query empty -> count 0", {"data": [{"readTime": "t"}]}, "new_transaction_api_db_listRecurringSchedules", lambda r: r["status"] == "success" and r["data"]["count"] == 0)
after("create 409 -> DUPLICATE_REQUEST", {"data": {"error": "Document already exists", "errorCode": "ALREADY_EXISTS", "status": "error"}, "status": "error"}, "disputes_db_createDispute", lambda r: r["code"] == "DUPLICATE_REQUEST")
after("patch 404 -> NOT_FOUND", {"data": {"error": "No document to update", "errorCode": "NOT_FOUND", "status": "error"}, "status": "error"}, "disputes_db_updateDispute", lambda r: r["status"] == "business_error" and r["code"] == "NOT_FOUND")
after("create INVALID_ARGUMENT stays an error", {"data": {"error": "bad", "errorCode": "INVALID_ARGUMENT", "status": "error"}, "status": "error"}, "disputes_db_createDispute", lambda r: r["status"] == "business_error" and r["code"] == "INVALID_ARGUMENT")
after("non-registry tool untouched", {"data": {"documents": [{"name": "x"}]}}, "manageCustomerDatabase_getAccounts", lambda r: r["status"] == "success")
print(f"RESULT: {res['pass']} passed, {res['fail']} failed, across {len(reg)} operations")
for f in fails[:40]:
    print("FAIL:", f)
# ---- raw CES shapes captured from the sandbox
RAWDOC={"name":"projects/p/databases/d/documents/card_applications/APP-1","fields":{"status":{"stringValue":"in_progress"},"requested_limit":{"doubleValue":5000}}}
after("raw query {'result': [...]} -> documents", {"result":[{"document":RAWDOC,"readTime":"t"}]}, "card_applications_queryApplications", lambda r: r["status"]=="success" and r["data"]["count"]==1 and r["data"]["documents"][0]["requested_limit"]==5000 and r["data"]["documents"][0]["id"]=="APP-1")
after("raw query empty {'result': [{readTime}]}", {"result":[{"readTime":"t"}]}, "card_applications_queryApplications", lambda r: r["status"]=="success" and r["data"]["count"]==0)
after("raw error top-level errorCode NOT_FOUND on patch", {"status":"error","errorMessage":"No document to update","error":"No document to update","errorCode":"NOT_FOUND"}, "update_customer_api_db_updatePayee", lambda r: r["status"]=="business_error" and r["code"]=="NOT_FOUND")
after("raw error ALREADY_EXISTS on create", {"status":"error","errorMessage":"Document already exists","error":"Document already exists","errorCode":"ALREADY_EXISTS"}, "update_customer_api_db_addPayee", lambda r: r["code"]=="DUPLICATE_REQUEST")
after("raw error INVALID_ARGUMENT keeps its code", {"status":"error","errorMessage":"bad","error":"bad","errorCode":"INVALID_ARGUMENT"}, "update_customer_api_db_addPayee", lambda r: r["status"]=="business_error" and r["code"]=="INVALID_ARGUMENT")
after("raw error INTERNAL -> system_error", {"status":"error","errorMessage":"x","error":"x","errorCode":"INTERNAL"}, "update_customer_api_db_addPayee", lambda r: r["status"]=="system_error" and r["code"]=="INTERNAL")
after("raw delete {} -> deleted", {}, "update_customer_api_db_deletePayee", lambda r: r["status"]=="success" and r["data"]["deleted"] is True)
after("raw single doc (no data wrapper) create -> friendly", RAWDOC, "disputes_db_createDispute", lambda r: r["status"]=="success" and r["data"]["id"]=="APP-1")
print(f"RESULT (incl. raw shapes): {res['pass']} passed, {res['fail']} failed")
for f in fails[:20]: print("FAIL:", f)
# ---- model puts plain filters inside structuredQuery
r,d,s=call("loan_applications_queryLoanApplications",{"structuredQuery":{"status":"in_progress","type":"mortgage"}})
w=json.dumps(d["structuredQuery"]["where"]) if r is None else ""
check("query: plain filters inside structuredQuery are honoured", r is None and "in_progress" in w and "mortgage" in w and "CUST_DOC_1988" in w, w[:200])
r,d,s=call("loan_applications_queryLoanApplications",{"structuredQuery":{"customerId":"CUST-ATTACKER","status":"approved"}})
w=json.dumps(d["structuredQuery"]["where"]) if r is None else ""
check("query: customerId inside structuredQuery still forced to session", r is None and "CUST-ATTACKER" not in w and "CUST_DOC_1988" in w, w[:200])
r,d,s=call("new_transaction_api_db_listRecurringSchedules",{"structuredQuery":{"from":[{"collectionId":"customers"}],"limit":999}})
check("query: a model-built real structuredQuery is NOT trusted (rebuilt, scoped)", r is None and d["structuredQuery"]["from"][0]["collectionId"]=="recurring_schedules" and d["structuredQuery"]["limit"]<=50, json.dumps(d)[:200])
print(f"FINAL: {res['pass']} passed, {res['fail']} failed")
for f in fails[:20]: print("FAIL:", f)
