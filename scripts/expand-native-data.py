"""Build a source-backed dependency closure from the pinned ATM10 release resources."""
import collections,hashlib,io,json,pathlib,re,zipfile
from native_recipes import normalize,flatten_tag,loot_items
ROOT=pathlib.Path(__file__).resolve().parents[1];UP=ROOT/'data/upstream'
def read(path):return json.loads(path.read_text(encoding='utf-8'))
def write(path,value):path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def digest(b):return hashlib.sha256(b).hexdigest()
def main():
    dataset=read(ROOT/'src/data/atm10-8.3.json');seedpath=ROOT/'data/expansion-seeds.json'
    if not seedpath.exists():write(seedpath,list(dataset['items']))
    seeds=read(seedpath);cache=UP/'native-resource-index.json'
    if not cache.exists() or read(cache).get('indexVersion')!=2:
        print('Indexing pinned archives, tags, loot and world generation…',flush=True)
        resources={};tags={};loot={};natural=set();archives=[];mods=set();recipes=[]
        def scan(archive,label):
            names=archive.namelist()
            for p in names:
                if p.endswith('neoforge.mods.toml') or p.endswith('mods.toml'):
                    mods.update(re.findall(r'\bmodId\s*=\s*["\']([^"\']+)',archive.read(p).decode('utf-8',errors='replace')))
                prefix='overrides/kubejs/' if p.startswith('overrides/kubejs/data/') else ''
                path=p[len(prefix):]
                if not path.startswith('data/') or not path.endswith('.json'):continue
                if not any(s in path for s in ['/recipe/','/tags/','/loot_table/','/worldgen/configured_feature/']):continue
                b=archive.read(p)
                try:j=json.loads(b)
                except (ValueError,UnicodeDecodeError):continue
                ns=path.split('/')[1];source={'path':label+'!/'+p,'line':1,'sha256':digest(b),'url':'https://www.curseforge.com/minecraft/modpacks/all-the-mods-10/files/9190182' if label!='minecraft-1.21.1-client.jar' else 'https://www.minecraft.net/'}
                if '/recipe/' in path:
                    recipes.append({'id':ns+':'+path.split('/recipe/',1)[1][:-5],'json':j,'source':source})
                elif '/tags/' in path:
                    m=re.match(r'data/([^/]+)/tags/(item|fluid|chemical|mekanism/chemical)/(.+)\.json$',path)
                    if not m:continue
                    kind={'item':'','fluid':'fluid:','chemical':'chemical:','mekanism/chemical':'chemical:'}[m[2]];key=kind+'#'+m[1]+':'+m[3]
                    def member(v):
                        value=v if isinstance(v,str) else v.get('id','');return kind+value
                    values=[member(v) for v in j.get('values',[])]
                    tags[key]=values if j.get('replace') else list(dict.fromkeys(tags.get(key,[])+values))
                elif '/loot_table/' in path:loot[path]={'json':j,'source':source}
                elif '/worldgen/configured_feature/' in path:
                    def blocks(v):
                        if isinstance(v,dict):
                            if isinstance(v.get('Name'),str):natural.add(v['Name'])
                            for child in v.values():blocks(child)
                        elif isinstance(v,list):
                            for child in v:blocks(child)
                    blocks(j)
        with zipfile.ZipFile(UP/'ServerFiles-8.3.zip') as server:
            for name in sorted(n for n in server.namelist() if n.startswith('mods/') and n.endswith('.jar')):
                b=server.read(name);archives.append({'archive':pathlib.PurePosixPath(name).name,'sha256':digest(b)})
                with zipfile.ZipFile(io.BytesIO(b)) as jar:scan(jar,pathlib.PurePosixPath(name).name)
        for filename in ['minecraft-1.21.1-client.jar','neoforge-21.1.259-universal.jar','ATM10-8.3.zip']:
            path=UP/filename;archives.append({'archive':filename,'sha256':digest(path.read_bytes())})
            with zipfile.ZipFile(path) as jar:scan(jar,filename)
        write(cache,{'indexVersion':2,'recipes':recipes,'tags':tags,'loot':loot,'natural':sorted(natural),'archives':archives,'mods':sorted(mods|{'minecraft','neoforge','kubejs'})})
    raw=read(cache);tags={k:flatten_tag(k,raw['tags']) for k in raw['tags']};mods=set(raw['mods']);natural=set(raw['natural'])
    mutations=read(UP/'pack-mutations.json');skipped=collections.Counter();conditional=0;removed=0
    def condition(c):
        t=c.get('type','')
        if t in ['neoforge:mod_loaded','forge:mod_loaded']:return c.get('modid') in mods
        if t=='neoforge:not':
            v=condition(c['value']);return None if v is None else not v
        if t in ['neoforge:and','neoforge:or']:
            values=[condition(v) for v in c.get('values',[])];return None if None in values else (all(values) if t.endswith(':and') else any(values))
        if t=='neoforge:tag_empty':return not bool(tags.get('#'+c.get('tag','')))
        if t=='neoforge:true':return True
        if t=='neoforge:false':return False
        return None
    def matches(value,pattern):
        if isinstance(pattern,dict) and '$regex' in pattern:
            try:return bool(re.search(pattern['$regex'],value,re.I if 'i' in pattern.get('flags','') else 0))
            except re.error:return False
        if not isinstance(pattern,str):return False
        if pattern.startswith('#'):return value==pattern or value in tags.get(pattern,[])
        return value==pattern
    def filtered(r,f):
        if isinstance(f,list):return any(filtered(r,v) for v in f)
        if not isinstance(f,dict):return False
        if 'or' in f and not any(filtered(r,v) for v in f['or']):return False
        if 'not' in f and filtered(r,f['not']):return False
        for k,v in f.items():
            if k in ['or','not']:continue
            if k=='id' and not matches(r['id'].split('~output:')[0],v):return False
            elif k=='type' and not matches(r['type'],v):return False
            elif k=='mod' and r['output']['key'].split(':')[0]!=v:return False
            elif k=='output' and not matches(r['output']['key'],v):return False
            elif k=='input' and not any(matches(o,v) for g in r['ingredients'] for o in g['options']):return False
            elif k not in ['id','type','mod','output','input']:return False
        return True
    by_output=collections.defaultdict(list);warnings=[]
    # Last packaged declaration of an exact resource ID wins; KubeJS resources scanned last.
    rawrecipes={r['id']:r for r in [*raw['recipes'],*mutations.get('customRecipes',[])]}
    for entry in rawrecipes.values():
        j=entry['json'];conditions=j.get('neoforge:conditions',j.get('conditions',[]));states=[condition(c) for c in conditions if isinstance(c,dict)]
        if False in states:skipped['disabled-condition']+=1;continue
        try:recipes=normalize(j)
        except (ValueError,KeyError,TypeError,IndexError) as e:skipped[str(e)]+=1;continue
        for index,r in enumerate(recipes):
            r.update(id=entry['id']+(f'~output:{index}' if len(recipes)>1 else ''),source=entry['source'])
            if None in states:
                conditional+=1;r['manualOnly']=True;r['notes']=(r.get('notes','')+' 启用条件需游戏内核验：'+json.dumps(conditions,ensure_ascii=False,separators=(',',':'))).strip()
            erase=False
            for m in mutations['mutations']:
                if not m['args'] or not filtered(r,m['args'][0]):continue
                if m['action']=='remove':erase=True;break
                if len(m['args'])<3:continue
                old,new=m['args'][1:3]
                if m['action']=='replaceInput' and isinstance(new,str):
                    for g in r['ingredients']:g['options']=[new if matches(o,old) else o for o in g['options']]
                elif m['action']=='replaceOutput' and isinstance(new,str) and matches(r['output']['key'],old):r['output']['key']=new
            if erase:removed+=1;continue
            by_output[r['output']['key']].append(r)
    # Loot is an acquisition record, never a zero-input crafting recipe or guaranteed yield.
    acquisitions=collections.defaultdict(list)
    natural.update('minecraft:'+n for n in ['stone','dirt','grass_block','sand','red_sand','gravel','netherrack','end_stone','obsidian','clay','soul_sand','soul_soil','warped_nylium','crimson_nylium','sugar_cane','bamboo','cactus','oak_log','spruce_log','birch_log','jungle_log','acacia_log','dark_oak_log','mangrove_log','cherry_log','crimson_stem','warped_stem'])
    for path,entry in raw['loot'].items():
        part=path.split('/loot_table/')[1][:-5];ns=path.split('/')[1]
        category='mob' if part.startswith('entities/') else 'chest' if part.startswith('chests/') else 'gather' if part.startswith('blocks/') and ns+':'+part[7:] in natural else None
        if category is None:continue
        for item in loot_items(entry['json']):
            sources=acquisitions[item['key']]
            if len(sources)>=8:continue
            label={'mob':'生物掉落','chest':'战利品容器','gather':'采集/挖掘'}[category]
            target=ns+':'+part.split('/',1)[1]
            sources.append({'kind':category,'title':label,'description':f'{label}来源：{target}。掉落受工具、附魔、概率及表内条件影响，不保证每次获得。','conditions':item['conditions'],'functions':item['functions'],'source':entry['source']})
    for block in natural:
        if not acquisitions.get(block) and block in by_output:continue
        # Feature presence proves a block state occurs in a configured feature, not final biome placement.
        if not acquisitions.get(block):acquisitions[block].append({'kind':'world','title':'世界生成资源','description':'对应方块出现在本版配置的地物状态中。维度、高度、群系、工具及最终生成配置需在游戏内确认。','source':{'path':'pinned archives: worldgen/configured_feature','line':1,'sha256':digest(json.dumps(raw['natural']).encode()),'url':'https://www.curseforge.com/minecraft/modpacks/all-the-mods-10/files/9190182'}})
    manualpath=ROOT/'data/acquisition-overrides.json'
    manual=read(manualpath) if manualpath.exists() else {}
    for k,records in manual.items():acquisitions[k]=records+acquisitions[k]
    manualpath=ROOT/'data/manual-acquisition-recipes.json'
    guide_recipes=read(manualpath) if manualpath.exists() else []
    for r in guide_recipes:by_output[r['output']['key']].insert(0,r)
    existing={r['id'] for r in dataset['recipes'] if not r.get('native')}
    # Existing recipes are immutable so saved route and ingredient choices stay valid.
    for k in by_output:by_output[k]=[r for r in by_output[k] if r['id'] not in existing]
    needed=set(seeds);queue=list(seeds);included={};selectedtags={};selectedacq={};tagmachine='minecraft:crafting_table'
    for key in queue:
        if key in tags:
            members=tags[key];selectedtags[key]=members
            for member in members:
                if member not in needed:needed.add(member);queue.append(member)
        if key in acquisitions:selectedacq[key]=acquisitions[key]
        for r in by_output.get(key,[]):
            r['native']=True;included[r['id']]=r
            for child in [r['machine']]+[v for g in r['ingredients'] for v in g['options']]:
                # Equipment is shown as a source requirement, but avoid recursively adding its
                # own construction as a consumed ingredient in the material recipe.
                if child not in needed:needed.add(child);queue.append(child)
    # Prefer terminating material routes. Acquisition facts seed the distance computation;
    # recycling-only cycles never get a falsely finite rank.
    old=[r for r in dataset['recipes'] if not r.get('native')]
    allrecipes=old+list(included.values());cost={k:(0 if any(a['kind'] in ['gather','world'] or (a['kind']=='mob' and not k.endswith(('_ingot','_nugget'))) for a in v) else 10) for k,v in selectedacq.items()};preferred={};tagchoices={}
    output_keys={r['output']['key'] for r in allrecipes}
    for key in needed:
        if key not in output_keys and key not in selectedtags and key not in cost:cost[key]=1000
    for _ in range(128):
        changed=False
        for key,members in selectedtags.items():
            choices=[(cost[v],v) for v in members if v in cost]
            if choices:
                n,v=min(choices)
                if n+.1<cost.get(key,float('inf')):cost[key]=n+.1;tagchoices[key]=v;changed=True
        for r in allrecipes:
            prices=[min((cost.get(v,float('inf')) for v in g['options']),default=float('inf')) for g in r['ingredients']]
            n=1+max(prices,default=float('inf'))+(5 if r.get('manualOnly') else 0)
            out=r['output']['key']
            if n<cost.get(out,float('inf')):cost[out]=n;preferred[out]=r['id'];changed=True
        if not changed:break
    # Even items with direct drop alternatives may have useful recipes. Choose the cheapest
    # finite recipe independently of acquisition distance; UI can show both.
    all_by_output=collections.defaultdict(list)
    for r in allrecipes:all_by_output[r['output']['key']].append(r)
    for key in needed:
        options=all_by_output[key]
        ranked=[]
        for r in options:
            n=max((min((cost.get(v,float('inf')) for v in g['options']),default=float('inf')) for g in r['ingredients']),default=float('inf'))
            # Never default to a conversion from a descendant block of the same material.
            cyclic=any(key==v for g in r['ingredients'] for v in g['options'])
            ranked.append((float('inf') if cyclic or n>=cost.get(key,float('inf')) else n+(5 if r.get('manualOnly') else 0),len(r['ingredients']),r['id']))
        if ranked and min(ranked)[0]!=float('inf'):preferred[key]=min(ranked)[2]
        elif key in selectedacq:preferred[key]='@acquire'
    # Preserve the critical release-defined star route, irrespective of easier native variants.
    preferred['allthetweaks:atm_star']=dataset['defaultRecipe']
    for r in guide_recipes:
        if r['output']['key'] in needed:preferred[r['output']['key']]=r['id']
    outputs={r['output']['key'] for r in allrecipes};unresolved=sorted(k for k in needed if k not in outputs and k not in selectedtags and k not in selectedacq)
    report={'inputRecipeResources':len(rawrecipes),'normalizedRecipes':sum(map(len,by_output.values())),'includedRecipes':len(included),'tagCount':len(selectedtags),'acquisitionItems':len(selectedacq),'excludedByPack':removed,'conditionalRecipes':conditional,'unsupported':dict(skipped),'unresolvedMutations':mutations['warnings'],'unresolvedItems':unresolved,'archives':raw['archives']}
    preferred_ingredients={f'{r["id"]}:{i}':min(g['options'],key=lambda k:cost.get(k,float('inf'))) for r in allrecipes for i,g in enumerate(r['ingredients'])}
    write(ROOT/'data/native-expansion.json',{'recipes':list(included.values()),'items':sorted(needed),'tags':selectedtags,'acquisitions':selectedacq,'preferredRecipes':preferred,'preferredIngredients':preferred_ingredients,'tagChoices':tagchoices,'report':{k:v for k,v in report.items() if k not in ['archives','unsupported','unresolvedMutations','unresolvedItems']}})
    write(ROOT/'data/native-expansion-report.json',report)
    print(json.dumps({k:v for k,v in report.items() if k not in ['archives','unsupported','unresolvedMutations','unresolvedItems']},indent=2),flush=True)
    print('Items:',len(needed),'unresolved:',len(unresolved),flush=True)
if __name__=='__main__':main()
