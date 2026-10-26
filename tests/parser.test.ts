import { describe, expect, it } from 'vitest';
import { parseScript, parseStack, parseRecipeJson } from '../scripts/recipe-parser.mjs';

describe('source recipe extraction', () => {
  it('counts repeated crafting symbols and preserves a filled item component', () => {
    const { recipes } = parseScript(`ServerEvents.recipes(e => {
      e.shaped('2x pack:part', ['ABA', ' B '], {
        A: 'pack:metal', B: 'pack:tank[fluid={id:"pack:fuel",amount:1000}]'
      }).id('pack:part_recipe')
    })`, 'fixture.js');
    expect(recipes[0].output).toEqual({ key: 'pack:part', count: 2 });
    expect(recipes[0].ingredients.map((i:{options:string[];count:number}) => [i.options[0], i.count])).toEqual([
      ['pack:metal', 2], ['pack:tank[fluid={id:"pack:fuel",amount:1000}]', 2]
    ]);
    expect(recipes[0].id).toBe('pack:part_recipe');
    expect(recipes[0].grid).toEqual([[0, 1, 0], [-1, 1, -1]]);
  });
  it('keeps alternatives as one ingredient group', () => {
    const { recipes } = parseScript(`ServerEvents.recipes(e => {
      e.shaped('pack:part', ['A'], {A: Ingredient.of('pack:a').or('pack:b')})
    })`, 'fixture.js');
    expect(recipes[0].ingredients).toEqual([{options: ['pack:a', 'pack:b'], count: 1, consumed: true}]);
  });
  it('extracts machine quantities and a reusable catalyst without executing scripts', () => {
    const { recipes } = parseScript(`ServerEvents.recipes(e => {
      e.recipes.modern_industrialization.star_altar(2048, 200)
      .itemIn('28x pack:block').itemIn('pack:tool', 0)
      .fluidIn('900x pack:lava').itemOut('pack:star')
    })`, 'fixture.js');
    expect(recipes[0].ingredients).toEqual([
      {options: ['pack:block'], count: 28, consumed: true},
      {options: ['pack:tool'], count: 1, consumed: false},
      {options: ['fluid:pack:lava'], count: 900, consumed: true}
    ]);
    expect(recipes[0].power).toBe(2048);
    expect(recipes[0].duration).toBe(200);
    expect(recipes[0].source.line).toBe(2);
  });
  it('resolves literal loops and their templates', () => {
    const { recipes } = parseScript('ServerEvents.recipes(e => { const parts = [{name:"a", n:3}, {name:"b", n:4}]; for (const p of parts) { e.shapeless(`pack:${p.name}`, [`${p.n}x pack:base`]); } })', 'fixture.js');
    expect(recipes.map(r => [r.output.key, r.ingredients[0].count])).toEqual([['pack:a', 3], ['pack:b', 4]]);
  });
  it('reports unsupported dynamic ingredients instead of making an empty recipe', () => {
    const { recipes, warnings } = parseScript(`ServerEvents.recipes(e => {
      e.shapeless('pack:part', [unknownFunction()]);
    })`, 'fixture.js');
    expect(recipes).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });
  it('does not merge awakened and ordinary variants', () => {
    expect(parseStack('2x pack:block[enchantments={levels:{"minecraft:unbreaking":1}}]').key)
      .toBe('pack:block[enchantments={levels:{"minecraft:unbreaking":1}}]');
    expect(parseStack('2x pack:block').key).toBe('pack:block');
  });
  it('imports a native compression recipe with nine lower-tier blocks',()=>{
    const recipe=parseRecipeJson({type:'minecraft:crafting_shaped',key:{'#':{item:'allthecompressed:nether_star_block_2x'}},pattern:['###','###','###'],result:{count:1,id:'allthecompressed:nether_star_block_3x'}},'data/allthecompressed/recipe/compress/nether_star_block_3x.json');
    expect(recipe.ingredients).toEqual([{options:['allthecompressed:nether_star_block_2x'],count:9,consumed:true}]);
    expect(recipe.id).toBe('allthecompressed:compress/nether_star_block_3x');
  });
  it('does not assume an unknown mod-presence guard is true',()=>{
    const result=parseScript(`ServerEvents.recipes(e=>{if(Platform.isLoaded('unknown_mod')) {e.shapeless('pack:part',['pack:base'])}})`,'fixture.js');
    expect(result.recipes).toHaveLength(0);expect(result.warnings.length).toBeGreaterThan(0);
  });
  it('does not mistake an unrelated shaped method for the recipe API',()=>{
    const result=parseScript(`const foo={}; ServerEvents.recipes(e=>{foo.shaped('pack:fake',['A'],{A:'pack:base'})})`,'fixture.js');
    expect(result.recipes).toHaveLength(0);
  });
  it('rejects zero and fractional stack quantities before planning',()=>{
    expect(()=>parseStack('0x pack:part')).toThrow();
    expect(()=>parseStack('1.5x pack:part')).toThrow();
    expect(()=>parseStack({item:'pack:part',count:-1})).toThrow();
  });
});
