"""Strict, data-only adapters for pinned 1.21.1 recipe JSON. Never runs game code."""
import collections,json,re

def positive(n):
    if isinstance(n,bool) or not isinstance(n,int) or n<=0:raise ValueError('Quantity must be a positive integer')
    return n

def snbt(value):
    if isinstance(value,dict):return '{'+','.join(json.dumps(k,ensure_ascii=False)+':'+snbt(v) for k,v in sorted(value.items()))+'}'
    if isinstance(value,list):return '['+','.join(map(snbt,value))+']'
    return json.dumps(value,ensure_ascii=False,separators=(',',':'))

def stack(value,kind='',zero=False):
    if isinstance(value,str):value={'id':value}
    if not isinstance(value,dict):raise ValueError('Unresolved stack')
    if 'basePredicate' in value:value={**value,**value['basePredicate']}
    if value.get('type') in ['neoforge:components','productivebees:component']:
        value={**value,**value.get('items',{})} if isinstance(value.get('items'),dict) else {**value,'item':value.get('items')}
    key=value.get('id') or value.get('item') or value.get('fluid') or value.get('chemical') or value.get('Name')
    if value.get('tag'):key='#'+value['tag']
    if not isinstance(key,str) or not re.fullmatch(r'#?[a-z0-9_.-]+:[a-z0-9_./-]+',key):raise ValueError('Custom ingredient or unresolved registry key')
    count=value.get('count',value.get('amount',value.get('#',1)))
    if not(zero and count==0):positive(count)
    if value.get('components'):
        key+='['+','.join(k+'='+snbt(v) for k,v in sorted(value['components'].items()))+']'
    if value.get('nbt'):raise ValueError('Legacy NBT needs a dedicated adapter')
    return {'key':kind+key,'count':count}

def ingredient(value,kind='',consumed=True,zero=False):
    if isinstance(value,dict) and value.get('type')=='immersiveengineering:fluid_stack':kind='fluid:'
    if isinstance(value,dict) and 'ingredient' in value:
        base=ingredient(value['ingredient'],kind,consumed);base['count']=positive(value.get('count',value.get('amount',base['count'])));return base
    values=value if isinstance(value,list) else [value]
    stacks=[stack(v,kind,zero) for v in values]
    if not stacks or any(s['count']!=stacks[0]['count'] for s in stacks):raise ValueError('Unequal ingredient alternatives')
    n=stacks[0]['count']
    return {'options':list(dict.fromkeys(s['key'] for s in stacks)),'count':max(1,n),'consumed':consumed and n!=0}

def combine(groups):
    result=[]
    for g in groups:
        existing=next((v for v in result if v['options']==g['options'] and v['consumed']==g['consumed']),None)
        if existing:existing['count']=existing['count']+g['count'] if g['consumed'] else max(existing['count'],g['count'])
        else:result.append(g)
    return result

def normalize(j):
    t=j.get('type','');t=t if ':' in t else 'minecraft:'+t
    ns,name=t.split(':',1)
    base={'type':t,'machine':'minecraft:crafting_table','ingredients':[],'idIsSynthetic':False}
    groups=base['ingredients'];outputs=[]
    def many(v):return v if isinstance(v,list) else [v] if v else []
    def inp(v,kind='',consumed=True,zero=False):groups.append(ingredient(v,kind,consumed,zero))
    def out(v,kind=''):
        if isinstance(v,list):
            for s in v:out(s,kind)
        else:outputs.append((stack(v,kind),v.get('chance',v.get('probability',1)) if isinstance(v,dict) else 1))
    if j.get('transfer_components') or j.get('keepNbtOfReagent') or (t=='mekanism:mek_data'):
        base['notes']='配方可能保留输入物品的数据组件；预览显示基础输出。';base['manualOnly']=True
    if j.get('pattern') and j.get('key') and ('result' in j):
        symbols=list(dict.fromkeys(''.join(j['pattern']).replace(' ','')))
        for symbol in symbols:
            g=ingredient(j['key'][symbol]);g['count']*=sum(row.count(symbol) for row in j['pattern']);groups.append(g)
        base['grid']=[[symbols.index(c) if c!=' ' else -1 for c in row] for row in j['pattern']]
        if t=='create:mechanical_crafting':base['machine']='create:mechanical_crafter'
        out(j['result'])
    elif t in ['minecraft:crafting_shapeless','mysticalagriculture:farmland_tilling']:
        for v in j['ingredients']:inp(v)
        out(j['result'])
    elif t in ['minecraft:smelting','minecraft:blasting','minecraft:smoking','minecraft:campfire_cooking','minecraft:stonecutting']:
        base['machine']={'smelting':'minecraft:furnace','blasting':'minecraft:blast_furnace','smoking':'minecraft:smoker','campfire_cooking':'minecraft:campfire','stonecutting':'minecraft:stonecutter'}[name]
        inp(j['ingredient']);out(j['result']);base['duration']=j.get('cookingtime',0)
        if 'count' in j:outputs[0][0]['count']=positive(j['count'])
        if name!='stonecutting':base['notes']='燃料或热源另行准备，不计入此物料配方。'
    elif t=='minecraft:smithing_transform':
        base['machine']='minecraft:smithing_table'
        for k in ['template','base','addition']:inp(j[k])
        out(j['result'])
    elif ns=='modern_industrialization' and ('item_outputs' in j or 'fluid_outputs' in j):
        base['machine']=t;base['power']=j.get('eu',0);base['duration']=j.get('duration',0)
        for v in many(j.get('item_inputs',[])):inp(v,zero=True)
        for v in many(j.get('fluid_inputs',[])):inp(v,'fluid:',zero=True)
        out(j.get('item_outputs',[]));out(j.get('fluid_outputs',[]),'fluid:')
    elif t=='powah:energizing':
        base['machine']='powah:energizing_orb';base['energy']=j['energy']
        for v in j['ingredients']:inp(v)
        out(j['result'])
    elif t in ['ars_nouveau:enchanting_apparatus','ars_nouveau:imbuement','ars_nouveau:glyph']:
        base['machine']={'enchanting_apparatus':'ars_nouveau:enchanting_apparatus','imbuement':'ars_nouveau:imbuement_chamber','glyph':'ars_nouveau:scribes_table'}[name]
        for v in j.get('pedestalItems',j.get('pedestal_items',j.get('inputs',[]))):inp(v)
        if j.get('reagent'):inp(j['reagent'])
        if j.get('input'):inp(j['input'])
        out(j.get('result',j.get('output')));base['sourceCost']=j.get('sourceCost',j.get('source',0))
    elif t in ['mysticalagriculture:infusion','mysticalagriculture:awakening']:
        base['machine']='mysticalagriculture:awakening_altar' if name=='awakening' else 'mysticalagriculture:infusion_altar'
        inp(j['input'])
        for v in j['ingredients']+j.get('essences',[]):inp(v)
        out(j['result'])
    elif t in ['ae2:charger','ae2:inscriber','ae2:transform']:
        base['machine']='ae2:inscriber' if name=='inscriber' else 'ae2:charger' if name=='charger' else 'minecraft:water_bucket'
        if name=='inscriber':
            for k,v in j['ingredients'].items():inp(v,consumed=not(j.get('mode')=='inscribe' and k in ['top','bottom']))
        elif name=='charger':inp(j['ingredient'])
        else:
            for v in j['ingredients']:inp(v)
            base['notes']='投掷到世界中的原料转化；请满足配方声明的水、爆炸或其他触发条件：'+json.dumps(j.get('circumstance',{}),ensure_ascii=False)
        out(j['result'])
    elif ns=='create' and name in ['crushing','milling','mixing','compacting','pressing','cutting','splashing','haunting','deploying','filling','emptying','sandpaper_polishing']:
        base['machine']='create:'+{'crushing':'crushing_wheel','milling':'millstone','mixing':'mechanical_mixer','compacting':'mechanical_press','pressing':'mechanical_press','cutting':'mechanical_saw','splashing':'encased_fan','haunting':'encased_fan','deploying':'deployer','filling':'spout','emptying':'item_drain','sandpaper_polishing':'sand_paper'}[name]
        for i,v in enumerate(j['ingredients']):inp(v,'fluid:' if isinstance(v,dict) and 'fluid' in v else '',consumed=not(j.get('keepHeldItem') and i==1))
        for v in j['results']:out(v,'fluid:' if 'fluid' in v else '')
        base['duration']=j.get('processingTime',0)
        if j.get('heatRequirement'):base['notes']='加热要求：'+j['heatRequirement']
    elif t=='industrialforegoing:dissolution_chamber':
        base['machine']=t;base['duration']=j['processingTime']
        for v in j['input']:inp(v)
        inp(j['inputFluid'],'fluid:')
        if j.get('output'):out(j['output'])
        if j.get('outputFluid'):out(j['outputFluid'],'fluid:')
    elif t=='mekanism:chemical_conversion':
        base['machine']='mekanism:chemical_oxidizer';inp(j['input']);out(j['output'],'chemical:')
        base['notes']='化学品转换原料。请在接受该化学品的机器中使用；氧化室图标仅作化学转换标识。';base['manualOnly']=True
    elif ns=='mekanism':
        machines={'enriching':'enrichment_chamber','crushing':'crusher','smelting':'energized_smelter','compressing':'osmium_compressor','injecting':'chemical_injection_chamber','purifying':'purification_chamber','metallurgic_infusing':'metallurgic_infuser','combining':'combiner','sawing':'precision_sawmill','crystallizing':'chemical_crystallizer','oxidizing':'chemical_oxidizer','chemical_infusing':'chemical_infuser','washing':'chemical_washer','dissolution':'chemical_dissolution_chamber','centrifuging':'isotopic_centrifuge','activating':'solar_neutron_activator','reaction':'pressurized_reaction_chamber','separating':'electrolytic_separator','evaporating':'thermal_evaporation_controller','nucleosynthesizing':'antiprotonic_nucleosynthesizer','rotary':'rotary_condensentrator'}
        if name not in machines:raise ValueError('Unsupported Mekanism adapter: '+name)
        base['machine']='mekanism:'+machines[name];base['duration']=j.get('duration',0)
        if name=='rotary':
            a=dict(j);a['type']='native:rotary';results=[]
            for ik,ok,itype,otype in [('fluid_input','chemical_output','fluid:','chemical:'),('chemical_input','fluid_output','chemical:','fluid:')]:
                if ik in j and ok in j:
                    r={**base,'ingredients':[ingredient(j[ik],itype)],'output':stack(j[ok],otype)};results.append(r)
            return results
        for k in ['input','item_input','main_input','extra_input','chemical_input','left_input','right_input','fluid_input']:
            if k not in j:continue
            v=j[k];chemical=k in ['chemical_input','left_input','right_input'] or (k=='input' and name in ['crystallizing','centrifuging','activating','washing'])
            inp(v,'chemical:' if chemical else 'fluid:' if k=='fluid_input' or name in ['separating','evaporating'] else '')
        for k in ['output','item_output','main_output','secondary_output','chemical_output','left_chemical_output','right_chemical_output']:
            if k not in j:continue
            kind='chemical:' if 'chemical' in k or (k=='output' and name in ['oxidizing','chemical_infusing','centrifuging','activating','washing','dissolution']) else 'fluid:' if k=='output' and name=='evaporating' else ''
            v=j[k]
            if k=='secondary_output':v={**v,'chance':j.get('secondary_chance',1)}
            out(v,kind)
        if j.get('per_tick_usage'):
            base['manualOnly']=True;base['notes']='化学品按每刻消耗；实际用量受机器速度及升级影响，所示数量是每刻用量，不能按固定批次自动扣料。'
    elif t in ['advanced_ae:reaction','extendedae:crystal_assembler','extendedae:circuit_cutter']:
        base['machine']={'advanced_ae:reaction':'advanced_ae:reaction_chamber','extendedae:crystal_assembler':'extendedae:crystal_assembler','extendedae:circuit_cutter':'extendedae:circuit_cutter'}[t];base['energy']=j.get('input_energy',0)
        for v in j.get('input_items',[]):inp(v)
        if j.get('input'):inp(j['input'])
        if j.get('input_fluid'):inp(j['input_fluid'],'fluid:')
        out(j['output'])
    elif ns=='bigreactors' and name in ['reprocessor','fluidizersolid','fluidizersolidmixing','fluidizerfluidmixing']:
        base['machine']='bigreactors:reprocessorcontroller' if name=='reprocessor' else 'bigreactors:fluidizercontroller'
        for key in ['ingredient','ingredient1','ingredient2','waste']:
            if j.get(key):inp(j[key],'fluid:' if name=='fluidizerfluidmixing' else '')
        if j.get('fluid'):inp(j['fluid'],'fluid:')
        out(j['result'],'' if name=='reprocessor' else 'fluid:')
        base['manualOnly']=True;base['notes']='多方块设备运行与燃料/能量条件另行满足；请按实际加工结果登记。'
    elif t=='industrialforegoing:fluid_extractor':
        base['machine']='industrialforegoing:fluid_extractor';inp(j['input'],consumed=False);out(j['output'],'fluid:');base['manualOnly']=True
        base['notes']='流体提取机持续处理面前方块。方块破坏概率 '+str(j.get('breakChance','待核验'))+'；所示产量为一次处理的流体量。'
    elif t=='cataclysm:weapon_fusion':
        base['machine']='cataclysm:mechanical_fusion_anvil';inp(j['base']);inp(j['addition']);out(j['result'])
    elif ns=='immersiveengineering' and name in ['blueprint','crusher','metal_press','alloy','arc_furnace','fermenter','squeezer','blast_furnace','bottling_machine','coke_oven','hammer_crushing','mixer','refinery','sawmill']:
        base['machine']='immersiveengineering:'+{'blueprint':'workbench','alloy':'alloybrick','blast_furnace':'blastbrick','coke_oven':'cokebrick','hammer_crushing':'hammer'}.get(name,name)
        base['energy']=j.get('energy',0);base['duration']=j.get('time',0)
        for k in ['input','input0','input1']:
            if j.get(k):inp(j[k],'fluid:' if name=='refinery' else '')
        for k in ['inputs','additives']:
            for v in j.get(k,[]):inp(v)
        if j.get('mold'):inp(j['mold'],consumed=False)
        if j.get('catalyst'):inp(j['catalyst'],consumed=False)
        if j.get('fluid'):
            if name in ['fermenter','squeezer']:out(j['fluid'],'fluid:')
            else:inp(j['fluid'],'fluid:')
        if j.get('result'):out(j['result'],'fluid:' if name in ['mixer','refinery'] else '')
        if j.get('results'):out(j['results'])
        if j.get('slag'):out(j['slag'])
        if j.get('creosote'):out({'id':'immersiveengineering:creosote','amount':j['creosote']},'fluid:')
        if name=='blueprint':base['manualOnly']=True;base['notes']='工程师工作台蓝图类别：'+j.get('category','')+'。需准备对应蓝图。'
        if name in ['blast_furnace','coke_oven','alloy','arc_furnace']:base['notes']='燃料、热源及设备运行条件另行准备。'
    elif t in ['occultism:spirit_fire','occultism:ritual','rootsclassic:ritual']:
        base['machine']='occultism:golden_sacrificial_bowl' if ns=='occultism' else 'rootsclassic:ritual_brazier'
        if t=='occultism:spirit_fire':inp(j['ingredient']);out(j['result']);base['notes']='在异界之火中转化。'
        elif t=='occultism:ritual':
            if j.get('ritual_type')!='occultism:craft':raise ValueError('Summoning ritual is not item crafting')
            for v in j['ingredients']:inp(v)
            inp(j['activation_item']);out(j['result']);base['duration']=j.get('duration',0)*20
            base['notes']='按仪式图形 '+j.get('pentacle_id','')+' 布置粉笔及碗，以绑定之书启动。';base['manualOnly']=True
        else:
            if j.get('effect')!='rootsclassic:crafting':raise ValueError('Non-crafting Roots ritual')
            for v in j['ingredients']+j.get('incenses',[]):inp(v)
            out(j['effectConfig']['result']);base['notes']='需要等级 '+str(j.get('level',0))+' 的仪式设施，按配方准备香料和祭品。';base['manualOnly']=True
    elif t=='pneumaticcraft:pressure_chamber':
        base['machine']='pneumaticcraft:pressure_chamber_interface'
        for v in j['inputs']:inp(v)
        out(j['results']);base['notes']='所需压力：'+str(j.get('pressure',0))+' bar。'
    elif ns=='neovitae' and name in ['alchemytable','ara_vitae_recipe','hellfire_forge','hellfire_forge_transform','array','athanor']:
        base['machine']='neovitae:'+{'alchemytable':'alchemy_table','ara_vitae_recipe':'blood_altar','hellfire_forge_transform':'hellfire_forge','array':'arcane_ashes','athanor':'athanor'}.get(name,name)
        for k in ['input','inputs','baseinput','addedinput','transformInput','catalysts']:
            for v in many(j.get(k)):inp(v)
        if j.get('tool'):inp(j['tool'],consumed=False)
        if j.get('input_fluid'):inp(j['input_fluid'],'fluid:')
        out(j.get('output',j.get('guaranteed_outputs')))
        for v in j.get('chance_outputs',[]):out({**v['item'],'chance':v['chance']})
        base['manualOnly']=True;base['notes']='灵魂/血量及等级要求：'+json.dumps({k:j[k] for k in ['syphon','bloodNeeded','minTier','upgradeLevel','drain','minDrain','spiritus_costs'] if k in j},ensure_ascii=False)
    elif ns=='evilcraft' and name in ['blood_infuser','sanguinary_environmental_accumulator']:
        base['machine']=t
        if j.get('input_item'):inp(j['input_item'])
        if j.get('input_fluid'):inp(j['input_fluid'],'fluid:')
        out(j['output_item']);base['duration']=j.get('duration',0);base['notes']='设备等级要求：'+str(j.get('tier',0))
    elif ns=='oritech' and name in ['pulverizer','grinder','assembler','foundry','centrifuge','centrifuge_fluid','atomic_forge','refinery','particle_collision']:
        machine={'grinder':'pulverizer','centrifuge_fluid':'centrifuge','particle_collision':'particle_collector'}.get(name,name)
        base['machine']='oritech:'+machine+'_block';base['duration']=j.get('time',0)
        for v in j.get('ingredients',[]):inp(v)
        if j.get('fluidInput'):
            v=j['fluidInput'];inp({**v,'amount':v.get('amount',1000)},'fluid:')
        out(j.get('results',[]))
        for v in j.get('fluidOutputs',[]):out({**v,'amount':v.get('amount',1000)},'fluid:')
        base['notes']='设备运行耗能及环境条件由机器配置控制；物料数量来自本版配方。'
        if name in ['grinder','particle_collision']:base['manualOnly']=True;base['notes']+=' 需要检查对应加工/粒子加速器结构，按实际产出登记。'
    elif t=='apothic_enchanting:infusion':
        base['machine']='minecraft:enchanting_table';inp(j['input']);out(j['result']);base['manualOnly']=True
        base['notes']='附魔灌注。最低属性：'+json.dumps(j.get('requirements',{}),ensure_ascii=False)+'；最高属性：'+json.dumps(j.get('max_requirements',{}),ensure_ascii=False)+'。另需等级、青金石及附魔机制条件。'
    elif t=='productivetrees:tree_pollination':
        base['machine']='minecraft:bee_nest';inp(j['leafA'],consumed=False);inp(j['leafB'],consumed=False);out({**j['result'],'chance':j.get('chance',1)})
        base['manualOnly']=True;base['notes']='将两类树叶布置在蜜蜂传粉范围内，杂交结果具有概率；不消耗这两份环境树叶。'
    else:raise ValueError('No adapter: '+t)
    if not groups and outputs and ns=='modern_industrialization':
        inp(base['machine'],consumed=False);base['manualOnly']=True;base['notes']='原始配方未声明消耗型物料输入；设备、环境和电力需另行满足。设备只列作前置条件。'
    if not groups or not outputs:raise ValueError('Incomplete recipe')
    base['ingredients']=combine(groups)
    result=[]
    for output,chance in outputs:
        if not isinstance(chance,(float,int)) or not 0<chance<=1:raise ValueError('Unsupported chance')
        r={**base,'output':output}
        if output['key'].startswith('#') or output['key'].startswith('fluid:#'):
            r['manualOnly']=True;r['notes']=(r.get('notes','')+' 输出声明为材料标签，最终统一物品由运行时决定。').strip()
        if chance!=1:r['chance']=chance;r['manualOnly']=True
        if len(outputs)>1:r['coProducts']=[{**s,'chance':c} for s,c in outputs if s is not output];r['manualOnly']=True;r['notes']=(r.get('notes','')+' 多产物加工，按实际产出手动登记；不会自动增加副产物。').strip()
        result.append(r)
    return result

def flatten_tag(key,tags,seen=None):
    seen=set() if seen is None else set(seen)
    if key in seen:return []
    seen.add(key);result=[]
    for value in tags.get(key,[]):
        if isinstance(value,dict):value=value.get('id','')
        if not isinstance(value,str):continue
        nested=flatten_tag(value,tags,seen) if value.startswith('#') or value.startswith('fluid:#') or value.startswith('chemical:#') else [value]
        result.extend(nested)
    return list(dict.fromkeys(result))

def loot_items(loot):
    result=[]
    def walk(node,conditions):
        if isinstance(node,list):
            for child in node:walk(child,conditions)
        elif isinstance(node,dict):
            conditions=conditions+node.get('conditions',[])
            if node.get('type')=='minecraft:item' and isinstance(node.get('name'),str):
                result.append({'key':node['name'],'conditions':json.dumps(conditions,ensure_ascii=False,separators=(',',':')),'functions':json.dumps(node.get('functions',[]),ensure_ascii=False,separators=(',',':'))})
            for k in ['pools','entries','children']:walk(node.get(k,[]),conditions)
    walk(loot,[]);return result
