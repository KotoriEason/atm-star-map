import {it,expect,vi,afterEach} from 'vitest';
import {createHash} from 'node:crypto';
import {loadDataset} from '../src/data';
afterEach(()=>vi.unstubAllGlobals());
function fixture(corrupt=false){
 const files:Record<string,string>={};
 function chunk(v:unknown){const text=JSON.stringify(v),name=createHash('sha256').update(text).digest('hex').slice(0,24)+'.json';files['/catalog/'+name]=text;return name;}
 const baseFile=chunk({id:'fixture'}),items=chunk({'pack:one':{id:'pack:one',name:'物品'}});
 files['/catalog/manifest.json']=JSON.stringify({baseFile,items:[items],recipes:[],itemCount:1,recipeCount:0});
 if(corrupt)files['/catalog/'+items]=JSON.stringify({'pack:one':{id:'pack:one',name:'被篡改'}});
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>new Response(files[path],{status:200})));
}
it('loads a catalog assembled from matching content-addressed shards',async()=>{fixture();expect((await loadDataset()).items['pack:one'].name).toBe('物品');});
it('rejects a mismatched shard even when record counts still match',async()=>{fixture(true);await expect(loadDataset()).rejects.toThrow(/校验/);});
