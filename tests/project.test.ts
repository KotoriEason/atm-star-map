import {describe,expect,it} from 'vitest';
import raw from '../src/data/atm10-8.3.json?raw';
import type {Dataset} from '../src/domain/types';
import {createProject,validateProject,validateWorkspace} from '../src/domain/project';
import {encodeSnapshot,decodeSnapshot} from '../src/domain/share';
const data=JSON.parse(raw) as Dataset;
describe('project and snapshot boundaries',()=>{
  it('preserves layout choices while accepting old saves without a layout field',()=>{
    const p=createProject(data,'allthetweaks:atm_star',1);
    expect(validateProject(p,data).layout).toBeUndefined();
    expect(decodeSnapshot(encodeSnapshot({...p,layout:'horizontal'}),data).layout).toBe('horizontal');
    expect(()=>validateProject({...p,layout:'unknown'},data)).toThrow();
  });
  it('creates independent inventories and expansion state',()=>{
    const a=createProject(data,'allthetweaks:atm_star',1),b=createProject(data,'allthetweaks:atm_star',18);
    a.inventory['allthetweaks:dragon_soul']=1;a.expanded.push('root/3');
    expect(b.inventory).toEqual({});expect(b.expanded).toEqual(['root']);expect(a.id).not.toBe(b.id);
  });
  it('round trips Unicode notes and exact component keys in a current-project-only snapshot',()=>{
    const p=createProject(data,'allthetweaks:atm_star',2);
    p.notes='朋友的世界 🌟';const key=Object.keys(data.items).find(k=>k.includes('unobtainium_vibranium_alloy_block['))!;p.inventory[key]=2;
    const decoded=decodeSnapshot(encodeSnapshot(p),data);
    expect(decoded.notes).toBe('朋友的世界 🌟');expect(decoded.inventory[key]).toBe(2);expect(decoded.quantity).toBe(2);
    expect('projects' in decoded).toBe(false);
  });
  it('rejects invalid quantities, unknown item identities and incompatible dataset versions',()=>{
    const p=createProject(data,'allthetweaks:atm_star',1);
    expect(()=>validateProject({...p,quantity:-1},data)).toThrow();
    expect(()=>validateProject({...p,inventory:{'unknown:item':1}},data)).toThrow();
    expect(()=>validateProject({...p,datasetId:'atm10-8.2'},data)).toThrow();
    expect(()=>validateProject({...p,quantity:Infinity},data)).toThrow();
  });
  it('rejects an incompatible recipe choice instead of silently changing the plan',()=>{
    const p=createProject(data,'allthetweaks:atm_star',1);
    expect(()=>validateProject({...p,recipeChoices:{'allthetweaks:atm_star':data.recipes.find(r=>r.output.key!=='allthetweaks:atm_star')!.id}},data)).toThrow();
  });
  it('rejects malicious object keys and malformed share content',()=>{
    const p=createProject(data,'allthetweaks:atm_star',1);
    const bad=JSON.parse(JSON.stringify(p));bad.inventory=JSON.parse('{"__proto__":123}');
    expect(()=>validateProject(bad,data)).toThrow();
    expect(()=>decodeSnapshot('corrupted',data)).toThrow();
    expect(()=>decodeSnapshot('x'.repeat(30001),data)).toThrow();
  });
  it('rejects duplicate project IDs rather than overwriting user progress',()=>{
    const p=createProject(data,'allthetweaks:atm_star',1);
    expect(()=>validateWorkspace({schema:1,projects:[p,p],activeId:p.id},data)).toThrow();
  });
});
