import {describe,it,expect} from 'vitest';
import {buildPlan} from '../src/domain/planner';
import {recordCraft} from '../src/domain/crafting';
import type {Dataset,Project,Recipe} from '../src/domain/types';
const r=(id:string,out:string,inputs:string[]):Recipe=>({id,type:'craft',machine:'minecraft:crafting_table',output:{key:out,count:1},ingredients:inputs.map(key=>({options:[key],count:1,consumed:true})),source:{path:'fixture',line:1,sha256:'a'.repeat(64),url:''},idIsSynthetic:false});
const p=(inventory:Record<string,number>={}):Project=>({id:'test',datasetId:'test',target:'pack:goal',quantity:1,name:'test',inventory,recipeChoices:{},ingredientChoices:{},notes:'',expanded:['root'],createdAt:'',updatedAt:''});
const d=(recipes:Recipe[],extra:Partial<Dataset>={}):Dataset=>({id:'test',items:{},recipes,defaultRecipe:'goal',...extra} as Dataset);
describe('expanded dependency planning',()=>{
 it('preserves a proven reusable item without rewriting saved recipe identities',()=>{
  const data=d([r('goal','pack:goal',['pack:crystal'])],{reusableItems:['pack:crystal']});
  const project=p({'pack:crystal':1});const plan=buildPlan(data,project);expect(plan.root.children[0].consumed).toBe(false);
  expect(recordCraft(data,project,plan.root).inventory['pack:crystal']).toBe(1);
 });
 it('selects a terminating preferred route ahead of a recycling route',()=>{
  const data=d([r('recycle','pack:goal',['pack:block']),r('ore','pack:goal',['pack:raw']),r('block','pack:block',['pack:goal'])],{preferredRecipes:{'pack:goal':'ore'}});
  expect(buildPlan(data,p()).root.children[0].key).toBe('pack:raw');
 });
 it('expands long production chains beyond twelve steps',()=>{
  const recipes=Array.from({length:20},(_,i)=>r('step'+i,i?'pack:'+i:'pack:goal',['pack:'+(i+1)]));
  const project=p();project.expanded=Array.from({length:20},(_,i)=>'root'+'/0'.repeat(i));
  const plan=buildPlan(d(recipes),project);expect(plan.nodes).toHaveLength(21);expect(plan.truncated).toBe(false);
 });
 it('does not spend the graph budget on collapsed descendants',()=>{
  const recipes=Array.from({length:30},(_,i)=>r('step'+i,i?'pack:'+i:'pack:goal',['pack:'+(i+1)]));
  const project=p();expect(buildPlan(d(recipes),project).nodes).toHaveLength(3);
  project.expanded.push('root/0');expect(buildPlan(d(recipes),project).nodes).toHaveLength(4);
 });
 it('allocates real tag members once and consumes their exact identities',()=>{
  const data=d([r('goal','pack:goal',['#c:ingots/iron'])],{tags:{'#c:ingots/iron':['pack:iron']}});
  const project=p({'pack:iron':1});const plan=buildPlan(data,project);
  expect(plan.root.ready).toBe(true);expect(plan.root.children[0].owned).toBe(1);
  const result=recordCraft(data,project,plan.root);expect(result.inventory['pack:iron']).toBe(0);expect(result.inventory['pack:goal']).toBe(1);
 });
 it('never auto-confirms probabilistic or variable-usage routes',()=>{
  const data=d([{...r('goal','pack:goal',['pack:raw']),manualOnly:true}]);const project=p({'pack:raw':1});
  expect(()=>recordCraft(data,project,buildPlan(data,project).root)).toThrow();
 });
 it('allows acquired material to be a terminal without inventing a recipe',()=>{
  const data=d([r('goal','pack:goal',['pack:raw']),r('recycle','pack:raw',['pack:goal'])],{preferredRecipes:{'pack:raw':'@acquire'}});
  const plan=buildPlan(data,p());expect(plan.root.children[0].recipeId).toBeUndefined();expect(plan.nodes).toHaveLength(2);
 });
});
