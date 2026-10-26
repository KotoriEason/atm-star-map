import {readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import {parseScript} from './recipe-parser.mjs';
import {createHash} from 'node:crypto';
const base='data/upstream/release/overrides/kubejs/server_scripts',mutations=[],warnings=[],customRecipes=[];
// Presence established by the official server resource survey, not assumptions about optional mods.
const survey=JSON.parse(readFileSync('data/upstream/resource-survey.json','utf8'));
const loadedMods=new Set(survey.loadedMods??(existsSync('data/upstream/native-resource-index.json')?JSON.parse(readFileSync('data/upstream/native-resource-index.json','utf8')).mods:[]));
for(const name of readdirSync(base,{recursive:true}).filter(p=>p.endsWith('.js')).sort()){
 const path=`kubejs/server_scripts/${name.replaceAll('\\','/')}`;
 const r=parseScript(readFileSync(`${base}/${name}`,'utf8'),path,{loadedMods});
 const sha256=createHash('sha256').update(readFileSync(`${base}/${name}`)).digest('hex');
 customRecipes.push(...(r.customRecipes??[]).map(c=>({...c,source:{...c.source,sha256,url:'https://www.curseforge.com/minecraft/modpacks/all-the-mods-10/files/9190157'}})));
 mutations.push(...(r.mutations??[]).map(m=>({...m,path})));
 warnings.push(...r.warnings.filter(w=>/remove|replace|Unresolved|Unsupported|requires runtime/.test(w.reason)));
}
writeFileSync('data/upstream/pack-mutations.json',JSON.stringify({mutations,warnings,customRecipes},null,2)+'\n');
console.log(`Collected ${mutations.length} static pack mutations; ${warnings.length} unresolved script expressions remain explicit.`);
