export function applyPresentation(dataset, presentation) {
  const items=Object.fromEntries(Object.entries(dataset.items).map(([key,item])=>{
    const display=presentation.items[key];
    if(!display||typeof display.name!=='string'||!/[\u3400-\u9fff]/.test(display.name))throw new Error(`Missing Chinese item name: ${key}`);
    if(typeof display.icon!=='string'||!/^\/item-icons\/[a-zA-Z0-9_.-]+\.svg$/.test(display.icon))throw new Error(`Invalid local item icon: ${key}`);
    return [key,{...item,name:display.name,icon:display.icon,iconStatus:display.iconStatus,
      iconSource:display.iconSource,nameSource:display.nameSource}];
  }));
  return {...dataset,items,presentation:{translatedItems:Object.values(items).filter(i=>i.nameSource!=='untranslated').length,untranslatedItems:Object.values(items).filter(i=>i.nameSource==='untranslated').length,
    missingIconIds:presentation.missingIcons?.map(i=>i.id)??[],sourceLevel:'pinned-game-resources',
    note:'译名优先采用对应版本中文语言文件；图标来自原始贴图或模型的静态渲染，特殊动画和运行时状态不完整模拟。'}};
}
