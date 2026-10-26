import {describe,expect,it} from 'vitest';
import {applyPresentation} from '../scripts/item-presentation.mjs';
describe('Chinese names and resource icon metadata',()=>{
  it('updates display metadata without changing item identities or recipes',()=>{
    const key='pack:block[enchanted=true]';
    const input={id:'stable-version',items:{[key]:{key,id:'pack:block',name:'Block',englishName:'Block',kind:'item',components:'[enchanted=true]'}},recipes:[{id:'unchanged',output:{key,count:2}}]};
    const result=applyPresentation(input,{items:{[key]:{name:'觉醒合金块',icon:'/item-icons/actual.svg',iconStatus:'model',nameSource:'game-language'}}});
    expect(result.items[key].name).toBe('觉醒合金块');expect(result.items[key].icon).toBe('/item-icons/actual.svg');
    expect(result.items[key].id).toBe('pack:block');expect(result.items[key].components).toBe('[enchanted=true]');
    expect(result.id).toBe('stable-version');expect(result.recipes).toEqual([{id:'unchanged',output:{key,count:2}}]);
    expect(input.items[key].name).toBe('Block');
  });
  it('rejects presentation metadata that would leave an untranslated item',()=>{
    expect(()=>applyPresentation({items:{'pack:part':{key:'pack:part'}}},{items:{}})).toThrow();
  });
  it('rejects remote image URLs instead of silently hotlinking external trackers',()=>{
    expect(()=>applyPresentation({items:{'pack:part':{key:'pack:part'}}},{items:{'pack:part':{name:'零件',icon:'https://example.com/track.png'}}})).toThrow();
  });
});
