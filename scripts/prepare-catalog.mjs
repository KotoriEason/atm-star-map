import {readFileSync,mkdirSync,writeFileSync,readdirSync,unlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
const data=JSON.parse(readFileSync('src/data/atm10-8.3.json','utf8')),dir='public/catalog';mkdirSync(dir,{recursive:true});
const used=new Set();
function chunk(value){const text=JSON.stringify(value),name=createHash('sha256').update(text).digest('hex').slice(0,24)+'.json';if(Buffer.byteLength(text)>8*1024*1024)throw new Error('Catalog shard exceeds 8 MB');writeFileSync(`${dir}/${name}`,text);used.add(name);return name;}
function parts(values,size){const result=[];for(let i=0;i<values.length;i+=size)result.push(values.slice(i,i+size));return result;}
const {items,recipes,...base}=data;
const manifest={base,items:parts(Object.entries(items),1000).map(v=>chunk(Object.fromEntries(v))),recipes:parts(recipes,1000).map(chunk),itemCount:Object.keys(items).length,recipeCount:recipes.length};
// Acquisitions, tags and defaults can grow independently of item/recipe shards.
const baseFile=chunk(base);delete manifest.base;manifest.baseFile=baseFile;
writeFileSync(`${dir}/manifest.json`,JSON.stringify(manifest));
for(const name of readdirSync(dir))if(/^[a-f0-9]{24}\.json$/.test(name)&&!used.has(name))unlinkSync(`${dir}/${name}`);
console.log(`Prepared ${used.size} bounded catalog shards; ${manifest.itemCount} items, ${manifest.recipeCount} recipes.`);
