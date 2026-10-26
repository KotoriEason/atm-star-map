import type {Dataset,Project,Workspace} from './types';
function object(value:unknown):Record<string,unknown> {
  if(!value || typeof value!=='object' || Array.isArray(value)) throw new Error('存档格式无效');
  const v=value as Record<string,unknown>;
  if(Object.keys(v).some(k=>['__proto__','constructor','prototype'].includes(k))) throw new Error('存档包含不支持的字段');
  return v;
}
function text(value:unknown,max:number):string {if(typeof value!=='string'||value.length>max)throw new Error('存档文字长度或类型无效');return value;}
function number(value:unknown,min:number,max:number):number {if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max)throw new Error('数量必须是有效范围内的整数');return value;}
function timestamp(value:unknown):string {const v=text(value,40);if(!Number.isFinite(Date.parse(v)))throw new Error('存档时间无效');return v;}
export function createProject(data:Dataset,target:string,quantity:number):Project {
  if(!data.items[target])throw new Error('未收录这个物品');number(quantity,1,1e6);
  const now=new Date().toISOString();
  return {id:crypto.randomUUID(),name:`${data.items[target].name} ×${quantity}`,datasetId:data.id,target,quantity,
    inventory:{},recipeChoices:{},ingredientChoices:{},notes:'',expanded:['root'],createdAt:now,updatedAt:now};
}
export function validateProject(input:unknown,data:Dataset):Project {
  const v=object(input);
  if(v.datasetId!==data.id)throw new Error('存档的数据版本与当前 ATM10 8.3 数据集不兼容');
  if(v.layout!==undefined&&!['radial','horizontal','vertical'].includes(v.layout as string))throw new Error('合成树布局无效');
  const target=text(v.target,5000);if(!data.items[target])throw new Error('目标物品未收录');
  const inventory:Record<string,number>={},recipeChoices:Record<string,string>={},ingredientChoices:Record<string,string>={};
  const inv=object(v.inventory),rc=object(v.recipeChoices),ic=object(v.ingredientChoices);
  if(Object.keys(inv).length>2000||Object.keys(rc).length>2000||Object.keys(ic).length>4000)throw new Error('存档记录过多');
  for(const [key,n] of Object.entries(inv)) {if(!data.items[key])throw new Error('存档包含未收录的物品');inventory[key]=number(n,0,1e12);}
  for(const [key,id] of Object.entries(rc)) {
    if(id==='@acquire'&&data.items[key]&&data.acquisitions?.[key]?.length){recipeChoices[key]=id;continue;}
    const r=data.recipes.find(r=>r.id===id&&r.output.key===key);
    if(!r)throw new Error('存档中的制作路线与物品不匹配');recipeChoices[key]=r.id;
  }
  for(const [key,choice] of Object.entries(ic)) {
    const split=key.lastIndexOf(':'),id=key.slice(0,split),index=Number(key.slice(split+1));
    const r=data.recipes.find(r=>r.id===id);
    if(!Number.isInteger(index)||!r?.ingredients[index]?.options.includes(choice as string))throw new Error('存档中的备选材料无效');
    ingredientChoices[key]=choice as string;
  }
  if(!Array.isArray(v.expanded)||v.expanded.length>1000||v.expanded.some(p=>typeof p!=='string'||!/^root(?:\/\d{1,3}){0,64}$/.test(p)))throw new Error('合成树展开状态无效');
  return {id:text(v.id,100),name:text(v.name,100),datasetId:data.id,target,quantity:number(v.quantity,1,1e6),inventory,recipeChoices,ingredientChoices,
    notes:text(v.notes,10000),expanded:[...new Set(v.expanded as string[])],...(v.layout!==undefined?{layout:v.layout as Project['layout']}:{}),createdAt:timestamp(v.createdAt),updatedAt:timestamp(v.updatedAt)};
}
export function validateWorkspace(input:unknown,data:Dataset):Workspace {
  const v=object(input);
  if(v.schema!==1||!Array.isArray(v.projects)||v.projects.length<1||v.projects.length>100)throw new Error('工作区格式无效，最多支持 100 个目标');
  const projects=v.projects.map(p=>validateProject(p,data));
  if(new Set(projects.map(p=>p.id)).size!==projects.length)throw new Error('存档中存在重复目标 ID');
  if(!projects.some(p=>p.id===v.activeId))throw new Error('当前目标不存在');
  return {schema:1,projects,activeId:v.activeId as string};
}
