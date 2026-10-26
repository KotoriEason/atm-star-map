import {it,expect} from 'vitest';
import {parseScript} from '../scripts/recipe-parser.mjs';
it('collects static removal and replacement filters without executing scripts',()=>{
 const r=parseScript(`ServerEvents.recipes(e=>{for(const m of ['iron','gold'])e.remove({id:'pack:'+m});e.remove({output:/pack:creative_.*/});e.replaceInput({type:'minecraft:crafting_shaped'},'#c:ingots/copper','pack:copper');})`,'fixture');
 expect(r.mutations).toEqual([{action:'remove',args:[{id:'pack:iron'}]},{action:'remove',args:[{id:'pack:gold'}]},{action:'remove',args:[{output:{$regex:'pack:creative_.*',flags:''}}]},{action:'replaceInput',args:[{type:'minecraft:crafting_shaped'},'#c:ingots/copper','pack:copper']}]);
});
it('captures resolved custom JSON for dedicated native adapters without running it',()=>{
 const r=parseScript(`ServerEvents.recipes(e=>e.custom({type:'mysticalagriculture:awakening',input:{item:'pack:essence'},result:{id:'pack:awakened'}}).id('pack:awakening'))`,'fixture');
 expect(r.customRecipes[0].id).toBe('pack:awakening');expect(r.customRecipes[0].json.type).toBe('mysticalagriculture:awakening');
});
