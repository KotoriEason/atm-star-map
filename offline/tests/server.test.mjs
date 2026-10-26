import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import {createOfflineServer,startOffline,runBrowserCommand} from '../server.mjs';

const root=await mkdtemp(join(tmpdir(),'atm-offline-中文 '));
await mkdir(join(root,'assets'));await mkdir(join(root,'catalog'));
await writeFile(join(root,'index.html'),'<html>星图</html>');
await writeFile(join(root,'assets','app.js'),'console.log("local")');
await writeFile(join(root,'catalog','manifest.json'),'{}');
const release={app:'atm-star-map-offline',protocol:1,version:'1.0.0',buildId:'fixture-a',dataset:'ATM10 8.3'};
const servers=[];
after(async()=>{for(const s of servers){s.closeAllConnections();await new Promise(resolve=>s.close(resolve));}await rm(root,{recursive:true,force:true});});
async function listen(){const server=createOfflineServer({root,release});servers.push(server);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return {server,port:server.address().port,url:`http://127.0.0.1:${server.address().port}`};}
function raw(port,path,headers={},method='GET'){return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path,method,headers},res=>{let body='';res.setEncoding('utf8');res.on('data',v=>body+=v);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));});req.on('error',reject);req.end();});}

test('serves HTML, JavaScript and JSON locally with correct MIME and offline resource policy',async()=>{
 const {url}=await listen();let res=await fetch(url+'/');assert.equal(await res.text(),'<html>星图</html>');assert.match(res.headers.get('content-type'),/text\/html.*utf-8/);assert.match(res.headers.get('content-security-policy'),/connect-src 'self'/);
 res=await fetch(url+'/assets/app.js');assert.equal(await res.text(),'console.log("local")');assert.match(res.headers.get('content-type'),/javascript/);
 res=await fetch(url+'/catalog/manifest.json');assert.deepEqual(await res.json(),{});assert.match(res.headers.get('content-type'),/application\/json/);
});
test('HEAD has no body and missing assets never fall back to the app HTML',async()=>{
 const {url}=await listen();let r=await fetch(url+'/',{method:'HEAD'});assert.equal(r.status,200);assert.equal(await r.text(),'');assert.ok(Number(r.headers.get('content-length'))>0);
 r=await fetch(url+'/catalog/missing.json');assert.equal(r.status,404);assert.doesNotMatch(await r.text(),/<html>/);
});
test('refuses traversal, malformed encodings, directories and private files',async()=>{
 const {port}=await listen();await writeFile(join(root,'.secret'),'secret');
 for(const path of ['/../server.mjs','/%2e%2e/server.mjs','/assets%5c..%5c.secret','/%00','/%ZZ','/.secret','/assets/']){const r=await raw(port,path);assert.ok(r.status>=400,`${path} should be refused`);assert.notEqual(r.body,'secret');}
});
test('refuses foreign Host, cross-origin requests and write methods',async()=>{
 const {port}=await listen();assert.equal((await raw(port,'/',{Host:'evil.example'})).status,403);assert.equal((await raw(port,'/',{Origin:'https://evil.example'})).status,403);assert.equal((await raw(port,'/',{},'POST')).status,405);
});
test('rejects a junction that escapes the public directory',async()=>{
 const {port}=await listen();const outside=await mkdtemp(join(tmpdir(),'atm-private-'));await writeFile(join(outside,'leak.txt'),'outside-secret');
 await symlink(outside,join(root,'assets','escape'),'junction');
 try{assert.equal((await raw(port,'/assets/escape/leak.txt')).status,403);}finally{await rm(join(root,'assets','escape'),{recursive:true});await rm(outside,{recursive:true});}
});
test('second launch reuses the same build without choosing another port',async()=>{
 const first=await startOffline({root,release,port:0,openBrowser:false});servers.push(first.server);const port=first.server.address().port;
 const second=await startOffline({root,release,port,openBrowser:false});assert.equal(second.reused,true);assert.equal(second.server,null);assert.equal(second.url,`http://127.0.0.1:${port}`);
 const health=await (await fetch(second.url+'/_atm/health')).json();assert.equal(health.buildId,'fixture-a');
});
test('another release or app using the port produces an error instead of a new origin',async()=>{
 const {port}=await listen();await assert.rejects(startOffline({root,release:{...release,buildId:'other-build'},port,openBrowser:false}),/端口|port/i);
 const foreign=http.createServer((_,res)=>res.end('other app'));servers.push(foreign);await new Promise(resolve=>foreign.listen(0,'127.0.0.1',resolve));await assert.rejects(startOffline({root,release,port:foreign.address().port,openBrowser:false}),/端口|port/i);
});
test('fails clearly when the ZIP has not been completely extracted',async()=>{
 await assert.rejects(startOffline({root:join(root,'missing'),release,port:0,openBrowser:false}),/解压|extract/i);
});
test('waits for the browser command to finish before a reused launcher may exit',async()=>{
 const marker=join(root,'browser-command.txt');
 const code=`setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(marker)},'opened'),60)`;
 assert.equal(await runBrowserCommand(process.execPath,['-e',code]),true);
 assert.equal(await readFile(marker,'utf8'),'opened');
});
test('reports a missing or unsuccessful browser opener so the local URL can be shown',async()=>{
 assert.equal(await runBrowserCommand(process.execPath,['-e','process.exit(3)']),false);
 assert.equal(await runBrowserCommand(join(root,'missing-browser-command.exe'),[]),false);
});
