import 'fake-indexeddb/auto';
import {describe,expect,it} from 'vitest';
import raw from '../src/data/atm10-8.3.json?raw';
import type {Dataset,Workspace} from '../src/domain/types';
import {createProject} from '../src/domain/project';
import {loadWorkspace,saveWorkspace} from '../src/storage';
import {setDataset} from '../src/data';
const data=JSON.parse(raw) as Dataset;
setDataset(data);
describe('IndexedDB persistence',()=>{
  it('persists several goals and their independent progress across reloads',async()=>{
    const a=createProject(data,'allthetweaks:atm_star',1),b=createProject(data,'allthetweaks:dragon_soul',3);
    a.inventory['allthetweaks:dragon_soul']=1;b.notes='第二个目标';
    const w:Workspace={schema:1,projects:[a,b],activeId:b.id};
    await saveWorkspace(w);const restored=await loadWorkspace(data);
    expect(restored?.projects).toHaveLength(2);expect(restored?.activeId).toBe(b.id);
    expect(restored?.projects[0].inventory['allthetweaks:dragon_soul']).toBe(1);expect(restored?.projects[1].inventory).toEqual({});
  });
  it('orders rapid writes so the newest progress is retained',async()=>{
    const a=createProject(data,'allthetweaks:atm_star',1);
    const one:Workspace={schema:1,projects:[a],activeId:a.id};
    const two:Workspace={...one,projects:[{...a,notes:'latest'}]};
    await Promise.all([saveWorkspace(one),saveWorkspace(two)]);
    expect((await loadWorkspace(data))?.projects[0].notes).toBe('latest');
  });
  it('rejects malformed workspace state before it can replace a valid save',async()=>{
    const a=createProject(data,'allthetweaks:atm_star',1),good:Workspace={schema:1,projects:[a],activeId:a.id};
    await saveWorkspace(good);
    await expect(saveWorkspace({...good,projects:[{...a,quantity:-1}]})).rejects.toThrow();
    expect((await loadWorkspace(data))?.projects[0].quantity).toBe(1);
  });
});
