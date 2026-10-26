import {memo,useEffect,useState} from 'react';
import {dataset} from '../data';

export const ItemIcon=memo(function ItemIcon({itemKey,size=40,className=''}:{itemKey:string;size?:number;className?:string}){
  const item=dataset.items[itemKey];
  const icon=item?.icon??'/item-icons/missing.svg';
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[icon]);
  const missing=failed||item?.iconStatus==='missing'||!item?.icon;
  const enchanted=!!item?.components&&/enchantments|stored_enchantments/.test(item.components);
  const title=missing?`${item?.name??itemKey}：尚未解析到此物品的静态图标`:item?.iconSource?.note;
  return <span className={`item-icon game-item-icon ${enchanted?'has-glint':''} ${missing?'icon-missing':''} ${className}`} style={{width:size,height:size}} title={title} aria-hidden="true">
    <img src={failed?'/item-icons/missing.svg':icon} width={size} height={size} alt="" draggable={false} decoding="async" onError={()=>{if(!failed)setFailed(true);}}/>
    {enchanted&&!missing&&<i className="item-glint" style={{maskImage:`url("${icon}")`,WebkitMaskImage:`url("${icon}")`}}/>}
  </span>;
});
