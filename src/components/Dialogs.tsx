import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {ArrowRight,Check,Copy,Download,ExternalLink,Info,Search,ShieldCheck,X} from 'lucide-react';
import {dataset,fmt,itemName} from '../data';
import type {Project} from '../domain/types';
import {encodeSnapshot} from '../domain/share';
import {ItemIcon} from './ItemIcon';
export function Modal({title,subtitle,children,onClose,wide=false}:{title:string;subtitle?:string;children:ReactNode;onClose:()=>void;wide?:boolean}){
  const panel=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const focusable=()=>Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]')??[]);
    const initial=panel.current?.querySelector<HTMLElement>('[data-autofocus]')??focusable()[0];initial?.focus();
    function keys(e:KeyboardEvent){if(e.key==='Escape')onClose();if(e.key==='Tab'){const list=focusable(),first=list[0],last=list.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}
    document.addEventListener('keydown',keys);return()=>{document.removeEventListener('keydown',keys);previous?.focus();};
  },[onClose]);
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={panel} className={`modal ${wide?'wide':''}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button className="icon-button" aria-label="关闭对话框" onClick={onClose}><X size={20}/></button></div>{children}</div></div>;
}
export function GoalDialog({initialKey,onCreate,onClose}:{initialKey?:string;onCreate:(key:string,quantity:number,name:string)=>void;onClose:()=>void}){
  const [query,setQuery]=useState(''),[selected,setSelected]=useState(initialKey??'allthetweaks:atm_star'),[quantity,setQuantity]=useState('1'),[name,setName]=useState('');
  const items=useMemo(()=>{
    const q=query.trim().toLowerCase(),outputs=new Set(dataset.recipes.map(r=>r.output.key));
    return Object.values(dataset.items).filter(i=>i.kind==='item'&&(!q||`${i.name} ${i.englishName} ${i.id} ${i.mod}`.toLowerCase().includes(q))).sort((a,b)=>{
      if(a.key==='allthetweaks:atm_star')return -1;if(b.key==='allthetweaks:atm_star')return 1;
      return Number(outputs.has(b.key))-Number(outputs.has(a.key))||a.name.localeCompare(b.name);
    }).slice(0,50);
  },[query]);
  const n=Number(quantity),valid=Number.isInteger(n)&&n>=1&&n<=1e6;
  return <Modal title="开始一个新的制作目标" subtitle="每个目标独立记录，随时在左侧切换。" onClose={onClose} wide>
    <div className="goal-dialog-body"><label className="search-field"><Search size={17}/><input data-autofocus aria-label="搜索目标物品" placeholder="搜索物品、模组或物品 ID…" value={query} onChange={e=>setQuery(e.target.value)}/><kbd>搜索</kbd></label><div className="search-results">{items.map(item=><button key={item.key} className={`search-result ${item.key===selected?'selected':''}`} onClick={()=>setSelected(item.key)}><ItemIcon itemKey={item.key} size={33}/><span><strong>{item.name}</strong><small>{item.mod}</small></span>{item.key===selected&&<Check size={17}/>}</button>)}{!items.length&&<div className="empty-search">没有找到匹配的已收录物品</div>}</div><p className="inline-note">目录已扩展为本版原生配方、材料标签及获取来源。部分动态配方仍待游戏内核验。</p><div className="new-goal-summary"><ItemIcon itemKey={selected} size={42}/><div><span className="subtle">选中的目标</span><strong>{itemName(selected)}</strong></div><label>目标数量<input aria-label="目标数量" type="number" min="1" max="1000000" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label></div><label className="field-label">目标名称 <span className="subtle">可选</span><input aria-label="目标名称" maxLength={100} placeholder={`${itemName(selected)} ×${quantity}`} value={name} onChange={e=>setName(e.target.value)}/></label>{!valid&&<p className="error-text">目标数量须为 1 至 1,000,000 的整数。</p>}</div><div className="modal-footer"><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!valid} onClick={()=>onCreate(selected,n,name)} >创建制作目标<ArrowRight size={15}/></button></div>
  </Modal>;
}
export function downloadJson(value:unknown,filename:string){
  const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function ShareDialog({project,onClose}:{project:Project;onClose:()=>void}){
  const offline=import.meta.env.MODE==='offline';
  const [copied,setCopied]=useState(false),[error,setError]=useState('');
  const link=useMemo(()=>{try{return `${location.origin}${location.pathname}#s=${encodeSnapshot(project)}`;}catch{return null;}},[project]);
  async function copy(){if(!link)return;try{await navigator.clipboard.writeText(link);setCopied(true);}catch{setError('无法访问剪贴板，可以选中下方链接手动复制。');}}
  return <Modal title="分享你的制作进度" subtitle={offline?"导出进度文件，发送给朋友，在对方的离线版中导入。":"发送一份此刻的快照，让朋友沿着你的星图继续探索。"} onClose={onClose}>
    <div className="share-body"><div className="share-project"><ItemIcon itemKey={project.target} size={54}/><div><strong>{project.name}</strong><span>ATM10 8.3 · 目标 {fmt(project.quantity)} 个</span></div><span className="tag">只读快照</span></div>{!offline&&<><label className="field-label">快照链接<textarea aria-label="分享快照链接" readOnly value={link??'当前进度内容较大，请使用下方的文件分享。'} rows={3} onFocus={e=>e.target.select()}/></label><button className="primary-button full" disabled={!link} onClick={()=>void copy()}>{copied?<Check size={16}/>:<Copy size={16}/>} {copied?'链接已复制':'复制分享链接'}</button></>}{error&&<p className="error-text">{error}</p>}<div className="share-explanation"><Info size={16}/><p>{offline?"本地地址仅指向各自电脑。请将下方 JSON 进度文件发送给朋友，让对方启动离线版后点击“导入”。文件包含此目标的备注，后续修改互不影响。":"接收者查看的是分享时刻的进度，可复制为自己的目标。后续修改互不影响；链接包含此目标的备注。网站的访问权限仍然适用。"}</p></div><button className="secondary-button full" onClick={()=>downloadJson({schema:1,project},'atm-star-progress.json')}><Download size={15}/>导出此目标为进度文件</button></div>
  </Modal>;
}
export function DataDialog({onClose}:{onClose:()=>void}){
  return <Modal title="关于这份星图" subtitle="知道数据从哪里来，也知道哪些地方仍需核验。" onClose={onClose} wide><div className="data-dialog-body"><div className="data-headline"><ShieldCheck size={25}/><div><strong>ATM10 8.3 · 官方发布包</strong><p>Minecraft 1.21.1 / NeoForge 21.1.259</p></div><span className="tag">脚本已核对</span></div><div className="data-stats"><div><strong>{fmt(dataset.recipes.length)}</strong><span>已收录路线（含标签与操作）</span></div><div><strong>{fmt(Object.keys(dataset.items).length)}</strong><span>精确物品身份</span></div><div><strong>{dataset.coverage.filesScanned}</strong><span>已扫描发布包脚本</span></div></div><div className="notice amber"><Info size={17}/><div><strong>静态来源已核对，运行时仍待核验</strong><p>{dataset.coverage.note}</p></div></div><p className="data-description">主路线已确认包含 13 类直接材料，包括 28 个难得素–ATM 合金块、15 个三重压缩下界之星块和 2 个带附魔数据的觉醒合金块。不同数据组件按不同物品分别记录。</p><div className="section-label"><span>使用方式</span></div><ol className="help-steps"><li>点击地图节点查看配方，点击节点旁的 + 展开下一层。</li><li>填写已有数量；材料齐全后，使用“确认制作”扣除材料并记入产物。</li><li>本地自动保存在当前浏览器。导出全部存档，可用于备份或换设备。</li><li>分享生成只读快照，接收者复制后继续记录自己的进度。</li></ol><div className="section-label"><span>发布包校验</span><span className="subtle">2026-10-25</span></div><code className="hash-block">SHA-256<br/>{dataset.release.sha256}</code><a className="source-link" href={dataset.release.url} target="_blank" rel="noreferrer">打开官方 8.3 发布页面<ExternalLink size={13}/></a><p className="inline-note">中文名优先采用对应版本语言文件，缺失译文由本项目补全；英文名和物品 ID 仍可用于搜索。图标取自 Minecraft 1.21.1 与 ATM10 8.3 模组资源，特殊渲染物品显示静态预览。材料标签显示代表图标。新增目录中尚无中文资源的条目明确标为待译名，未能静态渲染的图标显示缺失提示；原有中文和图标已保留。</p><p className="inline-note">旧配方引用的 eternal_starlight:trapped_soul 未在本版模组中找到对应物品资源，已明确显示缺失图标，不用其他物品冒充。</p></div></Modal>;
}
