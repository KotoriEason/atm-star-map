import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseScript, parseRecipeJson } from './recipe-parser.mjs';
import { applyPresentation } from './item-presentation.mjs';

const root = 'data/upstream/release/overrides';
const digest = data => createHash('sha256').update(data).digest('hex');
const manifest = JSON.parse(readFileSync('data/upstream/release/manifest.json', 'utf8'));
if (manifest.version !== '8.3' || manifest.minecraft.version !== '1.21.1' || manifest.minecraft.modLoaders[0].id !== 'neoforge-21.1.259') throw new Error('Wrong release manifest');
const expectedHash = '24440fb355de69b28af6ff18556b5d0598bb93570b2b745552cdb1bcb5448c8f';
if (digest(readFileSync('data/upstream/ATM10-8.3.zip')) !== expectedHash) throw new Error('Release archive hash mismatch');

const names = {
  'allthetweaks:atm_star': ['ATM 之星','ATM Star'],
  'allthetweaks:dimensional_seed': ['维度之种','Dimensional Seed'],
  'allthetweaks:dragon_soul': ['龙之魂','Dragon Soul'],
  'allthetweaks:improbable_probability_device': ['不可能概率装置','Improbable Probability Device'],
  'allthetweaks:nexium_emitter': ['涅希姆发射器','Nexium Emitter'],
  'allthetweaks:withers_compass': ['凋灵罗盘',"Wither's Compass"],
  'allthetweaks:oblivion_shard': ['湮灭碎片','Oblivion Shard'],
  'allthetweaks:philosophers_fuel': ['贤者燃料',"Philosopher's Fuel"],
  'allthetweaks:pulsating_black_hole': ['脉动黑洞','Pulsating Black Hole'],
  'allthetweaks:patrick_star': ['派大星','Patrick Star'],
  'allthetweaks:mini_nether': ['微型下界','Mini Nether'],
  'allthetweaks:mini_end': ['微型末地','Mini End'],
  'allthetweaks:mini_exit': ['微型返回传送门','Mini Exit'],
  'allthetweaks:atm_star_shard': ['ATM 之星碎片','ATM Star Shard'],
  'mysticalagradditions:creative_essence': ['创造精华','Creative Essence'],
  'allthecompressed:nether_star_block_3x': ['三重压缩下界之星块','Nether Star Block 3x'],
  'allthemodium:unobtainium_allthemodium_alloy_block': ['难得素–ATM 合金块','Unobtainium–Allthemodium Alloy Block'],
  'allthemodium:unobtainium_vibranium_alloy_block': ['难得素–振金合金块','Unobtainium–Vibranium Alloy Block'],
  'allthemodium:vibranium_allthemodium_alloy_block': ['振金–ATM 合金块','Vibranium–Allthemodium Alloy Block'],
  'minecraft:crafting_table':['工作台','Crafting Table'],
  'modern_industrialization:star_altar':['符文星坛','Runic Star Altar'],
  'modern_industrialization:runic_enchanter':['符文附魔器','Runic Enchanter'],
  'modern_industrialization:auto_forge':['自动锻造炉','Auto Forge'],
  'modern_industrialization:runic_crucible':['符文坩埚','Runic Crucible'],
  'powah:energizing_orb':['充能球','Energizing Orb'],
  'ars_nouveau:enchanting_apparatus':['灌注装置','Enchanting Apparatus'],
  'industrialforegoing:dissolution_chamber':['溶解室','Dissolution Chamber'],
  'create:mechanical_crafter':['动力合成器','Mechanical Crafter'],
  'minecraft:nether_star':['下界之星','Nether Star'],
  'allthetweaks:nether_star_block':['下界之星块','Nether Star Block'],
  'mysticalagradditions:insanium_block':['终极精华块','Insanium Block'],
  'mysticalagradditions:insanium_gemstone_block':['终极宝石块','Insanium Gemstone Block'],
  'mysticalagriculture:master_infusion_crystal':['大师灌注水晶','Master Infusion Crystal'],
  'minecraft:obsidian':['黑曜石','Obsidian'],
  'minecraft:diamond':['钻石','Diamond'],
  'minecraft:ender_eye':['末影之眼','Eye of Ender'],
  'minecraft:dragon_egg':['龙蛋','Dragon Egg'],
  'minecraft:end_crystal':['末地水晶','End Crystal'],
  'minecraft:enchanted_book':['附魔书','Enchanted Book'],
  'allthemodium:piglich_heart_block':['猪灵之心块','Piglich Heart Block'],
  'allthemodium:piglich_heart':['猪灵之心','Piglich Heart'],
  'mekanism:pellet_antimatter':['反物质颗粒','Antimatter Pellet'],
  'ae2:singularity':['奇点','Singularity'],
  'mysticalagriculture:awakened_supremium_essence':['觉醒至高精华','Awakened Supremium Essence'],
  'mysticalagriculture:awakened_supremium_gemstone':['觉醒至高宝石','Awakened Supremium Gemstone'],
  'apothic_enchanting:infused_breath':['灌注龙息','Infused Breath']
};
const mods = {
  allthetweaks:'AllTheTweaks',allthemodium:'Allthemodium',allthecompressed:'AllTheCompressed',
  minecraft:'Minecraft',kubejs:'ATM10 · KubeJS',modern_industrialization:'Modern Industrialization',
  mysticalagriculture:'Mystical Agriculture',mysticalagradditions:'Mystical Agradditions',
  ae2:'Applied Energistics 2',advanced_ae:'Advanced AE',ae2wtlib:'AE2 Wireless Terminals',
  powah:'Powah!',ars_nouveau:'Ars Nouveau',industrialforegoing:'Industrial Foregoing',
  apothic_enchanting:'Apothic Enchanting',occultism:'Occultism',productivetrees:'Productive Trees',
  productivebees:'Productive Bees',hostilenetworks:'Hostile Neural Networks',cataclysm:"L_Ender's Cataclysm",
  eternal_starlight:'Eternal Starlight',mekanism:'Mekanism',pneumaticcraft:'PneumaticCraft',
  ironfurnaces:'Iron Furnaces',irons_spellbooks:"Iron's Spells ’n Spellbooks",evilcraft:'EvilCraft',
  create:'Create',forbidden_arcanus:'Forbidden & Arcanus',c:'通用材料标签'
};
const title = s => s.replaceAll('_',' ').replaceAll('/',' · ').replace(/\b\w/g,c=>c.toUpperCase());
const items = {};
function addItem(key) {
  if (items[key]) return;
  const fluid = key.startsWith('fluid:'), chemical=key.startsWith('chemical:');
  const raw = fluid ? key.slice(6) : chemical?key.slice(9):key;
  const id = raw.split('[')[0], tag = id.startsWith('#');
  const clean = id.replace(/^#/,'');
  const [namespace, local] = clean.split(':');
  let [name, englishName] = names[id] ?? [title(local),title(local)];
  const compressed=local.match(/^(nether_star_block|diamond_block|emerald_block|netherrack|obsidian|end_stone|nitro_crystal_block)_(\d+)x$/);
  if(namespace==='allthecompressed'&&compressed){const base={nether_star_block:'下界之星块',diamond_block:'钻石块',emerald_block:'绿宝石块',netherrack:'下界岩',obsidian:'黑曜石',end_stone:'末地石',nitro_crystal_block:'充能水晶块（Nitro）'}[compressed[1]];name=`${compressed[2]} 重压缩${base}`;}
  if(id==='allthecompressed:nether_star_block_3x')name='三重压缩下界之星块';
  if (key.includes('unobtainium_vibranium_alloy_block[')) { name='觉醒难得素–振金合金块';englishName='Awakened Unobtainium–Vibranium Alloy Block'; }
  else if (key.includes('patrick_star[')) { name='注魔派大星';englishName='Infused Patrick Star'; }
  else if (raw.includes('[')) {
    const levels=raw.match(/levels:\{["']?([\w:]+)["']?:(\d+)/),knownEnchant={unbreaking:'耐久',mending:'经验修补',impaling:'穿刺',protection:'保护',sharpness:'锋利',efficiency:'效率'};
    const enchant=levels?`${knownEnchant[levels[1].split(':').at(-1)]??title(levels[1].split(':').at(-1))} ${levels[2]}`:null;
    name += enchant ? ` · ${enchant}` : ' · 特定数据';
    const data=raw.match(/hostilenetworks:data=(\d+)/);if(data)name=`末影龙数据模型 · 数据 ${data[1]}`;
  }
  if(tag) name=`任意 ${name}`;
  items[key]={key,id,name,englishName,mod:mods[namespace]??title(namespace),kind:fluid?'fluid':chemical?'chemical':tag?'tag':'item',...(raw.includes('[')?{components:raw.slice(raw.indexOf('['))}:{} )};
}

const recipes = [], warnings = [], sources = [];
// Eternal Starlight is explicitly present in the release manifest and its packaged scripts.
const loadedMods = new Set(['eternal_starlight','eternal-starlight']);
for (const relative of readdirSync(`${root}/kubejs/server_scripts`,{recursive:true}).filter(p=>p.endsWith('.js')).sort()) {
  const path=`kubejs/server_scripts/${relative.replaceAll('\\','/')}`;
  const bytes=readFileSync(`${root}/${path}`), hash=digest(bytes);
  const result=parseScript(bytes.toString('utf8'),path,{loadedMods});
  for (const r of result.recipes) {
    // Platform-conditional recipes outside the verified critical files need runtime evaluation.
    // Every record remains explicitly marked as a static source declaration.
    r.source.sha256=hash; r.source.url='https://www.curseforge.com/minecraft/modpacks/all-the-mods-10/files/9190157';
    recipes.push(r);
    addItem(r.output.key); addItem(r.machine);
    r.ingredients.forEach(g=>g.options.forEach(addItem));
  }
  if(result.recipes.length || result.warnings.length) sources.push({path,sha256:hash,recipes:result.recipes.length,unresolved:result.warnings.length});
  warnings.push(...result.warnings);
}
const compressedFileId=manifest.files.find(f=>f.projectID===514045)?.fileID;
if(compressedFileId!==7361502)throw new Error('AllTheCompressed version does not match release manifest');
const compressedHash='d1b0c1135d8c206b8f18c73afa08256c74f8b9504626f90e2a64614c92163c36';
if(digest(readFileSync('data/upstream/allthecompressed-1.21.1-4.4.0.jar'))!==compressedHash)throw new Error('AllTheCompressed archive hash mismatch');
const compressedBase='data/upstream/compressed';
for(const name of readdirSync(`${compressedBase}/data/allthecompressed/recipe/compress`).filter(n=>/^(nether_star_block|diamond_block|emerald_block|netherrack|obsidian|end_stone|nitro_crystal_block)_\d+x\.json$/.test(n)).sort()) {
  const path=`data/allthecompressed/recipe/compress/${name}`,bytes=readFileSync(`${compressedBase}/${path}`);
  const recipe=parseRecipeJson(JSON.parse(bytes),path);
  recipe.source={path:`mod:allthecompressed/${path}`,line:1,sha256:digest(bytes),url:'https://www.curseforge.com/minecraft/mc-mods/allthecompressed/files/7361502'};
  recipes.push(recipe);addItem(recipe.output.key);recipe.ingredients.forEach(g=>g.options.forEach(addItem));
  sources.push({path:recipe.source.path,sha256:recipe.source.sha256,recipes:1,unresolved:0});
}
// Explicit IDs can be replaced by later declarations. Keep the last declaration.
const unique=[...new Map(recipes.map(r=>[r.id,r])).values()];
const expansion=existsSync('data/native-expansion.json')?JSON.parse(readFileSync('data/native-expansion.json','utf8')):null;
if(expansion){
  for(const key of expansion.items)addItem(key);
  const existing=new Set(unique.map(r=>r.id));
  for(const r of expansion.recipes)if(!existing.has(r.id)){unique.push(r);existing.add(r.id);}
  for(const [key,members] of Object.entries(expansion.tags))if(members.length){
    unique.push({id:`tag:${key}`,type:'material:tag',virtual:true,native:true,machine:'minecraft:crafting_table',output:{key,count:1},ingredients:[{options:members,count:1,consumed:true}],idIsSynthetic:true,
      source:{path:'pinned archives: resolved material tags',line:1,sha256:digest(JSON.stringify(members)),url:'https://www.curseforge.com/minecraft/modpacks/all-the-mods-10/files/9190182'},notes:'材料标签选择。成员共享标签需求，不能把标签当作物品合成；请记录实际材料的持有量。'});
  }
}
const star=unique.find(r=>r.output.key==='allthetweaks:atm_star' && r.ingredients.length===13);
if(!star) throw new Error('Missing verified ATM Star main route');
const dataset={
  schema:1,id:'atm10-8.3-release-scripts-v1',pack:'All the Mods 10',version:'8.3',minecraft:'1.21.1',loader:'neoforge-21.1.259',
  release:{fileId:9190157,url:'https://www.curseforge.com/minecraft/modpacks/all-the-mods-10/files/9190157',sha256:expectedHash,verifiedOn:'2026-10-25',nativeMods:[{id:'allthecompressed',version:'4.4.0',projectId:514045,fileId:7361502,sha256:compressedHash}]},
  coverage:{level:'release-script',runtimeVerified:false,filesScanned:174,parsedRecipes:unique.length,unresolvedExpressions:warnings.length,note:'配方来自官方 8.3 发布包脚本，以及发布包锁定的部分 AllTheCompressed 原生配方。未启动游戏验证；不包含全部模组原生配方、标签成员、工具合成余物和获取方式。配方移除、运行时修改和特殊系统可能影响最终结果。'},
  defaultRecipe:star.id,items,recipes:unique,sources
};
// MasterInfusionCrystalItem extends Cucumber BaseReusableItem(0): unlimited reuse.
dataset.reusableItems=['mysticalagriculture:master_infusion_crystal'];
if(expansion){Object.assign(dataset,{tags:expansion.tags,acquisitions:expansion.acquisitions,preferredRecipes:expansion.preferredRecipes,preferredIngredients:expansion.preferredIngredients,tagChoices:expansion.tagChoices,expansion:expansion.report});
  dataset.coverage.level='release-resources';dataset.coverage.note='配方来自 ATM10 8.3 锁定的原版、模组 JSON 与发布包脚本；静态处理可解析的配方移除和替换规则。条件未知、概率产出、运行时操作和未支持类型均有标注，尚未启动完整游戏核验最终 RecipeManager。';
}
mkdirSync('src/data',{recursive:true}); mkdirSync('data',{recursive:true});
const presentation=existsSync('data/item-presentation.json')?JSON.parse(readFileSync('data/item-presentation.json','utf8')):null;
const enriched=presentation&&Object.keys(items).every(k=>presentation.items[k])?applyPresentation(dataset,presentation):{...dataset,items:Object.fromEntries(Object.entries(items).map(([k,v])=>[k,{...v,...presentation?.items[k]}]))};
writeFileSync('src/data/atm10-8.3.json',JSON.stringify(enriched)+'\n');
writeFileSync('data/extraction-report.json',JSON.stringify({sources,warnings},null,2)+'\n');
console.log(JSON.stringify({items:Object.keys(items).length,recipes:unique.length,unresolved:warnings.length,star:star.id},null,2));
