import type {Requirement} from './types';

export type LayoutMode='radial'|'horizontal'|'vertical';
export const CARD_WIDTH=180,CARD_HEIGHT=96,ROOT_SIZE=188,RADIAL_Y=.65;
const SIBLING_GAP=36,RING_GAP=360;
export interface LayoutNode{node:Requirement;x:number;y:number;width:number;height:number;depth:number;branch:number;angle:number;startAngle:number;endAngle:number}
export interface LayoutEdge{source:string;target:string;branch:number;sourceRoot:boolean}
interface Work{node:Requirement;children:Work[];depth:number;branch:number;width:number;height:number;span:number;leaves:number;angle:number;startAngle:number;endAngle:number}
export function layoutTree(root:Requirement,expanded:Set<string>,onlyIncomplete:boolean,mode:LayoutMode):{nodes:LayoutNode[];edges:LayoutEdge[]}{
 function measure(node:Requirement,depth:number,branch:number):Work{
  const children=(expanded.has(node.path)?node.children.filter(c=>!onlyIncomplete||c.missing>0):[]).map(c=>measure(c,depth+1,depth===0?root.children.indexOf(c):branch));
  const width=depth===0?ROOT_SIZE:CARD_WIDTH,height=depth===0?ROOT_SIZE:CARD_HEIGHT;
  const span=Math.max(mode==='vertical'?width:height,children.reduce((n,c)=>n+c.span,0)+Math.max(0,children.length-1)*SIBLING_GAP);
  return {node,children,depth,branch,width,height,span,leaves:children.length?children.reduce((n,c)=>n+c.leaves,0):1,angle:0,startAngle:0,endAngle:0};
 }
 const tree=measure(root,0,-1),nodes:LayoutNode[]=[],edges:LayoutEdge[]=[];
 function emit(w:Work,cx:number,cy:number){
  nodes.push({node:w.node,x:cx-w.width/2,y:cy-w.height/2,width:w.width,height:w.height,depth:w.depth,branch:w.branch,angle:w.angle,startAngle:w.startAngle,endAngle:w.endAngle});
  for(const c of w.children)edges.push({source:w.node.path,target:c.node.path,branch:c.branch,sourceRoot:w.depth===0});
 }
 if(mode!=='radial'){
  const rank:number[]=[0];
  function visit(w:Work,left:number){
   if(rank[w.depth]===undefined){const vertical=mode==='vertical';rank[w.depth]=rank[w.depth-1]+(w.depth===1?ROOT_SIZE:(vertical?CARD_HEIGHT:CARD_WIDTH))/2+(vertical?90:140)+(vertical?CARD_HEIGHT:CARD_WIDTH)/2;}
   const cross=left+w.span/2-tree.span/2;
   emit(w,mode==='horizontal'?rank[w.depth]:cross,mode==='horizontal'?cross:rank[w.depth]);
   const total=w.children.reduce((n,c)=>n+c.span,0)+Math.max(0,w.children.length-1)*SIBLING_GAP;
   let at=left+(w.span-total)/2;
   for(const c of w.children){visit(c,at);at+=c.span+SIBLING_GAP;}
  }
  visit(tree,0);return {nodes,edges};
 }
 const levels:Work[][]=[[tree]];
 function assign(w:Work,start:number,end:number){
  w.startAngle=start;w.endAngle=end;w.angle=(start+end)/2;
  (levels[w.depth]??=[]);if(w.depth>0)levels[w.depth].push(w);
  let at=start;
  for(const child of w.children){const span=(end-start)*child.leaves/w.leaves;assign(child,at,at+span);at+=span;}
 }
 const children=tree.children;
 if(children.length===1)assign(children[0],-Math.PI*.375,Math.PI*.375);
 else if(children.length>1){
  // A root branch never owns more than a half-circle. Every subtree then has
  // a separate angular corridor, even when one expanded branch is much larger.
  const shares=new Array<number>(children.length).fill(0),remaining=new Set(children.map((_,i)=>i)),cap=children.length===2?.5:.42;
  let budget=1;
  while(remaining.size){const weight=[...remaining].reduce((s,i)=>s+children[i].leaves,0);const large=[...remaining].filter(i=>budget*children[i].leaves/weight>cap);
   if(!large.length){for(const i of remaining)shares[i]=budget*children[i].leaves/weight;break;}
   for(const i of large){shares[i]=cap;budget-=cap;remaining.delete(i);}
  }
  let at=-Math.PI/2;
  children.forEach((c,i)=>{const span=shares[i]*Math.PI*2,gap=Math.min(.06,span*.12);assign(c,at+gap/2,at+span-gap/2);at+=span;});
 }
 const radii=[0];
 for(let depth=1;depth<levels.length;depth++){
  const level=levels[depth];let radius=radii[depth-1]+RING_GAP;
  // Reserve complete padded rectangles and keep each radial connector ray
  // outside other cards. Exact rectangle bounds avoid oversized empty rings.
  for(let i=0;i<level.length;i++)for(let j=i+1;j<level.length;j++){
   const a=level[i],b=level[j];let delta=Math.abs(a.angle-b.angle)%(Math.PI*2);delta=Math.min(delta,Math.PI*2-delta);
   const ra=Math.hypot(a.width/2+12,(a.height/2+12)/RADIAL_Y),rb=Math.hypot(b.width/2+12,(b.height/2+12)/RADIAL_Y);
   const dx=Math.abs(Math.cos(a.angle)-Math.cos(b.angle)),dy=RADIAL_Y*Math.abs(Math.sin(a.angle)-Math.sin(b.angle));
   const boxes=Math.min(((a.width+b.width)/2+24)/Math.max(1e-7,dx),((a.height+b.height)/2+24)/Math.max(1e-7,dy));
   const rays=delta<Math.PI/2?Math.max(ra,rb)/Math.max(1e-7,Math.sin(delta)):0;
   radius=Math.max(radius,boxes,rays);
  }
  radii[depth]=radius;
 }
 function visitRadial(w:Work){emit(w,w.depth?radii[w.depth]*Math.cos(w.angle):0,w.depth?radii[w.depth]*RADIAL_Y*Math.sin(w.angle):0);for(const c of w.children)visitRadial(c);}
 visitRadial(tree);return {nodes,edges};
}

const number=(n:number)=>Math.round(n*1000)/1000;
export function connectionPath(mode:LayoutMode,sx:number,sy:number,tx:number,ty:number,sourceRoot:boolean):string{
 const move=`M ${number(sx)} ${number(sy)}`;
 if(mode==='horizontal'){const x=number((sx+tx)/2);return `${move} L ${x} ${number(sy)} L ${x} ${number(ty)} L ${number(tx)} ${number(ty)}`;}
 if(mode==='vertical'){const y=number((sy+ty)/2);return `${move} L ${number(sx)} ${y} L ${number(tx)} ${y} L ${number(tx)} ${number(ty)}`;}
 const rs=Math.hypot(sx,sy/RADIAL_Y),rt=Math.hypot(tx,ty/RADIAL_Y);
 if(sourceRoot||rs<1)return `${move} L ${number(tx)} ${number(ty)}`;
 const a=Math.atan2(sy/RADIAL_Y,sx),b=Math.atan2(ty/RADIAL_Y,tx);let delta=b-a;
 while(delta>Math.PI)delta-=Math.PI*2;while(delta<-Math.PI)delta+=Math.PI*2;
 if(Math.abs(delta)<1e-7)return `${move} L ${number(tx)} ${number(ty)}`;
 const radius=(rs+rt)/2,p1=[radius*Math.cos(a),radius*RADIAL_Y*Math.sin(a)],p2=[radius*Math.cos(b),radius*RADIAL_Y*Math.sin(b)];
 return `${move} L ${number(p1[0])} ${number(p1[1])} A ${number(radius)} ${number(radius*RADIAL_Y)} 0 0 ${delta>0?1:0} ${number(p2[0])} ${number(p2[1])} L ${number(tx)} ${number(ty)}`;
}
