import { parse } from 'acorn';

// Restricted AST reading only: no eval, VM, require, filesystem or network in source expressions.
const token = parts => ({ astPath: parts });
const tokenName = v => v?.astPath?.join('.') ?? '';
export function parseRecipeJson(json, path) {
  const {recipes,warnings}=parseScript(`ServerEvents.recipes(e => { e.custom(${JSON.stringify(json)}) })`,path);
  if(!recipes[0])throw new Error(warnings[0]?.reason??'Unsupported native recipe');
  const match=path.match(/^data\/([^/]+)\/recipe\/(.+)\.json$/);
  if(!match)throw new Error('Native recipe path does not provide an ID');
  return {...recipes[0],id:`${match[1]}:${match[2]}`,idIsSynthetic:false};
}
export function parseStack(value, fluid = false) {
  if (typeof value === 'object' && value !== null) {
    if (Array.isArray(value) || value.components || value.nbt) throw new Error('Stack needs a dedicated component adapter');
    const p = parseStack(value.id || value.item || (value.tag && `#${value.tag}`), fluid);
    const count=value.count??value.amount??p.count;
    if(!Number.isSafeInteger(count)||count<=0)throw new Error('Stack quantity must be a positive safe integer');
    return { key: p.key, count };
  }
  if (typeof value !== 'string') throw new Error('Stack must be a resolved string');
  const m = value.trim().match(/^(?:(\d+(?:\.\d+)?)x\s*)?(.+)$/s);
  if (!m || !/^(?:#)?[a-z0-9_.-]+:[a-z0-9_./-]+(?:\[.*\])?$/s.test(m[2])) throw new Error(`Unsupported stack: ${value.slice(0, 80)}`);
  const count=Number(m[1]??1);
  if(!Number.isSafeInteger(count)||count<=0)throw new Error('Stack quantity must be a positive safe integer');
  return { key: `${fluid ? 'fluid:' : ''}${m[2]}`, count };
}
function group(value, multiplier = 1, consumed = true, fluid = false) {
  const list = (Array.isArray(value) ? value.flat(Infinity) : [value]).map(v => parseStack(v, fluid));
  if (!list.length || list.some(s => s.count !== list[0].count)) throw new Error('Inconsistent ingredient alternatives');
  return { options: [...new Set(list.map(v => v.key))], count: list[0].count * multiplier, consumed };
}
function combine(groups) {
  const result = [];
  for (const g of groups) {
    const same = result.find(r => r.consumed === g.consumed && JSON.stringify(r.options) === JSON.stringify(g.options));
    if (same) same.count = same.consumed ? same.count + g.count : Math.max(same.count, g.count);
    else result.push({ ...g });
  }
  return result;
}
export function parseScript(source, sourcePath, { loadedMods = null } = {}) {
  const recipes = [], warnings = [], mutations=[],customRecipes=[];
  let ast;
  try { ast = parse(source.replace(/^\uFEFF/, ''), {ecmaVersion: 'latest', locations: true}); }
  catch (e) { return {recipes,mutations,customRecipes, warnings: [{path: sourcePath, line: 1, reason: e.message}]}; }
  function value(n, env) {
    if (!n) return undefined;
    switch (n.type) {
      case 'Literal': return n.value;
      case 'Identifier':
        if (n.name in env) return env[n.name];
        if (['Ingredient','Item','Platform','Math'].includes(n.name)) return token([n.name]);
        throw new Error(`Unresolved identifier: ${n.name}`);
      case 'ArrayExpression': return n.elements.map(v => value(v, env));
      case 'ObjectExpression': return Object.fromEntries(n.properties.map(p => {
        if (p.type !== 'Property' || p.kind !== 'init') throw new Error('Unsupported object');
        return [p.computed ? value(p.key, env) : (p.key.name ?? p.key.value), value(p.value, env)];
      }));
      case 'TemplateLiteral': return n.quasis.reduce((s, q, i) => s + q.value.cooked + (i < n.expressions.length ? value(n.expressions[i], env) : ''), '');
      case 'MemberExpression': {
        const obj = value(n.object, env), k = n.computed ? value(n.property, env) : n.property.name;
        if (obj?.astPath) return token([...obj.astPath, k]);
        if (obj == null || ['__proto__','constructor','prototype'].includes(k)) throw new Error('Unsupported member');
        return obj[k];
      }
      case 'BinaryExpression': {
        const a = value(n.left, env), b = value(n.right, env);
        switch (n.operator) {
          case '+': return a+b; case '-': return a-b; case '*': return a*b; case '/': return a/b;
          case '%': return a%b; case '**': return a**b; case '<': return a<b; case '<=': return a<=b;
          case '>': return a>b; case '>=': return a>=b; case '==': case '===': return a===b;
          case '!=': case '!==': return a!==b; default: throw new Error('Unsupported operator');
        }
      }
      case 'UnaryExpression': if (n.operator === '!') return !value(n.argument, env); else if (n.operator === '-') return -value(n.argument, env); else throw new Error('Unsupported unary operator');
      case 'LogicalExpression': {
        const a = value(n.left, env);
        if (n.operator === '||') return a || value(n.right, env);
        if (n.operator === '&&') return a && value(n.right, env);
        if (n.operator === '??') return a ?? value(n.right, env);
        throw new Error('Unsupported logical operator');
      }
      case 'ConditionalExpression': return value(value(n.test, env) ? n.consequent : n.alternate, env);
      case 'CallExpression': {
        if (n.callee.type === 'MemberExpression' && n.callee.property.name === 'or') return [value(n.callee.object, env), ...n.arguments.map(a => value(a, env))].flat(Infinity);
        const name = tokenName(value(n.callee, env)), args = n.arguments.map(a => value(a, env));
        if (name === 'Ingredient.of' || name === 'Item.of') return args.length > 1 && typeof args[1] === 'number' ? `${args[1]}x ${args[0]}` : args[0];
        if (name === 'Platform.isLoaded') {
          if (loadedMods && (loadedMods.has(args[0]) || loadedMods.has(args[0].replaceAll('_','-')))) return true;
          throw new Error(`Mod presence requires runtime verification: ${args[0]}`);
        }
        if (name === 'Math.pow') return Math.pow(args[0], args[1]);
        throw new Error(`Unsupported call: ${name || n.callee.name || n.callee.type}`);
      }
      default: throw new Error(`Unsupported expression: ${n.type}`);
    }
  }
  function chain(n) {
    const list = [];
    while (n?.type === 'CallExpression') {
      if (n.callee.type === 'MemberExpression') { list.unshift({name:n.callee.property.name,args:n.arguments,node:n}); n=n.callee.object; }
      else { list.unshift({name:n.callee.name,args:n.arguments,node:n}); break; }
    }
    return list;
  }
  function expression(n, env) {
    if(n.callee?.type==='MemberExpression'&&['remove','replaceInput','replaceOutput'].includes(n.callee.property.name)){
      const receiver=tokenName(value(n.callee.object,env));
      if(receiver==='$recipeEvent'){
        const encode=v=>v instanceof RegExp?{$regex:v.source,flags:v.flags}:Array.isArray(v)?v.map(encode):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,a])=>[k,encode(a)])):v;
        mutations.push({action:n.callee.property.name,args:n.arguments.map(a=>encode(value(a,env)))});return;
      }
    }
    const calls = chain(n), base = calls.find(c => ['shaped','shapeless','custom','star_altar','runic_enchanter','auto_forge','runic_crucible','energizing','enchanting_apparatus','dissolution_chamber'].includes(c.name));
    if (!base) return;
    const receiver=tokenName(value(base.node.callee,env));
    if(!receiver.startsWith('$recipeEvent.')&&!receiver.startsWith('$knownAlloyHelper.'))throw new Error('Call is not a supported KubeJS recipe API');
    const args = base.args.map(a => value(a, env));
    if(base.name==='custom'){
      const explicit=calls.find(c=>c.name==='id');
      customRecipes.push({id:explicit?value(explicit.args[0],env):`script-json:${sourcePath}:${base.node.loc.start.line}:${customRecipes.length}`,json:args[0],source:{path:sourcePath,line:base.node.loc.start.line}});
    }
    const r = {id:`source:${sourcePath}:${base.node.loc.start.line}:${recipes.length}`,type:base.name,machine:'minecraft:crafting_table',output:null,ingredients:[],source:{path:sourcePath,line:base.node.loc.start.line},idIsSynthetic:true};
    function shaped(pattern, keys) {
      const symbols = [...new Set(pattern.join('').replaceAll(' ',''))];
      r.ingredients = symbols.map(s => group(keys[s], pattern.join('').split(s).length-1));
      r.grid = pattern.map(row => [...row].map(s => s===' ' ? -1 : symbols.indexOf(s)));
    }
    if (base.name==='shaped' || base.name==='shapeless') {
      r.output=parseStack(args[0]);
      if (base.name==='shaped') shaped(args[1],args[2]);
      else r.ingredients=combine(args[1].map(a=>group(a)));
    } else if (['star_altar','runic_enchanter','auto_forge','runic_crucible'].includes(base.name)) {
      r.machine=`modern_industrialization:${base.name}`; r.power=args[0]; r.duration=args[1]; r.type='machine';
      for (const c of calls.slice(calls.indexOf(base)+1)) {
        const a=c.args.map(v=>value(v,env));
        if (c.name==='itemIn' || c.name==='fluidIn') r.ingredients.push(group(a[0],1,a[1]!==0,c.name==='fluidIn'));
        if (c.name==='itemOut') { if (r.output) throw new Error('Multiple outputs need an adapter'); r.output=parseStack(a[0]); }
      }
      r.ingredients=combine(r.ingredients);
    } else if (base.name==='energizing') {
      r.output=parseStack(args[0]); r.ingredients=combine(args[1].map(a=>group(a))); r.machine='powah:energizing_orb'; r.energy=args[2]; r.id=`kubejs:energizing/${args[3]}`; r.idIsSynthetic=false;
    } else if (base.name==='enchanting_apparatus') {
      r.output=parseStack(args[0]); r.ingredients=combine([...args[1],args[2]].map(a=>group(a))); r.machine='ars_nouveau:enchanting_apparatus'; r.sourceCost=args[4]; r.id=`kubejs:enchanting_apparatus/${args[5]}`; r.idIsSynthetic=false;
    } else if (base.name==='dissolution_chamber') {
      r.output=parseStack(args[3]); r.ingredients=combine([...args[0].map(a=>group(a)),group(args[1],1,true,true)]); r.machine='industrialforegoing:dissolution_chamber'; r.duration=args[2];
    } else {
      const c=args[0];
      if (!c || !['minecraft:crafting_shaped','minecraft:crafting_shapeless','create:mechanical_crafting','powah:energizing'].includes(c.type)) throw new Error(`No adapter for custom recipe: ${c?.type}`);
      r.output=parseStack(c.result); r.type=c.type;
      if (c.pattern) shaped(c.pattern,c.key); else r.ingredients=combine(c.ingredients.map(a=>group(a)));
      if (c.type==='create:mechanical_crafting') r.machine='create:mechanical_crafter';
      if (c.type==='powah:energizing') {r.machine='powah:energizing_orb';r.energy=c.energy;}
    }
    const explicit=calls.find(c=>c.name==='id');
    if (explicit) { r.id=value(explicit.args[0],env);r.idIsSynthetic=false; }
    if (!r.output || !r.ingredients.length) throw new Error('Incomplete recipe');
    recipes.push(r);
  }
  function statements(nodes, env) {
    for (const n of nodes) try {
      if (n.type==='VariableDeclaration') {
        for (const d of n.declarations) if (d.id.type==='Identifier') try {env[d.id.name]=value(d.init,env);} catch { /* A dependent recipe reports unresolved values. */ }
      } else if(n.type==='FunctionDeclaration' && sourcePath.endsWith('/modpack/atm_alloys.js') && ['energizing','enchanting_apparatus'].includes(n.id.name)) {
        env[n.id.name]=token(['$knownAlloyHelper',n.id.name]);
      } else if (n.type==='BlockStatement') statements(n.body,Object.create(env));
      else if (n.type==='IfStatement') {
        const s=value(n.test,env)?n.consequent:n.alternate;
        if(s) statements(s.type==='BlockStatement'?s.body:[s],Object.create(env));
      } else if (n.type==='ForOfStatement') {
        const entries=value(n.right,env); if(!Array.isArray(entries)||entries.length>128) throw new Error('Unsupported loop');
        for(const a of entries) {const local=Object.create(env);local[n.left.declarations[0].id.name]=a;statements(n.body.type==='BlockStatement'?n.body.body:[n.body],local);}
      } else if (n.type==='ForStatement') {
        const local=Object.create(env); statements([n.init],local);
        for(let i=0;value(n.test,local);i++) {
          if(i>=128||n.update.type!=='UpdateExpression') throw new Error('Unsupported loop');
          statements(n.body.type==='BlockStatement'?n.body.body:[n.body],local);
          local[n.update.argument.name]+=n.update.operator==='++'?1:-1;
        }
      } else if (n.type==='ExpressionStatement' && n.expression.type==='CallExpression') {
        const e=n.expression, cb=e.arguments.find(a=>['ArrowFunctionExpression','FunctionExpression'].includes(a.type));
        if(cb && e.callee.type==='MemberExpression' && e.callee.property.name==='recipes' && e.callee.object.name==='ServerEvents') {
          const local=Object.create(env);local[cb.params[0].name]=token(['$recipeEvent']);statements(cb.body.type==='BlockStatement'?cb.body.body:[{type:'ExpressionStatement',expression:cb.body}],local);
        } else if(cb && e.callee.type==='MemberExpression' && e.callee.property.name==='forEach') {
          const entries=value(e.callee.object,env);if(!Array.isArray(entries)||entries.length>128) throw new Error('Unsupported forEach');
          for(let i=0;i<entries.length;i++) {const local=Object.create(env);local[cb.params[0].name]=entries[i];if(cb.params[1])local[cb.params[1].name]=i;statements(cb.body.type==='BlockStatement'?cb.body.body:[{type:'ExpressionStatement',expression:cb.body}],local);}
        } else expression(e,env);
      }
    } catch(e) {warnings.push({path:sourcePath,line:n.loc?.start.line??1,reason:e.message});}
  }
  statements(ast.body,Object.create(null));
  return {recipes,warnings,mutations,customRecipes};
}
