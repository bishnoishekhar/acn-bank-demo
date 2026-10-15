"""Snapshot the canonical (unpruned) callback modules + a path->variant manifest.

Pruning is lossy: each deployed file keeps only the subset its entrypoint
reaches. This archives the full modules so they stay editable, and records
which of the 155 deployed paths each one maps to.
"""
import glob, hashlib, io, json, os, sys, collections

APP = sys.argv[1] if len(sys.argv) > 1 else 'agent/ACN_Bank_CES_Demo'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'callbacks_src'

variants, manifest = {}, {}
for f in sorted(glob.glob(f'{APP}/agents/**/python_code.py', recursive=True)):
    rel = f.replace(os.sep, '/')
    raw = io.open(f, 'rb').read()
    h = hashlib.md5(raw).hexdigest()[:10]
    hook = rel.split('/')[-3]
    key = f'{hook}/{h}.py'
    variants[key] = raw
    manifest[rel[len(APP) + 1:]] = key

for key, raw in variants.items():
    p = os.path.join(OUT, key)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    io.open(p, 'wb').write(raw)

io.open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8', newline='\n').write(
    json.dumps({'app_dir': APP, 'files': manifest}, indent=2, sort_keys=True) + '\n')

print(f'canonical variants : {len(variants)}')
print(f'mapped paths       : {len(manifest)}')
print(f'archive bytes      : {sum(len(v) for v in variants.values())/1024:.0f} KB')
