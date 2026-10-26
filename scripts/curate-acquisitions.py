"""Version-pinned, inspectable special acquisition notes and manual prerequisites."""
import hashlib,json,pathlib,zipfile,re
ROOT=pathlib.Path(__file__).resolve().parents[1];UP=ROOT/'data/upstream'
d=json.loads((ROOT/'src/data/atm10-8.3.json').read_text(encoding='utf-8'));records={};guides=[]
def source(glob,suffix):
    jars=sorted((UP/'mods').glob(glob))+sorted(UP.glob(glob))
    for path in jars:
        with zipfile.ZipFile(path) as z:
            names=[n for n in z.namelist() if n.endswith(suffix)]
            if names:
                p=names[0];b=z.read(p);return {'path':path.name+'!/'+p,'line':1,'sha256':hashlib.sha256(b).hexdigest(),'url':'https://piston-data.mojang.com/v1/objects/30c73b1c5da787909b2f73340419fdf13b9def88/client.jar' if path.name=='minecraft-1.21.1-client.jar' else 'https://www.curseforge.com/minecraft/modpacks/all-the-mods-10/files/9190182'}
    raise ValueError('Missing authoritative resource '+glob+' / '+suffix)
def add(key,title,text,glob,suffix,requirements=None,machine=None):
    try:s=source(glob,suffix)
    except ValueError as e:print(str(e));return
    records.setdefault(key,[]).append({'kind':'manual','title':title,'description':text+' 此说明来自静态手册/代码资源，具体操作条件和数值尚未游戏内核验。','source':s})
    if requirements:
        guides.append({'id':'guide:'+hashlib.sha256(key.encode()).hexdigest()[:18],'type':'manual:acquisition','native':True,'manualOnly':True,'machine':machine or requirements[0][0],'output':{'key':key,'count':1},'ingredients':[{'options':[k],'count':n,'consumed':False} for k,n in requirements],'idIsSynthetic':True,'notes':text+' 所列是操作前置条件，不代表每次操作的消耗量或固定产量。请按实际结果登记。','source':s})
add('fluid:industrialforegoing:pink_slime','屠宰场产液','使用屠宰场处理生物并收集粉红史莱姆液体。机器、电力、生物供给和实际产液量需另行准备。','industrialforegoing*.jar','en_us/entries/agr_hus/pink_slime.json',[('industrialforegoing:mob_slaughter_factory',1)])
add('fluid:industrialforegoing:ether_gas','凋灵上方的流体镭射钻','按手册将流体镭射基座直接置于凋灵上方，并配套镭射钻和电力；收集产生的乙醚气体。','industrialforegoing*.jar','en_us/entries/resource_production/ether_gas.json',[('industrialforegoing:fluid_laser_base',1),('industrialforegoing:laser_drill',1)])
add('fluid:industrialforegoing:latex','流体提取机','将流体提取机对准可提取的原木，收集胶乳；具体木材与产率以本版手册和游戏显示为准。','industrialforegoing*.jar','en_us/entries/basics/fluid_extractor.json',[('industrialforegoing:fluid_extractor',1),('minecraft:oak_log',1)])
add('chemical:mekanism:antimatter','SPS 反物质生产','在组装完成的超临界移相器 SPS 中输入钋和大量能量，收集反物质化学品。它不是普通工作台配方；吞吐量、能耗和数量转换受本版运行时配置控制。','Mekanism-1*.jar','content/sps/SPSMultiblockData.class',[('chemical:mekanism:polonium',1),('mekanism:sps_casing',1),('mekanism:sps_port',1)])
add('chemical:mekanism:nuclear_waste','裂变反应堆废料','组装并安全运行裂变反应堆，输入裂变燃料；废料通过反应堆端口导出。冷却、辐射与反应堆运行条件请按游戏内资料核对。','MekanismGenerators*.jar','content/fission/FissionReactorMultiblockData.class',[('mekanism:fission_reactor_casing',1),('chemical:mekanism:fissile_fuel',1)])
add('ae2:matter_ball','物质聚合器','向物质聚合器输入可销毁的物品或流体，并安装所需储存组件，选择物质球产出模式。物料总量以机器界面为准。','appliedenergistics2-*.jar','blockentity/misc/CondenserBlockEntity.class',[('ae2:condenser',1)])
add('deeperdarker:heart_of_the_deep','监守者额外掉落','本版全局掉落修饰器向监守者掉落表加入深邃之心。击败监守者后收集，游戏运行时仍可能受其他掉落修改影响。','deeperdarker*.jar','data/deeperdarker/loot_modifiers/warden_heart_from_warden.json')
star_source=source('minecraft-1.21.1-client.jar','ciu.class')
records['minecraft:nether_star']=[{'kind':'mob','title':'击败凋灵','description':'下界之星由凋灵的死亡处理代码生成，不在普通 JSON 掉落表中。召唤并击败凋灵后收集；难度和其他模组修改仍以游戏内为准。','source':star_source}]
for key,item in d['items'].items():
    if not item.get('components'):continue
    base=item['id'];components=item['components']
    fluid=re.search(r'fluid_content=\{amount:(\d+),id:"([^"]+)"',components)
    if fluid:
        add(key,'向物品注入流体',f'准备未装填的 {base}，使用兼容的流体输入方式注入 {fluid[2]} 至 {fluid[1]} mB。配方要求精确的流体组件，不可用空物品替代。','evilcraft*.jar','item/ItemMaceOfDestruction.class' if 'mace_of_destruction' in base else 'blockentity/BlockEntityDarkTank.class',[(base,1),('fluid:'+fluid[2],int(fluid[1]))])
    elif key.startswith('hostilenetworks:data_model['):
        add(key,'末影龙模型训练','将对应末影龙数据模型放入深度学习仪，随身携带并击败对应生物，达到可模拟等级后可用模拟室继续训练。此配方要求的 data 组件必须完全匹配（如 1255）；训练等级与数值不能仅凭基础模型推断。','ATM10-8.3.zip','data/hostilenetworks/data_models/ender_dragon.json',[('hostilenetworks:deep_learner',1),('hostilenetworks:data_model',1)])
    elif key.startswith('ae2wtlib:wireless_universal_terminal['):
        add(key,'终端模块与充能','准备通用无线终端，按终端模组方式装入该配方要求的所有终端功能，并充能到组件指定值 6,400,000。此步骤需要检查组件，普通空终端不等价。','ae2wtlib-*.jar','META-INF/neoforge.mods.toml',[(base,1)])
    elif key.startswith('justdirethings:creaturecatcher[') and 'dragon_familiar' in key:
        add(key,'召唤并捕获巨龙魔灵','先完成 Occultism 的巨龙魔灵召唤仪式，再使用生物捕捉器捕获。需要实体类型精确匹配 occultism:dragon_familiar。仪式环境与召唤代价按游戏内恶魔之梦核对。','occultism*.jar','data/occultism/recipe/ritual/familiar_dragon.json',[(base,1)])
    elif key.startswith('irons_spellbooks:scroll['):
        add(key,'指定法术和等级的卷轴','此配方要求凋零之颅 X（等级 10）卷轴及对应法术组件。请从本版法术书系统取得并核对等级；普通卷轴或其他等级不等价，尚未静态核实其完整生成机制。','irons_spellbooks*.jar','META-INF/neoforge.mods.toml')
    elif 'productivebees:soul_lava' in key:
        add(key,'灵魂熔岩蜜蜂转化/浇铸','本版资源声明幽灵蜜蜂可通过灵魂熔岩转化；Productive Metalworks 存在时使用对应浇铸路线。获得蜜蜂后用模组提供的捕获方式取得匹配实体数据的物品。原版刷怪蛋与不同蜜蜂类型不等价。','productivemetalworks*.jar','data/productivemetalworks/recipe/casting/pbees/soul_lava_bee.json',[('allthemodium:soul_lava_bucket',1)])
    elif 'productivebees:withered' in key:
        add(key,'凋零蜜蜂产物','骷髅蜜蜂可用凋零玫瑰转化为凋零蜜蜂；在高级蜂箱满足生产条件后取得对应蜂脾。注意配方脚本的 configurable_comb 与本版原生 configurable_honeycomb 标识差异需游戏内核验，不自动互换。','productivebees*.jar','data/productivebees/recipe/bee_conversion/withered_bee.json',[('productivebees:advanced_oak_beehive',1),('minecraft:wither_rose',1)])
(ROOT/'data/acquisition-overrides.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(ROOT/'data/manual-acquisition-recipes.json').write_text(json.dumps(guides,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Curated acquisition items',len(records),'manual prerequisite guides',len(guides))
