import {useCallback,useEffect,useMemo,useRef,useState,type ChangeEvent} from 'react';
import {ArrowDownToLine,ArrowUpFromLine,BookOpen,Check,ChevronDown,ChevronRight,Copy,Filter,FolderOpen,GitBranch,Info,Layers,Link2,Menu,MoreHorizontal,Plus,RotateCcw,Search,Share2,Sparkles,Trash2,X} from 'lucide-react';
import {dataset,fmt,itemName,percent} from './data';
import type {Project,Requirement,Workspace} from './domain/types';
import {createProject,validateProject,validateWorkspace} from './domain/project';
import {buildPlan,chooseRecipe} from './domain/planner';
import {recordCraft} from './domain/crafting';
import {decodeSnapshot} from './domain/share';
import {loadWorkspace,saveWorkspace} from './storage';
import {ItemIcon} from './components/ItemIcon';
import {StarMap} from './components/StarMap';
import {Details} from './components/Details';
import {GameImportDialog} from './components/GameImportDialog';
import {DataDialog,downloadJson,GoalDialog,Modal,ShareDialog} from './components/Dialogs';

type Dialog='gameImport'|'new'|'share'|'data'|'rename'|'delete'|null;
export function App(){
  const [workspace,setWorkspace]=useState<Workspace|null>(null),[snapshot,setSnapshot]=useState<Project|null>(null);
  const [dialog,setDialog]=useState<Dialog>(null),[initialTarget,setInitialTarget]=useState<string|undefined>();
  const [selectedPath,setSelectedPath]=useState('root'),[showDetails,setShowDetails]=useState(false),[showSidebar,setShowSidebar]=useState(false);
  const [browseKey,setBrowseKey]=useState<string|null>(null);
  const [onlyIncomplete,setOnlyIncomplete]=useState(false),[saveStatus,setSaveStatus]=useState<'saving'|'saved'|'error'>('saving');
  const [toast,setToast]=useState(''),[loadError,setLoadError]=useState(''),[storageProtected,setStorageProtected]=useState(false);
  const [menuId,setMenuId]=useState<string|null>(null),[rename,setRename]=useState(''),[nodeQuery,setNodeQuery]=useState('');
  const [history,setHistory]=useState<Workspace[]>([]);
  const importInput=useRef<HTMLInputElement>(null),toastTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const closeDialog=useCallback(()=>setDialog(null),[]);
  const notify=useCallback((message:string)=>{setToast(message);if(toastTimer.current)clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),5000);},[]);
  useEffect(()=>{
    let cancelled=false;
    void loadWorkspace(dataset).then(value=>{
      if(cancelled)return;
      if(value)setWorkspace(value);else{const p=createProject(dataset,'allthetweaks:atm_star',1);setWorkspace({schema:1,projects:[p],activeId:p.id});}
    }).catch(error=>{
      if(cancelled)return;
      setStorageProtected(true);setLoadError(`本地存档未能读取：${error instanceof Error?error.message:'浏览器存储不可用'}。原存档不会被覆盖，当前更改仅保留在本次会话，请导出备份。`);
      const p=createProject(dataset,'allthetweaks:atm_star',1);setWorkspace({schema:1,projects:[p],activeId:p.id});setSaveStatus('error');
    });
    function readHash(){const hash=location.hash;if(hash.startsWith('#s=')){try{setSnapshot(decodeSnapshot(hash.slice(3),dataset));setSelectedPath('root');setShowDetails(false);}catch(error){notify(error instanceof Error?error.message:'分享链接无效');setSnapshot(null);}}else setSnapshot(null);}
    readHash();window.addEventListener('hashchange',readHash);
    return()=>{cancelled=true;window.removeEventListener('hashchange',readHash);};
  },[notify]);
  useEffect(()=>{
    if(!workspace||storageProtected)return;
    let current=true;setSaveStatus('saving');
    void saveWorkspace(workspace).then(()=>{if(current)setSaveStatus('saved');}).catch(()=>{if(current){setSaveStatus('error');notify('浏览器保存失败，当前进度仍在，请导出备份。');}});
    return()=>{current=false;};
  },[workspace,storageProtected,notify]);
  useEffect(()=>()=>{if(toastTimer.current)clearTimeout(toastTimer.current);},[]);
  const active=snapshot??workspace?.projects.find(p=>p.id===workspace.activeId);
  useEffect(()=>setBrowseKey(null),[active?.id]);
  const plan=useMemo(()=>active?buildPlan(dataset,active):null,[active]);
  const selected=plan?.nodes.find(n=>n.path===selectedPath)??plan?.root;
  const matchedNodes=useMemo(()=>{
    const q=nodeQuery.trim().toLowerCase();if(!q||!plan)return [];
    return plan.nodes.filter(n=>{const item=dataset.items[n.key];return `${item?.name} ${item?.englishName} ${item?.id}`.toLowerCase().includes(q);}).slice(0,8);
  },[nodeQuery,plan]);
  const readonly=!!snapshot;
  function leaveSnapshot(){setSnapshot(null);if(location.hash)window.history.replaceState(null,'',location.pathname+location.search);}
  function mutate(next:Workspace,track=true){if(workspace&&track)setHistory(h=>[...h.slice(-19),workspace]);setWorkspace(next);}
  const updateProject=useCallback((project:Project)=>{
    if(snapshot)return;
    if(!workspace)return;
    setHistory(h=>[...h.slice(-19),workspace]);
    setWorkspace({...workspace,projects:workspace.projects.map(p=>p.id===project.id?{...project,updatedAt:new Date().toISOString()}:p)});
  },[snapshot,workspace]);
  const expand=useCallback((path:string)=>{
    if(!active)return;
    const was=active.expanded.includes(path);
    const expanded=was?active.expanded.filter(p=>p!==path&&!p.startsWith(`${path}/`)):[...active.expanded,path];
    if(snapshot)setSnapshot({...snapshot,expanded});else updateProject({...active,expanded});
  },[active,snapshot,updateProject]);
  const complete=useCallback((node:Requirement)=>{
    if(!active||snapshot)return;
    if(node.missing===0&&dataset.tags?.[node.key]&&Object.keys(node.allocations??{}).some(k=>k!==node.key)){notify('此标签由实际材料满足，请在对应物品详情中调整已有数量。');return;}
    const current=active.inventory[node.key]??0;
    const amount=node.missing===0?Math.max(0,current-node.owned):current+node.missing;
    if(amount>1e12){notify('数量超过可记录范围，请拆分目标。');return;}
    updateProject({...active,inventory:{...active.inventory,[node.key]:amount}});
  },[active,snapshot,updateProject,notify]);
  function craft(node:Requirement){if(!active||readonly)return;try{updateProject(recordCraft(dataset,active,node));notify('已记入产物，并扣除了消耗的直接材料。');}catch(error){notify(error instanceof Error?error.message:'无法记录制作');}}
  function select(path:string){setBrowseKey(null);setSelectedPath(path);setShowDetails(true);}
  function inspect(key:string){setBrowseKey(key);setShowDetails(true);}
  function createGoal(key:string,quantity:number,name:string){
    if(!workspace)return;if(workspace.projects.length>=100){notify('最多保存 100 个目标，请先导出并删除不再需要的目标。');return;}
    const p=createProject(dataset,key,quantity);if(name.trim())p.name=name.trim();leaveSnapshot();mutate({...workspace,projects:[...workspace.projects,p],activeId:p.id});setSelectedPath('root');setShowDetails(false);closeDialog();notify('新的制作目标已创建。');
  }
  function newGoal(key?:string){setInitialTarget(key);setDialog('new');setMenuId(null);}
  function copySnapshot(){if(!snapshot||!workspace)return;if(workspace.projects.length>=100){notify('最多保存 100 个目标，请先整理已有目标。');return;}const p={...structuredClone(snapshot),id:crypto.randomUUID(),name:`${snapshot.name} · 副本`.slice(0,100),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};leaveSnapshot();mutate({...workspace,projects:[...workspace.projects,p],activeId:p.id});notify('已复制到你的目标，可继续记录。');}
  function switchGoal(id:string){if(!workspace)return;leaveSnapshot();mutate({...workspace,activeId:id},false);setSelectedPath('root');setShowSidebar(false);setShowDetails(false);setNodeQuery('');}
  function duplicateGoal(id:string){if(!workspace||workspace.projects.length>=100)return;const original=workspace.projects.find(p=>p.id===id)!;const p={...structuredClone(original),id:crypto.randomUUID(),name:`${original.name} · 副本`.slice(0,100),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};leaveSnapshot();mutate({...workspace,projects:[...workspace.projects,p],activeId:p.id});setMenuId(null);}
  function deleteGoal(){if(!workspace||!menuId)return;let projects=workspace.projects.filter(p=>p.id!==menuId);if(!projects.length)projects=[createProject(dataset,'allthetweaks:atm_star',1)];mutate({...workspace,projects,activeId:projects.some(p=>p.id===workspace.activeId)?workspace.activeId:projects[0].id});setMenuId(null);setSelectedPath('root');closeDialog();notify('目标已删除，可通过撤销恢复。');}
  async function importFile(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];event.target.value='';if(!file||!workspace)return;
    try{
      if(file.size>5000000)throw new Error('存档文件大于 5 MB，无法导入');
      const value=JSON.parse(await file.text());
      const originals:Project[]=Array.isArray(value.projects)?validateWorkspace(value,dataset).projects:[validateProject(value.project??value,dataset)];
      if(workspace.projects.length+originals.length>100)throw new Error('导入后将超过 100 个目标');
      const imported=originals.map(p=>({...p,id:crypto.randomUUID(),updatedAt:new Date().toISOString()}));
      leaveSnapshot();mutate({...workspace,projects:[...workspace.projects,...imported],activeId:imported[0].id});setSelectedPath('root');notify(`已导入 ${imported.length} 个目标，现有进度保留。`);
    }catch(error){notify(`导入失败：${error instanceof Error?error.message:'文件格式无效'}`);}
  }
  function undo(){const previous=history.at(-1);if(!previous)return;setHistory(h=>h.slice(0,-1));setWorkspace(previous);setSelectedPath('root');notify('已撤销上一次更改。');}
  function searchSelect(path:string){if(!active)return;const parts=path.split('/'),parents=parts.slice(0,-1).map((_,i)=>parts.slice(0,i+1).join('/'));const expanded=[...new Set([...active.expanded,...parents])];if(snapshot)setSnapshot({...snapshot,expanded});else updateProject({...active,expanded});select(path);setNodeQuery('');}
  if(!workspace||!active||!plan||!selected)return <div className="loading-screen"><Sparkles size={28}/><strong>正在展开你的星图</strong><span>读取 ATM10 8.3 配方与本地存档…</span></div>;
  const completed=plan.root.children.filter(n=>n.missing===0).length;
  const detailNode:Requirement=browseKey?{path:'browse',key:browseKey,required:0,owned:0,missing:0,consumed:true,recipeId:chooseRecipe(dataset,active,browseKey)?.id,batches:0,excess:0,children:[],cycle:false,limited:false,ready:false}:selected;
  return <div className="app-shell">
    {showSidebar&&<button className="sidebar-backdrop" aria-label="关闭目标列表" onClick={()=>setShowSidebar(false)}/>}
    <aside className={`sidebar ${showSidebar?'open':''}`} aria-label="制作目标列表">
      <a className="brand" href="#" onClick={e=>{e.preventDefault();switchGoal(workspace.activeId);}}><span className="brand-icon"><Sparkles size={24}/></span><span><strong>ATM 星图<span className="beta">BETA</span></strong><small>从材料到每一个可能</small></span></a>
      <button className="pack-selector" onClick={()=>setDialog('data')}><span className="pack-art"><Layers size={19}/></span><span><strong>All the Mods 10</strong><small>版本 8.3 <i/> 发布包数据</small></span><ChevronDown size={14}/></button>
      <button className="new-goal-button" onClick={()=>newGoal()}><Plus size={17}/>新建制作目标<span>＋</span></button>
      <div className="sidebar-section-title"><span>我的制作目标</span><span>{workspace.projects.length.toString().padStart(2,'0')}</span></div>
      <div className="projects-list">{workspace.projects.map(p=>{
        const pp=p.id===active.id?plan:buildPlan(dataset,p),isActive=!snapshot&&p.id===workspace.activeId;
        return <div key={p.id} className={`project-card ${isActive?'active':''}`}><button className="project-main" onClick={()=>switchGoal(p.id)}><span className="project-symbol"><ItemIcon itemKey={p.target} size={30}/></span><span className="project-card-text"><strong title={p.name}>{p.name}</strong><small>{pp.root.missing===0?'目标已制成':`${percent(pp.readiness)} 材料就绪`}<i/>{fmt(p.quantity)} 个</small></span></button><button className="project-more" aria-label={`管理目标 ${p.name}`} onClick={()=>setMenuId(menuId===p.id?null:p.id)}><MoreHorizontal size={16}/></button><div className="project-progress"><i style={{width:percent(pp.readiness)}}/></div>{menuId===p.id&&!dialog&&<div className="project-menu"><button onClick={()=>{setRename(p.name);setDialog('rename');}}><BookOpen size={14}/>重命名</button><button onClick={()=>duplicateGoal(p.id)}><Copy size={14}/>复制目标</button><button className="danger" onClick={()=>setDialog('delete')}><Trash2 size={14}/>删除目标</button></div>}</div>;
      })}</div>
      <div className="sidebar-bottom"><button className="game-import-button" onClick={()=>setDialog('gameImport')}><FolderOpen size={15}/>从游戏存档识别进度</button><div className="local-storage-note"><span className="local-icon"><FolderOpen size={18}/></span><div><strong>你的进度，留在本地</strong><p>自动保存在当前浏览器</p></div><span className={`status-dot ${saveStatus==='error'?'warning':''}`}/></div><div className="backup-buttons"><button onClick={()=>downloadJson(workspace,'atm-star-workspace.json')}><ArrowDownToLine size={14}/>导出存档</button><button onClick={()=>importInput.current?.click()}><ArrowUpFromLine size={14}/>导入</button></div><button className="about-button" onClick={()=>setDialog('data')}><Info size={14}/><span>数据来源与使用说明</span><ChevronRight size={14}/></button><div className="sidebar-footer"><span>为探索与创造而作</span><span>v0.1</span></div></div>
    </aside>
    <main className="main-workspace">
      <header className="topbar"><div className="breadcrumbs"><button className="icon-button mobile-menu" aria-label="打开目标列表" onClick={()=>setShowSidebar(true)}><Menu size={19}/></button><span className="desktop-only">制作空间</span><ChevronRight size={13} className="desktop-only"/><span className="breadcrumb-current">{active.name}</span><span className="version-badge">8.3</span></div><div className="topbar-actions"><span className={`save-indicator ${saveStatus==='error'?'error-text':''}`}>{readonly?<><Link2 size={13}/>分享快照</>:saveStatus==='saved'?<><Check size={13}/>已保存</>:saveStatus==='saving'?'保存中…':'保存失败'}</span><button className="icon-button" aria-label="撤销上次更改" title="撤销上次更改" onClick={undo} disabled={!history.length||readonly}><RotateCcw size={16}/></button><span className="toolbar-divider"/><button className="secondary-button compact export-top" onClick={()=>downloadJson({schema:1,project:active},'atm-star-progress.json')}><ArrowDownToLine size={15}/>导出</button><button className="share-button" onClick={()=>setDialog('share')}><Share2 size={15}/>分享进度</button></div></header>
      {loadError&&<div className="storage-banner"><Info size={16}/>{loadError}</div>}
      {snapshot&&<div className="snapshot-banner"><Link2 size={15}/><span>正在查看分享时刻的只读快照</span><button onClick={copySnapshot}><Copy size={14}/>复制为我的目标</button><button className="icon-button" onClick={leaveSnapshot} aria-label="退出分享快照"><X size={16}/></button></div>}
      <div className="workspace-toolbar"><div className="view-label"><GitBranch size={16}/><strong>合成地图</strong><label className="layout-picker"><span>布局</span><select aria-label="合成树布局" value={active.layout??'radial'} onChange={e=>{const layout=e.target.value as Project['layout'];if(snapshot)setSnapshot({...snapshot,layout});else updateProject({...active,layout});}}><option value="radial">放射状</option><option value="horizontal">横向树</option><option value="vertical">纵向树</option></select></label></div><div className="map-tools"><div className="node-search"><Search size={14}/><input aria-label="在当前合成树中查找" placeholder="查找树中物品…" value={nodeQuery} onChange={e=>setNodeQuery(e.target.value)}/>{nodeQuery&&<div className="node-search-results">{matchedNodes.length?matchedNodes.map(n=><button key={n.path} onClick={()=>searchSelect(n.path)}><ItemIcon itemKey={n.key} size={22}/><span>{itemName(n.key)}</span><small>{n.path.split('/').length-1} 层</small></button>):<span className="empty-search">当前路线中没有匹配物品</span>}</div>}</div><button aria-label="仅未完成" className={`filter-button ${onlyIncomplete?'active':''}`} onClick={()=>setOnlyIncomplete(!onlyIncomplete)} aria-pressed={onlyIncomplete}><Filter size={14}/><span>仅未完成</span></button><button className="icon-button details-toggle" aria-label="打开物品详情" onClick={()=>setShowDetails(true)}><BookOpen size={17}/></button></div></div>
      <div className={`workspace-content ${showDetails?'details-open':''}`}><section className="map-section" aria-label="合成地图"><StarMap key={active.id} plan={plan} project={active} selectedPath={selected.path} onSelect={select} onExpand={expand} onCheck={complete} readonly={readonly} onlyIncomplete={onlyIncomplete}/><div className="goal-summary"><div className="summary-main"><span className="summary-icon"><Sparkles size={18}/></span><div><span className="summary-label">直接材料就绪度 <Info size={11}/></span><strong>{percent(plan.readiness)}<small>{plan.root.missing===0?'目标已制成':completed===plan.root.children.length&&completed?'材料已齐，等待制作':'一步一步，点亮这颗星'}</small></strong></div></div><div className="summary-track"><div><span>{completed} <small>/ {plan.root.children.length} 类直接材料</small></span><span>{fmt(plan.root.owned)} / {fmt(active.quantity)} 已制成</span></div><div className="large-progress"><i style={{width:percent(plan.readiness)}}/></div></div><button className="summary-action" onClick={()=>select('root')}>查看目标<ChevronRight size={14}/></button></div></section><Details node={detailNode} plan={plan} browsing={!!browseKey} onInspect={inspect} project={active} readonly={readonly} onUpdate={updateProject} onSelect={select} onNewGoal={newGoal} onComplete={complete} onCraft={craft} onClose={()=>setShowDetails(false)}/></div>
      <footer className="workspace-footer"><span><span className="status-dot"/>{import.meta.env.MODE==='offline'?'ATM10 8.3 · 离线版 · 本地运行':'ATM10 8.3 · 发布包资源'}</span><button onClick={()=>setDialog('data')}>配方覆盖说明<Info size={12}/></button><span className="footer-count">{fmt(plan.nodes.length)} 个需求节点 · 数据集 v1</span></footer>
    </main>
    <input ref={importInput} type="file" accept="application/json,.json" hidden onChange={event=>void importFile(event)}/>
    {toast&&<div className="toast" role="status"><Info size={16}/>{toast}<button aria-label="关闭提示" onClick={()=>setToast('')}><X size={14}/></button></div>}
    {dialog==='gameImport'&&<GameImportDialog onClose={closeDialog} onImport={p=>{if(workspace.projects.length>=100){notify('最多保存 100 个目标，请先整理已有目标。');return;}const valid=validateProject(p,dataset);leaveSnapshot();mutate({...workspace,projects:[...workspace.projects,valid],activeId:valid.id});setSelectedPath('root');closeDialog();notify('已从游戏存档创建独立目标，原有进度保留。');}}/>}
    {dialog==='new'&&<GoalDialog initialKey={initialTarget} onClose={closeDialog} onCreate={createGoal}/>}
    {dialog==='share'&&<ShareDialog project={active} onClose={closeDialog}/>}
    {dialog==='data'&&<DataDialog onClose={closeDialog}/>}
    {dialog==='rename'&&<Modal title="重命名制作目标" onClose={closeDialog}><form onSubmit={e=>{e.preventDefault();if(!rename.trim())return;mutate({...workspace,projects:workspace.projects.map(p=>p.id===menuId?{...p,name:rename.trim(),updatedAt:new Date().toISOString()}:p)});setMenuId(null);closeDialog();}}><div className="rename-body"><label className="field-label">目标名称<input data-autofocus aria-label="新的目标名称" value={rename} maxLength={100} onChange={e=>setRename(e.target.value)}/></label></div><div className="modal-footer"><button type="button" className="secondary-button" onClick={closeDialog}>取消</button><button className="primary-button" disabled={!rename.trim()}>保存名称</button></div></form></Modal>}
    {dialog==='delete'&&<Modal title="删除这个制作目标？" onClose={closeDialog}><div className="rename-body"><p>将删除「{workspace.projects.find(p=>p.id===menuId)?.name}」的本地进度。其他目标不受影响；操作后可以撤销。</p></div><div className="modal-footer"><button className="secondary-button" onClick={closeDialog}>保留目标</button><button className="danger-button" onClick={deleteGoal}><Trash2 size={15}/>删除目标</button></div></Modal>}
  </div>;
}
