import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseScript} from './recipe-parser.mjs';
const d=JSON.parse(readFileSync('src/data/atm10-8.3.json','utf8'));
assert.equal(d.version,'8.3'); assert.equal(d.release.fileId,9190157); assert.equal(d.coverage.runtimeVerified,false);
const main=d.recipes.find(r=>r.id===d.defaultRecipe);
assert.equal(main.output.key,'allthetweaks:atm_star');assert.equal(main.output.count,1);assert.equal(main.ingredients.length,13);
assert.equal(main.ingredients.find(g=>g.options[0]==='allthemodium:unobtainium_allthemodium_alloy_block').count,28);
assert.equal(main.ingredients.find(g=>g.options[0]==='allthecompressed:nether_star_block_3x').count,15);
const awakened=main.ingredients.find(g=>g.options[0].includes('unobtainium_vibranium_alloy_block['));
assert.equal(awakened.count,2);assert.match(awakened.options[0],/minecraft:unbreaking/);
for(const r of d.recipes) {
  assert.ok(d.items[r.output.key]); assert.ok(Number.isFinite(r.output.count)&&r.output.count>0);
  assert.ok(r.ingredients.length>0);assert.match(r.source.sha256,/^[a-f0-9]{64}$/);
  for(const g of r.ingredients) {assert.ok(g.count>0);assert.ok(g.options.length);for(const k of g.options)assert.ok(d.items[k]);}
}
const root='data/upstream/release/overrides';
if(existsSync(root)) {
  for(const s of d.sources) {
    const path=s.path.startsWith('mod:allthecompressed/')?`data/upstream/compressed/${s.path.replace('mod:allthecompressed/','')}`:`${root}/${s.path}`;
    assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),s.sha256,`Source hash ${s.path}`);
  }
  const raw=readFileSync(`${root}/${main.source.path}`,'utf8');
  const parsed=parseScript(raw,main.source.path).recipes.find(r=>r.ingredients.length===13&&r.output.key==='allthetweaks:atm_star');
  assert.deepEqual(parsed.ingredients,main.ingredients);
  console.log('PASS: release source hashes and parsed ATM Star recipe independently match the bundled dataset.');
} else console.log('Source archive unavailable: validating shipped dataset structure and pinned ATM Star facts only.');
console.log(`PASS: ${d.recipes.length} recipe records; ${Object.keys(d.items).length} item identities; 13 main-route ingredient groups; awakened components preserved.`);
