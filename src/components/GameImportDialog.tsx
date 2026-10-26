import {useState} from 'react';
import {FileUp,Info,Check,FolderOpen} from 'lucide-react';
import {Modal} from './Dialogs';
import {ItemIcon} from './ItemIcon';
import {dataset,fmt,itemName,percent} from '../data';
import {readMinecraftSave} from '../domain/minecraftSave';
import {createProject} from '../domain/project';
import {buildPlan} from '../domain/planner';
import type {Project} from '../domain/types';
export function GameImportDialog({onClose,onImport}:{onClose:()=>void;onImport:(project:Project)=>void}){
 const [result,setResult]=useState<Awaited<ReturnType<typeof readMinecraftSave>>|null>(null),[filename,setFilename]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const preview=result?{...createProject(dataset,'allthetweaks:atm_star',1),inventory:result.inventory}:null;
 const plan=preview?buildPlan(dataset,preview):null;
 async function read(file:File|undefined){if(!file)return;setResult(null);setError('');setBusy(true);try{
   if(file.size>8*1024*1024)throw new Error('文件超过 8 MB。请选择单个 level.dat 或玩家 .dat，无需上传整个世界。');
   const data=await readMinecraftSave(new Uint8Array(await file.arrayBuffer()),dataset);
   if(Object.keys(data.inventory).length>2000)throw new Error('可识别物品种类超过当前存档上限，请先减少容器内容。');
   if(Object.values(data.inventory).some(n=>!Number.isSafeInteger(n)||n<0||n>1e12))throw new Error('物品数量超出当前进度存档的范围。');
   setResult(data);setFilename(file.name);
 }catch(e){setError(e instanceof Error?e.message:'无法读取此存档');}finally{setBusy(false);}}
 function confirm(){if(!preview||!result)return;const project={...preview,name:`游戏存档 · ${new Date().toLocaleDateString('zh-CN')}`,notes:`从 ${filename} 识别的当前物品快照。未识别已消耗材料、未放入玩家文件的基地仓储或合成历史。${result.warnings.join(' ')}`.slice(0,10000)};onImport(project);}
 return <Modal title="从 Minecraft 存档识别进度" subtitle="选择一个小文件，预览后保存为独立的 ATM 之星目标。" onClose={onClose} wide><div className="game-import-body">
  <div className="notice"><FolderOpen size={19}/><div><strong>推荐：level.dat</strong><p>在单人游戏的世界列表中选择「编辑 → 打开世界文件夹」，找到 level.dat。建议退出世界后再选择文件。想盘点基地里的关键材料，可先将它们放入背包或末影箱。</p><code>saves / 世界名 / level.dat</code></div></div>
  <details className="import-help"><summary>服务器玩家 / 启动器文件夹在哪里？</summary><p>也支持世界文件夹下的 playerdata / 玩家UUID.dat。服务器玩家需要自己对应的玩家文件；level.dat 未必含玩家背包。CurseForge 等启动器可先打开整合包实例文件夹，再进入 saves / 世界名。</p><p>无需选择 level.dat_old、整个世界压缩包、region 区块文件或 FTB Quests 文件。</p></details>
  <label className={`game-file-picker ${busy?'busy':''}`}><FileUp size={23}/><strong>{busy?'正在本地读取…':'选择 level.dat 或玩家 .dat'}</strong><span>文件只在当前浏览器解析，不会上传</span><input type="file" accept=".dat,.nbt" aria-label="选择 Minecraft 存档文件" disabled={busy} onChange={e=>{void read(e.target.files?.[0]);e.target.value='';}}/></label>
  {error&&<p className="error-text" role="alert">{error}</p>}
  {result&&plan&&<><div className="game-import-stats"><div><Check size={17}/><strong>{fmt(result.matchedStacks)}</strong><span>已识别物品堆</span></div><div><strong>{Object.keys(result.inventory).length}</strong><span>已收录物品种类</span></div><div><strong>{percent(plan.readiness)}</strong><span>直接材料就绪度</span></div></div><p className="inline-note">文件：{filename} · {result.sourceKind}。只计当前持有量；这不代表历史总制作进度。</p><div className="import-items" aria-label="已识别物品预览">{Object.entries(result.inventory).slice(0,80).map(([key,count])=><div key={key}><ItemIcon itemKey={key} size={25}/><span>{itemName(key)}</span><strong>×{fmt(count)}</strong></div>)}{Object.keys(result.inventory).length>80&&<p className="inline-note">另有 {Object.keys(result.inventory).length-80} 类物品，导入时一并保留。</p>}</div>{!Object.keys(result.inventory).length&&<p className="inline-note">没有识别到目录中的物品。可查看未匹配项，或确认选择了自己的玩家文件。</p>}{result.unknownItems.length>0&&<details className="import-help"><summary>{result.unknownItems.length} 类物品未能匹配当前目录</summary><p>未匹配的物品不会被错误计入特殊组件物品。请按需要手动补记。</p><code>{result.unknownItems.slice(0,30).map(v=>`${v.id} ×${v.count}`).join('\n')}</code></details>}{result.warnings.map((w,i)=><p className="inline-note" key={i}>{w}</p>)}</>}
  <p className="import-privacy"><Info size={14}/>当前支持玩家背包、末影箱及可读取的物品内嵌容器。RS/AE 网络、基地箱子及模组外置背包仓库不包含在这个小文件中。</p>
 </div><div className="modal-footer"><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!result||!Object.keys(result.inventory).length||busy} onClick={confirm}>导入为新目标</button></div></Modal>;
}
