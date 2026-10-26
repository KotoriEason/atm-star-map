import type {Dataset,Project,Requirement} from './types';
import {buildPlan} from './planner';
export function recordCraft(data:Dataset,project:Project,node:Requirement):Project {
  const current=buildPlan(data,project).nodes.find(n=>n.path===node.path);
  if(!current||current.key!==node.key||current.recipeId!==node.recipeId||current.required!==node.required||current.owned!==node.owned||current.batches!==node.batches)throw new Error('制作计划已变化，请重新选择物品');
  const recipe=data.recipes.find(r=>r.id===current.recipeId&&r.output.key===current.key);
  if(!recipe||!current.ready||current.missing===0||!current.children.length)throw new Error('请先记录足够的直接材料');
  if(recipe.manualOnly||recipe.virtual)throw new Error('此步骤需要按实际结果手动记录');
  const inventory={...project.inventory};
  for(const child of current.children) if(child.consumed) {
    const deductions=child.allocations??{[child.key]:child.required};
    for(const [key,count] of Object.entries(deductions)){
      if((inventory[key]??0)<count)throw new Error('材料数量已变化，请刷新计划后重试');
      inventory[key]-=count;
    }
  }
  inventory[current.key]=(inventory[current.key]??0)+current.batches*recipe.output.count;
  return {...project,inventory,updatedAt:new Date().toISOString()};
}
