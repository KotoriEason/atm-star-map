import {describe, expect, it} from 'vitest';
import {buildPlan} from '../src/domain/planner';
import type {Dataset, Project, Recipe} from '../src/domain/types';
const recipe = (id:string, output:string, count:number, inputs:[string,number,boolean?][]):Recipe => ({id,type:'shapeless',machine:'minecraft:crafting_table',output:{key:output,count},ingredients:inputs.map(([key,n,consumed])=>({options:[key],count:n,consumed:consumed??true})),idIsSynthetic:false,source:{path:'fixture',line:1,sha256:'a'.repeat(64),url:'https://example.com'}});
const data = (recipes:Recipe[]):Dataset => ({id:'test',defaultRecipe:'root',recipes,items:{},schema:1,pack:'test',version:'8.3',minecraft:'1.21.1',loader:'test',release:{fileId:1,url:'',sha256:'',verifiedOn:''},coverage:{level:'test',runtimeVerified:false,filesScanned:1,parsedRecipes:recipes.length,unresolvedExpressions:0,note:''},sources:[]});
const project = (inventory:Record<string,number>={},quantity=1):Project => ({id:'one',name:'one',datasetId:'test',target:'pack:root',quantity,inventory,recipeChoices:{},ingredientChoices:{},notes:'',expanded:['root'],createdAt:'',updatedAt:''});

describe('quantity dependency planning',()=>{
  it('rounds batch output up and reports excess',()=>{
    const p=buildPlan(data([recipe('root','pack:root',4,[['pack:metal',3]])]),project({},5));
    expect(p.root.batches).toBe(2);expect(p.root.excess).toBe(3);expect(p.root.children[0].required).toBe(6);
  });
  it('allocates repeated leaf demands once across branches',()=>{
    const d=data([recipe('root','pack:root',1,[['pack:a',1],['pack:b',1]]),recipe('a','pack:a',1,[['pack:iron',4]]),recipe('b','pack:b',1,[['pack:iron',4]])]);
    const p=buildPlan(d,project({'pack:iron':5}));
    expect(p.root.children.map(c=>c.children[0].owned)).toEqual([4,1]);
    expect(p.allocated['pack:iron']).toBe(5);
  });
  it('reserves direct ingredients before allocating nested demands of the same item',()=>{
    const d=data([recipe('root','pack:root',1,[['pack:a',1],['pack:iron',2]]),recipe('a','pack:a',1,[['pack:iron',4]])]);
    const p=buildPlan(d,project({'pack:iron':3}));
    expect(p.root.children[1].owned).toBe(2);expect(p.root.children[0].children[0].owned).toBe(1);
  });
  it('owned intermediate items replace their upstream requirements without fabricating crafting history',()=>{
    const d=data([recipe('root','pack:root',1,[['pack:a',2]]),recipe('a','pack:a',1,[['pack:iron',4]])]);
    const p=buildPlan(d,project({'pack:a':1,'pack:iron':4}));
    expect(p.root.children[0].missing).toBe(1);expect(p.root.children[0].children[0].required).toBe(4);
    expect(p.readiness).toBe(0.5);expect(p.root.owned).toBe(0);
  });
  it('a reusable catalyst is required once per batch group without consuming its pool',()=>{
    const d=data([recipe('root','pack:root',1,[['pack:a',1],['pack:b',1]]),recipe('a','pack:a',1,[['pack:tool',1,false]]),recipe('b','pack:b',1,[['pack:tool',1,false]])]);
    const p=buildPlan(d,project({'pack:tool':1},8));
    expect(p.root.children.map(c=>[c.children[0].required,c.children[0].owned])).toEqual([[1,1],[1,1]]);
    expect(p.allocated['pack:tool']??0).toBe(0);
  });
  it('does not confuse ordinary and component-bearing item identities',()=>{
    const p=buildPlan(data([recipe('root','pack:root',1,[['pack:block[awake=true]',2]])]),project({'pack:block':2}));
    expect(p.readiness).toBe(0);expect(p.root.children[0].owned).toBe(0);
  });
  it('marks crafting as ready but never auto-completes the target',()=>{
    const p=buildPlan(data([recipe('root','pack:root',1,[['pack:a',2],['pack:b',1]])]),project({'pack:a':2,'pack:b':1}));
    expect(p.readiness).toBe(1);expect(p.root.ready).toBe(true);expect(p.root.owned).toBe(0);
  });
  it('terminates cyclic recipe paths with a visible cycle marker',()=>{
    const p=buildPlan(data([recipe('root','pack:root',1,[['pack:a',1]]),recipe('a','pack:a',1,[['pack:root',1]])]),project());
    expect(p.nodes).toHaveLength(3);expect(p.nodes[2].cycle).toBe(true);
  });
  it('uses selected recipe and selected ingredient alternative',()=>{
    const alt=recipe('alternate','pack:root',1,[['pack:b',2]]);alt.ingredients[0].options.push('pack:c');
    const p=project({'pack:c':1});p.recipeChoices['pack:root']='alternate';p.ingredientChoices['alternate:0']='pack:c';
    const result=buildPlan(data([recipe('root','pack:root',1,[['pack:a',5]]),alt]),p);
    expect(result.root.children[0].key).toBe('pack:c');expect(result.readiness).toBe(0.5);
  });
});
