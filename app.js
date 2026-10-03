
import { loadConfig, saveConfig, clearConfig, parseConfig, connect, authMessage, dataMessage } from './backend.js';
import { isNative, notifPermission, askNotifPermission, replaceReminders, testNotification, onNotificationTap, shareFile } from './native.js';

/* ---------- constants ---------- */
const PTYPES=['Shop','Office','Room','Flat','Chapra','1 BHK','2 BHK','3 BHK','4 BHK'];
const KINDS={monthly:{label:'Monthly rent',short:'Monthly'},yearly:{label:'Yearly rent',short:'Yearly'},installment:{label:'Installment contract',short:'Installments'},temp_sale:{label:'Temporary sale',short:'Temp sale'},year_sale:{label:'Year sale',short:'Year sale'}};
const METHODS={cash:'Cash',bank:'Bank / account',cheque:'Cheque'};
const PSTAT={paid:'Paid',pending:'Pending',partial:'Partly paid',overdue:'Overdue'};
const CSTAT={active:'Active',expiring:'Expiring soon',expired:'Expired',upcoming:'Starts later',terminated:'Ended early'};
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const ICONS={
 home:'<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
 props:'<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1"/><path d="M10 21v-3h4v3"/>',
 contracts:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
 payments:'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M7 15h3"/>',
 reports:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 close:'<path d="M6 6l12 12M18 6L6 18"/>'
};
const ic=(n,cls='i')=>`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;
const TABS=[['home','Dashboard'],['props','Properties'],['contracts','Contracts'],['payments','Payments'],['reports','Reports']];

/* ---------- utils ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const todayStr=()=>{const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
const parseD=s=>{const [y,m,d]=String(s).split('-').map(Number);return {y,m,d};};
const toUTC=s=>{const p=parseD(s);return Date.UTC(p.y,p.m-1,p.d);};
const isD=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'');
const diffDays=(a,b)=>Math.round((toUTC(b)-toUTC(a))/864e5);
const addDays=(s,n)=>{const t=new Date(toUTC(s)+n*864e5);return t.getUTCFullYear()+'-'+pad(t.getUTCMonth()+1)+'-'+pad(t.getUTCDate());};
const addMonths=(s,n)=>{const p=parseD(s);let m=p.m-1+n;const y=p.y+Math.floor(m/12);m=((m%12)+12)%12;const last=new Date(Date.UTC(y,m+1,0)).getUTCDate();return y+'-'+pad(m+1)+'-'+pad(Math.min(p.d,last));};
const monthsSpan=(a,b)=>{if(!isD(a)||!isD(b))return 12;const e=addDays(b,1);const pa=parseD(a),pe=parseD(e);const n=(pe.y-pa.y)*12+(pe.m-pa.m)+(pe.d-pa.d)/30;return Math.max(1,Math.round(n));};
const fmtD=s=>{if(!isD(s))return '—';const p=parseD(s);return p.d+' '+MON[p.m-1]+' '+p.y;};
const fmtS=s=>{if(!isD(s))return '—';const p=parseD(s);return p.d+' '+MON[p.m-1];};
const fmtMY=s=>{if(!isD(s))return '—';const p=parseD(s);return MON[p.m-1]+' '+p.y;};
const num=v=>{const n=parseFloat(v);return isFinite(n)?n:0;};
const round2=n=>Math.round(n*100)/100;
const money=n=>(S.settings.currency||'AED')+' '+round2(n).toLocaleString('en-US',{maximumFractionDigits:2});
const compact=n=>n>=1e6?(round2(n/1e6))+'M':n>=1e3?(Math.round(n/100)/10)+'k':String(Math.round(n));
const natCmp=(a,b)=>String(a||'').localeCompare(String(b||''),undefined,{numeric:true,sensitivity:'base'});
const rid=()=>Math.random().toString(36).slice(2,10);
const sumR=it=>(it.receipts||[]).reduce((a,r)=>a+num(r.a),0);
const plural=(n,w)=>n+' '+w+(n===1?'':'s');
function daysText(d){if(d===0)return 'Today';if(d===1)return 'Tomorrow';if(d===-1)return 'Yesterday';return d>0?'In '+d+' days':Math.abs(d)+' days ago';}

/* ---------- state ---------- */
let T=todayStr();
const S={props:[],contracts:[],settings:{currency:'AED',remindDays:14},tab:'home',dbState:'boot',canWrite:true,user:null,cloudErr:'',offline:false,
 f:{pq:'',ptype:'all',pocc:'all',cq:'',ckind:'all',cstat:'all',yq:'',ystat:'overdue',ymeth:'all',yfrom:'',yto:'',rep:'monthly',ryear:Number(T.slice(0,4))},
 sheet:null,draft:null};
let api=null,gotP=false,gotC=false,D=null,unsubs=[];
try{const t=localStorage.getItem('pd_tab');if(t&&TABS.some(x=>x[0]===t))S.tab=t;}catch(e){}
try{const h=location.hash.slice(1);if(TABS.some(x=>x[0]===h))S.tab=h;}catch(e){}

/* ---------- derived data ---------- */
function cStatus(c){if(c.terminated)return 'terminated';if(!isD(c.start)||!isD(c.end))return 'active';if(T<c.start)return 'upcoming';if(T>c.end)return 'expired';return diffDays(T,c.end)<=30?'expiring':'active';}
function itemStatus(c,it,paid){const amt=num(it.amount);if(amt>0&&paid>=amt-0.005)return 'paid';if(c.terminated&&isD(c.terminatedOn)&&it.due>c.terminatedOn)return 'void';if(isD(it.due)&&it.due<T)return 'overdue';if(paid>0)return 'partial';return 'pending';}
function derive(){
  T=todayStr();
  const pmap=new Map(S.props.map(p=>[p.id,p]));
  const cs=S.contracts.map(c=>{const st=cStatus(c);const items=(c.schedule||[]).map((it,i)=>{const paid=sumR(it);return {...it,i,paid,bal:Math.max(0,round2(num(it.amount)-paid)),st:itemStatus(c,it,paid)};});
    return {...c,st,items,prop:pmap.get(c.propertyId),n:items.length,collected:items.reduce((a,x)=>a+x.paid,0),balance:items.filter(x=>x.st!=='void').reduce((a,x)=>a+x.bal,0)};});
  const byProp=new Map();cs.forEach(c=>{if(!byProp.has(c.propertyId))byProp.set(c.propertyId,[]);byProp.get(c.propertyId).push(c);});
  byProp.forEach(a=>a.sort((x,y)=>String(y.start).localeCompare(String(x.start))));
  const props=S.props.map(p=>{const list=byProp.get(p.id)||[];const cur=list.find(c=>c.st==='active'||c.st==='expiring');return {...p,contracts:list,cur,occ:!!cur};}).sort((a,b)=>natCmp(a.name,b.name));
  const pays=[];cs.forEach(c=>c.items.forEach(it=>{if(it.st!=='void')pays.push({c,it});}));
  pays.sort((a,b)=>String(a.it.due).localeCompare(String(b.it.due)));
  const R=num(S.settings.remindDays)||14;
  const overdue=pays.filter(x=>x.it.st==='overdue');
  const dueSoon=pays.filter(x=>(x.it.st==='pending'||x.it.st==='partial')&&diffDays(T,x.it.due)>=0&&diffDays(T,x.it.due)<=R);
  const expiring=cs.filter(c=>c.st==='expiring').sort((a,b)=>a.end.localeCompare(b.end));
  return {cs,props,pays,pmap,overdue,dueSoon,expiring,R};
}
function itemLabel(c,it){const n=c.items?c.items.length:(c.schedule||[]).length;
  if(c.kind==='monthly')return 'Rent '+fmtMY(it.due);if(c.kind==='yearly')return n>1?'Yearly rent '+(it.i+1)+'/'+n:'Yearly rent';
  if(c.kind==='installment')return 'Installment '+(it.i+1)+'/'+n;return (KINDS[c.kind]?.short||'Payment')+(n>1?' '+(it.i+1)+'/'+n:'');}
const pname=c=>c.prop?c.prop.name:'(deleted property)';
const methodOf=(c,it)=>it.method||c.method||'cash';
function milestone(d){return d<=0?'On expiry date':d<=1?'1-day notice':d<=7?'7-day notice':d<=15?'15-day notice':'30-day notice';}
function gcal(title,date,details){if(!isD(date))return '#';return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text='+encodeURIComponent(title)+'&dates='+date.replace(/-/g,'')+'/'+addDays(date,1).replace(/-/g,'')+'&details='+encodeURIComponent(details||'');}

/* ---------- render shell ---------- */
function render(){
  D=derive();
  const tb=TABS.map(([k,l])=>`<button data-act="tab" data-v="${k}" ${S.tab===k?'aria-current="page"':''}>${ic(k)}<span>${l}</span></button>`).join('');
  $('#tabbar').innerHTML=tb;
  const subs={home:'Owner dashboard',props:'All units',contracts:'Rent & sale contracts',payments:'Rent, installments & cheques',reports:'Income & status reports'};
  $('#subtitle').textContent=subs[S.tab];$('#titletext').textContent=TABS.find(t=>t[0]===S.tab)[1];
  const n=D.overdue.length+D.dueSoon.length+D.expiring.length;const b=$('#alertbadge');b.hidden=!n;b.textContent=n>99?'99+':n;
  const v=$('#view');
  if(S.dbState!=='ok'&&S.dbState!=='loading'){$('#shell').hidden=true;$('#gate').hidden=false;renderGate();return;}
  $('#gate').hidden=true;$('#shell').hidden=false;
  if(S.dbState==='loading'){v.innerHTML=`<div class="card empty"><h3>Loading your properties…</h3><p>Getting your records from the cloud.</p></div>`;$('#fabslot').innerHTML='';return;}
  const fn={home:vHome,props:vProps,contracts:vContracts,payments:vPayments,reports:vReports}[S.tab];
  v.innerHTML=cloudBanner()+fn();
  const fab={props:['newProp','Add property'],contracts:['newContract','New contract']}[S.tab];
  $('#fabslot').innerHTML=fab&&S.canWrite?`<button class="fab" data-act="${fab[0]}">${ic('plus')}${fab[1]}</button>`:'';
}
function sampleBanner(){const n=S.props.filter(p=>p.sample).length+S.contracts.filter(c=>c.sample).length;if(!n)return '';
  if(S.confirm==='clearSample')return `<div class="banner"><span>Remove all example properties and contracts? Your own records stay.</span><span class="btns"><button class="btn sm danger solid" data-act="clearSample">Remove examples</button><button class="btn sm" data-act="cancelConfirm">Keep</button></span></div>`;
  return `<div class="banner"><span>You're looking at <b>example data</b> so you can see how the app works.</span>${S.canWrite?'<button class="btn sm" data-act="askClearSample">Remove examples</button>':''}</div>`;}
function cloudBanner(){if(S.cloudErr)return `<div class="banner" style="border-color:var(--bad)"><span>${esc(S.cloudErr)}</span></div>`;if(S.offline)return `<div class="banner"><span>Offline. You can keep working; changes sync when you're back online.</span></div>`;return '';}
function roBanner(){return S.canWrite?'':`<div class="banner"><span>You have view-only access. Ask the owner to make you a Contributor to add or edit records.</span></div>`;}

/* ---------- dashboard ---------- */
function vHome(){
  if(!D.props.length)return `<div class="card empty"><h3>Add your first property</h3><p>Start with a shop, office, room, flat or chapra. Then add its contract and payment schedule, and this dashboard fills in.</p>${S.canWrite?`<button class="btn primary" data-act="newProp">${ic('plus')}Add property</button>`:''}</div>`;
  const ym=T.slice(0,7);
  const monthDue=D.pays.filter(x=>String(x.it.due).slice(0,7)===ym);
  const expected=monthDue.reduce((a,x)=>a+num(x.it.amount),0);
  let collected=0;D.cs.forEach(c=>c.items.forEach(it=>(it.receipts||[]).forEach(r=>{if(String(r.d).slice(0,7)===ym)collected+=num(r.a);})));
  const pct=expected?Math.min(100,collected/expected*100):0;
  const occ=D.props.filter(p=>p.occ).length,tot=D.props.length;
  const cur=D.cs.filter(c=>c.st==='active'||c.st==='expiring');
  const kc=k=>cur.filter(c=>c.kind===k).length;
  const pend=D.pays.filter(x=>x.it.st==='pending'||x.it.st==='partial');
  const pendAmt=pend.reduce((a,x)=>a+x.it.bal,0);
  const ovAmt=D.overdue.reduce((a,x)=>a+x.it.bal,0);
  const in30=D.pays.filter(x=>(x.it.st==='pending'||x.it.st==='partial')&&diffDays(T,x.it.due)>=0&&diffDays(T,x.it.due)<=30);
  const inst30=in30.filter(x=>x.c.kind!=='monthly').length;
  const chq30=in30.filter(x=>methodOf(x.c,x.it)==='cheque').length;
  const att=[...D.overdue.map(x=>({t:'pay',x,d:x.it.due})),...D.expiring.map(c=>({t:'exp',c,d:c.end})),...D.dueSoon.map(x=>({t:'pay',x,d:x.it.due}))].slice(0,6);
  return `
  <section class="hero" aria-label="This month">
    <div class="lbl">${MON[Number(T.slice(5,7))-1]} ${T.slice(0,4)} · collected</div>
    <div class="big num">${money(collected)}</div>
    <div class="bar" role="img" aria-label="${Math.round(pct)}% of expected collected"><i style="width:${pct}%"></i></div>
    <div class="hrow"><span>Due this month: <b class="num">${money(expected)}</b></span><span>${Math.round(pct)}% collected</span></div>
  </section>
  <div class="card">
    <div class="label">Properties</div>
    <div class="occ" style="margin-top:8px">
      <div><div class="v num">${tot}</div><div class="small muted">Total</div></div>
      <div><div class="v num" style="color:var(--ok)">${occ}</div><div class="small muted">Occupied</div></div>
      <div><div class="v num">${tot-occ}</div><div class="small muted">Available</div></div>
    </div>
    <div class="occbar"><i style="width:${tot?occ/tot*100:0}%"></i></div>
  </div>
  <div class="card">
    <div class="label">Running contracts by type</div>
    <div class="kinds">${Object.keys(KINDS).map(k=>`<div><b class="num">${kc(k)}</b><span>${KINDS[k].short}</span></div>`).join('')}</div>
  </div>
  <h2 class="sec">Payments</h2>
  <div class="grid3">
    <button class="tile ok" data-act="goPay" data-v="paid"><span class="k">Received this month</span><span class="v sm num">${money(collected)}</span></button>
    <button class="tile warn" data-act="goPay" data-v="upcoming"><span class="k">Pending · ${pend.length}</span><span class="v sm num">${money(pendAmt)}</span></button>
    <button class="tile bad" data-act="goPay" data-v="overdue"><span class="k">Overdue · ${D.overdue.length}</span><span class="v sm num">${money(ovAmt)}</span></button>
  </div>
  <h2 class="sec">Next 30 days</h2>
  <div class="grid3">
    <button class="tile" data-act="goPay" data-v="upcoming"><span class="v num">${inst30}</span><span class="k">Installments due</span></button>
    <button class="tile" data-act="goPayCheque"><span class="v num">${chq30}</span><span class="k">Cheque dates</span></button>
    <button class="tile ${D.expiring.length?'warn':''}" data-act="goExpiring"><span class="v num">${D.expiring.length}</span><span class="k">Contracts expiring</span></button>
  </div>
  <h2 class="sec">Needs attention ${att.length?'<button class="link" data-act="alerts">See all</button>':''}</h2>
  ${att.length?`<div class="list">${att.map(a=>a.t==='pay'?payRow(a.x):expRow(a.c)).join('')}</div>`:`<div class="card small muted">Nothing overdue, due soon, or expiring. You're up to date.</div>`}`;
}
function payRow(x){const {c,it}=x;const m=methodOf(c,it);const d=diffDays(T,it.due);
  const sub=`${esc(c.tenant)} · ${itemLabel(c,it)} · ${m==='cheque'?'Cheque'+(it.chequeNo?' #'+esc(it.chequeNo):''):METHODS[m]}`;
  return `<button class="row" data-act="openPay" data-c="${c.id}" data-i="${it.i}"><span class="stripe ${it.st}"></span><span class="main"><span class="t">${esc(pname(c))}${c.sample?'<span class="pill ex">Example</span>':''}</span><span class="s">${sub}</span><span class="s">Due ${fmtD(it.due)} · ${it.st==='paid'?'paid':daysText(d)}</span></span><span class="end"><span class="amt">${money(it.st==='paid'?num(it.amount):it.bal)}</span><span class="pill ${it.st}">${it.st==='overdue'&&it.paid>0?'Overdue · part paid':PSTAT[it.st]}</span></span></button>`;}
function expRow(c){const d=diffDays(T,c.end);return `<button class="row" data-act="openContract" data-id="${c.id}"><span class="stripe pending"></span><span class="main"><span class="t">${esc(pname(c))}${c.sample?'<span class="pill ex">Example</span>':''}</span><span class="s">${esc(c.tenant)} · ${KINDS[c.kind]?.short||''} contract</span><span class="s">Expires ${fmtD(c.end)} · ${milestone(d)}</span></span><span class="end"><span class="amt">${d<=0?'Today':d+' days'}</span><span class="pill expiring">Expiring</span></span></button>`;}

/* ---------- properties ---------- */
function vProps(){
  if(!D.props.length)return vHome();
  const types=PTYPES.concat([...new Set(D.props.map(p=>p.type).filter(t=>t&&!PTYPES.includes(t)))]);
  return `<div class="toolbar">
    <label class="search">${ic('search')}<input id="pq" type="search" placeholder="Search property, tenant or mobile" value="${esc(S.f.pq)}" data-filter="pq" aria-label="Search properties"></label>
    <div class="chips" role="group" aria-label="Property type">${['all',...types].map(t=>`<button class="chip" data-act="f" data-k="ptype" data-v="${esc(t)}" aria-pressed="${S.f.ptype===t}">${t==='all'?'All types':esc(t)}</button>`).join('')}</div>
    <div class="seg" role="group" aria-label="Occupancy">${[['all','All'],['occ','Occupied'],['free','Available']].map(([k,l])=>`<button data-act="f" data-k="pocc" data-v="${k}" aria-pressed="${S.f.pocc===k}">${l}</button>`).join('')}</div>
  </div><div id="list">${propList()}</div>`;
}
function propList(){
  const q=S.f.pq.trim().toLowerCase();
  const L=D.props.filter(p=>(S.f.ptype==='all'||p.type===S.f.ptype)&&(S.f.pocc==='all'||(S.f.pocc==='occ')===p.occ)&&(!q||[p.name,p.type,p.location,...p.contracts.map(c=>c.tenant+' '+(c.mobile||''))].join(' ').toLowerCase().includes(q)));
  if(!L.length)return `<div class="card small muted">No properties match. Clear the search or pick another filter.</div>`;
  return `<div class="small muted" style="margin-bottom:6px">${plural(L.length,'property').replace('propertys','properties')}</div><div class="list">${L.map(p=>{const c=p.cur;const due=c?c.items.filter(x=>x.st==='overdue').length:0;
    const st=c?(due?'overdue':c.items.some(x=>x.st==='pending'||x.st==='partial')?'pending':'paid'):'';
    return `<button class="row" data-act="openProp" data-id="${p.id}"><span class="stripe ${c?st:''}"></span><span class="main"><span class="t">${esc(p.name)} <span class="pill">${esc(p.type)}</span>${p.sample?'<span class="pill ex">Example</span>':''}</span>
    <span class="s">${c?`${esc(c.tenant)} · ${KINDS[c.kind]?.short} · until ${fmtD(c.end)}`:'No running contract'}</span></span>
    <span class="end">${c?`<span class="pill ${c.st==='expiring'?'expiring':'occupied'}">${c.st==='expiring'?diffDays(T,c.end)+' days left':'Occupied'}</span>${due?`<span class="pill overdue">${due} overdue</span>`:''}`:'<span class="pill">Available</span>'}</span></button>`;}).join('')}</div>`;
}

/* ---------- contracts ---------- */
function vContracts(){
  if(!D.props.length)return vHome();
  return `<div class="toolbar">
    <label class="search">${ic('search')}<input id="cq" type="search" placeholder="Search contract no., property or tenant" value="${esc(S.f.cq)}" data-filter="cq" aria-label="Search contracts"></label>
    <div class="chips" role="group" aria-label="Contract type">${[['all','All types'],...Object.entries(KINDS).map(([k,v])=>[k,v.short])].map(([k,l])=>`<button class="chip" data-act="f" data-k="ckind" data-v="${k}" aria-pressed="${S.f.ckind===k}">${l}</button>`).join('')}</div>
    <div class="chips" role="group" aria-label="Contract status">${[['all','Any status'],['running','Running'],['expiring','Expiring ≤ 30 days'],['expired','Expired'],['upcoming','Starts later'],['terminated','Ended early']].map(([k,l])=>`<button class="chip" data-act="f" data-k="cstat" data-v="${k}" aria-pressed="${S.f.cstat===k}">${l}</button>`).join('')}</div>
  </div><div id="list">${contractList()}</div>`;
}
function contractList(){
  const q=S.f.cq.trim().toLowerCase();
  const L=D.cs.filter(c=>(S.f.ckind==='all'||c.kind===S.f.ckind)&&(S.f.cstat==='all'||(S.f.cstat==='running'?(c.st==='active'||c.st==='expiring'):c.st===S.f.cstat))&&(!q||[c.number,pname(c),c.tenant,c.mobile].join(' ').toLowerCase().includes(q)))
    .sort((a,b)=>{const r=s=>({expiring:0,active:1,upcoming:2,expired:3,terminated:4}[s]);return r(a.st)-r(b.st)||String(a.end).localeCompare(String(b.end));});
  if(!L.length)return `<div class="card small muted">${D.cs.length?'No contracts match these filters.':'No contracts yet. Tap New contract to add the first one.'}</div>`;
  return `<div class="list">${L.map(c=>contractRow(c)).join('')}</div>`;
}
function contractRow(c){const d=isD(c.end)?diffDays(T,c.end):0;const ov=c.items.filter(x=>x.st==='overdue').length;
  return `<button class="row" data-act="openContract" data-id="${c.id}"><span class="main"><span class="t">${esc(pname(c))} <span class="pill kind">${KINDS[c.kind]?.short||c.kind}</span>${c.sample?'<span class="pill ex">Example</span>':''}</span>
  <span class="s">${esc(c.number||'')} · ${esc(c.tenant)}</span><span class="s">${fmtD(c.start)} → ${fmtD(c.end)}</span></span>
  <span class="end"><span class="amt">${money(num(c.amount))}</span><span class="pill ${c.st}">${c.st==='expiring'?(d<=0?'Expires today':d+' days left'):CSTAT[c.st]}</span>${ov?`<span class="pill overdue">${ov} overdue</span>`:''}</span></button>`;}

/* ---------- payments ---------- */
function vPayments(){
  if(!D.props.length)return vHome();
  return `<div class="toolbar">
    <div class="seg" role="group" aria-label="Payment status">${[['overdue','Overdue'],['upcoming','Upcoming'],['paid','Paid'],['all','All']].map(([k,l])=>`<button data-act="f" data-k="ystat" data-v="${k}" aria-pressed="${S.f.ystat===k}">${l}</button>`).join('')}</div>
    <label class="search">${ic('search')}<input id="yq" type="search" placeholder="Search property, tenant or cheque no." value="${esc(S.f.yq)}" data-filter="yq" aria-label="Search payments"></label>
    <div class="chips" role="group" aria-label="Payment method">${[['all','All methods'],...Object.entries(METHODS)].map(([k,l])=>`<button class="chip" data-act="f" data-k="ymeth" data-v="${k}" aria-pressed="${S.f.ymeth===k}">${l}</button>`).join('')}</div>
    <div class="daterange"><label class="fld"><span>Due from</span><input type="date" id="yfrom" value="${esc(S.f.yfrom)}" data-filter="yfrom"></label><label class="fld"><span>Due to</span><input type="date" id="yto" value="${esc(S.f.yto)}" data-filter="yto"></label></div>
  </div><div id="list">${payList()}</div>`;
}
function payList(){
  const q=S.f.yq.trim().toLowerCase(),f=S.f;
  let L=D.pays.filter(x=>{const it=x.it;
    if(f.ystat==='overdue'&&it.st!=='overdue')return false;
    if(f.ystat==='upcoming'&&!(it.st==='pending'||it.st==='partial'))return false;
    if(f.ystat==='paid'&&it.st!=='paid')return false;
    if(f.ymeth!=='all'&&methodOf(x.c,it)!==f.ymeth)return false;
    if(f.yfrom&&it.due<f.yfrom)return false;if(f.yto&&it.due>f.yto)return false;
    if(q&&![pname(x.c),x.c.tenant,it.chequeNo,x.c.number].join(' ').toLowerCase().includes(q))return false;return true;});
  if(f.ystat==='paid')L=L.slice().reverse();
  if(!L.length)return `<div class="card small muted">${f.ystat==='overdue'?'No overdue payments. Everything due so far has been paid.':'No payments match these filters.'}</div>`;
  const tot=L.reduce((a,x)=>a+(x.it.st==='paid'?num(x.it.amount):x.it.bal),0);
  return `<div class="small muted" style="margin-bottom:6px">${plural(L.length,'payment')} · <b class="num">${money(tot)}</b> ${f.ystat==='paid'?'received':f.ystat==='all'?'':'outstanding'}</div><div class="list">${L.slice(0,300).map(payRow).join('')}</div>`;
}

/* ---------- reports ---------- */
const REPORTS=[['monthly','Monthly income'],['yearly','Yearly income'],['property','Property-wise income'],['pending','Pending payments'],['overdue','Overdue payments'],['cheques','Cheques'],['installments','Installments'],['expiring','Expiring contracts'],['temp_sale','Temporary sales'],['year_sale','Year sales']];
function receiptsIn(pred){const out=[];D.cs.forEach(c=>c.items.forEach(it=>(it.receipts||[]).forEach(r=>{if(pred(r))out.push({c,it,r});})));return out;}
function buildReport(){
  const y=String(S.f.ryear),k=S.f.rep;let cols=[],rows=[],foot=null,chart='',note='';
  const inYear=s=>String(s).slice(0,4)===y;
  if(k==='monthly'){
    const col=Array(12).fill(0),exp=Array(12).fill(0);
    receiptsIn(r=>inYear(r.d)).forEach(({r})=>col[Number(r.d.slice(5,7))-1]+=num(r.a));
    D.pays.forEach(({it})=>{if(inYear(it.due))exp[Number(it.due.slice(5,7))-1]+=num(it.amount);});
    cols=['Month','Due','Collected','Gap'];rows=MON.map((m,i)=>[m+' '+y,exp[i],col[i],Math.max(0,exp[i]-col[i])]);
    foot=['Total',sum(exp),sum(col),sum(rows.map(r=>r[3]))];chart=barChart(col,exp,y);
  }else if(k==='yearly'){
    const ys=[...new Set([...D.pays.map(x=>String(x.it.due).slice(0,4)),...receiptsIn(()=>true).map(x=>String(x.r.d).slice(0,4))])].filter(v=>/^\d{4}$/.test(v)).sort();
    cols=['Year','Due','Collected','Gap'];rows=ys.map(yy=>{const e=D.pays.filter(x=>String(x.it.due).startsWith(yy)).reduce((a,x)=>a+num(x.it.amount),0);const c=receiptsIn(r=>String(r.d).startsWith(yy)).reduce((a,x)=>a+num(x.r.a),0);return [yy,e,c,Math.max(0,e-c)];});
    foot=['Total',sum(rows.map(r=>r[1])),sum(rows.map(r=>r[2])),sum(rows.map(r=>r[3]))];
  }else if(k==='property'){
    cols=['Property','Type','Due '+y,'Collected '+y,'Outstanding'];
    rows=D.props.map(p=>{const pc=D.cs.filter(c=>c.propertyId===p.id);let e=0,col=0,o=0;pc.forEach(c=>c.items.forEach(it=>{if(it.st!=='void'&&inYear(it.due)){e+=num(it.amount);}(it.receipts||[]).forEach(r=>{if(inYear(r.d))col+=num(r.a);});if(it.st==='overdue'||it.st==='partial'||it.st==='pending')o+=(inYear(it.due)?it.bal:0);}));return [p.name,p.type,e,col,o];}).sort((a,b)=>b[3]-a[3]);
    foot=['Total','',sum(rows.map(r=>r[2])),sum(rows.map(r=>r[3])),sum(rows.map(r=>r[4]))];
  }else if(k==='pending'||k==='overdue'){
    const L=D.pays.filter(x=>k==='overdue'?x.it.st==='overdue':(x.it.st==='pending'||x.it.st==='partial'));
    cols=k==='overdue'?['Property','Tenant','Payment','Due date','Days late','Balance']:['Property','Tenant','Payment','Due date','Method','Balance'];
    rows=L.map(({c,it})=>[pname(c),c.tenant,itemLabel(c,it),fmtD(it.due),k==='overdue'?diffDays(it.due,T):METHODS[methodOf(c,it)],it.bal]);
    foot=['Total','','','','',sum(rows.map(r=>r[5]))];note=k==='pending'?'All unpaid payments not yet past their due date.':'Every payment past its due date with money still owed.';
  }else if(k==='cheques'){
    const L=D.pays.filter(x=>methodOf(x.c,x.it)==='cheque'&&inYear(x.it.chequeDate||x.it.due)).sort((a,b)=>String(a.it.chequeDate||a.it.due).localeCompare(String(b.it.chequeDate||b.it.due)));
    cols=['Cheque date','Cheque no.','Property','Tenant','Amount','Status'];
    rows=L.map(({c,it})=>[fmtD(it.chequeDate||it.due),it.chequeNo||'—',pname(c),c.tenant,num(it.amount),PSTAT[it.st]]);
    foot=['Total','','','',sum(rows.map(r=>r[4])),''];
  }else if(k==='installments'){
    const L=D.pays.filter(x=>x.c.kind!=='monthly'&&x.c.items.length>1&&inYear(x.it.due));
    cols=['Due date','Property','Tenant','Installment','Amount','Paid','Status'];
    rows=L.map(({c,it})=>[fmtD(it.due),pname(c),c.tenant,itemLabel(c,it),num(it.amount),it.paid,PSTAT[it.st]]);
    foot=['Total','','','',sum(rows.map(r=>r[4])),sum(rows.map(r=>r[5])),''];
  }else if(k==='expiring'){
    const L=D.cs.filter(c=>!c.terminated&&isD(c.end)&&diffDays(T,c.end)>=-30&&diffDays(T,c.end)<=90).sort((a,b)=>a.end.localeCompare(b.end));
    cols=['Property','Tenant','Type','Expiry date','Days remaining','Notice'];
    rows=L.map(c=>{const d=diffDays(T,c.end);return [pname(c),c.tenant,KINDS[c.kind]?.short,fmtD(c.end),d,d<0?'Expired':d<=30?milestone(d):'Over 30 days'];});
    note='Contracts ending in the next 90 days, plus those that ended in the last 30.';
  }else{
    const L=D.cs.filter(c=>c.kind===k&&(inYear(c.start)||inYear(c.end))).sort((a,b)=>String(a.start).localeCompare(String(b.start)));
    cols=['Property','Contract','Tenant','Start','Expiry','Amount','Collected','Status'];
    rows=L.map(c=>[pname(c),c.number||'',c.tenant,fmtD(c.start),fmtD(c.end),num(c.amount),c.collected,c.balance>0?(c.items.some(x=>x.st==='overdue')?'Overdue':'Pending'):'Paid']);
    foot=['Total','','','','',sum(rows.map(r=>r[5])),sum(rows.map(r=>r[6])),''];note='Contracts that start or end in '+y+'.';
  }
  return {cols,rows,foot,chart,note};
}
const sum=a=>a.reduce((x,y)=>x+num(y),0);
const moneyCol=(k,i,cols)=>/Due|Collected|Gap|Balance|Amount|Paid|Outstanding/.test(cols[i])&&!/date/i.test(cols[i]);
function vReports(){
  if(!D.props.length)return vHome();
  const years=[...new Set([Number(T.slice(0,4)),...D.pays.map(x=>Number(String(x.it.due).slice(0,4)))].filter(n=>n>1990))].sort((a,b)=>b-a);
  const r=buildReport();const cur=REPORTS.find(x=>x[0]===S.f.rep);
  const yearless=['yearly','pending','overdue','expiring'].includes(S.f.rep);
  const cell=(v,i)=>moneyCol(S.f.rep,i,r.cols)&&typeof v==='number'?`<td class="r">${money(v)}</td>`:typeof v==='number'?`<td class="r">${v}</td>`:`<td>${esc(v)}</td>`;
  return `<div class="toolbar">
    <div class="chips" role="group" aria-label="Report">${REPORTS.map(([k,l])=>`<button class="chip" data-act="f" data-k="rep" data-v="${k}" aria-pressed="${S.f.rep===k}">${l}</button>`).join('')}</div>
    ${yearless?'':`<div class="chips" role="group" aria-label="Year">${years.map(y=>`<button class="chip" data-act="f" data-k="ryear" data-v="${y}" aria-pressed="${S.f.ryear==y}">${y}</button>`).join('')}</div>`}
  </div>
  <h2 class="sec">${cur[1]}${yearless?'':' · '+S.f.ryear}<button class="link" data-act="csv">Export CSV</button></h2>
  ${r.note?`<div class="small muted">${r.note}</div>`:''}
  ${r.chart}
  ${r.rows.length?`<div class="tablewrap"><table class="rep"><thead><tr>${r.cols.map((c,i)=>`<th class="${moneyCol(0,i,r.cols)||/Days/.test(c)?'r':''}">${esc(c)}</th>`).join('')}</tr></thead><tbody>${r.rows.map(row=>`<tr>${row.map(cell).join('')}</tr>`).join('')}</tbody>${r.foot?`<tfoot><tr>${r.foot.map((v,i)=>v===''?'<td></td>':cell(v,i)).join('')}</tr></tfoot>`:''}</table></div>`:`<div class="card small muted">Nothing to report here yet.</div>`}`;
}
function barChart(col,exp,y){
  const W=340,H=170,L=34,B=20,Tp=10,max=niceMax(Math.max(...col,...exp));const cw=(W-L-4)/12,bw=cw*0.62;const sy=v=>Tp+(H-Tp-B)*(1-v/max);
  const curM=String(T.slice(0,4))===y?Number(T.slice(5,7))-1:-1;
  let g='';[0,.5,1].forEach(f=>{const yy=sy(max*f);g+=`<line class="grid" x1="${L}" x2="${W-2}" y1="${yy}" y2="${yy}"/><text x="${L-5}" y="${yy+3}" text-anchor="end">${compact(max*f)}</text>`;});
  MON.forEach((m,i)=>{const x=L+i*cw+(cw-bw)/2;g+=`<rect class="exp" x="${x}" y="${sy(exp[i])}" width="${bw}" height="${H-B-sy(exp[i])}" rx="2"/><rect class="col" x="${x+bw*0.2}" y="${sy(col[i])}" width="${bw*0.6}" height="${H-B-sy(col[i])}" rx="2"><title>${m}: collected ${money(col[i])} of ${money(exp[i])} due</title></rect><text x="${x+bw/2}" y="${H-6}" text-anchor="middle" class="${i===curM?'cur':''}">${m[0]}</text>`;});
  return `<div class="card"><svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Collected versus due by month in ${y}">${g}</svg><div class="legend"><span><i style="background:var(--accent)"></i>Collected</span><span><i style="background:var(--surface-2);border:1px solid var(--line)"></i>Due</span></div></div>`;
}
function niceMax(v){if(v<=0)return 1000;const p=Math.pow(10,Math.floor(Math.log10(v)));const n=v/p;return (n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10)*p;}

/* ---------- sheets ---------- */
function openSheet(s){S.sheet=s;S.confirm=null;drawSheet(true);}
function closeSheet(){S.sheet=null;S.draft=null;S.confirm=null;$('#sheetroot').innerHTML='';}
let drawing=false;
function drawSheet(fresh){
  if(drawing){setTimeout(()=>drawSheet(),0);return;}
  drawing=true;try{drawSheetInner(fresh);}finally{drawing=false;}
}
function drawSheetInner(fresh){
  const s=S.sheet;if(!s){$('#sheetroot').innerHTML='';return;}
  const old=$('#sheetroot .sheet');const top=old&&!fresh?old.scrollTop:0;
  const fn={prop:shProp,contract:shContract,pay:shPay,alerts:shAlerts,settings:shSettings,pform:shPForm,cform:shCForm}[s.kind];
  const r=fn();if(!r){closeSheet();return;}
  $('#sheetroot').innerHTML=`<div class="scrim" data-act="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(r.title)}"><div class="grab"></div><div class="sh"><h3>${r.title}</h3><button class="iconbtn" data-act="close" aria-label="Close">${ic('close')}</button></div><div class="stack">${r.body}</div></div></div>`;
  const ns=$('#sheetroot .sheet');if(ns)ns.scrollTop=top;
}
function confirmRow(key,question,yesAct,yesLabel,extra=''){
  if(S.confirm!==key)return '';
  return `<div class="card" style="border-color:var(--bad)"><p style="margin:0 0 10px">${question}</p><div class="btns"><button class="btn danger solid" data-act="${yesAct}" ${extra}>${yesLabel}</button><button class="btn" data-act="cancelConfirm">Cancel</button></div></div>`;
}

function shProp(){
  const p=D.props.find(x=>x.id===S.sheet.id);if(!p)return null;
  const list=p.contracts;const col=list.reduce((a,c)=>a+c.collected,0);const bal=list.reduce((a,c)=>a+c.balance,0);
  const ov=list.reduce((a,c)=>a+c.items.filter(x=>x.st==='overdue').reduce((s,x)=>s+x.bal,0),0);
  const prevCustomers=[...new Set(list.filter(c=>c!==p.cur).map(c=>c.tenant))];
  const pend=list.flatMap(c=>c.items.filter(x=>x.st!=='paid'&&x.st!=='void').map(it=>({c,it}))).sort((a,b)=>a.it.due.localeCompare(b.it.due));
  return {title:esc(p.name),body:`
    <div class="btns"><span class="pill">${esc(p.type)}</span>${p.occ?'<span class="pill occupied">Occupied</span>':'<span class="pill">Available</span>'}${p.sample?'<span class="pill ex">Example</span>':''}</div>
    ${p.location||p.notes?`<div class="small muted">${esc(p.location||'')}${p.location&&p.notes?' · ':''}${esc(p.notes||'')}</div>`:''}
    ${p.cur?`<div class="card"><div class="label">Current contract</div><div style="margin-top:6px;font-weight:600">${esc(p.cur.tenant)} · ${KINDS[p.cur.kind]?.label}</div><div class="small muted">${fmtD(p.cur.start)} → ${fmtD(p.cur.end)} · ${daysText(diffDays(T,p.cur.end)).replace('In ','')}${diffDays(T,p.cur.end)>1?' left':''}</div><div class="btns" style="margin-top:10px"><button class="btn sm" data-act="openContract" data-id="${p.cur.id}">Open contract</button></div></div>`:''}
    <div class="grid3"><div class="tile ok"><span class="k">Received</span><span class="v sm num">${money(col)}</span></div><div class="tile warn"><span class="k">Pending</span><span class="v sm num">${money(bal-ov)}</span></div><div class="tile bad"><span class="k">Overdue</span><span class="v sm num">${money(ov)}</span></div></div>
    <h2 class="sec">History</h2>
    ${list.length?`<div class="card timeline">${list.map(c=>`<button class="tl ${c===p.cur?'cur':''}" data-act="openContract" data-id="${c.id}"><span class="dot"></span><span class="body"><span class="t" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-weight:600">${fmtMY(c.start)} – ${fmtMY(c.end)} <span class="pill kind">${KINDS[c.kind]?.short}</span><span class="pill ${c.st}">${CSTAT[c.st]}</span></span><span class="s small muted" style="display:block">${esc(c.tenant)} · ${money(num(c.amount))} · collected ${money(c.collected)}</span></span></button>`).join('')}</div>`:`<div class="card small muted">No contracts recorded for this property yet.</div>`}
    ${pend.length?`<h2 class="sec">Unpaid payments</h2><div class="list">${pend.map(payRow).join('')}</div>`:''}
    ${prevCustomers.length?`<h2 class="sec">Previous customers</h2><div class="card small">${prevCustomers.map(esc).join(' · ')}</div>`:''}
    ${S.canWrite?`<div class="btns"><button class="btn primary" data-act="newContract" data-prop="${p.id}">${ic('plus')}New contract</button><button class="btn" data-act="editProp" data-id="${p.id}">Edit property</button><button class="btn danger" data-act="ask" data-v="delProp">Delete</button></div>
    ${confirmRow('delProp',`Delete ${esc(p.name)}${list.length?` and its ${plural(list.length,'contract')} with all payment records`:''}? This can't be undone.`,'delProp','Delete property',`data-id="${p.id}"`)}`:''}`};
}
function shContract(){
  const c=D.cs.find(x=>x.id===S.sheet.id);if(!c)return null;const d=isD(c.end)?diffDays(T,c.end):0;
  const title=`${pname(c)} – ${c.tenant}`;
  const cal=isD(c.end)?[[0,'On expiry'],[7,'7 days before'],[30,'30 days before']].filter(([n])=>diffDays(T,addDays(c.end,-n))>=0).map(([n,l])=>`<a href="${gcal((n?`${n}-day notice: `:'Contract expires: ')+title,addDays(c.end,-n),`${pname(c)} – ${c.tenant}\nContract ${c.number||''} expires ${fmtD(c.end)}\nMobile: ${c.mobile||'-'}`)}" target="_blank" rel="noopener">${l}</a>`).join(''):'';
  return {title:esc(pname(c))+' · '+esc(c.number||''),body:`
    <div class="btns"><span class="pill kind">${KINDS[c.kind]?.label}</span><span class="pill ${c.st}">${c.st==='expiring'?(d<=0?'Expires today':d+' days left'):CSTAT[c.st]}</span>${c.sample?'<span class="pill ex">Example</span>':''}</div>
    <div class="card"><dl class="kv" style="margin:0">
      <dt>Tenant / customer</dt><dd>${esc(c.tenant)}</dd>
      <dt>Mobile</dt><dd><span class="copyable num">${esc(c.mobile||'—')}</span>${c.mobile?` <button class="link" data-act="copy" data-v="${esc(c.mobile)}">Copy</button>`:''}</dd>
      <dt>Period</dt><dd>${fmtD(c.start)} → ${fmtD(c.end)}</dd>
      <dt>Payment method</dt><dd>${METHODS[c.method]||'—'}</dd>
      <dt>Contract amount</dt><dd class="num">${money(num(c.amount))}</dd>
      <dt>${c.kind==='monthly'?'Monthly rent':'Per installment'}</dt><dd class="num">${c.kind==='monthly'?money(num(c.rent)):c.n?money(num(c.amount)/c.n):'—'} × ${c.n}</dd>
      <dt>Collected</dt><dd class="num" style="color:var(--ok)">${money(c.collected)}</dd>
      <dt>Balance</dt><dd class="num">${money(c.balance)}</dd>
      ${c.terminated?`<dt>Ended early on</dt><dd>${fmtD(c.terminatedOn)}</dd>`:''}
    </dl>${c.notes?`<p class="small muted" style="margin:10px 0 0;white-space:pre-wrap">${esc(c.notes)}</p>`:''}</div>
    ${cal&&!c.terminated?`<div><div class="label" style="margin-bottom:6px">Add expiry reminder to calendar</div><div class="cal">${cal}</div></div>`:''}
    <h2 class="sec">Payment schedule</h2>
    <div class="list">${c.items.map(it=>payRow({c,it})).join('')||'<div class="row small muted">No payments scheduled.</div>'}</div>
    ${S.canWrite?`<div class="btns"><button class="btn primary" data-act="renew" data-id="${c.id}">Renew / next contract</button><button class="btn" data-act="editContract" data-id="${c.id}">Edit</button></div>
    <div class="btns">${!c.terminated&&(c.st==='active'||c.st==='expiring')?'<button class="btn" data-act="ask" data-v="term">End contract early</button>':''}<button class="btn danger" data-act="ask" data-v="delC">Delete contract</button></div>
    ${confirmRow('term','End this contract today? Unpaid payments after today will be cancelled. The property becomes available.','term','End contract',`data-id="${c.id}"`)}
    ${confirmRow('delC','Delete this contract and all its payment records? This can\'t be undone. To keep history, end it early instead.','delC','Delete contract',`data-id="${c.id}"`)}`:''}`};
}
function shPay(){
  const c=D.cs.find(x=>x.id===S.sheet.cid);if(!c)return null;const it=c.items[S.sheet.i];if(!it)return null;const m=methodOf(c,it);
  const title=`${pname(c)} – ${c.tenant} – ${itemLabel(c,it)} – ${money(num(it.amount))}`;
  return {title:esc(itemLabel(c,it)),body:`
    <div class="card"><div style="font-weight:600">${esc(pname(c))} – ${esc(c.tenant)}</div><div class="small muted">${KINDS[c.kind]?.label} · ${esc(c.number||'')}</div>
    <dl class="kv" style="margin:10px 0 0"><dt>Due date</dt><dd>${fmtD(it.due)}</dd><dt>Amount</dt><dd class="num">${money(num(it.amount))}</dd><dt>Method</dt><dd>${METHODS[m]}</dd>
    ${m==='cheque'?`<dt>Cheque no.</dt><dd>${esc(it.chequeNo||'—')}</dd><dt>Cheque date</dt><dd>${fmtD(it.chequeDate||it.due)}</dd>`:''}
    <dt>Paid so far</dt><dd class="num">${money(it.paid)}</dd><dt>Balance</dt><dd class="num" style="color:${it.bal>0?'var(--warn)':'var(--ok)'}">${money(it.bal)}</dd><dt>Status</dt><dd><span class="pill ${it.st}">${PSTAT[it.st]||'Cancelled'}</span></dd></dl>
    ${it.notes?`<p class="small muted" style="margin:8px 0 0">${esc(it.notes)}</p>`:''}</div>
    ${it.st!=='paid'?`<div class="cal"><a href="${gcal('Due: '+title,m==='cheque'&&it.chequeDate?it.chequeDate:it.due,`${title}\nMethod: ${METHODS[m]}${it.chequeNo?'\nCheque #'+it.chequeNo:''}`)}" target="_blank" rel="noopener">Add due date to calendar</a></div>`:''}
    ${(it.receipts||[]).length?`<h2 class="sec">Payments received</h2><div class="list">${it.receipts.map((r,ri)=>`<div class="row"><span class="main"><span class="t num">${money(num(r.a))}</span><span class="s">${fmtD(r.d)} · ${METHODS[r.m]||''}${r.ref?' · '+esc(r.ref):''}${r.note?' · '+esc(r.note):''}</span></span>${S.canWrite?`<button class="btn sm danger" data-act="delReceipt" data-ri="${ri}">Remove</button>`:''}</div>`).join('')}</div>`:''}
    ${S.canWrite&&it.bal>0&&it.st!=='void'?`<h2 class="sec">Record a payment</h2>
    <form class="f card" data-form="receipt">
      <div class="two"><label class="fld"><span>Amount received</span><input id="r_a" name="a" type="number" inputmode="decimal" step="0.01" min="0.01" value="${it.bal}" required></label>
      <label class="fld"><span>Date received</span><input id="r_d" name="d" type="date" value="${T}" required></label></div>
      <div class="two"><label class="fld"><span>Method</span><select id="r_m" name="m">${Object.entries(METHODS).map(([k,l])=>`<option value="${k}" ${k===m?'selected':''}>${l}</option>`).join('')}</select></label>
      <label class="fld"><span>Reference</span><input id="r_ref" name="ref" placeholder="Cheque / transfer no." value="${esc(m==='cheque'?it.chequeNo||'':'')}"></label></div>
      <label class="fld"><span>Note</span><input id="r_note" name="note" placeholder="Optional"></label>
      <button class="btn primary" type="submit">Record payment</button>
      <span class="hint">Enter less than the balance to record a partial payment.</span>
    </form>`:''}`};
}
function shAlerts(){
  const R=D.R;const ov=D.overdue,ds=D.dueSoon.filter(x=>methodOf(x.c,x.it)!=='cheque'),cq=D.dueSoon.filter(x=>methodOf(x.c,x.it)==='cheque');
  const calPay=x=>{const t=`${pname(x.c)} – ${x.c.tenant} – ${itemLabel(x.c,x.it)} – ${money(x.it.bal)}`;return gcal('Due: '+t,x.it.chequeDate||x.it.due,t);};
  const withCal=(rowHtml,href)=>`<div>${rowHtml}<div class="cal" style="padding:0 14px 10px 30px"><a href="${href}" target="_blank" rel="noopener">Add to calendar</a></div></div>`;
  const grp=(title,arr,f)=>arr.length?`<h2 class="sec">${title} · ${arr.length}</h2><div class="list">${arr.map(f).join('')}</div>`:'';
  const none=!ov.length&&!ds.length&&!cq.length&&!D.expiring.length;
  return {title:'Alerts & reminders',body:`
    <div class="small muted">Payments due within ${R} days, overdue payments, and contracts within 30 days of expiry (30, 15, 7, 1 day and on the day). ${isNative?'With reminders turned on in Settings, your phone notifies you automatically. “Add to calendar” is optional.':'Tap “Add to calendar” to get a reminder from your calendar app.'}</div>
    ${none?'<div class="card small muted">No alerts right now.</div>':''}
    ${grp('Overdue',ov,x=>payRow(x))}
    ${grp('Cheques due soon',cq,x=>withCal(payRow(x),calPay(x)))}
    ${grp('Payments due soon',ds,x=>withCal(payRow(x),calPay(x)))}
    ${grp('Contracts expiring',D.expiring,c=>withCal(expRow(c),gcal('Contract expires: '+pname(c)+' – '+c.tenant,c.end,`${pname(c)} → ${c.tenant} → expires ${fmtD(c.end)}`)))}`};
}
function shSettings(){
  const H=notifHour();const n=S.notif;
  const notifCard=!isNative?`<div class="card small"><div class="label" style="margin-bottom:6px">Reminders</div><p style="margin:0">Phone notifications work in the installed Android app.</p></div>`:
   `<div class="card stack"><div class="toggle"><div><div class="label">Phone reminders</div><div class="small muted" style="margin-top:4px">${n==='granted'?'On. You get notifications for due payments, cheques, overdue payments and contract expiry (30, 15, 7, 1 days before and on the day).':n==='denied'?'Blocked. Allow notifications for Property Desk in Android Settings → Apps → Notifications.':'Off. Turn on to get reminders on this phone.'}</div></div></div>
    <div class="btns">${n==='granted'?'<button class="btn sm" data-act="notifTest">Send a test notification</button>':'<button class="btn sm primary" data-act="notifOn">Turn on reminders</button>'}</div></div>`;
  return {title:'Settings',body:`
    <div class="card"><div class="label" style="margin-bottom:6px">Account</div>
      <dl class="kv" style="margin:0"><dt>Signed in as</dt><dd>${esc(S.user?.email||'')}</dd><dt>Cloud project</dt><dd>${esc(api?.projectId||'')}</dd></dl>
      <div class="btns" style="margin-top:12px"><button class="btn sm" data-act="signOut">Sign out</button><button class="btn sm danger" data-act="ask" data-v="disc">Disconnect this phone</button></div>
      ${confirmRow('disc','Disconnect this phone from your cloud project? Your data stays safe in the cloud. You will need to paste the Firebase config and sign in again.','disconnect','Disconnect')}
    </div>
    ${notifCard}
    <form class="f card" data-form="settings">
      <div class="label">Preferences</div>
      <label class="fld"><span>Currency</span><input id="s_cur" name="currency" value="${esc(S.settings.currency||'AED')}" maxlength="6"></label>
      <label class="fld"><span>First payment reminder</span><select id="s_rd" name="remindDays">${[3,5,7,10,14,21,30].map(n=>`<option value="${n}" ${num(S.settings.remindDays)===n?'selected':''}>${n} days before due date</option>`).join('')}</select></label>
      <label class="fld"><span>Reminder time on this phone</span><select id="s_hr" name="notifHour">${Array.from({length:17},(_,i)=>i+6).map(h=>`<option value="${h}" ${h===H?'selected':''}>${pad(h>12?h-12:h)}:00 ${h<12?'AM':'PM'}</option>`).join('')}</select></label>
      <span class="hint">Payment reminders arrive on the first-reminder day, 7 days and 1 day before, and on the due date.</span>
      <button class="btn primary" type="submit">Save settings</button>
    </form>
    <div class="card small"><div class="label" style="margin-bottom:6px">Adding staff</div><p style="margin:0">In Firebase, open Authentication → Users → Add user and create an email and password for each staff member. They install this same app, paste the same Firebase config, and sign in. Everyone sees the same data.</p></div>
    <p class="small muted" style="text-align:center">Property Desk ${isNative?'for Android':'(browser)'}</p>`};
}
/* ---------- forms ---------- */
function shPForm(){
  const p=S.sheet.id?S.props.find(x=>x.id===S.sheet.id):null;const t=p?.type||'Shop';
  return {title:p?'Edit property':'Add property',body:`
  <form class="f" data-form="prop">
    <label class="fld"><span>Property name / number</span><input id="p_name" name="name" required placeholder="e.g. Shop 12" value="${esc(p?.name||'')}"></label>
    <label class="fld"><span>Property type</span><select id="p_type" name="type">${PTYPES.map(x=>`<option ${x===t?'selected':''}>${x}</option>`).join('')}${!PTYPES.includes(t)?`<option selected>${esc(t)}</option>`:''}</select></label>
    <label class="fld"><span>Building / location</span><input id="p_loc" name="location" placeholder="Optional" value="${esc(p?.location||'')}"></label>
    <label class="fld"><span>Notes</span><textarea id="p_notes" name="notes" placeholder="Optional">${esc(p?.notes||'')}</textarea></label>
    ${p?'':`<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="p_next" name="next" checked> Add a contract for it next</label>`}
    <button class="btn primary" type="submit">${p?'Save changes':'Add property'}</button>
  </form>`};
}
function nextNo(){const y=T.slice(0,4);const n=S.contracts.filter(c=>String(c.number||'').startsWith('C-'+y)).length+1;return 'C-'+y+'-'+String(n).padStart(3,'0');}
function kindDefaults(d){const s=isD(d.start)?d.start:T;
  const m={monthly:12,yearly:12,installment:12,temp_sale:3,year_sale:12}[d.kind]||12;d.end=addDays(addMonths(s,m),-1);
  d.n={monthly:monthsSpan(s,d.end),yearly:1,installment:4,temp_sale:1,year_sale:1}[d.kind];d.firstDue=s;}
function openContractForm(id,propId,fromId){
  const c=id?S.contracts.find(x=>x.id===id):null;
  if(c){S.draft=JSON.parse(JSON.stringify(c));S.draft.n=(c.schedule||[]).length;S.draft.firstDue=(c.schedule||[])[0]?.due||c.start;S.draft.editing=true;}
  else{const from=fromId?S.contracts.find(x=>x.id===fromId):null;
    S.draft={id:null,propertyId:propId||from?.propertyId||(D.props.find(p=>!p.occ)||D.props[0])?.id||'',number:nextNo(),kind:from?(from.kind==='temp_sale'?'temp_sale':from.kind):'monthly',tenant:from?.tenant||'',mobile:from?.mobile||'',start:from&&isD(from.end)?addDays(from.end,1):T,method:from?.method||'cheque',amount:from?.amount??'',rent:from?.rent??'',notes:'',schedule:[]};
    kindDefaults(S.draft);if(from&&from.kind==='monthly')S.draft.n=monthsSpan(S.draft.start,S.draft.end);regen(false);}
  S.sheet={kind:'cform'};S.confirm=null;drawSheet(true);
}
function regen(keep){const d=S.draft;const n=Math.max(1,Math.min(120,parseInt(d.n)||1));d.n=n;
  const total=d.kind==='monthly'?num(d.rent)*n:num(d.amount);if(d.kind==='monthly')d.amount=round2(total);
  const span=monthsSpan(d.start,d.end);const step=d.kind==='monthly'?1:Math.max(1,Math.floor(span/n));
  const base=Math.floor(total/n*100)/100;const old=d.schedule||[];const fd=isD(d.firstDue)?d.firstDue:d.start;
  d.schedule=Array.from({length:n},(_,i)=>{const o=keep?old[i]:null;const due=addMonths(fd,i*step);const amt=i===n-1?round2(total-base*(n-1)):base;const meth=o?.method||d.method;
    return {id:o?.id||rid(),due,amount:amt,method:meth,chequeNo:o?.chequeNo||'',chequeDate:o?.chequeDate||(meth==='cheque'?due:''),notes:o?.notes||'',receipts:o?.receipts||[]};});
}
function shCForm(){
  const d=S.draft;const isM=d.kind==='monthly';const props=D.props;
  const schedSum=round2((d.schedule||[]).reduce((a,x)=>a+num(x.amount),0));const tot=isM?round2(num(d.rent)*(d.schedule||[]).length):num(d.amount);
  const per=isM?num(d.rent):(d.n?num(d.amount)/d.n:0);
  return {title:d.editing?'Edit contract':'New contract',body:`
  <form class="f" data-form="contract">
    <label class="fld"><span>Property</span><select id="c_prop" data-d="propertyId" required>${props.map(p=>`<option value="${p.id}" ${p.id===d.propertyId?'selected':''}>${esc(p.name)} · ${esc(p.type)}${p.occ&&p.id!==d.propertyId?' (occupied)':''}</option>`).join('')}</select></label>
    <div class="two"><label class="fld"><span>Contract number</span><input id="c_no" data-d="number" value="${esc(d.number||'')}"></label>
    <label class="fld"><span>Contract type</span><select id="c_kind" data-d="kind">${Object.entries(KINDS).map(([k,v])=>`<option value="${k}" ${k===d.kind?'selected':''}>${v.label}</option>`).join('')}</select></label></div>
    <div class="two"><label class="fld"><span>Tenant / customer name</span><input id="c_ten" data-d="tenant" required value="${esc(d.tenant)}"></label>
    <label class="fld"><span>Mobile number</span><input id="c_mob" data-d="mobile" type="tel" inputmode="tel" value="${esc(d.mobile||'')}"></label></div>
    <div class="two"><label class="fld"><span>Start date</span><input id="c_start" type="date" data-d="start" required value="${esc(d.start)}"></label>
    <label class="fld"><span>Expiry date</span><input id="c_end" type="date" data-d="end" required value="${esc(d.end)}"></label></div>
    <div class="two">${isM?`<label class="fld"><span>Monthly rent</span><input id="c_rent" type="number" inputmode="decimal" step="0.01" min="0" data-d="rent" value="${esc(d.rent)}" required></label>`:`<label class="fld"><span>${d.kind==='yearly'?'Yearly rent':d.kind==='installment'?'Total contract amount':'Sale amount'}</span><input id="c_amt" type="number" inputmode="decimal" step="0.01" min="0" data-d="amount" value="${esc(d.amount)}" required></label>`}
    <label class="fld"><span>Payment method</span><select id="c_meth" data-d="method">${Object.entries(METHODS).map(([k,l])=>`<option value="${k}" ${k===d.method?'selected':''}>${l}</option>`).join('')}</select></label></div>
    <div class="two"><label class="fld"><span>${isM?'Number of months':'Number of installments'}</span><input id="c_n" type="number" min="1" max="120" data-d="n" value="${esc(d.n)}"></label>
    <label class="fld"><span>First payment date</span><input id="c_fd" type="date" data-d="firstDue" value="${esc(d.firstDue||d.start)}"></label></div>
    <div class="hint" id="perline">${isM?'Contract total':'Each installment'}: <b class="num">${money(isM?tot:per)}</b></div>
    <h2 class="sec">Payment schedule <span class="btns" style="flex:0 0 auto"><button class="link" type="button" data-act="regen">${d.editing?'Rebuild from terms':'Recalculate'}</button></span></h2>
    ${d.editing?'<div class="hint">Rebuilding keeps payments already recorded on each row.</div>':''}
    <div class="sched">${(d.schedule||[]).map((r,i)=>`<div class="srow">
      <span class="n">${i+1}</span>
      <label>Due date<input type="date" id="s_due_${i}" data-row="${i}" data-k="due" value="${esc(r.due)}"></label>
      <label>Amount<input type="number" step="0.01" inputmode="decimal" id="s_amt_${i}" data-row="${i}" data-k="amount" value="${esc(r.amount)}"></label>
      <button type="button" class="x" data-act="rmRow" data-i="${i}" aria-label="Remove row ${i+1}">×</button>
      <span></span>
      <div class="chq"><label>Method<select id="s_m_${i}" data-row="${i}" data-k="method">${Object.entries(METHODS).map(([k,l])=>`<option value="${k}" ${k===(r.method||d.method)?'selected':''}>${l}</option>`).join('')}</select></label>
      ${(r.method||d.method)==='cheque'?`<label>Cheque no.<input id="s_cn_${i}" data-row="${i}" data-k="chequeNo" value="${esc(r.chequeNo||'')}"></label>`:'<span></span>'}</div><span></span>
      ${(r.method||d.method)==='cheque'?`<span></span><div class="chq"><label>Cheque date<input type="date" id="s_cd_${i}" data-row="${i}" data-k="chequeDate" value="${esc(r.chequeDate||'')}"></label><label>Note<input id="s_nt_${i}" data-row="${i}" data-k="notes" value="${esc(r.notes||'')}"></label></div><span></span>`:''}
      ${(r.receipts||[]).length?`<span></span><span class="hint" style="grid-column:2/4">Received ${money(sumR(r))}</span><span></span>`:''}
    </div>`).join('')}</div>
    <button class="btn sm" type="button" data-act="addRow">${ic('plus')}Add payment row</button>
    <div id="sumwarn">${Math.abs(schedSum-tot)>0.01?`<div class="warnbox">Schedule adds up to ${money(schedSum)}, but the contract amount is ${money(tot)}. Tap ${d.editing?'Rebuild from terms':'Recalculate'} or adjust the rows.</div>`:''}</div>
    <label class="fld"><span>Notes</span><textarea id="c_notes" data-d="notes" placeholder="Optional">${esc(d.notes||'')}</textarea></label>
    <div id="cerr"></div>
    <button class="btn primary" type="submit">${d.editing?'Save contract':'Create contract'}</button>
  </form>`};
}

/* ---------- writes ---------- */
function toast(m){const t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,2600);}
function writeErr(e){toast(e&&e.code?dataMessage(e):"Couldn't save. Try again.");}
let queuedNote=0;
function noteQueued(r){if(r==='queued'&&Date.now()-queuedNote>20000){queuedNote=Date.now();setTimeout(()=>toast('Saved on this phone. It will sync to the cloud when you are online.'),2700);}}
async function put(path,body){try{noteQueued(await api.set(path,body));return true;}catch(e){writeErr(e);return false;}}
async function patch(path,body){try{noteQueued(await api.update(path,body));return true;}catch(e){writeErr(e);return false;}}
async function del(path){try{noteQueued(await api.del(path));return true;}catch(e){writeErr(e);return false;}}
window.addEventListener('pd-late-error',e=>writeErr(e.detail));
const clean=o=>JSON.parse(JSON.stringify(o));

/* ---------- events ---------- */
document.addEventListener('click',async ev=>{
  const el=ev.target.closest('[data-act]');if(!el)return;const a=el.dataset.act;
  if(a==='scrim'){if(ev.target===el)closeSheet();return;}
  if(el.tagName==='A')return;
  switch(a){
    case 'tab':S.tab=el.dataset.v;try{localStorage.setItem('pd_tab',S.tab);}catch(e){}window.scrollTo(0,0);render();break;
    case 'f':{const k=el.dataset.k;S.f[k]=k==='ryear'?Number(el.dataset.v):el.dataset.v;render();break;}
    case 'goPay':S.tab='payments';S.f.ystat=el.dataset.v;S.f.ymeth='all';S.f.yfrom='';S.f.yto='';render();window.scrollTo(0,0);break;
    case 'goPayCheque':S.tab='payments';S.f.ystat='upcoming';S.f.ymeth='cheque';S.f.yfrom=T;S.f.yto=addDays(T,30);render();window.scrollTo(0,0);break;
    case 'goExpiring':S.tab='contracts';S.f.cstat='expiring';S.f.ckind='all';render();window.scrollTo(0,0);break;
    case 'alerts':openSheet({kind:'alerts'});break;
    case 'settings':openSheet({kind:'settings'});notifPermission().then(r=>{S.notif=r;if(S.sheet?.kind==='settings')drawSheet();});break;
    case 'close':closeSheet();break;
    case 'openProp':openSheet({kind:'prop',id:el.dataset.id});break;
    case 'openContract':openSheet({kind:'contract',id:el.dataset.id});break;
    case 'openPay':openSheet({kind:'pay',cid:el.dataset.c,i:Number(el.dataset.i)});break;
    case 'newProp':openSheet({kind:'pform'});break;
    case 'editProp':openSheet({kind:'pform',id:el.dataset.id});break;
    case 'newContract':if(!S.props.length){openSheet({kind:'pform'});toast('Add a property first.');break;}openContractForm(null,el.dataset.prop);break;
    case 'editContract':openContractForm(el.dataset.id);break;
    case 'renew':openContractForm(null,null,el.dataset.id);break;
    case 'ask':S.confirm=el.dataset.v;drawSheet();break;
    case 'cancelConfirm':S.confirm=null;S.sheet?drawSheet():render();break;
    case 'askClearSample':S.confirm='clearSample';render();break;
    case 'copy':try{await navigator.clipboard.writeText(el.dataset.v);toast('Copied');}catch(e){toast('Select the number to copy it.');}break;
    case 'regen':regen(!!S.draft.editing);drawSheet();break;
    case 'addRow':{const d=S.draft;const last=d.schedule[d.schedule.length-1];const due=last?addMonths(last.due,1):d.start;d.schedule.push({id:rid(),due,amount:last?last.amount:0,method:d.method,chequeNo:'',chequeDate:d.method==='cheque'?due:'',notes:'',receipts:[]});d.n=d.schedule.length;drawSheet();break;}
    case 'rmRow':{const d=S.draft;const r=d.schedule[Number(el.dataset.i)];if(r&&(r.receipts||[]).length){toast('This row has payments recorded. Remove those first.');break;}d.schedule.splice(Number(el.dataset.i),1);d.n=d.schedule.length;drawSheet();break;}
    case 'delProp':{const id=el.dataset.id;const cs=S.contracts.filter(c=>c.propertyId===id);for(const c of cs){if(!await del('contracts/'+c.id))return;}if(await del('properties/'+id)){closeSheet();toast('Property deleted');}break;}
    case 'delC':{if(await del('contracts/'+el.dataset.id)){closeSheet();toast('Contract deleted');}break;}
    case 'term':{if(await patch('contracts/'+el.dataset.id,{terminated:true,terminatedOn:T,updatedAt:new Date().toISOString()})){S.confirm=null;toast('Contract ended');}break;}
    case 'delReceipt':{const c=S.contracts.find(x=>x.id===S.sheet.cid);if(!c)break;const sch=clean(c.schedule);sch[S.sheet.i].receipts.splice(Number(el.dataset.ri),1);if(await patch('contracts/'+c.id,{schedule:sch,updatedAt:new Date().toISOString()}))toast('Payment removed');break;}
    case 'clearSample':{const ps=S.props.filter(p=>p.sample),cs=S.contracts.filter(c=>c.sample);for(const c of cs){if(!await del('contracts/'+c.id))return;}for(const p of ps){if(!await del('properties/'+p.id))return;}S.confirm=null;render();toast('Examples removed');break;}
    case 'csv':exportCSV();break;
  }
});
document.addEventListener('input',ev=>{
  const el=ev.target;
  if(el.dataset.filter){S.f[el.dataset.filter]=el.value;const L=$('#list');if(L){D=derive();L.innerHTML={props:propList,contracts:contractList,payments:payList}[S.tab]();}return;}
  if(!S.draft)return;
  if(el.dataset.d){S.draft[el.dataset.d]=el.value;if(['rent','amount','n'].includes(el.dataset.d)){const d=S.draft,isM=d.kind==='monthly';const pl=$('#perline');if(pl)pl.innerHTML=`${isM?'Contract total':'Each installment'}: <b class="num">${money(isM?num(d.rent)*(parseInt(d.n)||0):num(d.amount)/(parseInt(d.n)||1))}</b>`;}}
  if(el.dataset.row!==undefined){const r=S.draft.schedule[Number(el.dataset.row)];if(r)r[el.dataset.k]=el.dataset.k==='amount'?num(el.value):el.value;}
});
document.addEventListener('change',ev=>{
  const el=ev.target;if(!S.draft||S.sheet?.kind!=='cform')return;const d=S.draft;
  if(el.dataset.d){const k=el.dataset.d;
    if(k==='kind'&&!d.editing){kindDefaults(d);}
    if(k==='start'&&isD(d.start)&&!d.editing){const k2=d.kind;const keepN=d.n;kindDefaults(d);if(k2!=='monthly')d.n=keepN;}
    if(k==='end'&&d.kind==='monthly'&&!d.editing)d.n=monthsSpan(d.start,d.end);
    if(k==='method'&&!d.editing)d.schedule.forEach(r=>{r.method=d.method;if(d.method==='cheque'&&!r.chequeDate)r.chequeDate=r.due;});
    if(['kind','start','end','rent','amount','n','firstDue','method'].includes(k)&&!d.editing)regen(false);
    if(['kind','start','end','rent','amount','n','firstDue','method'].includes(k))drawSheet();
  }
  if(el.dataset.row!==undefined){const r=d.schedule[Number(el.dataset.row)];if(el.dataset.k==='method'){if(r.method==='cheque'&&!r.chequeDate)r.chequeDate=r.due;drawSheet();}else if(el.dataset.k==='amount'){drawSheet();}}
});
document.addEventListener('submit',async ev=>{
  ev.preventDefault();const f=ev.target;const kind=f.dataset.form;const now=new Date().toISOString();
  if(kind==='prop'){const fd=new FormData(f);const name=String(fd.get('name')||'').trim();if(!name)return;
    const ex=S.sheet.id?S.props.find(x=>x.id===S.sheet.id):null;const id=ex?ex.id:api.newId('properties');
    const body={...(ex?clean(ex):{}),name,type:String(fd.get('type')),location:String(fd.get('location')||'').trim(),notes:String(fd.get('notes')||'').trim(),updatedAt:now};delete body.id;if(!ex)body.createdAt=now;
    if(await put('properties/'+id,body)){toast(ex?'Property saved':'Property added');if(!ex&&fd.get('next')){S.props.push({id,...body});D=derive();openContractForm(null,id);}else closeSheet();}
  }
  else if(kind==='settings'){const fd=new FormData(f);const body={currency:String(fd.get('currency')||'AED').trim().toUpperCase()||'AED',remindDays:Number(fd.get('remindDays'))||14};
    const hr=Number(fd.get('notifHour'));if(hr>=0&&hr<=23){try{localStorage.setItem('pd_notif_hour',String(hr));}catch(e){}}
    if(await put('settings/app',body)){S.settings={...S.settings,...body};closeSheet();render();scheduleReminders(true);toast('Settings saved');}}
  else if(kind==='receipt'){const fd=new FormData(f);const c=S.contracts.find(x=>x.id===S.sheet.cid);if(!c)return;const a=num(fd.get('a'));if(a<=0)return;
    const sch=clean(c.schedule);const it=sch[S.sheet.i];it.receipts=it.receipts||[];it.receipts.push({a:round2(a),d:String(fd.get('d')),m:String(fd.get('m')),ref:String(fd.get('ref')||'').trim(),note:String(fd.get('note')||'').trim()});
    if(await patch('contracts/'+c.id,{schedule:sch,updatedAt:now}))toast('Payment recorded');}
  else if(kind==='contract'){const d=S.draft;const err=m=>{$('#cerr').innerHTML=`<div class="warnbox">${m}</div>`;};
    if(!d.propertyId)return err('Choose a property.');if(!String(d.tenant).trim())return err('Enter the tenant or customer name.');
    if(!isD(d.start)||!isD(d.end))return err('Enter the start and expiry dates.');if(d.end<d.start)return err('The expiry date is before the start date.');
    if(!d.schedule.length)return err('Add at least one payment row.');if(d.schedule.some(r=>!isD(r.due)))return err('Every payment row needs a due date.');
    const sched=d.schedule.map(r=>({id:r.id||rid(),due:r.due,amount:round2(num(r.amount)),method:r.method||d.method,chequeNo:r.chequeNo||'',chequeDate:r.chequeDate||'',notes:r.notes||'',receipts:r.receipts||[]})).sort((a,b)=>a.due.localeCompare(b.due));
    const id=d.id||api.newId('contracts');const ex=d.id?S.contracts.find(x=>x.id===d.id):null;
    const body={propertyId:d.propertyId,number:String(d.number||'').trim(),kind:d.kind,tenant:String(d.tenant).trim(),mobile:String(d.mobile||'').trim(),start:d.start,end:d.end,
      amount:d.kind==='monthly'?round2(num(d.rent)*sched.length):round2(num(d.amount)),rent:d.kind==='monthly'?num(d.rent):null,method:d.method,n:sched.length,schedule:sched,notes:String(d.notes||'').trim(),
      terminated:!!ex?.terminated,terminatedOn:ex?.terminatedOn||null,createdAt:ex?.createdAt||now,updatedAt:now};
    if(ex?.sample)body.sample=true;
    if(await put('contracts/'+id,body)){toast(ex?'Contract saved':'Contract created');S.draft=null;openSheet({kind:'contract',id});}
  }
});
async function exportCSV(){
  const r=buildReport();const q=v=>{const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
  const lines=[r.cols.map(q).join(','),...r.rows.map(row=>row.map(v=>q(typeof v==='number'?round2(v):v)).join(',')),...(r.foot?[r.foot.map(v=>q(typeof v==='number'?round2(v):v)).join(',')]:[])];
  const name=(REPORTS.find(x=>x[0]===S.f.rep)[1]+' '+(['yearly','pending','overdue','expiring'].includes(S.f.rep)?T:S.f.ryear)).replace(/\s+/g,'-').toLowerCase()+'.csv';
  try{await shareFile(name,'\ufeff'+lines.join('\n'));}catch(e){if(!/cancel/i.test(String(e&&e.message)))toast("Couldn't export the report.");}
}
/* ---------- boot ---------- */
const LOGO='<svg class="i" viewBox="0 0 24 24" aria-hidden="true">'+ICONS.props+'</svg>';
function renderGate(){
  const g=$('#gate');const st=S.dbState;let h='';
  const brand=`<div class="brand"><div class="logo">${LOGO}</div><div><h1>Property Desk</h1><p class="small">Properties · contracts · payments</p></div></div>`;
  if(st==='boot')h=`${brand}<p>Starting…</p>`;
  else if(st==='setup')h=`${brand}
    <div class="card stack">
      <div><div class="label">Step 1 of 2 · Connect your cloud</div><p style="margin-top:6px">Your data is kept in your own free Google Firebase project, so it is backed up and shared with your staff. Follow the setup guide to create it, then paste the <b>firebaseConfig</b> here.</p></div>
      <form class="f" data-form="g_cfg">
        <label class="fld"><span>Firebase config</span><textarea id="g_cfg" name="cfg" placeholder='const firebaseConfig = {
  apiKey: "AIza…",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  …
};' spellcheck="false" autocapitalize="off" autocomplete="off">${esc(S.cfgText||'')}</textarea></label>
        ${S.gateErr?`<div class="errbox">${esc(S.gateErr)}</div>`:''}
        <button class="btn primary" type="submit">Connect</button>
      </form>
    </div>`;
  else if(st==='signin')h=`${brand}
    <div class="card stack">
      <div><div class="label">Sign in</div><p class="small" style="margin-top:4px">Cloud project: <b>${esc(api&&api.projectId||'')}</b></p></div>
      <form class="f" data-form="g_signin">
        <label class="fld"><span>Email</span><input id="g_email" name="email" type="email" autocomplete="username" autocapitalize="off" required value="${esc(S.lastEmail||'')}"></label>
        <label class="fld"><span>Password</span><input id="g_pw" name="pw" type="password" autocomplete="current-password" required></label>
        ${S.gateErr?`<div class="errbox">${esc(S.gateErr)}</div>`:''}${S.gateOk?`<div class="okbox">${esc(S.gateOk)}</div>`:''}
        <button class="btn primary" type="submit" ${S.busy?'disabled':''}>${S.busy?'Signing in…':'Sign in'}</button>
      </form>
      <div class="btns"><button class="btn sm" data-act="g_reset">Forgot password</button><button class="btn sm" data-act="g_change">Use a different cloud project</button></div>
    </div>
    <p class="small">Accounts are created by the owner in Firebase → Authentication → Users.</p>`;
  g.innerHTML=`<div class="gate">${h}</div>`;
}
function stopListeners(){unsubs.forEach(u=>{try{u();}catch(e){}});unsubs=[];gotP=false;gotC=false;}
function startListeners(){
  stopListeners();S.dbState='loading';render();
  const fail=e=>{S.cloudErr=dataMessage(e);if(S.dbState==='loading')S.dbState='ok';render();};
  const refresh=()=>{if(gotP&&gotC){S.dbState='ok';S.cloudErr='';}render();if(S.sheet&&!['cform','pform','settings'].includes(S.sheet.kind))drawSheet();if(gotP&&gotC){scheduleReminders();openPendingTap();}};
  unsubs.push(api.listen('properties',docs=>{S.props=docs;gotP=true;refresh();},fail));
  unsubs.push(api.listen('contracts',docs=>{S.contracts=docs;gotC=true;refresh();},fail));
  unsubs.push(api.listenDoc('settings/app',d=>{if(d)S.settings={...S.settings,...d};render();},()=>{}));
}
function start(){
  if(api){try{api.destroy();}catch(e){}api=null;}
  const cfg=__DEMO__?{projectId:'demo-project'}:loadConfig();
  if(!cfg){S.dbState='setup';render();return;}
  api=connect(cfg);S.dbState='boot';render();
  api.onAuth(u=>{if(!u){stopListeners();S.user=null;S.props=[];S.contracts=[];S.dbState='signin';S.busy=false;closeSheet();render();return;}
    S.user=u;S.gateErr='';S.gateOk='';S.busy=false;try{localStorage.setItem('pd_last_email',u.email||'');}catch(e){}startListeners();});
}
try{S.lastEmail=localStorage.getItem('pd_last_email')||'';}catch(e){}

/* gate + settings actions */
document.addEventListener('submit',async ev=>{
  const f=ev.target;const k=f.dataset.form;if(k!=='g_cfg'&&k!=='g_signin')return;ev.preventDefault();ev.stopImmediatePropagation();
  if(k==='g_cfg'){const txt=f.cfg.value;S.cfgText=txt;const cfg=parseConfig(txt);
    if(!cfg){S.gateErr='This doesn\'t look like a Firebase config. Copy the whole block that starts with "const firebaseConfig = {" from Firebase → Project settings → Your apps.';render();return;}
    S.gateErr='';saveConfig(cfg);start();}
  else{const email=f.email.value.trim(),pw=f.pw.value;S.lastEmail=email;S.gateErr='';S.gateOk='';S.busy=true;render();
    try{await api.signIn(email,pw);}catch(e){S.busy=false;S.gateErr=authMessage(e);render();}}
},true);
document.addEventListener('click',async ev=>{
  const el=ev.target.closest('[data-act]');
  const link=ev.target.closest('a[target="_blank"]');
  if(link&&isNative){ev.preventDefault();window.location.href=link.href;return;}
  if(!el)return;const a=el.dataset.act;
  if(a==='g_reset'){const em=($('#g_email')||{}).value||'';if(!em.trim()){S.gateErr='Type your email above first, then tap Forgot password.';render();return;}
    try{await api.resetPassword(em.trim());S.gateErr='';S.gateOk='Password reset email sent to '+em.trim()+'. Check your inbox.';}catch(e){S.gateOk='';S.gateErr=authMessage(e);}render();}
  else if(a==='g_change'){clearConfig();S.gateErr='';S.gateOk='';start();}
  else if(a==='signOut'){closeSheet();await api.signOut();}
  else if(a==='disconnect'){closeSheet();try{await api.signOut();}catch(e){}clearConfig();await replaceReminders([]);start();}
  else if(a==='notifOn'){const r=await askNotifPermission();S.notif=r;if(r==='granted'){await scheduleReminders(true);toast('Reminders are on');}else toast('Notifications are blocked. Allow them in Android Settings → Apps → Property Desk → Notifications.');drawSheet();}
  else if(a==='notifTest'){if(await testNotification())toast('A test notification will appear in a few seconds');}
});

/* ---------- reminders (phone notifications) ---------- */
let remTimer=null,lastRem='';
function notifHour(){try{const h=Number(localStorage.getItem('pd_notif_hour'));return h>=0&&h<=23&&localStorage.getItem('pd_notif_hour')!==null?h:9;}catch(e){return 9;}}
function buildReminders(){
  const d=derive();const R=num(S.settings.remindDays)||14;const H=notifHour();const now=Date.now();const out=[];
  const at=(ds,h)=>{const p=parseD(ds);return new Date(p.y,p.m-1,p.d,h,0,0);};
  const nextSlot=()=>{const t=at(T,H);return t.getTime()>now?t:at(addDays(T,1),H);};
  const kindWord=(c,it)=>methodOf(c,it)==='cheque'?'Cheque':c.kind==='monthly'?'Rent':c.kind==='yearly'?'Yearly rent':c.kind==='installment'?'Installment':'Payment';
  d.pays.forEach(({c,it})=>{
    if(it.st==='paid'||it.st==='void')return;const m=methodOf(c,it);
    const due=m==='cheque'&&isD(it.chequeDate)?it.chequeDate:it.due;
    const body=`${pname(c)} – ${c.tenant} – ${itemLabel(c,it)} due on ${fmtS(it.due)} – ${money(it.bal)}${m==='cheque'?' – Cheque'+(it.chequeNo?' #'+it.chequeNo:''):' – '+METHODS[m]}`;
    const extra={kind:'pay',c:c.id,i:it.i};
    if(it.st==='overdue'){const late=diffDays(it.due,T);const first=nextSlot();
      [0,3,7].forEach(k=>{const t=new Date(first.getTime()+k*864e5);out.push({at:t,title:`Overdue: ${kindWord(c,it)} ${late+k} days late`,body,extra});});return;}
    [...new Set([R,7,1,0])].filter(o=>o<=R).forEach(o=>{const t=at(addDays(due,-o),H);if(t.getTime()>now)out.push({at:t,title:o===0?`${kindWord(c,it)} due today`:`${kindWord(c,it)} due in ${o} day${o>1?'s':''}`,body,extra});});
  });
  d.cs.forEach(c=>{if(c.terminated||!isD(c.end)||c.end<T)return;
    [30,15,7,1,0].forEach(o=>{const t=at(addDays(c.end,-o),H);if(t.getTime()>now)out.push({at:t,title:o===0?'Contract expires today':`Contract expires in ${o} day${o>1?'s':''}`,body:`${pname(c)} → ${c.tenant} → ${fmtD(c.end)} → ${o} day${o===1?'':'s'} remaining`,extra:{kind:'contract',id:c.id}});});});
  out.sort((a,b)=>a.at-b.at);
  return out.slice(0,60).map((n,i)=>({...n,id:i+1}));
}
async function scheduleReminders(force){
  if(!isNative)return;clearTimeout(remTimer);
  remTimer=setTimeout(async()=>{const list=buildReminders();const key=notifHour()+'|'+JSON.stringify(list.map(n=>[n.at.getTime(),n.title,n.body]));
    let prev='';try{prev=localStorage.getItem('pd_rem_key')||'';}catch(e){}
    if(!force&&key===prev&&key===lastRem)return;
    const r=await replaceReminders(list);if(r.ok){lastRem=key;try{localStorage.setItem('pd_rem_key',key);}catch(e){}}},force?50:1500);
}
let pendingTap=null;
function openPendingTap(){if(!pendingTap||S.dbState!=='ok')return;const x=pendingTap;pendingTap=null;
  if(x.kind==='pay'&&S.contracts.some(c=>c.id===x.c))openSheet({kind:'pay',cid:x.c,i:Number(x.i)});else if(x.kind==='contract'&&S.contracts.some(c=>c.id===x.id))openSheet({kind:'contract',id:x.id});}
onNotificationTap(extra=>{if(extra){pendingTap=extra;openPendingTap();}});

/* ---------- Android back button ---------- */
if(isNative){import('@capacitor/app').then(({App})=>{
  App.addListener('backButton',()=>{if(S.sheet){closeSheet();return;}if(S.dbState==='ok'&&S.tab!=='home'){S.tab='home';render();window.scrollTo(0,0);return;}App.exitApp();});
  App.addListener('resume',()=>{if(todayStr()!==T)render();scheduleReminders();});
});}
window.addEventListener('online',()=>{S.offline=false;if(S.dbState==='ok')render();});
window.addEventListener('offline',()=>{S.offline=true;if(S.dbState==='ok')render();});
S.offline=!navigator.onLine;
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&S.sheet)closeSheet();});
setInterval(()=>{if(todayStr()!==T&&S.dbState==='ok')render();},60000);
if(__DEMO__)window.__pd={buildReminders};
start();
