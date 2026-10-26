import http from 'node:http';
import {createReadStream,realpathSync} from 'node:fs';
import {readFile,realpath,stat} from 'node:fs/promises';
import {resolve,relative,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';

const HOST='127.0.0.1',PORT=43183;
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
const CSP="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

export function createOfflineServer({root,release}){
 const base=realpathSync(root);
 return http.createServer(async(req,res)=>{
  res.setHeader('Content-Security-Policy',CSP);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-cache');
  const end=(code,text)=>{res.writeHead(code,{'Content-Type':'text/plain; charset=utf-8'});res.end(req.method==='HEAD'?undefined:text);};
  const expected=`${HOST}:${req.socket.localPort}`;
  if(req.headers.host!==expected||(req.headers.origin&&req.headers.origin!==`http://${expected}`)){end(403,'Only this computer can access this offline app.');return;}
  if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');end(405,'Read-only local server.');return;}
  let path;
  try{path=decodeURIComponent((req.url??'/').split('?')[0]);}catch{end(400,'Invalid path.');return;}
  if(path==='/_atm/health'){
   const body=JSON.stringify({...release,port:req.socket.localPort});res.writeHead(200,{'Content-Type':MIME['.json'],'Content-Length':Buffer.byteLength(body)});res.end(req.method==='HEAD'?undefined:body);return;
  }
  const parts=path.split('/');
  if(!path.startsWith('/')||path.includes('\\')||path.includes('\0')||parts.some(p=>p.startsWith('.')||p.includes(':'))){end(403,'Path is not public.');return;}
  if(path==='/')path='/index.html';
  const extension=extname(path).toLowerCase();
  if(!MIME[extension]){end(404,'File not found.');return;}
  try{
   const target=await realpath(resolve(base,'.'+path)),rel=relative(base,target);
   if(rel.startsWith('..'+sep)||rel==='..'||resolve(base,rel)!==target){end(403,'Path is outside the app.');return;}
   const info=await stat(target);if(!info.isFile()){end(404,'File not found.');return;}
   res.writeHead(200,{'Content-Type':MIME[extension],'Content-Length':info.size});
   if(req.method==='HEAD'){res.end();return;}
   const stream=createReadStream(target);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
  }catch(error){end(error.code==='ENOENT'||error.code==='ENOTDIR'?404:500,error.code==='ENOENT'||error.code==='ENOTDIR'?'File not found.':'Unable to read app file.');}
 });
}

export function runBrowserCommand(command,args){
 return new Promise(resolve=>{
  const child=spawn(command,args,{windowsHide:true,stdio:'ignore'});let finished=false;
  const finish=ok=>{if(finished)return;finished=true;clearTimeout(timer);resolve(ok);};
  const timer=setTimeout(()=>{child.kill();finish(false);},5000);
  child.once('error',()=>finish(false));child.once('close',code=>finish(code===0));
 });
}
async function openDefaultBrowser(url){
 if(process.platform!=='win32')return;
 if(!await runBrowserCommand('cmd.exe',['/d','/c','start','',url]))console.error(`请手动在浏览器打开 / Open manually: ${url}`);
}

export async function startOffline({root,release,port=PORT,openBrowser=true}){
 try{await stat(resolve(root,'index.html'));await stat(resolve(root,'catalog','manifest.json'));}catch{throw new Error('文件不完整，请先完整解压 ZIP，再运行启动程序。 / Extract the complete ZIP first.');}
 if(release?.app!=='atm-star-map-offline'||release.protocol!==1||typeof release.buildId!=='string'||!release.buildId||typeof release.version!=='string')throw new Error('离线版版本文件损坏，请重新解压。 / Invalid release metadata.');
 const server=createOfflineServer({root,release});let reused=false;
 try{await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,HOST,()=>{server.removeListener('error',fail);ok();});});}
 catch(error){
  if(error.code!=='EADDRINUSE')throw new Error(`无法启动本地服务：${error.message}`);
  let existing;
  try{const response=await fetch(`http://${HOST}:${port}/_atm/health`,{signal:AbortSignal.timeout(1200)});if(response.ok&&response.headers.get('content-type')?.includes('application/json'))existing=await response.json();}catch{}
  if(existing?.app===release.app&&existing.protocol===1&&existing.buildId===release.buildId&&existing.version===release.version)reused=true;
  else throw new Error(`端口 ${port} 已被其他程序或旧版本使用。请关闭旧的 ATM 星图启动窗口；若为其他程序，请先释放此端口后重试。为保护已有进度，本程序不会自动更换端口。 / Port ${port} is occupied.`);
 }
 const actualPort=reused?port:server.address().port,url=`http://${HOST}:${actualPort}`;
 if(openBrowser)await openDefaultBrowser(url);
 return {server:reused?null:server,reused,url};
}

async function main(){
 if(process.argv.slice(2).some(arg=>arg!=='--no-open'))throw new Error('不支持此启动参数。 / Unsupported argument.');
 const root=fileURLToPath(new URL('../app/',import.meta.url));
 let release;try{release=JSON.parse(await readFile(new URL('../release.json',import.meta.url),'utf8'));}catch{throw new Error('找不到版本文件，请完整解压 ZIP。 / Extract the complete ZIP first.');}
 const result=await startOffline({root,release,openBrowser:!process.argv.includes('--no-open')});
 console.log(`ATM 星图离线版 ${release.version}\n${result.reused?'已在运行，使用现有窗口。 / Already running.':'本地服务已启动。 / Local server ready.'}\n${result.url}\n仅本机可访问，无需联网。保持此窗口打开，按 Ctrl+C 停止服务。\n进度保存在当前浏览器；换电脑前请在页面导出存档。`);
 if(result.server)for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{result.server.closeAllConnections();result.server.close();});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
