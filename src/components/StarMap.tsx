import {memo,useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ReactFlow,ReactFlowProvider,Background,BackgroundVariant,Handle,Position,BaseEdge,applyNodeChanges,useNodesInitialized,useUpdateNodeInternals,useReactFlow,type Node,type NodeProps,type NodeChange,type Edge,type EdgeProps} from '@xyflow/react';
import {Check,Plus,Minus,Maximize,Focus,LocateFixed,ChevronRight} from 'lucide-react';
import {ItemIcon} from './ItemIcon';
import {dataset,fmt,itemName,percent} from '../data';
import type {Plan,Project,Requirement} from '../domain/types';
import {layoutTree,connectionPath,type LayoutMode} from '../domain/mapLayout';

const colors=['#b7a16a','#b9a4d4','#c5ad77','#a59ad0','#d59ad7','#9ebfe1','#be8f94','#aaadd2','#aeb1ce','#d6b184','#b19bcf','#9abea7','#d6a5b4'];
type MapData={node:Requirement;root:boolean;color:string;expanded:boolean;readonly:boolean;layout:LayoutMode;expandSide:string;onExpand:(path:string)=>void;onCheck:(node:Requirement)=>void} & Record<string,unknown>;
type MapNode=Node<MapData,'item'>;
const ItemNode=memo(function ItemNode({data,selected}:NodeProps<MapNode>){
  const {node,root,color,expanded,onExpand,onCheck,layout,expandSide}=data;
  const updateInternals=useUpdateNodeInternals();
  useLayoutEffect(()=>updateInternals(node.path),[updateInternals,node.path,layout]);
  const item=dataset.items[node.key],done=node.missing===0;
  return <div className={`recipe-node ${root?'root-node':''} expands-${expandSide} ${selected?'is-selected':''} ${done?'is-done':''}`} style={{'--branch-color':color} as React.CSSProperties}>
    <Handle type="target" position={layout==='vertical'?Position.Top:Position.Left} isConnectable={false}/>
    {root?<><div className="root-orbit"/><span className="root-eyebrow">当前制作目标</span><ItemIcon itemKey={node.key} size={62}/><strong>{item?.name??node.key}</strong><span className="root-quantity">{fmt(node.owned)} / {fmt(node.required)} 已制成</span></>:
      <><div className="node-main"><span className="node-art"><ItemIcon itemKey={node.key} size={35}/></span><div><strong title={item?.name}>{item?.name??node.key}</strong><span className="node-mod">{item?.mod}</span></div></div><div className="node-bottom"><button className={`node-check nodrag nopan ${done?'checked':''}`} aria-label={`${done?'取消记录':'标记已有'} ${itemName(node.key)}`} disabled={data.readonly} onClick={e=>{e.stopPropagation();onCheck(node);}}>{done&&<Check size={11}/>}</button><span className={done?'done-text':''}>{fmt(node.owned)} <span className="subtle">/ {fmt(node.required)}{(item?.kind==='fluid'||item?.kind==='chemical')?' mB':''}</span></span><span className="node-status">{node.cycle?'循环路线':node.limited?'展开上限':done?'已就绪':node.ready?'材料齐全':node.recipeId?(dataset.items[node.key]?.kind==='tag'?'选择材料':'可合成'):dataset.acquisitions?.[node.key]?.length?'可获取':'待核验'}</span></div></>}
    {node.children.length>0&&<button className="expand-button nodrag nopan" onClick={e=>{e.stopPropagation();onExpand(node.path);}} aria-label={`${expanded?'收起':'展开'} ${itemName(node.key)}`} title={expanded?'收起这条分支':'展开下一级材料'}>{expanded?<Minus size={12}/>:<Plus size={12}/>}</button>}
    <Handle type="source" position={layout==='vertical'?Position.Bottom:Position.Right} isConnectable={false}/>
  </div>;
});
const nodeTypes={item:ItemNode};
type MapEdge=Edge<{layout:LayoutMode;sourceRoot:boolean},'recipe'>;
const RecipeEdge=memo(function RecipeEdge({id,sourceX,sourceY,targetX,targetY,data,style}:EdgeProps<MapEdge>){return <BaseEdge id={id} path={connectionPath(data?.layout??'radial',sourceX,sourceY,targetX,targetY,data?.sourceRoot??false)} style={style}/>;});
const edgeTypes={recipe:RecipeEdge};
interface Props{plan:Plan;project:Project;selectedPath:string;onSelect:(path:string)=>void;onExpand:(path:string)=>void;onCheck:(node:Requirement)=>void;readonly:boolean;onlyIncomplete:boolean}
function MapContent(props:Props){
  const {plan,project,selectedPath,onSelect,onExpand,onCheck,readonly,onlyIncomplete}=props;
  const {fitView,setCenter,getNode,getViewport,setViewport,zoomIn,zoomOut}=useReactFlow<MapNode,MapEdge>();
  const [nodes,setNodes]=useState<MapNode[]>([]),[edges,setEdges]=useState<MapEdge[]>([]);
  const [zoom,setZoom]=useState(1);
  const mode=project.layout??'radial';
  const expanded=useMemo(()=>new Set(project.expanded),[project.expanded]);
  const geometry=useMemo(()=>layoutTree(plan.root,expanded,onlyIncomplete,mode),[plan.root,expanded,onlyIncomplete,mode]);
  const pendingAnchor=useRef<{path:string;x:number;y:number}|null>(null);
  const handleExpand=useCallback((path:string)=>{
    const previous=getNode(path),position=geometry.nodes.find(n=>n.node.path===path);
    if(previous&&position)pendingAnchor.current={path,x:previous.position.x+position.width/2,y:previous.position.y+position.height/2};
    onExpand(path);
  },[getNode,geometry,onExpand]);
  useLayoutEffect(()=>{
    const result:MapNode[]=geometry.nodes.map(n=>{
      const root=n.depth===0,color=root?'#cdb687':colors[n.branch%colors.length];
      const side=mode==='vertical'?'bottom':mode==='horizontal'||root?'right':Math.abs(Math.cos(n.angle))>Math.abs(Math.sin(n.angle)*.65)?(Math.cos(n.angle)<0?'left':'right'):(Math.sin(n.angle)<0?'top':'bottom');
      return {id:n.node.path,type:'item',position:{x:n.x,y:n.y},style:{width:n.width,height:n.height},initialWidth:n.width,initialHeight:n.height,selected:n.node.path===selectedPath,draggable:false,ariaLabel:`${itemName(n.node.key)}，${fmt(n.node.owned)} / ${fmt(n.node.required)}`,data:{node:n.node,root,color,expanded:expanded.has(n.node.path),readonly,layout:mode,expandSide:side,onExpand:handleExpand,onCheck}};
    });
    setNodes(previous=>{const measured=new Map(previous.map(n=>[n.id,n.measured]));return result.map(n=>({...n,measured:measured.get(n.id)}));});
    setEdges(geometry.edges.map(e=>{
      const target=geometry.nodes.find(n=>n.node.path===e.target)!,active=selectedPath===e.target||selectedPath.startsWith(e.target+'/');
      return {id:`${e.source}-${e.target}`,source:e.source,target:e.target,type:'recipe',selectable:false,focusable:false,data:{layout:mode,sourceRoot:e.sourceRoot},style:{stroke:target.node.missing===0?'#73b79b':colors[e.branch%colors.length],strokeWidth:active?2:1.2,opacity:active?.9:.4},zIndex:-1};
    }));
    const anchor=pendingAnchor.current;pendingAnchor.current=null;
    if(anchor){const next=geometry.nodes.find(n=>n.node.path===anchor.path);if(next){const v=getViewport();void setViewport({...v,x:v.x+(anchor.x-next.x-next.width/2)*v.zoom,y:v.y+(anchor.y-next.y-next.height/2)*v.zoom});}}
  },[geometry,selectedPath,expanded,readonly,mode,handleExpand,onCheck,getViewport,setViewport]);
  const initialized=useNodesInitialized(),fitted=useRef('');
  const onNodesChange=useCallback((changes:NodeChange<MapNode>[])=>setNodes(previous=>applyNodeChanges(changes,previous)),[]);
  useEffect(()=>{
    const key=project.id+':'+mode+':'+onlyIncomplete;if(!initialized||fitted.current===key)return;
    let second=0;const first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>{fitted.current=key;void fitView({padding:.12,duration:300,minZoom:.025,maxZoom:.85});});});
    return()=>{cancelAnimationFrame(first);cancelAnimationFrame(second);};
  },[initialized,project.id,mode,onlyIncomplete,fitView]);
  function focusSelected(){const n=getNode(selectedPath),box=geometry.nodes.find(n=>n.node.path===selectedPath);if(n&&box)void setCenter(n.position.x+box.width/2,n.position.y+box.height/2,{zoom:.95,duration:300});}
  return <div className="map-container" data-layout={mode}>
    <ReactFlow<MapNode,MapEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange} onNodeClick={(_,n)=>onSelect(n.id)} minZoom={.025} maxZoom={1.8} nodesConnectable={false} nodesDraggable={false} deleteKeyCode={null} onMoveEnd={(_,v)=>setZoom(v.zoom)} selectionOnDrag={false} panOnScroll={false} colorMode="dark" style={{background:'transparent'}}>
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#29343b"/>
    </ReactFlow>
    <div className="map-heading"><span className="eyebrow"><span className="status-dot"/> RECIPE CONSTELLATION</span><h1>{itemName(project.target)}</h1><p>目标 {fmt(project.quantity)} 个 <span>·</span> {plan.root.children.length} 类直接材料 <span>·</span> {percent(plan.readiness)} 已就绪</p></div>
    <div className="map-guide"><span className="guide-line"/>点击物品查看配方 <ChevronRight size={12}/> 展开分支探索材料</div>
    <div className="map-controls"><button onClick={()=>void zoomOut({duration:200})} aria-label="缩小"><Minus size={16}/></button><span>{Math.round(zoom*100)}%</span><button onClick={()=>void zoomIn({duration:200})} aria-label="放大"><Plus size={16}/></button><i/><button onClick={()=>void fitView({padding:.12,duration:300,minZoom:.025,maxZoom:.9})} aria-label="显示全部" title="显示全部"><Maximize size={16}/></button><button onClick={focusSelected} aria-label="聚焦选中物品" title="聚焦选中物品"><Focus size={16}/></button><button onClick={()=>void setCenter(0,0,{zoom:.75,duration:300})} aria-label="返回中心目标" title="返回中心目标"><LocateFixed size={16}/></button></div>
    <div className="map-legend"><span><i className="legend-dot"/>待制作</span><span><i className="legend-dot green"/>已就绪</span><span className="legend-caption">自动排版 · 拖动画布 · 滚轮缩放</span></div>
  </div>;
}
export function StarMap(props:Props){return <ReactFlowProvider><MapContent {...props}/></ReactFlowProvider>;}
