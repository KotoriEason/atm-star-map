import {BookOpen,MapPin,ExternalLink} from 'lucide-react';
import {dataset} from '../data';
export function AcquisitionInfo({itemKey}:{itemKey:string}){
 const sources=dataset.acquisitions?.[itemKey]??[];
 if(!sources.length)return <div className="empty-recipe"><BookOpen size={26}/><h3>这一步还需要游戏内核验</h3><p>尚未找到能可靠解析的配方或获取来源。请用 ATM10 8.3 的 JEI 核对；此项不会被当作已经抵达基础材料。</p><span className="tag">来源未解决</span></div>;
 return <div className="acquisition-list"><div className="section-label"><span><MapPin size={14}/>获取方式</span><span className="subtle">{sources.length} 个来源</span></div>{sources.map((s,i)=><article className="acquisition-card" key={i}><strong>{s.title}</strong><p>{s.description}</p>{s.conditions&&s.conditions!=='[]'&&<details><summary>掉落条件</summary><code>{s.conditions}</code></details>}<details><summary>追溯来源</summary><code>{s.source.path}</code><small>SHA-256 {s.source.sha256}</small>{s.functions&&s.functions!=='[]'&&<code>{s.functions}</code>}<a href={s.source.url} target="_blank" rel="noreferrer">查看官方资源来源 <ExternalLink size={11}/></a></details></article>)}<p className="inline-note">获取来源不代表固定产量。按实际取得的物品填写已有数量。</p></div>;
}
