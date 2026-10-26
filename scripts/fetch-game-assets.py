"""Fetch and index pinned resource archives. Does not install or execute game code."""
import hashlib
import io
import json
import pathlib
import urllib.request
import zipfile
import re

ROOT=pathlib.Path(__file__).resolve().parents[1]
UPSTREAM=ROOT/'data/upstream'
UPSTREAM.mkdir(parents=True,exist_ok=True)
config=json.loads((ROOT/'data/game-asset-sources.json').read_text(encoding='utf-8'))
for source in config['sources']:
    target=UPSTREAM/source['filename']
    algorithm='sha256' if 'sha256' in source else 'sha1'
    if not target.exists():
        temporary=target.with_suffix(target.suffix+'.part')
        print('Downloading',source['filename'],flush=True)
        urllib.request.urlretrieve(source['url'],temporary)
        with temporary.open('rb') as stream:actual=hashlib.file_digest(stream,algorithm).hexdigest()
        if actual!=source[algorithm]:raise SystemExit('Resource hash mismatch; downloaded input retained: '+str(temporary))
        temporary.replace(target)
    with target.open('rb') as stream:actual=hashlib.file_digest(stream,algorithm).hexdigest()
    if actual!=source[algorithm]:raise SystemExit('Existing input hash mismatch: '+str(target))
    print('Verified',source['filename'],flush=True)

dataset=json.loads((ROOT/'src/data/atm10-8.3.json').read_text(encoding='utf-8'))
namespaces={item['id'].lstrip('#').split(':')[0] for item in dataset['items'].values()}
archives=[];loaded_mods={'minecraft','neoforge','kubejs'}
with zipfile.ZipFile(UPSTREAM/'ServerFiles-8.3.zip') as server:
    for path in server.namelist():
        if not path.startswith('mods/') or not path.endswith('.jar'):continue
        with zipfile.ZipFile(io.BytesIO(server.read(path))) as jar:
            for name in jar.namelist():
                if name.endswith(('neoforge.mods.toml','mods.toml')):loaded_mods.update(re.findall(r'\bmodId\s*=\s*["\']([^"\']+)',jar.read(name).decode('utf-8',errors='replace')))
            present={name.split('/')[1] for name in jar.namelist() if name.startswith('assets/') and len(name.split('/'))>2}
            if present&namespaces or dataset.get('expansion'):archives.append(path)
(UPSTREAM/'resource-survey.json').write_text(json.dumps({'relevantArchives':archives,'loadedMods':sorted(loaded_mods)},indent=2)+'\n',encoding='utf-8')
print('Indexed',len(archives),'relevant mod resource archives. No mod code was run.')
