"""Prune a GECX callback module down to what its single entrypoint reaches.

Each callback is uploaded to CES as a standalone `python_code` string -- there is
no import/shared-module mechanism -- so every file carries the whole shared
module (51 top-level defs) while using only the 11-22 reachable from its own
entrypoint. This keeps the reachable set and drops the rest.
"""
import ast, io, sys, os

ENTRY = {
    'before_agent_callbacks': 'before_agent_callback',
    'before_model_callbacks': 'before_model_callback',
    'after_model_callbacks':  'after_model_callback',
    'before_tool_callbacks':  'before_tool_callback',
    'after_tool_callbacks':   'after_tool_callback',
}

def entry_for(path):
    for k, v in ENTRY.items():
        if k in path.replace(os.sep, '/'):
            return v
    return None

def prune(src, entry):
    tree = ast.parse(src)
    body = tree.body

    keep_always = []   # imports + non-def/assign statements (logger=, etc.)
    defs = {}          # name -> list of node indices defining it
    for i, n in enumerate(body):
        if isinstance(n, (ast.Import, ast.ImportFrom)):
            keep_always.append(i)
        elif isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            defs.setdefault(n.name, []).append(i)
        elif isinstance(n, ast.Assign):
            names = [t.id for t in n.targets if isinstance(t, ast.Name)]
            if names:
                for nm in names:
                    defs.setdefault(nm, []).append(i)
            else:
                keep_always.append(i)
        elif isinstance(n, ast.AnnAssign) and isinstance(n.target, ast.Name):
            defs.setdefault(n.target.id, []).append(i)
        elif isinstance(n, ast.Expr) and isinstance(n.value, ast.Constant):
            keep_always.append(i)          # module docstring
        else:
            keep_always.append(i)          # try/except, if __name__, etc.

    def names_in(idx):
        out = set()
        for s in ast.walk(body[idx]):
            if isinstance(s, ast.Name):
                out.add(s.id)
        return out

    # seed with entrypoint + anything referenced by always-kept statements
    seen, queue = set(), [entry]
    for i in keep_always:
        queue.extend(names_in(i))
    while queue:
        nm = queue.pop()
        if nm in seen or nm not in defs:
            continue
        seen.add(nm)
        for i in defs[nm]:
            queue.extend(names_in(i))

    keep_idx = set(keep_always)
    for nm in seen:
        keep_idx.update(defs[nm])

    lines = src.splitlines(keepends=True)
    out = []
    for i, n in enumerate(body):
        if i not in keep_idx:
            continue
        seg = ast.get_source_segment(src, n, padded=True)
        if seg is None:
            continue
        # carry leading comment block attached to this statement
        start = n.lineno - 1
        lead = []
        j = start - 1
        while j >= 0 and (lines[j].lstrip().startswith('#') or not lines[j].strip()):
            lead.append(lines[j]); j -= 1
            if len(lead) > 12: break
        lead = ''.join(reversed(lead)).strip('\n')
        out.append((n.lineno, (lead + '\n' if lead.strip() else '') + seg))

    out.sort(key=lambda x: x[0])

    # Drop imports whose only consumers were pruned away.
    kept_src = (chr(10) * 2).join(seg for _, seg in out)
    kept_tree = ast.parse(kept_src)
    used = set()
    for n in ast.walk(kept_tree):
        if isinstance(n, ast.Name):
            used.add(n.id)
        elif isinstance(n, ast.Attribute):
            x = n
            while isinstance(x, ast.Attribute):
                x = x.value
            if isinstance(x, ast.Name):
                used.add(x.id)
    pruned_out = []
    for lineno, seg in out:
        st = ast.parse(seg).body[0] if seg.strip() else None
        if isinstance(st, (ast.Import, ast.ImportFrom)):
            keep_names = [a for a in st.names
                          if (a.asname or a.name).split('.')[0] in used]
            if not keep_names:
                continue
            if len(keep_names) != len(st.names):
                names = ", ".join(
                    (a.name if not a.asname else f"{a.name} as {a.asname}")
                    for a in keep_names)
                seg = (f"from {st.module} import {names}"
                       if isinstance(st, ast.ImportFrom) else f"import {names}")
        pruned_out.append((lineno, seg))
    out = pruned_out

    header = (
        "# NOTE: pruned to the subset reachable from this file's entrypoint.\n"
        "# CES uploads each callback as a standalone python_code string (no shared\n"
        "# imports), so the full module was duplicated into all 155 files. Regenerate\n"
        "# with scripts/prune_callbacks.py after editing the canonical module.\n"
    )
    return header + "\n\n".join(s for _, s in out) + "\n", len(seen), len(defs)

def regenerate(snapshot_dir, app_dir):
    """Rebuild every deployed callback file from the canonical snapshot."""
    import json, glob
    man = json.load(io.open(os.path.join(snapshot_dir, 'manifest.json'),
                            encoding='utf-8'))
    before = after = 0
    for rel, variant in sorted(man['files'].items()):
        src_p = os.path.join(snapshot_dir, variant)
        dst_p = os.path.join(app_dir, rel)
        src = io.open(src_p, encoding='utf-8').read()
        new, _, _ = prune(src, entry_for(dst_p))
        compile(new, dst_p, 'exec')
        os.makedirs(os.path.dirname(dst_p), exist_ok=True)
        io.open(dst_p, 'w', encoding='utf-8', newline=chr(10)).write(new)
        before += len(src); after += len(new)
    print(f"regenerated {len(man['files'])} files")
    print(f"  canonical : {before/1024/1024:.2f} MB")
    print(f"  deployed  : {after/1024/1024:.2f} MB")


if __name__ == '__main__':
    if sys.argv[1] == '--regenerate':
        regenerate(sys.argv[2], sys.argv[3])
        sys.exit(0)
    src_path, dst_path = sys.argv[1], sys.argv[2]
    e = entry_for(src_path)
    src = io.open(src_path, encoding='utf-8').read()
    newsrc, nkeep, ntot = prune(src, e)
    compile(newsrc, dst_path, 'exec')
    io.open(dst_path, 'w', encoding='utf-8', newline='\n').write(newsrc)
    print(f"{os.path.basename(os.path.dirname(os.path.dirname(src_path)))}: "
          f"{len(src):,} -> {len(newsrc):,} bytes  ({nkeep}/{ntot} defs kept)")
