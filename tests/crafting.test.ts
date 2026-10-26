import {expect,it} from 'vitest';
import raw from '../src/data/atm10-8.3.json?raw';
import type {Dataset} from '../src/domain/types';
import {createProject} from '../src/domain/project';
import {buildPlan} from '../src/domain/planner';
import {recordCraft} from '../src/domain/crafting';
const data=JSON.parse(raw) as Dataset;
it('confirming a craft consumes recorded ingredients and adds the output',()=>{
  const p=createProject(data,'mysticalagradditions:creative_essence',1);
  const recipe=data.recipes.find(r=>r.output.key===p.target)!;
  for(const g of recipe.ingredients)p.inventory[g.options[0]]=g.count;
  const plan=buildPlan(data,p),updated=recordCraft(data,p,plan.root);
  expect(updated.inventory[p.target]).toBe(1);
  expect(updated.inventory['mysticalagradditions:insanium_block']).toBe(0);
  expect(updated.inventory['mysticalagradditions:insanium_gemstone_block']).toBe(0);
  expect(p.inventory[p.target]).toBeUndefined();
});
it('cannot confirm crafting when direct materials have not been recorded',()=>{
  const p=createProject(data,'allthetweaks:atm_star',1);
  expect(()=>recordCraft(data,p,buildPlan(data,p).root)).toThrow();
});
it('rejects a crafted-node payload whose output differs from its recipe',()=>{
  const p=createProject(data,'mysticalagradditions:creative_essence',1);
  const recipe=data.recipes.find(r=>r.output.key===p.target)!;
  for(const g of recipe.ingredients)p.inventory[g.options[0]]=g.count;
  const node=buildPlan(data,p).root;
  expect(()=>recordCraft(data,p,{...node,key:'allthetweaks:atm_star'})).toThrow();
});
