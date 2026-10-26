import type {Dataset} from './domain/types';
export let dataset:Dataset;
export function setDataset(data:Dataset){dataset=data;}
export async function loadDataset(){
  async function json(path:string,expected?:string){
    const response=await fetch(path,{cache:'no-cache'});if(!response.ok)throw new Error('配方数据加载失败，请刷新页面重试。');
    const bytes=await response.arrayBuffer();
    if(expected){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');if(!hash.startsWith(expected.slice(0,24)))throw new Error('配方文件校验失败，请刷新页面重试。');}
    try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new Error('配方文件未完整加载，请刷新页面重试。');}
  }
  async function attempt(){const manifest=await json('/catalog/manifest.json');
  const names:string[]=[manifest.baseFile,...manifest.items,...manifest.recipes];
  if(names.some(name=>!(/^[a-f0-9]{24}\.json$/).test(name)))throw new Error('配方数据索引无效。');
  const all=await Promise.all(names.map(name=>json(`/catalog/${name}`,name)));
  const base=all[0],items=Object.assign({},...all.slice(1,1+manifest.items.length)),recipes=all.slice(1+manifest.items.length).flat();
  if(Object.keys(items).length!==manifest.itemCount||recipes.length!==manifest.recipeCount)throw new Error('配方文件未完整加载，请刷新页面重试。');
  dataset={...base,items,recipes} as Dataset;return dataset;}
  try{return await attempt();}catch{return attempt();}
}
export const fmt=(n:number)=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:1}).format(n);
export const percent=(n:number)=>`${Math.round(n*100)}%`;
export function itemName(key:string){return dataset.items[key]?.name??key;}
export function machineName(key:string){return dataset.items[key]?.name??key.split(':').at(-1)?.replaceAll('_',' ')??key;}
