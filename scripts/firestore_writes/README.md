# Firestore write engine for the CES toolsets

The toolsets call Firestore's REST API directly. Firestore needs typed documents, `?documentId=` on create,
`updateMask.fieldPaths` on update and a `structuredQuery` for `runQuery`; the model sends plain arguments.
The before/after tool callbacks of every agent translate between the two. `registry.json` (one entry per
operation: kind, allowed fields, required fields, path params, step-up) is GENERATED from the toolset specs.

* `gen_firestore_writes.py <app dir> <registry.json>` rewrites the specs (fields body, updateMask, runQuery path,
  customer-scoped paths) and writes the registry. Idempotent.
* `fsw_before.tpl` / `fsw_after.tpl` are the callback blocks. The registry is embedded into each agent's
  `before_tool` / `after_tool` callback (all 31 carry an identical copy: CES has no shared module).
* `test_firestore_writes.py <app dir> registry.json` - offline tests of every operation (799 checks).
* `dry_validate_against_firestore.py <app dir> registry.json` - sends the built requests to the real Firestore
  WITHOUT mutating anything: patch -> bogus id + `currentDocument.exists` => 404; create -> an existing id => 409;
  query => read. Needs Application Default Credentials. Deletes and patches of documents that exist are skipped.
