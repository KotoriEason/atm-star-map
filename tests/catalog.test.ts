import {expect,it} from 'vitest';
import raw from '../src/data/atm10-8.3.json?raw';
import {buildPlan} from '../src/domain/planner';
import {createProject} from '../src/domain/project';
import type {Dataset} from '../src/domain/types';
const data=JSON.parse(raw) as Dataset;
it('follows the compressed star material through to vanilla nether stars',()=>{
 const project=createProject(data,'allthecompressed:nether_star_block_3x',1);project.expanded=Array.from({length:8},(_,i)=>'root'+'/0'.repeat(i));
 const plan=buildPlan(data,project);
 expect(plan.nodes.some(n=>n.key==='minecraft:nether_star')).toBe(true);
 expect(plan.nodes.some(n=>n.cycle)).toBe(false);
});
it('has both the pinned star route and source-backed acquisition terminals',()=>{
 const plan=buildPlan(data,createProject(data,'allthetweaks:atm_star',1));
 expect(plan.root.children).toHaveLength(13);
 expect(plan.truncated).toBe(false);
 expect(data.acquisitions?.['minecraft:nether_star']?.some(s=>s.kind==='mob')).toBe(true);
 expect(data.tags?.['#c:gems/diamond']).toContain('minecraft:diamond');
 console.log('Catalog planning audit',JSON.stringify({nodes:plan.nodes.length,truncated:plan.truncated,cycles:plan.nodes.filter(n=>n.cycle).length,maxDepth:Math.max(...plan.nodes.map(n=>n.path.split('/').length-1))}));
});
