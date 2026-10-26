import {openDB} from 'idb';
import type {Dataset,Workspace} from './domain/types';
import {validateWorkspace} from './domain/project';
import {dataset} from './data';
const database=()=>openDB('atm-star-map',1,{upgrade(db){db.createObjectStore('workspace');}});
let writeQueue:Promise<void>=Promise.resolve();
export async function loadWorkspace(data:Dataset):Promise<Workspace|null>{
  const db=await database();
  try {const value=await db.get('workspace','current');return value?validateWorkspace(value,data):null;}
  finally {db.close();}
}
export async function saveWorkspace(workspace:Workspace):Promise<void>{
  const snapshot=validateWorkspace(structuredClone(workspace),dataset);
  const operation=writeQueue.catch(()=>undefined).then(async()=>{
    const db=await database();try{await db.put('workspace',snapshot,'current');}finally{db.close();}
  });
  writeQueue=operation;
  return operation;
}
