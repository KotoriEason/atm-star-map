"""Independently re-read the pinned resource bytes referenced by the delivered catalog."""
import hashlib,json,pathlib,zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1];UP=ROOT/'data/upstream'
d=json.loads((ROOT/'src/data/atm10-8.3.json').read_text(encoding='utf-8'));archives={};seen=set();verified=0;generated=0
try:
    for source in [r['source'] for r in d['recipes']]+[s['source'] for records in d.get('acquisitions',{}).values() for s in records]:
        path=source['path'];pair=(path,source['sha256'])
        if pair in seen:continue
        seen.add(pair)
        if path.startswith('pinned archives:'):
            generated+=1;continue
        if '!/' in path:
            archive,entry=path.split('!/',1)
            target=UP/'mods'/archive
            if not target.exists():target=UP/archive
            if archive not in archives:archives[archive]=zipfile.ZipFile(target)
            data=archives[archive].read(entry)
        elif path.startswith('mod:allthecompressed/'):
            data=(UP/'compressed'/path.removeprefix('mod:allthecompressed/')).read_bytes()
        else:data=(UP/'release/overrides'/path).read_bytes()
        assert hashlib.sha256(data).hexdigest()==source['sha256'],f'Source bytes differ: {path}'
        verified+=1
    ids=set()
    for r in d['recipes']:
        assert r['id'] not in ids,f'Duplicate recipe identity {r["id"]}'
        ids.add(r['id']);assert r['output']['key'] in d['items']
        assert r['output']['count']>0 and isinstance(r['output']['count'],int)
        assert r['ingredients']
        for g in r['ingredients']:
            assert isinstance(g['count'],int) and g['count']>0
            assert g['options'] and all(k in d['items'] for k in g['options'])
        if r.get('chance',1)!=1:assert r.get('manualOnly')
        if r.get('coProducts'):assert r.get('manualOnly')
    print(f'PASS: {verified} unique recipe/acquisition sources match original bytes; {generated} generated tag/world indexes explicitly distinguished.')
    print(f'PASS: {len(ids)} unique routes, referenced identities, positive quantities, probabilistic/manual boundaries.')
finally:
    for archive in archives.values():archive.close()
