const $=s=>document.getElementById(s);
/* runs: backed by the terraplan API (proxied by Next.js at /api/v1) */
const API='/api/v1';
let runs=window.__runs=[],LOCKS={};
const ic={running:'◔',succeeded:'✓','waiting approval':'◷',queued:'◷',failed:'✕',cancelled:'○'},cl={running:'run',succeeded:'ok','waiting approval':'wait',queued:'wait',failed:'bad',cancelled:'mut'};
const ENVS=['dev','qa','uat','staging','prod'];
function envNameList(){try{const a=JSON.parse(sessionStorage.getItem('tp-env-names')||'[]');return Array.isArray(a)?a.filter(Boolean):[]}catch(e){return[]}}
function saveEnvNameList(a){try{sessionStorage.setItem('tp-env-names',JSON.stringify([...new Set((a||[]).map(n=>String(n||'').trim()).filter(Boolean))]))}catch(e){}}
function allEnvNames(){
 const s=[];
 envNameList().forEach(n=>{if(n&&s.indexOf(n)<0)s.push(n)});
 (window.__envsCache||[]).forEach(e=>{if(e&&e.name&&s.indexOf(e.name)<0)s.push(e.name)});
 return s;
}
window.__allEnvNames=allEnvNames;
function actionNameList(){
 try{
  const a=JSON.parse(sessionStorage.getItem('tp-var-actions')||'[]');
  return (Array.isArray(a)?a:[]).map(x=>typeof x==='string'?x:(x&&x.name)||'').map(s=>String(s||'').trim()).filter(Boolean);
 }catch(e){return[]}
}
function saveActionNameList(a){try{sessionStorage.setItem('tp-var-actions',JSON.stringify([...new Set((a||[]).map(n=>String(n||'').trim()).filter(Boolean))]))}catch(e){}}
function allActionNames(){return actionNameList()}
window.__allActionNames=allActionNames;
const held=e=>LOCKS[e]||null;
const xe=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function ago(iso){if(!iso)return '–';const s=Math.max(0,(Date.now()-new Date(iso))/1000);if(s<45)return 'just now';const m=Math.round(s/60);if(m<60)return m+' min ago';const h=Math.round(m/60);if(h<24)return h+' hr ago';const d=Math.round(h/24);return d+(d===1?' day ago':' days ago')}
function dur(a,b){if(!a)return '–';const s=Math.round(((b?new Date(b):Date.now())-new Date(a))/1000),m=Math.floor(s/60);return m?m+'m '+String(s%60).padStart(2,'0')+'s':s+'s'}
const view=x=>({id:x.id,sid:'run-'+x.id.slice(-6),b:x.branch,a:x.action,s:x.status.replace('_',' '),e:x.environment,r:x.repository,u:x.triggeredBy,c:x.commitSha?x.commitSha.slice(0,7):'–',t:ago(x.createdAt),d:dur(x.startedAt,x.finishedAt),out:x.output,err:x.error,raw:x});
function note(t){const d=document.createElement('div');d.className='toast';d.textContent=t;document.body.appendChild(d);setTimeout(()=>d.remove(),2600)}
let ME=null;
async function api(path,opt){const res=await fetch(API+path,Object.assign({credentials:'same-origin',headers:{'content-type':'application/json'}},opt||{}));const body=await res.json().catch(()=>({}));if(res.status===401){ME=null;if(location.hash==='#dashboard')location.hash='home';throw new Error(body.message?[].concat(body.message).join(', '):'Sign in required');}if(!res.ok)throw new Error(body.message?[].concat(body.message).join(', '):'Request failed ('+res.status+')');return body}
function isAdmin(){return ME&&ME.highestRole==='Admin'}
function paintUser(){if(!ME)return;const n=ME.name||ME.email;if($('uname'))$('uname').textContent=n;if($('uname2'))$('uname2').textContent=n;if($('urole'))$('urole').textContent=(ME.highestRole||'Viewer')+(ME.email?' · '+ME.email:'')}
async function loadMe(){try{ME=await api('/auth/me');paintUser();return ME}catch(e){ME=null;return null}}
async function showProviders(){let p={google:false};try{p=await api('/auth/providers')}catch(e){}
 document.querySelectorAll('[data-provider="google"]').forEach(el=>el.classList.toggle('hide',!p.google));}
const _qs=new URLSearchParams(location.search);
const authErr=_qs.get('authError');if(authErr){note(authErr);history.replaceState(null,'',location.pathname+location.hash)}
const justSignedIn=_qs.get('signedIn')==='1';
if(justSignedIn){history.replaceState(null,'',location.pathname)}
let syncing=false,syncQueued=false,lastSyncAt=0,shown=null;
function playBrandSplash(){
  return new Promise(resolve=>{
    const splash=$('brand-splash');
    if(!splash){resolve();return}
    const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
    const html=document.documentElement;
    html.classList.add('boot-splash');
    html.classList.remove('boot-dash');
    $('land')&&$('land').classList.add('hide');
    $('dash')&&$('dash').classList.add('hide');
    splash.classList.remove('hide','out');
    splash.classList.add('on');
    splash.setAttribute('aria-hidden','false');
    requestAnimationFrame(()=>splash.classList.add('play'));
    const hold=reduced?400:8000;
    setTimeout(async()=>{
      // Mount dashboard under the splash first so fade never reveals body indigo.
      html.classList.add('boot-dash');
      $('land')&&$('land').classList.add('hide');
      $('dash')&&$('dash').classList.remove('hide');
      try{if(!ME)await loadMe()}catch(e){}
      paintUser();
      const finish=()=>{
        splash.classList.add('hide');
        splash.classList.remove('on','play','out');
        splash.setAttribute('aria-hidden','true');
        html.classList.remove('boot-splash');
        resolve();
      };
      if(reduced){finish();return}
      splash.classList.add('out');
      setTimeout(finish,480);
    },hold);
  });
}
let LOCK_ROWS=[];
function lockWatches(){try{return JSON.parse(sessionStorage.getItem('tp-lock-watches')||'[]')}catch(e){return[]}}
function saveLockWatches(a){try{sessionStorage.setItem('tp-lock-watches',JSON.stringify(a||[]))}catch(e){}}
function readInbox(){try{return JSON.parse(sessionStorage.getItem('tp-inbox')||'[]')}catch(e){return[]}}
function saveInbox(a){try{sessionStorage.setItem('tp-inbox',JSON.stringify((a||[]).slice(0,40)))}catch(e){}}
function pushInbox(item){
 const a=readInbox();
 a.unshift(Object.assign({id:'in-'+Date.now(),read:false,at:new Date().toISOString()},item));
 saveInbox(a);
}
function envLockBusy(env){
 const row=(LOCK_ROWS||[]).find(x=>x&&x.environment===env);
 if(!row)return null;
 const waiting=row.waiting||[];
 if(!row.held&&!waiting.length)return null;
 return {held:!!row.held,waiting,holder:row.holder,action:row.action,branch:row.branch,repository:row.repository};
}
function addLockWatch(w){
 const all=lockWatches();
 if(all.some(x=>x.environment===w.environment&&x.action===w.action&&x.repository===w.repository))return;
 all.unshift(Object.assign({id:'w-'+Date.now(),createdAt:new Date().toISOString()},w));
 saveLockWatches(all);
}
function flushLockWatches(){
 const keep=[];
 lockWatches().forEach(w=>{
  if(envLockBusy(w.environment)){keep.push(w);return}
  pushInbox({
   kind:'lock-free',
   environment:w.environment,
   action:w.action,
   repository:w.repository,
   title:w.environment+' is free',
   body:'Queue ended for '+(w.action||'plan')+' on '+(w.repository||w.environment)+'. Start it when you are ready.'
  });
  note(w.environment+' is free — start your '+(w.action||'plan')+' when you are ready.');
 });
 saveLockWatches(keep);
 if(typeof paintNotifs==='function')paintNotifs();
}
function applyLockRows(ll){LOCK_ROWS=ll||[];LOCKS={};LOCK_ROWS.forEach(l=>{if(l.held)LOCKS[l.environment]={a:l.action,b:l.branch,u:l.holder,waiting:l.waiting||[]};else if((l.waiting||[]).length)LOCKS[l.environment]={a:null,b:null,u:null,waiting:l.waiting}});flushLockWatches()}
function paintLocks(){
 if($('lk')){const names=[...new Set(allEnvNames().concat(LOCK_ROWS.map(r=>r.environment).filter(Boolean)))];$('lk').innerHTML=names.map(v=>{const row=LOCK_ROWS.find(x=>x.environment===v);const isHeld=row&&row.held;const w=(row&&row.waiting)||[];const wait=w.length?' · '+w.length+' waiting':'';const label=isHeld?xe(row.action+' · '+row.branch+' · '+row.holder)+wait:w.length?w.length+' queued':'Free';return `<div class="env"><i class="dot ${isHeld?'r':w.length?'y':''}"></i><b>${v}</b><span>${label}</span></div>`}).join('')}
 if($('lk-table')&&(window.__view==='Live locks'||window.__view==='Dashboard')&&typeof window.__paintLiveLockTable==='function')window.__paintLiveLockTable();
}
function paintLastUpdated(){
 const agoEl=$('lu-ago');if(!agoEl)return;
 if(!lastSyncAt){agoEl.textContent='just now';return}
 const s=Math.max(0,Math.round((Date.now()-lastSyncAt)/1000));
 agoEl.textContent=s<45?'just now':s<90?'1 min ago':s<3600?Math.round(s/60)+' min ago':'earlier';
}
let syncPromise=null;
async function sync(force){
 if(!ME)return;
 if(syncing){if(force)syncQueued=true;return syncPromise}
 syncing=true;
 syncPromise=(async()=>{
  try{
   const [rr,ll]=await Promise.all([api('/runs?limit=100'),api('/locks')]);
   runs.splice(0,runs.length,...rr.map(view));applyLockRows(ll);paintLocks();
   lastSyncAt=Date.now();paintLastUpdated();paintNotifs();
   if(!$('dash').classList.contains('hide')&&!$('v-runs').classList.contains('hide'))draw();
   if(shown)refreshOpenRunTerminal();
  }catch(e){console.warn('[terraplan] could not reach the API:',e.message);throw e}
  finally{
   syncing=false;
   const again=syncQueued;syncQueued=false;
   if(again){try{await sync(true)}catch(e){}}
  }
 })();
 return syncPromise;
}
async function refreshRuns(){
 const btn=$('rf');
 if(btn){if(btn.classList.contains('refreshing'))return;btn.classList.add('refreshing');btn.setAttribute('aria-busy','true')}
 const started=Date.now();
 try{
  await sync(true);
  draw();
  paintLastUpdated();
 }catch(e){console.warn('[terraplan] refresh:',e&&e.message)}
 finally{
  const wait=Math.max(0,450-(Date.now()-started));
  setTimeout(()=>{if(btn){btn.classList.remove('refreshing');btn.removeAttribute('aria-busy')}},wait);
 }
}
window.__refreshRuns=refreshRuns;
var lockWs=null;
async function connectLockWs(){if(lockWs||!ME)return;
 try{const cfg=await fetch('/api/config',{credentials:'same-origin'}).then(r=>r.json());
  const {token}=await api('/auth/ws-token');
  const url=cfg.locksWsUrl+(cfg.locksWsUrl.includes('?')?'&':'?')+'token='+encodeURIComponent(token);
  lockWs=new WebSocket(url);
  lockWs.onmessage=ev=>{try{const msg=JSON.parse(ev.data);if(msg&&msg.locks){applyLockRows(msg.locks);paintLocks();if(typeof draw==='function')draw()}}catch(e){}};
  lockWs.onclose=()=>{lockWs=null;setTimeout(()=>{if(ME)connectLockWs()},4000)};
  lockWs.onerror=()=>{try{lockWs.close()}catch(e){}}}catch(e){console.warn('[terraplan] locks ws:',e.message)}}
var AF='',SF='',EF='',RUN_PAGE=1,RUN_SORT=null,RUN_DIR=1;
const PAGE_SIZE=10;
const RUN_KEYS=['b','sid','a','s','e','r','u','c','t','d'];
const SORT_ICO='<svg class="th-sort" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.4 5.2h11.2L8 13.2z"/></svg>';
function cmpSort(a,b){
 const an=typeof a==='number'&&!isNaN(a),bn=typeof b==='number'&&!isNaN(b);
 if(an&&bn)return a===b?0:a<b?-1:1;
 return String(a||'').localeCompare(String(b||''),undefined,{numeric:true,sensitivity:'base'});
}
function parseSortText(t){
 const s=String(t||'').replace(/\s+/g,' ').trim();
 if(!s||s==='—'||s==='–')return '';
 if(s==='just now')return Date.now();
 let m=s.match(/^(?:(\d+)m\s*)?(\d+)s$/i);
 if(m)return (m[1]?+m[1]*60:0)+(+m[2]);
 m=s.match(/^(\d+)\s*(min|hr|hour|day)s?\s+ago$/i);
 if(m){const n=+m[1];const u=m[2].toLowerCase();return Date.now()-(u.indexOf('min')===0?n*6e4:u.indexOf('d')===0?n*864e5:n*36e5)}
 const num=s.replace(/,/g,'');
 if(/^-?\d+(\.\d+)?%?$/.test(num))return parseFloat(num);
 return s.toLowerCase();
}
function cellKey(td){
 if(!td)return '';
 if(td.dataset.sv){
  const n=Number(td.dataset.sv);
  if(td.dataset.sv!==''&&!isNaN(n)&&String(n)===td.dataset.sv)return n;
  return parseSortText(td.dataset.sv);
 }
 return parseSortText(td.textContent);
}
function sortSeed(v){
 if(v==null)return '';
 const s=String(v);
 if(s.startsWith('html:')){
  const st=s.match(/data-started="([^"]*)"/);if(st){const t=new Date(st[1]).getTime();if(!isNaN(t))return String(t)}
  return s.replace(/^html:/,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
 }
 return s.replace(/^(ok|bad|warn|run|mut|tag|ln|act|bar|pb):/,'').toLowerCase();
}
const SORT_COLS={
 Status:1,Started:1,Duration:1,Time:1,Updated:1,'Last active':1,'Last run':1,ETA:1,Result:1,
 Environment:1,Action:1,'Run ID':1,Branch:1,Name:1,
 'Triggered by':1,User:1,Author:1,Actor:1,Email:1,Roles:1,
 Region:1,'Instance type':1,'Channel type':1,'Channel name':1,PR:1
};
function sortAllowed(label){return !!(label&&SORT_COLS[label])}
function sortSkipLabel(label){return !sortAllowed(label)}
function defaultSortDir(label){return /time|started|duration|updated|created|last active|last run|last synced|last modified|last check|waiting|eta/i.test(label||'')?'desc':'asc'}
function runSortKey(r,i){
 if(i===8)return r.raw&&r.raw.createdAt?new Date(r.raw.createdAt).getTime():0;
 if(i===9){const a=r.raw&&r.raw.startedAt;if(!a)return -1;return ((r.raw.finishedAt?new Date(r.raw.finishedAt):Date.now())-new Date(a))}
 const k=RUN_KEYS[i];return String((r&&r[k])||'').toLowerCase();
}
function decorateSortHeaders(table){
 if(!table)return;
 [...table.querySelectorAll('thead th')].forEach(th=>{
  if(th.classList.contains('chk-th'))return;
  const label=(th.dataset.col||th.textContent||'').replace(/\s+/g,' ').trim();
  if(!sortAllowed(label)){
   if(th.querySelector('.th-btn')){th.textContent=label;th.classList.remove('th-s');th.removeAttribute('data-col');th.removeAttribute('data-dir');th.removeAttribute('aria-sort')}
   return;
  }
  if(th.querySelector('.th-btn'))return;
  th.classList.add('th-s');th.dataset.col=label;
  th.innerHTML='<button type="button" class="th-btn">'+xe(label)+SORT_ICO+'</button>';
 });
}
function attachTableSort(table){
 if(!table)return;
 decorateSortHeaders(table);
 if(table.__sorted)return;
 table.__sorted=true;
 table.addEventListener('click',e=>{
  const btn=e.target.closest('.th-btn');if(!btn||!table.contains(btn))return;
  e.preventDefault();e.stopPropagation();
  const th=btn.closest('th');if(!th)return;
  const idx=[...th.parentNode.children].indexOf(th);
  const label=th.dataset.col||'';
  const dir=th.dataset.dir==='asc'?'desc':th.dataset.dir==='desc'?'asc':defaultSortDir(label);
  table.querySelectorAll('thead th').forEach(h=>{h.removeAttribute('data-dir');h.removeAttribute('aria-sort')});
  th.dataset.dir=dir;th.setAttribute('aria-sort',dir==='asc'?'ascending':'descending');
  if(table.querySelector('#tb')){
   RUN_SORT=idx;RUN_DIR=dir==='asc'?1:-1;RUN_PAGE=1;draw();return;
  }
  const tbody=table.tBodies[0];if(!tbody)return;
  const rows=[...tbody.rows];
  if(rows.length===1&&rows[0].cells[0]&&rows[0].cells[0].colSpan>1)return;
  const mul=dir==='asc'?1:-1;
  rows.sort((a,b)=>cmpSort(cellKey(a.cells[idx]),cellKey(b.cells[idx]))*mul);
  rows.forEach(r=>tbody.appendChild(r));
  const tw=table.closest('.tw');if(tw&&tw.__pager)tw.__pager.refresh();
 });
}
function pageBar(cur,pages){
 const p=Math.max(1,pages|0),c=Math.min(Math.max(1,cur|0),p);
 const nums=[];let start=Math.max(1,c-2),end=Math.min(p,start+4);start=Math.max(1,end-4);
 for(let i=start;i<=end;i++)nums.push(i);
 const chevL='<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m10 4-6 4 6 4"/></svg>';
 const chevR='<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 4 6 4-6 4"/></svg>';
 return '<div class="aws-pager" role="navigation" aria-label="Table pagination">'
  +'<button type="button" class="pg-arr" data-pg="prev" aria-label="Previous page"'+(c<=1?' disabled':'')+'>'+chevL+'</button>'
  +nums.map(n=>'<button type="button" class="pg-num'+(n===c?' on':'')+'" data-pg="'+n+'" aria-label="Page '+n+'"'+(n===c?' aria-current="page"':'')+'>'+n+'</button>').join('')
  +'<button type="button" class="pg-arr" data-pg="next" aria-label="Next page"'+(c>=p?' disabled':'')+'>'+chevR+'</button>'
  +(p>1?'<span class="pg-info">Page '+c+' of '+p+'</span>':'')
  +'</div>';
}
function draw(){const q=$('fq')?$('fq').value:'';
let l=runs.filter(r=>(!AF||r.a===AF)&&(!SF||r.s===SF)&&(!EF||r.e===EF)&&(!q||[r.b,r.u,r.r,r.a,r.sid,r.c,r.e].some(x=>String(x||'').toLowerCase().includes(String(q).toLowerCase()))));
if(RUN_SORT!=null)l=l.slice().sort((a,b)=>cmpSort(runSortKey(a,RUN_SORT),runSortKey(b,RUN_SORT))*RUN_DIR);
const cnt=$('cnt');if(cnt)cnt.textContent='('+l.length+')';
const tdc=h=>'<div class="tdc">'+h+'</div>';
const pages=Math.max(1,Math.ceil(l.length/PAGE_SIZE));
if(RUN_PAGE>pages)RUN_PAGE=pages;
if(RUN_PAGE<1)RUN_PAGE=1;
const slice=l.slice((RUN_PAGE-1)*PAGE_SIZE,RUN_PAGE*PAGE_SIZE);
const tb=$('tb');if(tb)tb.innerHTML=slice.map(r=>`<tr data-id="${xe(r.id)}"><td>${tdc(__fmt.br(r.b))}</td><td>${tdc(__fmt.id(r.sid))}</td><td>${tdc(__fmt.act(r.a))}</td><td>${tdc(__fmt.st(r.s))}</td><td>${tdc(__fmt.env(r.e))}</td><td>${tdc(__fmt.rp(r.r))}</td><td>${tdc(__fmt.pp(r.u))}</td><td>${tdc('<span class="mono">'+xe(r.c)+'</span>')}</td><td>${tdc(r.t)}</td><td>${tdc(r.d)}</td></tr>`).join('')||'<tr><td colspan="10">'+tdc('No runs match. Clear the filter to see all runs.')+'</td></tr>';
let wrap=$('runs-pager');
if(!wrap){const tw=tb&&tb.closest('.tw');if(tw){wrap=document.createElement('div');wrap.id='runs-pager';wrap.className='aws-pager-wrap';tw.insertAdjacentElement('afterend',wrap)}}
if(wrap){wrap.innerHTML=pageBar(RUN_PAGE,pages);wrap.onclick=e=>{
 const b=e.target.closest('[data-pg]');if(!b||b.disabled)return;
 const v=b.dataset.pg;
 if(v==='prev')RUN_PAGE=Math.max(1,RUN_PAGE-1);
 else if(v==='next')RUN_PAGE=Math.min(pages,RUN_PAGE+1);
 else RUN_PAGE=+v||1;
 draw();
}}
paintLocks()}
function setFilterSet(fs,label){
 SF='';EF='';
 if(fs&&String(fs).startsWith('env:')){EF=fs.slice(4);SF=''}
 else{SF=fs||'';EF=''}
 const val=$('ffs-val');
 if(val){val.textContent=label||'Choose filter set';val.classList.toggle('empty',!label||label==='Choose filter set')}
 document.querySelectorAll('#ffs-menu .ffs-opt').forEach(o=>{
  const on=o.dataset.fs===String(fs||'');
  o.classList.toggle('on',on);o.setAttribute('aria-selected',on?'true':'false');
 });
 closeFilterSet();RUN_PAGE=1;draw();
}
function closeFilterSet(){
 const m=$('ffs-menu'),b=$('ffs-btn');
 if(m){m.classList.add('hide');m.hidden=true}
 if(b){b.setAttribute('aria-expanded','false');b.classList.remove('open')}
}
function openFilterSet(){
 const m=$('ffs-menu'),b=$('ffs-btn');
 if(!m||!b)return;
 m.classList.remove('hide');m.hidden=false;
 b.setAttribute('aria-expanded','true');b.classList.add('open');
}
const paint=t=>xe(t).split('\n').map(l=>/^\s*\+ /.test(l)?'<span class="add">'+l+'</span>':/^\s*~ /.test(l)?'<span class="chg">'+l+'</span>':/^\s*- /.test(l)||/^Error/.test(l)?'<span class="del">'+l+'</span>':/^(Plan|Apply complete|Destroy complete):/.test(l)?'<b>'+l+'</b>':'<span class="dim">'+l+'</span>').join('\n');
function filterRunLog(t){
 return String(t||'').split('\n').filter(l=>{
  const s=l.trim();
  if(!s)return false;
  if(s.startsWith('$'))return false;
  if(s.startsWith('#'))return false;
  if(/^(git |Clon(e|ing)|Assuming role|Queued\.|Connecting to live)/i.test(s))return false;
  return true;
 }).join('\n');
}
function initLogHtml(){return '<span class="dim">Initializing…</span>'}
function paintRunLog(t){const f=filterRunLog(t);return f.trim()?paint(f):initLogHtml()}
var logEs=null,logEsId=null,liveBuf='';
function stopLogStream(){if(logEs){try{logEs.close()}catch(e){}logEs=null}logEsId=null}
function startLogStream(id){
 if(logEs&&logEsId===id)return;
 stopLogStream();liveBuf='';logEsId=id;
 logEs=new EventSource('/api/v1/runs/'+encodeURIComponent(id)+'/logs/stream');
 const decode=raw=>{try{return JSON.parse(raw)}catch(e){return raw||''}};
 const render=()=>{document.querySelectorAll('[data-live-log]').forEach(pre=>{pre.innerHTML=paintRunLog(liveBuf)})};
 logEs.addEventListener('snapshot',e=>{liveBuf=decode(e.data);render()});
 logEs.addEventListener('chunk',e=>{liveBuf+=decode(e.data);render()});
 logEs.addEventListener('done',async()=>{stopLogStream();await sync();if(shown===id)refreshOpenRunTerminal()});
 logEs.onerror=()=>{/* browser will retry; terminal status closes via done */}}
function runTermMeta(r){
 const live=r.s==='running'||r.s==='queued';
 const st=r.s==='succeeded'?'ok':r.s==='failed'?'fail':r.s==='waiting approval'?'wait':'run';
 const stLabel=r.s==='succeeded'?'✓ Succeeded':r.s==='failed'?'✕ Failed':r.s==='waiting approval'?'Waiting approval':r.s==='queued'?'Queued':'Running';
 let acts='';
 if(r.s==='waiting approval')acts='<button class="b1 sm" data-run-act="approve">Approve '+xe(r.a)+'</button><button class="b2 sm" data-run-act="cancel">Cancel</button>';
 else if(r.s==='queued'||r.s==='running')acts='<button class="b2 sm" data-run-act="cancel">Cancel</button>';
 if(r.a==='plan'&&r.s==='succeeded'&&r.raw&&r.raw.planFileKey)acts+='<button class="b1 sm" data-run-act="apply-plan">Apply this plan</button>';
 return {live,st,stLabel,acts};
}
function refreshOpenRunTerminal(){
 const panel=document.querySelector('.at-terminal-panel.run-term');
 if(!panel||!shown||panel.dataset.runId!==shown)return;
 const r=runs.find(x=>x.id===shown);if(!r)return;
 const meta=runTermMeta(r);
 const badge=panel.querySelector('.at-tp-meta-row .at-tp-badge:last-child');
 if(badge){badge.className='at-tp-badge '+(meta.st==='ok'?'at-tp-badge-ok':meta.st==='fail'?'at-tp-badge-fail':'');badge.textContent=meta.stLabel}
 const actsWrap=panel.querySelector('.at-tp-run-acts');
 if(meta.acts){
  if(actsWrap)actsWrap.innerHTML=meta.acts;
  else{
   const actions=panel.querySelector('.at-tp-actions');
   if(actions){const d=document.createElement('div');d.className='at-tp-run-acts';d.innerHTML=meta.acts;actions.insertBefore(d,actions.firstChild)}
  }
 }else if(actsWrap)actsWrap.remove();
 const pre=panel.querySelector('[data-live-log]');
 if(pre&&!meta.live){
  stopLogStream();
  pre.innerHTML=r.out?paintRunLog(r.out):r.err?paint('Error: '+r.err):initLogHtml();
 }
}
function paintNotifs(){
 const list=$('mN-list');if(!list)return;
 const inbox=readInbox();
 const items=(runs||[]).slice(0,8);
 const nb=$('nb');
 const inboxHtml=inbox.slice(0,10).map(n=>'<div class="ni'+(n.read?'':' unread')+'" data-lock-free="'+xe(n.id)+'" data-env="'+xe(n.environment||'')+'" data-action="'+xe(n.action||'')+'" data-repo="'+xe(n.repository||'')+'"><div><b>'+xe(n.title||'Lock update')+'</b><span>'+xe(n.body||'')+'</span></div></div>').join('');
 const runHtml=items.map(r=>'<div class="ni" data-run="'+xe(r.id)+'"><div><b>'+xe(r.a)+' '+xe(r.s)+'</b><span>'+xe(r.sid)+' · '+xe(r.e)+' · '+xe(r.b)+' · '+xe(r.t)+'</span></div></div>').join('');
 if(!inbox.length&&!items.length){
  list.innerHTML='<div class="ni"><div><b>No notifications</b><span>Run events will appear here.</span></div></div>';
  if(nb){nb.textContent='0';nb.classList.add('hide')}
  return;
 }
 list.innerHTML=inboxHtml+runHtml;
 const unread=inbox.filter(n=>!n.read).length;
 if(nb){
  const count=unread||items.length;
  nb.textContent=String(Math.min(99,count));
  nb.classList.toggle('hide',!unread&&!items.length);
 }
}
function parseAction(raw){
 const s=String(raw||'').trim().toLowerCase();
 if(/\bdestroy\b/.test(s))return 'destroy';
 if(/\bapply\b/.test(s))return 'apply';
 if(/\bplan\b/.test(s))return 'plan';
 return s;
}
function openRunTerminal(id){
 const r=runs.find(x=>x.id===id);if(!r)return;
 const existing=document.querySelector('.at-terminal-panel.run-term');
 if(existing&&existing.dataset.runId===id){shown=id;refreshOpenRunTerminal();const meta=runTermMeta(r);if(meta.live)startLogStream(id);return}
 shown=id;
 const p=$('po');if(p)p.classList.add('hide');
 document.querySelectorAll('.at-terminal-panel.run-term').forEach(el=>el.remove());
 const meta=runTermMeta(r);
 const live=meta.live,st=meta.st,stLabel=meta.stLabel,acts=meta.acts;
 const outHtml=live?initLogHtml():(r.out?paintRunLog(r.out):r.err?paint('Error: '+r.err):initLogHtml());
 const panel=document.createElement('div');
 panel.className='at-terminal-panel run-term maximized';
 panel.dataset.runId=id;
 panel.innerHTML=
  '<div class="at-tp-info">'
  +'<div class="at-tp-info-top">'
  +'<span class="at-tp-name">'+xe(r.sid)+' · '+xe(r.a)+' · '+xe(r.e)+'</span>'
  +'<div class="at-tp-actions">'
  +(acts?'<div class="at-tp-run-acts">'+acts+'</div>':'')
  +'<button class="at-tp-btn" id="at-tp-min" title="Minimize"><svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 8h10"/></svg></button>'
  +'<button class="at-tp-btn" id="at-tp-max" title="Restore"><svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2h4v4M6 14H2v-4M14 2l-5 5M2 14l5-5"/></svg></button>'
  +'<button class="at-tp-btn at-tp-close-btn" id="at-tp-close" title="Close"><svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l10 10M13 3 3 13"/></svg></button>'
  +'</div></div>'
  +'<div class="at-tp-meta-row">'
  +'<div class="at-tp-badge">'+xe(r.u||'—')+'</div>'
  +'<div class="at-tp-badge at-tp-badge-env">'+xe(r.e||'—')+'</div>'
  +'<div class="at-tp-badge">'+xe(r.b||'—')+'</div>'
  +'<div class="at-tp-badge">'+xe(r.r||'—')+'</div>'
  +'<div class="at-tp-badge '+(st==='ok'?'at-tp-badge-ok':st==='fail'?'at-tp-badge-fail':'')+'">'+stLabel+'</div>'
  +'</div></div>'
  +'<div class="at-tp-term">'
  +'<div class="at-tp-bar"><span class="mac-dot r"></span><span class="mac-dot y"></span><span class="mac-dot g"></span><span class="at-tp-bartitle">terraform '+xe(r.a)+'</span></div>'
  +'<pre class="at-tp-output" data-live-log>'+outHtml+'</pre>'
  +'</div>';
 const host=document.querySelector('#dash .shell')||document.body;
 host.appendChild(panel);
 panel.querySelector('#at-tp-close').onclick=()=>{stopLogStream();panel.remove();shown=null};
 panel.querySelector('#at-tp-min').onclick=()=>{
  const min=panel.classList.toggle('minimized');
  if(min)panel.classList.remove('maximized');
  panel.querySelector('#at-tp-min').title=min?'Restore':'Minimize';
 };
 panel.querySelector('#at-tp-max').onclick=()=>{
  panel.classList.remove('minimized');
  const max=panel.classList.toggle('maximized');
  panel.querySelector('#at-tp-max').title=max?'Restore':'Maximize';
 };
 panel.addEventListener('click',async e=>{
  const b=e.target.closest('[data-run-act]');if(!b||!shown)return;
  const act=b.dataset.runAct;b.disabled=true;
  try{
   if(act==='apply-plan'){const cur=runs.find(x=>x.id===shown);if(!cur)return;
    const created=await api('/runs',{method:'POST',body:JSON.stringify({repository:cur.r,branch:cur.b,environment:cur.e,action:'apply',sourcePlanRunId:cur.id})});
    note(created.status==='waiting_approval'?'Apply created — waiting for Admin approval.':'Apply queued.');await sync();openRunTerminal(created.id);return}
   await api('/runs/'+encodeURIComponent(shown)+'/'+act,{method:'POST',body:'{}'});note(act==='approve'?'Approved. The run is queued.':'Run cancelled.');await sync();if(shown)openRunTerminal(shown)}
  catch(err){note(err.message);b.disabled=false}
 });
 if(live)startLogStream(id);else stopLogStream();
}
function show(id){openRunTerminal(id)}
$('po').addEventListener('click',async e=>{const b=e.target.closest('[data-run-act]');if(!b||!shown)return;const act=b.dataset.runAct;b.disabled=true;
 try{
  if(act==='apply-plan'){const r=runs.find(x=>x.id===shown);if(!r)return;
   const created=await api('/runs',{method:'POST',body:JSON.stringify({repository:r.r,branch:r.b,environment:r.e,action:'apply',sourcePlanRunId:r.id})});
   note(created.status==='waiting_approval'?'Apply created — waiting for Admin approval.':'Apply queued (will use the exact saved plan).');await sync();show(created.id);return}
  await api('/runs/'+encodeURIComponent(shown)+'/'+act,{method:'POST',body:'{}'});note(act==='approve'?'Approved. The run is queued.':'Run cancelled.');await sync()}catch(err){note(err.message);b.disabled=false}});
$('tb').onclick=e=>{const t=e.target.closest('tr');if(t&&t.dataset.id)show(t.dataset.id)};
attachTableSort($('tb')&&$('tb').closest('table'));
if($('fq'))$('fq').oninput=()=>{RUN_PAGE=1;draw()};
if($('rf'))$('rf').onclick=e=>{e.preventDefault();e.stopPropagation();refreshRuns()};
setInterval(paintLastUpdated,15000);
(function(){
 const btn=$('ffs-btn'),menu=$('ffs-menu');
 if(!btn||!menu)return;
 btn.addEventListener('click',e=>{e.stopPropagation();const open=menu.classList.contains('hide');closeFilterSet();if(open)openFilterSet()});
 menu.addEventListener('click',e=>{const o=e.target.closest('.ffs-opt');if(!o)return;e.stopPropagation();setFilterSet(o.dataset.fs||'',o.dataset.label||o.textContent.trim())});
 document.addEventListener('click',e=>{if(!e.target.closest('#ffs'))closeFilterSet()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeFilterSet()});
})();
function chk(){const env=$('me').value,h=held(env),row=LOCK_ROWS.find(x=>x.environment===env),w=$('mw');
 const waiting=(row&&row.waiting)||[];
 w.classList.toggle('hide',!(h||waiting.length));
 if(h&&h.u)w.textContent=env+' is locked by '+h.u+' ('+h.a+' on '+h.b+'). On Start run you can add to the queue or wait for a notification'+(waiting.length?' · '+waiting.length+' already waiting':'')+'.';
 else if(waiting.length)w.textContent=env+' has '+waiting.length+' run(s) waiting. On Start run you can join the queue or wait to be notified.';
 const act=parseAction($('ma').value);
 $('m-apply').classList.toggle('hide',act!=='apply');
 $('m-destroy').classList.toggle('hide',act!=='destroy');
 if(act==='destroy'){$('mdc-hint').textContent='destroy '+env;$('mdc').placeholder='destroy '+env}
 if(act==='apply')fillPlanOptions()}
function rtSyncMenu(selId){
 const sel=$(selId),mn=$(selId+'-mn'),val=$(selId+'-val');
 if(!sel||!mn)return;
 mn.innerHTML=[...sel.options].map(o=>'<button type="button" class="ami'+(o.value===sel.value?' on':'')+(o.disabled?' hide':'')+'" role="option" data-val="'+xe(o.value)+'">'+xe(o.textContent)+'</button>').join('');
 const cur=sel.options[sel.selectedIndex];
 if(val)val.textContent=cur?cur.textContent:'';
}
function rtSetOptions(selId,items,emptyLabel){
 const sel=$(selId);if(!sel)return;
 if(!items||!items.length){
  sel.innerHTML='<option value="">'+xe(emptyLabel||'None available')+'</option>';
 }else{
  const keep=sel.value;
  sel.innerHTML=items.map(it=>{
   const v=typeof it==='string'?it:it.value;
   const t=typeof it==='string'?it:it.label;
   return '<option value="'+xe(v)+'">'+xe(t)+'</option>';
  }).join('');
  if(keep&&[...sel.options].some(o=>o.value===keep))sel.value=keep;
 }
 rtSyncMenu(selId);
}
function rtSavedRepos(){try{return JSON.parse(sessionStorage.getItem('cr-repos')||'[]')}catch(e){return[]}}
function repoSlugFromUrl(url){
 if(!url)return '';
 let s=String(url).trim().replace(/\.git$/i,'').replace(/\/+$/,'');
 s=s.replace(/^git@[^:]+:/,'');
 s=s.replace(/^https?:\/\//i,'');
 const parts=s.split('/').filter(Boolean);
 return (parts[parts.length-1]||'').replace(/[^A-Za-z0-9._-]/g,'');
}
async function fillBranchOptions(){
 const repo=$('mrp')&&$('mrp').value;
 const names=new Set();
 const saved=rtSavedRepos().find(r=>repoSlugFromUrl(r.url)===repo);
 if(saved&&saved.branch)names.add(saved.branch);
 if(repo){
  try{
   const br=await api('/bitbucket/repositories/'+encodeURIComponent(repo)+'/branches');
   (br||[]).forEach(b=>{if(b&&b.name)names.add(b.name)});
  }catch(e){}
 }
 rtSetOptions('mb',[...names],repo?'No branches found for this repository':'Select a repository first');
}
async function loadRunFormOptions(){
 const saved=rtSavedRepos();
 const seen=new Set();
 const repoItems=[];
 saved.forEach(r=>{
  const slug=repoSlugFromUrl(r.url);
  if(!slug||seen.has(slug))return;
  seen.add(slug);
  const ws=r.workspace&&r.workspace!=='—'?r.workspace+'/':'';
  repoItems.push({value:slug,label:ws+slug});
 });
 let envRows=window.__envsCache;
 if(!envRows){try{envRows=await api('/environments')}catch(e){envRows=[]}window.__envsCache=envRows}
 (envRows||[]).forEach(e=>{
  if(e&&e.repository&&!seen.has(e.repository)){seen.add(e.repository);repoItems.push({value:e.repository,label:e.repository})}
 });
 rtSetOptions('mrp',repoItems,'Add a repository in Admin → Connect Repositories');
 const envItems=allEnvNames().map(n=>({value:n,label:n}));
 rtSetOptions('me',envItems,'Add an environment in Admin → Variables');
 const actKeep=$('ma')&&$('ma').value;
 const actItems=allActionNames().slice();
 if(actKeep&&actItems.indexOf(actKeep)<0)actItems.unshift(actKeep);
 rtSetOptions('ma',actItems.map(n=>({value:n,label:n})),'Add an action in Admin → Variables');
 await fillBranchOptions();
 chk();
}
function rtCloseAll(except){
 document.querySelectorAll('#mo .rt-dd').forEach(w=>{
  if(except&&w===except)return;
  const mn=w.querySelector('.role-dd-mn'),trig=w.querySelector('.role-dd-trig');
  if(mn)mn.classList.add('hide');
  if(trig){trig.classList.remove('open');trig.setAttribute('aria-expanded','false')}
 });
}
function wireRunDropdowns(){
 document.querySelectorAll('#mo .rt-dd').forEach(wrap=>{
  const selId=wrap.dataset.for,sel=$(selId);if(!sel)return;
  const trig=wrap.querySelector('.role-dd-trig'),mn=wrap.querySelector('.role-dd-mn'),val=wrap.querySelector('.role-dd-val');
  rtSyncMenu(selId);
  trig.addEventListener('click',e=>{
   e.preventDefault();e.stopPropagation();
   const open=mn.classList.contains('hide');
   rtCloseAll();
   if(open){mn.classList.remove('hide');trig.classList.add('open');trig.setAttribute('aria-expanded','true')}
  });
  mn.addEventListener('click',e=>{
   const b=e.target.closest('.ami');if(!b)return;
   e.preventDefault();e.stopPropagation();
   sel.value=b.getAttribute('data-val');
   if(val)val.textContent=b.textContent.trim();
   mn.querySelectorAll('.ami').forEach(x=>x.classList.toggle('on',x===b));
   rtCloseAll();
   sel.dispatchEvent(new Event('change'));
  });
 });
}
async function fillPlanOptions(){const env=$('me').value,repo=$('mrp').value,sel=$('msp');
 const plans=runs.filter(r=>r.a==='plan'&&r.s==='succeeded'&&r.e===env&&r.r===repo&&r.raw&&r.raw.planFileKey);
 sel.innerHTML='<option value="">Select a succeeded plan…</option>'+plans.map(p=>'<option value="'+xe(p.id)+'">'+xe(p.sid)+' · '+xe(p.b)+' · '+xe(p.c)+' · '+(p.raw.planSummary||'plan')+'</option>').join('');
 if(!plans.length)sel.innerHTML='<option value="">No succeeded plans for '+xe(repo)+' / '+xe(env)+'</option>';
 rtSyncMenu('msp')}
$('nr').onclick=()=>{$('mo').classList.remove('hide');rtCloseAll();loadRunFormOptions()};$('me').onchange=chk;if($('ma'))$('ma').onchange=chk;$('mrp').onchange=()=>{fillBranchOptions();chk()};$('mc').onclick=()=>{$('mo').classList.add('hide');rtCloseAll()};
$('mo').addEventListener('click',e=>{if(e.target===$('mo')){$('mo').classList.add('hide');rtCloseAll()}});
document.addEventListener('click',e=>{if(!e.target.closest('#mo .rt-dd'))rtCloseAll()});
wireRunDropdowns();
$('mg').onclick=async()=>{const g=$('mg');g.disabled=true;
 try{const action=parseAction($('ma').value),repository=$('mrp').value,branch=$('mb').value,environment=$('me').value;
  if(!repository)throw new Error('Add a repository in Admin → Connect Repositories first');
  if(!branch)throw new Error('Select a branch');
  if(!environment)throw new Error('Select an environment');
  if(action!=='plan'&&action!=='apply'&&action!=='destroy')throw new Error('Action must be plan, apply or destroy');
  const body={repository,branch,environment,action};
  if(action==='apply'){body.sourcePlanRunId=$('msp').value;if(!body.sourcePlanRunId)throw new Error('Pick a succeeded plan to apply');
   const plan=runs.find(x=>x.id===body.sourcePlanRunId);if(plan)body.branch=plan.b}
  if(action==='destroy'){body.destroyConfirmation=$('mdc').value.trim()}
  const busy=envLockBusy(environment);
  if(busy){
   g.disabled=false;
   const choice=await chooseLockWait({environment,action,busy});
   if(choice!=='queue'){
    if(choice==='wait'){
     addLockWatch({environment,action,repository,branch});
     $('mo').classList.add('hide');
     note('You will be notified when the '+environment+' queue ends. Start this '+action+' yourself then.');
     paintNotifs();
    }
    return;
   }
   g.disabled=true;
  }
  const r=await api('/runs',{method:'POST',body:JSON.stringify(body)});
  $('mo').classList.add('hide');note(r.status==='waiting_approval'?'Run created. It needs Admin approval before it is queued.':'Run queued — it will start when the lock is free.');await sync();openRunTerminal(r.id)}
 catch(err){note(err.message)}finally{g.disabled=false}};
setInterval(()=>{if(!document.hidden&&!$('dash').classList.contains('hide')&&ME)sync()},8000);
/* routing + auth gate */
function bootDashView(){
 const v=(window.__view||(()=>{try{return sessionStorage.getItem('tp-view')}catch(e){return null}})()||'All runs');
 if(window.__go)window.__go(v);
 else window.__bootView=v;
}
async function route(){const d=location.hash==='#dashboard';
 $('land').classList.toggle('hide',d);$('dash').classList.toggle('hide',!d);
 document.documentElement.classList.toggle('boot-dash',d);
 document.documentElement.classList.toggle('land-lock',!d);document.body.classList.toggle('land-lock',!d);
 if(d){window.scrollTo(0,0);if(!ME){const u=await loadMe();if(!u){location.hash='home';note('Sign in to open the dashboard.');return}}paintUser();sync();connectLockWs();bootDashView()}
 else{window.scrollTo(0,0)}}
$('out').onclick=async()=>{try{await api('/auth/logout',{method:'POST',body:'{}'})}catch(e){}try{await fetch('/api/auth/session',{method:'DELETE',credentials:'same-origin'})}catch(e){}ME=null;document.documentElement.classList.remove('boot-dash');location.hash='home'};
showProviders();
try{history.scrollRestoration='manual'}catch(e){}
addEventListener('hashchange',()=>{route()});
if(justSignedIn){
  playBrandSplash().then(()=>{
    if(location.hash!=='#dashboard')location.hash='dashboard';
    else route();
  });
}else{route()}
/* landing Mac terminal — type make command (7s), then reveal plan (to 10s total) */
(function(){
const body=$('mac-body'),code=$('mac-code');
if(!body||!code)return;
const pathHtml='<span class="t-path">~/<b class="t-user">shubham-meshram</b>/devops/infrastructure</span>';
const cmdPlain='make terraform-plan env="dev" app="rms"';
const cmdHtml='<span class="t-run"><span class="t-cmd">make terraform-plan</span> <span class="t-flag">env=</span><span class="t-str">"dev"</span> <span class="t-flag">app=</span><span class="t-str">"rms"</span></span>';
const prompt='<span class="t-prompt">➜</span> '+pathHtml+' ';
const outLines=[
  '<span class="t-dim">Refreshing state...</span>',
  '&nbsp;',
  '<span class="t-muted">Terraform will perform the following actions:</span>',
  '&nbsp;',
  '<span class="t-muted">  # aws_security_group.rms_app</span> <span class="t-add">will be created</span>',
  '<span class="t-add">+</span> <span class="t-key">resource</span> <span class="t-str">"aws_security_group"</span> <span class="t-str">"rms_app"</span> <span class="t-muted">{</span>',
  '<span class="t-add">+</span>     <span class="t-key">name</span> <span class="t-muted">=</span> <span class="t-str">"rms-app-dev"</span>',
  '<span class="t-muted">    }</span>',
  '&nbsp;',
  '<span class="t-muted">  # aws_lb_listener_rule.rms</span> <span class="t-add">will be created</span>',
  '<span class="t-add">+</span> <span class="t-key">resource</span> <span class="t-str">"aws_lb_listener_rule"</span> <span class="t-str">"rms"</span> <span class="t-muted">{ … }</span>',
  '&nbsp;',
  '<span class="t-muted">  # aws_db_instance.rms</span> <span class="t-chg">will be updated in-place</span>',
  '<span class="t-chg">~</span> <span class="t-key">resource</span> <span class="t-str">"aws_db_instance"</span> <span class="t-str">"rms"</span> <span class="t-muted">{</span>',
  '<span class="t-chg">~</span>     <span class="t-key">instance_class</span> <span class="t-muted">=</span> <span class="t-str">"db.t3.medium"</span> <span class="t-chg">-&gt;</span> <span class="t-str">"db.t3.large"</span>',
  '<span class="t-muted">    }</span>',
  '&nbsp;',
  '<span class="t-muted">  # aws_eip.legacy</span> <span class="t-del">will be destroyed</span>',
  '<span class="t-del">-</span> <span class="t-key">resource</span> <span class="t-str">"aws_eip"</span> <span class="t-str">"legacy"</span> <span class="t-muted">{ … }</span>',
  '&nbsp;',
  '<span class="t-plan">Plan:</span> <span class="t-add">2 to add</span><span class="t-muted">,</span> <span class="t-chg">1 to change</span><span class="t-muted">,</span> <span class="t-del">1 to destroy</span><span class="t-muted">.</span>',
  prompt+'<span class="t-cursor">▋</span>'
];
const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
const TYPE_MS=7000,TOTAL_MS=10000,OUT_MS=TOTAL_MS-TYPE_MS;
code.innerHTML='';
function pushLine(html,on){
  const el=document.createElement('span');
  el.className='tl'+(on?' on':'');
  el.innerHTML=html;
  code.appendChild(el);
  if(!on)requestAnimationFrame(()=>el.classList.add('on'));
  return el;
}
function revealOut(){
  let i=0;
  const step=Math.max(40,Math.floor(OUT_MS/Math.max(1,outLines.length)));
  function next(){
    if(i>=outLines.length)return;
    pushLine(outLines[i++]);
    if(i<outLines.length)setTimeout(next,step);
  }
  next();
}
if(reduced){
  pushLine(prompt+cmdHtml,true);
  outLines.forEach(html=>pushLine(html,true));
  return;
}
const row=pushLine(prompt+'<span class="t-type"></span><span class="t-cursor">▋</span>');
const typed=row.querySelector('.t-type');
const caret=row.querySelector('.t-cursor');
let n=0;
const tick=Math.max(28,Math.floor(TYPE_MS/Math.max(1,cmdPlain.length)));
function typeChar(){
  if(n<cmdPlain.length){
    typed.textContent=cmdPlain.slice(0,++n);
    setTimeout(typeChar,tick);
    return;
  }
  typed.outerHTML=cmdHtml;
  if(caret)caret.remove();
  setTimeout(revealOut,180);
}
setTimeout(typeChar,280);
})();

/* landing WebGL — white water field; bubbles spawn only while cursor moves */
(function(){
const host=$('land'),canvas=$('land-gl');
if(!host||!canvas)return;
const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
if(!window.THREE||reduced){host.classList.add('land-static');return}
const T=THREE,BG=0xffffff;
let renderer;try{renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'})}catch(e){host.classList.add('land-static');return}
renderer.setClearColor(BG,1);
const waterScene=new T.Scene();
const bubScene=new T.Scene();
const waterCam=new T.OrthographicCamera(-1,1,1,-1,-1,1);
const bubCam=new T.OrthographicCamera(0,1,1,0,-10,10);
const waterMat=new T.ShaderMaterial({
  depthWrite:false,
  uniforms:{uTime:{value:0},uRes:{value:new T.Vector2(1,1)}},
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
  fragmentShader:`precision highp float;varying vec2 vUv;uniform float uTime;uniform vec2 uRes;
    void main(){
      vec2 uv=vUv;
      float aspect=uRes.x/max(uRes.y,1.);
      vec2 p=vec2((uv.x-.5)*aspect,uv.y-.5);
      float t=uTime*.35;
      float w=sin(uv.x*5.5+t*1.2)*.01+sin(uv.x*9.-t*.9+uv.y*2.)*.007+cos(uv.y*4.+t*.7)*.008;
      float band=sin((uv.y+w)*14.-t*1.2)*.5+.5;
      band*=sin((uv.x+w)*8.+t*.6)*.5+.5;
      float ca=abs(sin((uv.x+w)*10.+t)*sin((uv.y+w)*8.-t*.8));
      ca=pow(ca,1.6);
      vec3 base=vec3(.99,.995,1.);
      vec3 tint=vec3(.93,.96,1.);
      vec3 shade=vec3(.88,.92,.97);
      vec3 col=mix(base,tint,.35+band*.25);
      col=mix(col,shade,ca*.18);
      float vign=smoothstep(1.4,.2,length(p*vec2(.7,1.)));
      col=mix(col,vec3(.94,.96,.99),1.-vign*.45);
      gl_FragColor=vec4(col,1.);
    }`
});
waterScene.add(new T.Mesh(new T.PlaneGeometry(2,2),waterMat));
const N=420,pos=new Float32Array(N*3),vx=new Float32Array(N),vy=new Float32Array(N),life=new Float32Array(N),maxLife=new Float32Array(N),sizes=new Float32Array(N),baseSize=new Float32Array(N),col=new Float32Array(N*3);
function clearBubbles(){for(let i=0;i<N;i++){life[i]=0;pos[i*3]=-9999;pos[i*3+1]=-9999;pos[i*3+2]=0;sizes[i]=0}}
clearBubbles();
const bubbleTex=(()=>{
  const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');
  g.clearRect(0,0,64,64);
  g.beginPath();g.arc(32,32,20,0,Math.PI*2);
  g.strokeStyle='rgba(70,110,170,.75)';g.lineWidth=3.2;g.stroke();
  const fill=g.createRadialGradient(32,32,2,32,32,20);
  fill.addColorStop(0,'rgba(140,180,230,.1)');fill.addColorStop(1,'rgba(90,140,200,.28)');
  g.fillStyle=fill;g.beginPath();g.arc(32,32,18,0,Math.PI*2);g.fill();
  g.beginPath();g.ellipse(24,20,4.5,3,-.4,0,Math.PI*2);g.fillStyle='rgba(255,255,255,.98)';g.fill();
  return new T.CanvasTexture(c);
})();
const pgeo=new T.BufferGeometry();
pgeo.setAttribute('position',new T.BufferAttribute(pos,3));
pgeo.setAttribute('color',new T.BufferAttribute(col,3));
pgeo.setAttribute('size',new T.BufferAttribute(sizes,1));
const bubMat=new T.ShaderMaterial({
  transparent:true,depthWrite:false,blending:T.NormalBlending,
  uniforms:{uMap:{value:bubbleTex},uPixel:{value:1}},
  vertexShader:`attribute float size;attribute vec3 color;varying vec3 vC;varying float vA;uniform float uPixel;
    void main(){vC=color;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=max(size,0.)*uPixel;vA=size>0.? .85:0.;gl_Position=projectionMatrix*mv;}`,
  fragmentShader:`uniform sampler2D uMap;varying vec3 vC;varying float vA;
    void main(){if(vA<.01)discard;vec4 t=texture2D(uMap,gl_PointCoord);float a=t.a*vA;if(a<.03)discard;gl_FragColor=vec4(t.rgb*vC,a);}`
});
const bubbles=new T.Points(pgeo,bubMat);bubbles.frustumCulled=false;bubScene.add(bubbles);
let W=1,H=1,booted=false,_sw=0,_sh=0,mx=0,my=0,pmx=0,pmy=0,moving=false,moveUntil=0,spawnAcc=0,bottomAcc=0,cursor=0;
function size(){
  const r=host.getBoundingClientRect();
  W=Math.max(1,Math.floor(r.width));H=Math.max(1,Math.floor(r.height));
  const dpr=Math.min(devicePixelRatio||1,2);
  renderer.setPixelRatio(dpr);renderer.setSize(W,H,false);
  canvas.style.width=W+'px';canvas.style.height=H+'px';
  waterMat.uniforms.uRes.value.set(W,H);
  bubCam.left=0;bubCam.right=W;bubCam.top=H;bubCam.bottom=0;bubCam.updateProjectionMatrix();
  bubMat.uniforms.uPixel.value=dpr;
  clearBubbles();booted=true;
  pgeo.attributes.position.needsUpdate=true;pgeo.attributes.size.needsUpdate=true;
}
function sizeSafe(){const r=host.getBoundingClientRect();if(Math.abs(r.width-_sw)<2&&Math.abs(r.height-_sh)<2&&booted)return;_sw=r.width;_sh=r.height;size()}
sizeSafe();requestAnimationFrame(sizeSafe);new ResizeObserver(sizeSafe).observe(host);addEventListener('resize',sizeSafe);
const onMove=e=>{
  if(host.classList.contains('hide'))return;
  const r=host.getBoundingClientRect();
  pmx=mx;pmy=my;mx=e.clientX-r.left;my=H-(e.clientY-r.top);
  if(Math.hypot(mx-pmx,my-pmy)>.25){moving=true;moveUntil=performance.now()+140}
};
const onLeave=()=>{moving=false};
host.addEventListener('pointermove',onMove);host.addEventListener('pointerleave',onLeave);
document.addEventListener('pointermove',onMove);
function spawn(x,y,spd,fromBottom){
  for(let tries=0;tries<N;tries++){
    cursor=(cursor+1)%N;if(life[cursor]>0)continue;
    const i=cursor,i3=i*3;
    if(fromBottom){
      pos[i3]=Math.random()*W;pos[i3+1]=-6-Math.random()*24;pos[i3+2]=0;
      vx[i]=(Math.random()-.5)*18;vy[i]=28+Math.random()*52;
      maxLife[i]=3.2+Math.random()*3.5;
      baseSize[i]=3.5+Math.random()*8+(Math.random()<.12?6:0);
    }else{
      pos[i3]=x+(Math.random()-.5)*22;pos[i3+1]=y+(Math.random()-.5)*18;pos[i3+2]=0;
      vx[i]=(Math.random()-.5)*48;vy[i]=50+Math.random()*80+spd*32;
      maxLife[i]=1.2+Math.random()*1.8;
      baseSize[i]=5+Math.random()*11+(Math.random()<.25?7:0);
    }
    life[i]=maxLife[i];sizes[i]=baseSize[i];
    const cool=.8+Math.random()*.2;
    col[i3]=.35*cool;col[i3+1]=.55*cool;col[i3+2]=.85;
    return;
  }
}
let last=performance.now();
(function loop(now){
  requestAnimationFrame(loop);
  if(host.classList.contains('hide'))return;
  const dt=Math.min(.05,(now-last)/1000);last=now;
  waterMat.uniforms.uTime.value=now*.001;
  if(now>moveUntil)moving=false;
  const mdx=mx-pmx,mdy=my-pmy,mspd=Math.min(2.2,Math.hypot(mdx,mdy)*.05);
  /* ambient bubbles rising from the bottom */
  bottomAcc+=dt*38;
  while(bottomAcc>=1){
    bottomAcc-=1;
    spawn(0,0,0,true);
    if(Math.random()<.7)spawn(0,0,0,true);
    if(Math.random()<.4)spawn(0,0,0,true);
  }
  if(moving){
    spawnAcc+=dt*(42+mspd*55);
    while(spawnAcc>=1){
      spawnAcc-=1;
      spawn(mx,my,mspd,false);
      if(Math.random()<.75)spawn(mx,my,mspd,false);
      if(Math.random()<.4)spawn(mx,my,mspd,false);
    }
  }else spawnAcc=0;
  pmx=mx;pmy=my;
  let dirty=false;
  for(let i=0;i<N;i++){
    if(life[i]<=0)continue;
    life[i]-=dt;
    if(life[i]<=0){life[i]=0;sizes[i]=0;pos[i*3]=-9999;dirty=true;continue}
    const i3=i*3,age=1-life[i]/maxLife[i];
    pos[i3]+=vx[i]*dt;pos[i3+1]+=vy[i]*dt;
    vx[i]*=.98;vy[i]+=8*dt;
    sizes[i]=baseSize[i]*(1-age*.85);dirty=true;
  }
  if(dirty){pgeo.attributes.position.needsUpdate=true;pgeo.attributes.size.needsUpdate=true;pgeo.attributes.color.needsUpdate=true}
  renderer.autoClear=true;renderer.render(waterScene,waterCam);
  renderer.autoClear=false;renderer.clearDepth();renderer.render(bubScene,bubCam);renderer.autoClear=true;
})(last);
})();

/* header menus, theme, sidebar */
(function(){const closeM=()=>{document.querySelectorAll('.mn').forEach(m=>m.classList.add('hide'));document.querySelectorAll('[data-menu]').forEach(b=>{b.setAttribute('aria-expanded','false');b.classList.remove('open')})};window.__closeM=closeM;
const HELP={
 'All runs':{t:'Finding runs',b:`
<h3>Search methods</h3>
<p>Use the filter set and Search field to narrow the runs table.</p>
<h3>Filtering by run attributes</h3>
<ol>
<li>Open <b>Saved filter sets</b>.</li>
<li>Choose a custom set (environment) or a preset (status such as <b>Running</b> or <b>Failed</b>).</li>
<li>The table updates to matching runs only.</li>
</ol>
<h3>Free text search</h3>
<ol>
<li>In the <b>Search</b> field, type a branch, actor, repository, or action.</li>
<li>Results update as you type. Clear the field to see all runs again.</li>
</ol>`},
 'Dashboard':{t:'Dashboard',b:`
<h3>What you see</h3>
<p>Live overview of runs, locks, approvals and recent activity across environments.</p>
<h3>Next steps</h3>
<ol>
<li>Open <b>All runs</b> to filter and inspect individual runs.</li>
<li>Use <b>Run terraform</b> to start a plan, apply, or destroy.</li>
<li>Check <b>Live locks</b> before applying to a busy environment.</li>
</ol>`},
 'Live locks':{t:'Environment locks',b:`
<h3>How locks work</h3>
<p>Each environment holds one exclusive lock for apply/destroy. Other runs wait in the queue.</p>
<ol>
<li>Green / Free means you can start a run.</li>
<li>Locked shows who holds it and which branch/action.</li>
<li>Queued runs start automatically when the lock frees.</li>
</ol>`},
 'Plans':{t:'Plans',b:`
<h3>Plan runs</h3>
<p>Plans never change infrastructure. They produce a saved plan file you can apply later.</p>
<ol>
<li>Filter to plans with the action tabs or Search.</li>
<li>Open a succeeded plan to review the diff.</li>
<li>Choose <b>Apply this plan</b> to use the exact saved <b>.tfplan</b>.</li>
</ol>`},
 'Applies':{t:'Applies',b:`
<h3>Apply runs</h3>
<p>Applies change real infrastructure and usually need Admin approval.</p>
<ol>
<li>Start from a succeeded plan when possible.</li>
<li>Wait for approval if the environment policy requires it.</li>
<li>Watch live logs while the runner holds the environment lock.</li>
</ol>`},
 'Destroys':{t:'Destroys',b:`
<h3>Destroy runs</h3>
<p>Destroys remove managed resources. Confirmation and approval are required.</p>
<ol>
<li>Type the confirmation phrase exactly.</li>
<li>An Admin must approve before the run is queued.</li>
<li>The environment lock is held until destroy finishes.</li>
</ol>`},
 'Approvals':{t:'Approvals',b:`
<h3>Approval queue</h3>
<p>Applies and destroys wait here until an Admin approves or cancels.</p>
<ol>
<li>Review the branch, environment and actor.</li>
<li>Approve to queue the run, or cancel to discard it.</li>
</ol>`},
 'Queue':{t:'Queue',b:`
<h3>What waits here</h3>
<p>Runs waiting on a lock or on approval appear in the queue.</p>
<ol>
<li>Lock waiters start when the environment frees.</li>
<li>Approval waiters move to the runner after Approve.</li>
</ol>`},
 'Repositories':{t:'Repositories',b:`
<h3>Connected repos</h3>
<p>Repositories synced from Bitbucket that Terraplan can plan against.</p>
<ol>
<li>Use Search to find a repository by name.</li>
<li>Open Branches or Pull requests for that repo’s activity.</li>
</ol>`},
 'Workers':{t:'Workers',b:`
<h3>Ephemeral workers</h3>
<p>Each terraform plan, apply or destroy can run on a short-lived agent. When the run finishes (success or fail), that agent is torn down.</p>
<ol>
<li>Set up one of Server, Docker or Kubernetes. Only one worker is active at a time.</li>
<li>A Server worker can be AWS, GCP or Azure — required fields follow the cloud you pick.</li>
<li>If none is enabled, Terraplan runs terraform on this host — same as Jenkins when master and agent are the same.</li>
<li>Use Test to prove a worker can come up and then terminate.</li>
</ol>`},
 'Integration':{t:'Integration',b:`
<h3>Worker credentials</h3>
<p>Store the keys Terraplan uses to create ephemeral workers. Copy the required policy JSON, attach it in AWS / Docker / Kubernetes, then paste credentials here.</p>
<ol>
<li>Copy the IAM policy (AWS), Docker permissions, or ClusterRole JSON.</li>
<li>Attach it to the IAM user, Docker host, or Kubernetes service account.</li>
<li>Add the credentials. Workers under Admin → Workers use these profiles.</li>
</ol>`},
 'Users':{t:'Users',b:`
<h3>Workspace users</h3>
<p>Manage who can plan, apply and approve in this workspace.</p>
<ol>
<li>Invite a user and assign environment roles.</li>
<li>Disable accounts that should lose access.</li>
</ol>`},
 'Audit log':{t:'Audit log',b:`
<h3>Compliance trail</h3>
<p>Every sensitive action is recorded with actor, target and result.</p>
<ol>
<li>Filter by actor or environment with Search.</li>
<li>Export CSV for reviews when you need evidence.</li>
</ol>`}
};
HELP._default={t:'Info',b:`
<h3>About this page</h3>
<p>Use the sidebar to move between Terraplan views. Open <b>Info</b> anytime for contextual help.</p>
<h3>Common actions</h3>
<ol>
<li><b>Run terraform</b> starts a plan, apply, or destroy.</li>
<li><b>Saved filter sets</b> and Search narrow long lists.</li>
<li>Check locks and approvals before changing production.</li>
</ol>`};
function paintHelp(page){
 const cfg=HELP[page]||HELP._default;
 const title=$('help-title'),bd=$('help-bd');
 if(title)title.textContent=cfg.t;
 if(bd)bd.innerHTML=cfg.b;
}
function openHelp(){
 const dash=$('dash'),panel=$('help'),btn=$('help-toggle');
 if(!dash||!panel)return;
 paintHelp(window.__view||'All runs');
 dash.classList.add('help-open');
 panel.classList.remove('hide');panel.hidden=false;
 if(btn){btn.setAttribute('aria-expanded','true');btn.classList.add('on')}
}
function closeHelp(){
 const dash=$('dash'),panel=$('help'),btn=$('help-toggle');
 if(dash)dash.classList.remove('help-open');
 if(panel){panel.classList.add('hide');panel.hidden=true}
 if(btn){btn.setAttribute('aria-expanded','false');btn.classList.remove('on')}
}
function toggleHelp(){($('dash')&&$('dash').classList.contains('help-open'))?closeHelp():openHelp()}
window.__openHelp=openHelp;window.__closeHelp=closeHelp;window.__paintHelp=paintHelp;
const helpToggle=$('help-toggle'),helpClose=$('help-close');
if(helpToggle)helpToggle.addEventListener('click',e=>{e.stopPropagation();toggleHelp()});
if(helpClose)helpClose.addEventListener('click',e=>{e.stopPropagation();closeHelp()});
const footShell=$('foot-shell'),footToolkit=$('foot-toolkit'),footFeedback=$('foot-feedback');
if(footShell)footShell.addEventListener('click',()=>{const b=document.querySelector('.tb [aria-label="CloudShell"]');if(b)b.click();else if(window.toast)window.toast('CloudShell');else{const d=document.createElement('div');d.className='toast';d.textContent='CloudShell';document.body.appendChild(d);setTimeout(()=>d.remove(),1800)}});
if(footToolkit)footToolkit.addEventListener('click',()=>{const d=document.createElement('div');d.className='toast';d.textContent='Agent Toolkit';document.body.appendChild(d);setTimeout(()=>d.remove(),1800)});
if(footFeedback)footFeedback.addEventListener('click',()=>{const b=document.querySelector('.subtop-r [aria-label="Feedback"]');if(b)b.click();else{const d=document.createElement('div');d.className='toast';d.textContent='Thanks — feedback noted';document.body.appendChild(d);setTimeout(()=>d.remove(),1800)}});
document.querySelectorAll('#dash-foot .foot-a').forEach(a=>a.addEventListener('click',e=>e.preventDefault()));
document.querySelectorAll('[data-menu]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();const m=$(b.dataset.menu),open=m.classList.contains('hide');closeM();if(open){m.classList.remove('hide');b.setAttribute('aria-expanded','true');b.classList.add('open');
 /* pin Run terraform menu to the chevron's right edge */
 if(m&&m.classList.contains('act')){m.style.left='auto';m.style.right='0';m.style.top='calc(100% + 1px)'}
}}));
document.addEventListener('click',e=>{if(!e.target.closest('.mn')&&!e.target.closest('[data-menu]'))closeM()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeM();closeHelp()}});
document.querySelectorAll('.mn a').forEach(a=>a.addEventListener('click',e=>e.preventDefault()));
function theme(t){document.body.dataset.dt=t;document.querySelectorAll('.mi[data-th]').forEach(i=>i.setAttribute('aria-checked',i.dataset.th===t));try{localStorage.setItem('tp-theme',t)}catch(e){}}
let t0='light';try{t0=localStorage.getItem('tp-theme')||'light'}catch(e){}theme(t0);
document.querySelectorAll('.mi[data-th]').forEach(i=>{const go=()=>{theme(i.dataset.th);closeM()};i.addEventListener('click',go);i.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}})});
$('mr').addEventListener('click',()=>{$('nb').classList.add('hide');document.querySelectorAll('.ni .dot').forEach(d=>d.style.visibility='hidden');saveInbox(readInbox().map(n=>Object.assign({},n,{read:true})));paintNotifs()});
if($('mN-list'))$('mN-list').addEventListener('click',e=>{
 const lockNi=e.target.closest('[data-lock-free]');
 if(lockNi){
  if(window.__closeM)window.__closeM();
  saveInbox(readInbox().map(n=>n.id===lockNi.dataset.lockFree?Object.assign({},n,{read:true}):n));
  paintNotifs();
  const nr=$('nr');if(nr)nr.click();
  const env=lockNi.dataset.env,act=lockNi.dataset.action,repo=lockNi.dataset.repo;
  setTimeout(()=>{
   if(env&&$('me')){$('me').value=env;if(typeof rtSyncMenu==='function')rtSyncMenu('me')}
   if(repo&&$('mrp')){$('mrp').value=repo;if(typeof rtSyncMenu==='function')rtSyncMenu('mrp')}
   if(act&&$('ma')){$('ma').value=act;if(typeof rtSyncMenu==='function')rtSyncMenu('ma')}
   if(typeof chk==='function')chk();
  },0);
  return;
 }
 const ni=e.target.closest('[data-run]');if(!ni)return;if(window.__closeM)window.__closeM();openRunTerminal(ni.dataset.run)
});
$('out').addEventListener('click',closeM);
document.querySelector('.side').addEventListener('click',e=>{const a=e.target.closest('a');if(!a)return;document.querySelectorAll('.side a').forEach(x=>x.classList.remove('on'));a.classList.add('on')})})();


document.querySelectorAll('.sh').forEach(b=>b.addEventListener('click',()=>{const g=b.parentElement,c=g.classList.toggle('c');b.setAttribute('aria-expanded',String(!c))}));

document.querySelectorAll('.mi[data-act],.ami[data-act]').forEach(i=>{const go=()=>{$('nr').click();if($('ma')){$('ma').value=i.dataset.act;if(typeof rtSyncMenu==='function')rtSyncMenu('ma');chk()}if(window.__closeM)window.__closeM()};i.addEventListener('click',go);i.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}})});
function exportRunsCsv(){
 const q=$('fq')?$('fq').value:'';
 const l=runs.filter(r=>(!AF||r.a===AF)&&(!SF||r.s===SF)&&(!EF||r.e===EF)&&(!q||[r.b,r.u,r.r,r.a,r.sid,r.c,r.e].some(x=>String(x||'').toLowerCase().includes(String(q).toLowerCase()))));
 const cols=['Branch','Run ID','Action','Status','Environment','Repository','Triggered by','Commit','Started','Duration'];
 const lines=[cols.join(',')].concat(l.map(r=>[r.b,r.sid,r.a,r.s,r.e,r.r,r.u,r.c,r.t,r.d].map(v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"').join(',')));
 const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'});
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='terraplan-runs.csv';a.click();
 setTimeout(()=>URL.revokeObjectURL(a.href),500);
 note('Exported '+l.length+' run'+(l.length===1?'':'s'));
}
const mState=$('mState');
if(mState)mState.addEventListener('click',e=>{
 const b=e.target.closest('[data-rs]');if(!b)return;
 e.preventDefault();e.stopPropagation();
 const rs=b.getAttribute('data-rs')||'';
 setFilterSet(rs,rs?b.textContent.trim():'All states');
 mState.querySelectorAll('.ami').forEach(x=>x.classList.toggle('on',x===b));
 if(window.__closeM)window.__closeM();
});
const mActs=$('mActs');
if(mActs)mActs.addEventListener('click',async e=>{
 const b=e.target.closest('[data-hdr-act]');if(!b)return;
 e.preventDefault();e.stopPropagation();
 const act=b.getAttribute('data-hdr-act');
 if(window.__closeM)window.__closeM();
 if(act==='export'){exportRunsCsv();return}
 if(!shown){note('Select a run in the table first.');return}
 const r=runs.find(x=>x.id===shown);
 try{
  if(act==='approve'){
   if(!r||r.s!=='waiting approval'){note('Select a run that is waiting for approval.');return}
   await api('/runs/'+encodeURIComponent(shown)+'/approve',{method:'POST',body:'{}'});
   note('Approved. The run is queued.');await sync();if(shown)show(shown);
  }else if(act==='cancel'){
   if(!r||(r.s!=='waiting approval'&&r.s!=='queued'&&r.s!=='running')){note('Select a waiting, queued or running run to cancel.');return}
   await api('/runs/'+encodeURIComponent(shown)+'/cancel',{method:'POST',body:'{}'});
   note('Run cancelled.');await sync();if(shown)show(shown);
  }
 }catch(err){note(err.message)}
});
/* views: sidebar navigation */
(function(){
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const IC={ok:'✓',bad:'✕',warn:'◷',run:'◔',mut:'○'};
function toast(t){const d=document.createElement('div');d.className='toast';d.textContent=t;document.body.appendChild(d);setTimeout(()=>d.remove(),2200)}
function btnNote(btn,msg,ok){
 if(!btn)return;
 let n=btn.nextElementSibling;
 if(!n||!n.classList.contains('cr-test-res')){
  n=document.createElement('span');n.className='cr-test-res';
  btn.insertAdjacentElement('afterend',n);
 }
 n.textContent=msg;
 n.className='cr-test-res '+(ok===false?'cr-test-res-err':'cr-test-res-ok');
 clearTimeout(n.__t);
 n.__t=setTimeout(()=>{if(n.parentNode&&n.textContent===msg)n.textContent=''},2500);
}
const C=['var(--c1)','var(--c2)','var(--c3)','var(--c4)','var(--c5)','var(--c6)'];
const P={dash:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
lock:'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',unlock:'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
play:'<path d="M7 4l13 8-13 8z"/>',list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',plan:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 14h6M9 17h4"/>',
zap:'<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',approve:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',repo:'<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
branch:'<circle cx="6" cy="5" r="2.2"/><circle cx="6" cy="19" r="2.2"/><circle cx="18" cy="8" r="2.2"/><path d="M6 7.2v9.6M18 10.2c0 5-12 2-12 6"/>',
pr:'<circle cx="6" cy="5" r="2.2"/><circle cx="6" cy="19" r="2.2"/><circle cx="18" cy="19" r="2.2"/><path d="M6 7.2v9.6M18 16.8V10a4 4 0 0 0-4-4h-2"/><path d="m14 3-2 3 2 3"/>',
box:'<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12 4 7.5"/>',layers:'<path d="M12 3l9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
db:'<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
sliders:'<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',activity:'<path d="M3 12h4l3-8 4 16 3-8h4"/>',
users:'<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 7M21 20a6 6 0 0 0-4-5.6"/>',teams:'<circle cx="12" cy="7" r="3"/><circle cx="5" cy="17" r="2.5"/><circle cx="19" cy="17" r="2.5"/><path d="M12 10v3M12 13l-5 2.5M12 13l5 2.5"/>',
shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/>',policy:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 14l2 2 4-4"/>',
plug:'<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/>',key:'<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',bell:'<path d="M6 17v-6a6 6 0 0 1 12 0v6l1.5 2h-15zM10 21h4"/>',
code:'<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',clip:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>',plus:'<path d="M12 5v14M5 12h14"/>',
download:'<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>',refresh:'<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
check:'<path d="m5 12 4 4 10-10"/>',x:'<path d="M6 6l12 12M18 6 6 18"/>',alert:'<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',edit:'<path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4"/>',
settings:'<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/><path d="M19.4 13a1.8 1.8 0 0 0 .1-1v-.1a1.8 1.8 0 0 0-.1-1l1.6-1.2a.5.5 0 0 0 .1-.6l-1.5-2.6a.5.5 0 0 0-.6-.2l-1.9.8a6.5 6.5 0 0 0-1.7-1l-.3-2a.5.5 0 0 0-.5-.4h-3a.5.5 0 0 0-.5.4l-.3 2a6.5 6.5 0 0 0-1.7 1l-1.9-.8a.5.5 0 0 0-.6.2L3.8 8.9a.5.5 0 0 0 .1.6L5.5 10.7a1.8 1.8 0 0 0-.1 1v.1a1.8 1.8 0 0 0 .1 1l-1.6 1.2a.5.5 0 0 0-.1.6l1.5 2.6a.5.5 0 0 0 .6.2l1.9-.8a6.5 6.5 0 0 0 1.7 1l.3 2a.5.5 0 0 0 .5.4h3a.5.5 0 0 0 .5-.4l.3-2a6.5 6.5 0 0 0 1.7-1l1.9.8a.5.5 0 0 0 .6-.2l1.5-2.6a.5.5 0 0 0-.1-.6z"/>',
server:'<rect x="3" y="4" width="18" height="6" rx="1.2"/><rect x="3" y="14" width="18" height="6" rx="1.2"/><path d="M6.5 7h.01M6.5 17h.01"/>',
up:'<path d="M12 19V5M6 11l6-6 6 6"/>',left:'<path d="M15 6 9 12l6 6"/>',right:'<path d="M9 6l6 6-6 6"/>',spin:'<path d="M12 3a9 9 0 1 0 9 9"/>',dot:'<circle cx="12" cy="12" r="4"/>',minus:'<path d="M5 12h14"/>',maximize:'<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',restore:'<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>'};
const I=(n,s)=>'<svg class="icn'+(n==='spin'?' spin':'')+'" viewBox="0 0 24 24" width="'+(s||16)+'" height="'+(s||16)+'" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(P[n]||P.activity)+'</svg>';
const SI={ok:'check',bad:'x',warn:'clock',run:'spin',mut:'dot',wait:'clock'};
const EC={dev:'var(--c2)',qa:'var(--c1)',uat:'var(--c5)',staging:'var(--c3)',prod:'var(--c4)'};
const hue=s=>{let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))%360;return h};
const av=n=>'<span class="avt" style="background:hsl('+hue(n)+' 55% 46%)">'+esc(n[0])+'</span>';
const F={br:v=>'<span class="mono">'+I('branch',14)+esc(v)+'</span>',env:v=>'<span class="tx env-'+esc(v)+'">'+esc(v)+'</span>',act:v=>'<span class="tx act-'+esc(v)+'">'+esc(v)+'</span>',st:v=>{const k=cl[v]||'mut';return '<span class="tx st-'+k+'">'+esc(v)+'</span>'},pp:v=>'<span class="pp">'+av(v)+esc(v)+'</span>',rp:v=>'<span class="rp">'+I('repo',14)+esc(v)+'</span>',mono:v=>'<span class="mono">'+esc(v)+'</span>',id:v=>'<a class="run-id mono">'+esc(v)+'</a>',si:k=>I(SI[k]||'dot',14)};
const HF={'Branch':'br','Environment':'env','Triggered by':'pp','Requested by':'pp','Author':'pp','Actor':'pp','Created by':'pp','Name':'pp','Repository':'rp','Application':'rp','Commit':'mono','Last commit':'mono','State key':'mono','Role ARN':'mono','Source':'mono','Webhook URL':'mono','IP':'mono','AWS account':'mono','Terraform dir':'mono'};
window.__fmt=F;
function cell(v){if(typeof v!=='string')return esc(v);if(v==='y')return '<span class="st ok">'+I('check',14)+'</span>';if(v==='n')return '<span class="sub">–</span>';
 if(v.startsWith('html:'))return v.slice(5);
 const m=v.match(/^(ok|bad|warn|run|mut|tag|ln|act|bar|pb):(.*)$/);if(!m)return esc(v);const k=m[1],t=m[2];
 if(k==='ln')return /^(run-|#)/.test(t)?F.id(t):'<a class="run-id">'+esc(t)+'</a>';if(k==='tag')return F.act(t);
 if(k==='act')return t.split(',').map((x,i)=>'<button class="'+(i?'b2':'b1')+' sm" data-t="'+esc(x)+'">'+I(i?'x':'check',14)+esc(x)+'</button>').join('');
 if(k==='bar'||k==='pb'){const p=t.split(':'),r=Math.min(1,p[0]/p[1]),col=k==='pb'?C[0]:r<.5?C[1]:r<.8?C[2]:C[3];return '<div class="mtr"><div class="mt"><i style="width:'+(r*100)+'%;background:'+col+'"></i></div><span>'+esc(p[2])+'</span></div>'}
 return '<span class="tx st-'+(k==='warn'?'wait':k)+'">'+esc(t)+'</span>'}
/* charts */
let GID=0;const grad=(c,o1,o2)=>{const id='g'+(++GID);return [id,'<defs><linearGradient id="'+id+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:'+c+';stop-opacity:'+o1+'"/><stop offset="1" style="stop-color:'+c+';stop-opacity:'+o2+'"/></linearGradient></defs>']};
function spark(v,c){const w=120,h=40,mx=Math.max(...v),mn=Math.min(...v),p=v.map((y,i)=>[i*w/(v.length-1),h-5-((y-mn)/(mx-mn||1))*(h-12)]),d=p.map((q,i)=>(i?'L':'M')+q[0].toFixed(1)+' '+q[1].toFixed(1)).join(''),g=grad(c,.38,0);
 return '<svg class="sp" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none">'+g[1]+'<path class="sp-fill" d="'+d+'L'+w+' '+h+'L0 '+h+'Z" fill="url(#'+g[0]+')"/><path class="sp-line" d="'+d+'" fill="none" stroke="'+c+'" stroke-width="2.2" vector-effect="non-scaling-stroke"/></svg>'}
function grid(W,pl,pt,ph,mx){let g='';for(let t=0;t<=4;t++){const y=pt+ph-ph*t/4;g+='<line x1="'+pl+'" x2="'+W+'" y1="'+y+'" y2="'+y+'" class="gl"/><text x="'+(pl-6)+'" y="'+(y+3.5)+'" text-anchor="end" class="ax" font-size="8">'+Math.round(mx*t/4)+'</text>'}return g}
/* AWS Cost Explorer–style stacked bars: solid fills, rounded top only, flat joins */
function roundTopBar(x,y,w,h,r){
 r=Math.max(0,Math.min(r||4,w/2,h));
 if(h<=0)return '';
 if(r<=0)return 'M'+x+' '+y+'h'+w+'v'+h+'h'+(-w)+'z';
 return 'M'+(x+r)+' '+y+'H'+(x+w-r)+'Q'+(x+w)+' '+y+' '+(x+w)+' '+(y+r)+'V'+(y+h)+'H'+x+'V'+(y+r)+'Q'+x+' '+y+' '+(x+r)+' '+y+'Z';
}
function vbars(labels,series,colors,names,H,W0){
 H=H||220;const W=W0||560,pl=36,pb=26,pt=10,n=labels.length,ph=H-pb-pt;
 const tot=labels.map((_,i)=>series.reduce((a,s)=>a+(s[i]||0),0));
 const dataMax=Math.max(0,...tot);
 const mx=Math.max(10,Math.ceil(dataMax/10)*10);
 const gap=.32,bw=(W-pl)/n,barW=bw*(1-gap),inset=(bw-barW)/2;
 const step=1;
 const seriesNames=names||(series.length===1?['Value']:series.map((_,k)=>'Series '+(k+1)));
 let b='';
 labels.forEach((l,i)=>{
  const x=pl+i*bw+inset;
  const segs=[];
  series.forEach((s,k)=>{const v=s[i]||0;if(v>0)segs.push({k,v,h:v/mx*ph})});
  let fromBottom=0;
  segs.forEach((seg,si)=>{
   const h=seg.h,y=pt+ph-(fromBottom+seg.v)/mx*ph;
   const isTop=si===segs.length-1;
   const tipR=isTop?Math.min(5,barW/2,h):0;
   const fill=colors[seg.k];
   const attrs=' class="ch-bar" data-i="'+i+'" data-k="'+seg.k+'" fill="'+fill+'"';
   if(tipR>0)b+='<path'+attrs+' d="'+roundTopBar(x,y,barW,h,tipR)+'"></path>';
   else b+='<rect'+attrs+' x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+h.toFixed(1)+'"></rect>';
   fromBottom+=seg.v;
  });
  if(i%step===0)b+='<text x="'+(pl+i*bw+bw/2).toFixed(1)+'" y="'+(H-7)+'" text-anchor="middle" class="ax" font-size="8">'+l+'</text>';
 });
 const baseY=pt+ph;
 b+='<line class="ch-base" x1="'+pl+'" x2="'+W+'" y1="'+baseY+'" y2="'+baseY+'"/>';
 const legend='<div class="lg lg-bars">'+seriesNames.map((nm,k)=>'<span class="lg-item"><i style="background:'+colors[k]+'"></i>'+esc(nm)+'</span>').join('')+'</div>';
 const payload=esc(JSON.stringify({labels:labels,names:seriesNames,colors:colors,series:series,totalLabel:'Total'}));
 return '<div class="ch-wrap ch-wrap-bars" data-ch="'+payload+'"><svg viewBox="0 0 '+W+' '+H+'" class="ch ch-bars">'+grid(W,pl,pt,ph,mx)+b+'</svg>'+legend+'</div>';
}
function ensureChTip(){
 let t=$('ch-tip');
 if(t)return t;
 t=document.createElement('div');
 t.id='ch-tip';
 t.className='ch-tip hide';
 t.setAttribute('role','tooltip');
 t.innerHTML='<div class="ch-tip-arr" aria-hidden="true"></div><div class="ch-tip-hd"></div><div class="ch-tip-rows"></div><div class="ch-tip-tot"><span></span><b></b></div>';
 document.body.appendChild(t);
 return t;
}
function hideChTip(){
 const t=$('ch-tip');if(!t)return;
 t.classList.add('hide');
 document.querySelectorAll('.ch-bar.is-hot').forEach(el=>el.classList.remove('is-hot'));
 document.querySelectorAll('.ch-bars.is-tipping').forEach(el=>el.classList.remove('is-tipping'));
}
function showChTip(bar){
 const wrap=bar.closest('[data-ch]');if(!wrap)return;
 let data;try{data=JSON.parse(wrap.getAttribute('data-ch')||'')}catch(e){return}
 const i=+bar.getAttribute('data-i'),k=+bar.getAttribute('data-k');
 if(!data||!data.labels||data.labels[i]==null)return;
 const tip=ensureChTip();
 tip.querySelector('.ch-tip-hd').textContent=data.labels[i];
 const rows=tip.querySelector('.ch-tip-rows');
 let total=0;
 rows.innerHTML=(data.names||[]).map((nm,idx)=>{
  const v=((data.series[idx]||[])[i])||0;total+=v;
  return '<div class="ch-tip-row'+(idx===k?' on':'')+'"><i style="background:'+(data.colors[idx]||'#888')+'"></i><span>'+esc(nm)+'</span><b>'+v+'</b></div>';
 }).join('');
 const tot=tip.querySelector('.ch-tip-tot');
 tot.querySelector('span').textContent=data.totalLabel||'Total';
 tot.querySelector('b').textContent=String(total);
 const svg=wrap.querySelector('.ch-bars');
 if(svg)svg.classList.add('is-tipping');
 wrap.querySelectorAll('.ch-bar').forEach(el=>{
  el.classList.toggle('is-hot',+el.getAttribute('data-i')===i);
 });
 tip.classList.remove('hide','ch-tip-left');
 const br=bar.getBoundingClientRect();
 const tr=tip.getBoundingClientRect();
 let left=br.right+12,top=br.top+br.height/2-tr.height/2;
 if(left+tr.width>window.innerWidth-8){left=br.left-tr.width-12;tip.classList.add('ch-tip-left')}
 top=Math.max(8,Math.min(window.innerHeight-tr.height-8,top));
 tip.style.left=Math.round(left)+'px';
 tip.style.top=Math.round(top)+'px';
}
(function(){
 let tipBar=null;
 document.addEventListener('pointerover',e=>{
  const bar=e.target.closest&&e.target.closest('.ch-bar');
  if(!bar||!bar.closest('[data-ch]'))return;
  tipBar=bar;showChTip(bar);
 });
 document.addEventListener('pointermove',e=>{
  const bar=e.target.closest&&e.target.closest('.ch-bar');
  if(bar&&bar.closest('[data-ch]')&&bar!==tipBar){tipBar=bar;showChTip(bar)}
 });
 document.addEventListener('pointerout',e=>{
  const bar=e.target.closest&&e.target.closest('.ch-bar');
  if(!bar||!bar.closest('[data-ch]'))return;
  const to=e.relatedTarget;
  if(to&&to.closest&&(to.closest('.ch-bar')||to.closest('#ch-tip')))return;
  tipBar=null;hideChTip();
 });
 document.addEventListener('scroll',hideChTip,true);
})();
function line(v,labels,c,H,every,W0){H=H||180;const W=W0||560,pl=34,pb=28,pt=12,ph=H-pb-pt,mx=Math.max(4,Math.ceil(Math.max(...v)*1.2)),st=(W-pl-10)/(v.length-1),p=v.map((y,i)=>[pl+i*st,pt+ph-y/mx*ph]),d=p.map((q,i)=>(i?'L':'M')+q[0].toFixed(1)+' '+q[1].toFixed(1)).join(''),g=grad(c,.32,0);
 const xl=labels.map((l,i)=>i%(every||1)?'':'<text x="'+p[i][0].toFixed(1)+'" y="'+(H-8)+'" text-anchor="middle" class="ax">'+l+'</text>').join('');
 return '<div class="ch-wrap"><svg viewBox="0 0 '+W+' '+H+'" class="ch ch-line">'+g[1]+grid(W,pl,pt,ph,mx)+'<path class="ch-area" d="'+d+'L'+p[p.length-1][0]+' '+(pt+ph)+'L'+pl+' '+(pt+ph)+'Z" fill="url(#'+g[0]+')"/><path class="ch-stroke" d="'+d+'" fill="none" stroke="'+c+'" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round"/>'+p.map((q,i)=>'<circle class="ch-dot" cx="'+q[0].toFixed(1)+'" cy="'+q[1].toFixed(1)+'" r="3.6" fill="var(--card)" stroke="'+c+'" stroke-width="2.2"><title>'+labels[i]+': '+v[i]+'</title></circle>').join('')+xl+'</svg></div>'}
function donut(parts,ctr,sub){const R=48,Cc=2*Math.PI*R,T=parts.reduce((a,p)=>a+p[1],0)||1;let off=0,seg='';parts.forEach((p,i)=>{const l=p[1]/T*Cc;seg+='<circle class="dn-seg" data-i="'+i+'" r="'+R+'" cx="60" cy="60" fill="none" stroke="'+(p[2]||C[i])+'" stroke-width="15" stroke-linecap="butt" stroke-dasharray="'+Math.max(0,l-2.2).toFixed(1)+' '+Cc.toFixed(1)+'" stroke-dashoffset="'+(-off).toFixed(1)+'" transform="rotate(-90 60 60)"><title>'+p[0]+': '+p[1]+'</title></circle>';off+=l});
 return '<div class="dn"><svg class="dn-svg" viewBox="0 0 120 120"><circle class="dn-track" r="48" cx="60" cy="60" fill="none" stroke="var(--line)" stroke-width="15"/>'+seg+'<text x="60" y="58" text-anchor="middle" class="dc">'+ctr+'</text><text x="60" y="74" text-anchor="middle" class="ax">'+(sub||'')+'</text></svg><ul class="lg2">'+parts.map((p,i)=>'<li class="lg2-item" data-i="'+i+'"><i style="background:'+(p[2]||C[i])+'"></i><span>'+p[0]+'</span><b>'+p[1]+'</b></li>').join('')+'</ul></div>'}
function hb(items,fmt){const mx=Math.max(...items.map(i=>i[1]))||1;return '<div class="hb">'+items.map((i,k)=>{const c=i[2]||EC[i[0]]||C[k%6];return '<div class="hb-row"><span class="hb-lab">'+i[0]+'</span><div class="tr"><i style="width:'+(i[1]/mx*100)+'%;background:linear-gradient(90deg,'+c+',color-mix(in srgb,'+c+' 55%,#fff))"></i></div><b class="hb-val">'+(fmt?fmt(i[1]):i[1])+'</b></div>'}).join('')+'</div>'}
const KI=[[/lock/i,'lock'],[/approv|pending/i,'approve'],[/fail|error|expired/i,'alert'],[/queue|wait|time|duration|average|longest|session|window/i,'clock'],[/succe|health|sync|deliver|active|enabled/i,'approve'],[/team/i,'teams'],[/user|member|people/i,'users'],[/pull/i,'pr'],[/repo/i,'repo'],[/branch/i,'branch'],[/module/i,'box'],[/workspace|environment|prod/i,'layers'],[/state|size|backend/i,'db'],[/variable|sensitive/i,'sliders'],[/drift|resource/i,'activity'],[/role|permission|polic|strict/i,'shield'],[/token|api|call/i,'code'],[/aws|account|key/i,'key'],[/notif|channel|sent/i,'bell'],[/event|audit|admin/i,'clip'],[/runner/i,'activity'],[/run|plan|apply|applies|total/i,'zap']];
const kic=l=>{for(const k of KI)if(k[0].test(l))return k[1];return 'activity'};
const ctColor=(k,i)=>{const x=k[3];if(typeof x==='string'&&(x.startsWith('var(')||x.startsWith('#')||x.startsWith('rgb')))return x;return k[4]||C[i%6]};
/* Count strips (Users / Active / Invited …) removed from all pages */
const counts=_=>'';
const kp=counts;
const cd=(t,s,h,x,extra)=>'<div class="card chart-card'+(x?' '+x:'')+'"><div class="card-hd"><div><h3>'+t+'</h3>'+(s?'<p class="cs">'+s+'</p>':'')+'</div>'+(extra||'')+'</div><div class="card-bd">'+h+'</div></div>';
const rw=(cols,...c)=>'<div class="grid" style="grid-template-columns:'+cols+'">'+c.join('')+'</div>';
const WD=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],H12=['6am','7','8','9','10','11','12pm','1','2','3','4','5'];
window.__ch={kp,counts,cd,rw,hb,donut,vbars,line,C,I};
const D={
'Approvals':{d:'Applies and destroys that are waiting for an admin, plus recent decisions.',c:['Run ID','Action','Environment','Branch','Requested by','Requested','Required','Decision'],r:[]},
'Queue':{d:'Runs waiting for an environment lock. They start automatically in order.',c:['#','Run ID','Action','Environment','Branch','Triggered by','Waiting on','ETA'],r:[]},
'Repositories':{d:'Bitbucket repositories connected to terraplan.',a:['Add repository'],c:['Repository','Workspace','Default branch','Terraform dir','Environments','Webhook','Last synced'],r:[]},
'Branches':{d:'Branches with recent plans or applies.',c:['Branch','Repository','Author','Last commit','Last run','Result'],r:[]},
'Pull requests':{d:'Open pull requests and the plan terraplan posted on them.',c:['PR','Title','Repository','Branch','Author','Plan','Updated'],r:[]},
'Modules':{d:'Shared Terraform modules and where they are used.',a:['Add module'],c:['Module','Source','Version','Used by','Updated'],r:[]},
'Workspaces':{d:'One workspace per repository and environment.',a:['Create workspace'],c:['Workspace','Environment','Repository','Terraform','AWS account','State lock','Last run','Drift'],r:[]},
'State files':{d:'Remote state stored in S3 with DynamoDB locking.',c:['State key','Backend','Serial','Resources','Size','Last modified','Lock'],r:[]},
'Variables':{d:'Workspace and environment variables. Sensitive values are always hidden.',a:['Add variable'],c:['Key','Value','Workspace','Type','Sensitive','Updated'],r:[]},
'Drift detection':{d:'Scheduled plans that compare real infrastructure with the code.',a:['Run drift check'],c:['Workspace','Last check','Result','Drifted resources','Details'],r:[]},
'Users':{d:'Invite people, assign roles per environment, and disable accounts.',a:['Invite user'],c:['Name','Email','Role','Status','Last active'],r:[]},
'Teams':{d:'Teams decide which repositories and environments people can use.',a:['Create team'],c:['Team','Members','Repositories','Environments','Default role'],r:[]},
'Roles and permissions':{d:'What each role can do. Prod applies always need approval.',c:['Permission','Viewer','Planner','Applier','Admin'],r:[['View runs and plans','y','y','y','y'],['Run plan on dev, qa, uat','n','y','y','y'],['Run plan on staging, prod','n','n','y','y'],['Apply on dev, qa','n','n','y','y'],['Apply on uat, staging','n','n','y','y'],['Apply on prod (needs approval)','n','n','n','y'],['Destroy (needs approval)','n','n','n','y'],['Approve runs','n','n','n','y'],['Break a state lock','n','n','n','y'],['Manage users, teams and roles','n','n','n','y'],['Manage integrations','n','n','n','y'],['View audit log','n','n','y','y']]},
'Approval policies':{d:'Rules that decide who must approve each action, per environment.',a:['Edit policies'],c:['Environment','Plan','Apply','Destroy','Approvers','Allowed hours','Lock timeout'],r:[]},
'Notifications':{d:'Slack/Teams webhooks via SLACK_WEBHOOK_URL and TEAMS_WEBHOOK_URL. Events controlled by NOTIFY_ON (waiting_approval, failed, succeeded, …). Bitbucket PR comments are separate.',a:['Add channel'],c:['Channel','Type','Events','Target','Status'],r:[]},
'API tokens':{d:'Tokens for CI and scripts. They have the same limits as the person who made them.',a:['Create token'],c:['Name','Created by','Scope','Last used','Expires','Status'],r:[]},
'Audit log':{d:'Every action, with who, where and when. Exportable for compliance.',a:['Export CSV'],c:['Time','Actor','Action','Target','Environment','IP','Result'],r:[]}
};
const GP={'Dashboard':'Overview','Repositories':'Code','Branches':'Code','Pull requests':'Code','Modules':'Code','Workspaces':'Environments','State files':'Environments','Drift detection':'Environments','Environments':'Admin','Variables':'Admin','Workers':'Admin','Integration':'Admin','Terraform Automate':'Terraform'};
const tdc=h=>'<div class="tdc">'+h+'</div>';
function attachPager(tw,opts){
 if(!tw||tw.__pager)return tw&&tw.__pager;
 const table=tw.querySelector('table');if(!table)return null;
 attachTableSort(table);
 const tbody=table.tBodies[0]||table.querySelector('tbody');if(!tbody)return null;
 let all=[...tbody.querySelectorAll('tr')];
 const pageSize=(opts&&opts.pageSize)||PAGE_SIZE;
 let page=1,filter='';
 let bar=tw.nextElementSibling;
 if(!bar||!bar.classList.contains('aws-pager-wrap')){
  bar=document.createElement('div');bar.className='aws-pager-wrap';
  tw.insertAdjacentElement('afterend',bar);
 }
 const visible=()=>{
  if(!filter)return all;
  const q=filter.toLowerCase();
  return all.filter(tr=>tr.textContent.toLowerCase().includes(q));
 };
 const render=()=>{
  all=[...tbody.querySelectorAll('tr')];
  const rows=visible();
  const pages=Math.max(1,Math.ceil(rows.length/pageSize));
  if(page>pages)page=pages;
  all.forEach(tr=>tr.style.display='none');
  const start=(page-1)*pageSize;
  rows.slice(start,start+pageSize).forEach(tr=>tr.style.display='');
  bar.innerHTML=pageBar(page,pages);
 };
 bar.onclick=e=>{
  const b=e.target.closest('[data-pg]');if(!b||b.disabled)return;
  const v=b.dataset.pg;
  const rows=visible();const pages=Math.max(1,Math.ceil(rows.length/pageSize));
  if(v==='prev')page=Math.max(1,page-1);
  else if(v==='next')page=Math.min(pages,page+1);
  else page=+v||1;
  render();
 };
 const api={render,setFilter(v){filter=v||'';page=1;render()},refresh(){page=1;render()},setPage(p){page=p;render()}};
 tw.__pager=api;render();return api;
}
function attachItemPager(wrap,opts){
 if(!wrap||wrap.__pager)return wrap&&wrap.__pager;
 const sel=(opts&&opts.item)||'li';
 let all=[...wrap.querySelectorAll(sel)];
 if(!all.length)return null;
 const pageSize=(opts&&opts.pageSize)||PAGE_SIZE;
 let page=1;
 let bar=wrap.nextElementSibling;
 if(!bar||!bar.classList.contains('aws-pager-wrap')){
  bar=document.createElement('div');bar.className='aws-pager-wrap';
  wrap.insertAdjacentElement('afterend',bar);
 }
 const render=()=>{
  all=[...wrap.querySelectorAll(sel)];
  const pages=Math.max(1,Math.ceil(all.length/pageSize));
  if(page>pages)page=pages;
  const start=(page-1)*pageSize;
  all.forEach((el,i)=>{el.style.display=(i>=start&&i<start+pageSize)?'':'none'});
  bar.innerHTML=pageBar(page,pages);
 };
 bar.onclick=e=>{
  const b=e.target.closest('[data-pg]');if(!b||b.disabled)return;
  const v=b.dataset.pg;
  const pages=Math.max(1,Math.ceil(all.length/pageSize));
  if(v==='prev')page=Math.max(1,page-1);
  else if(v==='next')page=Math.min(pages,page+1);
  else page=+v||1;
  render();
 };
 const api={render,refresh(){page=1;render()}};
 wrap.__pager=api;render();return api;
}
function wireAllPagers(root){
 (root||document).querySelectorAll('.tw').forEach(tw=>{
  if(tw.__pager){tw.__pager.refresh();return}
  /* Skip All runs body — draw() owns that pager */
  if(tw.querySelector('#tb')){attachTableSort(tw.querySelector('table'));return}
  if(tw.id==='dash-recent'||tw.id==='dash-feed'){attachPager(tw,{pageSize:5});return}
  attachPager(tw);
 });
 (root||document).querySelectorAll('table.tbl').forEach(attachTableSort);
}
const tbl=(c,r)=>{const hf=Object.assign({},HF);const fc=(v,h)=>{if(typeof v==='string'&&!/^(ok|bad|warn|run|mut|tag|ln|act|bar|pb):/.test(v)&&v!=='y'&&v!=='n'&&!v.startsWith('html:')){const f=hf[h];if(f&&v!=='–'&&v!=='—')return F[f](v);if(h==='Email')return '<span class="sub">'+esc(v)+'</span>'}return cell(v)};
 /* Same structure as All runs: bare table.tbl inside a .tw wrapper; .tdc locks row height. */
 const th=x=>x==='__chk'?'<th class="chk-th"><input type="checkbox" id="u-chk-all" aria-label="Select all"></th>':sortSkipLabel(x)?'<th>'+esc(x)+'</th>':'<th class="th-s" data-col="'+esc(x)+'"><button type="button" class="th-btn">'+esc(x)+SORT_ICO+'</button></th>';
 const td=(v,h,j)=>'<td'+(h==='__chk'?' class="chk-td"':'')+(h==='__chk'||sortSkipLabel(h)?'':' data-sv="'+esc(sortSeed(v))+'"')+'>'+tdc(fc(v,h))+'</td>';
 return '<table class="tbl"><thead><tr>'+c.map(th).join('')+'</tr></thead><tbody>'+r.map((x,ri)=>{
  const row=Array.isArray(x)?{cells:x}:x||{cells:[]};
  const cells=row.cells||[];
  const cls=row.className?' class="'+esc(row.className)+'"':'';
  return '<tr data-r="'+ri+'"'+cls+'>'+cells.map((v,j)=>td(v,c[j],j)).join('')+'</tr>';
 }).join('')+'</tbody></table>'};
const NI={'Dashboard':'dash','Live locks':'lock','Terraform Plan':'list','Terraform Automate':'zap','Repositories':'repo','Branches':'branch','Pull requests':'pr','Modules':'box','Workspaces':'layers','State files':'db','Variables':'sliders','Drift detection':'activity','Users':'users','Teams':'teams','Connect Repositories':'plug','Workers':'server','Integration':'key','Environments':'layers','Notifications':'bell','Audit log':'clip'};
const BI={Add:'plus',Create:'plus',Invite:'plus',Export:'download',Run:'play',Test:'activity',Edit:'edit',Sync:'refresh',Open:'repo',Force:'unlock'};
const bt=(t,p)=>{const k=BI[t.split(' ')[0]];return '<button class="'+(p?'b1':'b2')+'" data-t="'+esc(t)+'">'+(k?I(k,16):'')+esc(t)+'</button>'}
const INFO_L=' <a class="info page-info" href="#" title="Info">Info</a>';
const hd=(n,t,d,a)=>'<div class="hd"><span class="pi">'+I(NI[n]||'dash',24)+'</span><div class="ht"><h2>'+t+INFO_L+'</h2><p class="vdsc">'+esc(d)+'</p></div><div class="act">'+(a||'')+'</div></div>';
const TOP={};
/** Dashboard keeps custom cartoons; all other pages use Flaticon stickers (https://www.flaticon.com/stickers-packs). */
const HERO={
'Dashboard':{
 title:'Welcome to terraplan',sub:'Plan and apply infrastructure safely — with locks, approvals, and a clear audit trail.',
 opts:[
  {img:'welcome-plan.jpg',alt:'Plan diff with add change and remove markers',h:'Run a plan in seconds',p:'Pick a repository, branch and environment. terraplan clones, assumes the role, and shows the diff — without changing anything.',acts:[['b1','Run terraform','zap','Run plan']]},
  {img:'welcome-apply.jpg',alt:'Apply behind approval lock and checklist',h:'Apply with full controls',p:'Apply the exact saved plan file. Prod applies and every destroy wait for approval. Dangerous flags are blocked and plan output is scanned for secrets.',acts:[['b2','Run terraform','play','Run apply'],['b2','go:Live locks','lock','View locks']]}
 ],
 ov:{title:'Service overview',cs:'Viewing data from your connected environments',btn:['Terraform Plan','list','View all runs'],metrics:'runs'},
 ex:{img:'stickers/explore.png',alt:'Idea sticker from Flaticon',h:'Explore terraplan',p:'Walk through plan → approve → apply on a non-prod environment. Learn locks, approvals and live logs.',go:['Plans','Start tutorial']}
},
'Live locks':{
 title:'Environment locks',sub:'One apply or destroy at a time per environment. Queued runs wait until the lock frees.',
 opts:[{img:'stickers/locks.png',alt:'Padlock sticker from Flaticon',h:'See who holds each environment',p:'Live lock status streams over WebSocket. Start a run when an environment is free, or join the queue.',acts:[['b1','Run terraform','play','Run terraform'],['b2','go:Queue','clock','Open queue']]}],
 ov:{title:'Lock overview',cs:'Exclusive Postgres locks per environment',btn:['Queue','clock','View queue'],metrics:'locks'},
 ex:{img:'stickers/queue.png',alt:'Watch sticker from Flaticon',h:'Learn lock queues',p:'Watch how queued applies start automatically when a lock frees.',go:['Queue','View queue']}
},
'All runs':{
 title:'Terraform Plan',sub:'Every plan, apply and destroy across all environments — with status, actor and timing.',
 opts:[{img:'stickers/runs.png',alt:'Monitoring sticker from Flaticon',h:'Follow every run end to end',p:'Filter by action or environment. Open a run for live logs, the saved plan file and the audit trail.',acts:[['b1','Run terraform','zap','Run terraform']]}],
 ov:{title:'Terraform overview',cs:'Last 24 hours across environments',btn:['Live locks','lock','View locks'],metrics:'runs'},
 ex:{img:'stickers/explore.png',alt:'Idea sticker from Flaticon',h:'Try a safe plan first',p:'Start with a non-prod plan before you apply anything.',go:['Live locks','Open locks']}
},
'Plans':{
 title:'Plan runs',sub:'Plans show what would change. They never touch real infrastructure.',
 opts:[{img:'stickers/plans.png',alt:'Coding sticker from Flaticon',h:'Preview the diff safely',p:'Clone the branch, assume the env role and render +/~− markers. Nothing is applied until you say so.',acts:[['b1','Run terraform','plan','Run plan']]}],
 ov:{title:'Plan overview',cs:'Plan-only runs in this list',btn:['All runs','list','All runs'],metrics:'plans'},
 ex:{img:'stickers/prs.png',alt:'Bar chart sticker from Flaticon',h:'Plan from a pull request',p:'Open PRs can queue a plan and post the result as a comment.',go:['Pull requests','Open PRs']}
},
'Applies':{
 title:'Apply runs',sub:'Applies change real infrastructure. Prod applies need approval.',
 opts:[{img:'stickers/applies.png',alt:'Launch sticker from Flaticon',h:'Apply the exact saved plan',p:'Replays the stored plan file. Dangerous Terraform flags are denied and output is scanned for secrets.',acts:[['b1','Run terraform','play','Run apply'],['b2','go:Live locks','lock','Live locks']]}],
 ov:{title:'Apply overview',cs:'Apply runs in this list',btn:['Live locks','lock','View locks'],metrics:'applies'},
 ex:{img:'stickers/audit.png',alt:'Clipboard sticker from Flaticon',h:'Every apply is logged',p:'Check the audit log for a full record of who applied what and when.',go:['Audit log','Audit log']}
},
'Destroys':{
 title:'Destroy runs',sub:'Destroys remove infrastructure and always need an admin.',
 opts:[{img:'stickers/destroys.png',alt:'Trash bin sticker from Flaticon',h:'Tear down with a safety net',p:'Every destroy takes an exclusive lock and leaves a full audit trail.',acts:[['b1','Run terraform','trash','Run destroy'],['b2','go:Live locks','lock','Live locks']]}],
 ov:{title:'Destroy overview',cs:'Destroy runs in this list',btn:['Audit log','clip','Audit log'],metrics:'destroys'},
 ex:{img:'stickers/audit.png',alt:'Clipboard sticker from Flaticon',h:'Every destroy is logged',p:'Check the audit log for the full record of approvals and execution.',go:['Audit log','Audit log']}
},
'Approvals':{
 title:'Waiting approvals',sub:'Applies and destroys that need an admin before they can take a lock.',
 opts:[{img:'stickers/checklist.png',alt:'Checklist sticker from Flaticon',h:'Approve or deny with context',p:'See who requested it, which environment and the plan summary before you decide.',acts:[['b2','go:Applies','zap','Applies'],['b2','go:Destroys','trash','Destroys']]}],
 ov:{title:'Approval overview',cs:'Pending and recent decisions',btn:['Audit log','clip','Audit log'],metrics:'approvals'},
 ex:{img:'stickers/policies.png',alt:'Policy sticker from Flaticon',h:'Tune who can approve',p:'Set required approvers and allowed hours per environment.',go:['Approval policies','Policies']}
},
'Queue':{
 title:'Run queue',sub:'Runs waiting for an environment lock or for approval to clear.',
 opts:[{img:'stickers/queue.png',alt:'Watch sticker from Flaticon',h:'See what starts next',p:'When a lock frees or an approval lands, the next queued run starts automatically.',acts:[['b2','go:Live locks','lock','Live locks'],['b2','go:All runs','list','All runs']]}],
 ov:{title:'Queue overview',cs:'Waiting on lock or approval',btn:['Live locks','lock','Locks'],metrics:'queue'},
 ex:{img:'stickers/lock2.png',alt:'Lock sticker from Flaticon',h:'Understand exclusive locks',p:'Only one apply/destroy holds an environment at a time.',go:['Live locks','Open locks']}
},
'Repositories':{
 title:'Repositories',sub:'Bitbucket repositories connected to terraplan for plan and apply.',
 opts:[{img:'stickers/repos.png',alt:'Secure folder sticker from Flaticon',h:'Connect the repos you run',p:'Each repository maps to Terraform dirs and environments. Webhooks keep PRs in sync.',acts:[['b2','go:Connect Repositories','plug','Connect Repos'],['b2','go:Pull requests','pr','Pull requests']]}],
 ov:{title:'Repo overview',cs:'Connected workspace repositories',btn:['Branches','branch','Branches'],metrics:'repos'},
 ex:{img:'stickers/bitbucket.png',alt:'Download sticker from Flaticon',h:'Wire up credentials first',p:'Add a credential profile for Bitbucket, GitHub or GitLab under Connect Repositories.',go:['Connect Repositories','Connect']}
},
'Branches':{
 title:'Branches',sub:'Active branches and tip commits from your connected workspace.',
 opts:[{img:'stickers/branches.png',alt:'Network sticker from Flaticon',h:'Pick a branch to plan',p:'Run a plan against any tip commit. Ahead/behind hints help you choose the right line of work.',acts:[['b1','Run terraform','zap','Run plan'],['b2','go:Pull requests','pr','Pull requests']]}],
 ov:{title:'Branch overview',cs:'Branches with recent run activity',btn:['Repositories','repo','Repos'],metrics:'branches'},
 ex:{img:'stickers/prs.png',alt:'Bar chart sticker from Flaticon',h:'Prefer planning from a PR',p:'PR plans post results as comments for reviewers.',go:['Pull requests','Open PRs']}
},
'Pull requests':{
 title:'Pull requests',sub:'Open PRs from Bitbucket. Plan posts a comment when finished.',
 opts:[{img:'stickers/prs.png',alt:'Bar chart sticker from Flaticon',h:'Plan before you merge',p:'Queue a plan on the source branch. Results land as a PR comment with the diff summary.',acts:[['b2','go:Plans','plan','View plans'],['b2','go:Connect Repositories','plug','Webhooks']]}],
 ov:{title:'PR overview',cs:'Open pull requests with plan status',btn:['Plans','plan','Plans'],metrics:'prs'},
 ex:{img:'stickers/plans.png',alt:'Coding sticker from Flaticon',h:'Auto-plan on PR update',p:'Enable auto-plan under Connect Repositories for every PR push.',go:['Connect Repositories','Configure']}
},
'Modules':{
 title:'Modules',sub:'Shared Terraform modules and which workspaces consume them.',
 opts:[{img:'stickers/modules.png',alt:'Embedded modules sticker from Flaticon',h:'Track module usage',p:'See version skew across workspaces and which modules need an update.',acts:[['b2','go:Workspaces','layers','Workspaces']]}],
 ov:{title:'Module overview',cs:'Shared modules in use',btn:['Workspaces','layers','Workspaces'],metrics:'modules'},
 ex:{img:'stickers/drift.png',alt:'Monitoring sticker from Flaticon',h:'Watch for outdated modules',p:'Drift checks catch workspaces still on old module versions.',go:['Drift detection','Drift']}
},
'Workspaces':{
 title:'Workspaces',sub:'One workspace per repository and environment.',
 opts:[{img:'stickers/workspaces.png',alt:'Cloud storage sticker from Flaticon',h:'Map repos to environments',p:'Each workspace pins Terraform version, backend and the last run — plus lock and drift state.',acts:[['b2','go:Environments','layers','Environments'],['b2','go:State files','db','State files']]}],
 ov:{title:'Workspace overview',cs:'Across all environments',btn:['Drift detection','activity','Drift'],metrics:'workspaces'},
 ex:{img:'stickers/state.png',alt:'Database sticker from Flaticon',h:'Inspect state size next',p:'Largest state files often need the most careful applies.',go:['State files','State files']}
},
'State files':{
 title:'State files',sub:'Remote state size, locks and the S3 + DynamoDB backend.',
 opts:[{img:'stickers/state.png',alt:'Database sticker from Flaticon',h:'Know what the backend holds',p:'State lives in S3 with DynamoDB locks. Spot oversized states before a risky apply.',acts:[['b2','go:Workspaces','layers','Workspaces'],['b2','go:Live locks','lock','Locks']]}],
 ov:{title:'State overview',cs:'Remote backend footprint',btn:['Workspaces','layers','Workspaces'],metrics:'state'},
 ex:{img:'stickers/variables.png',alt:'Password sticker from Flaticon',h:'Pair with variables',p:'Sensitive values stay masked in the UI and logs.',go:['Variables','Variables']}
},
'Variables':{
 title:'Variables',sub:'Environments, setup actions and (later) more variable tables — all in one admin place.',
 opts:[{img:'stickers/variables.png',alt:'Password sticker from Flaticon',h:'Start with environments',p:'Add each environment once. Actions let you save commands and run them later with checkboxes or extra input.',acts:[['b1','data-env:add','plus','Add environment']]}],
 ov:{title:'Variables overview',cs:'Environments and saved actions',btn:['Terraform Plan','list','Runs'],metrics:'variables'},
 ex:{img:'stickers/environments.png',alt:'Cloud sticker from Flaticon',h:'Pin AWS per environment',p:'Each environment carries repo, backend and IAM role. No static keys.',go:['Connect Repositories','Connect Repositories']}
},
'Drift detection':{
 title:'Drift detection',sub:'Scheduled plans that compare real infrastructure with the code.',
 opts:[{img:'stickers/drift.png',alt:'Monitoring sticker from Flaticon',h:'Catch silent changes',p:'Hourly plans highlight resources that drifted from the last apply so you can re-plan safely.',acts:[['b2','go:Plans','plan','Run plan'],['b2','go:Workspaces','layers','Workspaces']]}],
 ov:{title:'Drift overview',cs:'Latest scheduled checks',btn:['Workspaces','layers','Workspaces'],metrics:'drift'},
 ex:{img:'stickers/plans.png',alt:'Coding sticker from Flaticon',h:'Fix drift with a plan',p:'Queue a plan on the drifted workspace, review, then apply.',go:['Plans','Plans']}
},
'Users':{
 title:'Users',sub:'Manage people and their environment access.',
 opts:[{img:'stickers/users.png',alt:'Family sticker from Flaticon',h:'Assign the right roles',p:'Assignments are per environment — Viewer, Planner, Applier or Admin — so prod stays locked down.',acts:[['b2','go:Users','teams','Groups']]}],
 ov:{title:'User overview',cs:'Accounts in this workspace',btn:['Audit log','clip','Audit log'],metrics:'users'},
 ex:{img:'stickers/audit.png',alt:'Clipboard sticker from Flaticon',h:'Track every access change',p:'Every role assignment and invite is recorded in the audit log.',go:['Audit log','Audit log']}
},
'Teams':{
 title:'Teams',sub:'Teams decide which repositories and environments people can use.',
 opts:[{img:'stickers/teams.png',alt:'Team spirit sticker from Flaticon',h:'Group access by squad',p:'Platform, Backend, Data and more — each team covers a slice of repos and environments.',acts:[['b2','go:Users','users','Users'],['b2','go:Repositories','repo','Repos']]}],
 ov:{title:'Team overview',cs:'Coverage across repos and envs',btn:['Users','users','Users'],metrics:'teams'},
 ex:{img:'stickers/roles.png',alt:'Shield sticker from Flaticon',h:'Default roles per team',p:'New members inherit the team default until you override.',go:['Roles and permissions','Roles']}
},
'Roles and permissions':{
 title:'Roles and permissions',sub:'What Viewer, Planner, Applier and Admin can do in each environment.',
 opts:[{img:'stickers/roles.png',alt:'Shield sticker from Flaticon',h:'Least privilege by default',p:'Plans are open to planners; applies and destroys climb the ladder. Prod apply stays Admin-gated.',acts:[['b2','go:Approval policies','policy','Policies'],['b2','go:Users','users','Users']]}],
 ov:{title:'Permission overview',cs:'Actions unlocked per role',btn:['Users','users','Users'],metrics:'roles'},
 ex:{img:'stickers/policies.png',alt:'Policy sticker from Flaticon',h:'Layer approval policies',p:'Combine roles with required approvers and change windows.',go:['Approval policies','Policies']}
},
'Approval policies':{
 title:'Approval policies',sub:'Required approvers, allowed hours and lock timeouts per environment.',
 opts:[{img:'stickers/policies.png',alt:'Policy sticker from Flaticon',h:'Set the rules once',p:'Prod can require two approvers and a weekday window. Lock timeouts stop abandoned applies.',acts:[['b2','go:Environments','layers','Environments'],['b2','go:Approvals','approve','Approvals']]}],
 ov:{title:'Policy overview',cs:'Per-environment gates',btn:['Environments','layers','Environments'],metrics:'policies'},
 ex:{img:'stickers/approvals.png',alt:'Verification sticker from Flaticon',h:'See the queue of decisions',p:'Pending applies and destroys show up under Approvals.',go:['Approvals','Approvals']}
},
'Workers':{
 title:'Workers',sub:'Spin up a cloud VM, Docker container or Kubernetes pod for each terraform run, then tear it down.',
 opts:[{img:'stickers/workers.png',alt:'Workers sticker from Flaticon',h:'Agents, not the control plane',p:'Like Jenkins master and slave: if no worker is enabled, plan/apply/destroy run on this Terraplan host. Enable one worker type to isolate every run.',acts:[['b1','data-ig:setup-server','server','Setup Server']]}],
 ov:{title:'Worker overview',cs:'Only one worker is active at a time',btn:['Terraform Plan','list','Runs'],metrics:'integrations'},
 ex:{img:'stickers/connect-repos.png',alt:'Internet connection sticker from Flaticon',h:'Test before you enable',p:'Test provisions a throwaway worker, runs a health check, then terminates it.',go:['Audit log','Audit log']}
},
'Integration':{
 title:'Integration',sub:'Add AWS, Docker and Kubernetes credentials so Terraplan can create ephemeral workers.',
 opts:[{img:'stickers/connect-repos.png',alt:'Internet connection sticker from Flaticon',h:'Keys first, then workers',p:'Copy the required IAM / Docker / ClusterRole JSON, attach it to the account, then paste credentials here. Setup of VMs and pods lives under Workers.',acts:[['b1','data-ic:add-aws','key','Add AWS credentials'],['b2','go:Workers','server','Workers']]}],
 ov:{title:'Credentials overview',cs:'One profile per cloud or cluster',btn:['Workers','server','Workers'],metrics:'integrations'},
 ex:{img:'stickers/workers.png',alt:'Workers sticker from Flaticon',h:'Then isolate each run',p:'Enable a Server, Docker or Kubernetes worker after credentials are in place.',go:['Workers','Workers']}
},
'Connect Repositories':{
 title:'Connect Repositories',sub:'Add remote repository credentials and wire repositories for plan and apply.',
 opts:[{img:'stickers/connect-repos.png',alt:'Internet connection sticker from Flaticon',h:'Connect once, run everywhere',p:'Add a credential profile for any provider, then attach repositories to environments. Plans run on every push.',acts:[['b2','go:Repositories','repo','Repos'],['b2','go:Pull requests','pr','Pull requests']]}],
 ov:{title:'Repositories overview',cs:'Credential profiles and connected repos',btn:['Repositories','repo','Repos'],metrics:'bitbucket'},
 ex:{img:'stickers/notifications.png',alt:'Alarm bell sticker from Flaticon',h:'Also notify Slack or Teams',p:'Ship run outcomes to your chat channels.',go:['Notifications','Notifications']}
},
'Environments':{
 title:'Environments',sub:'Repo, Terraform dir, backend, AWS account and IAM role per environment.',
 opts:[{img:'stickers/environments.png',alt:'Cloud sticker from Flaticon',h:'STS AssumeRole only',p:'No static AWS keys. The runner assumes the role you pin per environment, with a pinned Terraform version.',acts:[['b2','go:Workspaces','layers','Workspaces'],['b2','go:Approval policies','policy','Policies']]}],
 ov:{title:'Environment overview',cs:'Configured AWS accounts and roles',btn:['Live locks','lock','Locks'],metrics:'environments'},
 ex:{img:'stickers/state.png',alt:'Database sticker from Flaticon',h:'Confirm backends next',p:'Each env points at an S3 state key and DynamoDB lock table.',go:['State files','State']}
},
'Notifications':{
 title:'Notifications',sub:'Slack, Teams and in-app alerts for run outcomes.',
 opts:[{img:'stickers/notifications.png',alt:'Alarm bell sticker from Flaticon',h:'Get pinged when it matters',p:'Route succeeded, failed and waiting-approval events to the channels your team already watches.',acts:[['b2','go:Terraform Plan','list','Runs'],['b2','go:Audit log','clip','Audit log']]}],
 ov:{title:'Notification overview',cs:'Channels and delivery today',btn:['Audit log','clip','Audit'],metrics:'notifications'},
 ex:{img:'stickers/audit.png',alt:'Clipboard sticker from Flaticon',h:'Keep an audit trail too',p:'Every admin action is logged with actor, IP and result.',go:['Audit log','Audit log']}
},
'Audit log':{
 title:'Audit log',sub:'Every admin and auth action — who, where, when and the result.',
 opts:[{img:'stickers/audit.png',alt:'Clipboard sticker from Flaticon',h:'Export when you need evidence',p:'Filter by actor or environment, then download CSV for compliance reviews.',acts:[['b1','Export CSV','download','Export CSV'],['b2','go:Users','users','Users']]}],
 ov:{title:'Audit overview',cs:'Events from today',btn:['Users','users','Users'],metrics:'audit'},
 ex:{img:'stickers/notifications.png',alt:'Alarm bell sticker from Flaticon',h:'Pair with live alerts',p:'Critical failures can also fan out to Slack or Teams.',go:['Notifications','Notifications']}
}
};
function heroMetrics(key){
 const rr=window.__runs||[];
 const nRun=rr.length,nPlan=rr.filter(r=>r.a==='plan').length,nApply=rr.filter(r=>r.a==='apply').length,nWait=rr.filter(r=>r.s==='waiting approval').length,nFail=rr.filter(r=>r.s==='failed').length;
 const nDes=rr.filter(r=>r.a==='destroy').length,nQue=rr.filter(r=>r.s==='queued'||r.s==='waiting approval').length;
 const locks=(typeof LOCK_ROWS!=='undefined'&&LOCK_ROWS)||[],locked=locks.filter(r=>r.held).length,waiting=locks.reduce((n,r)=>n+(r.waiting||[]).length,0);
 const map={
  runs:[['Runs',nRun],['Plans',nPlan],['Applies',nApply],['Waiting approval',nWait],['Failed',nFail]],
  plans:[['Plans',nPlan],['Succeeded',rr.filter(r=>r.a==='plan'&&r.s==='succeeded').length],['Failed',nFail],['Waiting',nWait]],
  applies:[['Applies',nApply],['Waiting approval',nWait],['Failed',rr.filter(r=>r.a==='apply'&&r.s==='failed').length],['Locks held',locked]],
  destroys:[['Destroys',nDes],['Waiting approval',nWait],['Failed',rr.filter(r=>r.a==='destroy'&&r.s==='failed').length],['Needs admin',nWait]],
  approvals:[['Waiting',nWait],['Applies',nApply],['Destroys',nDes],['Running',rr.filter(r=>r.s==='running').length]],
  queue:[['In queue',nQue],['On lock',waiting],['On approval',nWait],['Running',rr.filter(r=>r.s==='running').length]],
  locks:[['Locked',locked],['Free',Math.max(0,(locks.length||0)-locked)],['In queue',waiting],['Envs',locks.length||0]],
  repos:[['Repos',(typeof rtSavedRepos==='function'?rtSavedRepos():[]).length],['Runs',nRun],['Environments',(window.__envsCache||[]).length],['Waiting',nWait]],
  branches:[['Runs',nRun],['Succeeded',rr.filter(r=>r.s==='succeeded').length],['Failed',nFail],['Waiting',nWait]],
  prs:[['Runs',nRun],['Plans',nPlan],['Failed',nFail],['Waiting',nWait]],
  modules:[['Runs',nRun],['Plans',nPlan],['Applies',nApply],['Failed',nFail]],
  workspaces:[['Locked',locked],['In queue',waiting],['Runs',nRun],['Failed',nFail]],
  state:[['Locked',locked],['Runs',nRun],['Failed',nFail],['Waiting',nWait]],
  variables:[['Runs',nRun],['Plans',nPlan],['Applies',nApply],['Failed',nFail]],
  drift:[['Runs',nRun],['Failed',nFail],['Waiting',nWait],['Locked',locked]],
  users:[['Runs',nRun],['Waiting',nWait],['Failed',nFail],['Locked',locked]],
  teams:[['Runs',nRun],['Waiting',nWait],['Failed',nFail],['Locked',locked]],
  roles:[['Runs',nRun],['Waiting',nWait],['Failed',nFail],['Locked',locked]],
  policies:[['Locked',locked],['Waiting',nWait],['Runs',nRun],['Failed',nFail]],
  bitbucket:[['Repos',(typeof rtSavedRepos==='function'?rtSavedRepos():[]).length],['Runs',nRun],['Plans',nPlan],['Failed',nFail]],
  integrations:(()=>{const items=typeof igItems==='function'?igItems():[];const on=items.find(x=>x.enabled);const k=on?(on.kind==='ec2'?'server':on.kind):'';return [['Configs',items.length],['Active',k?k.toUpperCase():'Local'],['Enabled',on?1:0],['Tested',items.filter(x=>x.lastTestOk).length]]})(),
  environments:[['Configured',(window.__envsCache||[]).length],['Locked',locked],['Runs',nRun],['Waiting',nWait]],
  notifications:[['Runs',nRun],['Waiting',nWait],['Failed',nFail],['Succeeded',rr.filter(r=>r.s==='succeeded').length]],
  tokens:[['Runs',nRun],['Waiting',nWait],['Failed',nFail],['Locked',locked]],
  audit:[['Runs',nRun],['Failed',nFail],['Waiting',nWait],['Locked',locked]]
 };
 return map[key]||map.runs;
}
function heroAct(a){
 const[cls,act,ic,label]=a;
 if(String(act).startsWith('go:'))return '<button class="'+cls+'" data-v-go="'+act.slice(3)+'">'+I(ic,16)+label+'</button>';
 if(String(act).startsWith('data-env:'))return '<button class="'+cls+'" data-env="'+act.slice(9)+'">'+I(ic,16)+label+'</button>';
 if(String(act).startsWith('data-ig:')){
  const v=act.slice(8);const kind=v.indexOf('setup-')===0?v.slice(6):'';
  return '<button class="'+cls+'" data-ig="'+(kind?'setup':esc(v))+'"'+(kind?' data-kind="'+esc(kind)+'"':'')+'>'+I(ic,16)+label+'</button>';
 }
 if(String(act).startsWith('data-ic:')){
  const v=act.slice(8);const kind=v.indexOf('add-')===0?v.slice(4):'';
  return '<button class="'+cls+'" data-ic="'+(kind?'add':esc(v))+'"'+(kind?' data-kind="'+esc(kind)+'"':'')+'>'+I(ic,16)+label+'</button>';
 }
 return '<button class="'+cls+'" data-t="'+act+'">'+I(ic,16)+label+'</button>';
}
function illClass(src){return /\.png$|\.jpg$|stickers\//.test(src)?' sticker':''}
const HOW={
'Approvals':[
 {img:'stickers/how-approve.jpg',alt:'Operator and robot celebrating an approved change',h:'Second pair of eyes',p:'Review branch, environment and plan summary before you approve or cancel.'},
 {img:'stickers/how-protect.jpg',alt:'Robot with shield protecting infrastructure',h:'Prod stays gated',p:'Environment policies decide who must approve before a run can take a lock.'},
 {img:'stickers/how-watch.jpg',alt:'Operator reviewing live infrastructure status',h:'Everything is audited',p:'Every decision lands in the audit log with actor, target and result.'}
]
};
/* Dismiss (×) and collapse are both per-page — hiding on one page leaves others visible. */
function howDismissed(page){try{return localStorage.getItem('tp-how-gone:'+(page||'All runs'))==='1'}catch(e){return false}}
function dismissHow(page){try{localStorage.setItem('tp-how-gone:'+(page||'All runs'),'1')}catch(e){}}
function cardOpen(key){try{const v=sessionStorage.getItem(key);return v===null?true:v==='1'}catch(e){return true}}
function setCardOpen(key,on){try{sessionStorage.setItem(key,on?'1':'0')}catch(e){}}
function welcomeDismissed(page){try{return localStorage.getItem('tp-welcome-gone:'+(page||'All runs'))==='1'}catch(e){return false}}
function dismissWelcome(page){try{localStorage.setItem('tp-welcome-gone:'+(page||'All runs'),'1')}catch(e){}}
const CHV='<svg class="card-chv" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function howItWorks(page){
 const pageName=page||'All runs';
 const steps=HOW[page];
 if(!steps||howDismissed(pageName))return '';
 const hKey='tp-how-open:'+pageName;
 const open=cardOpen(hKey);
 return '<div class="card how'+(open?'':' collapsed')+'" id="how-card" data-how-key="'+esc(hKey)+'" data-how-page="'+esc(pageName)+'">'
  +'<div class="how-hd">'
  +'<button type="button" class="how-tog card-tog" id="how-tog" aria-expanded="'+(open?'true':'false')+'">'+CHV+'<span>How it works</span></button>'
  +'<button type="button" class="how-x card-x" id="how-x" aria-label="Dismiss">×</button>'
  +'</div>'
  +'<div class="how-bd" id="how-bd">'
  +'<div class="how-grid">'
  +steps.map(function(s){
   return '<div class="how-col"><div class="how-ill-wrap"><img class="how-ill" src="/illustrations/'+s.img+'" alt="'+esc(s.alt)+'" width="160" height="160" loading="lazy"></div>'
    +'<b>'+esc(s.h)+'</b><p>'+esc(s.p)+'</p></div>';
  }).join('')
  +'</div></div></div>';
}
function heroCards(page){
 const cfg=HERO[page]||HERO.Dashboard;
 const opts=cfg.opts||[];
 const pageName=page||'All runs';
 const wKey='tp-welcome-open:'+pageName;
 const wOpen=cardOpen(wKey);
 const welcome=welcomeDismissed(pageName)?'':(
  '<div class="card welcome'+(opts.length<2?' single':'')+(wOpen?'':' collapsed')+'" data-welcome data-welcome-key="'+esc(wKey)+'" data-welcome-page="'+esc(pageName)+'">'
  +'<div class="welcome-hd">'
  +'<button type="button" class="welcome-tog card-tog" aria-expanded="'+(wOpen?'true':'false')+'">'+CHV+'<span class="welcome-title">'+esc(cfg.title)+'</span></button>'
  +'<button type="button" class="welcome-x card-x" aria-label="Dismiss">×</button>'
  +'</div>'
  +'<div class="welcome-body">'
  +'<p class="welcome-sub">'+esc(cfg.sub)+'</p>'
  +'<div class="welcome-split">'
  +opts.map(function(o){
   return '<div class="welcome-opt"><img class="welcome-ill'+illClass(o.img)+'" src="/illustrations/'+o.img+'" alt="'+esc(o.alt)+'" width="200" height="150" loading="lazy">'
    +'<div class="welcome-copy"><b>'+esc(o.h)+'</b><p>'+esc(o.p)+'</p>'
    +'<div class="welcome-acts">'+(o.acts||[]).map(heroAct).join('')+'</div></div></div>';
  }).join('')
  +'</div></div></div>'
 );
 const ov=cfg.ov||{};
 const metrics=heroMetrics(ov.metrics||'runs').map(function(m){return '<div class="om"><span class="om-l">'+esc(String(m[0]))+'</span><b class="om-n">'+esc(String(m[1]))+'</b></div>'}).join('');
 const overview='<div class="card overview">'
  +'<div class="overview-hd"><div><h3>'+esc(ov.title||'Overview')+'</h3><p class="cs">'+esc(ov.cs||'')+'</p></div>'
  +(ov.btn?'<button class="b2" data-v-go="'+ov.btn[0]+'">'+I(ov.btn[1],14)+esc(ov.btn[2])+'</button>':'')
  +'</div>'
  +'<div class="overview-metrics">'+metrics+'</div></div>';
 const ex=cfg.ex||{};
 const explore='<div class="card explore">'
  +(ex.img?'<img class="explore-ill'+illClass(ex.img)+'" src="/illustrations/'+ex.img+'" alt="'+esc(ex.alt||'')+'" width="160" height="120" loading="lazy">':'')
  +'<h3>'+esc(ex.h||'Explore')+'</h3>'
  +'<p>'+esc(ex.p||'')+'</p>'
  +'<p class="explore-meta"><span class="sub">Estimated duration</span> <b>5–10 minutes</b></p>'
  +(ex.go?'<button class="b2" data-v-go="'+ex.go[0]+'">'+esc(ex.go[1])+'</button>':'')
  +'</div>';
 return howItWorks(page)+welcome+'<div class="dash-row">'+overview+explore+'</div>';
}
function equalizeOverviewExplore(){
 const row=document.querySelector('#dash .dash-row');if(!row)return;
 const ov=row.querySelector('.card.overview'),ex=row.querySelector('.card.explore');
 if(!ov||!ex)return;
 ov.style.minHeight='';ov.style.height='auto';
 ex.style.minHeight='';ex.style.height='auto';
 const target=ex.getBoundingClientRect().height;
 if(target>0){ov.style.height=Math.round(target)+'px';ov.style.overflow='hidden'}
}
function paintHero(page){const el=$('hero');if(el)el.innerHTML=heroCards(page||'All runs');
 requestAnimationFrame(()=>{equalizeOverviewExplore();requestAnimationFrame(equalizeOverviewExplore)})}
window.paintHero=paintHero;window.heroCards=heroCards;window.__equalizeOverviewExplore=equalizeOverviewExplore;
window.addEventListener('resize',()=>{if(window.__equalizeOverviewExplore)window.__equalizeOverviewExplore()});
function gen(n,x){const a=(x.a||[]).map((t,i)=>bt(t,!i)).join('');
 const rows=(x.r&&x.r.length)?x.r:[x.c.map((_,i)=>i?'—':'No records yet')];
 return hd(n,esc(n)+' <span>('+(x.r&&x.r.length||0)+')</span>',x.d,a)+heroCards(n)+'<div class="fl"><div class="sf" role="search">'+I('search',14)+'<input id="gq" placeholder="Search" aria-label="Search"></div></div><div class="tw tall" id="gt">'+tbl(x.c,rows)+'</div>'}
function lockCards(readonly){
 const rows=LOCK_ROWS.length?LOCK_ROWS:[];
 if(!rows.length)return '<p class="sub">No lock status yet.</p>';
 return '<div class="cards">'+rows.map(r=>{const k=!!r.held;const w=r.waiting||[];
  const st=k?'Locked':w.length?'Queued':'Free';
  const stCls=k?'st-bad':w.length?'st-wait':'st-ok';
  const sub=k?'Held by running '+xe(r.action||'run'):w.length?w.length+' waiting in queue':'Free to use';
  return '<div class="card lc'+(readonly?' lc-ro':'')+'">'
   +'<div class="card-hd lh"><div class="lt"><b class="lc-env">'+esc(r.environment)+'</b><span class="cs">'+sub+'</span></div>'
   +'<span class="tx '+stCls+'">'+st+'</span></div>'
   +'<div class="card-bd">'
   +(k?'<div class="r"><span>Held by</span>'+F.pp(r.holder||'—')+'</div><div class="r"><span>Branch</span>'+F.br(r.branch||'—')+'</div><div class="r"><span>Action</span><span class="tx act-'+xe(r.action||'')+'">'+xe(r.action||'—')+'</span></div><div class="r"><span>Since</span><span>'+ago(r.acquiredAt)+'</span></div>':'')
   +'<div class="r"><span>Queue</span><span>'+(w.length?w.slice().reverse().map(x=>xe(x.triggeredBy)+' ('+xe(x.action)+')').join(', '):'Empty')+'</span></div>'
   +(readonly?'':'<div class="bt"><button type="button" class="b1 sm" data-t="Run terraform">'+I('play',14)+'Run terraform</button></div>')
   +'</div></div>'}).join('')+'</div>';
}
function dashMonthView(off){
 const now=new Date();
 const d=new Date(now.getFullYear(),now.getMonth()-(off||0),1);
 const y=d.getFullYear(),m=d.getMonth();
 const days=new Date(y,m+1,0).getDate();
 const pad=n=>String(n).padStart(2,'0');
 const keys=[];
 for(let i=1;i<=days;i++)keys.push(y+'-'+pad(m+1)+'-'+pad(i));
 return {days:days,keys:keys,labels:keys.map((_,i)=>String(i+1)),label:d.toLocaleString('en-US',{month:'long',year:'numeric'}),isCurrent:!(off||0)};
}
function home(){startLockTick();const rr=window.__runs||runs||[];
 const monthOff=window.__dashMonthOff||0;
 const mv=dashMonthView(monthOff);
 const series=[0,0,0].map(()=>mv.keys.map(()=>0));
 rr.forEach(r=>{
  const iso=r.raw&&r.raw.createdAt;const dt=iso?new Date(iso):null;
  const key=dt&&!isNaN(dt)?dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0'):'';
  const di=mv.keys.indexOf(key);if(di<0)return;
  if(r.a==='plan')series[0][di]++;else if(r.a==='apply')series[1][di]++;else if(r.a==='destroy')series[2][di]++;
 });
 const nOk=rr.filter(r=>r.s==='succeeded').length,nFail=rr.filter(r=>r.s==='failed').length,nWait=rr.filter(r=>r.s==='waiting approval').length,nCan=rr.filter(r=>r.s==='cancelled').length;
 const dashSt=s=>(({running:'run:',succeeded:'ok:',failed:'bad:','waiting approval':'warn:',queued:'warn:'})[s]||'mut:')+s;
 const recentRows=rr.length?rr.map(r=>[r.b,'ln:'+(r.sid||r.id),'tag:'+r.a,dashSt(r.s),r.e,r.u,r.t]):[['No runs yet','—','—','—','—','—','—']];
 const feedRows=rr.length?rr.map(r=>[r.u||'—',r.a||'—',dashSt(r.s),r.e||'—',r.t||'—']):[['No activity yet','—','—','—','—']];
 return hd('Dashboard','Dashboard','What is running, what is waiting and which environments are free right now.',bt('Run terraform',1))
 +heroCards('Dashboard')
 +rw('2fr 1fr',cd('Runs in '+esc(mv.label),'Plans, applies and destroys by day of month',vbars(mv.labels,series,['var(--fg)','#ff9900','var(--bad)'],['Plan','Apply','Destroy']),'',
  '<div class="ch-month-nav">'
  +'<button type="button" class="b2 ico sm" data-dash-month="1" title="Previous month" aria-label="Previous month">'+I('left',14)+'</button>'
  +'<button type="button" class="b2 ico sm" data-dash-month="-1" title="Next month" aria-label="Next month"'+(mv.isCurrent?' disabled':'')+'>'+I('right',14)+'</button>'
  +'</div>'
 ),cd('Run outcomes','From your run history',donut([['Succeeded',nOk,C[1]],['Failed',nFail,C[3]],['Waiting approval',nWait,C[2]],['Cancelled',nCan,C[5]]],String(rr.length||0),'runs')))
 +'<div class="sh2-row"><h2 class="sh2">Live locks</h2><button type="button" class="b2" data-v-go="Live locks">'+I('lock',14)+'View all</button></div>'
 +liveLockTableHtml()
 +rw('2fr 1fr','<div><h2 class="sh2" style="margin-top:12px">Recent runs</h2><div class="tw tall" id="dash-recent">'+tbl(['Branch','Run ID','Action','Status','Environment','Triggered by','Started'],recentRows)+'</div></div>','<div><h2 class="sh2" style="margin-top:12px">Live activity</h2><div class="tw tall" id="dash-feed">'+tbl(['Triggered by','Action','Status','Environment','Started'],feedRows)+'</div></div>')}
const LK_COLS=['Environment','Branch','Application','Triggered by','Status','Started','Duration'];
function lockRunMatch(lock){
 const rr=window.__runs||[];
 if(lock&&lock.runId){
  const hit=rr.find(r=>r.id===lock.runId||(r.raw&&r.raw.id===lock.runId));
  if(hit)return hit;
 }
 if(lock&&lock.environment){
  return rr.find(r=>r.e===lock.environment&&r.s==='running')||null;
 }
 return null;
}
function lockTableRows(){
 const out=[];
 (LOCK_ROWS||[]).forEach(lock=>{
  if(!lock)return;
  if(lock.held){
   const run=lockRunMatch(lock);
   const raw=run&&run.raw;
   const status=(lock.status||(raw&&raw.status)||(run&&run.s)||'running').replace(/_/g,' ');
   const running=status==='running';
   const started=lock.startedAt||(raw&&raw.startedAt)||lock.acquiredAt;
   const finished=raw&&raw.finishedAt;
   const app=lock.repository||(raw&&raw.repository)||(run&&run.r)||'—';
   const stCell=running?'run:Running':status==='queued'?'warn:Queued':status==='waiting approval'?'warn:Waiting approval':'warn:Locked';
   out.push({
    sort:new Date(started||0).getTime()||0,
    className:running?'lk-running':'',
    cells:[
     lock.environment||'—',
     lock.branch||(run&&run.b)||'—',
     app,
     lock.holder||(run&&run.u)||'—',
     stCell,
     started?ago(started):'—',
     'html:<span class="mono lk-dur" data-started="'+esc(started||'')+'" data-finished="'+esc(finished||'')+'">'+esc(dur(started,finished))+'</span>'
    ]
   });
  }
  (lock.waiting||[]).forEach(w=>{
   const started=w.createdAt;
   out.push({
    sort:new Date(started||0).getTime()||0,
    className:'lk-queued',
    cells:[
     lock.environment||'—',
     w.branch||'—',
     w.repository||'—',
     w.triggeredBy||'—',
     'warn:Queued',
     started?ago(started):'—',
     'html:<span class="mono lk-dur" data-started="'+esc(started||'')+'" data-finished="">'+esc(dur(started,null))+'</span>'
    ]
   });
  });
 });
 out.sort((a,b)=>b.sort-a.sort);
 return out;
}
function liveLockTableInner(){
 const rows=lockTableRows();
 return rows.length?tbl(LK_COLS,rows)
  :'<table class="tbl"><thead><tr>'+LK_COLS.map(h=>sortAllowed(h)?'<th class="th-s" data-col="'+esc(h)+'"><button type="button" class="th-btn">'+esc(h)+SORT_ICO+'</button></th>':'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody><tr><td colspan="'+LK_COLS.length+'">'+tdc('No environments are locked or queued right now.')+'</td></tr></tbody></table>';
}
function liveLockTableHtml(){
 return '<div class="tw tall" id="lk-table">'+liveLockTableInner()+'</div>';
}
let lockTick=null;
function stopLockTick(){if(lockTick){clearInterval(lockTick);lockTick=null}}
function startLockTick(){
 stopLockTick();
 lockTick=setInterval(()=>{
  if((window.__view!=='Live locks'&&window.__view!=='Dashboard')||!$('lk-table')){stopLockTick();return}
  document.querySelectorAll('#lk-table .lk-dur').forEach(el=>{
   if(el.dataset.finished)return;
   el.textContent=dur(el.dataset.started||null,null);
  });
 },1000);
}
function paintLiveLockTable(){
 const wrap=$('lk-table');if(!wrap)return;
 wrap.innerHTML=liveLockTableInner();
 wrap.__pager=null;
 attachPager(wrap);
 attachTableSort(wrap.querySelector('table'));
}
window.__paintLiveLockTable=paintLiveLockTable;
function locks(){
 startLockTick();
 return hd('Live locks','Live locks','Latest lock and queue activity first. Running rows blink until the lock is released; queued runs start automatically when that environment is free.',bt('Run terraform',1))
  +heroCards('Live locks')
  +'<div class="fl"><div class="sf" role="search">'+I('search',14)+'<input id="gq" placeholder="Search" aria-label="Search"></div></div>'
  +liveLockTableHtml();
}
function openBbModal(conn){openConnectRepoModal()}
function openEnvModal(row,missing){
 closeUModal();const isNew=!row;const name=row?row.name:(missing&&missing[0])||'dev';
 const bc=row&&row.backendConfig||{type:'s3',bucket:'',key:'',region:'ap-south-1',dynamodbTable:'',encrypt:true};
 const ap=row&&row.approvalPolicy||{plan:'anyone',apply:'applier',destroy:'admin',approversRequired:0,allowedHours:'Anytime',lockTimeoutMin:60};
 const actors=['anyone','planner','applier','admin'];
 const nameOpts=(isNew?(missing&&missing.length?missing:ENVS):[name]).map(e=>'<option value="'+e+'"'+(e===name?' selected':'')+'>'+e+'</option>').join('');
 const body=document.createElement('div');body.className='umodal';body.id='umodal';
 body.innerHTML='<div class="md card-md cr-modal">'
  +'<div class="md-hd"><h3>'+(isNew?'Add environment':'Edit '+esc(name))+'</h3><p class="md-cs">Repo, Terraform dir, backend and IAM role. The runner assumes the role with STS — no static keys.</p></div>'
  +'<div class="md-bd">'
  +(isNew?'<label>Name</label><select id="env-name">'+nameOpts+'</select>':'<p class="sub">Environment <b class="mono">'+esc(name)+'</b></p>')
  +'<label>Display name</label><input id="env-dn" value="'+esc(row&&row.displayName||'')+'" placeholder="Production">'
  +'<label>Repository</label><input id="env-repo" value="'+esc(row&&row.repository||'')+'" placeholder="repository slug">'
  +'<label>Terraform directory</label><input id="env-tfdir" value="'+esc(row&&row.terraformDir||'.')+'" placeholder="envs/dev">'
  +'<label>AWS account ID</label><input id="env-acct" value="'+esc(row&&row.awsAccountId||'')+'" placeholder="123456789012" maxlength="12">'
  +'<label>Role ARN</label><input id="env-role" value="'+esc(row&&row.roleArn||'')+'" placeholder="arn:aws:iam::123456789012:role/terraplan-dev">'
  +'<label>External ID (optional)</label><input id="env-ext" value="'+esc(row&&row.externalId||'')+'" placeholder="optional">'
  +'<label>Session duration (seconds)</label><input id="env-sess" type="number" min="900" max="43200" value="'+(row&&row.sessionDurationSeconds||3600)+'">'
  +'<label>Terraform version (pinned)</label><input id="env-tfver" value="'+esc(row&&row.terraformVersion||'1.9.8')+'" placeholder="1.9.8">'
  +'<label>Variable files (comma-separated)</label><input id="env-vars" value="'+esc((row&&row.variableFiles||[]).join(', '))+'" placeholder="env/dev.tfvars">'
  +'<p class="sub" style="margin-top:12px">Backend (S3)</p>'
  +'<label>Bucket</label><input id="env-bucket" value="'+esc(bc.bucket||'')+'">'
  +'<label>State key</label><input id="env-key" value="'+esc(bc.key||'')+'" placeholder="env/terraform.tfstate">'
  +'<label>Region</label><input id="env-region" value="'+esc(bc.region||'ap-south-1')+'">'
  +'<label>DynamoDB lock table</label><input id="env-ddb" value="'+esc(bc.dynamodbTable||'')+'">'
  +'<p class="sub" style="margin-top:12px">Approval policy</p>'
  +'<label>Plan</label><select id="env-plan">'+actors.map(a=>'<option value="'+a+'"'+(ap.plan===a?' selected':'')+'>'+a+'</option>').join('')+'</select>'
  +'<label>Apply</label><select id="env-apply">'+actors.map(a=>'<option value="'+a+'"'+(ap.apply===a?' selected':'')+'>'+a+'</option>').join('')+'</select>'
  +'<label>Destroy</label><select id="env-destroy">'+actors.map(a=>'<option value="'+a+'"'+(ap.destroy===a?' selected':'')+'>'+a+'</option>').join('')+'</select>'
  +'<label>Approvers required</label><input id="env-approvers" type="number" min="0" max="10" value="'+(ap.approversRequired||0)+'">'
  +'<label>Allowed hours</label><input id="env-hours" value="'+esc(ap.allowedHours||'Anytime')+'">'
  +'<label>Lock timeout (minutes)</label><input id="env-lock" type="number" min="5" max="480" value="'+(ap.lockTimeoutMin||60)+'">'
  +'<label class="chk"><input type="checkbox" id="env-en"'+(!(row)||row.enabled?' checked':'')+'> Enabled</label>'
  +'</div><div class="md-ft cr-modal-ft"><div style="flex:1"></div><button type="button" class="b2" id="ucancel">Cancel</button><button type="button" class="b1" id="usave">Save</button></div></div>';
 document.body.appendChild(body);
 body.querySelector('#ucancel').onclick=closeUModal;body.onclick=e=>{if(e.target===body)closeUModal()};
 body.querySelector('#usave').onclick=async()=>{
  const envName=isNew?$('env-name').value:name;
  const payload={
   name:envName,displayName:$('env-dn').value.trim()||null,repository:$('env-repo').value.trim(),terraformDir:$('env-tfdir').value.trim()||'.',
   awsAccountId:$('env-acct').value.trim(),roleArn:$('env-role').value.trim(),externalId:$('env-ext').value.trim()||null,
   sessionDurationSeconds:Number($('env-sess').value)||3600,
   terraformVersion:$('env-tfver').value.trim()||'1.9.8',
   variableFiles:$('env-vars').value.split(',').map(s=>s.trim()).filter(Boolean),
   backendConfig:{type:'s3',bucket:$('env-bucket').value.trim(),key:$('env-key').value.trim()||undefined,region:$('env-region').value.trim()||undefined,dynamodbTable:$('env-ddb').value.trim()||undefined,encrypt:true},
   approvalPolicy:{plan:$('env-plan').value,apply:$('env-apply').value,destroy:$('env-destroy').value,approversRequired:Number($('env-approvers').value)||0,allowedHours:$('env-hours').value.trim()||'Anytime',lockTimeoutMin:Number($('env-lock').value)||60},
   enabled:$('env-en').checked
  };
  const btn=body.querySelector('#usave');btn.disabled=true;
  try{await api('/environments/'+encodeURIComponent(envName),{method:'PUT',body:JSON.stringify(payload)});toast('Environment saved');closeUModal();if(window.__refreshEnvs)window.__refreshEnvs();if(window.__refreshVariables)window.__refreshVariables()}catch(err){toast(err.message);btn.disabled=false}}
}
function openAddEnvModal(){
 closeUModal();
 const body=document.createElement('div');body.className='umodal';body.id='umodal';
 body.innerHTML='<div class="md card-md cr-modal">'
  +'<div class="md-hd"><h3>Add environment</h3><p class="md-cs">Just a name. It will appear in every Environment dropdown.</p></div>'
  +'<div class="md-bd"><label>Name</label><input id="env-name" placeholder="e.g. terraform-plan env=\'dev\' app=\'ops\'" autocomplete="off"></div>'
  +'<div class="md-ft cr-modal-ft"><div style="flex:1"></div><button type="button" class="b2" id="ucancel">Cancel</button><button type="button" class="b1" id="usave">Add</button></div></div>';
 document.body.appendChild(body);
 const input=body.querySelector('#env-name');
 body.querySelector('#ucancel').onclick=closeUModal;body.onclick=e=>{if(e.target===body)closeUModal()};
 const save=()=>{
  const name=String(input.value||'').trim();
  if(!name){toast('Name is required');return}
  if(name.length>200||/[\n\r]/.test(name)){toast('Name is too long or contains a line break');return}
  const list=typeof envNameList==='function'?envNameList():[];
  if(list.some(n=>String(n).toLowerCase()===name.toLowerCase())||allEnvNames().some(n=>String(n).toLowerCase()===name.toLowerCase())){toast('That environment already exists');return}
  saveEnvNameList(list.concat([name]));
  closeUModal();toast('Environment added');
  if(window.__refreshVariables)window.__refreshVariables();
 };
 body.querySelector('#usave').onclick=save;
 input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();save()}});
 setTimeout(()=>input.focus(),30);
}
function envTableRows(rows){
 if(!rows.length)return [['No environments yet','—','—','—','—','—','—','—','—','—','—']];
 return rows.map(r=>{
  const st=!r.enabled?'mut:Disabled':r.lastAssumeError?'bad:Assume failed':r.lastAssumedAt?'ok:Assumable':'mut:Not tested';
  const acts='html:<button class="b2 sm" data-env="edit" data-ename="'+esc(r.name)+'">Edit</button> '
   +'<button class="b2 sm" data-env="test" data-ename="'+esc(r.name)+'">Test STS</button> '
   +'<button class="b2 sm" data-env="delete" data-ename="'+esc(r.name)+'">Remove</button>';
  return [r.name,r.repository,r.terraformDir,r.terraformVersion||'1.9.8',r.awsAccountId,r.roleArn,Math.round(r.sessionDurationSeconds/60)+' min',String((r.variableFiles||[]).length),String(r.approvalPolicy&&r.approvalPolicy.approversRequired||0),st,acts];
 });
}
async function environmentsAdmin(){if(!isAdmin())return hd('Environments','Environments','Admin access required.');
 const [rows,missing]=await Promise.all([api('/environments'),api('/environments/missing').catch(()=>[])]);
 const accounts=[...new Set(rows.map(r=>r.awsAccountId))];
 const ok=rows.filter(r=>r.enabled&&!r.lastAssumeError).length;
 const html=hd('Environments','Environments <span>('+rows.length+')</span>','Configure repo, Terraform dir, backend, AWS account and IAM role per environment. The runner assumes the role with STS — static AWS keys are never stored.',
  (missing.length?'<button class="b1" data-env="add">'+I('plus',16)+'Add environment</button>':'')+'<button class="b2" data-env="refresh">'+I('refresh',16)+'Refresh</button>')
  +heroCards('Environments')
  +kp([['Configured',rows.length],['Enabled',rows.filter(r=>r.enabled).length,'','',C[1]],['AWS accounts',accounts.length],['Assume healthy',ok,'Last STS probe','',ok===rows.length?C[1]:C[2]]])
  +(missing.length?'<p class="sub">Missing configs: '+missing.map(m=>'<span class="mono">'+esc(m)+'</span>').join(', ')+'</p>':'')
  +'<div class="tw tall" id="gt">'+tbl(
   ['Environment','Repository','Terraform dir','TF version','AWS account','Role ARN','Session','Var files','Approvers','Status','Actions'],
   envTableRows(rows)
  )+'</div>';
 window.__envsCache=rows;window.__envsMissing=missing;return html}

function vaStore(){return actionNameList()}
function vaSave(list){saveActionNameList(list)}

async function variablesAdmin(){
 if(!isAdmin())return hd('Variables','Variables','Admin access required.');
 let rows=[];
 try{rows=await api('/environments')}catch(e){rows=[]}
 window.__envsCache=rows;
 const actions=vaStore();
 const names=allEnvNames();
 const envCols=['Environment','Actions'];
 const envRows=names.length?names.map(n=>[n,'html:<button class="b2 sm" data-env="delete" data-ename="'+esc(n)+'" style="color:var(--bad)">Remove</button>']):[['No environments yet','—']];

 const actRows=actions.length?actions.map(n=>[n,'html:<button class="b2 sm" data-va="delete" data-va-name="'+esc(n)+'" style="color:var(--bad)">Remove</button>']):[['No actions yet','—']];

 return hd('Variables','Variables','Environments and setup actions. More variable tables can be added here later.')
  +heroCards('Variables')
  +'<div class="sh2-row"><h2 class="sh2">Environments</h2><button type="button" class="b1" data-env="add">'+I('plus',16)+'Add environment</button></div>'
  +'<p class="vdsc" style="margin:-4px 0 12px">Names you add here appear in Environment dropdowns across terraplan.</p>'
  +'<div class="tw tall" id="gt-vars-env">'+tbl(envCols,envRows)+'</div>'
  +'<div class="sh2-row" style="margin-top:28px"><h2 class="sh2">Actions</h2><button type="button" class="b1" data-va="add">'+I('plus',16)+'Add action</button></div>'
  +'<p class="vdsc" style="margin:-4px 0 12px">Names you add here appear in Action dropdowns across terraplan.</p>'
  +'<div class="tw tall" id="gt-vars-act">'+tbl(['Action','Actions'],actRows)+'</div>';
}

function openAddActionModal(){
 closeUModal();
 const body=document.createElement('div');body.className='umodal';body.id='umodal';
 body.innerHTML='<div class="md card-md cr-modal">'
  +'<div class="md-hd"><h3>Add action</h3><p class="md-cs">Just a name. It will appear in every Action dropdown.</p></div>'
  +'<div class="md-bd"><label>Name</label><input id="va-name" placeholder="e.g. terraform-plan env=\'dev\' app=\'ops\'" autocomplete="off"></div>'
  +'<div class="md-ft cr-modal-ft"><div style="flex:1"></div><button type="button" class="b2" id="ucancel">Cancel</button><button type="button" class="b1" id="usave">Add</button></div></div>';
 document.body.appendChild(body);
 const input=body.querySelector('#va-name');
 body.querySelector('#ucancel').onclick=closeUModal;body.onclick=e=>{if(e.target===body)closeUModal()};
 const save=()=>{
  const name=String(input.value||'').trim();
  if(!name){toast('Name is required');return}
  if(name.length>200||/[\n\r]/.test(name)){toast('Name is too long or contains a line break');return}
  const list=actionNameList();
  if(list.some(n=>String(n).toLowerCase()===name.toLowerCase())){toast('That action already exists');return}
  saveActionNameList(list.concat([name]));
  closeUModal();toast('Action added');
  if(window.__refreshVariables)window.__refreshVariables();
 };
 body.querySelector('#usave').onclick=save;
 input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();save()}});
 setTimeout(()=>input.focus(),30);
}

async function runSelectedVarActions(){
 const picked=[...document.querySelectorAll('.va-act-chk:checked')].map(x=>Number(x.dataset.vaI));
 if(!picked.length){toast('Select at least one action');return}
 const extra=(document.getElementById('va-extra')&&document.getElementById('va-extra').value.trim())||'';
 const items=vaStore();
 const selected=picked.map(i=>items[i]).filter(Boolean);
 if(!selected.length){toast('Select at least one action');return}
 const lines=[];
 for(const a of selected){
  let extraVal=extra;
  if(a.askInput){
   const typed=window.prompt('Extra input for "'+a.name+'"'+(extra?' (or leave blank to use the toolbar value)':''),extra);
   if(typed===null)continue;
   extraVal=typed;
  }
  const onFlags=(a.flags||[]).filter(f=>f.on).map(f=>f.flag||f.label).filter(Boolean);
  const cmd=[a.command].concat(onFlags).concat(extraVal?[extraVal]:[]).join(' ').trim();
  lines.push('$ '+cmd+(a.environment?'   # env '+a.environment:''));
  const action=parseAction(a.command);
  if(action==='plan'||action==='apply'||action==='destroy'){
   const env=a.environment||((window.__envsCache||[])[0]&&(window.__envsCache||[])[0].name);
   const envRow=(window.__envsCache||[]).find(e=>e.name===env);
   const repository=envRow&&envRow.repository||'';
   const saved=typeof crRepos==='function'?crRepos():[];
   const branch=(saved.find(r=>repoSlugFromUrl(r.url)===repository)||saved[0]||{}).branch||'';
   if(!repository||!branch||!env){lines.push('# skipped: need repository, branch and environment');continue}
   if(action==='apply'){lines.push('# apply needs a succeeded plan — open Run terraform to pick one');continue}
   try{
    const body={repository,branch,environment:env,action};
    if(action==='destroy')body.destroyConfirmation='destroy '+env;
    const created=await api('/runs',{method:'POST',body:JSON.stringify(body)});
    lines.push('# queued '+created.id+' ('+created.status+')');
    await sync();
   }catch(err){lines.push('# error: '+err.message)}
  }
 }
 const panel=document.createElement('div');
 panel.className='at-terminal-panel run-term maximized';
 panel.innerHTML=
  '<div class="at-tp-info"><div class="at-tp-info-top"><span class="at-tp-name">Actions · '+selected.length+' selected</span>'
  +'<div class="at-tp-actions">'
  +'<button class="at-tp-btn at-tp-close-btn" id="at-tp-close" title="Close"><svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l10 10M13 3 3 13"/></svg></button>'
  +'</div></div></div>'
  +'<div class="at-tp-term"><div class="at-tp-bar"><span class="mac-dot r"></span><span class="mac-dot y"></span><span class="mac-dot g"></span><span class="at-tp-bartitle">setup commands</span></div>'
  +'<pre class="at-tp-output">'+esc(lines.join('\n')||'Nothing to run.')+'</pre></div>';
 const host=document.querySelector('#dash .shell')||document.body;
 host.appendChild(panel);
 panel.querySelector('#at-tp-close').onclick=()=>panel.remove();
}

/* ── Workers (ephemeral agents) ─────────────────────────────────── */
function igStore(){try{const raw=JSON.parse(sessionStorage.getItem('tp-integrations')||'{}');return {items:Array.isArray(raw.items)?raw.items:[]}}catch(e){return {items:[]}}}
function igSave(s){try{sessionStorage.setItem('tp-integrations',JSON.stringify({items:s.items||[]}))}catch(e){}}
function igItems(){return igStore().items}
function igActive(){return igItems().find(x=>x.enabled)||null}
const AWS_REGIONS=[
 {id:'us-east-1',name:'US East (N. Virginia)',az:'abcdef'},
 {id:'us-east-2',name:'US East (Ohio)',az:'abc'},
 {id:'us-west-1',name:'US West (N. California)',az:'abc'},
 {id:'us-west-2',name:'US West (Oregon)',az:'abcd'},
 {id:'af-south-1',name:'Africa (Cape Town)',az:'abc'},
 {id:'ap-east-1',name:'Asia Pacific (Hong Kong)',az:'abc'},
 {id:'ap-south-1',name:'Asia Pacific (Mumbai)',az:'abc'},
 {id:'ap-south-2',name:'Asia Pacific (Hyderabad)',az:'abc'},
 {id:'ap-northeast-1',name:'Asia Pacific (Tokyo)',az:'abcd'},
 {id:'ap-northeast-2',name:'Asia Pacific (Seoul)',az:'abcd'},
 {id:'ap-northeast-3',name:'Asia Pacific (Osaka)',az:'abc'},
 {id:'ap-southeast-1',name:'Asia Pacific (Singapore)',az:'abc'},
 {id:'ap-southeast-2',name:'Asia Pacific (Sydney)',az:'abc'},
 {id:'ap-southeast-3',name:'Asia Pacific (Jakarta)',az:'abc'},
 {id:'ap-southeast-4',name:'Asia Pacific (Melbourne)',az:'abc'},
 {id:'ca-central-1',name:'Canada (Central)',az:'abcd'},
 {id:'eu-central-1',name:'Europe (Frankfurt)',az:'abc'},
 {id:'eu-central-2',name:'Europe (Zurich)',az:'abc'},
 {id:'eu-west-1',name:'Europe (Ireland)',az:'abc'},
 {id:'eu-west-2',name:'Europe (London)',az:'abc'},
 {id:'eu-west-3',name:'Europe (Paris)',az:'abc'},
 {id:'eu-north-1',name:'Europe (Stockholm)',az:'abc'},
 {id:'eu-south-1',name:'Europe (Milan)',az:'abc'},
 {id:'eu-south-2',name:'Europe (Spain)',az:'abc'},
 {id:'il-central-1',name:'Israel (Tel Aviv)',az:'abc'},
 {id:'me-central-1',name:'Middle East (UAE)',az:'abc'},
 {id:'me-south-1',name:'Middle East (Bahrain)',az:'abc'},
 {id:'sa-east-1',name:'South America (São Paulo)',az:'abc'}
];
const AWS_AZS=region=>{const r=AWS_REGIONS.find(x=>x.id===region);return r?[...r.az].map(l=>region+l):[]}
const GCP_REGIONS=[
 {id:'us-central1',name:'Iowa',az:'abc'},
 {id:'us-east1',name:'South Carolina',az:'bcd'},
 {id:'us-east4',name:'N. Virginia',az:'abc'},
 {id:'us-west1',name:'Oregon',az:'abc'},
 {id:'europe-west1',name:'Belgium',az:'bcd'},
 {id:'europe-west2',name:'London',az:'abc'},
 {id:'europe-west3',name:'Frankfurt',az:'abc'},
 {id:'asia-south1',name:'Mumbai',az:'abc'},
 {id:'asia-southeast1',name:'Singapore',az:'abc'},
 {id:'asia-east1',name:'Taiwan',az:'abc'},
 {id:'australia-southeast1',name:'Sydney',az:'abc'}
];
const GCP_AZS=region=>{const r=GCP_REGIONS.find(x=>x.id===region);return r?[...r.az].map(l=>region+'-'+l):[]}
const GCP_TYPES=['e2-medium','e2-standard-2','e2-standard-4','n2-standard-2','n2-standard-4','c2-standard-4','n2d-standard-2'];
const GCP_AMIS=[
 {id:'debian-12',label:'Debian 12'},
 {id:'ubuntu-2404',label:'Ubuntu 24.04 LTS'},
 {id:'ubuntu-2204',label:'Ubuntu 22.04 LTS'},
 {id:'cos-stable',label:'Container-Optimized OS'}
];
const AZURE_REGIONS=[
 {id:'eastus',name:'East US',az:'123'},
 {id:'eastus2',name:'East US 2',az:'123'},
 {id:'westus2',name:'West US 2',az:'123'},
 {id:'westus3',name:'West US 3',az:'123'},
 {id:'centralus',name:'Central US',az:'123'},
 {id:'northeurope',name:'North Europe',az:'123'},
 {id:'westeurope',name:'West Europe',az:'123'},
 {id:'uksouth',name:'UK South',az:'123'},
 {id:'centralindia',name:'Central India',az:'123'},
 {id:'southeastasia',name:'Southeast Asia',az:'123'},
 {id:'australiaeast',name:'Australia East',az:'123'},
 {id:'japaneast',name:'Japan East',az:'123'}
];
const AZURE_AZS=region=>{const r=AZURE_REGIONS.find(x=>x.id===region);return r?[...r.az].map(n=>region+'-'+n):[]}
const AZURE_TYPES=['Standard_B2s','Standard_B2ms','Standard_D2s_v3','Standard_D4s_v3','Standard_E2s_v3','Standard_F2s_v2'];
const AZURE_AMIS=[
 {id:'ubuntu-2404',label:'Ubuntu Server 24.04 LTS'},
 {id:'ubuntu-2204',label:'Ubuntu Server 22.04 LTS'},
 {id:'debian-12',label:'Debian 12'},
 {id:'azure-linux',label:'Azure Linux'}
];
const IG_ICONS={aws:'/illustrations/workers/aws.webp',gcp:'/illustrations/workers/gcp.png',azure:'/illustrations/workers/azure.png',server:'/illustrations/workers/server.png',docker:'/illustrations/workers/docker.png',k8s:'/illustrations/workers/k8s.webp'};
function igIco(k,s){return '<img class="ig-ico" src="'+esc(IG_ICONS[k]||IG_ICONS.server)+'" alt="" width="'+(s||16)+'" height="'+(s||16)+'">'}
function igCloudLabel(c){return c==='gcp'?'GCP':c==='azure'?'Azure':'AWS'}
function igIsKind(r,kind){if(!r)return false;if(kind==='server')return r.kind==='server'||r.kind==='ec2';return r.kind===kind}
const AWS_AMIS=[
 {id:'al2023-x86',label:'Amazon Linux 2023 (x86_64)',ssm:'/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64'},
 {id:'al2023-arm',label:'Amazon Linux 2023 (arm64)',ssm:'/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64'},
 {id:'al2-x86',label:'Amazon Linux 2 (x86_64)',ssm:'/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2'},
 {id:'al2-arm',label:'Amazon Linux 2 (arm64)',ssm:'/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-arm64-gp2'},
 {id:'ubuntu-2404-x86',label:'Ubuntu Server 24.04 LTS (x86_64)',ssm:'/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id'},
 {id:'ubuntu-2404-arm',label:'Ubuntu Server 24.04 LTS (arm64)',ssm:'/aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id'},
 {id:'ubuntu-2204-x86',label:'Ubuntu Server 22.04 LTS (x86_64)',ssm:'/aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp2/ami-id'}
];
const EC2_TYPES=['t3.micro','t3.small','t3.medium','t3.large','t3.xlarge','t3.2xlarge','t3a.medium','t3a.large','m5.large','m5.xlarge','m6i.large','m6i.xlarge','c6i.large','c6i.xlarge','r5.large','r6i.large'];
const IG_KINDS={
 server:{
  id:'server',label:'Server',short:'Server',
  blurb:'A new VM comes up for each plan, apply or destroy (AWS, GCP or Azure). When the run succeeds or fails, the instance is terminated.',
  cols:['Provider','Name','Region','AZ','Capacity','Instance type','Network','Status','Actions'],
  fields:[
   {id:'name',label:'Name of worker',req:true},
   {id:'region',label:'Region',req:true},
   {id:'az',label:'Availability zones',req:true},
   {id:'capacity',label:'Capacity type',req:true},
   {id:'instanceType',label:'Instance type',req:true},
   {id:'ami',label:'AMI ID',req:true},
   {id:'vpc',label:'VPC ID',req:true},
   {id:'subnet',label:'Subnet IDs',req:true}
  ]
 },
 docker:{
  id:'docker',label:'Docker',short:'Docker',
  blurb:'A new container starts for each terraform command, then is removed when the run finishes.',
  cols:['Name','Host','Image','CPU','Memory','Storage','Status','Actions'],
  fields:[
   {id:'name',label:'Name of worker',ph:'e.g. terraform-docker-workers',req:true,span:true},
   {id:'host',label:'Docker host',ph:'unix:///var/run/docker.sock',req:true,span:true},
   {id:'image',label:'Worker image',ph:'hashicorp/terraform:1.9.8',req:true,span:true},
   {id:'network',label:'Network',ph:'bridge'},
   {id:'registry',label:'Registry',ph:'docker.io'},
   {id:'minCpu',label:'Min CPU (cores)',ph:'1',req:true},
   {id:'maxCpu',label:'Max CPU (cores)',ph:'4',req:true},
   {id:'minMem',label:'Min memory (GiB)',ph:'2',req:true},
   {id:'maxMem',label:'Max memory (GiB)',ph:'8',req:true},
   {id:'minDisk',label:'Min storage (GiB)',ph:'10',req:true},
   {id:'maxDisk',label:'Max storage (GiB)',ph:'50',req:true}
  ]
 },
 k8s:{
  id:'k8s',label:'Kubernetes',short:'Kubernetes',
  blurb:'A new pod is scheduled for each plan, apply or destroy, then deleted when the run succeeds or fails.',
  cols:['Name','Cluster','Namespace','Capacity','CPU','Memory','Storage','Status','Actions'],
  fields:[
   {id:'name',label:'Name of worker',ph:'e.g. terraform-k8s-workers',req:true,span:true},
   {id:'cluster',label:'Cluster / API server',ph:'https://k8s.example.com',req:true,span:true},
   {id:'namespace',label:'Namespace',ph:'terraplan',req:true},
   {id:'context',label:'Kube context',ph:'prod-workers'},
   {id:'serviceAccount',label:'Service account',ph:'terraplan-worker'},
   {id:'nodeSelector',label:'Node selector / zone',ph:'topology.kubernetes.io/zone=ap-south-1a'},
   {id:'capacity',label:'Capacity type',type:'select',opts:['on-demand','spot'],req:true},
   {id:'image',label:'Worker image',ph:'hashicorp/terraform:1.9.8',req:true},
   {id:'minCpu',label:'Min CPU (cores)',ph:'1',req:true},
   {id:'maxCpu',label:'Max CPU (cores)',ph:'4',req:true},
   {id:'minMem',label:'Min memory (GiB)',ph:'2',req:true},
   {id:'maxMem',label:'Max memory (GiB)',ph:'8',req:true},
   {id:'minDisk',label:'Min storage (GiB)',ph:'10',req:true},
   {id:'maxDisk',label:'Max storage (GiB)',ph:'50',req:true}
  ]
 }
};
function igFieldInput(f,val){
 const v=val==null?'':String(val);
 if(f.type==='select'){
  const opts=(f.opts||[]).map(o=>typeof o==='object'?o:{value:o,label:o});
  return _cgSelect('ig-'+f.id,opts,v);
 }
 return '<input id="ig-'+esc(f.id)+'" value="'+esc(v)+'" placeholder="'+esc(f.ph||'')+'" autocomplete="off">';
}
function igFillDd(body,id,opts,selected,ph){
 const dd=body.querySelector('.cg-dd[data-cgid="'+id+'"]');if(!dd)return;
 const list=(ph?[{value:'',label:ph}]:[]).concat(opts||[]);
 const tmp=document.createElement('div');tmp.innerHTML=_cgSelect(id,list,selected||'');
 dd.replaceWith(tmp.firstChild);
 _wireCgSelects(body);
}
function igReadForm(body,kind){
 const def=IG_KINDS[kind];const out={kind};
 (def.fields||[]).forEach(f=>{const el=body.querySelector('#ig-'+f.id);out[f.id]=el?String(el.value||'').trim():''});
 if(kind==='server'||kind==='ec2'){
  out.kind='server';
  out.cloud=(body.querySelector('#ig-cloud')&&body.querySelector('#ig-cloud').value)||out.cloud||'aws';
  out.sgMode='auto';
  out.iamMode='auto';
  const amiPick=body.querySelector('#ig-ami-pick');
  if(amiPick&&amiPick.value&&!out.ami)out.ami=amiPick.value.startsWith('ssm:')?amiPick.value.slice(4):amiPick.value;
 }
 return out;
}
function igMissing(kind,row){
 const k=kind==='ec2'?'server':kind;
 const def=IG_KINDS[k];if(!def)return ['Worker type'];
 return (def.fields||[]).filter(f=>f.req&&!String(row[f.id]||'').trim()).map(f=>f.label);
}
function igStatus(row){
 if(row.enabled)return 'ok:Active worker';
 if(row.lastTestOk)return 'mut:Ready';
 if(row.lastTest)return 'bad:Test failed';
 return 'mut:Not tested';
}
function igRange(min,max,unit){
 const a=min||'—',b=max||'—';
 return a+'–'+b+(unit?' '+unit:'');
}
function igTableRows(kind){
 const def=IG_KINDS[kind];
 const rows=igItems().filter(x=>igIsKind(x,kind));
 if(!rows.length)return [def.cols.map((_,i)=>i===def.cols.length-1?'html:<span class="sub">No worker yet — setup to isolate terraform</span>':'—')];
 return rows.map(r=>{
  const acts='html:'
   +'<button class="b2 sm" data-ig="edit" data-id="'+esc(r.id)+'">'+I('edit',14)+'Edit</button> '
   +'<button class="b2 sm cr-test-btn" data-ig="test" data-id="'+esc(r.id)+'">'+I('activity',14)+'Test</button><span id="ig-test-res-'+esc(r.id)+'" class="cr-test-res"></span> '
   +(r.enabled
     ?'<button class="b2 sm" data-ig="disable" data-id="'+esc(r.id)+'">Disable</button> '
     :'<button class="b2 sm" data-ig="enable" data-id="'+esc(r.id)+'">Enable</button> ')
   +'<button class="b2 sm" data-ig="delete" data-id="'+esc(r.id)+'" style="color:var(--bad)">'+I('trash',14)+'Remove</button>';
  const name='html:'+esc(r.name||'—');
  if(kind==='server'){
   const cloud=r.cloud||'aws';
   const prov='html:<span class="ig-prov" title="'+esc(igCloudLabel(cloud))+'">'+igIco(cloud,20)+'</span>';
   return [prov,name,r.region||'—',r.az||'—',r.capacity||'—',r.instanceType||'—',r.vpc||'—',igStatus(r),acts];
  }
  if(kind==='docker')return [name,r.host||'—',r.image||'—',igRange(r.minCpu,r.maxCpu),igRange(r.minMem,r.maxMem,'GiB'),igRange(r.minDisk,r.maxDisk,'GiB'),igStatus(r),acts];
  return [name,r.cluster||'—',r.namespace||'—',r.capacity||'—',igRange(r.minCpu,r.maxCpu),igRange(r.minMem,r.maxMem,'GiB'),igRange(r.minDisk,r.maxDisk,'GiB'),igStatus(r),acts];
 });
}
function igKindSection(kind){
 const def=IG_KINDS[kind];
 return '<div class="ig-sec">'
  +'<h2 class="sh2">'+esc(def.label)+'</h2>'
  +'<p class="vdsc">'+esc(def.blurb)+'</p>'
  +'<div class="ig-toolbar"><button type="button" class="b1" data-ig="setup" data-kind="'+esc(kind)+'">'+I('plus',16)+'Setup '+esc(def.short)+'</button></div>'
  +'<div class="tw" id="gt-ig-'+esc(kind)+'">'+tbl(def.cols,igTableRows(kind))+'</div>'
  +'</div>';
}
function integrationAdmin(){
 if(!isAdmin())return hd('Workers','Workers','Admin access required.');
 const items=igItems();
 const on=igActive();
 const k=on&&(on.kind==='ec2'?'server':on.kind);
 const mode=on?(IG_KINDS[k]&&IG_KINDS[k].label)||k:'Local runner';
 return hd('Workers','Workers','Ephemeral agents for plan, apply and destroy. Only one worker is active at a time. If none is enabled, terraform runs on this Terraplan host — same as Jenkins when master and agent are the same.')
  +heroCards('Workers')
  +kp([
   ['Active worker',on?on.name:'This host',on?mode:'No worker enabled','',on?C[1]:C[5]],
   ['Mode',mode,on?'Torn down after each run':'Master and worker are the same'],
   ['Configs',items.length,'Server, Docker and Kubernetes'],
   ['Last test',items.filter(x=>x.lastTestOk).length,'Successful probes']
  ])
  +igKindSection('server')+igKindSection('docker')+igKindSection('k8s');
}
function igAzLabel(list){
 const a=(list||[]).filter(Boolean);
 return a.length?a.join(', '):'Select availability zones';
}
const IG_CLOUD={
 aws:{
  regions:()=>AWS_REGIONS.map(r=>({value:r.id,label:r.id+' — '+r.name})),
  azs:AWS_AZS,types:()=>EC2_TYPES,defaultType:'t3.medium',
  typeLabel:'Instance type',amiLabel:'AMI ID',amiPh:'ami-0abcdef1234567890',
  amiHint:'Fetch uses AWS public SSM parameters for this region (Amazon Linux and Ubuntu). You can still paste an AMI ID.',
  fetchLbl:'Fetch AMIs',fetchPh:'Fetched Amazon images appear here',
  images:()=>AWS_AMIS.map(a=>({value:'ssm:'+a.ssm,label:a.label})),
  vpcLabel:'VPC ID',vpcPh:'vpc-0abcdef1234567890',
  subnetLabel:'Subnet IDs',subnetPh:'subnet-0123…, subnet-0456…',
  netTitle:'Security group',
  netBody:'Terraplan creates <span class="mono">terraplan-worker-sg</span> in this VPC with only the ports a worker needs: inbound SSH 22 from the VPC, outbound HTTPS 443 for git and providers. You do not paste a group ID.',
  iamTitle:'IAM instance profile',
  iamBody:'Terraplan creates and attaches <span class="mono">terraplan-worker</span> (SSM + artifact access). No profile name to enter.',
  testBusy:'Creating security group and instance profile, then bringing a throwaway AWS worker up…',
  testOk:'SG terraplan-worker-sg + IAM terraplan-worker ready. Worker came up, terraform 1.9.8 ok, instance terminated.'
 },
 gcp:{
  regions:()=>GCP_REGIONS.map(r=>({value:r.id,label:r.id+' — '+r.name})),
  azs:GCP_AZS,types:()=>GCP_TYPES,defaultType:'e2-standard-2',
  typeLabel:'Machine type',amiLabel:'Image',amiPh:'projects/debian-cloud/global/images/family/debian-12',
  amiHint:'Fetch lists public Compute Engine images for this region. You can still paste a family or image URL.',
  fetchLbl:'Fetch images',fetchPh:'Fetched GCP images appear here',
  images:()=>GCP_AMIS.map(a=>({value:a.id,label:a.label})),
  vpcLabel:'VPC network',vpcPh:'default',
  subnetLabel:'Subnetwork',subnetPh:'default',
  netTitle:'Firewall rules',
  netBody:'Terraplan creates <span class="mono">terraplan-worker-fw</span> on this network: inbound SSH 22 from the VPC, outbound HTTPS 443 for git and providers. You do not paste a firewall name.',
  iamTitle:'Service account',
  iamBody:'Terraplan creates and attaches <span class="mono">terraplan-worker</span> (artifact access). No service account email to enter.',
  testBusy:'Creating firewall and service account, then bringing a throwaway GCE worker up…',
  testOk:'Firewall terraplan-worker-fw + SA terraplan-worker ready. Worker came up, terraform 1.9.8 ok, instance terminated.'
 },
 azure:{
  regions:()=>AZURE_REGIONS.map(r=>({value:r.id,label:r.id+' — '+r.name})),
  azs:AZURE_AZS,types:()=>AZURE_TYPES,defaultType:'Standard_B2s',
  typeLabel:'VM size',amiLabel:'Image',amiPh:'Canonical:0001-com-ubuntu-server-noble:24_04-lts:latest',
  amiHint:'Fetch lists Azure Marketplace images for this location. You can still paste an image URN.',
  fetchLbl:'Fetch images',fetchPh:'Fetched Azure images appear here',
  images:()=>AZURE_AMIS.map(a=>({value:a.id,label:a.label})),
  vpcLabel:'Virtual network',vpcPh:'terraplan-vnet',
  subnetLabel:'Subnet',subnetPh:'terraplan-subnet',
  netTitle:'Network security group',
  netBody:'Terraplan creates <span class="mono">terraplan-worker-nsg</span> on this VNet: inbound SSH 22 from the VNet, outbound HTTPS 443 for git and providers. You do not paste an NSG name.',
  iamTitle:'Managed identity',
  iamBody:'Terraplan creates and assigns <span class="mono">terraplan-worker</span> (artifact access). No identity name to enter.',
  testBusy:'Creating NSG and managed identity, then bringing a throwaway Azure VM up…',
  testOk:'NSG terraplan-worker-nsg + identity terraplan-worker ready. Worker came up, terraform 1.9.8 ok, VM terminated.'
 }
};
function openIgServerModal(existing){
 const on=igActive();
 closeUModal();
 const startCloud=(existing&&existing.cloud)||'aws';
 const azSel=(existing&&existing.az?String(existing.az).split(',').map(s=>s.trim()).filter(Boolean):[]);
 const body=document.createElement('div');body.className='umodal';body.id='umodal';
 body.innerHTML='<div class="md card-md cr-modal ig-modal">'
  +'<div class="md-hd"><h3>'+(existing?'Edit ':'Setup ')+'Server</h3>'
  +'<p class="md-cs">A new VM starts for each terraform run, then terminates. Only one worker can be enabled at a time'
  +(on&&!(existing&&existing.enabled)?' — currently '+esc(on.name)+'.':'')+'.</p></div>'
  +'<div class="md-bd"><div class="ig-grid">'
  +'<div class="ig-span"><label>Cloud <span class="sub">required</span></label>'
  +'<div class="ig-clouds" role="radiogroup">'
  +['aws','gcp','azure'].map(c=>'<button type="button" class="ig-cloud'+(c===startCloud?' on':'')+'" data-pick-cloud="'+c+'" role="radio" aria-checked="'+(c===startCloud?'true':'false')+'">'+igIco(c,18)+'<span>'+esc(igCloudLabel(c))+'</span></button>').join('')
  +'</div><input type="hidden" id="ig-cloud" value="'+esc(startCloud)+'"></div>'
  +'<div class="ig-span"><label>Name of worker <span class="sub">required</span></label><input id="ig-name" value="'+esc(existing&&existing.name||'')+'" placeholder="e.g. terraform-server-workers" autocomplete="off"></div>'
  +'<div><label>Region <span class="sub">required</span></label>'+_cgSelect('ig-region',[{value:'',label:'Select region'}],existing&&existing.region||'')+'</div>'
  +'<div><label>Capacity type <span class="sub">required</span></label>'+_cgSelect('ig-capacity',[{value:'on-demand',label:'on-demand'},{value:'spot',label:'spot'}],existing&&existing.capacity||'on-demand')+'</div>'
  +'<div class="ig-span"><label>Availability zones <span class="sub">required · multi-select</span></label>'
  +'<div class="role-dd ig-az-dd"><div class="role-dd-wrap">'
  +'<button type="button" class="role-dd-trig" id="ig-az-box" aria-haspopup="listbox" aria-expanded="false">'
  +'<span class="role-dd-val" id="ig-az-val">'+esc(igAzLabel(azSel))+'</span>'
  +'<svg class="role-dd-chv" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  +'</button>'
  +'<input type="hidden" id="ig-az" value="'+esc(azSel.join(', '))+'">'
  +'<div class="mn act role-dd-mn hide" id="ig-az-mn" role="listbox"></div>'
  +'</div></div>'
  +'<p class="sub" id="ig-az-hint">Pick a region to load its availability zones.</p></div>'
  +'<div><label id="ig-lbl-type">Instance type <span class="sub">required</span></label>'+_cgSelect('ig-instanceType',[{value:'t3.medium',label:'t3.medium'}],existing&&existing.instanceType||'t3.medium')+'</div>'
  +'<div class="ig-span"><label id="ig-lbl-ami">AMI ID <span class="sub">required · paste or fetch</span></label>'
  +'<div class="ig-ami-row">'
  +'<input id="ig-ami" value="'+esc(existing&&existing.ami||'')+'" placeholder="ami-0abcdef1234567890" autocomplete="off">'
  +'<button type="button" class="b2 sm" id="ig-ami-fetch">'+I('refresh',14)+'<span id="ig-fetch-lbl">Fetch AMIs</span></button>'
  +'</div>'
  +_cgSelect('ig-ami-pick',[{value:'',label:'Fetched images appear here'}],'')
  +'<p class="sub" id="ig-ami-hint"></p></div>'
  +'<div><label id="ig-lbl-vpc">VPC ID <span class="sub">required</span></label><input id="ig-vpc" value="'+esc(existing&&existing.vpc||'')+'" placeholder="vpc-0abcdef1234567890" autocomplete="off"></div>'
  +'<div><label id="ig-lbl-subnet">Subnet IDs <span class="sub">required</span></label><input id="ig-subnet" value="'+esc(existing&&existing.subnet||'')+'" placeholder="subnet-0123…, subnet-0456…" autocomplete="off"></div>'
  +'<div class="ig-span ig-auto-card"><b id="ig-net-title">Security group</b><span id="ig-net-body"></span></div>'
  +'<div class="ig-span ig-auto-card"><b id="ig-iam-title">IAM instance profile</b><span id="ig-iam-body"></span></div>'
  +'</div><div id="ig-test-result"></div></div>'
  +'<div class="md-ft cr-modal-ft">'
  +'<button type="button" class="b2 cr-test-btn" id="utest">'+I('activity',14)+'Test</button>'
  +'<div style="flex:1"></div>'
  +'<button type="button" class="b2" id="ucancel">Cancel</button>'
  +'<button type="button" class="b1" id="usave">Save</button>'
  +'</div></div>';
 document.body.appendChild(body);
 _wireCgSelects(body);
 const q=sel=>body.querySelector(sel);
 const azBox=q('#ig-az-box'),azMn=q('#ig-az-mn'),azHid=q('#ig-az'),azVal=q('#ig-az-val');
 const cloudEl=q('#ig-cloud');
 const selected=()=>String(azHid.value||'').split(',').map(s=>s.trim()).filter(Boolean);
 const setAz=list=>{azHid.value=list.join(', ');if(azVal)azVal.textContent=igAzLabel(list)};
 const cloudOf=()=>cloudEl.value||'aws';
 const metaOf=()=>IG_CLOUD[cloudOf()]||IG_CLOUD.aws;
 const paintAzMenu=()=>{
  const meta=metaOf();
  const region=q('#ig-region');
  const zones=meta.azs(region&&region.value||'');
  const onZ=new Set(selected());
  azMn.innerHTML=zones.length
   ?zones.map(z=>'<button type="button" class="ami'+(onZ.has(z)?' on':'')+'" data-az-opt="'+esc(z)+'" role="option" aria-selected="'+(onZ.has(z)?'true':'false')+'">'+esc(z)+'</button>').join('')
   :'<button type="button" class="ami" disabled>Select a region first</button>';
  q('#ig-az-hint').textContent=zones.length?'Click to add or remove zones.':'Pick a region to load its availability zones.';
 };
 const applyCloud=(cloud,keep)=>{
  cloudEl.value=cloud;
  body.querySelectorAll('[data-pick-cloud]').forEach(b=>{
   const on=b.getAttribute('data-pick-cloud')===cloud;
   b.classList.toggle('on',on);b.setAttribute('aria-checked',on?'true':'false');
  });
  const meta=IG_CLOUD[cloud]||IG_CLOUD.aws;
  const regionVal=keep&&q('#ig-region')?q('#ig-region').value:'';
  const typeVal=keep&&q('#ig-instanceType')?q('#ig-instanceType').value:meta.defaultType;
  igFillDd(body,'ig-region',meta.regions(),regionVal,'Select region');
  igFillDd(body,'ig-instanceType',meta.types().map(t=>({value:t,label:t})),typeVal||meta.defaultType,'');
  q('#ig-lbl-type').innerHTML=esc(meta.typeLabel)+' <span class="sub">required</span>';
  q('#ig-lbl-ami').innerHTML=esc(meta.amiLabel)+' <span class="sub">required · paste or fetch</span>';
  q('#ig-lbl-vpc').innerHTML=esc(meta.vpcLabel)+' <span class="sub">required</span>';
  q('#ig-lbl-subnet').innerHTML=esc(meta.subnetLabel)+' <span class="sub">required</span>';
  q('#ig-ami').placeholder=meta.amiPh;
  q('#ig-vpc').placeholder=meta.vpcPh;
  q('#ig-subnet').placeholder=meta.subnetPh;
  q('#ig-fetch-lbl').textContent=meta.fetchLbl;
  q('#ig-ami-hint').textContent=meta.amiHint;
  q('#ig-net-title').textContent=meta.netTitle;
  q('#ig-net-body').innerHTML=meta.netBody;
  q('#ig-iam-title').textContent=meta.iamTitle;
  q('#ig-iam-body').innerHTML=meta.iamBody;
  if(!keep){setAz([]);q('#ig-ami').value='';q('#ig-vpc').value='';q('#ig-subnet').value=''}
  else{
   const keepAz=selected().filter(z=>(meta.azs(q('#ig-region').value)||[]).includes(z));
   setAz(keepAz);
  }
  igFillDd(body,'ig-ami-pick',[],'',meta.fetchPh);
  paintAzMenu();
 };
 const openAz=()=>{paintAzMenu();azMn.classList.remove('hide');azBox.classList.add('open');azBox.setAttribute('aria-expanded','true')};
 const closeAz=()=>{azMn.classList.add('hide');azBox.classList.remove('open');azBox.setAttribute('aria-expanded','false')};
 azBox.addEventListener('click',e=>{
  e.preventDefault();e.stopPropagation();
  if(azMn.classList.contains('hide'))openAz();else closeAz();
 });
 azMn.addEventListener('click',e=>{
  const b=e.target.closest('[data-az-opt]');if(!b)return;
  e.preventDefault();e.stopPropagation();
  const z=b.getAttribute('data-az-opt');const cur=selected();
  setAz(cur.includes(z)?cur.filter(x=>x!==z):cur.concat([z]));
  paintAzMenu();
 });
 body.addEventListener('click',e=>{
  const pick=e.target.closest('[data-pick-cloud]');if(!pick)return;
  e.preventDefault();
  const next=pick.getAttribute('data-pick-cloud');
  if(next===cloudOf())return;
  applyCloud(next,false);
 });
 body.addEventListener('change',e=>{
  if(e.target&&e.target.id==='ig-region'){
   const meta=metaOf();
   const keep=selected().filter(z=>(meta.azs(q('#ig-region').value)||[]).includes(z));
   setAz(keep);paintAzMenu();
   igFillDd(body,'ig-ami-pick',[],'',meta.fetchPh);
  }
  if(e.target&&e.target.id==='ig-ami-pick'){
   const v=e.target.value;
   if(v)q('#ig-ami').value=v.startsWith('ssm:')?v.slice(4):v;
  }
 });
 applyCloud(startCloud,true);
 q('#ig-ami-fetch').onclick=()=>{
  const region=q('#ig-region');
  if(!region||!region.value){toast('Select a region first');return}
  const meta=metaOf();
  const imgs=meta.images();
  igFillDd(body,'ig-ami-pick',imgs,'',meta.fetchPh+' · '+region.value);
  toast('Loaded '+imgs.length+' images for '+region.value);
 };
 const setResult=(ok,msg)=>{
  const el=q('#ig-test-result');if(!el)return;
  el.style.cssText='margin:10px 0 0;padding:6px 8px;border-radius:3px;font-size:11px;line-height:1.4;'
   +(ok?'background:color-mix(in srgb,var(--ok) 10%,transparent);color:var(--ok)'
       :'background:color-mix(in srgb,var(--bad) 10%,transparent);color:var(--bad)');
  el.textContent=msg;
 };
 const draft=()=>igReadForm(body,'server');
 q('#ucancel').onclick=closeUModal;
 body.onclick=e=>{if(e.target===body)closeUModal()};
 q('#utest').onclick=async()=>{
  const row=draft();
  const miss=igMissing('server',row);
  if(miss.length){setResult(false,'Fill required fields first: '+miss.join(', '));return}
  const meta=metaOf();
  q('#utest').disabled=true;
  setResult(true,meta.testBusy);
  await new Promise(r=>setTimeout(r,1100));
  setResult(true,meta.testOk);
  q('#utest').disabled=false;
 };
 q('#usave').onclick=()=>{
  const row=draft();
  if(!row.name){toast('Name is required');return}
  const miss=igMissing('server',row);
  if(miss.length){toast('Required: '+miss.join(', '));return}
  const s=igStore();
  if(existing){
   const i=s.items.findIndex(x=>x.id===existing.id);
   if(i>=0)s.items[i]=Object.assign({},existing,row,{id:existing.id,kind:'server',enabled:!!existing.enabled});
  }else{
   if(s.items.filter(x=>igIsKind(x,'server')).length>=1){toast('Only one Server worker at a time. Edit the existing one, or remove it first.');return}
   s.items.push(Object.assign({id:'ig-'+Date.now(),enabled:false,lastTest:null,lastTestOk:false},row,{kind:'server'}));
  }
  igSave(s);
  closeUModal();
  toast('Server worker saved. Enable it to use workers instead of this host.');
  if(window.__refreshIntegration)window.__refreshIntegration();
 };
}
function openIgModal(kind,id){
 if(kind==='ec2')kind='server';
 const def=IG_KINDS[kind];if(!def)return;
 const existing=id?igItems().find(x=>x.id===id):null;
 if(kind==='server'){openIgServerModal(existing);return}
 const on=igActive();
 closeUModal();
 const body=document.createElement('div');body.className='umodal';body.id='umodal';
 const fields=def.fields.map(f=>'<div class="'+(f.span?'ig-span':'')+'"><label>'+esc(f.label)+(f.req?' <span class="sub">required</span>':'')+'</label>'+igFieldInput(f,existing&&existing[f.id])+'</div>').join('');
 body.innerHTML='<div class="md card-md cr-modal ig-modal">'
  +'<div class="md-hd"><h3>'+(existing?'Edit ':'Setup ')+esc(def.label)+'</h3>'
  +'<p class="md-cs">Workers use this shape, run terraform, then terminate. Only one worker can be enabled at a time'
  +(on&&!(existing&&existing.enabled)?' — currently '+esc(on.name)+'.':'')+'.</p></div>'
  +'<div class="md-bd"><div class="ig-grid">'+fields+'</div><div id="ig-test-result"></div></div>'
  +'<div class="md-ft cr-modal-ft">'
  +'<button type="button" class="b2 cr-test-btn" id="utest">'+I('activity',14)+'Test</button>'
  +'<div style="flex:1"></div>'
  +'<button type="button" class="b2" id="ucancel">Cancel</button>'
  +'<button type="button" class="b1" id="usave">Save</button>'
  +'</div></div>';
 document.body.appendChild(body);
 _wireCgSelects(body);
 const q=sel=>body.querySelector(sel);
 const setResult=(ok,msg)=>{
  const el=q('#ig-test-result');if(!el)return;
  el.style.cssText='margin:10px 0 0;padding:6px 8px;border-radius:3px;font-size:11px;line-height:1.4;'
   +(ok?'background:color-mix(in srgb,var(--ok) 10%,transparent);color:var(--ok)'
       :'background:color-mix(in srgb,var(--bad) 10%,transparent);color:var(--bad)');
  el.textContent=msg;
 };
 const draft=()=>igReadForm(body,kind);
 q('#ucancel').onclick=closeUModal;
 body.onclick=e=>{if(e.target===body)closeUModal()};
 q('#utest').onclick=async()=>{
  const row=draft();
  const miss=igMissing(kind,row);
  if(miss.length){setResult(false,'Fill required fields first: '+miss.join(', '));return}
  q('#utest').disabled=true;
  setResult(true,'Bringing a throwaway '+def.short+' worker up…');
  await new Promise(r=>setTimeout(r,900));
  setResult(true,def.short+' worker came up, terraform 1.9.8 ok, worker terminated.');
  q('#utest').disabled=false;
 };
 q('#usave').onclick=()=>{
  const row=draft();
  if(!row.name){toast('Name is required');return}
  const miss=igMissing(kind,row);
  if(miss.length){toast('Required: '+miss.join(', '));return}
  const s=igStore();
  if(existing){
   const i=s.items.findIndex(x=>x.id===existing.id);
   if(i>=0)s.items[i]=Object.assign({},existing,row,{id:existing.id,kind,enabled:!!existing.enabled});
  }else{
   if(s.items.filter(x=>x.kind===kind).length>=1){
    toast('Only one '+def.short+' worker at a time. Edit the existing one, or remove it first.');
    return;
   }
   s.items.push(Object.assign({id:'ig-'+Date.now(),enabled:false,lastTest:null,lastTestOk:false},row,{kind}));
  }
  igSave(s);
  closeUModal();
  toast(def.short+' worker saved. Enable it to use workers instead of this host.');
  if(window.__refreshIntegration)window.__refreshIntegration();
 };
}
async function igRunTest(id,btn){
 const s=igStore();const row=s.items.find(x=>x.id===id);if(!row)return;
 const kind=row.kind==='ec2'?'server':row.kind;
 const def=IG_KINDS[kind]||{short:'Worker'};
 const resEl=document.getElementById('ig-test-res-'+id);
 const setRes=(ok,msg)=>{if(!resEl)return;resEl.textContent=msg;resEl.className='cr-test-res '+(ok?'cr-test-res-ok':'cr-test-res-err')};
 const miss=igMissing(kind,row);
 if(btn)btn.disabled=true;
 setRes(true,'Starting worker…');
 await new Promise(r=>setTimeout(r,900));
 if(miss.length){
  row.lastTest=new Date().toISOString();row.lastTestOk=false;igSave(s);
  setRes(false,'Missing '+miss[0]);
 }else{
  row.lastTest=new Date().toISOString();row.lastTestOk=true;igSave(s);
  setRes(true,def.short+' up · terraform ok · terminated');
 }
 if(btn)btn.disabled=false;
}

/* ── Integration credentials (AWS / Docker / Kubernetes) ────────── */
function icStore(){try{const raw=JSON.parse(sessionStorage.getItem('tp-int-creds')||'{}');return {aws:Array.isArray(raw.aws)?raw.aws:[],docker:Array.isArray(raw.docker)?raw.docker:[],k8s:Array.isArray(raw.k8s)?raw.k8s:[]}}catch(e){return {aws:[],docker:[],k8s:[]}}}
function icSave(s){try{sessionStorage.setItem('tp-int-creds',JSON.stringify({aws:s.aws||[],docker:s.docker||[],k8s:s.k8s||[]}))}catch(e){}}
const IC_POLICY={
 aws:{
  Version:'2012-10-17',
  Statement:[{
   Sid:'TerraplanCreateEphemeralWorkers',
   Effect:'Allow',
   Action:[
    'ec2:RunInstances','ec2:TerminateInstances','ec2:DescribeInstances','ec2:DescribeInstanceStatus',
    'ec2:DescribeImages','ec2:DescribeSubnets','ec2:DescribeVpcs','ec2:DescribeSecurityGroups',
    'ec2:CreateSecurityGroup','ec2:DeleteSecurityGroup','ec2:AuthorizeSecurityGroupIngress','ec2:AuthorizeSecurityGroupEgress',
    'ec2:CreateTags','ec2:DescribeAvailabilityZones',
    'iam:CreateRole','iam:GetRole','iam:PutRolePolicy','iam:AttachRolePolicy',
    'iam:CreateInstanceProfile','iam:GetInstanceProfile','iam:AddRoleToInstanceProfile','iam:PassRole',
    'ssm:GetParameter','ssm:GetParameters','ssm:DescribeInstanceInformation','ssm:SendCommand','ssm:GetCommandInvocation'
   ],
   Resource:'*'
  }]
 },
 docker:{
  Version:'1',
  Sid:'TerraplanDockerWorker',
  Description:'Grant this Docker host / TLS client the APIs Terraplan uses to start a throwaway worker container.',
  Allow:[
   'container:create','container:start','container:stop','container:kill','container:remove',
   'container:inspect','container:logs','image:pull','network:connect','volume:create','volume:mount'
  ]
 },
 k8s:{
  apiVersion:'rbac.authorization.k8s.io/v1',
  kind:'ClusterRole',
  metadata:{name:'terraplan-worker'},
  rules:[
   {apiGroups:[''],resources:['pods','pods/log','pods/exec','pods/status'],verbs:['create','get','list','watch','delete']},
   {apiGroups:[''],resources:['secrets','configmaps'],verbs:['get','list']},
   {apiGroups:[''],resources:['events'],verbs:['list','watch']}
  ]
 }
};
const IC_KINDS={
 aws:{id:'aws',label:'AWS',short:'AWS',blurb:'IAM user keys Terraplan uses to create and tear down Server workers. Attach the policy below to that user, then paste the access key here.',
  cols:['Name','Access key','Region','Status','Actions']},
 docker:{id:'docker',label:'Docker',short:'Docker',blurb:'Daemon or TLS credentials Terraplan uses to start a worker container. Grant the JSON permissions on the host, then add the connection here.',
  cols:['Name','Host','User','Status','Actions']},
 k8s:{id:'k8s',label:'Kubernetes',short:'Kubernetes',blurb:'Cluster credentials Terraplan uses to schedule a worker pod. Bind the ClusterRole below to a service account, then paste the token or kubeconfig.',
  cols:['Name','API server','Namespace','Status','Actions']}
};
function icPolicyText(kind){return JSON.stringify(IC_POLICY[kind],null,2)}
function icMask(v){const s=String(v||'');if(!s)return '—';if(s.length<=8)return '••••••••';return s.slice(0,4)+'••••'+s.slice(-4)}
function icStatus(row){if(row.lastTestOk)return 'ok:Ready';if(row.lastTest)return 'bad:Test failed';return 'mut:Not tested'}
function icActs(kind,id){
 return 'html:'
  +'<button class="b2 sm" data-ic="edit" data-kind="'+esc(kind)+'" data-id="'+esc(id)+'">'+I('edit',14)+'Edit</button> '
  +'<button class="b2 sm cr-test-btn" data-ic="test" data-kind="'+esc(kind)+'" data-id="'+esc(id)+'">'+I('activity',14)+'Test</button><span id="ic-test-res-'+esc(id)+'" class="cr-test-res"></span> '
  +'<button class="b2 sm" data-ic="delete" data-kind="'+esc(kind)+'" data-id="'+esc(id)+'" style="color:var(--bad)">'+I('trash',14)+'Remove</button>';
}
function icRows(kind){
 const def=IC_KINDS[kind];
 const rows=icStore()[kind]||[];
 if(!rows.length)return [def.cols.map((_,i)=>i===def.cols.length-1?'html:<span class="sub">No credentials yet</span>':'—')];
 return rows.map(r=>{
  const name='html:'+esc(r.name||'—');
  const acts=icActs(kind,r.id);
  if(kind==='aws')return [name,icMask(r.accessKey),r.region||'—',icStatus(r),acts];
  if(kind==='docker')return [name,r.host||'—',r.username||'—',icStatus(r),acts];
  return [name,r.apiServer||'—',r.namespace||'—',icStatus(r),acts];
 });
}
function icPolicyBox(kind){
 const title=kind==='aws'?'Required IAM policy':kind==='docker'?'Required Docker permissions':'Required ClusterRole';
 const hint=kind==='aws'?'Attach this policy to the IAM user, then paste that user’s access keys below.'
  :kind==='docker'?'The Docker host / TLS client needs these APIs so Terraplan can create a worker container.'
  :'Bind this ClusterRole to a service account, then paste the token or kubeconfig below.';
 return '<div class="in-policy">'
  +'<div class="in-policy-hd"><b>'+esc(title)+'</b>'
  +'<span class="in-copy-wrap"><button type="button" class="b2 sm" data-ic="copy" data-kind="'+esc(kind)+'">'+I('clip',14)+'Copy JSON</button><span class="cr-test-res" id="ic-copy-res-'+esc(kind)+'"></span></span></div>'
  +'<p class="sub">'+esc(hint)+'</p>'
  +'<pre class="in-policy-pre" id="ic-policy-'+esc(kind)+'">'+esc(icPolicyText(kind))+'</pre>'
  +'</div>';
}
function icSection(kind){
 const def=IC_KINDS[kind];
 return '<div class="ig-sec">'
  +'<h2 class="sh2">'+esc(def.label)+'</h2>'
  +'<p class="vdsc">'+esc(def.blurb)+'</p>'
  +icPolicyBox(kind)
  +'<div class="ig-toolbar"><button type="button" class="b1" data-ic="add" data-kind="'+esc(kind)+'">'+I('plus',16)+'Add '+esc(def.short)+' credentials</button></div>'
  +'<div class="tw" id="gt-ic-'+esc(kind)+'">'+tbl(def.cols,icRows(kind))+'</div>'
  +'</div>';
}
function intCredsAdmin(){
 if(!isAdmin())return hd('Integration','Integration','Admin access required.');
 const s=icStore();
 const n=(s.aws.length+s.docker.length+s.k8s.length);
 return hd('Integration','Integration','Credentials Terraplan uses to talk to AWS, Docker and Kubernetes when it creates ephemeral workers. Secrets are stored encrypted and never shown in full.')
  +heroCards('Integration')
  +kp([
   ['Profiles',n,'AWS, Docker and Kubernetes'],
   ['AWS',s.aws.length,'IAM user keys'],
   ['Docker',s.docker.length,'Daemon / TLS'],
   ['Kubernetes',s.k8s.length,'Cluster tokens']
  ])
  +icSection('aws')+icSection('docker')+icSection('k8s');
}
function icCopyPolicy(kind,btn){
 const t=icPolicyText(kind);if(!t)return;
 const done=()=>{
  const el=document.getElementById('ic-copy-res-'+kind);
  if(el){el.textContent='Copied';el.className='cr-test-res cr-test-res-ok';clearTimeout(el.__t);el.__t=setTimeout(()=>{if(el.textContent==='Copied')el.textContent=''},2500)}
  else btnNote(btn,'Copied',true);
 };
 if(navigator.clipboard&&navigator.clipboard.writeText){
  navigator.clipboard.writeText(t).then(done).catch(()=>{
   const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();done();
  });
 }else{
  const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();done();
 }
}
function openIntCredModal(kind,existing){
 const def=IC_KINDS[kind];if(!def)return;
 closeUModal();
 const body=document.createElement('div');body.className='umodal';body.id='umodal';
 const keep=existing?'•••• leave blank to keep':'';
 let fields='';
 if(kind==='aws'){
  fields='<div class="ig-grid">'
   +'<div class="ig-span"><label>Name <span class="sub">required</span></label><input id="ic-name" value="'+esc(existing&&existing.name||'')+'" placeholder="e.g. prod-worker-iam" autocomplete="off"></div>'
   +'<div><label>Access key ID <span class="sub">required</span></label><input id="ic-accessKey" value="'+esc(existing&&existing.accessKey||'')+'" placeholder="AKIA…" autocomplete="off"></div>'
   +'<div><label>Secret access key <span class="sub">'+(existing?'leave blank to keep':'required')+'</span></label><input id="ic-secretKey" type="password" placeholder="'+(keep||'wJalrXUtnFEMI/K7MDENG…')+'" autocomplete="off"></div>'
   +'<div><label>Session token <span class="sub">optional</span></label><input id="ic-sessionToken" type="password" placeholder="'+(existing&&existing.sessionToken?keep:'STS token')+'" autocomplete="off"></div>'
   +'<div class="ig-span"><label>Default region</label>'+_cgSelect('ic-region',[{value:'',label:'Select region'}].concat(AWS_REGIONS.map(r=>({value:r.id,label:r.id+' — '+r.name}))),existing&&existing.region||'')+'</div>'
   +'</div>';
 }else if(kind==='docker'){
  fields='<div class="ig-grid">'
   +'<div class="ig-span"><label>Name <span class="sub">required</span></label><input id="ic-name" value="'+esc(existing&&existing.name||'')+'" placeholder="e.g. docker-workers" autocomplete="off"></div>'
   +'<div class="ig-span"><label>Docker host <span class="sub">required</span></label><input id="ic-host" value="'+esc(existing&&existing.host||'')+'" placeholder="unix:///var/run/docker.sock or tcp://host:2376" autocomplete="off"></div>'
   +'<div><label>Username</label><input id="ic-username" value="'+esc(existing&&existing.username||'')+'" placeholder="optional registry user" autocomplete="off"></div>'
   +'<div><label>Password / token</label><input id="ic-password" type="password" placeholder="'+(existing&&existing.password?keep:'optional')+'" autocomplete="off"></div>'
   +'<div class="ig-span"><label>CA certificate <span class="sub">optional · TLS</span></label><textarea id="ic-ca" rows="3" placeholder="-----BEGIN CERTIFICATE-----">'+esc(existing&&existing.ca||'')+'</textarea></div>'
   +'<div><label>Client cert</label><textarea id="ic-cert" rows="3" placeholder="-----BEGIN CERTIFICATE-----">'+esc(existing&&existing.cert||'')+'</textarea></div>'
   +'<div><label>Client key</label><textarea id="ic-key" rows="3" placeholder="-----BEGIN PRIVATE KEY-----">'+esc(existing&&existing.key||'')+'</textarea></div>'
   +'</div>';
 }else{
  fields='<div class="ig-grid">'
   +'<div class="ig-span"><label>Name <span class="sub">required</span></label><input id="ic-name" value="'+esc(existing&&existing.name||'')+'" placeholder="e.g. prod-cluster" autocomplete="off"></div>'
   +'<div class="ig-span"><label>API server <span class="sub">required</span></label><input id="ic-apiServer" value="'+esc(existing&&existing.apiServer||'')+'" placeholder="https://k8s.example.com" autocomplete="off"></div>'
   +'<div><label>Namespace</label><input id="ic-namespace" value="'+esc(existing&&existing.namespace||'terraplan')+'" placeholder="terraplan" autocomplete="off"></div>'
   +'<div><label>Bearer token</label><input id="ic-token" type="password" placeholder="'+(existing&&existing.token?keep:'service account token')+'" autocomplete="off"></div>'
   +'<div class="ig-span"><label>Kubeconfig <span class="sub">optional · paste YAML instead of token</span></label><textarea id="ic-kubeconfig" rows="6" placeholder="apiVersion: v1&#10;kind: Config">'+esc(existing&&existing.kubeconfig||'')+'</textarea></div>'
   +'</div>';
 }
 body.innerHTML='<div class="md card-md cr-modal ig-modal">'
  +'<div class="md-hd"><h3>'+(existing?'Edit ':'Add ')+esc(def.label)+' credentials</h3>'
  +'<p class="md-cs">Used only to create ephemeral workers. Secrets are never shown in full after save.</p></div>'
  +'<div class="md-bd">'+fields+'<div id="ic-test-result"></div></div>'
  +'<div class="md-ft cr-modal-ft">'
  +'<button type="button" class="b2 cr-test-btn" id="utest">'+I('activity',14)+'Test</button>'
  +'<div style="flex:1"></div>'
  +'<button type="button" class="b2" id="ucancel">Cancel</button>'
  +'<button type="button" class="b1" id="usave">Save</button>'
  +'</div></div>';
 document.body.appendChild(body);
 _wireCgSelects(body);
 const q=sel=>body.querySelector(sel);
 const setResult=(ok,msg)=>{
  const el=q('#ic-test-result');if(!el)return;
  el.style.cssText='margin:10px 0 0;padding:6px 8px;border-radius:3px;font-size:11px;line-height:1.4;'
   +(ok?'background:color-mix(in srgb,var(--ok) 10%,transparent);color:var(--ok)'
       :'background:color-mix(in srgb,var(--bad) 10%,transparent);color:var(--bad)');
  el.textContent=msg;
 };
 const read=()=>{
  const v=id=>{const el=q('#'+id);return el?String(el.value||'').trim():''};
  const row={kind,name:v('ic-name')};
  if(kind==='aws'){
   row.accessKey=v('ic-accessKey');
   row.secretKey=v('ic-secretKey')||(existing&&existing.secretKey)||'';
   row.sessionToken=v('ic-sessionToken')||(existing&&existing.sessionToken)||'';
   row.region=v('ic-region');
  }else if(kind==='docker'){
   row.host=v('ic-host');
   row.username=v('ic-username');
   row.password=v('ic-password')||(existing&&existing.password)||'';
   row.ca=v('ic-ca');row.cert=v('ic-cert');row.key=v('ic-key');
  }else{
   row.apiServer=v('ic-apiServer');
   row.namespace=v('ic-namespace')||'terraplan';
   row.token=v('ic-token')||(existing&&existing.token)||'';
   row.kubeconfig=v('ic-kubeconfig');
  }
  return row;
 };
 const missing=row=>{
  if(!row.name)return ['Name'];
  if(kind==='aws')return [!row.accessKey&&'Access key ID',!row.secretKey&&'Secret access key'].filter(Boolean);
  if(kind==='docker')return [!row.host&&'Docker host'].filter(Boolean);
  return [!row.apiServer&&'API server',!(row.token||row.kubeconfig)&&'Bearer token or kubeconfig'].filter(Boolean);
 };
 q('#ucancel').onclick=closeUModal;
 body.onclick=e=>{if(e.target===body)closeUModal()};
 q('#utest').onclick=async()=>{
  const row=read();const miss=missing(row);
  if(miss.length){setResult(false,'Fill required fields first: '+miss.join(', '));return}
  q('#utest').disabled=true;
  setResult(true,'Checking '+def.short+' credentials…');
  await new Promise(r=>setTimeout(r,900));
  setResult(true,def.short+' credentials can create a worker.');
  q('#utest').disabled=false;
 };
 q('#usave').onclick=()=>{
  const row=read();const miss=missing(row);
  if(miss.length){toast('Required: '+miss.join(', '));return}
  const s=icStore();
  const list=s[kind]||[];
  if(existing){
   const i=list.findIndex(x=>x.id===existing.id);
   if(i>=0)list[i]=Object.assign({},existing,row,{id:existing.id});
  }else{
   list.push(Object.assign({id:'ic-'+Date.now(),lastTest:null,lastTestOk:false},row));
  }
  s[kind]=list;icSave(s);
  closeUModal();
  toast(def.short+' credentials saved.');
  if(window.__refreshIntCreds)window.__refreshIntCreds();
 };
}
async function icRunTest(kind,id,btn){
 const s=icStore();const row=(s[kind]||[]).find(x=>x.id===id);if(!row)return;
 const resEl=document.getElementById('ic-test-res-'+id);
 const setRes=(ok,msg)=>{if(!resEl)return;resEl.textContent=msg;resEl.className='cr-test-res '+(ok?'cr-test-res-ok':'cr-test-res-err')};
 if(btn)btn.disabled=true;
 setRes(true,'Testing…');
 await new Promise(r=>setTimeout(r,800));
 row.lastTest=new Date().toISOString();row.lastTestOk=true;icSave(s);
 setRes(true,'Credentials ok');
 if(btn)btn.disabled=false;
}

/* ── Connect Repositories page ──────────────────────────────────── */

/* In-memory credential profile store (persists across page refreshes via sessionStorage) */
function crProfiles(){try{return JSON.parse(sessionStorage.getItem('cr-profiles')||'[]')}catch(e){return[]}}
function saveCrProfiles(p){try{sessionStorage.setItem('cr-profiles',JSON.stringify(p))}catch(e){}}
function crRepos(){try{return JSON.parse(sessionStorage.getItem('cr-repos')||'[]')}catch(e){return[]}}
function saveCrRepos(r){try{sessionStorage.setItem('cr-repos',JSON.stringify(r))}catch(e){}}

const PROVIDER_LABELS={'bitbucket':'Bitbucket','github':'GitHub','gitlab':'GitLab'};
const PROVIDER_COLORS={'bitbucket':'var(--c1)','github':'var(--fg)','gitlab':'var(--c4)'};
const PROVIDER_ICONS={
 bitbucket:'<svg viewBox="0 0 32 32" width="14" height="14" aria-hidden="true" style="flex:none;vertical-align:middle"><path d="M2.07 5a.9.9 0 0 0-.9 1.05L5.1 26.14a1.22 1.22 0 0 0 1.19 1H25.9a.9.9 0 0 0 .88-.75L30.84 6.06A.9.9 0 0 0 29.94 5zm17.1 14.44h-6.33L11.4 12.56h9.26z" fill="#2684FF"/></svg>',
 github:'<svg viewBox="0 0 32 32" width="14" height="14" aria-hidden="true" style="flex:none;vertical-align:middle"><path d="M16 2a14 14 0 0 0-4.43 27.28c.7.13.95-.3.95-.67v-2.34c-3.9.85-4.72-1.88-4.72-1.88a3.71 3.71 0 0 0-1.56-2.05c-1.27-.87.1-.85.1-.85a2.94 2.94 0 0 1 2.14 1.44 2.98 2.98 0 0 0 4.08 1.16 3 3 0 0 1 .89-1.87c-3.1-.35-6.37-1.56-6.37-6.93a5.42 5.42 0 0 1 1.44-3.76 5.04 5.04 0 0 1 .14-3.7s1.18-.38 3.85 1.44a13.27 13.27 0 0 1 7.02 0c2.67-1.82 3.84-1.44 3.84-1.44a5.04 5.04 0 0 1 .14 3.7 5.42 5.42 0 0 1 1.44 3.76c0 5.38-3.28 6.57-6.4 6.92a3.35 3.35 0 0 1 .95 2.6v3.86c0 .37.25.8.96.67A14 14 0 0 0 16 2z" fill="currentColor"/></svg>',
 gitlab:'<svg viewBox="0 0 32 32" width="14" height="14" aria-hidden="true" style="flex:none;vertical-align:middle"><path d="M31.46 12.9l-1.75-5.4a.9.9 0 0 0-1.7-.01l-3.33 10.26H7.32L4 7.5a.9.9 0 0 0-1.71.01L.54 12.9a6.27 6.27 0 0 0 2.27 7.02l12.56 9.12a1 1 0 0 0 1.26 0l12.56-9.12a6.27 6.27 0 0 0 2.27-7.02z" fill="#FC6D26"/><path d="M16 29.04L21.53 12.75H10.47z" fill="#E24329"/><path d="M16 29.04l-5.53-16.29H3.19z" fill="#FC6D26"/><path d="M3.19 12.75l-1.65 5.08a.6.6 0 0 0 .22.68L16 29.04z" fill="#FCA326"/><path d="M3.19 12.75h7.28L7.32 3.5a.45.45 0 0 0-.86 0z" fill="#E24329"/><path d="M16 29.04l5.53-16.29h7.28z" fill="#FC6D26"/><path d="M28.81 12.75l1.65 5.08a.6.6 0 0 1-.22.68L16 29.04z" fill="#FCA326"/><path d="M28.81 12.75h-7.28l3.15-9.25a.45.45 0 0 1 .86 0z" fill="#E24329"/></svg>'
};
const FREQ_UNITS=['minutes','hours','days'];

async function connectReposAdmin(){
 if(!isAdmin())return hd('Connect Repositories','Connect Repositories','Admin access required.');
 /* Try to pull live Bitbucket connection for the status KPI strip */
 let conn={connected:false,workspace:'',status:'disconnected',postPlanComments:false};
 try{conn=await api('/bitbucket/connection')}catch(e){}
 window.__bbConn=conn;
 const profiles=crProfiles();
 const repos=crRepos();
 const acts=
  '<button class="b1" data-cr="add-profile">'+I('plus',16)+'Add credentials</button>'
  +'<button class="b2" data-cr="add-repo"'+(profiles.length?'':' disabled')+'>'+I('repo',16)+'Add repository</button>';

 /* KPI strip */
 const kpis=kp([
  ['Credential profiles',profiles.length,'Stored encrypted','',profiles.length?C[1]:C[5]],
  ['Connected repos',repos.length,'Across all profiles'],
  ['Providers',[...new Set(profiles.map(p=>p.provider))].length||0,'Active integrations'],
  ['Bitbucket status',conn.connected?'ok:Connected':'mut:Off',conn.workspace||'No workspace','',conn.connected?C[1]:C[5]]
 ]);

 /* Credential profiles table */
 const profRows=profiles.length
  ?profiles.map((p,i)=>[
    'html:<span style="display:inline-flex;align-items:center;gap:5px">'+
     (PROVIDER_ICONS[p.provider]||'')+
     '<span class="tx" style="background:color-mix(in srgb,'+PROVIDER_COLORS[p.provider]+' 12%,transparent);color:'+PROVIDER_COLORS[p.provider]+';padding:1px 7px;border-radius:4px;font-size:11px;font-weight:600">'+esc(PROVIDER_LABELS[p.provider]||p.provider)+'</span>'+
    '</span>',
    esc(p.name),
    p.username||'—',
    'html:<span class="mono" style="letter-spacing:.05em">'+esc(p.workspace||'—')+'</span>',
    'html:<span class="mono" style="opacity:.5">••••••••</span>',
    'html:<button class="b2 sm" data-cr="edit-profile" data-pi="'+i+'">'+I('edit',14)+'Edit</button> <button class="b2 sm cr-test-btn" data-cr="test-profile" data-pi="'+i+'">'+I('activity',14)+'Test</button> <button class="b2 sm" data-cr="del-profile" data-pi="'+i+'" style="color:var(--bad)">'+I('trash',14)+'Remove</button><span id="cr-test-res-'+i+'" class="cr-test-res"></span>'
   ])
  :[['—','—','—','—','—','—']];

 /* Connected repositories table */
 const repoRows=repos.length
  ?repos.map((r,i)=>[
    'html:<span style="display:inline-flex;align-items:center;gap:5px">'+
     (PROVIDER_ICONS[r.provider]||'')+
     '<span class="tx" style="background:color-mix(in srgb,'+PROVIDER_COLORS[r.provider]+' 12%,transparent);color:'+PROVIDER_COLORS[r.provider]+';padding:1px 7px;border-radius:4px;font-size:11px;font-weight:600">'+esc(PROVIDER_LABELS[r.provider]||r.provider)+'</span>'+
    '</span>',
    esc(r.profileName),
    'html:<span class="mono">'+esc(r.url)+'</span>',
    r.branch||'html:<span class="sub">default</span>',
    r.pullFreq?(r.pullFreq+' '+r.pullUnit):'Manual',
    'html:<button class="b2 sm" data-cr="edit-repo" data-ri="'+i+'">'+I('edit',14)+'Edit</button> <button class="b2 sm cr-test-btn" data-cr="test-repo" data-ri="'+i+'">'+I('activity',14)+'Test</button> <button class="b2 sm" data-cr="del-repo" data-ri="'+i+'" style="color:var(--bad)">'+I('trash',14)+'Remove</button><span id="cr-repo-res-'+i+'" class="cr-test-res"></span>'
   ])
  :[['—','—','—','—','—','—','—']];

 return hd('Connect Repositories','Connect Repositories','Manage remote repository credentials and add repositories to track.',acts)
  +heroCards('Connect Repositories')
  +kpis
  +'<h2 class="sh2">Credential profiles</h2>'
  +'<p class="vdsc" style="margin:-8px 0 14px">One profile per remote provider account. Tokens are stored encrypted and never shown in full.</p>'
  +'<div class="tw tall">'+tbl(['Provider','Profile name','Username · Email','Workspace slug','API token','Actions'],profRows)+'</div>'
  +'<h2 class="sh2" style="margin-top:28px">Connected repositories</h2>'
  +'<p class="vdsc" style="margin:-8px 0 14px">Each entry defines a repository to watch. Runs are triggered based on the pull frequency or via webhooks.</p>'
  +'<div class="tw tall">'+tbl(['Provider','Credential profile','Repository URL','Branch','Pull frequency','Actions'],repoRows)+'</div>'
}

/* ── Add notification channel modal ────────────────────────────── */
const NOTIF_ICONS={
 slack:'<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8.5 20a2.5 2.5 0 1 1-2.5-2.5H8.5V20zm1.25 0a2.5 2.5 0 0 1 5 0v6.25a2.5 2.5 0 0 1-5 0V20zm2.5-11.5a2.5 2.5 0 1 1 2.5-2.5V8.5H12.25zm0 1.25a2.5 2.5 0 0 1 0 5H6a2.5 2.5 0 0 1 0-5H12.25zm11.5 2.5a2.5 2.5 0 1 1 2.5 2.5H23.75V12.25zm-1.25 0a2.5 2.5 0 0 1-5 0V6a2.5 2.5 0 0 1 5 0v6.25zM20.5 23.75a2.5 2.5 0 1 1-2.5 2.5v-2.5h2.5zm0-1.25a2.5 2.5 0 0 1 0-5H26a2.5 2.5 0 0 1 0 5H20.5z" fill="#E01E5A"/><path d="M12.25 8.5V6a2.5 2.5 0 0 1 5 0v6.25h-6.25z" fill="#36C5F0"/><path d="M23.75 12.25H26a2.5 2.5 0 0 1 0 5h-6.25v-6.25z" fill="#2EB67D"/><path d="M17.75 23.5v2.5a2.5 2.5 0 0 1-5 0V20h6.25z" fill="#ECB22E"/></svg>',
 teams:'<img src="/illustrations/stickers/teams.png" width="20" height="20" alt="MS Teams" style="object-fit:contain;display:block">',
 gmail:'<img src="/illustrations/stickers/gmail.png" width="20" height="20" alt="Mail" style="object-fit:contain;display:block">',
 sms:'<img src="/illustrations/stickers/sms.png" width="20" height="20" alt="SMS" style="object-fit:contain;display:block">'
};

function _ncFields(prov){
 if(prov==='slack')return ''
  +'<label>Channel name</label>'
  +'<input id="nc-name" placeholder="e.g. #infra-alerts" autocomplete="off">'
  +'<label>Webhook URL</label>'
  +'<input id="nc-webhook" placeholder="https://hooks.slack.com/services/…" autocomplete="off">'
  +'<div class="nc-actions">'
  +'<button type="button" class="b2 sm" id="nc-preview">'+I('activity',14)+'Preview card</button>'
  +'<button type="button" class="b1 sm" id="nc-test">'+I('zap',14)+'Test send alert</button>'
  +'</div>'
  +'<div id="nc-result"></div>';

 if(prov==='teams')return ''
  +'<label>Channel name</label>'
  +'<input id="nc-name" placeholder="e.g. Platform alerts" autocomplete="off">'
  +'<label>Webhook URL</label>'
  +'<input id="nc-webhook" placeholder="https://company.webhook.office.com/…" autocomplete="off">'
  +'<div class="nc-actions">'
  +'<button type="button" class="b2 sm" id="nc-preview">'+I('activity',14)+'Preview adaptive card</button>'
  +'<button type="button" class="b1 sm" id="nc-test">'+I('zap',14)+'Test send alert</button>'
  +'</div>'
  +'<div id="nc-result"></div>';

 if(prov==='gmail')return ''
  +'<label>Channel name</label>'
  +'<input id="nc-name" placeholder="e.g. Infra mail alerts" autocomplete="off">'
  +'<label>SMTP host</label>'
  +'<input id="nc-smtp-host" placeholder="smtp.gmail.com" autocomplete="off">'
  +'<label>SMTP port</label>'
  +'<input id="nc-smtp-port" type="number" placeholder="587" value="587" autocomplete="off">'
  +'<label>SMTP user</label>'
  +'<input id="nc-smtp-user" type="email" placeholder="alerts@company.com" autocomplete="off">'
  +'<label>SMTP password</label>'
  +'<input id="nc-smtp-pass" type="password" placeholder="App password" autocomplete="off">'
  +'<label>Recipient email</label>'
  +'<input id="nc-email" type="email" placeholder="team@company.com" autocomplete="off">'
  +'<div class="nc-actions">'
  +'<button type="button" class="b1 sm" id="nc-test">'+I('zap',14)+'Test send alert</button>'
  +'</div>'
  +'<div id="nc-result"></div>';

 if(prov==='sms')return ''
  +'<label>Channel name</label>'
  +'<input id="nc-name" placeholder="e.g. On-call SMS" autocomplete="off">'
  +'<label>Account SID <span class="sub">(optional — uses env var TWILIO_ACCOUNT_SID if blank)</span></label>'
  +'<input id="nc-sid" placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" autocomplete="off">'
  +'<label>API key</label>'
  +'<input id="nc-apikey" placeholder="SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" autocomplete="off">'
  +'<label>API secret</label>'
  +'<input id="nc-apisecret" type="password" placeholder="API secret" autocomplete="off">'
  +'<label>Recipient phone number</label>'
  +'<input id="nc-phone" type="tel" placeholder="+1 555 000 0000" autocomplete="off">'
  +'<div class="nc-actions">'
  +'<button type="button" class="b1 sm" id="nc-test">'+I('zap',14)+'Test send alert</button>'
  +'</div>'
  +'<div id="nc-result"></div>';

 return '';
}

function openAddChannelModal(){
 closeUModal();
 let selProv='slack';
 const body=document.createElement('div');body.className='umodal';body.id='umodal';

 const provGrid=['slack','teams','gmail','sms'].map(k=>{
  const labels={slack:'Slack',teams:'MS Teams',gmail:'Mail',sms:'SMS'};
  const icon=NOTIF_ICONS[k];
  /* img tags don't need the svg width injection */
  const iconHTML=icon.startsWith('<img')?icon:icon.replace('<svg ','<svg width="20" height="20" ');
  return '<button type="button" class="cr-prov-opt'+(k===selProv?' on':'')+'" data-prov="'+k+'">'
   +iconHTML
   +'<span>'+labels[k]+'</span>'
   +'</button>';
 }).join('');

 body.innerHTML=
  '<div class="md card-md cr-modal">'
  +'<div class="md-hd"><h3>Add notification channel</h3><p class="md-cs">Route run events to your team\'s preferred channel.</p></div>'
  +'<div class="md-bd">'
  +'<label>Channel type</label>'
  +'<div class="cr-prov-grid nc-prov-grid">'+provGrid+'</div>'
  +'<input type="hidden" id="nc-provider" value="slack">'
  +'<div id="nc-fields">'+_ncFields('slack')+'</div>'
  +'</div>'
  +'<div class="md-ft ra"><button type="button" class="b2" id="ucancel">Cancel</button><button type="button" class="b1" id="usave">Save channel</button></div>'
  +'</div>';

 document.body.appendChild(body);

 const setResult=(ok,msg)=>{
  const el=body.querySelector('#nc-result');if(!el)return;
  el.style.cssText='margin:6px 0 0;padding:5px 8px;border-radius:3px;font-size:11px;'
   +(ok?'background:color-mix(in srgb,var(--ok) 10%,transparent);color:var(--ok)'
       :'background:color-mix(in srgb,var(--bad) 10%,transparent);color:var(--bad)');
  el.textContent=msg;
 };

 const wireButtons=()=>{
  const prov=body.querySelector('#nc-provider').value;
  const preview=body.querySelector('#nc-preview');
  const test=body.querySelector('#nc-test');

  if(preview)preview.onclick=()=>{
   const webhook=body.querySelector('#nc-webhook')&&body.querySelector('#nc-webhook').value.trim();
   if(!webhook){setResult(false,'Enter the webhook URL first.');return}
   const channelName=body.querySelector('#nc-name')&&body.querySelector('#nc-name').value.trim()||'terraplan';
   const now=new Date().toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Kolkata'});
   const last=(window.__runs||[])[0];
   const pvEnv=last&&last.e||'—',pvRepo=last&&last.r||'—',pvBr=last&&last.b||'—',pvWho=last&&last.u||(ME&&(ME.name||ME.email))||'You',pvSt=last?(last.a+' '+last.s):'No runs yet';
   if(prov==='slack'){
    const el=body.querySelector('#nc-result');
    el.style.cssText='margin:10px 0 0';
    el.innerHTML=
     '<div class="ac-preview ac-slack">'
     +'<div class="ac-slack-header"><span class="ac-slack-app">terraplan</span><span class="ac-slack-via">via Incoming Webhook</span></div>'
     +'<div class="ac-slack-body">'
     +'<div class="ac-slack-bar"></div>'
     +'<div class="ac-slack-content">'
     +'<div class="ac-row"><span class="ac-label">Status</span><span class="ac-val ac-ok">'+esc(pvSt)+'</span></div>'
     +'<div class="ac-row"><span class="ac-label">Environment</span><span class="ac-val">'+esc(pvEnv)+'</span></div>'
     +'<div class="ac-row"><span class="ac-label">Branch</span><span class="ac-val mono">'+esc(pvBr)+'</span></div>'
     +'<div class="ac-row"><span class="ac-label">Triggered by</span><span class="ac-val">'+esc(pvWho)+'</span></div>'
     +'<div class="ac-footer">Notification from '+esc(channelName)+' · '+now+'</div>'
     +'</div></div></div>';
   } else if(prov==='teams'){
    const el=body.querySelector('#nc-result');
    el.style.cssText='margin:10px 0 0';
    el.innerHTML=
     '<div class="ac-preview ac-teams">'
     +'<div class="ac-teams-header"><b>'+esc(channelName)+'</b><span class="ac-teams-via">via Incoming Webhook</span></div>'
     +'<div class="ac-teams-card">'
     +'<div class="ac-teams-emphasis">'
     +'<div class="ac-accent-label">⚡ TERRAPLAN · DEPLOYMENT CONTROL</div>'
     +'<div class="ac-title">'+esc(pvSt)+'</div>'
     +'<div class="ac-badge">● '+esc(last&&last.s||'preview')+'</div>'
     +'</div>'
     +'<div class="ac-teams-alert">⏰ Latest terraplan run</div>'
     +'<div class="ac-teams-fields">'
     +'<div class="ac-row"><span class="ac-label">🌐 Environment</span><span class="ac-val mono">'+esc(pvEnv)+'</span></div>'
     +'<div class="ac-row"><span class="ac-label">📦 Repository</span><span class="ac-val mono">'+esc(pvRepo)+'</span></div>'
     +'<div class="ac-row"><span class="ac-label">🧩 Branch</span><span class="ac-val mono">'+esc(pvBr)+'</span></div>'
     +'<div class="ac-row"><span class="ac-label">🕒 Time</span><span class="ac-val">'+now+'</span></div>'
     +'</div>'
     +'<div class="ac-teams-footer">🛡️ Managed by terraplan DevOps · Powered by terraplan ⚡<br>Notification generated at '+now+' IST</div>'
     +'</div></div>';
   }
  };

  if(test)test.onclick=async()=>{
   const webhook=body.querySelector('#nc-webhook')&&body.querySelector('#nc-webhook').value.trim();
   if(!webhook&&(prov==='slack'||prov==='teams')){setResult(false,'Enter the webhook URL first.');return}
   test.disabled=true;test.textContent='Sending…';
   try{
    if(prov==='slack'){
     const res=await fetch(webhook,{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({text:'🔔 *terraplan test alert* — connection verified ✓'})});
     if(!res.ok&&res.status!==0)throw new Error('Slack returned '+res.status);
     setResult(true,'✓ Test alert sent — check your Slack channel.');
    } else if(prov==='teams'){
     const card={type:'message',attachments:[{contentType:'application/vnd.microsoft.card.adaptive',content:{type:'AdaptiveCard',version:'1.4',body:[{type:'TextBlock',text:'🔔 terraplan test alert — connection verified ✓',wrap:true}]}}]};
     const res=await fetch(webhook,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(card)});
     if(!res.ok&&res.status!==0)throw new Error('Teams returned '+res.status);
     setResult(true,'✓ Test adaptive card sent — check your Teams channel.');
    } else if(prov==='gmail'){
     setResult(true,'✓ SMTP config saved — test delivery happens on the server at send time.');
    } else if(prov==='sms'){
     setResult(true,'✓ Twilio config saved — test SMS will be sent when a run event fires.');
    }
   }catch(err){setResult(false,'✕ '+err.message)}
   finally{test.disabled=false;test.textContent='Test send alert'}
  };
 };

 /* Provider picker */
 body.querySelectorAll('.cr-prov-opt').forEach(btn=>{
  btn.addEventListener('click',()=>{
   body.querySelectorAll('.cr-prov-opt').forEach(b=>b.classList.remove('on'));
   btn.classList.add('on');
   selProv=btn.dataset.prov;
   body.querySelector('#nc-provider').value=selProv;
   body.querySelector('#nc-fields').innerHTML=_ncFields(selProv);
   wireButtons();
  });
 });
 wireButtons();

 body.querySelector('#ucancel').onclick=closeUModal;
 body.onclick=e=>{if(e.target===body)closeUModal()};

 body.querySelector('#usave').onclick=()=>{
  const prov=body.querySelector('#nc-provider').value;
  const name=body.querySelector('#nc-name')&&body.querySelector('#nc-name').value.trim();
  if(!name){toast('Channel name is required');return}
  const entry={provider:prov,name};
  /* Collect remaining fields */
  ['nc-webhook','nc-smtp-host','nc-smtp-port','nc-smtp-user','nc-smtp-pass','nc-email',
   'nc-sid','nc-apikey','nc-apisecret','nc-phone'].forEach(id=>{
   const el=body.querySelector('#'+id);if(el&&el.value.trim())entry[id]=el.value.trim();
  });
  /* Validate required per provider */
  if((prov==='slack'||prov==='teams')&&!entry['nc-webhook']){toast('Webhook URL is required');return}
  if(prov==='gmail'&&(!entry['nc-smtp-host']||!entry['nc-email'])){toast('SMTP host and recipient email are required');return}
  if(prov==='sms'&&(!entry['nc-apikey']||!entry['nc-phone'])){toast('API key and phone number are required');return}
  try{
   const channels=JSON.parse(sessionStorage.getItem('tp-notif-channels')||'[]');
   channels.push(entry);
   sessionStorage.setItem('tp-notif-channels',JSON.stringify(channels));
  }catch(e){}
  toast('Channel "'+name+'" saved');
  closeUModal();
  if(window.__refreshNotifications)window.__refreshNotifications();
 };
}

/* ── Shared confirmation modal ──────────────────────────────────── */
function openConfirmModal({title,message,confirmLabel,confirmClass,onConfirm}){
 closeUModal();
 const body=document.createElement('div');body.className='umodal';body.id='umodal';
 body.innerHTML=
  '<div class="md card-md confirm-modal">'
  +'<div class="md-hd confirm-modal-hd">'
  +'<h3>'+esc(title||'Are you sure?')+'</h3>'
  +'<button type="button" class="confirm-close" id="ucancel" aria-label="Close">×</button>'
  +'</div>'
  +'<div class="md-bd confirm-modal-bd"><p>'+esc(message||'This action cannot be undone.')+'</p></div>'
  +'<div class="md-ft ra">'
  +'<button type="button" class="b1 btn-danger" id="uconfirm">'+esc(confirmLabel||'Remove')+'</button>'
  +'</div>'
  +'</div>';
 document.body.appendChild(body);
 body.querySelector('#ucancel').onclick=closeUModal;
 body.onclick=e=>{if(e.target===body)closeUModal()};
 body.querySelector('#uconfirm').onclick=()=>{closeUModal();onConfirm&&onConfirm()};
}
function chooseLockWait({environment,action,busy}){
 return new Promise(resolve=>{
  closeUModal();
  const who=busy.holder?busy.holder+' is running '+(busy.action||'a run')+(busy.branch?' on '+busy.branch:''):environment+' is busy';
  const q=(busy.waiting||[]).length;
  const qLine=q?q+' run'+(q===1?'':'s')+' already waiting in the queue.':'No one else is waiting yet.';
  const body=document.createElement('div');body.className='umodal';body.id='umodal';
  body.innerHTML=
   '<div class="md card-md confirm-modal">'
   +'<div class="md-hd confirm-modal-hd">'
   +'<h3>'+esc(environment)+' is in use</h3>'
   +'<button type="button" class="confirm-close" id="ucancel" aria-label="Close">×</button>'
   +'</div>'
   +'<div class="md-bd confirm-modal-bd">'
   +'<p>'+esc(who)+'.</p>'
   +'<p>'+esc(qLine)+' Add this '+esc(action)+' to the queue so it starts automatically when the lock is free, or wait and we will notify you so you can start it yourself.</p>'
   +'</div>'
   +'<div class="md-ft cr-modal-ft lock-choice-ft">'
   +'<button type="button" class="b2" id="ulock-cancel">Cancel</button>'
   +'<button type="button" class="b2" id="ulock-wait">Notify me when free</button>'
   +'<button type="button" class="b1" id="ulock-queue">Add to queue</button>'
   +'</div></div>';
  document.body.appendChild(body);
  const done=choice=>{closeUModal();resolve(choice)};
  body.querySelector('#ucancel').onclick=()=>done('cancel');
  body.querySelector('#ulock-cancel').onclick=()=>done('cancel');
  body.querySelector('#ulock-wait').onclick=()=>done('wait');
  body.querySelector('#ulock-queue').onclick=()=>done('queue');
  body.onclick=e=>{if(e.target===body)done('cancel')};
 });
}

/* ── Create / edit group modal ──────────────────────────────────── */

/* Custom styled dropdown — same look as role-dd, fully CSS-matching */
function _cgSelect(id,opts,selected){
 const valOf=o=>typeof o==='object'?String(o.value):String(o);
 const labOf=o=>typeof o==='object'?o.label:o;
 const sel=selected==null?'':String(selected);
 const cur=opts.find(o=>valOf(o)===sel)||opts[0];
 const curVal=cur==null?'':valOf(cur);
 const curLab=cur==null?'Select':labOf(cur);
 const items=opts.map(o=>{const v=valOf(o),l=labOf(o);
  return '<button type="button" class="ami'+(v===sel?' on':'')+'" role="option" data-val="'+esc(v)+'"'+(v===sel?' aria-selected="true"':'')+'>'+esc(l)+'</button>';
 }).join('');
 return '<div class="role-dd cg-dd" data-cgid="'+esc(id)+'">'
  +'<div class="role-dd-wrap">'
  +'<button type="button" class="role-dd-trig" aria-haspopup="listbox" aria-expanded="false">'
  +'<span class="role-dd-val">'+esc(curLab)+'</span>'
  +'<svg class="role-dd-chv" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  +'</button>'
  +'<input type="hidden" id="'+esc(id)+'" value="'+esc(curVal)+'">'
  +'<div class="mn act role-dd-mn hide" role="listbox">'+items+'</div>'
  +'</div></div>';
}
function _wireCgSelects(body){
 body.querySelectorAll('.cg-dd').forEach(dd=>{
  if(dd.__wired)return;dd.__wired=true;
  const trig=dd.querySelector('.role-dd-trig');
  const mn=dd.querySelector('.role-dd-mn');
  const hid=dd.querySelector('input[type="hidden"]');
  const val=dd.querySelector('.role-dd-val');
  const closeAll=()=>body.querySelectorAll('.role-dd-mn').forEach(m=>{m.classList.add('hide');const t=m.closest('.role-dd')&&m.closest('.role-dd').querySelector('.role-dd-trig');if(t){t.classList.remove('open');t.setAttribute('aria-expanded','false')}});
  trig.addEventListener('click',e=>{e.stopPropagation();const open=!mn.classList.contains('hide');closeAll();if(open)return;mn.classList.remove('hide');trig.classList.add('open');trig.setAttribute('aria-expanded','true')});
  mn.querySelectorAll('.ami').forEach(opt=>{opt.addEventListener('click',e=>{e.stopPropagation();hid.value=opt.dataset.val;val.textContent=opt.textContent;mn.querySelectorAll('.ami').forEach(x=>{x.classList.toggle('on',x===opt);x.setAttribute('aria-selected',x===opt?'true':'false')});closeAll();hid.dispatchEvent(new Event('change',{bubbles:true}))})});
 });
 if(!body.__cgClick){body.__cgClick=true;body.addEventListener('click',e=>{if(!e.target.closest('.cg-dd')&&!e.target.closest('.ig-az-dd'))body.querySelectorAll('.role-dd-mn').forEach(m=>{m.classList.add('hide');const t=m.closest('.role-dd')&&m.closest('.role-dd').querySelector('.role-dd-trig');if(t){t.classList.remove('open');t.setAttribute('aria-expanded','false')}})})}
}
function _groupMemberPickerHTML(selectedIds,users){
 /* Builds the member picker: searchbar + user list + selected chips */
 const userList=(users||[]).map(u=>
  '<div class="cg-user-row'+(selectedIds.includes(u.id)?' picked':'')+'" data-uid="'+esc(u.id)+'" data-uname="'+esc(u.name||u.email)+'">'
  +'<span class="cg-av" style="background:hsl('+(u.name?((u.name.charCodeAt(0)*31+u.name.charCodeAt(1))%360):120)+' 50% 44%)">'+esc((u.name||u.email||'?')[0].toUpperCase())+'</span>'
  +'<span class="cg-ul"><b>'+esc(u.name||'—')+'</b><small>'+esc(u.email)+'</small></span>'
  +'<span class="cg-chk">'+(selectedIds.includes(u.id)?'✓':'')+'</span>'
  +'</div>'
 ).join('');
 return '<label>Members <span class="sub">(optional)</span></label>'
  +'<div class="cg-picker">'
  +'<div class="cg-search-wrap"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>'
  +'<input class="cg-search" placeholder="Search users…" autocomplete="off"></div>'
  +'<div class="cg-user-list">'+userList+'</div>'
  +'<div class="cg-chips" id="cg-chips">'+(selectedIds.length?selectedIds.map(id=>{const u=(users||[]).find(x=>x.id===id);return u?'<span class="cg-chip" data-uid="'+esc(id)+'">'+esc(u.name||u.email)+'<button type="button" aria-label="Remove">×</button></span>':''}).join(''):'<span class="cg-chips-empty">No members selected</span>')+'</div>'
  +'</div>';
}
function _wireGroupMemberPicker(body,selectedIds,users){
 const list=body.querySelector('.cg-user-list');
 const chips=body.querySelector('#cg-chips');
 const search=body.querySelector('.cg-search');
 const sel=new Set(selectedIds);
 const refresh=()=>{
  /* update chips */
  const selUsers=[...sel].map(id=>(users||[]).find(u=>u.id===id)).filter(Boolean);
  chips.innerHTML=selUsers.length
   ?selUsers.map(u=>'<span class="cg-chip" data-uid="'+esc(u.id)+'">'+esc(u.name||u.email)+'<button type="button" aria-label="Remove">×</button></span>').join('')
   :'<span class="cg-chips-empty">No members selected</span>';
  /* update rows */
  list.querySelectorAll('.cg-user-row').forEach(row=>{
   const on=sel.has(row.dataset.uid);
   row.classList.toggle('picked',on);
   row.querySelector('.cg-chk').textContent=on?'✓':'';
  });
 };
 list.addEventListener('click',e=>{
  const row=e.target.closest('.cg-user-row');if(!row)return;
  const uid=row.dataset.uid;
  sel.has(uid)?sel.delete(uid):sel.add(uid);
  refresh();
 });
 chips.addEventListener('click',e=>{
  const btn=e.target.closest('button[aria-label="Remove"]');if(!btn)return;
  const chip=btn.closest('.cg-chip');if(!chip)return;
  sel.delete(chip.dataset.uid);refresh();
 });
 search.addEventListener('input',()=>{
  const q=search.value.toLowerCase();
  list.querySelectorAll('.cg-user-row').forEach(row=>{
   row.style.display=(!q||row.dataset.uname.toLowerCase().includes(q))?'':'none';
  });
 });
 body.getSelectedMembers=()=>[...sel];
}

function openCreateGroupModal(existingGroup){
 closeUModal();
 const title=existingGroup?'Edit group':'Create group';
 const ROLES_ALL=['Viewer','Planner','Applier','Admin'];
 const g=existingGroup||{name:'',repositories:'All',environments:'All',defaultRole:'Planner',description:'',memberIds:[]};
 const users=window.__usersCache||[];
 const selectedIds=g.memberIds||[];
 const repoChoices=['All'].concat(crRepos().map(r=>repoSlugFromUrl(r.url)||r.url).filter(Boolean));
 const envChoices=['All',...allEnvNames()];
 const body=document.createElement('div');body.className='umodal';body.id='umodal';
 body.innerHTML=
  '<div class="md card-md cr-modal">'
  +'<div class="md-hd"><h3>'+esc(title)+'</h3><p class="md-cs">Groups control repository and environment access for all members.</p></div>'
  +'<div class="md-bd">'
  +'<label>Group name</label>'
  +'<input id="cg-name" value="'+esc(g.name)+'" placeholder="e.g. Platform, Backend, Data">'
  +'<label>Description <span class="sub">(optional)</span></label>'
  +'<input id="cg-desc" value="'+esc(g.description||'')+'" placeholder="Short description of this group">'
  +'<label>Repositories</label>'
  +_cgSelect('cg-repos',repoChoices,g.repositories||'All')
  +'<label>Environments</label>'
  +_cgSelect('cg-envs',envChoices,g.environments||'All')
  +'<label>Default role</label>'
  +_cgSelect('cg-role',ROLES_ALL,g.defaultRole||'Planner')
  +_groupMemberPickerHTML(selectedIds,users)
  +'</div>'
  +'<div class="md-ft ra"><button type="button" class="b2" id="ucancel">Cancel</button><button type="button" class="b1" id="usave">'+esc(title)+'</button></div>'
  +'</div>';
 document.body.appendChild(body);
 _wireCgSelects(body);
 _wireGroupMemberPicker(body,selectedIds,users);
 body.querySelector('#ucancel').onclick=closeUModal;
 body.onclick=e=>{if(e.target===body)closeUModal()};
 body.querySelector('#usave').onclick=()=>{
  const name=body.querySelector('#cg-name').value.trim();
  if(!name){toast('Group name is required');return}
  const memberIds=body.getSelectedMembers();
  const entry={
   name,
   description:body.querySelector('#cg-desc').value.trim(),
   repositories:body.querySelector('#cg-repos').value,
   environments:body.querySelector('#cg-envs').value,
   defaultRole:body.querySelector('#cg-role').value,
   members:memberIds.length,
   memberIds
  };
  try{
   const groups=JSON.parse(sessionStorage.getItem('tp-groups')||'[]');
   if(existingGroup){const i=groups.findIndex(g=>g.name===existingGroup.name);if(i>=0)groups[i]=entry;else groups.push(entry);}
   else groups.push(entry);
   sessionStorage.setItem('tp-groups',JSON.stringify(groups));
  }catch(e){}
  toast(existingGroup?'Group updated':'Group "'+name+'" created');
  closeUModal();
  if(window.__refreshUsers)window.__refreshUsers();
 };
}

function openAddGroupMembersModal(groupName){
 /* Opens the same picker but only the members section, for an existing group */
 let groups=[];
 try{groups=JSON.parse(sessionStorage.getItem('tp-groups')||'[]')}catch(e){}
 const group=groups.find(g=>g.name===groupName);
 if(!group){toast('Group not found');return}
 closeUModal();
 const users=window.__usersCache||[];
 const selectedIds=group.memberIds||[];
 const body=document.createElement('div');body.className='umodal';body.id='umodal';
 body.innerHTML=
  '<div class="md card-md cr-modal">'
  +'<div class="md-hd"><h3>Add members — '+esc(groupName)+'</h3><p class="md-cs">Search and select users to add to this group.</p></div>'
  +'<div class="md-bd">'
  +_groupMemberPickerHTML(selectedIds,users)
  +'</div>'
  +'<div class="md-ft ra"><button type="button" class="b2" id="ucancel">Cancel</button><button type="button" class="b1" id="usave">Save members</button></div>'
  +'</div>';
 document.body.appendChild(body);
 _wireGroupMemberPicker(body,selectedIds,users);
 body.querySelector('#ucancel').onclick=closeUModal;
 body.onclick=e=>{if(e.target===body)closeUModal()};
 body.querySelector('#usave').onclick=()=>{
  const memberIds=body.getSelectedMembers();
  try{
   let gs=JSON.parse(sessionStorage.getItem('tp-groups')||'[]');
   /* Update existing saved group, or add it as new entry with updated members */
   const i=gs.findIndex(g=>g.name===groupName);
   if(i>=0){gs[i]={...gs[i],members:memberIds.length,memberIds}}
   else gs.push({...group,members:memberIds.length,memberIds});
   sessionStorage.setItem('tp-groups',JSON.stringify(gs));
  }catch(e){}
  toast(memberIds.length+' member'+(memberIds.length!==1?'s':'')+' saved for "'+groupName+'"');
  closeUModal();
  if(window.__refreshUsers)window.__refreshUsers();
 };
}

/* ── Add / edit credential profile modal ───────────────────────── */
function openConnectRepoModal(idx){
 closeUModal();
 const profiles=crProfiles();
 const existing=typeof idx==='number'?profiles[idx]:null;
 const title=existing?'Edit credentials':'Connect Repositories';
 const body=document.createElement('div');body.className='umodal';body.id='umodal';
 const prov=existing&&existing.provider||'bitbucket';
 body.innerHTML=
  '<div class="md card-md cr-modal">'
  +'<div class="md-hd"><h3>'+esc(title)+'</h3><p class="md-cs">Credentials are encrypted at rest and never logged.</p></div>'
  +'<div class="md-bd">'
  +'<label>Remote repository</label>'
  +'<div class="cr-prov-grid">'
  +'<button type="button" class="cr-prov-opt'+(prov==='bitbucket'?' on':'')+'" data-prov="bitbucket">'
  +'<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M2.07 5a.9.9 0 0 0-.9 1.05L5.1 26.14a1.22 1.22 0 0 0 1.19 1H25.9a.9.9 0 0 0 .88-.75L30.84 6.06A.9.9 0 0 0 29.94 5zm17.1 14.44h-6.33L11.4 12.56h9.26z" fill="#2684FF"/></svg>'
  +'<span>Bitbucket</span>'
  +'</button>'
  +'<button type="button" class="cr-prov-opt'+(prov==='github'?' on':'')+'" data-prov="github">'
  +'<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2a14 14 0 0 0-4.43 27.28c.7.13.95-.3.95-.67v-2.34c-3.9.85-4.72-1.88-4.72-1.88a3.71 3.71 0 0 0-1.56-2.05c-1.27-.87.1-.85.1-.85a2.94 2.94 0 0 1 2.14 1.44 2.98 2.98 0 0 0 4.08 1.16 3 3 0 0 1 .89-1.87c-3.1-.35-6.37-1.56-6.37-6.93a5.42 5.42 0 0 1 1.44-3.76 5.04 5.04 0 0 1 .14-3.7s1.18-.38 3.85 1.44a13.27 13.27 0 0 1 7.02 0c2.67-1.82 3.84-1.44 3.84-1.44a5.04 5.04 0 0 1 .14 3.7 5.42 5.42 0 0 1 1.44 3.76c0 5.38-3.28 6.57-6.4 6.92a3.35 3.35 0 0 1 .95 2.6v3.86c0 .37.25.8.96.67A14 14 0 0 0 16 2z" fill="currentColor"/></svg>'
  +'<span>GitHub</span>'
  +'</button>'
  +'<button type="button" class="cr-prov-opt'+(prov==='gitlab'?' on':'')+'" data-prov="gitlab">'
  +'<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M31.46 12.9l-1.75-5.4a.9.9 0 0 0-1.7-.01l-3.33 10.26H7.32L4 7.5a.9.9 0 0 0-1.71.01L.54 12.9a6.27 6.27 0 0 0 2.27 7.02l12.56 9.12a1 1 0 0 0 1.26 0l12.56-9.12a6.27 6.27 0 0 0 2.27-7.02z" fill="#FC6D26"/><path d="M16 29.04L21.53 12.75H10.47z" fill="#E24329"/><path d="M16 29.04l-5.53-16.29H3.19z" fill="#FC6D26"/><path d="M3.19 12.75l-1.65 5.08a.6.6 0 0 0 .22.68L16 29.04z" fill="#FCA326"/><path d="M3.19 12.75h7.28L7.32 3.5a.45.45 0 0 0-.86 0z" fill="#E24329"/><path d="M16 29.04l5.53-16.29h7.28z" fill="#FC6D26"/><path d="M28.81 12.75l1.65 5.08a.6.6 0 0 1-.22.68L16 29.04z" fill="#FCA326"/><path d="M28.81 12.75h-7.28l3.15-9.25a.45.45 0 0 1 .86 0z" fill="#E24329"/></svg>'
  +'<span>GitLab</span>'
  +'</button>'
  +'</div>'
  +'<input type="hidden" id="cr-provider" value="'+esc(prov)+'">'
  +'<label>Profile name</label>'
  +'<input id="cr-name" value="'+esc(existing&&existing.name||'')+'" placeholder="e.g. my-company-bitbucket">'
  +'<label id="cr-user-label">Username / Email</label>'
  +'<input id="cr-user" value="'+esc(existing&&existing.username||'')+'" placeholder="user@company.com">'
  +'<label id="cr-token-label">API / Access token</label>'
  +'<input id="cr-token" type="password" placeholder="'+(existing?'•••• leave blank to keep':'Paste token here')+'" autocomplete="off">'
  +'<div id="cr-workspace-row">'
  +'<label>Workspace slug</label>'
  +'<input id="cr-workspace" value="'+esc(existing&&existing.workspace||'')+'" placeholder="my-company">'
  +'</div>'
  +'<div id="cr-host-row" class="hide">'
  +'<label>GitLab host <span class="sub">(optional — leave blank for gitlab.com)</span></label>'
  +'<input id="cr-host" value="'+esc(existing&&existing.host||'')+'" placeholder="https://gitlab.mycompany.com">'
  +'</div>'
  +'<div id="cr-test-result"></div>'
  +'</div>'
  +'<div class="md-ft cr-modal-ft">'
  +'<button type="button" class="b2 cr-test-btn" id="utest">Test connection</button>'
  +'<div style="flex:1"></div>'
  +'<button type="button" class="b2" id="ucancel">Cancel</button>'
  +'<button type="button" class="b1" id="usave">Save</button>'
  +'</div>'
  +'</div>';
 document.body.appendChild(body);

 /* ── helpers ── */
 const q=id=>body.querySelector('#'+id);
 const setResult=(ok,msg)=>{
  const el=q('cr-test-result');
  el.style.cssText='margin:8px 0 0;padding:5px 8px;border-radius:3px;font-size:11px;line-height:1.4;'
   +(ok?'background:color-mix(in srgb,var(--ok) 10%,transparent);color:var(--ok)'
       :'background:color-mix(in srgb,var(--bad) 10%,transparent);color:var(--bad)');
  el.textContent=msg;
 };

 /* ── Provider-specific field labels / visibility ── */
 const syncProviderFields=()=>{
  const p=q('cr-provider').value;
  const wsRow=q('cr-workspace-row');
  const hostRow=q('cr-host-row');
  const userLabel=q('cr-user-label');
  const tokenLabel=q('cr-token-label');
  if(p==='bitbucket'){
   userLabel.textContent='Username';
   tokenLabel.textContent='App password / API token';
   wsRow.classList.remove('hide');
   hostRow.classList.add('hide');
   q('cr-workspace').placeholder='my-company';
   q('cr-user').placeholder='bitbucket-username';
   q('cr-token').placeholder=existing?'•••• leave blank to keep':'App password';
  } else if(p==='github'){
   userLabel.textContent='GitHub username';
   tokenLabel.textContent='Personal access token (classic or fine-grained)';
   wsRow.classList.add('hide');
   hostRow.classList.add('hide');
   q('cr-user').placeholder='octocat';
   q('cr-token').placeholder=existing?'•••• leave blank to keep':'ghp_xxxxxxxxxxxx';
  } else if(p==='gitlab'){
   userLabel.textContent='GitLab username';
   tokenLabel.textContent='Personal access token (read_api scope)';
   wsRow.classList.add('hide');
   hostRow.classList.remove('hide');
   q('cr-user').placeholder='gitlab-user';
   q('cr-token').placeholder=existing?'•••• leave blank to keep':'glpat-xxxxxxxxxxxx';
  }
  q('cr-test-result').textContent='';
 };

 /* ── Provider card picker ── */
 body.querySelectorAll('.cr-prov-opt').forEach(btn=>{
  btn.addEventListener('click',()=>{
   body.querySelectorAll('.cr-prov-opt').forEach(b=>b.classList.remove('on'));
   btn.classList.add('on');
   q('cr-provider').value=btn.dataset.prov;
   syncProviderFields();
  });
 });
 syncProviderFields();

 /* ── Test connection ── */
 q('utest').onclick=async()=>{
  const testBtn=q('utest');
  const provider=q('cr-provider').value;
  const username=q('cr-user').value.trim();
  const token=q('cr-token').value.trim();
  const workspace=q('cr-workspace')&&q('cr-workspace').value.trim();
  const host=q('cr-host')&&q('cr-host').value.trim();
  if(!username){setResult(false,'Enter a username first.');return}
  if(!token&&!existing){setResult(false,'Enter an API token first.');return}
  const useToken=token||(existing&&existing.tokenPreview?'(stored)':'');
  testBtn.disabled=true;testBtn.textContent='Testing…';
  try{
   if(provider==='bitbucket'){
    /* Save to backend first so the test-assume endpoint can use it */
    if(token){
     await api('/bitbucket/connection',{method:'PUT',body:JSON.stringify({
      workspace:workspace||'',authMode:'app_password',username,appPassword:token,
      postPlanComments:true,autoPlanOnPr:false,defaultPlanEnvironment:'dev'
     })});
    }
    const r=await api('/bitbucket/connection/test',{method:'POST',body:'{}'});
    setResult(true,'Bitbucket connected ✓ — workspace reachable.');
   } else if(provider==='github'){
    /* GitHub: call /user with the token */
    const base='https://api.github.com';
    const res=await fetch(base+'/user',{headers:{Authorization:'token '+useToken,Accept:'application/vnd.github+json'}});
    if(!res.ok)throw new Error('GitHub API returned '+res.status+' — check token and scopes.');
    const data=await res.json();
    setResult(true,'GitHub connected ✓ — authenticated as '+esc(data.login||username)+'.');
   } else if(provider==='gitlab'){
    /* GitLab: call /user with the token */
    const base=(host||'https://gitlab.com').replace(/\/+$/,'');
    const res=await fetch(base+'/api/v4/user',{headers:{'PRIVATE-TOKEN':useToken}});
    if(!res.ok)throw new Error('GitLab API returned '+res.status+' — check token and host.');
    const data=await res.json();
    setResult(true,'GitLab connected ✓ — authenticated as '+esc(data.username||username)+'.');
   }
  }catch(err){
   setResult(false,err.message||'Connection failed.');
  }finally{
   testBtn.disabled=false;testBtn.textContent='Test connection';
  }
 };

 body.querySelector('#ucancel').onclick=closeUModal;
 body.onclick=e=>{if(e.target===body)closeUModal()};

 /* ── Save ── */
 body.querySelector('#usave').onclick=async()=>{
  const btn=body.querySelector('#usave');
  const name=q('cr-name').value.trim();
  const username=q('cr-user').value.trim();
  const token=q('cr-token').value.trim();
  const workspace=q('cr-workspace')&&q('cr-workspace').value.trim();
  const host=q('cr-host')&&q('cr-host').value.trim();
  const provider=q('cr-provider').value;
  if(!name){toast('Profile name is required');return}
  if(!username){toast('Username is required');return}
  if(!existing&&!token){toast('API token is required');return}
  btn.disabled=true;
  const profile={provider,name,username,workspace:workspace||'',host:host||'',postPlanComments:true,autoPlanOnPr:false};
  if(token)profile.tokenPreview=token.slice(0,4)+'••••';
  if(provider==='bitbucket'&&token){
   try{
    await api('/bitbucket/connection',{method:'PUT',body:JSON.stringify({
     workspace:workspace||'',authMode:'app_password',username,appPassword:token,
     postPlanComments:true,autoPlanOnPr:false,defaultPlanEnvironment:'dev'
    })});
   }catch(e){/* non-fatal */}
  }
  const updated=crProfiles();
  if(typeof idx==='number')updated[idx]=profile;else updated.push(profile);
  saveCrProfiles(updated);
  toast(existing?'Profile updated':'Credentials saved');
  closeUModal();if(window.__refreshBb)window.__refreshBb();
 };
}

/* ── Add / edit repository modal ────────────────────────────────── */
function openAddRepoModal(idx){
 closeUModal();
 const profiles=crProfiles();
 const repos=crRepos();
 const existing=typeof idx==='number'?repos[idx]:null;
 const title=existing?'Edit repository':'Add repository';
 if(!profiles.length){toast('Add a credential profile first');return}
 const profOpts=profiles.map((p,i)=>'<option value="'+i+'"'+(existing&&existing.profileIdx===i?' selected':'')+'>'+esc(PROVIDER_LABELS[p.provider]||p.provider)+' — '+esc(p.name)+'</option>').join('');
 const unitOpts=FREQ_UNITS.map(u=>'<option value="'+u+'"'+(existing&&existing.pullUnit===u?' selected':'')+'>'+u+'</option>').join('');
 const body=document.createElement('div');body.className='umodal';body.id='umodal';
 body.innerHTML=
  '<div class="md card-md">'
  +'<div class="md-hd"><h3>'+esc(title)+'</h3><p class="md-cs">Define a repository to watch. Leave branch blank to track the default branch.</p></div>'
  +'<div class="md-bd">'
  +'<p class="md-sec">Source</p>'
  +'<label>Credential profile <span class="sub">(workspace)</span></label>'
  +'<select id="ar-profile">'+profOpts+'</select>'
  +'<label>Repository URL</label>'
  +'<input id="ar-url" value="'+esc(existing&&existing.url||'')+'" placeholder="https://bitbucket.org/my-company/infra-core">'
  +'<label>Branch <span class="sub">(optional — leave blank for default)</span></label>'
  +'<input id="ar-branch" value="'+esc(existing&&existing.branch||'')+'" placeholder="main">'
  +'<p class="md-sec" style="margin-top:12px">Sync settings</p>'
  +'<label>Pull frequency <span class="sub">(0 = webhook / manual only)</span></label>'
  +'<div style="display:flex;gap:8px;align-items:center">'
  +'<input id="ar-freq" type="number" min="0" max="999" value="'+esc(String(existing&&existing.pullFreq||'0'))+'" style="width:80px;flex:none">'
  +'<select id="ar-unit" style="flex:1">'+unitOpts+'</select>'
  +'</div>'
  +'</div>'
  +'<div class="md-ft ra"><button type="button" class="b2" id="ucancel">Cancel</button><button type="button" class="b1" id="usave">Save</button></div>'
  +'</div>';
 document.body.appendChild(body);
 body.querySelector('#ucancel').onclick=closeUModal;
 body.onclick=e=>{if(e.target===body)closeUModal()};
 body.querySelector('#usave').onclick=()=>{
  const pi=Number(body.querySelector('#ar-profile').value);
  const url=body.querySelector('#ar-url').value.trim();
  const branch=body.querySelector('#ar-branch').value.trim();
  const freq=body.querySelector('#ar-freq').value.trim();
  const unit=body.querySelector('#ar-unit').value;
  if(!url){toast('Repository URL is required');return}
  const prof=profiles[pi];
  const entry={profileIdx:pi,profileName:prof?prof.name:'—',provider:prof?prof.provider:'bitbucket',workspace:prof?prof.workspace:'—',url,branch,pullFreq:freq==='0'||freq===''?0:Number(freq),pullUnit:unit};
  const updated=crRepos();
  if(typeof idx==='number')updated[idx]=entry;else updated.push(entry);
  saveCrRepos(updated);
  toast(existing?'Repository updated':'Repository added');
  closeUModal();if(window.__refreshBb)window.__refreshBb();
 };
}

async function liveRepos(){try{const repos=await api('/bitbucket/repositories');
 const rows=repos.map(r=>[r.slug,r.fullName.split('/')[0]||'—',r.defaultBranch||'—','terraform/','—',r.isPrivate?'ok:Private':'mut:Public',r.updatedOn?ago(r.updatedOn):'—']);
 return hd('Repositories','Repositories <span>('+repos.length+')</span>','Bitbucket repositories in the connected workspace.')
  +heroCards('Repositories')
  +'<div class="fl"><div class="sf" role="search">'+I('search',14)+'<input id="gq" placeholder="Search" aria-label="Search"></div></div><div class="tw tall" id="gt">'+tbl(['Repository','Workspace','Default branch','Terraform dir','Environments','Visibility','Updated'],rows)+'</div>'}
 catch(e){return hd('Repositories','Repositories','Add credentials under Admin → Connect Repositories to list repositories.')+heroCards('Repositories')+'<p class="sub">'+esc(e.message)+'</p>'}}
async function liveBranches(){try{const repos=await api('/bitbucket/repositories');const rows=[];
 for(const r of repos.slice(0,8)){const br=await api('/bitbucket/repositories/'+encodeURIComponent(r.slug)+'/branches');
  br.slice(0,12).forEach(b=>rows.push([b.name,r.slug,b.commitSha?b.commitSha.slice(0,7):'—','—','—']))}
 return hd('Branches','Branches <span>('+rows.length+')</span>','Branches and tip commits from Bitbucket.')
  +heroCards('Branches')
  +'<div class="fl"><div class="sf" role="search">'+I('search',14)+'<input id="gq" placeholder="Search" aria-label="Search"></div></div><div class="tw tall" id="gt">'+tbl(['Branch','Repository','Commit','Ahead','Last run'],rows.length?rows:[['—','—','—','—','—']])+'</div>'}
 catch(e){return hd('Branches','Branches','Connect Bitbucket to list branches.')+heroCards('Branches')+'<p class="sub">'+esc(e.message)+'</p>'}}
async function livePullRequests(){try{const repos=await api('/bitbucket/repositories');const rows=[];
 for(const r of repos.slice(0,8)){const prs=await api('/bitbucket/repositories/'+encodeURIComponent(r.slug)+'/pull-requests');
  prs.forEach(p=>rows.push(['#'+p.id,p.title,r.slug,p.sourceBranch,p.destinationBranch,p.author||'—',p.commitSha?p.commitSha.slice(0,7):'—',p.updatedOn?ago(p.updatedOn):'—',
   'html:<button class="b1 sm" data-plan-pr="'+esc(r.slug)+'" data-branch="'+esc(p.sourceBranch)+'" data-pr="'+p.id+'" data-pr-url="'+esc(p.htmlUrl)+'">'+I('plan',14)+'Plan</button>']))}
 return hd('Pull requests','Open pull requests <span>('+rows.length+')</span>','Open PRs from Bitbucket. Plan posts a comment when finished.')
  +heroCards('Pull requests')
  +'<div class="fl"><div class="sf" role="search">'+I('search',14)+'<input id="gq" placeholder="Search" aria-label="Search"></div></div><div class="tw tall" id="gt">'+tbl(['PR','Title','Repository','Source','Destination','Author','Commit','Updated','Actions'],rows.length?rows:[['—','—','—','—','—','—','—','—','—']])+'</div>'}
 catch(e){return hd('Pull requests','Pull requests','Connect Bitbucket to list pull requests.')+heroCards('Pull requests')+'<p class="sub">'+esc(e.message)+'</p>'}}
const NAV=[['Overview',['Dashboard']],['Terraform',['Terraform Plan','Live locks','Terraform Automate']],['Code',['Repositories','Branches',['Pull requests','New'],'Modules']],['Environments',['Workspaces','State files',['Drift detection','New']]],['Admin',['Users','Connect Repositories','Integration','Workers','Variables','Notifications','Audit log']]];
const CH='<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',side=$('side');
const SIDE_CHEV='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const lk=it=>{const n=Array.isArray(it)?it[0]:it,b=Array.isArray(it)?'<span class="nw">'+it[1]+'</span>':'';return '<a data-v="'+n+'"'+(n==='Terraform Plan'?' class="on"':'')+'><span>'+n+'</span>'+b+'</a>'};
side.innerHTML='<div class="side-min-row"><button type="button" class="side-min" id="side-toggle" aria-label="Hide navigation" title="Hide navigation" aria-controls="side" aria-expanded="true">'+SIDE_CHEV+'</button></div>'+NAV.map(g=>g[0]?'<div class="sg"><button class="sh" aria-expanded="true">'+CH+'<span class="sh-lab">'+g[0]+'</span></button><div class="sb"><div>'+g[1].map(lk).join('')+'</div></div></div>':g[1].map(lk).join('')).join('');
side.querySelectorAll('.sh').forEach(b=>b.addEventListener('click',()=>{const g=b.parentElement,c=g.classList.toggle('c');b.setAttribute('aria-expanded',String(!c))}));
(function(){
 const sideToggle=$('side-toggle');if(!sideToggle)return;
 sideToggle.addEventListener('click',()=>{
  const dash=$('dash'),on=dash.classList.toggle('side-collapsed');
  sideToggle.setAttribute('aria-expanded',String(!on));
  sideToggle.setAttribute('aria-label',on?'Show navigation':'Hide navigation');
  sideToggle.title=on?'Show navigation':'Hide navigation';
 });
})();
const AFm={'Terraform Plan':['','Terraform Plan','Every plan, apply and destroy across all environments.']};
const ROLES=['Viewer','Planner','Applier','Admin'];
const ROLE_CHV='<svg class="role-dd-chv" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function roleSelects(selected){const map=Object.fromEntries((selected||[]).map(a=>[a.environment,a.role]));
 return ENVS.map(e=>{const cur=map[e]||'';const shown=cur||'— none —';
  const opts=[['','— none —']].concat(ROLES.map(r=>[r,r])).map(([v,lab])=>'<button type="button" class="ami'+(v===cur?' on':'')+'" role="option" data-role="'+esc(v)+'"'+(v===cur?' aria-selected="true"':'')+'>'+esc(lab)+'</button>').join('');
  return '<div class="role-dd" data-env="'+esc(e)+'">'
   +'<span class="role-dd-lab">'+esc(e)+'</span>'
   +'<div class="role-dd-wrap">'
   +'<button type="button" class="role-dd-trig" aria-haspopup="listbox" aria-expanded="false"><span class="role-dd-val">'+esc(shown)+'</span>'+ROLE_CHV+'</button>'
   +'<input type="hidden" data-env="'+esc(e)+'" value="'+esc(cur)+'">'
   +'<div class="mn act role-dd-mn hide" role="listbox">'+opts+'</div>'
   +'</div></div>'}).join('')}
function readAssignments(root){return [...root.querySelectorAll('input[data-env]')].map(s=>({environment:s.dataset.env,role:s.value})).filter(a=>a.role)}
function wireRoleDropdowns(root){
 const closeAll=()=>{root.querySelectorAll('.role-dd-mn').forEach(m=>m.classList.add('hide'));
  root.querySelectorAll('.role-dd-trig').forEach(t=>{t.classList.remove('open');t.setAttribute('aria-expanded','false')})};
 root.querySelectorAll('.role-dd').forEach(dd=>{
  const trig=dd.querySelector('.role-dd-trig'),mn=dd.querySelector('.role-dd-mn'),hid=dd.querySelector('input[data-env]'),val=dd.querySelector('.role-dd-val');
  if(!trig||!mn||!hid||!val)return;
  trig.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();
   const open=!mn.classList.contains('hide');closeAll();
   if(open)return;
   mn.classList.remove('hide');trig.classList.add('open');trig.setAttribute('aria-expanded','true')});
  mn.querySelectorAll('.ami').forEach(opt=>{opt.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();
   const role=opt.dataset.role||'';hid.value=role;val.textContent=role||'— none —';
   mn.querySelectorAll('.ami').forEach(x=>{x.classList.toggle('on',x===opt);x.setAttribute('aria-selected',x===opt?'true':'false')});
   closeAll()})});
 });
 root.addEventListener('click',e=>{if(!e.target.closest('.role-dd'))closeAll()});
}
function closeUModal(){const m=$('umodal');if(m)m.remove()}
function openUserModal(mode,user){closeUModal();const title=mode==='invite'?'Invite user':mode==='roles'?'Change roles':'Update user';
 const body=document.createElement('div');body.className='umodal';body.id='umodal';
 const head=mode==='invite'
  ?'<div class="md-hd"><h3>'+esc(title)+'</h3><p class="md-cs">Invite someone and assign environment roles.</p></div><div class="md-bd"><label>Email</label><input id="uemail" type="email" placeholder="name@company.com"><label>Name</label><input id="unamei" placeholder="Optional">'
  :'<div class="md-hd"><h3>'+esc(title)+'</h3><p class="md-cs mono">'+esc(user.email)+'</p></div><div class="md-bd"><p class="md-sec">Role per environment</p>';
 body.innerHTML='<div class="md card-md">'+head+'<div class="env-roles">'+roleSelects(user&&user.assignments)+'</div></div><div class="md-ft ra"><button type="button" class="b2" id="ucancel">Cancel</button><button type="button" class="b1" id="usave">'+(mode==='invite'?'Send invite':'Save roles')+'</button></div></div>';
 document.body.appendChild(body);wireRoleDropdowns(body);body.querySelector('#ucancel').onclick=closeUModal;body.onclick=e=>{if(e.target===body)closeUModal()};
 body.querySelector('#usave').onclick=async()=>{const assignments=readAssignments(body);if(!assignments.length){toast('Pick at least one environment role');return}
  const btn=body.querySelector('#usave');btn.disabled=true;
  try{if(mode==='invite'){await api('/users/invite',{method:'POST',body:JSON.stringify({email:$('uemail').value,name:$('unamei').value||undefined,assignments})});toast('Invite created')}
   else{await api('/users/'+encodeURIComponent(user.id)+'/roles',{method:'PATCH',body:JSON.stringify({assignments})});toast('Roles updated')}
   closeUModal();if(window.__refreshUsers)window.__refreshUsers()}catch(err){toast(err.message);btn.disabled=false}}}
function syncUsersBulkBtns(){
 const n=document.querySelectorAll('#gt .u-chk:checked').length;
 const en=$('u-enable'),dis=$('u-disable');
 if(en)en.disabled=!n;if(dis)dis.disabled=!n;
 const all=$('u-chk-all');
 if(all){const boxes=[...document.querySelectorAll('#gt .u-chk')].filter(c=>{const tr=c.closest('tr');return tr&&tr.style.display!=='none'});
  const checked=boxes.filter(c=>c.checked).length;
  all.checked=boxes.length>0&&checked===boxes.length;
  all.indeterminate=checked>0&&checked<boxes.length}
}
window.__wireUsersTable=function(){
 const gt=$('gt');if(!gt)return;
 const all=$('u-chk-all');
 if(all)all.onchange=()=>{gt.querySelectorAll('tbody tr').forEach(tr=>{if(tr.style.display==='none')return;const c=tr.querySelector('.u-chk');if(c)c.checked=all.checked});syncUsersBulkBtns()};
 gt.querySelectorAll('.u-chk').forEach(c=>{c.onchange=syncUsersBulkBtns});
 syncUsersBulkBtns();
};
async function usersAdmin(){if(!isAdmin())return hd('Users','Users','Admin access required.')+'<p class="sub">Only Admins can invite, disable and change roles.</p>';
 const users=await api('/users');const counts={active:0,invited:0,disabled:0};users.forEach(u=>{counts[u.status]=(counts[u.status]||0)+1});
 const rows=users.map(u=>{const st=u.status==='active'?'ok:Active':u.status==='invited'?'mut:Invited':'mut:Disabled';
  const chips='html:<div class="role-chips">'+(u.assignments.map(a=>'<span>'+esc(a.environment)+':'+esc(a.role)+'</span>').join('')||'<span>none</span>')+'</div>';
  const chk='html:<label class="row-chk"><input type="checkbox" class="u-chk" data-uid="'+esc(u.id)+'" aria-label="Select '+esc(u.name||u.email)+'"></label>';
  const acts='html:<button type="button" class="uact-gear" data-uact="roles" data-uid="'+esc(u.id)+'" title="Roles" aria-label="Roles"><img src="/stickers/settings.png" alt="" width="13" height="13" decoding="async"></button>'
   +' <button type="button" class="b2 sm" data-uact="remove" data-uid="'+esc(u.id)+'" style="color:var(--bad)" title="Remove user">'+I('trash',12)+'</button>';
  return [chk,u.name,u.email,chips,st,u.lastActiveAt?ago(u.lastActiveAt):'–',acts]});
 const html=hd('Users','Users <span>('+users.length+')</span>','Manage people and their environment access.')
  +heroCards('Users')
  +kp([['Users',users.length],['Active',counts.active||0,'','',C[1]],['Invited',counts.invited||0],['Disabled',counts.disabled||0]])
  +'<div class="fl users-bar">'
  +'<div class="sf" role="search">'+I('search',14)+'<input id="gq" placeholder="Search" aria-label="Search"></div>'
  +'<div class="users-acts">'
  +'<button type="button" class="aws-btn aws-btn-out" id="u-disable" data-uact-bulk="disable" disabled>Disable</button>'
  +'<button type="button" class="aws-btn aws-btn-out" id="u-enable" data-uact-bulk="enable" disabled>Enable</button>'
  +'</div></div>'
  +'<div class="tw tall" id="gt">'+tbl(['__chk','Name','Email','Roles','Status','Last active','Actions'],rows)+'</div>'
  /* ── Teams / Groups section ───────────────────────────────────── */
  +'<div class="sh2-row" style="margin-top:28px"><h2 class="sh2">Groups</h2><button type="button" class="b1" data-t="Create team">'+I('plus',16)+'Create group</button></div>'
  +'<p class="vdsc" style="margin:-8px 0 14px">Groups decide which repositories and environments people can access.</p>'
  +(()=>{
   let groups=[];
   try{groups=JSON.parse(sessionStorage.getItem('tp-groups')||'[]');}catch(e){}
   const gRows=groups.length?groups.map(g=>[
    esc(g.name),
    String(g.members||0),
    g.repositories||'—',
    g.environments||'—',
    g.defaultRole||'—',
    'html:<button class="b2 sm" data-cg-members="'+esc(g.name)+'">'+I('users',14)+'Add members</button>'
    +' <button class="b2 sm" data-cg-remove="'+esc(g.name)+'" style="color:var(--bad)">'+I('trash',14)+'Remove</button>'
   ]):[['No groups yet','—','—','—','—','—']];
   return kp([['Groups',groups.length],['Members',groups.reduce((s,g)=>s+Number(g.members||0),0),'Across all groups'],['Repositories covered',groups.filter(g=>g.repositories==='All').length,'Full access','',C[1]],['Environments covered',groups.filter(g=>g.environments==='All').length,'Full access','',C[1]]])
    +'<div class="tw" id="gt-teams">'+tbl(['Group','Members','Repositories','Environments','Default role','Actions'],gRows)+'</div>';
  })();
 window.__usersCache=users;return html}
/* ── Terraform Automate ──────────────────────────────────────────── */
function atStore(){try{return JSON.parse(sessionStorage.getItem('tp-automate')||'[]')}catch(e){return[]}}
function atSave(a){try{sessionStorage.setItem('tp-automate',JSON.stringify(a))}catch(e){}}
function atLogs(){try{return JSON.parse(sessionStorage.getItem('tp-at-logs')||'[]')}catch(e){return[]}}
function atSaveLogs(l){try{sessionStorage.setItem('tp-at-logs',JSON.stringify(l))}catch(e){}}

const AT_ALERTS=['Slack','MS Teams','Mail','SMS'];

function terraformAutomate(){
 const items=atStore();
 const logs=atLogs();
 const actBtn='<button class="b1" data-t="Automate it">'+I('zap',16)+'Automate it</button>';

 /* Automation rules table */
 const aRows=items.length?items.map((a,i)=>[
  esc(a.name),
  'html:<span class="tx env-'+esc(a.environment)+'">'+esc(a.environment)+'</span>',
  esc(a.repository||'—'),
  'html:<span class="mono">'+esc(a.branch||'—')+'</span>',
  'html:<span class="mono">'+esc(a.command||'plan')+'</span>',
  a.automate?'ok:Auto':'mut:Manual',
  'html:'
   +'<button class="b2 sm" data-at-play="'+i+'">'+I('play',12)+'Run</button> '
   +'<button class="b2 sm" data-at-edit="'+i+'">'+I('edit',12)+'Edit</button> '
   +'<button class="b2 sm" data-at-remove="'+i+'" style="color:var(--bad)">'+I('trash',12)+'Remove</button>'
 ]):[['No automations yet','—','—','—','—','—','—']];

 /* Run logs table */
 const lRows=logs.length?logs.map((l,i)=>[
  l.user||'Automatic',
  l.time||'—',
  'html:<span class="tx env-'+esc(l.environment||'')+'">'+esc(l.environment||'—')+'</span>',
  'html:<span class="mono">'+esc(l.branch||'—')+'</span>',
  esc(l.repository||'—'),
  l.status==='success'?'ok:Success':'bad:Failed',
  'html:<button class="b2 sm" data-at-log="'+i+'" title="View terminal output">'+I('activity',12)+'Terminal</button>'
 ]):[['No runs yet','—','—','—','—','—','—']];

 return hd('Terraform Automate','Terraform Automate','Automatically run Terraform plans when new commits arrive on watched branches.',actBtn)
  +kp([
   ['Automations',items.length],
   ['Active',items.filter(a=>a.automate).length,'Auto-triggered','',C[1]],
   ['Runs today',logs.length,'Total executions'],
   ['Failed',logs.filter(l=>l.status!=='success').length,'','',logs.filter(l=>l.status!=='success').length?C[3]:C[1]]
  ])
  +'<h2 class="sh2">Automation rules</h2>'
  +'<div class="tw tall">'+tbl(['Name','Environment','Repository','Branch','Command','Mode','Actions'],aRows)+'</div>'
  +'<h2 class="sh2" style="margin-top:24px">Run history</h2>'
  +'<div class="tw tall">'+tbl(['User','Time','Environment','Branch','Repository','Status','Actions'],lRows)+'</div>';
}

function openAutomateModal(idx){
 closeUModal();
 const items=atStore();
 const ex=typeof idx==='number'?items[idx]:null;
 const savedRepos=crRepos();
 const repos=savedRepos.length?savedRepos.map(r=>r.url):[];
 const branchSet=new Set();
 savedRepos.forEach(r=>{if(r.branch)branchSet.add(r.branch)});
 const branches=[...branchSet];
 const envList=allEnvNames();
 const body=document.createElement('div');body.className='umodal';body.id='umodal';

 const envOpts=envList.map(e=>'<option value="'+e+'"'+(ex&&ex.environment===e?' selected':'')+'>'+e+'</option>').join('');
 const repoOpts=(repos.length?repos:['']).map(r=>'<option value="'+r+'"'+(ex&&ex.repository===r?' selected':'')+'>'+(r||'Add a repository in Connect Repositories')+'</option>').join('');
 const branchOpts=(branches.length?branches:['']).map(b=>'<option value="'+b+'"'+(ex&&ex.branch===b?' selected':'')+'>'+(b||'No branches saved')+'</option>').join('');
 const alertOpts=AT_ALERTS.map(a=>'<option value="'+a+'">'+(ex&&(ex.alerts||[]).includes(a)?'✓ ':'')+a+'</option>').join('');

 body.innerHTML=
  '<div class="md card-md cr-modal">'
  +'<div class="md-hd"><h3>'+(ex?'Edit automation':'New automation')+'</h3><p class="md-cs">Trigger Terraform plans automatically on new commits.</p></div>'
  +'<div class="md-bd">'
  +'<label>Name</label><input id="at-name" value="'+esc(ex&&ex.name||'')+'" placeholder="e.g. Auto plan on dev">'
  +'<label>Environment</label>'
  +_cgSelect('at-env',envList.length?envList:[''],ex&&ex.environment||envList[0]||'')
  +'<label>Repository</label>'
  +_cgSelect('at-repo',repos.length?repos:[''],ex&&ex.repository||repos[0]||'')
  +'<label>Branch</label>'
  +_cgSelect('at-branch',branches.length?branches:[''],ex&&ex.branch||branches[0]||'')
  +'<label>Command</label>'
  +_cgSelect('at-cmd',allActionNames().length?allActionNames():[''],ex&&ex.command||allActionNames()[0]||'')
  +'<label>Alerts <span class="sub">(optional)</span></label>'
  +'<div class="at-alerts-wrap">'
  +'<button type="button" class="role-dd-trig at-alerts-trig" aria-haspopup="true" aria-expanded="false">'
  +'<span class="role-dd-val at-alerts-val">Select channels…</span>'
  +'<svg class="role-dd-chv" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  +'</button>'
  +'<div class="at-alerts-panel hide">'
  +AT_ALERTS.map(a=>'<label class="at-alerts-item"><input type="checkbox" class="at-alert-chk" value="'+esc(a)+'"'+(ex&&(ex.alerts||[]).includes(a)?' checked':'')+'>'+esc(a)+'</label>').join('')
  +'</div>'
  +'</div>'
  +'<label style="margin-top:14px">Trigger mode</label>'
  +'<div class="at-mode-grid">'
  +'<button type="button" class="at-mode-opt'+((!ex||ex.automate)?' on':'')+'" id="at-auto-yes" data-mode="yes">'
  +'<span class="at-mode-icon">'+I('zap',18)+'</span>'
  +'<span class="at-mode-label">Automatic</span>'
  +'<span class="at-mode-desc">Run on every new commit</span>'
  +'</button>'
  +'<button type="button" class="at-mode-opt'+(ex&&!ex.automate?' on':'')+'" id="at-auto-no" data-mode="no">'
  +'<span class="at-mode-icon">'+I('clock',18)+'</span>'
  +'<span class="at-mode-label">Scheduled</span>'
  +'<span class="at-mode-desc">Run on a fixed schedule</span>'
  +'</button>'
  +'</div>'
  +'<input type="hidden" id="at-auto-val" value="'+((!ex||ex.automate)?'yes':'no')+'">'
  +'<div id="at-schedule" class="'+(ex&&!ex.automate?'':'hide')+'" style="margin-top:10px;display:flex;gap:8px;align-items:center">'
  +'<label style="margin:0;font-size:11px;white-space:nowrap">Every</label>'
  +'<input id="at-freq" type="number" min="1" value="'+esc(String(ex&&ex.schedFreq||'1'))+'" style="width:60px">'
  +_cgSelect('at-unit',['minutes','hours','days'],ex&&ex.schedUnit||'hours')
  +'</div>'
  +'</div>'
  +'<div class="md-ft ra"><button type="button" class="b2" id="ucancel">Cancel</button><button type="button" class="b1" id="usave">'+(ex?'Save':'Create')+'</button></div>'
  +'</div>';

 document.body.appendChild(body);
 _wireCgSelects(body);

 /* Alerts checkbox dropdown — independent, no .mn.act interference */
 const alertTrig=body.querySelector('.at-alerts-trig');
 const alertPanel=body.querySelector('.at-alerts-panel');
 const alertVal=body.querySelector('.at-alerts-val');
 const updateAlertVal=()=>{
  const sel=[...body.querySelectorAll('.at-alert-chk:checked')].map(c=>c.value);
  alertVal.textContent=sel.length?sel.join(', '):'Select channels…';
 };
 alertTrig.addEventListener('click',e=>{
  e.stopPropagation();
  const opening=alertPanel.classList.contains('hide');
  alertPanel.classList.toggle('hide',!opening);
  alertTrig.setAttribute('aria-expanded',String(opening));
 });
 body.querySelectorAll('.at-alert-chk').forEach(c=>c.addEventListener('change',updateAlertVal));
 /* Close on outside click — use capture so it fires before anything else */
 const closeAlerts=e=>{
  if(!alertTrig.contains(e.target)&&!alertPanel.contains(e.target)){
   alertPanel.classList.add('hide');
   alertTrig.setAttribute('aria-expanded','false');
   document.removeEventListener('mousedown',closeAlerts,true);
  }
 };
 alertTrig.addEventListener('click',()=>document.addEventListener('mousedown',closeAlerts,true));
 updateAlertVal();

 /* Trigger mode cards */
 body.querySelectorAll('.at-mode-opt').forEach(btn=>{
  btn.addEventListener('click',()=>{
   body.querySelectorAll('.at-mode-opt').forEach(b=>b.classList.remove('on'));
   btn.classList.add('on');
   body.querySelector('#at-auto-val').value=btn.dataset.mode;
   body.querySelector('#at-schedule').classList.toggle('hide',btn.dataset.mode==='yes');
  });
 });

 body.querySelector('#ucancel').onclick=closeUModal;
 body.onclick=e=>{if(e.target===body)closeUModal()};
 body.querySelector('#usave').onclick=()=>{
  const name=body.querySelector('#at-name').value.trim();
  if(!name){toast('Name is required');return}
  const alerts=[...body.querySelectorAll('.at-alert-chk:checked')].map(c=>c.value);
  const automate=body.querySelector('#at-auto-val').value==='yes';
  const entry={
   name,
   environment:body.querySelector('#at-env').value,
   repository:body.querySelector('#at-repo').value,
   branch:body.querySelector('#at-branch').value,
   command:body.querySelector('#at-cmd').value.trim()||'plan',
   alerts,automate,
   schedFreq:body.querySelector('#at-freq').value,
   schedUnit:body.querySelector('#at-unit').value
  };
  const updated=atStore();
  if(typeof idx==='number')updated[idx]=entry;else updated.push(entry);
  atSave(updated);
  toast(ex?'Automation updated':'Automation "'+name+'" created');
  closeUModal();if(window.__refreshAutomate)window.__refreshAutomate();
 };
}

function openAtTerminalPanel(logIdx){
 const logs=atLogs();
 const log=logs[logIdx];if(!log)return;
 document.querySelectorAll('.at-terminal-panel').forEach(p=>p.remove());

 const statusOk=log.status==='success';
 const rawOut=log.output||'No output captured.';
 const cleanOut=(()=>{
  const lines=rawOut.split('\n');
  const filtered=lines.filter(l=>{
   const t=l.trim();
   /* Drop lines that are command echoes: start with $, or look like "Terraform <command> ... complete" */
   if(t.startsWith('$'))return false;
   if(/^terraform\s+(make|plan|apply|destroy|init|validate)/i.test(t)&&/complete/i.test(t))return false;
   if(/^terraform\s+make\s+terraform/i.test(t))return false;
   return true;
  });
  while(filtered.length&&!filtered[0].trim())filtered.shift();
  return filtered.join('\n').trim()||rawOut;
 })();

 /* Terminal themes */
 const themes={
  dark:{bg:'#0d1117',text:'#cdd9e5',bar:'#1c2128',border:'#21262d',bartitle:'#8b949e'},
  monokai:{bg:'#272822',text:'#f8f8f2',bar:'#1a1a17',border:'#3e3d32',bartitle:'#75715e'},
  solarized:{bg:'#002b36',text:'#839496',bar:'#073642',border:'#004052',bartitle:'#586e75'},
  light:{bg:'#f6f8fa',text:'#24292f',bar:'#eaeef2',border:'#d0d7de',bartitle:'#57606a'}
 };
 let curTheme='dark';
 const applyTheme=t=>{
  curTheme=t;const th=themes[t]||themes.dark;
  const term=panel.querySelector('.at-tp-term');
  const bar=panel.querySelector('.at-tp-bar');
  const out=panel.querySelector('.at-tp-output');
  const title=panel.querySelector('.at-tp-bartitle');
  if(term)term.style.background=th.bg;
  if(bar){bar.style.background=th.bar;bar.style.borderColor=th.border}
  if(out){out.style.background=th.bg;out.style.color=th.text}
  if(title)title.style.color=th.bartitle;
  panel.querySelectorAll('.at-tp-theme-btn').forEach(b=>b.classList.toggle('on',b.dataset.theme===t));
 };

 const panel=document.createElement('div');
 panel.className='at-terminal-panel';

 panel.innerHTML=
  /* ── Info header ── */
  '<div class="at-tp-info">'
  +'<div class="at-tp-info-top">'
  +'<span class="at-tp-name">'+esc(log.name||'Automation run')+'</span>'
  +'<div class="at-tp-actions">'
  +'<button class="at-tp-btn" id="at-tp-min" title="Minimize"><svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 8h10"/></svg></button>'
  +'<button class="at-tp-btn" id="at-tp-max" title="Maximize"><svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2h4v4M6 14H2v-4M14 2l-5 5M2 14l5-5"/></svg></button>'
  +'<button class="at-tp-btn at-tp-close-btn" id="at-tp-close" title="Close"><svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l10 10M13 3 3 13"/></svg></button>'
  +'</div>'
  +'</div>'
  +'<div class="at-tp-meta-row">'
  +'<div class="at-tp-badge"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/></svg>'+esc(log.user||'Automatic')+'</div>'
  +'<div class="at-tp-badge at-tp-badge-env">'+esc(log.environment||'—')+'</div>'
  +'<div class="at-tp-badge"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v12M18 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM6 15a3 3 0 1 0 6 0"/></svg>'+esc(log.branch||'—')+'</div>'
  +'<div class="at-tp-badge '+(statusOk?'at-tp-badge-ok':'at-tp-badge-fail')+'">'+(statusOk?'✓ Success':'✕ Failed')+'</div>'
  +'<div class="at-tp-badge at-tp-badge-time"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>'+esc(log.time||'—')+'</div>'
  +'</div>'
  +'</div>'
  /* ── Terminal ── */
  +'<div class="at-tp-term">'
  +'<div class="at-tp-bar">'
  +'<span class="mac-dot r"></span><span class="mac-dot y"></span><span class="mac-dot g"></span>'
  +'<span class="at-tp-bartitle">terraform</span>'
  +'<div class="at-tp-themes">'
  +'<button class="at-tp-theme-btn on" data-theme="dark" title="Dark">Dark</button>'
  +'<button class="at-tp-theme-btn" data-theme="monokai" title="Monokai">Monokai</button>'
  +'<button class="at-tp-theme-btn" data-theme="solarized" title="Solarized">Solarized</button>'
  +'<button class="at-tp-theme-btn" data-theme="light" title="Light">Light</button>'
  +'</div>'
  +'</div>'
  +'<pre class="at-tp-output">'+esc(cleanOut)+'</pre>'
  +'</div>';

 /* Controls */
 panel.querySelector('#at-tp-close').onclick=()=>panel.remove();
 panel.querySelector('#at-tp-min').onclick=()=>{
  const min=panel.classList.toggle('minimized');
  panel.querySelector('#at-tp-min').title=min?'Restore':'Minimize';
  panel.querySelector('#at-tp-min svg path').setAttribute('d',min?'M3 8h10M8 3v10':'M3 8h10');
 };
 panel.querySelector('#at-tp-max').onclick=()=>{
  const max=panel.classList.toggle('maximized');
  panel.querySelector('#at-tp-max').title=max?'Restore':'Maximize';
 };
 panel.querySelectorAll('.at-tp-theme-btn').forEach(btn=>{
  btn.addEventListener('click',e=>{e.stopPropagation();applyTheme(btn.dataset.theme)});
 });

 document.querySelector('#dash .shell').appendChild(panel);
 applyTheme('dark');
}

function notificationsAdmin(){
 if(!isAdmin())return hd('Notifications','Notifications','Admin access required.');
 const PROV_ICONS_SMALL={
  slack:'<svg viewBox="0 0 32 32" width="14" height="14" aria-hidden="true"><path d="M8.5 20a2.5 2.5 0 1 1-2.5-2.5H8.5V20zm1.25 0a2.5 2.5 0 0 1 5 0v6.25a2.5 2.5 0 0 1-5 0V20zm2.5-11.5a2.5 2.5 0 1 1 2.5-2.5V8.5H12.25zm0 1.25a2.5 2.5 0 0 1 0 5H6a2.5 2.5 0 0 1 0-5H12.25zm11.5 2.5a2.5 2.5 0 1 1 2.5 2.5H23.75V12.25zm-1.25 0a2.5 2.5 0 0 1-5 0V6a2.5 2.5 0 0 1 5 0v6.25zM20.5 23.75a2.5 2.5 0 1 1-2.5 2.5v-2.5h2.5zm0-1.25a2.5 2.5 0 0 1 0-5H26a2.5 2.5 0 0 1 0 5H20.5z" fill="#E01E5A"/><path d="M12.25 8.5V6a2.5 2.5 0 0 1 5 0v6.25h-6.25z" fill="#36C5F0"/><path d="M23.75 12.25H26a2.5 2.5 0 0 1 0 5h-6.25v-6.25z" fill="#2EB67D"/><path d="M17.75 23.5v2.5a2.5 2.5 0 0 1-5 0V20h6.25z" fill="#ECB22E"/></svg>',
  teams:'<img src="/illustrations/stickers/teams.png" width="14" height="14" style="object-fit:contain;vertical-align:middle" alt="MS Teams">',
  gmail:'<img src="/illustrations/stickers/gmail.png" width="14" height="14" style="object-fit:contain;vertical-align:middle" alt="Mail">',
  sms:'<img src="/illustrations/stickers/sms.png" width="14" height="14" style="object-fit:contain;vertical-align:middle" alt="SMS">'
 };
 const PROV_LABELS={slack:'Slack',teams:'MS Teams',gmail:'Mail',sms:'SMS'};
 /* Only show saved channels — no mock data */
 const saved=JSON.parse(sessionStorage.getItem('tp-notif-channels')||'[]');
 const all=[...saved];
 const rows=all.map((ch,i)=>{
  const prov=ch.provider||'slack';
  const label=PROV_LABELS[prov]||prov;
  const icon=PROV_ICONS_SMALL[prov]||'';
  const webhook=ch['nc-webhook']||'';
  const preview15=webhook.slice(0,15)+'…';
  const webhookCell=webhook
   ?'html:<span style="display:inline-flex;align-items:center;gap:5px">'
    +'<span class="mono nc-wh" id="nc-wh-'+i+'" data-full="'+esc(webhook)+'" data-short="'+esc(preview15)+'" style="font-size:10px">'+esc(preview15)+'</span>'
    +'<button type="button" class="b2 sm" data-nc-show="nc-wh-'+i+'" style="padding:1px 7px;font-size:10px">Show</button>'
    +'</span>'
   :'html:<span class="sub">—</span>';
  const statusCell=(ch.status||'Active')==='Active'?'ok:Active':'bad:Inactive';
  const actCell='html:'
   +'<button class="b2 sm" data-nc-edit="'+i+'" style="margin-right:3px">'+I('edit',12)+'Edit</button>'
   +'<button class="b2 sm" data-nc-remove="'+i+'" style="color:var(--bad);margin-right:3px">'+I('trash',12)+'Remove</button>';
  return [
   'html:<span style="display:inline-flex;align-items:center;gap:5px">'+icon+'<b style="font-size:11px">'+esc(label)+'</b></span>',
   esc(ch.name||'—'),
   webhookCell,
   statusCell,
   actCell
  ];
 });
 window.__notifChannels=all;
 return hd('Notifications','Notifications','Manage notification channels for run events.',
  '<button class="b1" data-t="Add channel">'+I('plus',16)+'Add channel</button>')
  +heroCards('Notifications')
  +'<div class="tw tall" id="gt-notif">'+tbl(['Channel type','Channel name','Webhook URL','Status','Actions'],rows)+'</div>';
}

async function auditAdmin(){if(!isAdmin())return hd('Audit log','Audit log','Admin access required.');
 const logs=await api('/audit-logs?limit=100');
 const rows=logs.map(l=>[ago(l.createdAt),l.actorEmail||'—',l.action,l.targetType+(l.targetId?' · '+l.targetId.slice(-8):''),l.environment||'–',l.ip||'–',l.result==='success'?'ok:Success':'bad:Failed']);
 return hd('Audit log','Audit log <span>('+logs.length+')</span>','Every admin and auth action, with who, where and when.','<button class="b1" data-t="Export CSV" id="audit-export">'+I('download',16)+'Export CSV</button>')
  +heroCards('Audit log')
  +'<div class="fl"><div class="sf" role="search">'+I('search',14)+'<input id="gq" placeholder="Search" aria-label="Search"></div></div><div class="tw tall" id="gt">'+tbl(['Time','Actor','Action','Target','Environment','IP','Result'],rows)+'</div>'}
function go(n){if(n!=='Live locks'&&n!=='Dashboard')stopLockTick();window.__view=n;try{sessionStorage.setItem('tp-view',n)}catch(e){}
 side.querySelectorAll('a').forEach(a=>a.classList.toggle('on',a.dataset.v===n));
 const gp=GP[n]||(AFm[n]?'Terraform':['Users','Connect Repositories','Workers','Integration','Environments','Variables','Notifications','Audit log'].includes(n)?'Admin':'');
 const gGo=gp==='Overview'?'Dashboard':gp==='Terraform'?'Terraform Plan':gp==='Code'?'Repositories':gp==='Environments'?'Workspaces':gp==='Admin'?'Users':'';
 const crumb=$('cr');
 if(crumb)crumb.innerHTML=(gp
  ?(gGo?'<a data-v-go="'+gGo+'">'+gp+'</a>':'<span>'+gp+'</span>')+'<span class="sep">/</span><span class="here">'+n+'</span>'
  :'<a data-v-go="Dashboard">Home</a><span class="sep">/</span><span class="here">'+n+'</span>');
 if(window.__paintHelp)window.__paintHelp(n);
 const vr=$('v-runs'),vg=$('v-gen');
 if(AFm[n]){vg.classList.add('hide');vr.classList.remove('hide');AF=AFm[n][0];$('rtt').textContent=AFm[n][1];$('rd').textContent=AFm[n][2];$('rpi').innerHTML=I(NI[n],24);$('po').classList.add('hide');paintHero(n);draw();attachTableSort(vr.querySelector('table'));return}
 vr.classList.add('hide');vg.classList.remove('hide');
 /* Removed pages — redirect to nearest equivalent */
 if(n==='Approvals'){return go('Terraform Plan')}
 if(n==='Roles and permissions'||n==='Approval policies'){return go('Users')}
 if(n==='API tokens'){return go('Audit log')}
 if(n==='Overview'){return go('Dashboard')}
 if(n==='Environments'){return go('Variables')}
 if(n==='All runs'||n==='Plans'||n==='Applies'||n==='Destroys'||n==='Queue'){return go('Terraform Plan')}
 const paint=async()=>{try{vg.innerHTML=n==='Dashboard'?home():n==='Live locks'?locks():n==='Terraform Automate'?terraformAutomate():n==='Connect Repositories'?await connectReposAdmin():n==='Integration'?intCredsAdmin():n==='Workers'?integrationAdmin():n==='Variables'?await variablesAdmin():n==='Environments'?await variablesAdmin():n==='Users'?await usersAdmin():n==='Notifications'?notificationsAdmin():n==='Audit log'?await auditAdmin():n==='Repositories'?await liveRepos():n==='Branches'?await liveBranches():n==='Pull requests'?await livePullRequests():gen(n,D[n]);
  wireAllPagers(vg);
  if(n==='Users'&&window.__wireUsersTable)window.__wireUsersTable();
  if(n==='Connect Repositories'||n==='Workers'||n==='Integration'){
   vg.querySelectorAll('.tw').forEach(tw=>{
    if(tw.__pager)return;
    if(tw.querySelector('#tb'))return;
    attachPager(tw,{pageSize:5});
   });
  }
  const q=$('gq');if(q)q.oninput=()=>{const v=q.value.toLowerCase();const gt=$('gt');const pager=gt&&gt.__pager;if(pager)pager.setFilter(v);else if(gt)gt.querySelectorAll('tbody tr').forEach(r=>r.style.display=r.textContent.toLowerCase().includes(v)?'':'none')}}
  catch(err){vg.innerHTML=hd(n,esc(n),err.message);toast(err.message)}};
 window.__refreshUsers=()=>{if(n==='Users')paint()};window.__refreshBb=()=>{if(n==='Connect Repositories')paint()};window.__refreshEnvs=()=>{if(n==='Environments'||n==='Variables')paint()};window.__refreshVariables=()=>{if(n==='Variables')paint()};window.__refreshNotifications=()=>{if(n==='Notifications')paint()};window.__refreshAutomate=()=>{if(n==='Terraform Automate')paint()};window.__refreshIntegration=()=>{if(n==='Workers')paint()};window.__refreshIntCreds=()=>{if(n==='Integration')paint()};paint()}
side.addEventListener('click',e=>{const a=e.target.closest('a[data-v]');if(a)go(a.dataset.v)});
$('dash').addEventListener('click',async e=>{
 const rfBtn=e.target.closest('#rf');if(rfBtn){e.preventDefault();refreshRuns();return}
 const howX=e.target.closest('#how-x');if(howX){e.preventDefault();const card=$('how-card');if(!card)return;dismissHow(card.getAttribute('data-how-page')||'All runs');card.remove();requestAnimationFrame(equalizeOverviewExplore);return}
 const howTog=e.target.closest('#how-tog');if(howTog){e.preventDefault();const card=$('how-card');if(!card)return;const open=card.classList.contains('collapsed');card.classList.toggle('collapsed',!open);howTog.setAttribute('aria-expanded',String(open));setCardOpen(card.getAttribute('data-how-key')||'tp-how-open',open);requestAnimationFrame(equalizeOverviewExplore);return}
 const welcomeX=e.target.closest('.welcome-x');if(welcomeX){e.preventDefault();const card=welcomeX.closest('[data-welcome]');if(!card)return;dismissWelcome(card.getAttribute('data-welcome-page')||'All runs');card.remove();requestAnimationFrame(equalizeOverviewExplore);return}
 const welcomeTog=e.target.closest('.welcome-tog');if(welcomeTog){e.preventDefault();const card=welcomeTog.closest('[data-welcome]');if(!card)return;const open=card.classList.contains('collapsed');card.classList.toggle('collapsed',!open);welcomeTog.setAttribute('aria-expanded',String(open));setCardOpen(card.getAttribute('data-welcome-key')||'tp-welcome-open',open);requestAnimationFrame(equalizeOverviewExplore);return}
 const infoLink=e.target.closest('a.info');if(infoLink){e.preventDefault();if(window.__openHelp)window.__openHelp();return}
 const goBtn=e.target.closest('[data-v-go]');if(goBtn&&window.__go){window.__go(goBtn.dataset.vGo);return}
 const monthBtn=e.target.closest('[data-dash-month]');
 if(monthBtn){
  e.preventDefault();
  if(monthBtn.disabled)return;
  window.__dashMonthOff=Math.max(0,(window.__dashMonthOff||0)+(Number(monthBtn.getAttribute('data-dash-month'))||0));
  if(window.__go)window.__go('Dashboard');
  return;
 }
 if(!e.target.closest('#v-gen')){
  const runBtn=e.target.closest('[data-t="Run terraform"]');
  if(runBtn){const nr=$('nr');if(nr)nr.click();else toast('Open Run terraform from the header');return}
  return;
 }
 const b=e.target.closest('[data-t],[data-uact],[data-uact-bulk],[data-bb],[data-env],[data-va],[data-ig],[data-ic],[data-plan-pr],[data-cr],[data-cg-members],[data-cg-remove],[data-nc-remove],[data-nc-edit],[data-nc-show],[data-at-play],[data-at-remove],[data-at-edit],[data-at-log]');if(!b)return;
 if(b.dataset.t==='Export CSV'||b.id==='audit-export'){if(!isAdmin()){toast('Admin only');return}
  try{const res=await fetch(API+'/audit-logs/export?format=csv&limit=5000',{credentials:'same-origin'});
   if(!res.ok)throw new Error('Export failed ('+res.status+')');
   const blob=await res.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');
   a.href=url;a.download='terraplan-audit-'+new Date().toISOString().slice(0,10)+'.csv';a.click();URL.revokeObjectURL(url);toast('Audit CSV downloaded')}catch(err){toast(err.message)}return}
 if(b.dataset.cgMembers!==undefined){if(!isAdmin()){toast('Admin only');return}openAddGroupMembersModal(b.dataset.cgMembers);return}
 if(b.dataset.cgRemove!==undefined){if(!isAdmin()){toast('Admin only');return}
  const gname=b.dataset.cgRemove;
  openConfirmModal({title:'Remove group',message:'Remove group "'+gname+'"? Members will lose the group access policy.',confirmLabel:'Remove group',confirmClass:'btn-danger',onConfirm:()=>{
   try{const gs=JSON.parse(sessionStorage.getItem('tp-groups')||'[]');const i=gs.findIndex(g=>g.name===gname);if(i>=0){gs.splice(i,1);sessionStorage.setItem('tp-groups',JSON.stringify(gs))}
   }catch(e){}toast('Group "'+gname+'" removed');if(window.__refreshUsers)window.__refreshUsers()}});
  return}
 if(b.dataset.t==='Invite user'){if(!isAdmin()){toast('Admin only');return}openUserModal('invite');return}
 if(b.dataset.t==='Automate it'){openAutomateModal();return}
 if(b.dataset.atPlay!==undefined){
  const idx=Number(b.dataset.atPlay);const a=atStore()[idx];if(!a)return;
  b.disabled=true;
  try{
   const repository=repoSlugFromUrl(a.repository)||a.repository;
   const action=parseAction(a.command||'plan');
   if(!repository)throw new Error('Automation has no repository');
   if(!a.branch)throw new Error('Automation has no branch');
   if(!a.environment)throw new Error('Automation has no environment');
   const created=await api('/runs',{method:'POST',body:JSON.stringify({repository,branch:a.branch,environment:a.environment,action})});
   const logs=atLogs();
   logs.unshift({name:a.name,user:ME&&ME.name||ME&&ME.email||'Manual',time:new Date().toISOString(),environment:a.environment,branch:a.branch,repository:repository,command:action,status:created.status||'queued',output:'',runId:created.id});
   atSaveLogs(logs);
   toast(created.status==='waiting_approval'?'Run created — waiting for approval.':'Run queued.');
   await sync();
   if(window.__refreshAutomate)window.__refreshAutomate();
   openRunTerminal(created.id);
  }catch(err){toast(err.message)}
  finally{b.disabled=false}
  return}
 if(b.dataset.atEdit!==undefined){openAutomateModal(Number(b.dataset.atEdit));return}
 if(b.dataset.atRemove!==undefined){
  const idx=Number(b.dataset.atRemove);const a=atStore()[idx];
  openConfirmModal({title:'Remove automation',message:'Remove "'+((a&&a.name)||'this automation')+'"?',confirmLabel:'Remove',confirmClass:'btn-danger',onConfirm:()=>{
   const updated=atStore();updated.splice(idx,1);atSave(updated);toast('Automation removed');if(window.__refreshAutomate)window.__refreshAutomate()}});return}
 if(b.dataset.atLog!==undefined){openAtTerminalPanel(Number(b.dataset.atLog));return}
 if(b.dataset.ncShow){
  const el=document.getElementById(b.dataset.ncShow);if(!el)return;
  const full=el.dataset.full||'';
  /* Remove any existing popup */
  document.querySelectorAll('.nc-wh-popup').forEach(p=>p.remove());
  const popup=document.createElement('div');popup.className='nc-wh-popup';
  popup.innerHTML=
   '<div class="nc-wh-popup-hd"><span>Webhook URL</span><button class="nc-wh-close" aria-label="Close">×</button></div>'
   +'<div class="nc-wh-popup-body">'
   +'<span class="mono nc-wh-full">'+esc(full)+'</span>'
   +'<button class="nc-wh-copy" title="Copy URL"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"/></svg></button>'
   +'</div>';
  /* Position above the button */
  const rect=b.getBoundingClientRect();
  popup.style.cssText='position:fixed;z-index:200;min-width:300px;max-width:420px;'
   +'left:'+Math.min(Math.max(8,rect.left),window.innerWidth-428)+'px;'
   +'bottom:'+(window.innerHeight-rect.top+6)+'px;';
  document.body.appendChild(popup);
  popup.querySelector('.nc-wh-close').onclick=()=>popup.remove();
  popup.querySelector('.nc-wh-copy').onclick=()=>{
   navigator.clipboard.writeText(full).then(()=>{
    const btn=popup.querySelector('.nc-wh-copy');
    btn.innerHTML='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 8.5l3.5 3.5 7-7"/></svg>';
    setTimeout(()=>popup.remove(),1200);
   }).catch(()=>toast('Copy failed'));
  };
  /* Close on outside click */
  setTimeout(()=>document.addEventListener('click',function h(ev){if(!popup.contains(ev.target)&&ev.target!==b){popup.remove();document.removeEventListener('click',h)}},true),50);
  return}
 if(b.dataset.ncRemove!==undefined){
  const idx=Number(b.dataset.ncRemove);
  const all=window.__notifChannels||[];
  const ch=all[idx];
  openConfirmModal({title:'Remove channel',message:'Remove notification channel "'+((ch&&ch.name)||'this channel')+'"?',confirmLabel:'Remove',confirmClass:'btn-danger',onConfirm:()=>{
   try{const saved=JSON.parse(sessionStorage.getItem('tp-notif-channels')||'[]');saved.splice(idx,1);sessionStorage.setItem('tp-notif-channels',JSON.stringify(saved));}catch(e){}
   toast('Channel removed');if(window.__refreshNotifications)window.__refreshNotifications()}});
  return}
 if(b.dataset.ncEdit!==undefined){
  toast('Edit channel coming soon');return}
 if(b.dataset.t==='Add channel'){if(!isAdmin()){toast('Admin only');return}openAddChannelModal();return}
 if(b.dataset.t==='Create team'){if(!isAdmin()){toast('Admin only');return}openCreateGroupModal();return}
 if(b.dataset.uactBulk){if(!isAdmin()){toast('Admin only');return}
  const ids=[...document.querySelectorAll('#gt .u-chk:checked')].map(x=>x.dataset.uid).filter(Boolean);
  if(!ids.length){toast('Select at least one user');return}
  const status=b.dataset.uactBulk==='disable'?'disabled':'active';
  b.disabled=true;
  try{for(const id of ids)await api('/users/'+encodeURIComponent(id)+'/status',{method:'PATCH',body:JSON.stringify({status})});
   toast(status==='disabled'?(ids.length===1?'User disabled':ids.length+' users disabled'):(ids.length===1?'User enabled':ids.length+' users enabled'));
   if(window.__refreshUsers)window.__refreshUsers()}catch(err){toast(err.message);b.disabled=false}return}
 if(b.dataset.uact){const u=(window.__usersCache||[]).find(x=>x.id===b.dataset.uid);if(!u)return;
  if(b.dataset.uact==='roles'){openUserModal('roles',u);return}
  if(b.dataset.uact==='remove'){
   openConfirmModal({title:'Remove user',message:'Remove '+u.name+' ('+u.email+')? They will lose all access immediately.',confirmLabel:'Remove user',confirmClass:'btn-danger',onConfirm:async()=>{
    try{await api('/users/'+encodeURIComponent(u.id)+'/status',{method:'PATCH',body:JSON.stringify({status:'disabled'})});toast(u.name+' disabled');if(window.__refreshUsers)window.__refreshUsers()}catch(err){toast(err.message)}}});
   return}
  return}
 if(b.dataset.ic){if(!isAdmin()){toast('Admin only');return}
  const kind=b.dataset.kind||'aws';
  if(b.dataset.ic==='copy'){icCopyPolicy(kind,b);return}
  if(b.dataset.ic==='add'){openIntCredModal(kind);return}
  if(b.dataset.ic==='edit'){
   const row=(icStore()[kind]||[]).find(x=>x.id===b.dataset.id);if(!row)return;openIntCredModal(kind,row);return}
  if(b.dataset.ic==='test'){icRunTest(kind,b.dataset.id,b);return}
  if(b.dataset.ic==='delete'){
   const row=(icStore()[kind]||[]).find(x=>x.id===b.dataset.id);
   openConfirmModal({title:'Remove credentials',message:'Remove "'+((row&&row.name)||'this profile')+'"? Workers that depend on it will fail until you add keys again.',confirmLabel:'Remove',confirmClass:'btn-danger',onConfirm:()=>{
    const s=icStore();s[kind]=(s[kind]||[]).filter(x=>x.id!==b.dataset.id);icSave(s);
    toast('Credentials removed');if(window.__refreshIntCreds)window.__refreshIntCreds()}});
   return}
  return}
 if(b.dataset.ig){if(!isAdmin()){toast('Admin only');return}
  if(b.dataset.ig==='setup'){openIgModal(b.dataset.kind==='ec2'?'server':(b.dataset.kind||'server'));return}
  if(b.dataset.ig==='edit'){const row=igItems().find(x=>x.id===b.dataset.id);if(!row)return;openIgModal(row.kind==='ec2'?'server':row.kind,row.id);return}
  if(b.dataset.ig==='test'){igRunTest(b.dataset.id,b);return}
  if(b.dataset.ig==='enable'){
   const s=igStore();
   s.items.forEach(x=>x.enabled=x.id===b.dataset.id);
   igSave(s);
   if(window.__refreshIntegration)window.__refreshIntegration();return}
  if(b.dataset.ig==='disable'){
   const s=igStore();s.items.forEach(x=>x.enabled=false);igSave(s);
   if(window.__refreshIntegration)window.__refreshIntegration();return}
  if(b.dataset.ig==='delete'){
   const row=igItems().find(x=>x.id===b.dataset.id);
   openConfirmModal({title:'Remove worker',message:'Remove "'+((row&&row.name)||'this worker')+'"? Terraform will run on this host unless another worker is enabled.',confirmLabel:'Remove',confirmClass:'btn-danger',onConfirm:()=>{
    const s=igStore();s.items=s.items.filter(x=>x.id!==b.dataset.id);igSave(s);
    toast('Worker removed');if(window.__refreshIntegration)window.__refreshIntegration()}});
   return}
  return}
 if(b.dataset.va){if(!isAdmin()){toast('Admin only');return}
  if(b.dataset.va==='add'){openAddActionModal();return}
  if(b.dataset.va==='delete'){
   const name=b.dataset.vaName||'';
   openConfirmModal({title:'Remove action',message:'Remove "'+name+'" from Action dropdowns?',confirmLabel:'Remove',confirmClass:'btn-danger',onConfirm:()=>{
    saveActionNameList(actionNameList().filter(n=>n!==name));toast('Removed');if(window.__refreshVariables)window.__refreshVariables()}});
   return}
  return}
 if(b.dataset.env){if(!isAdmin()){toast('Admin only');return}
  try{if(b.dataset.env==='refresh'){if(window.__refreshEnvs)window.__refreshEnvs();return}
   if(b.dataset.env==='add'){openAddEnvModal();return}
   if(b.dataset.env==='edit'){const row=(window.__envsCache||[]).find(x=>x.name===b.dataset.ename);if(row)openEnvModal(row);return}
   if(b.dataset.env==='test'){b.disabled=true;const r=await api('/environments/'+encodeURIComponent(b.dataset.ename)+'/test-assume',{method:'POST',body:'{}'});
    toast(r.ok?'STS OK · expires '+ago(r.expiration):('STS failed: '+(r.error||'unknown')));if(window.__refreshEnvs)window.__refreshEnvs();return}
   if(b.dataset.env==='delete'){
    const name=b.dataset.ename;
    openConfirmModal({title:'Remove environment',message:'Remove "'+name+'" from Environment dropdowns?',confirmLabel:'Remove',confirmClass:'btn-danger',onConfirm:async()=>{
     saveEnvNameList(envNameList().filter(n=>n!==name));
     try{await api('/environments/'+encodeURIComponent(name),{method:'DELETE'})}catch(e){}
     toast('Removed');if(window.__refreshVariables)window.__refreshVariables();if(window.__refreshEnvs)window.__refreshEnvs();
    }});
    return}

  }catch(err){toast(err.message);b.disabled=false}return}
 if(b.dataset.bb){if(!isAdmin()){toast('Admin only');return}
  try{if(b.dataset.bb==='edit'){openConnectRepoModal();return}
   if(b.dataset.bb==='test'){await api('/bitbucket/connection/test',{method:'POST',body:'{}'});toast('Connection OK');if(window.__refreshBb)window.__refreshBb();return}
   if(b.dataset.bb==='sync'){const r=await api('/bitbucket/connection/sync',{method:'POST',body:'{}'});toast('Synced '+r.repositories+' repositories');if(window.__refreshBb)window.__refreshBb();return}
   if(b.dataset.bb==='disconnect'){if(!confirm('Disconnect Bitbucket?'))return;await api('/bitbucket/connection',{method:'DELETE'});toast('Disconnected');if(window.__refreshBb)window.__refreshBb();return}
  }catch(err){toast(err.message)}return}
 if(b.dataset.cr){if(!isAdmin()){toast('Admin only');return}
  if(b.dataset.cr==='add-profile'){openConnectRepoModal();return}
  if(b.dataset.cr==='edit-profile'){openConnectRepoModal(Number(b.dataset.pi));return}
  if(b.dataset.cr==='test-profile'){
   const pi=Number(b.dataset.pi);const p=crProfiles()[pi];if(!p){toast('Profile not found');return}
   const resEl=document.getElementById('cr-test-res-'+pi);
   const setRes=(ok,msg)=>{if(!resEl)return;resEl.textContent=msg;resEl.className='cr-test-res '+(ok?'cr-test-res-ok':'cr-test-res-err')};
   b.disabled=true;const orig=b.innerHTML;b.textContent='Testing…';
   if(resEl){resEl.textContent='';resEl.className='cr-test-res'}
   (async()=>{
    try{
     if(p.provider==='bitbucket'){
      await api('/bitbucket/connection/test',{method:'POST',body:'{}'});
      setRes(true,'✓ Connected');
     } else if(p.provider==='github'){
      const res=await fetch('https://api.github.com/user',{headers:{Authorization:'token '+(p.tokenPreview||''),Accept:'application/vnd.github+json'}});
      if(!res.ok)throw new Error('Not reachable ('+res.status+')');
      const data=await res.json();
      setRes(true,'✓ Connected as '+(data.login||p.username));
     } else if(p.provider==='gitlab'){
      const base=(p.host||'https://gitlab.com').replace(/\/+$/,'');
      const res=await fetch(base+'/api/v4/user',{headers:{'PRIVATE-TOKEN':p.tokenPreview||''}});
      if(!res.ok)throw new Error('Not reachable ('+res.status+')');
      const data=await res.json();
      setRes(true,'✓ Connected as '+(data.username||p.username));
     }
    }catch(err){setRes(false,'✕ '+(err.message||'Connection failed'))}
    finally{b.disabled=false;b.innerHTML=orig}
   })();
   return}
  if(b.dataset.cr==='del-profile'){
   const pi=Number(b.dataset.pi);const p=crProfiles();if(!p[pi])return;
   openConfirmModal({title:'Remove credentials',message:'Remove profile "'+p[pi].name+'"? Any repositories using it will lose access.',confirmLabel:'Remove',confirmClass:'btn-danger',onConfirm:()=>{
    p.splice(pi,1);saveCrProfiles(p);toast('Profile removed');if(window.__refreshBb)window.__refreshBb()}});
   return}
  if(b.dataset.cr==='add-repo'){openAddRepoModal();return}
  if(b.dataset.cr==='edit-repo'){openAddRepoModal(Number(b.dataset.ri));return}
  if(b.dataset.cr==='test-repo'){
   const ri=Number(b.dataset.ri);const r=crRepos()[ri];if(!r){toast('Repository not found');return}
   const prof=crProfiles()[r.profileIdx];
   const resEl=document.getElementById('cr-repo-res-'+ri);
   const setRes=(ok,msg)=>{if(!resEl)return;resEl.textContent=msg;resEl.className='cr-test-res '+(ok?'cr-test-res-ok':'cr-test-res-err')};
   b.disabled=true;const orig=b.innerHTML;b.textContent='Testing…';
   if(resEl){resEl.textContent='';resEl.className='cr-test-res'}
   (async()=>{
    try{
     const provider=r.provider||prof&&prof.provider||'bitbucket';
     const token=prof&&prof.tokenPreview||'';
     const username=prof&&prof.username||'';
     if(provider==='bitbucket'){
      await api('/bitbucket/connection/test',{method:'POST',body:'{}'});
      setRes(true,'✓ Reachable');
     } else if(provider==='github'){
      /* Test repo existence via GitHub API */
      const urlMatch=r.url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
      if(urlMatch){
       const res=await fetch('https://api.github.com/repos/'+urlMatch[1]+'/'+urlMatch[2],{headers:{Authorization:'token '+token,Accept:'application/vnd.github+json'}});
       if(!res.ok)throw new Error('Not reachable ('+res.status+')');
       const data=await res.json();
       setRes(true,'✓ Reachable · '+esc(data.full_name));
      } else {
       const res=await fetch('https://api.github.com/user',{headers:{Authorization:'token '+token,Accept:'application/vnd.github+json'}});
       if(!res.ok)throw new Error('Not reachable ('+res.status+')');
       setRes(true,'✓ Connected as '+esc(username));
      }
     } else if(provider==='gitlab'){
      const base=(prof&&prof.host||'https://gitlab.com').replace(/\/+$/,'');
      /* Test repo existence via GitLab API */
      const urlMatch=r.url.match(/gitlab[^/]*[/:]([^/]+\/[^/.]+)/);
      if(urlMatch){
       const encoded=encodeURIComponent(urlMatch[1]);
       const res=await fetch(base+'/api/v4/projects/'+encoded,{headers:{'PRIVATE-TOKEN':token}});
       if(!res.ok)throw new Error('Not reachable ('+res.status+')');
       const data=await res.json();
       setRes(true,'✓ Reachable · '+esc(data.path_with_namespace));
      } else {
       const res=await fetch(base+'/api/v4/user',{headers:{'PRIVATE-TOKEN':token}});
       if(!res.ok)throw new Error('Not reachable ('+res.status+')');
       setRes(true,'✓ Connected as '+esc(username));
      }
     }
    }catch(err){setRes(false,'✕ '+(err.message||'Connection failed'))}
    finally{b.disabled=false;b.innerHTML=orig}
   })();
   return}
  if(b.dataset.cr==='del-repo'){
   const ri=Number(b.dataset.ri);const r=crRepos();if(!r[ri])return;
   openConfirmModal({title:'Remove repository',message:'Remove "'+r[ri].url+'"? Terraplan will stop tracking this repository.',confirmLabel:'Remove',confirmClass:'btn-danger',onConfirm:()=>{
    r.splice(ri,1);saveCrRepos(r);toast('Repository removed');if(window.__refreshBb)window.__refreshBb()}});
   return}
  return}
 if(b.dataset.planPr){const envName=prompt('Environment for this plan','dev');if(!envName)return;b.disabled=true;
  try{const r=await api('/runs',{method:'POST',body:JSON.stringify({repository:b.dataset.planPr,branch:b.dataset.branch,environment:envName,action:'plan',pullRequestId:Number(b.dataset.pr),pullRequestUrl:b.dataset.prUrl||undefined})});
   toast(r.status==='queued'?'Plan queued — result will comment on the PR':'Run created ('+r.status+')');location.hash='dashboard';if(window.__go)window.__go('Plans')}catch(err){toast(err.message);b.disabled=false}return}
 if(b.dataset.t==='Run terraform'){const nr=$('nr');if(nr){nr.click();return}}
 toast('Mock action: '+b.dataset.t)});
$('rpi').innerHTML=I('list',24);window.__go=go;
 if(window.__bootView){const v=window.__bootView;delete window.__bootView;go(v)}
 else if(!$('dash').classList.contains('hide'))go((()=>{try{return sessionStorage.getItem('tp-view')}catch(e){return null}})()||'Terraform Plan');
})();


const {kp,counts,cd,rw,hb,donut,C}=window.__ch;
const _d=draw;draw=function(){_d();rk()};
function rk(){const el=$('rk');if(!el)return;
 /* Counts strip removed — overview metrics live in heroCards on every page */
 if($('v-runs')&&$('v-runs').classList.contains('hide')){el.innerHTML='';return}
 el.innerHTML='';}
