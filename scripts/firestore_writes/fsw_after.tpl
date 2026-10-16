# ---------------------------------------------------------------------------
# FSW results: Firestore answers with raw typed documents. Hand the model plain values, and make
# a duplicate create (409) a clear answer. Operation kinds are GENERATED from the toolset specs.
# ---------------------------------------------------------------------------
_FSW_KINDS = json.loads('''__KINDS_JSON__''')

def _fsw_plain_value(v):
    if not isinstance(v, dict) or not v:
        return None
    k = next(iter(v))
    x = v[k]
    if k == 'integerValue':
        try:
            return int(x)
        except (ValueError, TypeError):
            return x
    if k == 'mapValue':
        return {a: _fsw_plain_value(b) for a, b in (x or {}).get('fields', {}).items()}
    if k == 'arrayValue':
        return [_fsw_plain_value(b) for b in (x or {}).get('values', [])]
    if k == 'nullValue':
        return None
    return x

def _fsw_doc(doc):
    out = {a: _fsw_plain_value(b) for a, b in (doc.get('fields') or {}).items()}
    out['id'] = str(doc.get('name', '')).split('/')[-1]
    return out

def _fsw_friendly(tool_response, kind):
    try:
        body = tool_response.get('data') if isinstance(tool_response, dict) and 'data' in tool_response else tool_response
        if kind == 'query':
            rows = body if isinstance(body, list) else None
            if rows is None and isinstance(body, dict):
                rows = body.get('result') if isinstance(body.get('result'), list) else body.get('documents')
            if isinstance(rows, list):
                docs = []
                for r in rows:
                    d = r.get('document') if isinstance(r, dict) and 'document' in r else r
                    if isinstance(d, dict) and d.get('fields') is not None:
                        docs.append(_fsw_doc(d))
                return {"status": "success", "code": "OK", "data": {"documents": docs, "count": len(docs)}}
        elif kind in ('create', 'patch'):
            if isinstance(body, dict) and isinstance(body.get('fields'), dict) and body.get('name'):
                d = _fsw_doc(body)
                d['message'] = 'Recorded.' if kind == 'create' else 'Updated.'
                return {"status": "success", "code": "OK", "data": d}
        elif kind == 'delete':
            if body in ({}, None, []) or (isinstance(body, dict) and not body):
                return {"status": "success", "code": "OK", "data": {"deleted": True, "message": "Deleted."}}
        blob = repr(tool_response)
        if kind == 'create' and ('ALREADY_EXISTS' in blob or 'code=409' in blob or "'code': 409" in blob or 'already exists' in blob.lower()):
            return {"status": "business_error", "code": "DUPLICATE_REQUEST", "data": {
                "message": "This exact request was already submitted a moment ago, so it was not repeated. "
                           "Tell the customer it is already recorded; do not retry."}}
        if kind in ('patch', 'delete') and ('NOT_FOUND' in blob or 'code=404' in blob or "'code': 404" in blob):
            return {"status": "business_error", "code": "NOT_FOUND", "data": {
                "message": "That record does not exist (check the id). Nothing was changed."}}
    except Exception:
        pass
    return tool_response

