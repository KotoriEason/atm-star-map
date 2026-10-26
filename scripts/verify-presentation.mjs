import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const dataset=JSON.parse(readFileSync('src/data/atm10-8.3.json','utf8'));
const report=JSON.parse(readFileSync('data/item-presentation.json','utf8'));
const fingerprint=JSON.parse(readFileSync('data/recipe-identity-fingerprint.json','utf8'));
const keys=existsSync('data/expansion-seeds.json')?JSON.parse(readFileSync('data/expansion-seeds.json','utf8')).sort():Object.keys(dataset.items).sort();
assert.ok(keys.every(k=>dataset.items[k]),'Original item identity removed');
assert.equal(createHash('sha256').update(JSON.stringify({keys,recipes:dataset.recipes.filter(r=>!r.native)})).digest('hex'),fingerprint.sha256,'Existing recipe and inventory identities changed during expansion');
let real=0,missing=0,tags=0;
for(const [key,item] of Object.entries(dataset.items)) {
  assert.match(item.name,/[\u3400-\u9fff]/,`Chinese name ${key}`);
  assert.ok(!/%(?:\d+\$)?[sd]/.test(item.name),`Unresolved name template ${key}`);
  assert.ok(!/§[0-9a-fk-or]/i.test(item.name),`Unremoved game formatting ${key}`);
  assert.match(item.icon,/^\/item-icons\/[a-zA-Z0-9_.-]+\.svg$/);
  assert.ok(existsSync(`public${item.icon}`),`Icon file for ${key}`);
  if(item.iconStatus==='missing')missing++;
  else if(item.iconStatus==='tag')tags++;
  else real++;
}
assert.ok(report.missingChinese.every(id=>!keys.some(k=>dataset.items[k].id===id)), 'An original Chinese item name regressed');
for(const item of Object.values(dataset.items))if(item.nameSource==='untranslated')assert.ok(item.name.startsWith('待译名'),'Untranslated display name must be explicit');
assert.ok(report.missingIcons.some(i=>i.id==='eternal_starlight:trapped_soul'));
for(const key of keys)if(dataset.items[key].id!=='eternal_starlight:trapped_soul')assert.notEqual(dataset.items[key].iconStatus,'missing',`Original icon regressed: ${key}`);
for(const filename of readdirSync('public/item-icons').filter(n=>n.endsWith('.svg'))) {
  const svg=readFileSync(`public/item-icons/${filename}`,'utf8');
  assert.ok(!/<script\b|<foreignObject\b|onload\s*=|onerror\s*=/i.test(svg),`Unsafe icon ${filename}`);
  assert.ok(!/href=["']https?:/i.test(svg),`External image reference ${filename}`);
  assert.ok(!/\bNaN\b|\bInfinity\b/.test(svg),`Invalid model coordinates ${filename}`);
  assert.ok(svg.includes('<image')||filename==='missing.svg',`No artwork ${filename}`);
}
console.log(`PASS: ${Object.keys(dataset.items).length} display records (${report.missingChinese.length} new base names explicitly pending translation); ${real} game-resource icons; ${tags} material-tag representations; ${missing} explicitly missing icons.`);
console.log('PASS: item IDs and recipe IDs remain unchanged; all icon files are local self-contained SVG/PNG assets.');
