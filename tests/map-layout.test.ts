import {describe,it,expect} from 'vitest';
import {layoutTree,connectionPath,type LayoutMode} from '../src/domain/mapLayout';
import type {Requirement} from '../src/domain/types';
function node(path:string,children:Requirement[]=[]):Requirement{return {path,key:path,required:1,owned:0,missing:1,consumed:true,batches:1,excess:0,children,cycle:false,limited:false,ready:false};}
function fixture(){return node('root',Array.from({length:5},(_,i)=>node(`root/${i}`,Array.from({length:i+2},(_,j)=>node(`root/${i}/${j}`,j===0?[node(`root/${i}/${j}/0`),node(`root/${i}/${j}/1`)]:[])))));}
const allExpanded=(root:Requirement):string[]=>[root.path,...root.children.flatMap(allExpanded)];
function overlap(a:{x:number;y:number;width:number;height:number},b:{x:number;y:number;width:number;height:number}){return a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;}
describe('subtree-aware map layouts',()=>{
 for(const mode of ['horizontal','vertical','radial'] as LayoutMode[])it(`${mode} keeps expanded subtrees and their cards separate`,()=>{
  const root=fixture(),result=layoutTree(root,new Set(allExpanded(root)),false,mode);
  expect(result.nodes).toHaveLength(36);
  for(let i=0;i<result.nodes.length;i++)for(let j=i+1;j<result.nodes.length;j++)expect(overlap(result.nodes[i],result.nodes[j]),`${result.nodes[i].node.path} / ${result.nodes[j].node.path}`).toBe(false);
  expect(result.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y))).toBe(true);
 });
 for(const mode of ['horizontal','vertical'] as LayoutMode[])it(`${mode} reserves disjoint sibling subtree intervals`,()=>{
  const root=fixture(),result=layoutTree(root,new Set(allExpanded(root)),false,mode);
  const intervals=root.children.map(child=>{
   const members=result.nodes.filter(n=>n.node.path===child.path||n.node.path.startsWith(child.path+'/'));
   return [Math.min(...members.map(n=>mode==='horizontal'?n.y:n.x)),Math.max(...members.map(n=>mode==='horizontal'?n.y+n.height:n.x+n.width))];
  });
  for(let i=1;i<intervals.length;i++)expect(intervals[i][0]-intervals[i-1][1]).toBeGreaterThanOrEqual(28);
 });
 it('places radial descendants inside disjoint parent angular sectors',()=>{
  const root=fixture(),result=layoutTree(root,new Set(allExpanded(root)),false,'radial');
  const map=new Map(result.nodes.map(n=>[n.node.path,n]));
  for(const edge of result.edges){const parent=map.get(edge.source)!,child=map.get(edge.target)!;if(parent.depth>0){expect(child.angle).toBeGreaterThanOrEqual(parent.startAngle);expect(child.angle).toBeLessThanOrEqual(parent.endAngle);expect(child.endAngle-child.startAngle).toBeLessThan(Math.PI);}}
 });
 it('only measures visible descendants and applies the unfinished filter consistently',()=>{
  const root=fixture();root.children[0].missing=0;
  expect(layoutTree(root,new Set(['root']),true,'horizontal').nodes.map(n=>n.node.path)).toEqual(['root','root/1','root/2','root/3','root/4']);
  expect(layoutTree(root,new Set(),false,'radial').nodes).toHaveLength(1);
 });
 it('keeps the target centered and recomputes occupied space when siblings expand',()=>{
  const root=fixture(),a=layoutTree(root,new Set(['root']),false,'horizontal'),b=layoutTree(root,new Set(allExpanded(root)),false,'horizontal');
  expect(a.nodes[0].x+a.nodes[0].width/2).toBe(0);expect(b.nodes[0].y+b.nodes[0].height/2).toBe(0);
  expect(b.nodes.find(n=>n.node.path==='root/4')!.y).not.toBe(a.nodes.find(n=>n.node.path==='root/4')!.y);
 });
 it('routes tree connections through an external channel and radial connections through an arc',()=>{
  expect(connectionPath('horizontal',100,50,300,200,false)).toBe('M 100 50 L 200 50 L 200 200 L 300 200');
  expect(connectionPath('vertical',50,100,200,300,false)).toBe('M 50 100 L 50 200 L 200 200 L 200 300');
  expect(connectionPath('radial',400,0,700,200,false)).toContain(' A ');
 });
});
