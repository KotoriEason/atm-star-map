import type {Dataset, Plan, Project, Recipe, Requirement} from './types';

const indexes=new WeakMap<Dataset,Map<string,Recipe[]>>();
function recipeIndexFor(data:Dataset){let index=indexes.get(data);if(!index){index=new Map();for(const r of data.recipes){const list=index.get(r.output.key)??[];list.push(r);index.set(r.output.key,list);}indexes.set(data,index);}return index;}
export function recipesFor(data:Dataset, key:string):Recipe[] {return recipeIndexFor(data).get(key)??[];}
export function chooseRecipe(data:Dataset, project:Project, key:string):Recipe|undefined {
  const options=recipesFor(data,key);
  return pickRecipe(data,project,key,options);
}
function pickRecipe(data:Dataset,project:Project,key:string,options:Recipe[]){
  if(project.recipeChoices[key]==='@acquire'&&data.acquisitions?.[key]?.length)return undefined;
  const saved=options.find(r=>r.id===project.recipeChoices[key]);if(saved)return saved;
  const preferred=data.preferredRecipes?.[key];if(preferred==='@acquire')return undefined;
  return options.find(r=>r.id===preferred)??options.find(r=>r.id===data.defaultRecipe)??options[0];
}

export function buildPlan(data:Dataset, project:Project):Plan {
  const pool={...project.inventory}, allocated:Record<string,number>={}, nodes:Requirement[]=[];
  const expanded=new Set(project.expanded);
  let truncated=false;
  const recipeIndex=recipeIndexFor(data);
  function makeNode(key:string, required:number, path:string, consumed=true):Requirement {
    let owned=0;const allocations:Record<string,number>={};
    for(const source of [key,...(data.tags?.[key]??[])]){
      const amount=Math.max(0,pool[source]??0),take=Math.min(required-owned,amount);
      if(take>0){allocations[source]=take;owned+=take;if(consumed){pool[source]=amount-take;allocated[source]=(allocated[source]??0)+take;}}
      if(owned===required)break;
    }
    const node:Requirement={path,key,required,owned,allocations,missing:required-owned,consumed,batches:0,excess:0,children:[],cycle:false,limited:false,ready:false};
    nodes.push(node);return node;
  }
  const root=makeNode(project.target,project.quantity,'root');
  const queue:{node:Requirement;ancestors:string[];depth:number;visible:boolean}[]=[{node:root,ancestors:[],depth:0,visible:true}];
  // Breadth-first allocation reserves direct requirements before deeper consumers.
  for(let at=0;at<queue.length;at++) {
    const {node,ancestors,depth,visible}=queue[at];
    node.cycle=ancestors.includes(node.key);
    const options=recipeIndex.get(node.key)??[];
    const recipe=pickRecipe(data,project,node.key,options);
    node.recipeId=recipe?.id;
    if(node.missing===0) {node.ready=true;continue;}
    if(!recipe || node.cycle) continue;
    // Build one level beyond visible nodes so their immediate readiness is exact.
    // Expanding a branch computes the next frontier without exhausting the entire
    // star's graph budget on thousands of currently hidden descendants.
    if(!visible)continue;
    if(depth>=64 || nodes.length+recipe.ingredients.length>3000) {node.limited=true;truncated=true;continue;}
    node.batches=Math.ceil(node.missing/recipe.output.count);
    node.excess=node.batches*recipe.output.count-node.missing;
    const demands=recipe.ingredients.map((g,i)=>{
      const choice=project.ingredientChoices[`${recipe.id}:${i}`];
      const tagChoice=data.tagChoices?.[node.key]??data.preferredIngredients?.[`${recipe.id}:${i}`];
      const key=g.options.includes(choice)?choice:tagChoice&&g.options.includes(tagChoice)?tagChoice:g.options[0];
      const consumed=g.consumed&&!data.reusableItems?.includes(key);
      const required=g.count*(consumed?node.batches:1);
      return {key,required,consumed,index:i};
    });
    if(demands.some(d=>!Number.isFinite(d.required)||d.required>1e15)) {node.limited=true;truncated=true;continue;}
    for(const demand of demands) {
      const child=makeNode(demand.key,demand.required,`${node.path}/${demand.index}`,demand.consumed);
      child.ingredientIndex=demand.index;child.parentRecipeId=recipe.id;node.children.push(child);
      queue.push({node:child,ancestors:[...ancestors,node.key],depth:depth+1,visible:visible&&expanded.has(node.path)});
    }
    node.ready=node.children.every(c=>c.missing===0);
  }
  const readiness=root.missing===0?1:root.children.length?root.children.reduce((sum,n)=>sum+n.owned/n.required,0)/root.children.length:0;
  return {root,readiness,nodes,allocated,truncated};
}
