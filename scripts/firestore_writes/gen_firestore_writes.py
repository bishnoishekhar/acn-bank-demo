"""Rewrite the toolset specs for direct-Firestore writes and emit the callback registry.

usage: gen_writes.py <app dir> <out registry.json>
Idempotent: running it twice leaves the specs unchanged the second time.
"""
import sys, os, glob, json, re
import yaml

root, out_json = sys.argv[1], sys.argv[2]
DOCS = "/v1/projects/emvnzir-canada-song/databases/acn-bank-fs-db/documents"

SKIP_OPS = {"createTransaction", "sendKycSmsLink", "sendACNWhatsApp"}        # done separately / not Firestore
# Entity paths that must live under the customer, because that is where the reads look.
MOVE_UNDER_CUSTOMER = {
    ("update_customer_api_db", "updateAccount"):            "/customers/{customerId}/accounts/{accountId}",
    ("update_customer_api_db", "updateBill"):               "/customers/{customerId}/bills/{billId}",
    ("update_customer_api_db", "updateCard"):               "/customers/{customerId}/cards/{cardId}",
    ("update_customer_api_db", "addPayee"):                 "/customers/{customerId}/beneficiaries",
    ("update_customer_api_db", "updatePayee"):              "/customers/{customerId}/beneficiaries/{beneficiaryId}",
    ("update_customer_api_db", "deletePayee"):              "/customers/{customerId}/beneficiaries/{beneficiaryId}",
    ("update_customer_api_db", "updateOverdraftProtection"): "/customers/{customerId}/accounts/{accountId}/overdraft_protection/settings",
    ("new_transaction_api_db", "updateTransaction"):        "/customers/{customerId}/transactions/{transactionId}",
}
STEP_UP = {"addPayee", "updatePayee", "deletePayee", "updateProfile", "createFXOrder", "createFXDraft"}
SET_ON_WRITE = {"cancelPAD": {"status": "cancelled"},
                "createNewCustomer": {"customer_tier": "mass_market", "customer_type": "new_customer", "global_status": "PENDING_ONBOARDING", "identity_verified": False, "kyc_status": "pending", "onboarding_channel": "account_opening_assistant"}}                             # fixed fields an op always sets
# ops a person who is not a customer yet may use (account opening): they run on the applicant id saved by createNewCustomer
APPLICANT_OPS = {"createNewCustomer": "new", "createAccountApplication": True, "updateAccountApplication": True,
                 "createKycRequest": True, "writeKycRecord": True, "executeACNBankApplicationEmail": True}
# fields the customer must confirm in their own words (read-back, then a yes in a LATER message) before the write goes through
CONFIRM_FIELDS = {
    "updateCard": ["travelNotice"],
    "createLoanApplication": ["amount"],
    "createDispute": ["transactionId"],
    "createActivationRequest": ["activationType"],
    "updateProfile": ["email", "phone", "address", "preferredName"],
    "createAppointment": ["slotId"],
    "updateAppointment": ["slotId", "status"],
    "cancelAppointment": ["appointmentId"],
    "updateNotificationPreferences": ["emailEnabled", "smsEnabled", "pushEnabled", "lowBalanceAlert", "transactionAlert", "securityAlert", "lowBalanceThreshold"],
    "updatePaperlessEnrollment": ["statementsEnabled", "taxDocumentsEnabled", "noticesEnabled"],
    "updateMarketingConsent": ["email", "phone", "mail"],
}
# updates that create the document when it does not exist yet (the demo customer has no preference documents)
UPSERT_OPS = {"updateNotificationPreferences", "updatePaperlessEnrollment", "updateMarketingConsent"}
QUERY_COLLECTION = {"queryCustomers": "customers"}                                  # runQuery at the database root

def toolset_display_name(ts_dir):
    for f in glob.glob(os.path.join(ts_dir, "*.json")):
        try:
            return json.load(open(f, encoding="utf8")).get("displayName") or os.path.basename(ts_dir)
        except Exception:
            pass
    return os.path.basename(ts_dir)

def path_params(path):
    return re.findall(r"\{(\w+)\}", path)

registry = {}
touched = []
for spec_path in sorted(glob.glob(os.path.join(root, "toolsets", "*", "open_api_toolset", "open_api_schema.yaml"))):
    ts_dir = os.path.dirname(os.path.dirname(spec_path))
    ts = toolset_display_name(ts_dir)
    spec = yaml.safe_load(open(spec_path, encoding="utf8"))
    schemas = spec.setdefault("components", {}).setdefault("schemas", {})
    new_paths = {}
    changed = False
    for path, ops in spec["paths"].items():
        for method, op in ops.items():
            if not isinstance(op, dict):
                continue
            opid = op.get("operationId")
            m = method.lower()
            if m == "get" or opid in SKIP_OPS:
                continue
            is_query = path.endswith(":runQuery")
            kind = "query" if is_query else {"post": "create", "patch": "patch", "delete": "delete"}[m]
            new_path = path
            # ---- path repairs
            if (ts, opid) in MOVE_UNDER_CUSTOMER:
                new_path = DOCS + MOVE_UNDER_CUSTOMER[(ts, opid)]
            if is_query:
                new_path = DOCS + ":runQuery"
            params = [p for p in op.get("parameters", [])]
            have = {p["name"] for p in params}
            for pp in path_params(new_path):
                if pp not in have:
                    params.append({"name": pp, "in": "path", "required": True, "schema": {"type": "string"}})
                    have.add(pp)
            # ---- body schema -> {fields} / {structuredQuery}
            body_schema = None
            rb = op.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema")
            ref_name = rb["$ref"].split("/")[-1] if rb and "$ref" in rb else None
            old_props, old_required = {}, []
            if ref_name and ref_name in schemas:
                old_props = list(schemas[ref_name].get("properties", {}).keys())
                old_required = list(schemas[ref_name].get("required", []))
            elif rb and "properties" in rb:
                old_props = list(rb["properties"].keys()); old_required = list(rb.get("required", []))
            elif ref_name and ref_name not in schemas:
                old_props = []
            pp_all = path_params(new_path)
            # already converted on a previous run? recover the field list from the description
            if old_props == ["fields"] or old_props == ["structuredQuery"]:
                prev = (schemas.get(ref_name, {}).get("x-acn-fields") or {})
                old_props = prev.get("allow", []); old_required = prev.get("required", [])
            prev_col = (schemas.get(ref_name, {}).get("x-acn-fields") or {}).get("col") if ref_name else None
            allow = [p for p in old_props if p not in pp_all and p != "idempotencyKey"]
            required = [r for r in old_required if r not in pp_all and r not in ("idempotencyKey", "customerId")]
            if m in ("post", "patch"):
                if is_query:
                    prop_name, desc = "structuredQuery", (
                        "Do NOT build this yourself. Pass the filters as plain arguments (" + ", ".join(allow) +
                        ") and the Firestore query is built for you.")
                else:
                    prop_name = "fields"
                    desc = ("Plain key/value map with: " + ", ".join(allow) +
                            (" (required: " + ", ".join(required) + ")" if required else "") +
                            ". Do NOT format values for Firestore; that is done for you. customerId and ids in the "
                            "path are filled in automatically.")
                body_schema = {"type": "object", "properties": {prop_name: {"type": "object", "description": desc, "additionalProperties": True}},
                               "x-acn-fields": {"allow": allow, "required": required, "col": (path.replace(DOCS, "").strip("/").replace(":runQuery", "") or prev_col) if is_query else None}}
                name = ref_name or (opid[0].upper() + opid[1:] + "Request")
                schemas[name] = body_schema
                op["requestBody"] = {"required": True, "content": {"application/json": {"schema": {"$ref": "#/components/schemas/" + name}}}}
            # ---- extra params per kind
            if kind == "create" and "documentId" not in have:
                params.append({"name": "documentId", "in": "query", "description": "Set automatically (idempotency).", "schema": {"type": "string"}})
            if kind == "patch":
                if "updateMask.fieldPaths" not in have:
                    params.append({"name": "updateMask.fieldPaths", "in": "query", "description": "Set automatically: only these fields are changed.",
                                   "schema": {"type": "array", "items": {"type": "string"}}})
                if "currentDocument.exists" not in have:
                    params.append({"name": "currentDocument.exists", "in": "query", "description": "Set automatically: the document must already exist.",
                                   "schema": {"type": "boolean"}})
            op["parameters"] = params
            op.setdefault("description", op.get("summary", ""))
            new_paths.setdefault(new_path, {})[method] = op
            collection = None
            seg = [s for s in new_path.replace(DOCS, "").split("/") if s and "{" not in s]
            collection = seg[-1] if seg else None
            if is_query:
                collection = QUERY_COLLECTION.get(opid) or path.replace(DOCS, "").strip("/").replace(":runQuery", "") or prev_col
            registry[ts + "_" + opid] = {
                "op": opid, "ts": ts, "kind": kind, "path": pp_all, "allow": allow, "required": required,
                "col": collection, "stepup": opid in STEP_UP, "set": SET_ON_WRITE.get(opid, {}),
                "cust_path": "customerId" in pp_all, "cust_field": "customerId" in allow,
            }
            if opid in APPLICANT_OPS:
                registry[ts + "_" + opid]["applicant"] = APPLICANT_OPS[opid]
            if opid in UPSERT_OPS:
                registry[ts + "_" + opid]["upsert"] = True
            if opid in CONFIRM_FIELDS:
                registry[ts + "_" + opid]["confirm_fields"] = CONFIRM_FIELDS[opid]
            if new_path != path or True:
                changed = True
    # carry over untouched paths (reads, skipped ops); keep order roughly: rebuilt dict
    merged = {}
    for path, ops in spec["paths"].items():
        for method, op in ops.items():
            if not isinstance(op, dict):
                merged.setdefault(path, {})[method] = op; continue
            opid = op.get("operationId")
            if method.lower() == "get" or opid in SKIP_OPS:
                merged.setdefault(path, {})[method] = op
    for path, ops in new_paths.items():
        for method, op in ops.items():
            merged.setdefault(path, {})[method] = op
    # Untouched GET ops that had all their unsupported params stripped can carry `parameters: null`;
    # CES refuses the whole toolset on import ("parameters is not of type array"). Drop empty ones.
    for ops in merged.values():
        for op in ops.values():
            if isinstance(op, dict) and "parameters" in op and not op["parameters"]:
                del op["parameters"]
                changed = True
    spec["paths"] = merged
    if changed:
        open(spec_path, "w", encoding="utf8", newline="\n").write(
            yaml.safe_dump(spec, sort_keys=False, default_flow_style=False, width=10000, allow_unicode=True))
        touched.append(ts)

json.dump(registry, open(out_json, "w", encoding="utf8"), indent=1, sort_keys=True)
print("toolsets rewritten:", len(touched), "| operations in registry:", len(registry))
from collections import Counter
print(Counter(v["kind"] for v in registry.values()))
