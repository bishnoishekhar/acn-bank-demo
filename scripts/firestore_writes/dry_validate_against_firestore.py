"""Validate the requests our callbacks build against the REAL Firestore, WITHOUT mutating data.

 patch  -> bogus document id + currentDocument.exists=true   => expect 404 (400 would mean a malformed request)
 create -> documentId of a document that ALREADY exists      => expect 409 (400 would mean a malformed request)
 query  -> real runQuery (read)                              => expect 200
 delete / patches whose target document exists               => SKIPPED (cannot be proven safe)
"""
import sys, json, os, glob, urllib.request, urllib.error, urllib.parse
import yaml
import google.auth, google.auth.transport.requests

REPO, REGF = sys.argv[1], sys.argv[2]
reg = json.load(open(REGF))
creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/datastore"])
creds.refresh(google.auth.transport.requests.Request())
HOST = "https://firestore.googleapis.com"
DOCS = "/v1/projects/emvnzir-canada-song/databases/acn-bank-fs-db/documents"
CUST = "CUST_DOC_1988"

def load(kind, agent):
    src = open(f"{REPO}/agents/{agent}/{kind}_callbacks/{kind}_callbacks_01/python_code.py", encoding="utf8").read()
    g = {n: object for n in ("Tool", "CallbackContext", "LlmRequest", "LlmResponse", "Content", "Part")}
    exec(compile(src, kind, "exec"), g)
    return g["before_tool_callback_impl"]
bt = load("before_tool", "acn_service_hub")
class T:
    def __init__(s, n): s.name = n
class Ctx:
    def __init__(s, st): s.state = st

# spec paths per (toolset display name, operationId)
spec_path = {}
for f in glob.glob(os.path.join(REPO, "toolsets", "*", "open_api_toolset", "open_api_schema.yaml")):
    folder = os.path.basename(os.path.dirname(os.path.dirname(f)))
    disp = folder
    for j in glob.glob(os.path.join(os.path.dirname(os.path.dirname(f)), "*.json")):
        try: disp = json.load(open(j, encoding="utf8")).get("displayName") or folder
        except Exception: pass
    for p, ops in yaml.safe_load(open(f, encoding="utf8"))["paths"].items():
        for m, o in ops.items():
            if isinstance(o, dict) and o.get("operationId"):
                spec_path[(disp, o["operationId"])] = (p, m.upper())

def http(method, url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"Authorization": "Bearer " + creds.token, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read())
        except Exception: return e.code, {}

def val(prop):
    return {"amount": 12.5, "quantity": 2, "points": 500, "enabled": True, "emailEnabled": True, "overdraftLimit": 300,
            "sendConfirmationEmail": False, "limit": 5}.get(prop, "v_" + prop)

def build_call(name, cfg, bogus_ids):
    base = {p: val(p) for p in cfg["allow"]}
    for pp in cfg["path"]:
        base[pp] = CUST if pp == "customerId" else bogus_ids
    if cfg["op"] == "queryCustomers":
        base = {"identifierType": "phone", "identifierValue": "4165551234"}
    d = json.loads(json.dumps(base)); s = {"customer_id": CUST, "auth_state": json.dumps({"level": "3"})}
    err = bt(T(name), d, Ctx(s))
    return err, d

def request_for(cfg, d):
    p, method = spec_path[(cfg["ts"], cfg["op"])]
    path = p
    for pp in cfg["path"]:
        path = path.replace("{" + pp + "}", urllib.parse.quote(str(d[pp]), safe=""))
    q = []
    if "documentId" in d: q.append(("documentId", d["documentId"]))
    if "updateMask.fieldPaths" in d:
        for fp in d["updateMask.fieldPaths"]: q.append(("updateMask.fieldPaths", fp))
    if "currentDocument.exists" in d: q.append(("currentDocument.exists", "true"))
    url = HOST + path + (("?" + urllib.parse.urlencode(q)) if q else "")
    body = {k: d[k] for k in ("fields", "structuredQuery") if k in d}
    return method, url, body or None

def existing_doc_id(collection_path):
    st, j = http("GET", HOST + DOCS + "/" + collection_path + "?pageSize=1")
    if st == 200 and j and j.get("documents"):
        return j["documents"][0]["name"].split("/")[-1]
    return None

out = []
for name, cfg in sorted(reg.items()):
    kind = cfg["kind"]
    p, _ = spec_path[(cfg["ts"], cfg["op"])]
    fixed_doc_patch = kind == "patch" and all(pp == "customerId" for pp in cfg["path"])
    if kind == "delete":
        out.append((name, kind, "SKIPPED", "delete cannot be proven safe")); continue
    if fixed_doc_patch:
        out.append((name, kind, "SKIPPED", "target document exists; a valid request would modify it")); continue
    err, d = build_call(name, cfg, "ZZ-DRYRUN-NONEXISTENT-0001")
    if err:
        out.append((name, kind, "BLOCKED", str(err))); continue
    if kind == "create":
        coll = p.replace(DOCS, "").strip("/")
        for pp in cfg["path"]:
            coll = coll.replace("{" + pp + "}", CUST if pp == "customerId" else "ZZ")
        # collection path to probe: strip placeholders already substituted
        existing = existing_doc_id(coll) if "{" not in coll else None
        if not existing:
            out.append((name, kind, "SKIPPED", f"no existing document in /{coll} to probe with a safe 409")); continue
        d["documentId"] = existing
    method, url, body = request_for(cfg, d)
    st, j = http(method, url, body)
    if kind == "patch" and not globals().get("_PATCH_GUARD_DONE"):
        _PATCH_GUARD_DONE = True
        bare = url.split("?")[0]
        gst, _ = http("GET", bare)
        print(f"[guard] first patch probe {name}: PATCH -> {st}, GET after -> {gst}")
        if st != 404 or gst != 404:
            print("[guard] UNEXPECTED: precondition not honoured. Cleaning up and aborting.")
            if gst == 200:
                print("[guard] cleanup DELETE ->", http("DELETE", bare)[0])
            sys.exit(2)
    msg = ""
    if isinstance(j, dict) and "error" in j:
        msg = " ".join(str(j["error"].get("message", "")).split())[:150]
    expect = {"patch": 404, "create": 409, "query": 200}[kind]
    verdict = "VALID" if st == expect else "PROBLEM"
    out.append((name, kind, verdict, f"HTTP {st} (expected {expect}) {msg}"))

for o in out: print(f"{o[2]:8} {o[1]:6} {o[0]:62} {o[3]}")
from collections import Counter
print(Counter(o[2] for o in out))
