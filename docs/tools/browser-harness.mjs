// Local synthetic previews only. A fresh browser profile is removed on teardown.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { preview } from '../../app/node_modules/vite/dist/node/index.js';
export async function browser() {
  const server=await preview({configFile:resolve('app/vite.config.js'),root:resolve('app/src'),preview:{port:0,host:'127.0.0.1',open:false}});
  const address=server.httpServer.address(),base=`http://127.0.0.1:${address.port}`;
  const profile=await mkdtemp(resolve(tmpdir(),'ai-usage-audit-'));
  let chrome,ws,sequence=0;const pending=new Map();
  async function close() { ws?.close();for(const p of pending.values()) {clearTimeout(p.timer);p.reject(Error('Browser closed'));}pending.clear();if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([once(chrome,'exit'),new Promise(r=>setTimeout(r,1500))]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}await new Promise(r=>server.httpServer.close(r));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100}); }
  try {
    chrome=spawn(process.env.CHROME_BIN||'/opt/google/chrome/chrome',['--headless=new',...(process.env.CHROME_NO_SANDBOX==='1'?['--no-sandbox']:[]),'--disable-gpu','--disable-dev-shm-usage','--no-first-run','--disable-background-networking','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
    const port=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(Error('Chrome startup timeout: '+log.slice(-1000))),15000);chrome.once('error',e=>{clearTimeout(timer);reject(e);});chrome.once('exit',code=>{clearTimeout(timer);reject(Error(`Chrome exited ${code}: ${log.slice(-1000)}`));});chrome.stderr.on('data',chunk=>{log+=chunk;const m=log.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/);if(m){clearTimeout(timer);resolve(Number(m[1]));}});});
    let page;
    for(let attempt=0;attempt<150;attempt++){
      const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      page=pages.find(p=>p.type==='page' && p.webSocketDebuggerUrl);
      if(page)break;
      await new Promise(r=>setTimeout(r,100));
    }
    if(!page)throw Error('Browser page target timeout');
    ws=new WebSocket(page.webSocketDebuggerUrl);await once(ws,'open');
    ws.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result);}});
    const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error(`Timeout: ${method}`));},60000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
    await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Emulation.setDeviceMetricsOverride',{width:900,height:900,deviceScaleFactor:1,mobile:false});
    async function evaluate(expression) {const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
    async function navigate(path,ready) {await cdp('Page.navigate',{url:base+path});for(let i=0;i<150;i++){if(await evaluate(`Boolean(${ready})`))return;await new Promise(r=>setTimeout(r,50));}throw Error('Preview readiness timed out');}
    return {cdp,evaluate,navigate,close};
  }catch(e){await close();throw e;}
}
