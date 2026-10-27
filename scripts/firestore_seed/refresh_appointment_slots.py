"""Roll the demo appointment slots forward.

The agent's getAvailableSlots now asks Firestore for up to 300 documents (it used to get only the first 20, which is why the window was
small), and the after-tool callback hides slots that are in the past or not 'available'. The window is the next 30 weekdays: 2 branches,
one slot per branch per day (morning and afternoon alternate by day so every weekday offers both a morning and an afternoon somewhere).
Run it again every few weeks to roll the window forward.

  python refresh_appointment_slots.py [--start YYYY-MM-DD] [--days N]   dry run (default start: tomorrow)
  python refresh_appointment_slots.py [--start YYYY-MM-DD] --apply    creates the missing slots, then deletes the OLD seeded
                                                                      slots (only documents tagged demo_seed=true) that are
                                                                      not part of the new window. Writes a manifest.
Create-only for new slots (documentId + never overwrites). Needs Application Default Credentials.
"""
import datetime, json, os, sys, time, urllib.error, urllib.request
import google.auth, google.auth.transport.requests

BASE = "https://firestore.googleapis.com/v1/projects/emvnzir-canada-song/databases/acn-bank-fs-db/documents"
BRANCHES = [("BR-TOR-001", "ACN Bank Toronto Financial District", ["account_opening", "mortgage", "investments", "general"]),
            ("BR-MIS-001", "ACN Bank Mississauga Square One", ["account_opening", "mortgage", "general"])]
TIMES = [("10:00", "10:30"), ("14:00", "14:30")]
creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/datastore"])
creds.refresh(google.auth.transport.requests.Request())

def http(method, url, body=None):
    last = None
    for attempt in range(5):
        req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, method=method,
                                     headers={"Authorization": "Bearer " + creds.token, "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.status, json.loads(r.read() or b"null")
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode()[:300]
        except Exception as e:
            last = repr(e)[:200]; time.sleep(2 * (attempt + 1))
    return 0, last

def enc(v):
    if isinstance(v, bool): return {"booleanValue": v}
    if isinstance(v, int): return {"integerValue": str(v)}
    if isinstance(v, str): return {"stringValue": v}
    if isinstance(v, list): return {"arrayValue": {"values": [enc(x) for x in v]}}
    raise TypeError(type(v))

def window(start, n=30):
    days, d = [], start
    while len(days) < n:
        if d.weekday() < 5: days.append(d)
        d += datetime.timedelta(days=1)
    out = []
    for i, day in enumerate(days):
        for j, (bid, bname, services) in enumerate(BRANCHES):
            s, e = TIMES[(i + j) % 2]
            sid = f"SLOT-{bid}-{day.strftime('%Y%m%d')}-{s.replace(':', '')}"
            out.append((sid, {"slot_id": sid, "branch_id": bid, "branch_name": bname, "date": day.isoformat(), "start_time": s, "end_time": e,
                              "duration_minutes": 30, "service_types": services, "status": "available", "timezone": "America/Toronto",
                              "demo_seed": True, "seeded_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}))
    return out

args = sys.argv[1:]
start = datetime.date.fromisoformat(args[args.index("--start") + 1]) if "--start" in args else datetime.date.today() + datetime.timedelta(days=1)
apply = "--apply" in args
new = window(start, int(args[args.index('--days') + 1]) if '--days' in args else 30)
new_ids = {sid for sid, _ in new}
s, r = http("GET", f"{BASE}/appointment_slots?pageSize=300")
cur = (r or {}).get("documents", []) if s == 200 else []
seeded = [d["name"].split("/")[-1] for d in cur if (d.get("fields", {}).get("demo_seed", {}) or {}).get("booleanValue")]
foreign = [d["name"].split("/")[-1] for d in cur if d["name"].split("/")[-1] not in seeded]
to_create = [(sid, f) for sid, f in new if sid not in seeded]
to_delete = [sid for sid in seeded if sid not in new_ids]
print(f"window {new[0][1]['date']} .. {new[-1][1]['date']} | existing slots {len(cur)} (ours {len(seeded)}, not ours {len(foreign)})")
print(f"to create {len(to_create)} | to delete (ours, outside the new window) {len(to_delete)} | final total {len(cur) - len(to_delete) + len(to_create)}")
if foreign: print("NOT ours, left alone:", foreign)
if not apply:
    print("DRY RUN - nothing written"); sys.exit(0)
created, deleted, failed = [], [], []
for sid, f in to_create:
    s, r = http("POST", f"{BASE}/appointment_slots?documentId={sid}", {"fields": {k: enc(v) for k, v in f.items()}})
    (created if s == 200 else failed).append(sid if s == 200 else (sid, s, str(r)[:120]))
if not failed:                                   # only remove the old window once the new one is fully in place
    for sid in to_delete:
        s, r = http("GET", f"{BASE}/appointment_slots/{sid}")
        if s == 200 and (r["fields"].get("demo_seed", {}) or {}).get("booleanValue"):
            s, _ = http("DELETE", f"{BASE}/appointment_slots/{sid}")
            (deleted if s == 200 else failed).append(sid if s == 200 else (sid, s))
mf = os.path.join(os.path.dirname(os.path.abspath(__file__)), "manifest_slots_" + datetime.datetime.now().strftime("%Y%m%d_%H%M%S") + ".json")
json.dump({"created": ["appointment_slots/" + x for x in created], "deleted": ["appointment_slots/" + x for x in deleted]}, open(mf, "w"), indent=1)
print(f"created {len(created)}, deleted {len(deleted)}, failed {len(failed)} {failed[:3]}\nmanifest: {mf}")
