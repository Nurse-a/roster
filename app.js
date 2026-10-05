(function(){
"use strict";
/* =========================================================
   جداول التمريض — Nursing Roster
   Part 1: utilities, language, calendar, data layer, auth
   ========================================================= */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = () => Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4);
const pad = n => String(n).padStart(2,"0");
const clone = o => JSON.parse(JSON.stringify(o ?? null));

/* ---------- language ---------- */
let lang = (()=>{ try{ return localStorage.getItem("roster-lang") || "ar"; }catch(e){ return "ar"; } })();
const L = (ar,en) => lang==="en" ? en : ar;
function applyLang(){
  document.documentElement.lang = lang;
  document.documentElement.dir = lang==="en" ? "ltr" : "rtl";
  document.title = L("جداول التمريض","Nursing Roster");
}
const MONTHS_AR=["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const MONTHS_EN=["January","February","March","April","May","June","July","August","September","October","November","December"];
const WDS_AR=["ح","ن","ث","ر","خ","ج","س"], WDS_EN=["Su","Mo","Tu","We","Th","Fr","Sa"];
const WD_AR=["الأحد","الإثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"], WD_EN=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

/* ---------- dates ---------- */
const ds = (y,m,d) => `${y}-${pad(m)}-${pad(d)}`;
const dim = m => { const [y,mo]=m.split("-").map(Number); return new Date(y,mo,0).getDate(); };
const monthLabel = m => { const [y,mo]=m.split("-").map(Number); return (lang==="en"?MONTHS_EN:MONTHS_AR)[mo-1]+" "+y; };
const shiftMonth = (m,k) => { const [y,mo]=m.split("-").map(Number); const t=new Date(y,mo-1+k,1); return t.getFullYear()+"-"+pad(t.getMonth()+1); };
const todayStr = () => { const t=new Date(); return ds(t.getFullYear(),t.getMonth()+1,t.getDate()); };
const toDate = s => { const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); };
const fromDate = t => ds(t.getFullYear(),t.getMonth()+1,t.getDate());
const addDays = (s,n) => { const t=toDate(s); t.setDate(t.getDate()+n); return fromDate(t); };
const daysBetween = (a,b) => Math.round((toDate(b)-toDate(a))/86400000)+1;
const weekday = s => toDate(s).getDay();
const dayOf = (month,d) => month+"-"+pad(d);
const HIJRI_AR=["محرم","صفر","ربيع الأول","ربيع الآخر","جمادى الأولى","جمادى الآخرة","رجب","شعبان","رمضان","شوال","ذو القعدة","ذو الحجة"];
const HIJRI_EN=["Muharram","Safar","Rabiʿ I","Rabiʿ II","Jumada I","Jumada II","Rajab","Shaʿban","Ramadan","Shawwal","Dhu al-Qaʿdah","Dhu al-Hijjah"];
const G_SUF = () => L(" م"," AD"), H_SUF = () => L(" هـ"," AH");
const gText = s => { const [y,m,d]=s.split("-").map(Number); return `${d} ${(lang==="en"?MONTHS_EN:MONTHS_AR)[m-1]} ${y}${G_SUF()}`; };
const hText = s => { const h=hijri(s); return h ? `${h.d} ${(lang==="en"?HIJRI_EN:HIJRI_AR)[h.m-1]} ${h.y}${H_SUF()}` : ""; };
/* plain text: both calendars, clearly labelled */
const fmtDate = s => s ? `${gText(s)} (${hText(s)})` : "";
/* HTML: Gregorian on top, Hijri underneath */
const fmtDual = s => s ? `<span class="dd"><span class="dg">${gText(s)}</span><span class="dh">${hText(s)}</span></span>` : "";
function hijriRange(month){
  const a=hijri(dayOf(month,1)), b=hijri(dayOf(month,dim(month))); if(!a||!b) return "";
  const N=lang==="en"?HIJRI_EN:HIJRI_AR;
  return a.y===b.y ? (a.m===b.m ? `${N[a.m-1]} ${a.y}${H_SUF()}` : `${N[a.m-1]} – ${N[b.m-1]} ${a.y}${H_SUF()}`) : `${N[a.m-1]} ${a.y} – ${N[b.m-1]} ${b.y}${H_SUF()}`;
}

/* ---------- Umm al-Qura calendar: Ramadan & official holidays ---------- */
const hijFmt = (()=>{ try{ return new Intl.DateTimeFormat("en-US-u-ca-islamic-umalqura",{day:"numeric",month:"numeric",year:"numeric"}); }catch(e){ return null; } })();
function hijri(s){
  if(!hijFmt) return null;
  const [y,m,d]=s.split("-").map(Number);
  const p={}; hijFmt.formatToParts(new Date(Date.UTC(y,m-1,d,12))).forEach(x=>{ if(x.type!=="literal") p[x.type]=parseInt(x.value,10); });
  return {y:p.year, m:p.month, d:p.day};
}
const HOLIDAY_NAMES = {
  founding:["يوم التأسيس","Founding Day"], national:["اليوم الوطني","National Day"],
  fitr:["عيد الفطر","Eid al-Fitr"], adha:["عيد الأضحى","Eid al-Adha"]
};
let calCache = {};
function calendarYear(year){
  if(calCache[year]) return calCache[year];
  const offs = (S.settings.main||{}).eidOffsets || {};
  const res = {}, groups = {};
  let cur = `${year-1}-11-01`; const end = `${year+1}-02-28`;
  while(cur <= end){
    const h = hijri(cur);
    if(h){
      let type=null;
      if(h.m===9) type="ramadan";
      else if(h.m===10 && h.d<=4) type="fitr";
      else if(h.m===12 && h.d>=9 && h.d<=12) type="adha";
      if(type){ const k=type+"-"+h.y; (groups[k]=groups[k]||[]).push(cur); }
    }
    cur = addDays(cur,1);
  }
  Object.entries(groups).forEach(([k,dates])=>{
    const off = Number(offs[k])||0, type=k.split("-")[0];
    dates.forEach(d=>{ const dd=addDays(d,off); if(dd.startsWith(year+"-")){ res[dd]=res[dd]||{}; if(type==="ramadan") res[dd].ramadan=true; else res[dd].hol=type; res[dd].key=k; } });
  });
  [[`${year}-02-22`,"founding"],[`${year}-09-23`,"national"]].forEach(([d,t])=>{ res[d]=res[d]||{}; res[d].hol=t; });
  calCache[year]=res; return res;
}
const calInfo = s => calendarYear(Number(s.slice(0,4)))[s] || {};
function holidayGroups(year){
  // list of movable groups touching this year, for the admin adjustment screen
  const out={}; const cal=calendarYear(year);
  Object.entries(cal).forEach(([d,v])=>{ if(v.key){ (out[v.key]=out[v.key]||[]).push(d); } });
  return Object.entries(out).map(([k,dates])=>({key:k,type:k.split("-")[0],hy:k.split("-")[1],from:dates.sort()[0],to:dates.sort().slice(-1)[0],count:dates.length}));
}

/* ---------- state ---------- */
const COLS = ["users","units","staff","schedules","requests","leaves","swaps","credits","plans","settings","audit"];
const S = {}; COLS.forEach(c=>S[c]={});
const UI = { tab:"dashboard", unit:null, month: todayStr().slice(0,7), brush:"M", ready:false, bellOpen:false, reqStaff:null, planYear:null, planEdit:null };
let ME = null; // {uid, ...user doc}
const pendingSched = new Set();
const CONFIG = window.FIREBASE_CONFIG || {};
const DEMO = !CONFIG.apiKey;
const ROLE_NAMES = { admin:["مدير النظام","System admin"], manager:["منجر","Manager"], head:["هيدنيرس","Head nurse"] };
const isAdmin = () => ME?.role==="admin";
const isMgr = () => ME?.role==="manager" || isAdmin();
const isHead = () => ME?.role==="head";
const roleName = r => { const n=ROLE_NAMES[r]; return n?L(n[0],n[1]):r; };

function toast(msg, bad){ const t=$("#toast"); t.textContent=msg; t.classList.toggle("bad",!!bad); t.classList.add("show"); clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove("show"),3200); }

/* ---------- data layer ---------- */
const LS_KEY = "roster-demo-v1";
const Local = {
  data:null, subs:[],
  load(){ try{ this.data=JSON.parse(localStorage.getItem(LS_KEY)||"null"); }catch(e){} if(!this.data){ this.data={}; } COLS.concat(["logins","meta"]).forEach(c=>this.data[c]=this.data[c]||{}); },
  persist(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(this.data)); }catch(e){} },
  emit(col){ this.subs.filter(s=>s.col===col).forEach(s=>s.cb(clone(this.data[col]))); },
  listen(col, units, cb){ const s={col,cb}; this.subs.push(s); cb(clone(this.data[col])); return ()=>{ this.subs=this.subs.filter(x=>x!==s); }; },
  async set(col,id,obj){ this.data[col][id]=clone(obj); this.persist(); this.emit(col); },
  async update(col,id,p){ this.data[col][id]={...(this.data[col][id]||{}),...clone(p)}; this.persist(); this.emit(col); },
  async del(col,id){ delete this.data[col][id]; this.persist(); this.emit(col); },
  async get(col,id){ return clone(this.data[col]?.[id]) || null; },
  async batch(ops){ ops.forEach(o=>{ if(o.op==="set") this.data[o.col][o.id]=clone(o.data); else if(o.op==="update") this.data[o.col][o.id]={...(this.data[o.col][o.id]||{}),...clone(o.data)}; else delete this.data[o.col][o.id]; }); this.persist(); [...new Set(ops.map(o=>o.col))].forEach(c=>this.emit(c)); }
};
let fdb=null;
const Remote = {
  listen(col, units, cb, opts){
    let ref = fdb.collection(col);
    if(opts?.order) ref = ref.orderBy(opts.order,"desc");
    if(opts?.limit) ref = ref.limit(opts.limit);
    const onErr = e => { console.warn(col,e); cb({}); };
    if(units===null) return ref.onSnapshot(snap=>{ const m={}; snap.forEach(d=>m[d.id]=d.data()); cb(m); }, onErr);
    if(Array.isArray(units) && !units.length){ cb({}); return ()=>{}; }
    if(typeof units==="string"){ return fdb.collection(col).doc(units).onSnapshot(d=>{ cb(d.exists?{[d.id]:d.data()}:{}); }, onErr); }
    const parts={}, unsubs=[];
    for(let i=0;i<units.length;i+=30){
      const chunk=units.slice(i,i+30), key=i;
      unsubs.push(fdb.collection(col).where("unitId","in",chunk).onSnapshot(snap=>{ const m={}; snap.forEach(d=>m[d.id]=d.data()); parts[key]=m; cb(Object.assign({},...Object.values(parts))); }, onErr));
    }
    return ()=>unsubs.forEach(u=>u());
  },
  set(col,id,obj){ return fdb.collection(col).doc(id).set(obj); },
  update(col,id,p){ return fdb.collection(col).doc(id).set(p,{merge:true}); },
  del(col,id){ return fdb.collection(col).doc(id).delete(); },
  async get(col,id){ const d=await fdb.collection(col).doc(id).get(); return d.exists?d.data():null; },
  async batch(ops){ for(let i=0;i<ops.length;i+=400){ const b=fdb.batch(); ops.slice(i,i+400).forEach(o=>{ const r=fdb.collection(o.col).doc(o.id); if(o.op==="set") b.set(r,o.data); else if(o.op==="update") b.set(r,o.data,{merge:true}); else b.delete(r); }); await b.commit(); } }
};
const DB = DEMO ? Local : Remote;

function writeErr(e){ console.error(e); toast(e?.code==="permission-denied" ? L("ليس لديك صلاحية لهذا الإجراء","You don't have permission for this action") : L("تعذّر الحفظ، تحققي من الاتصال وأعيدي المحاولة","Could not save. Check your connection and try again."), true); }
async function put(col,id,obj){ (S[col]=S[col]||{})[id]=obj; try{ await DB.set(col,id,obj); }catch(e){ writeErr(e); throw e; } }
async function patch(col,id,p){ S[col]=S[col]||{}; S[col][id]={...(S[col][id]||{}),...p}; try{ await DB.update(col,id,p); }catch(e){ writeErr(e); throw e; } }
async function remove(col,id){ delete S[col][id]; try{ await DB.del(col,id); }catch(e){ writeErr(e); throw e; } }
async function batch(ops){ try{ await DB.batch(ops); }catch(e){ writeErr(e); throw e; } }
function audit(action, details){
  if(!ME) return;
  const id = new Date().toISOString().replace(/[^0-9]/g,"").slice(0,17)+"_"+uid().slice(0,4);
  DB.set("audit", id, {at:new Date().toISOString(), by:ME.uid, byName:ME.name||"", action, details:details||""}).catch(()=>{});
}

/* ---------- auth ---------- */
const EMAIL_DOMAIN = "roster.app";
let subs = [];
function stopSubs(){ subs.forEach(u=>{ try{u();}catch(e){} }); subs=[]; }

async function bootAuth(){
  applyLang();
  if(DEMO){
    Local.load();
    if(!Object.keys(Local.data.users).length) seedDemo();
    const saved = (()=>{ try{ return localStorage.getItem("roster-demo-user"); }catch(e){ return null; } })();
    if(saved && Local.data.users[saved]) startSession(saved); else renderLogin();
    return;
  }
  firebase.initializeApp(CONFIG);
  fdb = firebase.firestore();
  firebase.auth().onAuthStateChanged(async u=>{
    stopSubs(); ME=null;
    if(!u){
      let setup=null; try{ setup=await Remote.get("meta","setup"); }catch(e){}
      if(!setup) renderSetup(); else renderLogin();
      return;
    }
    startSession(u.uid);
  });
}
function seedDemo(){
  const d=Local.data;
  d.users={ demoAdmin:{empNo:"1000",name:L("مدير النظام (تجريبي)","Admin (demo)"),role:"admin",units:[],active:true},
            demoMgr:{empNo:"2000",name:L("منجر (تجريبي)","Manager (demo)"),role:"manager",units:[],active:true},
            demoHead:{empNo:"3000",name:L("هيدنيرس (تجريبي)","Head nurse (demo)"),role:"head",units:[],active:true} };
  d.meta.setup={adminUid:"demoAdmin"};
  Local.persist();
}
function startSession(id){
  const unsub = DB.listen("users", DEMO?null:id, m=>{
    if(DEMO){ S.users=m; }
    const doc = m[id];
    if(!doc || doc.active===false){ renderBlocked(); return; }
    const first = !ME;
    ME = {uid:id, ...doc};
    if(doc.lang && doc.lang!==lang && first){ lang=doc.lang; applyLang(); }
    if(!DEMO && doc.mustChangePw){ renderChangePw(true); return; }
    if(first || !UI.ready){ startData(); } else render();
  });
  subs.push(unsub);
}
function startData(){
  const units = isAdmin() ? null : (ME.units||[]);
  let pending = 0; UI.ready=false;
  const done = ()=>{ if(--pending<=0 && !UI.ready){ UI.ready=true; initUIDefaults(); render(); } else if(UI.ready) render(); };
  const sub = (col, scope, opts) => { pending++; let firstHit=true; subs.push(DB.listen(col, scope, m=>{ if(col==="schedules") pendingSched.forEach(id=>{ if(S.schedules[id]) m[id]=S.schedules[id]; }); S[col]=m; if(col==="settings") calCache={}; if(firstHit){ firstHit=false; done(); } else render(); }, opts)); };
  sub("settings", null); sub("units", null);
  ["staff","schedules","requests","leaves","swaps","credits","plans"].forEach(c=>sub(c, units));
  if(isAdmin()){ if(!DEMO) sub("users", null); sub("audit", null, {order:"at", limit:300}); }
  setTimeout(()=>{ if(!UI.ready){ UI.ready=true; initUIDefaults(); render(); } }, 8000);
}
function initUIDefaults(){
  const mu = myUnits();
  if(!UI.unit || !mu.find(u=>u.id===UI.unit)) UI.unit = mu[0]?.id || null;
  const t=new Date(); if(t.getDate()>=10) UI.month = shiftMonth(todayStr().slice(0,7),1);
}
async function login(empNo, pw){
  empNo = String(empNo).trim();
  if(DEMO) return;
  const map = await Remote.get("logins", empNo).catch(()=>null);
  const email = map?.email || `${empNo}@${EMAIL_DOMAIN}`;
  await firebase.auth().signInWithEmailAndPassword(email, pw);
}
async function logout(){
  stopSubs(); ME=null; UI.ready=false; COLS.forEach(c=>S[c]={});
  if(DEMO){ try{ localStorage.removeItem("roster-demo-user"); }catch(e){} renderLogin(); return; }
  await firebase.auth().signOut();
}
/* Admin creates an account without being signed out (secondary app instance) */
async function createAccount({empNo,name,role,units,password,email:realEmail}){
  empNo=String(empNo).trim(); realEmail=(realEmail||"").trim().toLowerCase();
  if(DEMO){
    const id="u_"+uid();
    await put("users", id, {empNo,name,role,units,email:realEmail,active:true,mustChangePw:true,createdAt:new Date().toISOString()});
    return id;
  }
  const sec = firebase.apps.find(a=>a.name==="secondary") || firebase.initializeApp(CONFIG,"secondary");
  let email = realEmail || `${empNo}@${EMAIL_DOMAIN}`, cred;
  try{ cred = await sec.auth().createUserWithEmailAndPassword(email,password); }
  catch(e){
    if(e.code!=="auth/email-already-in-use" || realEmail) throw e;
    email = `${empNo}.r${Date.now().toString(36)}@${EMAIL_DOMAIN}`;
    cred = await sec.auth().createUserWithEmailAndPassword(email,password);
  }
  const newUid = cred.user.uid;
  await sec.auth().signOut();
  await put("users", newUid, {empNo,name,role,units,email:realEmail,active:true,mustChangePw:true,createdAt:new Date().toISOString()});
  await put("logins", empNo, {email});
  return newUid;
}

const isRealEmail = e => !!e && !String(e).toLowerCase().endsWith("@"+EMAIL_DOMAIN);
const maskEmail = e => { const [u,d]=String(e).split("@"); return (u.length<=2?u[0]+"*":u.slice(0,2)+"*".repeat(Math.min(6,u.length-2)))+"@"+d; };
/* Send Firebase's password-reset link to the account's real e-mail */
async function sendReset(empNo){
  empNo=String(empNo).trim();
  const map = await Remote.get("logins", empNo).catch(()=>null);
  if(!map || !isRealEmail(map.email)) return {ok:false, reason:"noemail"};
  try{ firebase.auth().languageCode = lang; }catch(e){}
  await firebase.auth().sendPasswordResetEmail(map.email);
  return {ok:true, email:map.email};
}

/* =========================================================
   Part 2: domain model, analysis, smart distribution
   ========================================================= */
const TEMPLATES = {
  "12": { L:4, O:3, mins:{M:3,N:2}, shifts:[
    {code:"M", ar:"صباحي", en:"Morning", start:"07:00", end:"19:00", hours:12, color:"#D98E1C", night:false},
    {code:"N", ar:"ليلي",  en:"Night",   start:"19:00", end:"07:00", hours:12, color:"#3A4C9A", night:true} ],
    ramadan:{M:{start:"09:00",end:"15:00",hours:6}, N:{start:"21:00",end:"03:00",hours:6}} },
  "9": { L:5, O:2, mins:{M:3,E:2,N:2}, shifts:[
    {code:"M", ar:"صباحي", en:"Morning", start:"07:00", end:"16:00", hours:9, color:"#D98E1C", night:false},
    {code:"E", ar:"مسائي", en:"Evening", start:"15:00", end:"00:00", hours:9, color:"#2B8A8A", night:false},
    {code:"N", ar:"ليلي",  en:"Night",   start:"23:00", end:"08:00", hours:9, color:"#3A4C9A", night:true} ],
    ramadan:{M:{start:"09:00",end:"15:00",hours:6}, E:{start:"15:00",end:"21:00",hours:6}, N:{start:"21:00",end:"03:00",hours:6}} }
};
const SYSTEM_NAMES = {"12":["12 ساعة — 4 أيام دوام / 3 أوف","12 hours — 4 on / 3 off"], "9":["9 ساعات — 5 أيام دوام / 2 أوف","9 hours — 5 on / 2 off"]};
const DEFAULT_TITLES = [
  {id:"hn",   ar:"هيدنيرس",           en:"Head Nurse",              cat:"other", fixed:true, fixedHours:9},
  {id:"sn",   ar:"ستاف نيرس",        en:"Staff Nurse",             cat:"counted"},
  {id:"pct",  ar:"فني رعاية مرضى",   en:"Patient Care Technician", cat:"assist"},
  {id:"na",   ar:"مساعد تمريض",      en:"Nursing Assistant",       cat:"assist"},
  {id:"ort",  ar:"فني عمليات",       en:"OR Technician",           cat:"other"},
  {id:"coord",ar:"منسق",             en:"Coordinator",             cat:"other"}
];
const CAT_NAMES = {counted:["محسوب في الحد الأدنى","Counted toward minimum"], assist:["مساعد (حد أدنى خاص)","Assistant (own minimum)"], other:["غير محسوب","Not counted"]};
const DEFAULT_DEADLINES = {requests:15, submit:20, final:25};
/* bal = which balance the leave deducts from (none = not deducted) */
const LEAVE_TYPES = {
  annual:     {ar:"سنوية",               en:"Annual",                     code:"AL", bal:"annual", color:"#2E8B73"},
  comp:       {ar:"تعويضية",             en:"Compensatory",               code:"CL", bal:"comp",   color:"#7550AA"},
  maternity:  {ar:"وضع (12 أسبوع)",      en:"Maternity (12 weeks)",       code:"ML", fixed:84,     color:"#C2577A"},
  bereavement:{ar:"وفاة",                en:"Bereavement",                code:"DL",               color:"#5B6573"},
  exceptional:{ar:"استثنائية",           en:"Exceptional",                code:"XL",               color:"#8A6D3B"},
  study:      {ar:"دراسية",              en:"Study",                      code:"SL",               color:"#3C7EA6"},
  /* training courses: the person is away from the unit, nothing is deducted */
  bls:        {ar:"دورة BLS",            en:"BLS course",                 code:"BLS", train:true,  color:"#C0392B"},
  acls:       {ar:"دورة ACLS",           en:"ACLS course",                code:"ACLS",train:true,  color:"#A93226"},
  pals:       {ar:"دورة PALS",           en:"PALS course",                code:"PALS",train:true,  color:"#922B21"}
};
const LEAVE_BY_CODE = {}; Object.values(LEAVE_TYPES).forEach(t=>LEAVE_BY_CODE[t.code]=t);
const leaveName = k => { const t=LEAVE_TYPES[k]; return t?L(t.ar,t.en):k; };
const BAL_NAMES = {annual:["سنوية","Annual"], comp:["تعويضية","Comp"], ramadan:["ساعات رمضان","Ramadan hours"]};
const DAY_BALS = ["annual","comp"];
const HOL_BALS = ["comp"];
/* working on any official holiday (Eids, National Day, Founding Day) credits compensatory days */
const holBalance = () => "comp";
/* Official holidays: a person who is off that day shows the holiday code instead of OFF */
const HOL_DAY_CODES = {
  fitr:{code:"EL", ar:"إجازة عيد الفطر", en:"Eid al-Fitr holiday", color:"#B0457E"},
  adha:{code:"HL", ar:"إجازة عيد الأضحى", en:"Eid al-Adha holiday", color:"#8C3B5E"},
  national:{code:"ND", ar:"اليوم الوطني", en:"National Day", color:"#1E7A46"},
  founding:{code:"FD", ar:"يوم التأسيس", en:"Founding Day", color:"#7A5A2E"} };
const holDayCode = (date, v) => { if(v && v!=="OFF") return null; return HOL_DAY_CODES[calInfo(date).hol] || null; };
const ST_NAMES = {
  draft:["مسودة","Draft"], submitted:["مرفوع للاعتماد","Submitted"], returned:["معاد للتعديل","Returned"], approved:["معتمد","Approved"],
  prelim:["موافقة مبدئية","Initial approval"], rejected:["مرفوض","Rejected"], none:["لم يبدأ","Not started"]
};
const stName = k => { const n=ST_NAMES[k]; return n?L(n[0],n[1]):k; };

const settings = () => {
  const m = S.settings.main || {};
  return { titles: (m.titles&&m.titles.length)?m.titles:DEFAULT_TITLES, deadlines:{...DEFAULT_DEADLINES, ...(m.deadlines||{})}, eidOffsets:m.eidOffsets||{} };
};
const titleById = id => settings().titles.find(t=>t.id===id);
const titleName = s => { const t=titleById(s?.titleId); return t?L(t.ar,t.en||t.ar):(s?.titleText||""); };
const catOf = s => titleById(s?.titleId)?.cat || "counted";
/* fixed-schedule titles (e.g. head nurse): morning, Sunday–Thursday, off on Fri/Sat and official holidays */
const isFixed = s => !!titleById(s?.titleId)?.fixed;
const CAT_ORDER = {counted:0, assist:1, other:2};
const unitName = id => { const u=S.units[id]; return u ? L(u.name, u.nameEn||u.name) : "—"; };
const shiftName = sh => L(sh.ar, sh.en||sh.ar);

function unitCfg(unitId){
  const u = S.units[unitId] || {};
  const system = u.system || "12", t = TEMPLATES[system] || TEMPLATES["12"];
  const shifts = (u.shifts&&u.shifts.length) ? u.shifts : t.shifts;
  const byCode = {}; shifts.forEach(s=>byCode[s.code]=s);
  return { system, shifts, byCode, mins:u.mins||t.mins, assistMin: u.assistMin ?? 1, rest: Number(u.restAfterNight ?? 1),
    ramadanApply: !!u.ramadanApply, ramadan: u.ramadan || t.ramadan || {} };
}
const patternOf = (s, unitId) => { const sys = s.system || S.units[unitId]?.system || "12"; const t=TEMPLATES[sys]||TEMPLATES["12"]; return {L:t.L, O:t.O, sys}; };
const myUnits = () => Object.entries(S.units).map(([id,u])=>({id,...u})).filter(u=>isAdmin() || (ME?.units||[]).includes(u.id)).sort((a,b)=>unitName(a.id).localeCompare(unitName(b.id), lang));
const staffOf = (unitId, all) => Object.entries(S.staff).map(([id,s])=>({id,...s})).filter(s=>s.unitId===unitId && (all || s.active!==false))
  .sort((a,b)=>CAT_ORDER[catOf(a)]-CAT_ORDER[catOf(b)] || (a.name||"").localeCompare(b.name||"", lang));
const schedId = (unit,month) => `${unit}_${month}`;

function leaveMap(sids, month){
  const n=dim(month), map={}; sids.forEach(id=>map[id]={});
  /* annual leave plan first; an actual leave on the same day replaces it */
  Object.values(S.plans||{}).forEach(p=>{
    if(!map[p.staffId]) return;
    for(let d=1; d<=n; d++){ const s=dayOf(month,d); if(s>=p.from && s<=p.to) map[p.staffId][d]={code:"AL", plan:true}; }
  });
  Object.values(S.leaves).forEach(l=>{
    if(!map[l.staffId] || !(l.status==="prelim"||l.status==="approved")) return;
    for(let d=1; d<=n; d++){ const s=dayOf(month,d); if(s>=l.from && s<=l.to) map[l.staffId][d]={code:LEAVE_TYPES[l.type].code, tent:l.status!=="approved"}; }
  });
  return map;
}
function reqFor(unitId, month){
  const out={};
  Object.values(S.requests).forEach(r=>{
    if(r.unitId!==unitId || r.month!==month) return;
    out[r.staffId] = { off:new Set(r.off||[]), pref:r.pref||"", fullNights:!!r.fullNights,
      noNight:(r.noNightFrom&&r.noNightTo)?[Number(r.noNightFrom),Number(r.noNightTo)]:null, note:r.note||"" };
  });
  return out;
}
const inNoNight = (rq,d) => rq?.noNight && d>=rq.noNight[0] && d<=rq.noNight[1];

/* normal shift length for this person: fixed-schedule titles have their own hours (head nurse = 9) */
function baseHours(c, s, code){ const sh=c.byCode[code]; if(!sh) return 0; const t=titleById(s?.titleId); return t?.fixed ? (Number(t.fixedHours)||9) : (Number(sh.hours)||0); }
function workHours(c, s, dateStr, code){
  if(!c.byCode[code]) return 0;
  if(calInfo(dateStr).ramadan && s.ramadanReduced && c.ramadanApply) return Number(c.ramadan[code]?.hours ?? 6);
  return baseHours(c,s,code);
}
function ramadanExtra(c, s, dateStr, code){
  if(!c.byCode[code]) return 0;
  if(calInfo(dateStr).ramadan && s.ramadanReduced && !c.ramadanApply) return Math.max(0,baseHours(c,s,code)-6);
  return 0;
}
function restViolation(get, d, code, rest, isN, isW){
  if(!rest || !isW(code)) return false;
  if(!isN(code)){ for(let k=1;k<=rest;k++) if(isN(get(d-k))) return true; }
  else { for(let k=1;k<=rest;k++){ const nx=get(d+k); if(isW(nx)&&!isN(nx)) return true; if(isN(nx)) break; } }
  return false;
}

/* ---------- analysis ---------- */
function analyze(unitId, month, gridOverride){
  const c=unitCfg(unitId), n=dim(month), staff=staffOf(unitId);
  const sch=S.schedules[schedId(unitId,month)];
  const grid = gridOverride || sch?.grid || {};
  const lv=leaveMap(staff.map(s=>s.id), month), req=reqFor(unitId, month);
  const isW=code=>!!c.byCode[code], isN=code=>!!c.byCode[code]?.night;
  const issues=[], bad={}, per={};
  const cov={counted:{},assist:{}};
  for(let d=1; d<=n; d++){ cov.counted[d]={}; cov.assist[d]={}; c.shifts.forEach(sh=>{ cov.counted[d][sh.code]=0; cov.assist[d][sh.code]=0; }); }
  const flag=(sid,d)=>{ (bad[sid]=bad[sid]||{})[d]=1; };
  const hasGrid = Object.keys(grid).length>0;
  staff.forEach(s=>{
    const P=patternOf(s,unitId), cat=catOf(s), rq=req[s.id];
    const cell=d=> d<1||d>n ? "" : (lv[s.id][d]?.code || grid[s.id]?.[d] || "");
    let h=0, wd=0, hol=0, ram=0, run=0; const lvOver=[], holBy={comp:0}, holNames=new Set();
    for(let d=1; d<=n; d++){
      const v=cell(d), date=dayOf(month,d);
      if(isW(v)){
        wd++; h+=workHours(c,s,date,v); ram+=ramadanExtra(c,s,date,v); const hl=calInfo(date).hol; if(hl){ hol++; holBy[holBalance(hl)]++; holNames.add(hl); }
        if(cov[cat]) cov[cat][d][v]++;
        run++;
        if(run===P.L+1 && !isFixed(s)){ issues.push({sev:2,sid:s.id,msg:L(`${s.name}: أكثر من ${P.L} أيام دوام متتالية (يوم ${d})`,`${s.name}: more than ${P.L} consecutive shifts (day ${d})`)}); flag(s.id,d); }
        if(!isN(v) && restViolation(cell,d,v,c.rest,isN,isW)){ issues.push({sev:2,sid:s.id,msg:L(`${s.name}: ${shiftName(c.byCode[v])} بعد ليلي بدون راحة (يوم ${d})`,`${s.name}: ${shiftName(c.byCode[v])} right after night without rest (day ${d})`)}); flag(s.id,d); }
        if(isN(v) && (s.nightOk===false || inNoNight(rq,d))){ issues.push({sev:2,sid:s.id,msg:L(`${s.name}: ليلي رغم أنه ممنوع من الليلي (يوم ${d})`,`${s.name}: night shift although excluded from nights (day ${d})`)}); flag(s.id,d); }
        if(rq?.off?.has(d)){ issues.push({sev:1,sid:s.id,msg:L(`${s.name}: مجدول دوام في يوم طلبه أوف (يوم ${d})`,`${s.name}: scheduled on a requested day off (day ${d})`)}); flag(s.id,d); }
        const prev=cell(d-1); if(!isFixed(s) && isW(prev) && prev!==v && !lv[s.id][d-1]) issues.push({sev:1,sid:s.id,msg:L(`${s.name}: تغيّرت المناوبة داخل نفس البلوك (يوم ${d})`,`${s.name}: shift changes inside the same block (day ${d})`)});
      } else run=0;
      if(lv[s.id][d] && isW(grid[s.id]?.[d])) lvOver.push(d);
    }
    if(lvOver.length) issues.push({sev:1,sid:s.id,msg:L(`${s.name}: إجازة على أيام مجدولة دوام (${lvOver.join("، ")}) — يحتاج القسم تغطية بديلة`,`${s.name}: leave falls on scheduled shifts (${lvOver.join(", ")}) — cover may be needed`)});
    // weekly pattern check (full Sun–Sat weeks inside the month)
    if(hasGrid && grid[s.id] && !isFixed(s)) for(let d=1; d+6<=n; d++){
      if(weekday(dayOf(month,d))!==0) continue;
      let w=0, lvd=0, offReq=0;
      for(let k=d;k<d+7;k++){ if(lv[s.id][k]) lvd++; else if(isW(cell(k))) w++; if(rq?.off?.has(k)) offReq++; }
      if(w+lvd+offReq < P.L || w > P.L) issues.push({sev:1,sid:s.id,msg:L(`${s.name}: أسبوع ${d}–${d+6}: ${w} أيام دوام بدل ${P.L}`,`${s.name}: week ${d}–${d+6}: ${w} working days instead of ${P.L}`)});
    }
    per[s.id]={hours:h, days:wd, hol, holBy, holNames:[...holNames], ram};
  });
  const assistCount = staff.filter(s=>catOf(s)==="assist").length;
  if(hasGrid){
    for(let d=1; d<=n; d++) c.shifts.forEach(sh=>{
      const m=Number(c.mins[sh.code])||0, v=cov.counted[d][sh.code];
      if(v<m) issues.push({sev:3,msg:L(`يوم ${d}: نقص ستاف نيرس في ${shiftName(sh)} (${v} من ${m})`,`Day ${d}: staff nurse shortage on ${shiftName(sh)} (${v} of ${m})`)});
      if(assistCount && cov.assist[d][sh.code]<c.assistMin) issues.push({sev:2,msg:L(`يوم ${d}: لا يوجد مساعد في ${shiftName(sh)}`,`Day ${d}: no assistant on ${shiftName(sh)}`)});
    });
    if(!assistCount && staff.length) issues.push({sev:1,msg:L("لا يوجد مساعدين مسجلين في هذا القسم","No assistants registered in this unit")});
  }
  issues.sort((a,b)=>b.sev-a.sev);
  return {c,n,staff,lv,req,grid,issues,bad,per,cov,assistCount};
}

/* ---------- smart distribution ----------
   Block-based: each person works blocks of L days of ONE shift, then O days off
   (12h: 4 on / 3 off, 9h: 5 on / 2 off). Phases are staggered to balance daily
   coverage; shifts are assigned per block to fill minimums fairly.          */
function generate(unitId, month){
  const c=unitCfg(unitId), n=dim(month), staff=staffOf(unitId);
  const ids=staff.map(s=>s.id), lv=leaveMap(ids,month), req=reqFor(unitId,month);
  const prevM=shiftMonth(month,-1), pn=dim(prevM), prevGrid=S.schedules[schedId(unitId,prevM)]?.grid||{}, prevLv=leaveMap(ids,prevM);
  const isW=code=>!!c.byCode[code], isN=code=>!!c.byCode[code]?.night;
  const minFor=(g,code)=> g==="counted" ? (Number(c.mins[code])||0) : g==="assist" ? c.assistMin : 0;
  const blocked=(s,d)=> !!lv[s.id][d] || !!req[s.id]?.off?.has(d);
  const fixedStaff=staff.filter(isFixed), rotating=staff.filter(s=>!isFixed(s));
  const morning=(c.shifts.find(x=>!x.night)||c.shifts[0]).code;
  const groups={counted:[],assist:[],other:[]}; rotating.forEach(s=>groups[catOf(s)].push(s));
  const info={};
  const rnd=()=>Math.random();

  // 1) phases
  Object.entries(groups).forEach(([g,list])=>{
    const target=Array(n+1).fill(0); for(let d=1;d<=n;d++) c.shifts.forEach(sh=>target[d]+=minFor(g,sh.code));
    const working=Array(n+1).fill(0);
    const free=[];
    list.forEach(s=>{
      const P=patternOf(s,unitId), C=P.L+P.O, pg=prevGrid[s.id];
      const it={L:P.L,O:P.O,C,phase:null,prevShift:"",prevEnd:-99};
      if(pg && Object.keys(pg).length){
        let t=pn, wk=0;
        while(t>=1 && isW(pg[t]) && !prevLv[s.id][t]){ wk++; t--; }
        if(wk>0){ it.phase = wk<P.L ? wk : P.L; it.prevShift=pg[pn]; it.prevEnd=0; }
        else { let j=0; t=pn; while(t>=1 && !isW(pg[t])){ j++; t--; }
          if(t>=1){ it.phase = (j>=P.O) ? 0 : (P.L+j)%C; it.prevShift=pg[t]; it.prevEnd=-j; } }
      }
      info[s.id]=it;
      if(it.phase===null) free.push(s);
      else for(let d=1;d<=n;d++) if(((d-1+it.phase)%C)<it.L && !blocked(s,d)) working[d]++;
    });
    free.sort((a,b)=>((req[b.id]?.off?.size||0)-(req[a.id]?.off?.size||0)) || rnd()-0.5);
    free.forEach(s=>{
      const it=info[s.id]; let best=null, bestCost=Infinity;
      for(let p=0;p<it.C;p++){
        let cost=0;
        for(let d=1;d<=n;d++){
          const w = ((d-1+p)%it.C)<it.L;
          if(w && req[s.id]?.off?.has(d)) cost+=25;
          const add = (w && !blocked(s,d)) ? 1 : 0;
          if(target[d]>0) cost += (working[d]+add-target[d])**2 - (working[d]-target[d])**2;
          else cost += add*working[d]*0.2;
        }
        cost += rnd()*0.5;
        if(cost<bestCost){ bestCost=cost; best=p; }
      }
      it.phase=best;
      for(let d=1;d<=n;d++) if(((d-1+best)%it.C)<it.L && !blocked(s,d)) working[d]++;
    });
  });

  // 2) blocks
  const blocks=[];
  rotating.forEach(s=>{
    const it=info[s.id]; let cur=null;
    for(let d=1; d<=n; d++){
      const w=((d-1+it.phase)%it.C)<it.L && !blocked(s,d);
      if(w){ if(!cur){ cur={s, g:catOf(s), start:d, days:[]}; blocks.push(cur); } cur.days.push(d); cur.end=d; }
      else cur=null;
    }
    const first=blocks.find(b=>b.s===s && b.start===1);
    if(first && it.prevEnd===0 && isW(it.prevShift)) first.cont=it.prevShift;
  });

  // 3) shift per block
  const cov={counted:{},assist:{},other:{}};
  for(let d=1;d<=n;d++) ["counted","assist","other"].forEach(g=>{ cov[g][d]={}; c.shifts.forEach(sh=>cov[g][d][sh.code]=0); });
  const nights={}, last={}, worked={};
  const nightSlots=c.shifts.filter(x=>x.night).reduce((a,x)=>a+(Number(c.mins[x.code])||0),0), allSlots=c.shifts.reduce((a,x)=>a+(Number(c.mins[x.code])||0),0);
  const share = allSlots ? nightSlots/allSlots : 0;
  rotating.forEach(s=>{ nights[s.id]=0; worked[s.id]=0; last[s.id]={code:info[s.id].prevShift, end:info[s.id].prevEnd}; });
  const allowedFor=(b,code,prevB,nextB)=>{
    const s=b.s, rq=req[s.id], sh=c.byCode[code];
    if(sh.night && (s.nightOk===false || b.days.some(d=>inNoNight(rq,d)))) return false;
    if(prevB && isN(prevB.code) && !sh.night && (b.start-prevB.end-1)<c.rest) return false;
    if(nextB && sh.night && nextB.code && !isN(nextB.code) && (nextB.start-b.end-1)<c.rest) return false;
    return true;
  };
  blocks.sort((a,b)=>a.start-b.start || rnd()-0.5);
  blocks.forEach(b=>{
    const s=b.s, rq=req[s.id], lastB = last[s.id].code ? {code:last[s.id].code, end:last[s.id].end} : null;
    let opts=c.shifts.filter(sh=>allowedFor(b,sh.code,lastB,null)).map(sh=>sh.code);
    if(!opts.length) opts=c.shifts.filter(sh=>!sh.night).map(sh=>sh.code);
    let pick;
    if(b.cont && opts.includes(b.cont)) pick=b.cont;
    else if(rq?.fullNights && opts.some(isN)) pick=opts.find(isN);
    else if(b.g==="other") pick = (rq?.pref && opts.includes(rq.pref)) ? rq.pref : (opts.find(x=>!isN(x)) || opts[0]);
    else {
      let best=-Infinity;
      opts.forEach(code=>{
        let deficit=0, load=0;
        b.days.forEach(d=>{ deficit+=Math.max(0, minFor(b.g,code)-cov[b.g][d][code]); load+=cov[b.g][d][code]-minFor(b.g,code); });
        let sc = deficit*10 - (deficit===0 ? load*0.6 : 0);
        const bal = nights[s.id] - share*worked[s.id];   // >0: has had more nights than fair share
        sc += isN(code) ? -bal*2.5 : bal*2.5;
        if(rq?.pref===code) sc += 8;
        sc += rnd()*0.4;
        if(sc>best){ best=sc; pick=code; }
      });
    }
    b.code=pick;
    b.days.forEach(d=>cov[b.g][d][pick]++);
    if(isN(pick)) nights[s.id]+=b.days.length;
    worked[s.id]+=b.days.length;
    last[s.id]={code:pick, end:b.end};
  });

  // 4) repair shortages by switching whole blocks from over-covered shifts
  const byStaff={}; blocks.forEach(b=>(byStaff[b.s.id]=byStaff[b.s.id]||[]).push(b)); Object.values(byStaff).forEach(a=>a.sort((x,y)=>x.start-y.start));
  for(let pass=0; pass<4; pass++){
    let changed=false;
    ["counted","assist"].forEach(g=>{
      for(let d=1; d<=n; d++) c.shifts.forEach(sh=>{
        let need=minFor(g,sh.code)-cov[g][d][sh.code];
        while(need>0){
          const cand=blocks.filter(b=>b.g===g && b.code!==sh.code && b.days.includes(d) && !(b.cont) && !(req[b.s.id]?.fullNights && isN(b.code))
            && b.days.every(x=>cov[g][x][b.code]-1>=minFor(g,b.code)));
          let done=false;
          for(const b of cand.sort(()=>rnd()-0.5)){
            const arr=byStaff[b.s.id], i=arr.indexOf(b);
            const prevB = i>0 ? arr[i-1] : (isW(info[b.s.id].prevShift) ? {code:info[b.s.id].prevShift,end:info[b.s.id].prevEnd} : null);
            if(!allowedFor(b, sh.code, prevB, arr[i+1])) continue;
            b.days.forEach(x=>{ cov[g][x][b.code]--; cov[g][x][sh.code]++; });
            b.code=sh.code; done=true; changed=true; break;
          }
          if(!done) break; need--;
        }
      });
    });
    if(!changed) break;
  }

  // 5) grid
  const grid={};
  staff.forEach(s=>{ grid[s.id]={}; for(let d=1; d<=n; d++) if(!lv[s.id][d]) grid[s.id][d]="OFF"; });
  blocks.forEach(b=>b.days.forEach(d=>grid[b.s.id][d]=b.code));
  fixedStaff.forEach(s=>{ for(let d=1; d<=n; d++){ if(lv[s.id][d]) continue; const date=dayOf(month,d), wd=weekday(date);
    grid[s.id][d] = (wd<=4 && !calInfo(date).hol && !req[s.id]?.off?.has(d)) ? morning : "OFF"; } });
  return grid;
}

/* ---------- balances & automatic credits ---------- */
function balances(sid){
  const s=S.staff[sid]||{};
  const b={annual:Number(s.annualOpening)||0, comp:Number(s.compOpening)||0, fitr:0, adha:0, ramadan:0, pending:0};
  Object.values(S.credits).forEach(c=>{ if(c.staffId!==sid) return; if(c.type==="ramadan") b.ramadan+=Number(c.hours)||0; else if(c.type in b) b[c.type]+=Number(c.days)||0; });
  Object.values(S.leaves).forEach(l=>{ if(l.staffId!==sid) return; const k=LEAVE_TYPES[l.type]?.bal; if(!k) return;
    if(l.status==="approved") b[k]-=Number(l.days)||0;
    if(l.status==="prelim") b.pending+=Number(l.days)||0; });
  return b;
}
async function autoCredits(unitId, month){
  const A=analyze(unitId, month), ops=[];
  A.staff.forEach(s=>{
    const p=A.per[s.id], rid=`auto_ram_${unitId}_${month}_${s.id}`;
    ["fitr","adha"].forEach(k=>{ const old=`auto_hol_${k}_${unitId}_${month}_${s.id}`; if(S.credits[old]) ops.push({op:"del",col:"credits",id:old}); });
    const hid=`auto_hol_${unitId}_${month}_${s.id}`;
    if(p.holBy.comp>0) ops.push({op:"set",col:"credits",id:hid,data:{staffId:s.id,unitId,type:"comp",days:p.holBy.comp,auto:"holiday",holidays:p.holNames,month,reason:"عمل في عطلة رسمية",date:todayStr()}});
    else if(S.credits[hid]) ops.push({op:"del",col:"credits",id:hid});
    if(p.ram>0) ops.push({op:"set",col:"credits",id:rid,data:{staffId:s.id,unitId,type:"ramadan",hours:p.ram,auto:"ramadan",month,reason:"ساعات زيادة في رمضان",date:todayStr()}});
    else if(S.credits[rid]) ops.push({op:"del",col:"credits",id:rid});
  });
  if(ops.length) await batch(ops);
}
function applySwapToGrids(sw){
  const changed=[];
  let m=sw.from.slice(0,7);
  while(m<=sw.to.slice(0,7)){
    const id=schedId(sw.unitId,m), sch=S.schedules[id];
    if(sch){
      const g=clone(sch.grid||{}); g[sw.a]=g[sw.a]||{}; g[sw.b]=g[sw.b]||{};
      for(let d=1; d<=dim(m); d++){ const date=dayOf(m,d); if(date<sw.from||date>sw.to) continue; const t=g[sw.a][d]; g[sw.a][d]=g[sw.b][d]; g[sw.b][d]=t; if(g[sw.a][d]===undefined) delete g[sw.a][d]; if(g[sw.b][d]===undefined) delete g[sw.b][d]; }
      changed.push({id,m,grid:g});
    }
    m=shiftMonth(m,1);
  }
  return changed;
}
function deadlinesFor(month){
  const dl=settings().deadlines, pm=shiftMonth(month,-1), cap=d=>dayOf(pm, Math.min(Number(d)||1, dim(pm)));
  return {requests:cap(dl.requests), submit:cap(dl.submit), final:cap(dl.final)};
}
const requestsOpen = month => todayStr() <= deadlinesFor(month).requests;

/* =========================================================
   Part 3: shell, sign-in screens, dashboard, roster grid
   ========================================================= */
const app = () => $("#app");
const LOGO = `<div class="mark" aria-hidden="true">${"<i></i>".repeat(9)}</div>`;
const WAVES = `<svg class="waves" viewBox="0 0 1200 160" preserveAspectRatio="none" aria-hidden="true"><path d="M0 92 C 180 40, 360 140, 600 88 S 1020 30, 1200 84" /><path d="M0 120 C 220 70, 420 160, 640 112 S 1040 60, 1200 110" /><path d="M0 60 C 200 20, 400 110, 620 62 S 1000 10, 1200 56" /></svg>`;
const langBtn = () => `<button class="btn ghost small" data-act="lang">${lang==="en"?"العربية":"English"}</button>`;

function authFrame(inner){
  app().innerHTML = `<div class="auth">${WAVES}
    <section class="auth-hero">${LOGO}
      <h1>${L("جداول التمريض","Nursing Roster")}</h1>
      <p>${L("المناوبات، الإجازات، والاعتمادات — في مكان واحد لكل أقسام التمريض.","Shifts, leave and approvals — one place for every nursing unit.")}</p>
      <ul class="hero-points"><li>${L("توزيع ذكي يلتزم بنظام الدوام والراحة","Smart distribution that respects patterns and rest")}</li><li>${L("التاريخ الهجري والميلادي معاً","Hijri and Gregorian dates together")}</li><li>${L("موافقة الهيدنيرس ثم اعتماد المنجر","Head nurse first, then manager approval")}</li></ul>
    </section>
    <div class="auth-card">${inner}<div class="auth-foot">${langBtn()}</div></div></div>`;
}
function renderLogin(){
  if(DEMO){
    const us=Object.entries(Local.data.users).filter(([,u])=>u.active!==false);
    authFrame(`<div class="demo-note">${L("وضع تجريبي: البيانات محفوظة على هذا الجهاز فقط. بعد ربط Firebase يصير الدخول بالرقم الوظيفي وكلمة المرور.","Demo mode: data stays on this device. Once Firebase is connected, sign-in uses employee number and password.")}</div>
      <p class="muted">${L("ادخلي كـ:","Sign in as:")}</p>
      <div class="stack">${us.map(([id,u])=>`<button class="btn block" data-act="demoLogin" data-id="${id}"><b>${esc(u.name)}</b><span class="muted">${roleName(u.role)} · ${esc(u.empNo)}</span></button>`).join("")}</div>`);
    return;
  }
  authFrame(`<form class="form" id="loginForm">
      <label>${L("الرقم الوظيفي","Employee number")}<input class="field" name="emp" inputmode="numeric" autocomplete="username" required></label>
      <label>${L("كلمة المرور","Password")}<input class="field" name="pw" type="password" autocomplete="current-password" required></label>
      <p class="err" id="loginErr"></p>
      <button class="btn primary block" type="submit">${L("دخول","Sign in")}</button>
      <button class="btn ghost block" type="button" data-act="forgot">${L("نسيت كلمة المرور؟","Forgot password?")}</button>
    </form>`);
  $("#loginForm").addEventListener("submit", async e=>{
    e.preventDefault(); const f=new FormData(e.target), btn=e.target.querySelector("button[type=submit]");
    btn.disabled=true; $("#loginErr").textContent="";
    try{ await login(f.get("emp"), f.get("pw")); }
    catch(err){ $("#loginErr").textContent = L("الرقم الوظيفي أو كلمة المرور غير صحيحة","Incorrect employee number or password"); btn.disabled=false; }
  });
}
function renderSetup(){
  authFrame(`<h2>${L("الإعداد لأول مرة","First-time setup")}</h2>
    <p class="muted">${L("أنشئي حساب مدير النظام. هذه الشاشة تظهر مرة واحدة فقط.","Create the system admin account. This screen appears only once.")}</p>
    <form class="form" id="setupForm">
      <label>${L("الرقم الوظيفي","Employee number")}<input class="field" name="emp" required></label>
      <label>${L("الاسم","Name")}<input class="field" name="name" required></label>
      <label>${L("إيميل العمل (لاستعادة كلمة المرور)","Work e-mail (for password recovery)")}<input class="field" name="email" type="email" dir="ltr" required></label>
      <label>${L("كلمة المرور (8 أحرف على الأقل)","Password (min 8 characters)")}<input class="field" name="pw" type="password" minlength="8" required></label>
      <p class="err" id="setupErr"></p>
      <button class="btn primary block" type="submit">${L("إنشاء حساب المدير","Create admin account")}</button>
    </form>`);
  $("#setupForm").addEventListener("submit", async e=>{
    e.preventDefault(); const f=new FormData(e.target), emp=String(f.get("emp")).trim(), email=String(f.get("email")).trim().toLowerCase();
    try{
      const cred = await firebase.auth().createUserWithEmailAndPassword(email, f.get("pw"));
      const id=cred.user.uid;
      await fdb.collection("meta").doc("setup").set({adminUid:id, at:new Date().toISOString()});
      await fdb.collection("users").doc(id).set({empNo:emp, name:String(f.get("name")).trim(), role:"admin", units:[], email, active:true, mustChangePw:false});
      await fdb.collection("logins").doc(emp).set({email});
      location.reload();
    }catch(err){ $("#setupErr").textContent = (err.message||String(err)); }
  });
}
function renderBlocked(){
  stopSubs(); ME=null;
  authFrame(`<p>${L("هذا الحساب غير مفعّل. تواصلي مع مدير النظام.","This account is not active. Contact the system admin.")}</p><button class="btn block" data-act="logout">${L("خروج","Sign out")}</button>`);
}
function renderChangePw(forced){
  const html = `<h2>${forced?L("غيّري كلمة المرور المؤقتة","Change your temporary password"):L("تغيير كلمة المرور","Change password")}</h2>
    <form class="form" id="pwForm">
      <label>${L("كلمة المرور الجديدة (8 أحرف على الأقل)","New password (min 8 characters)")}<input class="field" name="pw" type="password" minlength="8" required autocomplete="new-password"></label>
      <label>${L("تأكيد كلمة المرور","Confirm password")}<input class="field" name="pw2" type="password" minlength="8" required autocomplete="new-password"></label>
      <p class="err" id="pwErr"></p>
      <button class="btn primary block" type="submit">${L("حفظ","Save")}</button>
      ${forced?`<button class="btn block" type="button" data-act="logout">${L("خروج","Sign out")}</button>`:""}
    </form>`;
  if(forced) authFrame(html); else openDialog(L("تغيير كلمة المرور","Change password"), html.replace(/<h2>.*?<\/h2>/,""), "");
  $("#pwForm").addEventListener("submit", async e=>{
    e.preventDefault(); const f=new FormData(e.target);
    if(f.get("pw")!==f.get("pw2")){ $("#pwErr").textContent=L("كلمتا المرور غير متطابقتين","Passwords don't match"); return; }
    try{
      if(!DEMO) await firebase.auth().currentUser.updatePassword(f.get("pw"));
      await DB.update("users", ME.uid, {mustChangePw:false});
      toast(L("تم تغيير كلمة المرور","Password changed"));
      if(!forced) closeDialog(); else location.reload();
    }catch(err){ $("#pwErr").textContent = err.code==="auth/requires-recent-login" ? L("سجّلي خروج ثم دخول وحاولي مرة أخرى","Sign out, sign in again and retry") : (err.message||String(err)); }
  });
}

/* ---------- dialog ---------- */
function openDialog(title, body, foot){
  const d=$("#dlg");
  d.innerHTML=`<div class="dhead"><h3>${title}</h3><button class="btn ghost small" data-act="dlgClose" aria-label="${L("إغلاق","Close")}">✕</button></div><div class="dbody">${body}</div>${foot?`<div class="dfoot">${foot}</div>`:""}`;
  if(!d.open) d.showModal();
}
const closeDialog = () => { const d=$("#dlg"); if(d.open) d.close(); };

/* ---------- notifications ---------- */
function notifications(){
  const out=[], mine=new Set(myUnits().map(u=>u.id)), today=todayStr();
  if(isMgr()){
    Object.values(S.schedules).forEach(s=>{ if(mine.has(s.unitId) && s.status==="submitted") out.push({t:L(`جدول ${unitName(s.unitId)} — ${monthLabel(s.month)} بانتظار اعتمادك`,`${unitName(s.unitId)} — ${monthLabel(s.month)} roster awaits your approval`), go:{tab:"roster",unit:s.unitId,month:s.month}}); });
    const lc={}; Object.values(S.leaves).forEach(l=>{ if(mine.has(l.unitId) && l.status==="prelim") lc[l.unitId]=(lc[l.unitId]||0)+1; });
    Object.entries(lc).forEach(([u,k])=>out.push({t:L(`${k} إجازة في ${unitName(u)} بانتظار الاعتماد النهائي`,`${k} leave request(s) in ${unitName(u)} await final approval`), go:{tab:"leaves",unit:u}}));
    const sc={}; Object.values(S.swaps).forEach(w=>{ if(mine.has(w.unitId) && w.status==="prelim") sc[w.unitId]=(sc[w.unitId]||0)+1; });
    Object.entries(sc).forEach(([u,k])=>out.push({t:L(`${k} طلب تبديل في ${unitName(u)} بانتظار الاعتماد`,`${k} swap request(s) in ${unitName(u)} await approval`), go:{tab:"swaps",unit:u}}));
  }
  const next=shiftMonth(today.slice(0,7),1), dl=deadlinesFor(next);
  myUnits().forEach(u=>{
    const st=S.schedules[schedId(u.id,next)]?.status||"none";
    if(isHead() || isAdmin()){
      if(st==="returned") out.push({t:L(`أُعيد جدول ${unitName(u.id)} للتعديل`,`${unitName(u.id)} roster was returned for changes`), go:{tab:"roster",unit:u.id,month:next}});
      const left=daysBetween(today, dl.requests)-1;
      if(isHead() && left>=0 && left<=3) out.push({t:L(`باقي ${left} يوم على إغلاق طلبات ${monthLabel(next)}`,`${left} day(s) left for ${monthLabel(next)} requests`), go:{tab:"requests",unit:u.id,month:next}});
      if(["none","draft","returned"].includes(st) && today>=addDays(dl.submit,-3)) out.push({t: today>dl.submit ? L(`تأخر رفع جدول ${unitName(u.id)} لشهر ${monthLabel(next)}`,`${unitName(u.id)} roster for ${monthLabel(next)} is overdue`) : L(`ارفعي جدول ${unitName(u.id)} قبل ${fmtDate(dl.submit)}`,`Submit ${unitName(u.id)} roster before ${fmtDate(dl.submit)}`), go:{tab:"roster",unit:u.id,month:next}, late:today>dl.submit});
    }
    if(isAdmin() && st!=="approved" && today>dl.final) out.push({t:L(`${unitName(u.id)}: لم يُعتمد جدول ${monthLabel(next)} بعد الموعد النهائي`,`${unitName(u.id)}: ${monthLabel(next)} not approved after the final deadline`), go:{tab:"dashboard",month:next}, late:true});
  });
  return out;
}

/* ---------- shell ---------- */
const TABS = [
  {id:"dashboard", ar:"لوحة المتابعة", en:"Overview"},
  {id:"roster", ar:"الجدول", en:"Roster"},
  {id:"requests", ar:"طلبات الموظفين", en:"Requests"},
  {id:"leaves", ar:"الإجازات والأرصدة", en:"Leave & balances"},
  {id:"plan", ar:"خطة الإجازات", en:"Leave plan"},
  {id:"swaps", ar:"التبديل", en:"Swaps"},
  {id:"staff", ar:"الموظفون", en:"Staff"},
  {id:"users", ar:"المستخدمون", en:"Users", admin:true},
  {id:"settings", ar:"الإعدادات", en:"Settings", admin:true}
];
const needsUnit = t => ["roster","requests","leaves","swaps","staff","plan"].includes(t);
function render(){
  if(!ME || !UI.ready) return;
  applyLang();
  const mu=myUnits();
  if(!UI.unit || !mu.find(u=>u.id===UI.unit)) UI.unit=mu[0]?.id||null;
  const tabs=TABS.filter(t=>!t.admin||isAdmin());
  if(!tabs.find(t=>t.id===UI.tab)) UI.tab="dashboard";
  const notes=notifications();
  const showUnit = needsUnit(UI.tab) || (UI.tab==="settings");
  const showMonth = ["dashboard","roster","requests"].includes(UI.tab);
  if(!$("#shell")){
    app().innerHTML = `<div id="shell"><header class="top">${WAVES}<div class="top-row" id="topRow"></div><nav class="tabs" id="tabs" role="tablist"></nav></header>${DEMO?`<div class="mode-note">${L("وضع تجريبي — البيانات على هذا الجهاز فقط","Demo mode — data stays on this device")}</div>`:""}<main id="main"></main></div>`;
  }
  $("#topRow").innerHTML = `
    <div class="brand">${LOGO}<div><h1>${L("جداول التمريض","Nursing Roster")}</h1><small>${esc(ME.name)} · ${roleName(ME.role)}</small></div></div>
    ${showUnit && mu.length ? `<select class="field" id="unitSel" aria-label="${L("القسم","Unit")}">${mu.map(u=>`<option value="${u.id}" ${u.id===UI.unit?"selected":""}>${esc(unitName(u.id))}</option>`).join("")}</select>`:""}
    ${showMonth?`<div class="month-nav"><button data-act="mPrev" aria-label="${L("الشهر السابق","Previous month")}">${lang==="en"?"‹":"›"}</button><strong><span>${monthLabel(UI.month)}${G_SUF()}</span><small>${hijriRange(UI.month)}</small></strong><button data-act="mNext" aria-label="${L("الشهر التالي","Next month")}">${lang==="en"?"›":"‹"}</button></div>`:""}
    <div class="bell-wrap"><button class="btn ghost bell" data-act="bell" aria-label="${L("التنبيهات","Notifications")}" aria-expanded="${UI.bellOpen}">🔔${notes.length?`<span class="badge">${notes.length}</span>`:""}</button>
      ${UI.bellOpen?`<div class="bell-pop">${notes.length?notes.map((n,i)=>`<button class="note ${n.late?"late":""}" data-act="noteGo" data-i="${i}">${esc(n.t)}</button>`).join(""):`<p class="muted" style="padding:12px">${L("لا توجد تنبيهات","No notifications")}</p>`}</div>`:""}</div>
    ${langBtn()}
    <div class="user-menu"><button class="btn ghost small" data-act="pw">${L("كلمة المرور","Password")}</button><button class="btn ghost small" data-act="logout">${L("خروج","Sign out")}</button></div>`;
  UI._notes=notes;
  $("#tabs").innerHTML = tabs.map(t=>{ let badge="";
    if(t.id==="leaves"){ const k=Object.values(S.leaves).filter(l=>l.status==="prelim" && isMgr()).length; if(k) badge=`<span class="badge">${k}</span>`; }
    if(t.id==="swaps"){ const k=Object.values(S.swaps).filter(l=>l.status==="prelim" && isMgr()).length; if(k) badge=`<span class="badge">${k}</span>`; }
    return `<button role="tab" data-tab="${t.id}" aria-selected="${t.id===UI.tab}">${L(t.ar,t.en)}${badge}</button>`; }).join("");
  const main=$("#main");
  if(needsUnit(UI.tab) && !UI.unit){
    main.innerHTML = `<div class="panel empty"><h2>${isAdmin()?L("ابدئي بإضافة قسم","Start by adding a unit"):L("لا توجد أقسام مسندة لك","No units assigned to you")}</h2>
      <p class="muted">${isAdmin()?L("من الإعدادات أضيفي الأقسام ونظام مناوباتها، ثم الموظفين والمستخدمين.","Add units and their shift systems in Settings, then staff and users."):L("تواصلي مع مدير النظام لإسناد الأقسام.","Ask the system admin to assign units to you.")}</p>
      ${isAdmin()?`<button class="btn primary" data-tab="settings">${L("الإعدادات","Settings")}</button>`:""}</div>`;
    return;
  }
  ({dashboard:renderDashboard, roster:renderRoster, requests:renderRequests, leaves:renderLeaves, plan:renderPlan, swaps:renderSwaps, staff:renderStaff, users:renderUsers, settings:renderSettings})[UI.tab](main);
  $$("input[type=date]").forEach(dateHint);
}

/* ---------- dashboard ---------- */
/* per-unit month summary used by the overview: daily status + coverage % */
function unitMonthSummary(unitId, month){
  const sch=S.schedules[schedId(unitId,month)], st=sch?.status||"none", n=dim(month);
  const built = !!(sch && Object.keys(sch.grid||{}).length);
  const out={st, built, days:[], cover:null, nurseGapDays:0, assistGaps:0, staff:staffOf(unitId).length, sys:unitCfg(unitId).system};
  if(!built){ for(let d=1; d<=n; d++) out.days.push("na"); return out; }
  const A=analyze(unitId,month), c=A.c; let need=0, have=0;
  for(let d=1; d<=n; d++){
    let bad=false, warn=false;
    c.shifts.forEach(sh=>{ const m=Number(c.mins[sh.code])||0, v=A.cov.counted[d][sh.code]; need+=m; have+=Math.min(v,m); if(v<m) bad=true;
      if(A.assistCount && A.cov.assist[d][sh.code]<c.assistMin){ warn=true; out.assistGaps++; } });
    if(bad) out.nurseGapDays++;
    out.days.push(bad?"bad":warn?"warn":"ok");
  }
  out.cover = need ? Math.round(have/need*100) : 100;
  return out;
}
function ringSVG(pct){
  const r=26, C=2*Math.PI*r, has=pct!==null, p=has?Math.max(0,Math.min(100,pct)):0;
  const col = !has ? "var(--line)" : p>=100 ? "var(--ok)" : p>=90 ? "var(--today)" : "var(--danger)";
  return `<svg class="ring" viewBox="0 0 64 64" width="68" height="68" role="img" aria-label="${has?p+"%":"—"}"><circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--line-2)" stroke-width="7"/>${has?`<circle cx="32" cy="32" r="${r}" fill="none" stroke="${col}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(C*p/100).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 32 32)"/>`:""}<text x="32" y="37" text-anchor="middle">${has?p+"%":"—"}</text></svg>`;
}
function nextDeadline(month){
  const t=todayStr(), names=[["requests","إغلاق طلبات","Requests close for"],["submit","رفع جداول","Roster submission for"],["final","اعتماد جداول","Final approval for"]];
  for(const m of [month, shiftMonth(month,1), shiftMonth(month,2)]){
    const dl=deadlinesFor(m);
    for(const [k,ar,en] of names) if(dl[k]>=t) return {date:dl[k], label:L(`${ar} ${monthLabel(m)}`,`${en} ${monthLabel(m)}`)};
  }
  return null;
}
function renderDashboard(main){
  const month=UI.month, dl=deadlinesFor(month), today=todayStr(), mu=myUnits(), n=dim(month);
  const rows=mu.map(u=>{ const sm=unitMonthSummary(u.id,month);
    const late=(sm.st!=="approved" && today>dl.final) || (["none","draft","returned"].includes(sm.st) && today>dl.submit);
    const pl=Object.values(S.leaves).filter(l=>l.unitId===u.id && l.status==="prelim").length + Object.values(S.swaps).filter(w=>w.unitId===u.id && w.status==="prelim").length;
    return {u, ...sm, late, pending:pl}; });
  const approved=rows.filter(r=>r.st==="approved").length, late=rows.filter(r=>r.late).length;
  const gaps=rows.reduce((a,r)=>a+r.nurseGapDays+r.assistGaps,0), pending=rows.reduce((a,r)=>a+r.pending,0);
  const nd=nextDeadline(month);
  const daysLate=d=>Math.max(0,daysBetween(d,today)-1);
  const attention=rows.filter(r=>r.late || r.st==="returned" || r.st==="submitted" && isMgr() || r.nurseGapDays).map(r=>{
    let why;
    if(r.late) why = r.st==="submitted" ? L(`بانتظار الاعتماد — تجاوز الموعد بـ ${daysLate(dl.final)} يوم`,`Awaiting approval — ${daysLate(dl.final)} days past deadline`)
      : today>dl.final ? L(`لم يُعتمد — متأخر ${daysLate(dl.final)} يوم عن الاعتماد النهائي`,`Not approved — ${daysLate(dl.final)} days past final approval`)
      : L(`لم يُرفع — متأخر ${daysLate(dl.submit)} يوم`,`Not submitted — ${daysLate(dl.submit)} days late`);
    else if(r.st==="returned") why=L("أُعيد للتعديل","Returned for changes");
    else if(r.st==="submitted") why=L("بانتظار اعتمادك","Awaiting your approval");
    else why=L(`نقص ستاف نيرس في ${r.nurseGapDays} يوم`,`Nurse shortage on ${r.nurseGapDays} day(s)`);
    return `<div class="att-row ${r.late?"late":""}"><span class="att-ic" aria-hidden="true">${r.late?"!":"•"}</span><div><b>${esc(unitName(r.u.id))}</b><span>${why}</span></div><button class="btn small" data-act="openRoster" data-id="${r.u.id}">${L("فتح","Open")}</button></div>`; }).join("");
  const WDS=lang==="en"?WDS_EN:WDS_AR;
  let hmHead=`<div class="hm-name"></div>`;
  for(let d=1; d<=n; d++){ const wd=weekday(dayOf(month,d)); hmHead+=`<div class="hm-d ${wd>=5?"we":""}"><span>${WDS[wd]}</span>${d}</div>`; }
  const hmRows=rows.map(r=>`<div class="hm-name"><button class="linkish" data-act="openRoster" data-id="${r.u.id}">${esc(unitName(r.u.id))}</button></div>${r.days.map((s,i)=>`<button class="hm-c ${s}" data-act="openRoster" data-id="${r.u.id}" title="${esc(unitName(r.u.id))} — ${esc(fmtDate(dayOf(month,i+1)))}"></button>`).join("")}`).join("");
  main.innerHTML = `
  <section class="ops">
    <div class="ops-k"><span>${L("جداول","Rosters for")} ${monthLabel(month)}</span><b>${approved}<small> / ${rows.length} ${L("معتمد","approved")}</small></b></div>
    <div class="ops-k"><span>${L("متأخر عن الموعد","Past deadline")}</span><b class="${late?"hot":""}">${late}</b></div>
    <div class="ops-k"><span>${L("نقص تغطية","Coverage gaps")}</span><b class="${gaps?"warm":""}">${gaps}</b></div>
    <div class="ops-k"><span>${L("طلبات معلقة","Pending requests")}</span><b>${pending}</b></div>
    <div class="ops-k next"><span>${L("الموعد القادم","Next deadline")}</span>${nd?`<b class="sm">${esc(nd.label)}</b><em>${esc(fmtDate(nd.date))}</em>`:"<b>—</b>"}</div>
  </section>
  ${attention?`<section class="att">${attention}</section>`:`<div class="ok-line">${L("كل الأقسام على المسار ✓","All units on track ✓")}</div>`}
  <section class="panel hm-panel"><div class="hm-top"><h2>${L("خريطة التغطية","Coverage map")} — ${monthLabel(month)}${G_SUF()}</h2><span class="muted small-text">${hijriRange(month)}</span></div>
    ${rows.length?`<div class="hm" style="grid-template-columns:minmax(120px,170px) repeat(${n},minmax(14px,1fr))">${hmHead}${hmRows}</div>
    <div class="hm-legend"><span><i class="hm-c ok"></i>${L("مغطّى","Covered")}</span><span><i class="hm-c warn"></i>${L("نقص مساعدين","Assistant gap")}</span><span><i class="hm-c bad"></i>${L("نقص ستاف نيرس","Nurse shortage")}</span><span><i class="hm-c na"></i>${L("لم يُبنَ بعد","Not built yet")}</span></div>`:`<p class="muted">${L("لا توجد أقسام.","No units yet.")}</p>`}
  </section>
  <section class="ring-grid">${rows.map(r=>`
    <article class="ring-card">${ringSVG(r.cover)}
      <div class="rc-body"><h3>${esc(unitName(r.u.id))}</h3>
        <p class="muted small-text">${r.staff} ${L("موظف","staff")} · ${r.sys==="12"?L("12 ساعة","12h"):L("9 ساعات","9h")}</p>
        <p class="rc-st"><span class="pill st-${r.late?"late":r.st}">${r.late?L("متأخر","Late"):stName(r.st)}</span>${r.built?`<span class="muted small-text">${L("تغطية الحد الأدنى","min. coverage")}</span>`:""}</p>
      </div>
      <button class="btn small" data-act="openRoster" data-id="${r.u.id}">${L("فتح","Open")}</button>
    </article>`).join("")}</section>
  ${holidayStrip(month)}`;
}
function holidayStrip(month){
  const n=dim(month), items=[]; let ram=0;
  for(let d=1; d<=n; d++){ const c=calInfo(dayOf(month,d)); if(c.hol) items.push(`<li><b>${L(...HOLIDAY_NAMES[c.hol])}</b> ${fmtDual(dayOf(month,d))}</li>`); if(c.ramadan) ram++; }
  if(!items.length && !ram) return "";
  return `<div class="panel"><h2>${L("عطل رسمية ورمضان هذا الشهر","Holidays & Ramadan this month")}</h2>
    ${ram?`<p>☾ ${L(`${ram} يوم من رمضان في هذا الشهر.`,`${ram} day(s) of Ramadan this month.`)}</p>`:""}
    ${items.length?`<ul class="hol-list">${items.join("")}</ul>`:""}
    <p class="muted small-text">${L("تُحسب تلقائياً حسب تقويم أم القرى. العمل في عطلة رسمية يضيف رصيداً تعويضياً تلقائياً عند اعتماد الجدول.","Calculated automatically from the Umm al-Qura calendar. Working on an official holiday adds compensatory credit automatically once the roster is approved.")}</p></div>`;
}

/* ---------- roster ---------- */
function canEditRoster(sch){
  const st=sch?.status||"draft";
  if(isAdmin()) return st!=="approved";
  if(isHead()) return st==="draft"||st==="returned";
  return false;
}
function renderRoster(main){
  const unit=UI.unit, month=UI.month, A=analyze(unit,month), c=A.c, n=A.n;
  const sch=S.schedules[schedId(unit,month)], st=sch?.status||"draft", editable=canEditRoster(sch);
  if(!A.staff.length){ main.innerHTML=`<div class="panel empty"><h2>${L("لا يوجد موظفون في هذا القسم","No staff in this unit")}</h2><p class="muted">${isAdmin()?L("أضيفي طاقم القسم من صفحة الموظفين.","Add the unit's staff from the Staff page."):L("مدير النظام يضيف الموظفين.","The system admin adds staff.")}</p>${isAdmin()?`<button class="btn primary" data-tab="staff">${L("الموظفون","Staff")}</button>`:""}</div>`; return; }
  const [Y,M]=month.split("-").map(Number), today=todayStr();
  const WDS = lang==="en"?WDS_EN:WDS_AR;
  let head=`<th class="name">${L("الموظف","Staff")}<span class="cal-key"><b>${L("ميلادي","Gregorian")}</b><i>${L("هجري","Hijri")}</i></span></th>`;
  for(let d=1; d<=n; d++){
    const date=dayOf(month,d), wd=weekday(date), ci=calInfo(date);
    const hj=hijri(date);
    head+=`<th class="${wd>=5?"wkend":""} ${date===today?"today":""} ${ci.ramadan?"ram":""}" title="${esc(gText(date))} — ${esc(hText(date))}${ci.hol?" — "+esc(L(...HOLIDAY_NAMES[ci.hol])):""}"><span class="wd">${WDS[wd]}</span><span class="gd">${d}</span><span class="hd">${hj?hj.d:""}</span>${ci.hol?`<span class="hol">★</span>`:ci.ramadan?`<span class="hol">☾</span>`:""}</th>`;
  }
  head+=`<th>${L("أيام","Days")}</th><th>${L("ساعات","Hours")}</th>`;
  let body="", lastCat=null;
  const CATLAB={counted:L("ستاف نيرس","Staff nurses"),assist:L("المساعدون","Assistants"),other:L("غير محسوبين","Not counted")};
  A.staff.forEach(s=>{
    const cat=catOf(s);
    if(cat!==lastCat){ body+=`<tr class="grp"><td class="name" colspan="1">${CATLAB[cat]}</td><td colspan="${n+2}"></td></tr>`; lastCat=cat; }
    const rq=A.req[s.id];
    let r=`<tr><td class="name"><b>${esc(s.name)}</b><span>${esc(titleName(s))} · ${esc(s.empNo||"")}${rq?.fullNights?` · ☾ ${L("ليالي","nights")}`:""}</span></td>`;
    for(let d=1; d<=n; d++){
      const date=dayOf(month,d), wd=weekday(date), lvx=A.lv[s.id][d];
      let v=lvx?.code || A.grid[s.id]?.[d] || "";
      const hc = !lvx && A.grid[s.id] && holDayCode(date, v); if(hc) v=hc.code;
      const sh=c.byCode[v], col = sh?sh.color : (LEAVE_BY_CODE[v]?.color || hc?.color || "");
      const cls=["c", wd>=5&&!col?"wkend":"", v==="OFF"?"off":"", lvx?"lv":"", lvx?.tent?"tent":"", lvx?.plan?"plan":"", A.bad[s.id]?.[d]?"bad":"", rq?.off?.has(d)?"reqoff":""].join(" ");
      r+=`<td class="${cls}${v.length>2?" long":""}" data-s="${s.id}" data-d="${d}" ${col?`style="--cc:${col}"`:""}>${v==="OFF"?"–":esc(v)}${lvx?.tent&&v.length<3?"?":""}</td>`;
    }
    const p=A.per[s.id];
    r+=`<td class="tot">${p.days}</td><td class="tot">${p.hours}</td></tr>`;
    body+=r;
  });
  c.shifts.forEach((sh,i)=>{
    const m=Number(c.mins[sh.code])||0;
    let r=`<tr class="cov ${i===0?"first":""}"><td class="name">${L("ستاف نيرس","Nurses")} — ${esc(shiftName(sh))} <span class="muted">(${L("حد","min")} ${m})</span></td>`;
    for(let d=1; d<=n; d++){ const v=A.cov.counted[d][sh.code]; r+=`<td class="${v<m?"lo":"okc"}">${v}</td>`; }
    body+=r+`<td></td><td></td></tr>`;
  });
  if(A.assistCount) c.shifts.forEach(sh=>{
    let r=`<tr class="cov"><td class="name">${L("مساعدون","Assistants")} — ${esc(shiftName(sh))} <span class="muted">(${L("حد","min")} ${c.assistMin})</span></td>`;
    for(let d=1; d<=n; d++){ const v=A.cov.assist[d][sh.code]; r+=`<td class="${v<c.assistMin?"lo":"okc"}">${v}</td>`; }
    body+=r+`<td></td><td></td></tr>`;
  });
  const brushes=[...c.shifts.map(s=>({code:s.code,label:s.code,color:s.color,title:`${shiftName(s)} ${s.start}–${s.end}`})),{code:"OFF",label:L("أوف","Off")},{code:"",label:L("مسح","Clear")}];
  if(!brushes.some(b=>b.code===UI.brush)) UI.brush=c.shifts[0].code;
  const severe=A.issues.filter(i=>i.sev>=2).length, filled=Object.keys(A.grid).length>0;
  const dl=deadlinesFor(month);
  const actions=[];
  if(editable){ actions.push(`<button class="btn smart" data-act="smart">✦ ${L("توزيع ذكي","Smart distribution")}</button>`); if(filled) actions.push(`<button class="btn danger" data-act="clearSched">${L("تفريغ","Clear")}</button>`); }
  if((isHead()||isAdmin()) && (st==="draft"||st==="returned") && filled) actions.push(`<button class="btn primary" data-act="submitSched">${L("رفع للاعتماد","Submit for approval")}</button>`);
  if(isMgr() && st==="submitted"){ actions.push(`<button class="btn primary" data-act="approveSched">${L("اعتماد نهائي","Approve")}</button>`); actions.push(`<button class="btn" data-act="returnSched">${L("إعادة للتعديل","Return")}</button>`); }
  if(isAdmin() && st==="approved") actions.push(`<button class="btn" data-act="reopenSched">${L("فتح للتعديل","Reopen")}</button>`);
  main.innerHTML = `
  <div class="toolbar">
    ${editable?`<div class="brushes" role="group" aria-label="${L("أداة التعبئة","Brush")}">${brushes.map(b=>`<button class="brush" data-brush="${b.code}" aria-pressed="${b.code===UI.brush}" title="${esc(b.title||b.label)}" style="${b.color?`background:${b.color};color:#fff`:b.code==="OFF"?"background:var(--off);color:var(--off-ink)":"background:var(--surface)"}">${esc(b.label)}</button>`).join("")}</div>`:""}
    ${actions.join("")}
    <span class="spacer"></span>
    <span class="pill st-${st}">${stName(st)}</span>
    <button class="btn" data-act="csvRoster">${L("تصدير Excel","Export Excel")}</button>
    <button class="btn" data-act="print">${L("طباعة","Print")}</button>
  </div>
  ${sch?.note && (st==="returned") ? `<div class="note-box">${L("ملاحظة المنجر:","Manager's note:")} ${esc(sch.note)}</div>`:""}
  ${!filled?`<div class="info-line">${editable?L(`الجدول فارغ. اضغطي «توزيع ذكي» لبناء الجدول حسب النظام والطلبات، ثم عدّلي يدوياً إذا احتجتِ. آخر موعد للرفع ${fmtDate(dl.submit)}.`,`The roster is empty. Press "Smart distribution" to build it from the shift pattern and requests, then adjust by hand. Submit by ${fmtDate(dl.submit)}.`):L("لم يُبنَ جدول هذا الشهر بعد.","This month's roster hasn't been built yet.")}</div>`:
   A.issues.length?`<details class="warnings" ${severe?"open":""}><summary>${L(`${A.issues.length} ملاحظة`,`${A.issues.length} notes`)}${severe?L(` — منها ${severe} مهمة`,` — ${severe} important`):""}</summary><ul>${A.issues.slice(0,150).map(i=>`<li class="sev${i.sev}">${esc(i.msg)}</li>`).join("")}</ul></details>`
   :`<div class="ok-line">${L("الجدول مستوفٍ للتغطية والقواعد ✓","Roster meets coverage and rules ✓")}</div>`}
  <div class="print-title">${esc(unitName(unit))} — ${monthLabel(month)}${G_SUF()} / ${hijriRange(month)}</div>
  <div class="roster-wrap ${editable?"":"locked"}"><table class="roster" id="roster"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
  <div class="legend">
    ${c.shifts.map(s=>`<span><i style="background:${s.color}"></i>${esc(s.code)} ${esc(shiftName(s))} ${esc(s.start)}–${esc(s.end)} (${s.hours} ${L("س","h")})</span>`).join("")}
    ${Object.values(LEAVE_TYPES).map(t=>`<span><i style="background:${t.color}"></i>${t.code} ${esc(L(t.ar,t.en))}</span>`).join("")}
    ${Object.values(HOL_DAY_CODES).map(t=>`<span><i style="background:${t.color}"></i>${t.code} ${esc(L(t.ar,t.en))}</span>`).join("")}
    <span><i class="tent-i"></i>? ${L("إجازة بموافقة مبدئية","initial approval")}</span><span><i class="plan-i"></i>${L("إجازة مخططة (خطة الإجازات)","planned leave (leave plan)")}</span><span><i class="reqoff-i"></i>${L("طلب أوف","requested off")}</span>
    <span>★ ${L("عطلة رسمية","holiday")}</span><span class="ram-i">☾ ${L("رمضان","Ramadan")}${c.ramadanApply?L(" (دوام مخفّض مطبّق)"," (reduced hours applied)"):""}</span>
  </div>`;
  if(editable) bindPaint();
}
function bindPaint(){
  const tbl=$("#roster"); let painting=null;
  const c=unitCfg(UI.unit), id=schedId(UI.unit,UI.month);
  const apply=td=>{
    if(!td || !td.classList.contains("c")) return;
    if(td.classList.contains("lv")){ toast(L("عليه إجازة في هذا اليوم","On leave this day")); return; }
    const sid=td.dataset.s, d=td.dataset.d;
    const sch=S.schedules[id] || (S.schedules[id]={unitId:UI.unit, month:UI.month, grid:{}, status:"draft"});
    sch.grid=sch.grid||{}; sch.grid[sid]=sch.grid[sid]||{};
    let v=UI.brush; if(!painting.moved && sch.grid[sid][d]===v) v="";
    if(v) sch.grid[sid][d]=v; else delete sch.grid[sid][d];
    const sh=c.byCode[v];
    td.textContent = v==="OFF"?"–":v; td.style.setProperty("--cc", sh?sh.color:""); if(!sh) td.removeAttribute("style");
    td.classList.toggle("off", v==="OFF");
    saveSchedSoon(id);
  };
  tbl.addEventListener("pointerdown",e=>{ const td=e.target.closest("td.c"); if(!td) return; if(e.pointerType==="mouse") e.preventDefault(); painting={moved:false,last:td}; apply(td); });
  tbl.addEventListener("pointerover",e=>{ if(!painting) return; const td=e.target.closest("td.c"); if(td && td!==painting.last){ painting.moved=true; painting.last=td; apply(td); } });
  window.onpointerup=()=>{ if(painting){ painting=null; render(); } };
}
const schedTimers={};
function saveSchedSoon(id){
  clearTimeout(schedTimers[id]); pendingSched.add(id);
  schedTimers[id]=setTimeout(async()=>{ const s=S.schedules[id]; try{ await DB.set("schedules", id, {...s, updatedBy:ME.uid, updatedAt:new Date().toISOString()}); }catch(e){ writeErr(e); } setTimeout(()=>pendingSched.delete(id),1500); }, 600);
}

function renderForgot(){
  authFrame(`<h2>${L("إعادة تعيين كلمة المرور","Reset password")}</h2>
    <p class="muted">${L("اكتب رقمك الوظيفي، ونرسل رابط إعادة التعيين على إيميلك المسجل في النظام.","Enter your employee number and we'll send a reset link to your registered e-mail.")}</p>
    <form class="form" id="forgotForm">
      <label>${L("الرقم الوظيفي","Employee number")}<input class="field" name="emp" inputmode="numeric" required></label>
      <p class="err" id="forgotMsg"></p>
      <button class="btn primary block" type="submit">${L("إرسال الرابط","Send link")}</button>
      <button class="btn ghost block" type="button" data-act="backLogin">${L("رجوع لتسجيل الدخول","Back to sign-in")}</button>
    </form>`);
  $("#forgotForm").addEventListener("submit", async e=>{
    e.preventDefault(); const emp=new FormData(e.target).get("emp"), msg=$("#forgotMsg"), btn=e.target.querySelector("button[type=submit]");
    btn.disabled=true; msg.className="err"; msg.textContent="";
    try{
      const r=await sendReset(emp);
      if(r.ok){ msg.className="ok-msg"; msg.textContent=L(`أرسلنا رابط إعادة التعيين إلى ${maskEmail(r.email)}. افتح الإيميل (وتأكد من مجلد الرسائل غير المرغوبة) واتبع الرابط، ثم ادخل بكلمة المرور الجديدة.`,`We sent a reset link to ${maskEmail(r.email)}. Open the e-mail (check spam too), follow the link, then sign in with the new password.`); }
      else { msg.textContent=L("لا يوجد إيميل مسجل لهذا الرقم. تواصل مع مدير النظام لإعادة تعيين كلمة المرور.","No e-mail is registered for this number. Contact the system admin to reset your password."); btn.disabled=false; }
    }catch(err){ msg.textContent=L("تعذّر الإرسال، حاول بعد قليل.","Couldn't send the link, try again shortly."); btn.disabled=false; }
  });
}

/* every Gregorian date picker shows its Hijri equivalent underneath */
function dateHint(inp){
  let h=inp.nextElementSibling;
  if(!h || !h.classList.contains("hij-hint")){ h=document.createElement("small"); h.className="hij-hint"; inp.after(h); }
  h.textContent = inp.value ? `${L("الهجري:","Hijri:")} ${hText(inp.value)}` : L("الهجري يظهر هنا","Hijri date shows here");
}
document.addEventListener("input", e=>{ if(e.target.type==="date") dateHint(e.target); });

/* =========================================================
   Part 4: requests, leave, swaps, staff, users, settings, events
   ========================================================= */
const canHeadEdit = () => isHead() || isAdmin();

/* ---------- staff requests ---------- */
function renderRequests(main){
  const unit=UI.unit, month=UI.month, staff=staffOf(unit), c=unitCfg(unit), n=dim(month), dl=deadlinesFor(month);
  const open=requestsOpen(month), canEdit=canHeadEdit() && (open || isAdmin());
  const req=reqFor(unit,month);
  if(!UI.reqStaff || !staff.find(s=>s.id===UI.reqStaff)) UI.reqStaff=staff[0]?.id||null;
  const sel=UI.reqStaff, r=req[sel]||{off:new Set(),pref:"",fullNights:false,noNight:null,note:""};
  const [Y,M]=month.split("-").map(Number), first=new Date(Y,M-1,1).getDay();
  const WD=lang==="en"?WDS_EN:WDS_AR;
  let cal=`<div class="cal">${WD.map(w=>`<div class="cal-h">${w}</div>`).join("")}${"<div></div>".repeat(first)}`;
  for(let d=1; d<=n; d++){ const ci=calInfo(dayOf(month,d)); cal+=`<button type="button" class="cal-d ${r.off.has(d)?"on":""} ${ci.hol?"hol":""}" data-act="reqDay" data-d="${d}" ${canEdit?"":"disabled"}>${d}${ci.hol?"<i>★</i>":""}</button>`; }
  cal+=`</div>`;
  const summary=s=>{ const q=req[s.id]; if(!q) return `<span class="muted">—</span>`; const parts=[];
    if(q.off.size) parts.push(L(`أوف: ${[...q.off].sort((a,b)=>a-b).join("، ")}`,`Off: ${[...q.off].sort((a,b)=>a-b).join(", ")}`));
    if(q.pref) parts.push(L("يفضّل ","Prefers ")+q.pref);
    if(q.fullNights) parts.push(L("ليالي طول الشهر","Nights all month"));
    if(q.noNight) parts.push(L(`بدون ليلي ${q.noNight[0]}–${q.noNight[1]}`,`No nights ${q.noNight[0]}–${q.noNight[1]}`));
    return esc(parts.join(" · ")); };
  main.innerHTML = `
  <div class="${open?"info-line":"note-box"}">${open?L(`طلبات ${monthLabel(month)} مفتوحة حتى ${fmtDate(dl.requests)}.`,`Requests for ${monthLabel(month)} are open until ${fmtDate(dl.requests)}.`):L(`أُغلقت طلبات ${monthLabel(month)} في ${fmtDate(dl.requests)}.${isAdmin()?" (يمكنك كمدير النظام التعديل)":""}`,`Requests for ${monthLabel(month)} closed on ${fmtDate(dl.requests)}.${isAdmin()?" (As admin you can still edit)":""}`)}</div>
  <div class="grid2">
    <div class="panel"><h2>${L("طلبات موظف","Requests for")}</h2>
      ${staff.length?`<div class="form">
      <label>${L("الموظف","Staff member")}<select class="field" id="reqStaffSel">${staff.map(s=>`<option value="${s.id}" ${s.id===sel?"selected":""}>${esc(s.name)} — ${esc(titleName(s))}</option>`).join("")}</select></label>
      <div><div class="lbl">${L("أيام الأوف المطلوبة (اضغطي على اليوم)","Requested days off (tap a day)")}</div>${cal}</div>
      <label>${L("المناوبة المفضّلة","Preferred shift")}<select class="field" id="reqPref" ${canEdit?"":"disabled"}><option value="">${L("بدون تفضيل","No preference")}</option>${c.shifts.map(sh=>`<option value="${sh.code}" ${r.pref===sh.code?"selected":""}>${esc(sh.code)} — ${esc(shiftName(sh))}</option>`).join("")}</select></label>
      <label class="check"><input type="checkbox" id="reqFull" ${r.fullNights?"checked":""} ${canEdit?"":"disabled"}> ${L("يطلب ليالي طول الشهر","Requests nights for the whole month")}</label>
      <div class="two"><label>${L("بدون ليلي من يوم","No nights from day")}<input class="field" type="number" min="1" max="${n}" id="reqNNf" value="${r.noNight?.[0]||""}" ${canEdit?"":"disabled"}></label>
      <label>${L("إلى يوم","to day")}<input class="field" type="number" min="1" max="${n}" id="reqNNt" value="${r.noNight?.[1]||""}" ${canEdit?"":"disabled"}></label></div>
      <label>${L("ملاحظة","Note")}<input class="field" id="reqNote" value="${esc(r.note)}" ${canEdit?"":"disabled"}></label>
      ${canEdit?`<div class="row"><button class="btn primary" data-act="reqSave">${L("حفظ الطلبات","Save requests")}</button>${req[sel]?`<button class="btn danger" data-act="reqDel">${L("حذف الطلبات","Delete requests")}</button>`:""}</div>`:""}
      </div>`:`<p class="muted">${L("لا يوجد موظفون.","No staff.")}</p>`}
    </div>
    <div class="panel"><h2>${L("ملخص طلبات القسم","Unit requests summary")} — ${monthLabel(month)}</h2>
      <div class="tbl-wrap"><table class="list"><thead><tr><th>${L("الموظف","Staff")}</th><th>${L("الطلبات","Requests")}</th></tr></thead><tbody>
      ${staff.map(s=>`<tr class="${s.id===sel?"sel-row":""}"><td><button class="linkish" data-act="reqPick" data-id="${s.id}">${esc(s.name)}</button></td><td>${summary(s)}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="muted small-text">${L("التوزيع الذكي يطبّق هذه الطلبات تلقائياً.","Smart distribution applies these requests automatically.")}</p>
    </div>
  </div>`;
  UI._reqOff = new Set(r.off);
  const ss=$("#reqStaffSel"); if(ss) ss.addEventListener("change",e=>{ UI.reqStaff=e.target.value; render(); });
}

/* ---------- leave & balances ---------- */
function renderLeaves(main){
  const unit=UI.unit, staff=staffOf(unit, true), ids=new Set(staff.map(s=>s.id)), active=staffOf(unit);
  const ORDER={prelim:0,approved:1,rejected:2};
  const leaves=Object.entries(S.leaves).map(([id,l])=>({id,...l})).filter(l=>ids.has(l.staffId)).sort((a,b)=>ORDER[a.status]-ORDER[b.status] || (b.from||"").localeCompare(a.from||""));
  const credits=Object.entries(S.credits).map(([id,c])=>({id,...c})).filter(c=>ids.has(c.staffId)).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  const opts=active.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("");
  const name=id=>esc(S.staff[id]?.name||"—");
  main.innerHTML=`<div class="grid2">
   <div>
    ${canHeadEdit()?`<div class="panel"><h2>${L("تسجيل إجازة أو دورة","Record leave or course")}</h2>
     <p class="muted small-text" style="margin-top:0">${L("التسجيل من الهيدنيرس يعتبر موافقة مبدئية، وتظهر في الجدول كإجازة مبدئية حتى يعتمدها المنجر.","Recording by the head nurse counts as initial approval; it shows on the roster as tentative until the manager approves.")}</p>
     <form class="form" id="leaveForm">
      <label>${L("الموظف","Staff member")}<select class="field" name="staffId" required>${opts}</select></label>
      <label>${L("النوع","Type")}<select class="field" name="type"><optgroup label="${L("إجازات","Leave")}">${Object.entries(LEAVE_TYPES).filter(([,t])=>!t.train).map(([k,t])=>`<option value="${k}">${t.code} — ${esc(L(t.ar,t.en))}</option>`).join("")}</optgroup><optgroup label="${L("دورات تدريبية","Training courses")}">${Object.entries(LEAVE_TYPES).filter(([,t])=>t.train).map(([k,t])=>`<option value="${k}">${esc(L(t.ar,t.en))}</option>`).join("")}</optgroup></select></label>
      <div class="two"><label>${L("من (ميلادي)","From (Gregorian)")}<input class="field" type="date" name="from" required></label><label>${L("إلى (ميلادي)","To (Gregorian)")}<input class="field" type="date" name="to" required></label></div>
      <label>${L("ملاحظة","Note")}<input class="field" name="note"></label>
      <p class="muted small-text" id="lvInfo"></p>
      <button class="btn primary" type="submit" ${active.length?"":"disabled"}>${L("تسجيل بموافقة مبدئية","Record with initial approval")}</button>
     </form></div>`:""}
    ${isMgr()?`<div class="panel"><h2>${L("إضافة رصيد يدوي","Add balance manually")}</h2>
     <form class="form" id="creditForm">
      <label>${L("الموظف","Staff member")}<select class="field" name="staffId" required>${opts}</select></label>
      <div class="two"><label>${L("النوع","Type")}<select class="field" name="type"><option value="comp">${L("تعويضية (أيام)","Comp (days)")}</option><option value="annual">${L("سنوية (أيام)","Annual (days)")}</option><option value="ramadan">${L("ساعات رمضان","Ramadan hours")}</option></select></label>
      <label>${L("القيمة","Amount")}<input class="field" type="number" name="amount" step="0.5" value="1" required></label></div>
      <label>${L("السبب","Reason")}<input class="field" name="reason"></label>
      <button class="btn primary" type="submit" ${active.length?"":"disabled"}>${L("إضافة","Add")}</button>
     </form></div>`:""}
   </div>
   <div>
    <div class="panel"><h2>${L("الإجازات","Leave")} — ${esc(unitName(unit))}</h2>
     ${leaves.length?`<div class="tbl-wrap"><table class="list"><thead><tr><th>${L("الموظف","Staff")}</th><th>${L("النوع","Type")}</th><th>${L("الفترة","Period")}</th><th>${L("أيام","Days")}</th><th>${L("الحالة","Status")}</th><th></th></tr></thead><tbody>
     ${leaves.map(l=>`<tr><td><b>${name(l.staffId)}</b>${l.note?`<br><span class="muted small-text">${esc(l.note)}</span>`:""}${l.reason?`<br><span class="muted small-text">${esc(l.reason)}</span>`:""}</td><td><span class="lv-tag" style="--lc:${LEAVE_TYPES[l.type]?.color}">${LEAVE_TYPES[l.type]?.code}</span> ${esc(leaveName(l.type))}</td>
       <td class="period">${fmtDual(l.from)}<span class="to">${L("إلى","to")}</span>${fmtDual(l.to)}</td><td>${l.days}</td><td><span class="pill st-${l.status}">${stName(l.status)}</span></td>
       <td class="nowrap">${l.status==="prelim"&&isMgr()?`<button class="btn small primary" data-act="lvApprove" data-id="${l.id}">${L("اعتماد","Approve")}</button> <button class="btn small danger" data-act="lvReject" data-id="${l.id}">${L("رفض","Reject")}</button>`:""}
         ${(l.status==="prelim"&&canHeadEdit())||isAdmin()?` <button class="btn small ghost" data-act="lvDel" data-id="${l.id}" aria-label="${L("حذف","Delete")}">✕</button>`:""}</td></tr>`).join("")}
     </tbody></table></div>`:`<p class="muted">${L("لا توجد إجازات.","No leave recorded.")}</p>`}
    </div>
    <div class="panel"><h2>${L("الأرصدة","Balances")}</h2>
     <div class="tbl-wrap"><table class="list"><thead><tr><th>${L("الموظف","Staff")}</th>${[...DAY_BALS,"ramadan"].map(k=>`<th>${L(...BAL_NAMES[k])}</th>`).join("")}<th>${L("بموافقة مبدئية","Tentative")}</th></tr></thead><tbody>
     ${active.map(s=>{ const b=balances(s.id); return `<tr><td>${esc(s.name)}</td>${DAY_BALS.map(k=>`<td class="${b[k]<0?"neg":""}">${b[k]||(k==="annual"||k==="comp"?0:"—")}</td>`).join("")}<td>${b.ramadan||"—"}</td><td class="muted">${b.pending||"—"}</td></tr>`; }).join("")}
     </tbody></table></div>
     <div class="row" style="margin-top:10px"><button class="btn small" data-act="csvBalances">${L("تصدير الأرصدة Excel","Export balances")}</button></div>
     ${credits.length?`<details style="margin-top:12px"><summary class="muted">${L("سجل الأرصدة المضافة","Credit history")} (${credits.length})</summary><table class="list"><tbody>
     ${credits.map(c=>`<tr><td>${name(c.staffId)}</td><td class="nowrap">${c.type==="ramadan"?`+${c.hours} ${L("ساعة رمضان","Ramadan h")}`:`${c.days>0?"+":""}${c.days} ${L(...(BAL_NAMES[c.type]||[c.type,c.type]))}`}</td><td class="muted">${c.auto==="holiday"?L("تلقائي: دوام في ","Auto: worked on ")+(c.holidays||[]).map(h=>L(...HOLIDAY_NAMES[h])).join(L("، ",", ")):c.auto==="ramadan"?L("تلقائي: رمضان","Auto: Ramadan"):esc(c.reason||"")}${c.month?` (${monthLabel(c.month)})`:""}</td><td>${isAdmin()&&!c.auto?`<button class="btn small ghost" data-act="crDel" data-id="${c.id}">✕</button>`:""}</td></tr>`).join("")}
     </tbody></table></details>`:""}
    </div>
   </div></div>`;
  const lf=$("#leaveForm");
  if(lf){
    const info=e=>{ const f=new FormData(lf), type=f.get("type"), T=LEAVE_TYPES[type], sid=f.get("staffId"); if(!sid) return;
      if(T.fixed && f.get("from") && (!e || e.target.name!=="to")){ lf.elements.to.value=addDays(f.get("from"),T.fixed-1); dateHint(lf.elements.to); }
      lf.elements.to.readOnly=!!T.fixed;
      const from=lf.elements.from.value, to=lf.elements.to.value, b=balances(sid);
      const parts=[];
      if(from&&to&&to>=from) parts.push(L(`${daysBetween(from,to)} يوم`,`${daysBetween(from,to)} day(s)`));
      if(T.fixed) parts.push(L("المدة ثابتة 12 أسبوع (84 يوم) تُحسب تلقائياً","Fixed 12 weeks (84 days), end date set automatically"));
      parts.push(T.bal ? L(`الرصيد المتاح: ${b[T.bal]}`,`Available balance: ${b[T.bal]}`) : L("لا تُخصم من رصيد","Not deducted from a balance"));
      $("#lvInfo").textContent = parts.join(" — "); };
    lf.addEventListener("input",info); lf.addEventListener("change",info); info();
    lf.addEventListener("submit",async e=>{ e.preventDefault(); const f=new FormData(lf), from=f.get("from"), to=f.get("to");
      if(!from||!to||to<from){ toast(L("تاريخ النهاية يجب أن يكون بعد البداية","End date must be after start date"),true); return; }
      const sid=f.get("staffId"), type=f.get("type"), days=daysBetween(from,to);
      if(Object.values(S.leaves).some(l=>l.staffId===sid && l.status!=="rejected" && !(to<l.from||from>l.to)) && !confirm(L("توجد إجازة أخرى متداخلة. متابعة؟","Another leave overlaps this period. Continue?"))) return;
      const balKey=LEAVE_TYPES[type].bal, bal=balKey?balances(sid)[balKey]:Infinity;
      if(days>bal && !confirm(L(`الرصيد المتاح ${bal} يوم والطلب ${days} يوم. تسجيل رغم ذلك؟`,`Available ${bal} day(s), requested ${days}. Record anyway?`))) return;
      await put("leaves",uid(),{staffId:sid,unitId:S.staff[sid].unitId,type,from,to,days,note:String(f.get("note")).trim(),status:"prelim",prelimBy:ME.uid,prelimByName:ME.name,createdAt:new Date().toISOString()});
      audit("leave.prelim",`${S.staff[sid].name} ${from}→${to}`); toast(L("تم التسجيل بموافقة مبدئية — بانتظار اعتماد المنجر","Recorded with initial approval — awaiting manager approval")); render(); });
  }
  const cf=$("#creditForm");
  if(cf) cf.addEventListener("submit",async e=>{ e.preventDefault(); const f=new FormData(cf), sid=f.get("staffId"), type=f.get("type"), amt=Number(f.get("amount"))||0;
    const data={staffId:sid,unitId:S.staff[sid].unitId,type,reason:String(f.get("reason")).trim(),date:todayStr(),by:ME.uid};
    if(type==="ramadan") data.hours=amt; else data.days=amt;
    await put("credits",uid(),data); audit("credit.add",`${S.staff[sid].name} ${type} ${amt}`); toast(L("تمت الإضافة","Added")); render(); });
}

/* ---------- swaps ---------- */
function renderSwaps(main){
  const unit=UI.unit, staff=staffOf(unit);
  const list=Object.entries(S.swaps).map(([id,w])=>({id,...w})).filter(w=>w.unitId===unit).sort((a,b)=>(a.status==="prelim"?0:1)-(b.status==="prelim"?0:1) || (b.from||"").localeCompare(a.from||""));
  const opt=s=>`<option value="${s.id}">${esc(s.name)} — ${esc(titleName(s))}</option>`;
  const name=id=>esc(S.staff[id]?.name||"—");
  main.innerHTML=`<div class="grid2">
   <div>${canHeadEdit()?`<div class="panel"><h2>${L("طلب تبديل مناوبات","Shift swap request")}</h2>
    <p class="muted small-text" style="margin-top:0">${L("كل موظف ياخذ مناوبات الثاني في الفترة المحددة. التسجيل من الهيدنيرس موافقة مبدئية، ويتطبق على الجدول بعد اعتماد المنجر.","Each person takes the other's shifts for the period. Recording by the head nurse is the initial approval; it applies to the roster after the manager approves.")}</p>
    <form class="form" id="swapForm">
      <div class="two"><label>${L("الموظف الأول","First person")}<select class="field" name="a">${staff.map(opt).join("")}</select></label>
      <label>${L("الموظف الثاني","Second person")}<select class="field" name="b">${staff.map((s,i)=>opt(s)).join("")}</select></label></div>
      <div class="two"><label>${L("من (ميلادي)","From (Gregorian)")}<input class="field" type="date" name="from" required></label><label>${L("إلى (ميلادي)","To (Gregorian)")}<input class="field" type="date" name="to" required></label></div>
      <label>${L("السبب","Reason")}<input class="field" name="note"></label>
      <div class="row"><button class="btn" type="button" data-act="swapPreview">${L("معاينة","Preview")}</button><button class="btn primary" type="submit">${L("تسجيل بموافقة مبدئية","Record with initial approval")}</button></div>
    </form><div id="swapPrev"></div></div>`:""}</div>
   <div class="panel"><h2>${L("طلبات التبديل","Swap requests")}</h2>
    ${list.length?`<div class="tbl-wrap"><table class="list"><thead><tr><th>${L("الموظفان","People")}</th><th>${L("الفترة","Period")}</th><th>${L("الحالة","Status")}</th><th></th></tr></thead><tbody>
    ${list.map(w=>`<tr><td><b>${name(w.a)}</b> ⇄ <b>${name(w.b)}</b>${w.note?`<br><span class="muted small-text">${esc(w.note)}</span>`:""}</td><td class="period">${fmtDual(w.from)}<span class="to">${L("إلى","to")}</span>${fmtDual(w.to)}</td><td><span class="pill st-${w.status}">${stName(w.status)}</span></td>
      <td class="nowrap">${w.status==="prelim"&&isMgr()?`<button class="btn small" data-act="swapView" data-id="${w.id}">${L("معاينة","Preview")}</button> <button class="btn small primary" data-act="swapApprove" data-id="${w.id}">${L("اعتماد","Approve")}</button> <button class="btn small danger" data-act="swapReject" data-id="${w.id}">${L("رفض","Reject")}</button>`:""}
      ${w.status==="prelim"&&canHeadEdit()?` <button class="btn small ghost" data-act="swapDel" data-id="${w.id}">✕</button>`:""}</td></tr>`).join("")}
    </tbody></table></div>`:`<p class="muted">${L("لا توجد طلبات تبديل.","No swap requests.")}</p>`}
   </div></div>`;
  const sf=$("#swapForm");
  if(sf){
    if(staff[1]) sf.elements.b.value=staff[1].id;
    sf.addEventListener("submit",async e=>{ e.preventDefault(); const w=readSwap(sf); if(!w) return;
      await put("swaps",uid(),{...w,status:"prelim",prelimBy:ME.uid,prelimByName:ME.name,createdAt:new Date().toISOString()});
      audit("swap.prelim",`${S.staff[w.a].name} ⇄ ${S.staff[w.b].name} ${w.from}→${w.to}`); toast(L("تم التسجيل — بانتظار اعتماد المنجر","Recorded — awaiting manager approval")); render(); });
  }
}
function readSwap(f){
  const a=f.elements.a.value, b=f.elements.b.value, from=f.elements.from.value, to=f.elements.to.value;
  if(a===b){ toast(L("اختاري موظفين مختلفين","Choose two different people"),true); return null; }
  if(!from||!to||to<from){ toast(L("تحققي من التواريخ","Check the dates"),true); return null; }
  if(catOf(S.staff[a])!==catOf(S.staff[b])){ toast(L("التبديل يكون بين نفس الفئة (ستاف نيرس مع ستاف نيرس، مساعد مع مساعد)","Swaps must be within the same category (nurse with nurse, assistant with assistant)"),true); return null; }
  if(patternOf(S.staff[a],UI.unit).sys!==patternOf(S.staff[b],UI.unit).sys){ toast(L("الموظفان على نظام ساعات مختلف","The two people are on different hour systems"),true); return null; }
  return {unitId:UI.unit,a,b,from,to,note:(f.elements.note?.value||"").trim()};
}
function swapPreviewHTML(w){
  const changes=applySwapToGrids(w);
  if(!changes.length) return `<div class="note-box">${L("لا يوجد جدول لهذه الفترة بعد. سيتم تطبيق التبديل عند وجود الجدول؟ لا — يُفضّل بناء الجدول أولاً.","No roster exists for this period yet — build the roster first.")}</div>`;
  let html="";
  changes.forEach(ch=>{
    const before=analyze(w.unitId,ch.m), after=analyze(w.unitId,ch.m,ch.grid);
    const mine=a=>a.issues.filter(i=>i.sid===w.a||i.sid===w.b||i.sev===3);
    const n=dim(ch.m), c=unitCfg(w.unitId);
    const row=sid=>{ let r=`<tr><td class="name"><b>${esc(S.staff[sid].name)}</b></td>`; for(let d=1;d<=n;d++){ const date=dayOf(ch.m,d), inR=date>=w.from&&date<=w.to, v=after.lv[sid][d]?.code||ch.grid[sid]?.[d]||"", sh=c.byCode[v]; r+=`<td class="c ${inR?"inr":""} ${v==="OFF"?"off":""} ${after.bad[sid]?.[d]?"bad":""}" ${sh?`style="--cc:${sh.color}"`:""}>${v==="OFF"?"–":esc(v)}</td>`; } return r+"</tr>"; };
    const newIssues=mine(after).filter(i=>!mine(before).some(j=>j.msg===i.msg));
    html+=`<h3 class="sub">${monthLabel(ch.m)} — ${L("بعد التبديل","after swap")}</h3><div class="roster-wrap mini"><table class="roster"><tbody>${row(w.a)}${row(w.b)}</tbody></table></div>
      ${newIssues.length?`<ul class="issues">${newIssues.map(i=>`<li class="sev${i.sev}">${esc(i.msg)}</li>`).join("")}</ul>`:`<div class="ok-line">${L("لا توجد مخالفات جديدة بسبب التبديل ✓","No new rule issues from this swap ✓")}</div>`}`;
  });
  return html;
}

/* ---------- staff (admin edits) ---------- */
function renderStaff(main){
  const unit=UI.unit, list=staffOf(unit,true), mu=myUnits(), titles=settings().titles;
  const form = isAdmin() ? `<div class="panel"><h2 id="sfTitle">${L("إضافة موظف","Add staff member")}</h2>
     <form class="form" id="staffForm"><input type="hidden" name="id">
      <div class="two"><label>${L("الرقم الوظيفي","Employee number")}<input class="field" name="empNo" required></label>
      <label>${L("الاسم","Name")}<input class="field" name="name" required></label></div>
      <div class="two"><label>${L("المسمى الوظيفي","Job title")}<select class="field" name="titleId">${titles.map(t=>`<option value="${t.id}">${esc(L(t.ar,t.en))}</option>`).join("")}</select></label>
      <label>${L("القسم","Unit")}<select class="field" name="unitId">${mu.map(u=>`<option value="${u.id}" ${u.id===unit?"selected":""}>${esc(unitName(u.id))}</option>`).join("")}</select></label></div>
      <label>${L("نظام الدوام","Work pattern")}<select class="field" name="system"><option value="">${L("حسب القسم","Follow unit")}</option>${[["12",SYSTEM_NAMES["12"]],["9",SYSTEM_NAMES["9"]]].map(([k,v])=>`<option value="${k}">${L(v[0],v[1])}</option>`).join("")}</select></label>
      <div class="two"><label>${L("رصيد السنوية الافتتاحي (يوم)","Opening annual balance (days)")}<input class="field" name="annualOpening" type="number" step="0.5" value="0"></label>
      <label>${L("رصيد التعويضية الافتتاحي (يوم)","Opening comp balance (days)")}<input class="field" name="compOpening" type="number" step="0.5" value="0"></label></div>
      <label class="check"><input type="checkbox" name="nightOk" checked> ${L("يمكن جدولته في الليلي","Can work night shifts")}</label>
      <label class="check"><input type="checkbox" name="ramadanReduced"> ${L("يستحق دوام رمضان المخفّض","Eligible for reduced Ramadan hours")}</label>
      <label class="check"><input type="checkbox" name="active" checked> ${L("على رأس العمل","Active")}</label>
      <p class="muted small-text" id="sfHint"></p>
      <div class="row"><button class="btn primary" type="submit">${L("حفظ","Save")}</button><button class="btn" type="button" data-act="staffNew">${L("جديد","New")}</button></div>
     </form></div>
     <div class="panel upload-panel"><h2>${L("رفع ملف Excel للموظفين","Upload staff Excel file")}</h2>
      <p class="muted small-text" style="margin-top:0">${L("يقبل ملفات ‎.xlsx و‎.xls و‎.csv. النظام يتعرف على الأعمدة تلقائياً، ويعرض لك معاينة قبل الحفظ. يمكن أن يحتوي الملف على موظفين من أقسام مختلفة.","Accepts .xlsx, .xls and .csv. Columns are detected automatically and you get a preview before saving. The file can include staff from several units.")}</p>
      <label class="drop" id="dropZone"><input type="file" id="xlFile" accept=".xlsx,.xls,.csv" hidden><b>${L("اختاري الملف أو اسحبيه هنا","Choose a file or drop it here")}</b><span class="muted small-text">${L("الأعمدة المقترحة: الرقم الوظيفي، الاسم، المسمى، القسم، رصيد السنوية، رصيد التعويضية","Suggested columns: employee no., name, title, unit, annual balance, comp balance")}</span></label>
      <div class="row" style="margin-top:8px"><button class="btn small" data-act="xlTemplate">${L("تحميل نموذج Excel جاهز","Download Excel template")}</button></div></div>
     <div class="panel"><h2>${L("لصق سريع من Excel","Quick paste from Excel")}</h2>
      <p class="muted small-text" style="margin-top:0">${L("انسخي الأعمدة بالترتيب: الرقم الوظيفي، الاسم، المسمى، رصيد السنوية، رصيد التعويضية — والصقيها هنا.","Copy columns in order: employee no., name, title, annual balance, comp balance — and paste here.")}</p>
      <textarea class="field" id="bulk" placeholder="10234	سارة أحمد	ستاف نيرس	21	0"></textarea>
      <div class="row" style="margin-top:8px"><button class="btn" data-act="bulkAdd">${L("إضافة إلى","Add to")} ${esc(unitName(unit))}</button></div></div>` : "";
  main.innerHTML = `<div class="${isAdmin()?"grid2":""}"><div>${form}</div>
   <div class="panel"><h2>${L("طاقم","Staff of")} ${esc(unitName(unit))} <span class="muted">(${list.filter(s=>s.active!==false).length})</span></h2>
    ${list.length?`<div class="tbl-wrap"><table class="list"><thead><tr><th>${L("الرقم","No.")}</th><th>${L("الاسم","Name")}</th><th>${L("المسمى","Title")}</th><th>${L("النظام","Pattern")}</th><th>${L("ليلي","Nights")}</th><th>${L("رمضان","Ramadan")}</th>${isAdmin()?"<th></th>":""}</tr></thead><tbody>
    ${list.map(s=>{ const P=patternOf(s,unit); return `<tr class="${s.active===false?"inactive":""}"><td>${esc(s.empNo)}</td><td><b>${esc(s.name)}</b></td><td>${esc(titleName(s))}<br><span class="muted small-text">${L(...CAT_NAMES[catOf(s)])}</span></td><td>${isFixed(s)?L(`ثابت صباحي ${titleById(s.titleId).fixedHours||9} س`,`Fixed mornings ${titleById(s.titleId).fixedHours||9}h`):`${P.sys} ${L("س","h")}${s.system?" *":""}`}</td><td>${s.nightOk===false?L("لا","No"):L("نعم","Yes")}</td><td>${s.ramadanReduced?L("مخفّض","Reduced"):"—"}</td>
      ${isAdmin()?`<td class="nowrap"><button class="btn small" data-act="staffEdit" data-id="${s.id}">${L("تعديل","Edit")}</button></td>`:""}</tr>`; }).join("")}
    </tbody></table></div>`:`<p class="muted">${L("لا يوجد موظفون.","No staff yet.")}</p>`}
   </div></div>`;
  const sf=$("#staffForm");
  if(sf) sf.addEventListener("submit", async e=>{
    e.preventDefault(); const f=new FormData(sf), id=f.get("id")||uid(), prev=S.staff[id];
    const empNo=String(f.get("empNo")).trim();
    const dup=Object.entries(S.staff).find(([k,s])=>k!==id && String(s.empNo)===empNo);
    if(dup){ toast(L(`الرقم الوظيفي مسجل مسبقاً باسم ${dup[1].name} في ${unitName(dup[1].unitId)}`,`Employee number already used by ${dup[1].name} in ${unitName(dup[1].unitId)}`),true); return; }
    const obj={...(prev||{}), empNo, name:String(f.get("name")).trim(), titleId:f.get("titleId"), unitId:f.get("unitId"), system:f.get("system")||"",
      annualOpening:Number(f.get("annualOpening"))||0, compOpening:Number(f.get("compOpening"))||0, nightOk:!!f.get("nightOk"), ramadanReduced:!!f.get("ramadanReduced"), active:!!f.get("active")};
    if(prev && prev.unitId!==obj.unitId){
      if(!confirm(L(`نقل ${obj.name} من ${unitName(prev.unitId)} إلى ${unitName(obj.unitId)}؟ تنتقل معه إجازاته وأرصدته وطلباته.`,`Transfer ${obj.name} from ${unitName(prev.unitId)} to ${unitName(obj.unitId)}? Leave, balances and requests move too.`))) return;
      const ops=[{op:"set",col:"staff",id,data:obj}];
      ["leaves","credits","requests","swaps"].forEach(col=>Object.entries(S[col]).forEach(([k,v])=>{ if(v.staffId===id || v.a===id || v.b===id) ops.push({op:"update",col,id:k,data:{unitId:obj.unitId}}); }));
      await batch(ops); audit("staff.transfer",`${obj.name}: ${unitName(prev.unitId)} → ${unitName(obj.unitId)}`);
      toast(L("تم النقل","Transferred"));
    } else { await put("staff",id,obj); audit(prev?"staff.edit":"staff.add",`${obj.empNo} ${obj.name}`); toast(prev?L("تم التحديث","Updated"):L("تمت الإضافة","Added")); }
    render();
  });
}

/* ---------- users (admin) ---------- */
function renderUsers(main){
  const users=Object.entries(S.users).map(([id,u])=>({id,...u})).sort((a,b)=>(a.active===false)-(b.active===false) || (a.name||"").localeCompare(b.name||"",lang));
  const units=Object.keys(S.units);
  const unitChecks=(sel)=>units.map(id=>`<label class="check chip"><input type="checkbox" name="units" value="${id}" ${sel.includes(id)?"checked":""}> ${esc(unitName(id))}</label>`).join("")||`<span class="muted">${L("أضيفي أقساماً أولاً","Add units first")}</span>`;
  main.innerHTML=`<div class="grid2">
   <div class="panel"><h2 id="ufTitle">${L("حساب جديد","New account")}</h2>
    <form class="form" id="userForm"><input type="hidden" name="id">
     <div class="two"><label>${L("الرقم الوظيفي","Employee number")}<input class="field" name="empNo" required></label>
     <label>${L("الاسم","Name")}<input class="field" name="name" required></label></div>
     <label>${L("إيميل العمل (لاستعادة كلمة المرور)","Work e-mail (for password recovery)")}<input class="field" name="email" type="email" dir="ltr" autocomplete="off" placeholder="name@moh.gov.sa"></label>
     <label>${L("الدور","Role")}<select class="field" name="role"><option value="head">${roleName("head")}</option><option value="manager">${roleName("manager")}</option><option value="admin">${roleName("admin")}</option></select></label>
     <div><div class="lbl">${L("الأقسام المسندة","Assigned units")}</div><div class="chips" id="unitChecks">${unitChecks([])}</div></div>
     <label id="pwRow">${L("كلمة مرور مؤقتة (8 أحرف على الأقل)","Temporary password (min 8)")}<input class="field" name="password" minlength="8" ${DEMO?"":"required"} autocomplete="new-password"></label>
     <p class="muted small-text">${L("يُطلب من المستخدم تغيير كلمة المرور عند أول دخول.","The user must change the password at first sign-in.")}</p>
     <div class="row"><button class="btn primary" type="submit">${L("حفظ","Save")}</button><button class="btn" type="button" data-act="userNew">${L("جديد","New")}</button></div>
    </form></div>
   <div class="panel"><h2>${L("المستخدمون","Users")} (${users.filter(u=>u.active!==false).length})</h2>
    <div class="tbl-wrap"><table class="list"><thead><tr><th>${L("الرقم","No.")}</th><th>${L("الاسم","Name")}</th><th>${L("الدور","Role")}</th><th>${L("الأقسام","Units")}</th><th></th></tr></thead><tbody>
    ${users.map(u=>`<tr class="${u.active===false?"inactive":""}"><td>${esc(u.empNo)}</td><td><b>${esc(u.name)}</b>${u.email?`<br><span class="muted small-text" dir="ltr">${esc(u.email)}</span>`:`<br><span class="warn-t small-text">${L("بدون إيميل","No e-mail")}</span>`}${u.active===false?` <span class="pill st-rejected">${L("موقوف","Disabled")}</span>`:""}</td><td>${roleName(u.role)}</td>
      <td class="small-text">${u.role==="admin"?L("كل الأقسام","All units"):(u.units||[]).map(unitName).map(esc).join("، ")||"—"}</td>
      <td class="nowrap">${u.id!==ME.uid?`<button class="btn small" data-act="userEdit" data-id="${u.id}">${L("تعديل","Edit")}</button> ${u.active===false?`<button class="btn small" data-act="userOn" data-id="${u.id}">${L("تفعيل","Enable")}</button>`:`${isRealEmail(u.email)?`<button class="btn small" data-act="userResetMail" data-id="${u.id}">${L("إرسال رابط إعادة التعيين","Send reset link")}</button> `:""}<button class="btn small" data-act="userReset" data-id="${u.id}">${L("كلمة مرور مؤقتة","Temporary password")}</button> <button class="btn small danger" data-act="userOff" data-id="${u.id}">${L("إيقاف","Disable")}</button>`}`:`<span class="muted small-text">${L("أنتِ","You")}</span>`}</td></tr>`).join("")}
    </tbody></table></div></div></div>`;
  $("#userForm").addEventListener("submit", async e=>{
    e.preventDefault(); const f=new FormData(e.target), id=f.get("id"), units=f.getAll("units");
    const data={empNo:String(f.get("empNo")||S.users[id]?.empNo||"").trim(), name:String(f.get("name")).trim(), role:f.get("role"), units};
    const email=String(f.get("email")||"").trim().toLowerCase();
    try{
      if(id){
        const old=S.users[id];
        if(email !== (old.email||"")){
          // the sign-in e-mail can only be set on a fresh account: replace it, keeping number, role and units
          if(DEMO){ await patch("users",id,{...data,email}); }
          else {
            const pw=prompt(L(`لتغيير الإيميل يُنشأ حساب بديل بنفس الرقم والصلاحيات. اكتبي كلمة مرور مؤقتة لـ ${data.name} (8 أحرف على الأقل):`,`Changing the e-mail creates a replacement account with the same number and permissions. Temporary password for ${data.name} (min 8):`));
            if(!pw) return; if(pw.length<8){ toast(L("8 أحرف على الأقل","At least 8 characters"),true); return; }
            await patch("users",id,{active:false});
            await createAccount({...data, email, password:pw});
          }
          audit("user.email",`${data.empNo} ${data.name}`); toast(L("تم تحديث الإيميل","E-mail updated"));
        } else { await patch("users",id,data); audit("user.edit",`${data.empNo} ${data.name} ${data.role}`); toast(L("تم التحديث","Updated")); }
      }
      else {
        if(Object.values(S.users).some(u=>u.active!==false && String(u.empNo)===data.empNo)){ toast(L("يوجد حساب فعّال بهذا الرقم. استخدمي «إعادة كلمة المرور».","An active account already uses this number. Use “Reset password”."),true); return; }
        await createAccount({...data, email, password:f.get("password")}); audit("user.create",`${data.empNo} ${data.name} ${data.role}`);
        toast(L(`تم إنشاء الحساب. أعطي ${data.name} الرقم الوظيفي وكلمة المرور المؤقتة.`,`Account created. Give ${data.name} the employee number and temporary password.`));
      }
      render();
    }catch(err){ toast(err.code==="auth/weak-password"?L("كلمة المرور ضعيفة","Password too weak"):(err.message||String(err)),true); }
  });
}

/* ---------- settings (admin) ---------- */
function renderSettings(main){
  const unit=UI.unit, u=S.units[unit], c=unit?unitCfg(unit):null, st=settings(), year=Number(UI.month.slice(0,4));
  const groups=holidayGroups(year).filter(g=>g.type!=="ramadan" || true);
  const audits=Object.entries(S.audit).map(([id,a])=>({id,...a})).sort((a,b)=>(b.at||"").localeCompare(a.at||"")).slice(0,200);
  main.innerHTML=`<div class="grid2">
  <div>
   <div class="panel"><h2>${L("الأقسام","Units")}</h2>
    <form class="form" id="unitForm">
     <div class="two"><label>${L("اسم القسم","Unit name")}<input class="field" name="name" required placeholder="${L("الباطنة نساء","Female Medical")}"></label>
     <label>${L("الاسم بالإنجليزي","English name")}<input class="field" name="nameEn" dir="ltr"></label></div>
     <label>${L("نظام المناوبات","Shift system")}<select class="field" name="system">${[["12",SYSTEM_NAMES["12"]],["9",SYSTEM_NAMES["9"]]].map(([k,v])=>`<option value="${k}">${L(v[0],v[1])}</option>`).join("")}</select></label>
     <button class="btn primary" type="submit">${L("إضافة القسم","Add unit")}</button>
    </form>
    <table class="list" style="margin-top:12px"><tbody>
     ${Object.keys(S.units).sort((a,b)=>unitName(a).localeCompare(unitName(b),lang)).map(id=>`<tr class="${id===unit?"sel-row":""}"><td><b>${esc(unitName(id))}</b><br><span class="muted small-text">${unitCfg(id).system} ${L("ساعات","hours")} · ${staffOf(id).length} ${L("موظف","staff")}${S.units[id].ramadanApply?L(" · دوام رمضان مطبّق"," · Ramadan hours applied"):""}</span></td>
      <td class="nowrap" style="text-align:end">${id!==unit?`<button class="btn small" data-act="unitPick" data-id="${id}">${L("إعداداته","Settings")}</button>`:""} <button class="btn small danger" data-act="unitDel" data-id="${id}">${L("حذف","Delete")}</button></td></tr>`).join("")||`<tr><td class="muted">${L("لا توجد أقسام.","No units.")}</td></tr>`}
    </tbody></table></div>
   <div class="panel"><h2>${L("المسميات الوظيفية","Job titles")}</h2>
    <div class="tbl-wrap"><table class="list" id="titleTbl"><thead><tr><th>${L("بالعربي","Arabic")}</th><th>${L("بالإنجليزي","English")}</th><th>${L("الفئة","Category")}</th><th>${L("دوام ثابت صباحي","Fixed morning")}</th><th>${L("ساعاته","Hours")}</th><th></th></tr></thead><tbody>
    ${st.titles.map((t,i)=>`<tr data-id="${esc(t.id)}"><td><input class="field" data-k="ar" value="${esc(t.ar)}"></td><td><input class="field" data-k="en" dir="ltr" value="${esc(t.en||"")}"></td>
      <td><select class="field" data-k="cat">${Object.entries(CAT_NAMES).map(([k,v])=>`<option value="${k}" ${t.cat===k?"selected":""}>${L(v[0],v[1])}</option>`).join("")}</select></td>
      <td><input type="checkbox" data-k="fixed" ${t.fixed?"checked":""} title="${L("صباحي من الأحد إلى الخميس، أوف الجمعة والسبت والعطل الرسمية","Mornings Sun–Thu, off Fri/Sat and official holidays")}"></td>
      <td><input class="field w64" type="number" min="1" max="24" data-k="fixedHours" value="${t.fixedHours||9}" title="${L("ساعات اليوم لأصحاب الدوام الثابت","Daily hours for fixed-schedule staff")}"></td>
      <td><button class="btn small ghost" data-act="titleDel" data-i="${i}">✕</button></td></tr>`).join("")}
    </tbody></table></div>
    <div class="row" style="margin-top:8px"><button class="btn" data-act="titleAdd">${L("إضافة مسمى","Add title")}</button><button class="btn primary" data-act="titleSave">${L("حفظ المسميات","Save titles")}</button></div></div>
   <div class="panel"><h2>${L("المواعيد الشهرية","Monthly deadlines")}</h2>
    <p class="muted small-text" style="margin-top:0">${L("أيام من الشهر السابق لشهر الجدول.","Days of the month before the roster month.")}</p>
    <div class="form"><div class="three">
     <label>${L("إغلاق الطلبات","Requests close")}<input class="field" type="number" min="1" max="28" id="dlReq" value="${st.deadlines.requests}"></label>
     <label>${L("رفع الجدول","Submit roster")}<input class="field" type="number" min="1" max="28" id="dlSub" value="${st.deadlines.submit}"></label>
     <label>${L("الاعتماد النهائي","Final approval")}<input class="field" type="number" min="1" max="31" id="dlFin" value="${st.deadlines.final}"></label></div>
     <button class="btn primary" data-act="dlSave">${L("حفظ المواعيد","Save deadlines")}</button></div></div>
   <div class="panel"><h2>${L("العطل ورمضان","Holidays & Ramadan")} ${year}</h2>
    <p class="muted small-text" style="margin-top:0">${L("تُحسب تلقائياً من تقويم أم القرى. إذا اختلف الإعلان الرسمي بيوم، عدّلي هنا.","Calculated automatically from Umm al-Qura. If the official announcement differs by a day, adjust here.")}</p>
    <table class="list"><tbody>
     <tr><td>${L(...HOLIDAY_NAMES.founding)}</td><td>${fmtDual(year+"-02-22")}</td><td></td></tr>
     <tr><td>${L(...HOLIDAY_NAMES.national)}</td><td>${fmtDual(year+"-09-23")}</td><td></td></tr>
     ${groups.map(g=>`<tr><td>${g.type==="ramadan"?L("رمضان","Ramadan"):L(...HOLIDAY_NAMES[g.type])} ${g.hy}${L("هـ","AH")}</td><td class="period">${fmtDual(g.from)}<span class="to">${L("إلى","to")}</span>${fmtDual(g.to)}</td>
      <td class="nowrap"><button class="btn small" data-act="eidShift" data-k="${g.key}" data-v="-1">−1</button> <button class="btn small" data-act="eidShift" data-k="${g.key}" data-v="1">+1</button>${st.eidOffsets[g.key]?` <span class="muted small-text">(${st.eidOffsets[g.key]>0?"+":""}${st.eidOffsets[g.key]})</span>`:""}</td></tr>`).join("")}
    </tbody></table></div>
  </div>
  <div>
   ${u?`<div class="panel"><h2>${L("إعدادات قسم","Unit settings —")} ${esc(unitName(unit))}</h2>
    <div class="form">
     <div class="two"><label>${L("اسم القسم","Unit name")}<input class="field" id="uName" value="${esc(u.name)}"></label><label>${L("الاسم بالإنجليزي","English name")}<input class="field" id="uNameEn" dir="ltr" value="${esc(u.nameEn||"")}"></label></div>
     <div class="lbl">${L("المناوبات","Shifts")} — ${L(...SYSTEM_NAMES[c.system])}</div>
     <div class="tbl-wrap"><table class="list" id="shiftTbl"><thead><tr><th>${L("الرمز","Code")}</th><th>${L("الاسم","Name")}</th><th>${L("من","From")}</th><th>${L("إلى","To")}</th><th>${L("ساعات","Hours")}</th><th>${L("حد ستاف نيرس","Nurse min")}</th><th>${L("لون","Colour")}</th><th>${L("ليلي","Night")}</th></tr></thead><tbody>
     ${c.shifts.map(sh=>`<tr><td><input class="field w56" data-k="code" value="${esc(sh.code)}" maxlength="3" dir="ltr"></td><td><input class="field w90" data-k="ar" value="${esc(sh.ar)}"><input class="field w90" data-k="en" dir="ltr" value="${esc(sh.en||"")}"></td>
      <td><input class="field" type="time" data-k="start" value="${esc(sh.start)}"></td><td><input class="field" type="time" data-k="end" value="${esc(sh.end)}"></td>
      <td><input class="field w64" type="number" data-k="hours" value="${sh.hours}"></td><td><input class="field w64" type="number" min="0" data-k="min" value="${c.mins[sh.code]??0}"></td>
      <td><input type="color" data-k="color" value="${esc(sh.color)}"></td><td><input type="checkbox" data-k="night" ${sh.night?"checked":""}></td></tr>`).join("")}
     </tbody></table></div>
     <div class="two"><label>${L("الحد الأدنى للمساعدين في كل مناوبة","Minimum assistants per shift")}<input class="field" type="number" min="0" id="uAssist" value="${c.assistMin}"></label>
     <label>${L("بعد آخر ليلي","After the last night")}<select class="field" id="uRest">
       <option value="0" ${c.rest===0?"selected":""}>${L("مسموح أي مناوبة","Any shift allowed")}</option>
       <option value="1" ${c.rest===1?"selected":""}>${L("يوم راحة على الأقل","At least 1 day off")}</option>
       <option value="2" ${c.rest===2?"selected":""}>${L("يومين راحة على الأقل","At least 2 days off")}</option></select></label></div>
     <div class="lbl">${L("دوام رمضان","Ramadan hours")}</div>
     <label class="check"><input type="checkbox" id="uRam" ${c.ramadanApply?"checked":""}> ${L("القسم يطبّق دوام رمضان المخفّض (6 ساعات) للمستحقين","Unit applies reduced Ramadan hours (6h) for eligible staff")}</label>
     <p class="muted small-text">${L("إذا لم يُطبّق: يداوم المستحق دوامه العادي، والساعات الزائدة عن 6 تُضاف تلقائياً لرصيد ساعات رمضان عند اعتماد الجدول.","If not applied: eligible staff work normal hours and the hours above 6 are added to their Ramadan hours balance when the roster is approved.")}</p>
     <div class="tbl-wrap"><table class="list" id="ramTbl"><thead><tr><th>${L("المناوبة","Shift")}</th><th>${L("من","From")}</th><th>${L("إلى","To")}</th><th>${L("ساعات","Hours")}</th></tr></thead><tbody>
     ${c.shifts.map(sh=>{ const r=c.ramadan[sh.code]||{start:"",end:"",hours:6}; return `<tr data-code="${esc(sh.code)}"><td>${esc(sh.code)} ${esc(shiftName(sh))}</td><td><input class="field" type="time" data-k="start" value="${esc(r.start)}"></td><td><input class="field" type="time" data-k="end" value="${esc(r.end)}"></td><td><input class="field w64" type="number" data-k="hours" value="${r.hours??6}"></td></tr>`; }).join("")}
     </tbody></table></div>
     <div class="row"><button class="btn primary" data-act="unitSave">${L("حفظ إعدادات القسم","Save unit settings")}</button></div>
    </div></div>`:""}
   <div class="panel"><h2>${L("سجل التعديلات","Activity log")}</h2>
    ${audits.length?`<div class="tbl-wrap audit"><table class="list"><tbody>${audits.map(a=>`<tr><td class="nowrap muted small-text">${esc((a.at||"").replace("T"," ").slice(0,16))}</td><td>${esc(a.byName)}</td><td><code>${esc(a.action)}</code></td><td class="small-text">${esc(a.details)}</td></tr>`).join("")}</tbody></table></div>`:`<p class="muted">${L("لا يوجد نشاط بعد.","No activity yet.")}</p>`}
   </div>
  </div></div>`;
  $("#unitForm").addEventListener("submit", async e=>{
    e.preventDefault(); const f=new FormData(e.target), sys=f.get("system"), t=TEMPLATES[sys], id=uid();
    await put("units",id,{name:String(f.get("name")).trim(), nameEn:String(f.get("nameEn")).trim(), system:sys, shifts:clone(t.shifts), mins:{...t.mins}, assistMin:1, restAfterNight:1, ramadanApply:false, ramadan:clone(t.ramadan)});
    audit("unit.add", f.get("name")); UI.unit=id; toast(L("تمت إضافة القسم","Unit added")); render();
  });
}

/* ---------- export ---------- */
function downloadCSV(name, rows){
  const q=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  const blob=new Blob(["\uFEFF"+rows.map(r=>r.map(q).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },500);
}
function exportRoster(){
  const A=analyze(UI.unit,UI.month), n=A.n;
  const rows=[[L("الرقم الوظيفي","Emp no."),L("الاسم","Name"),L("المسمى","Title"),...Array.from({length:n},(_,i)=>i+1),L("أيام","Days"),L("ساعات","Hours")]];
  A.staff.forEach(s=>{ const r=[s.empNo,s.name,titleName(s)]; for(let d=1;d<=n;d++){ const v=A.lv[s.id][d]?.code || A.grid[s.id]?.[d] || ""; const hc=A.grid[s.id]&&holDayCode(dayOf(UI.month,d),v); r.push(hc?hc.code:v); } r.push(A.per[s.id].days, A.per[s.id].hours); rows.push(r); });
  A.c.shifts.forEach(sh=>{ const r=["",L("تغطية ستاف نيرس ","Nurse coverage ")+sh.code,""]; for(let d=1;d<=n;d++) r.push(A.cov.counted[d][sh.code]); rows.push(r); });
  downloadCSV(`roster-${unitName(UI.unit)}-${UI.month}.csv`, rows);
}
function exportBalances(){
  const keys=[...DAY_BALS,"ramadan"];
  const rows=[[L("الرقم الوظيفي","Emp no."),L("الاسم","Name"),L("المسمى","Title"),...keys.map(k=>L(...BAL_NAMES[k]))]];
  staffOf(UI.unit).forEach(s=>{ const b=balances(s.id); rows.push([s.empNo,s.name,titleName(s),...keys.map(k=>b[k])]); });
  downloadCSV(`balances-${unitName(UI.unit)}-${todayStr()}.csv`, rows);
}

/* ---------- events ---------- */
function readTable(sel){ return $$(sel+" tbody tr").map(tr=>{ const o={}; tr.querySelectorAll("[data-k]").forEach(i=>{ o[i.dataset.k]= i.type==="checkbox"?i.checked : i.type==="number"?Number(i.value) : i.value.trim(); }); if(tr.dataset.id) o.id=tr.dataset.id; if(tr.dataset.code) o.code=tr.dataset.code; return o; }); }

document.addEventListener("click", async e=>{
  const t=e.target.closest("[data-act],[data-tab],[data-brush]");
  if(UI.bellOpen && !e.target.closest(".bell-wrap")){ UI.bellOpen=false; if(!t){ render(); return; } }
  if(!t) return;
  if(t.dataset.tab){ UI.tab=t.dataset.tab; UI.bellOpen=false; render(); window.scrollTo(0,0); return; }
  if(t.classList.contains("brush")){ UI.brush=t.dataset.brush; $$(".brush").forEach(b=>b.setAttribute("aria-pressed",b===t)); return; }
  const act=t.dataset.act, id=t.dataset.id;
  const unit=UI.unit, month=UI.month, sid=schedId(unit,month), sch=S.schedules[sid];
  switch(act){
    case "lang": lang = lang==="en"?"ar":"en"; try{ localStorage.setItem("roster-lang",lang); }catch(err){} if(ME) DB.update("users",ME.uid,{lang}).catch(()=>{}); applyLang(); if(ME&&UI.ready){ app().innerHTML=""; render(); } else if(DEMO) renderLogin(); else location.reload(); break;
    case "demoLogin": try{ localStorage.setItem("roster-demo-user",id); }catch(err){} startSession(id); break;
    case "logout": logout(); break;
    case "pw": renderChangePw(false); break;
    case "dlgClose": closeDialog(); break;
    case "bell": UI.bellOpen=!UI.bellOpen; render(); break;
    case "noteGo": { const n=UI._notes[Number(t.dataset.i)]; UI.bellOpen=false; if(n){ Object.assign(UI,n.go); } render(); break; }
    case "mPrev": UI.month=shiftMonth(UI.month,-1); render(); break;
    case "mNext": UI.month=shiftMonth(UI.month,1); render(); break;
    case "openRoster": UI.unit=id; UI.tab="roster"; render(); break;
    /* roster */
    case "smart": {
      if(sch && Object.keys(sch.grid||{}).length && !confirm(L("سيُعاد بناء الجدول بالكامل بالتوزيع الذكي، وتُمسح التعديلات اليدوية. متابعة؟","The roster will be rebuilt by smart distribution and manual edits will be replaced. Continue?"))) return;
      const g=generate(unit,month);
      S.schedules[sid]={...(sch||{unitId:unit,month,status:"draft"}), grid:g};
      await put("schedules",sid,{...S.schedules[sid], updatedBy:ME.uid, updatedAt:new Date().toISOString()});
      audit("roster.generate",`${unitName(unit)} ${month}`); render();
      const A=analyze(unit,month), k=A.issues.filter(i=>i.sev===3).length;
      toast(k?L(`تم التوزيع — يوجد ${k} نقص في التغطية لا يكفيه عدد الموظفين`,`Done — ${k} coverage gaps remain (not enough staff)`):L("تم التوزيع ✓ راجعي الجدول","Done ✓ please review the roster"));
      break; }
    case "clearSched": if(confirm(L("تفريغ جدول هذا الشهر؟","Clear this month's roster?"))){ await put("schedules",sid,{...sch,grid:{}}); render(); } break;
    case "submitSched": {
      const A=analyze(unit,month), k=A.issues.filter(i=>i.sev>=2).length;
      if(k && !confirm(L(`يوجد ${k} ملاحظة مهمة في الجدول. رفع للاعتماد رغم ذلك؟`,`There are ${k} important notes. Submit anyway?`))) return;
      await patch("schedules",sid,{status:"submitted",submittedBy:ME.uid,submittedByName:ME.name,submittedAt:new Date().toISOString(),note:""});
      audit("roster.submit",`${unitName(unit)} ${month}`); toast(L("تم الرفع للاعتماد","Submitted for approval")); render(); break; }
    case "approveSched":
      await patch("schedules",sid,{status:"approved",approvedBy:ME.uid,approvedByName:ME.name,approvedAt:new Date().toISOString()});
      await autoCredits(unit,month); audit("roster.approve",`${unitName(unit)} ${month}`); toast(L("تم الاعتماد النهائي وتحديث الأرصدة التلقائية","Approved; automatic credits updated")); render(); break;
    case "returnSched": { const note=prompt(L("ملاحظة للهيدنيرس (سبب الإعادة):","Note for the head nurse (reason):")); if(note===null) return;
      await patch("schedules",sid,{status:"returned",note}); audit("roster.return",`${unitName(unit)} ${month}: ${note}`); render(); break; }
    case "reopenSched": if(confirm(L("فتح الجدول المعتمد للتعديل؟","Reopen the approved roster for editing?"))){ await patch("schedules",sid,{status:"draft"}); audit("roster.reopen",`${unitName(unit)} ${month}`); render(); } break;
    case "csvRoster": exportRoster(); break;
    case "csvBalances": exportBalances(); break;
    case "print": window.print(); break;
    /* requests */
    case "reqPick": UI.reqStaff=id; render(); break;
    case "reqDay": { const d=Number(t.dataset.d); if(UI._reqOff.has(d)) UI._reqOff.delete(d); else UI._reqOff.add(d); t.classList.toggle("on"); break; }
    case "reqSave": {
      const s=UI.reqStaff, nf=Number($("#reqNNf").value)||0, nt=Number($("#reqNNt").value)||0;
      const doc={unitId:unit, staffId:s, month, off:[...UI._reqOff].sort((a,b)=>a-b), pref:$("#reqPref").value, fullNights:$("#reqFull").checked,
        noNightFrom:nf&&nt?Math.min(nf,nt):null, noNightTo:nf&&nt?Math.max(nf,nt):null, note:$("#reqNote").value.trim(), by:ME.uid, at:new Date().toISOString()};
      if(doc.fullNights && S.staff[s]?.nightOk===false){ toast(L("هذا الموظف ممنوع من الليلي في بياناته","This person is marked as not working nights"),true); return; }
      await put("requests",`${s}_${month}`,doc); audit("request.save",`${S.staff[s]?.name} ${month}`); toast(L("تم حفظ الطلبات","Requests saved")); render(); break; }
    case "reqDel": await remove("requests",`${UI.reqStaff}_${month}`); render(); break;
    /* leave */
    case "lvApprove": { const l=S.leaves[id], bk=LEAVE_TYPES[l.type]?.bal, bal=bk?balances(l.staffId)[bk]:Infinity;
      if(l.days>bal && !confirm(L(`الرصيد المتاح ${bal} يوم والإجازة ${l.days} يوم. اعتماد رغم ذلك؟`,`Available ${bal}, leave ${l.days} days. Approve anyway?`))) return;
      await patch("leaves",id,{status:"approved",finalBy:ME.uid,finalByName:ME.name,finalAt:new Date().toISOString()}); audit("leave.approve",`${S.staff[l.staffId]?.name} ${l.from}→${l.to}`); toast(L("تم الاعتماد النهائي","Approved")); render(); break; }
    case "lvReject": { const r=prompt(L("سبب الرفض:","Reason for rejection:")); if(r===null) return; await patch("leaves",id,{status:"rejected",reason:r,finalBy:ME.uid,finalByName:ME.name}); audit("leave.reject",`${S.staff[S.leaves[id].staffId]?.name}: ${r}`); render(); break; }
    case "lvDel": if(confirm(L("حذف هذه الإجازة؟","Delete this leave?"))){ audit("leave.delete",`${S.staff[S.leaves[id].staffId]?.name}`); await remove("leaves",id); render(); } break;
    case "crDel": if(confirm(L("حذف هذا الرصيد؟","Delete this credit?"))){ await remove("credits",id); render(); } break;
    /* swaps */
    case "swapPreview": { const w=readSwap($("#swapForm")); if(w) $("#swapPrev").innerHTML=swapPreviewHTML(w); break; }
    case "swapView": openDialog(L("معاينة التبديل","Swap preview"), swapPreviewHTML(S.swaps[id]), ""); break;
    case "swapApprove": {
      const w=S.swaps[id], changes=applySwapToGrids(w);
      if(!changes.length && !confirm(L("لا يوجد جدول لهذه الفترة بعد. اعتماد الطلب بدون تطبيق؟","No roster exists for this period. Approve without applying?"))) return;
      const ops=changes.map(ch=>({op:"update",col:"schedules",id:ch.id,data:{grid:ch.grid}}));
      ops.push({op:"update",col:"swaps",id,data:{status:"approved",finalBy:ME.uid,finalByName:ME.name,finalAt:new Date().toISOString(),applied:changes.length>0}});
      await batch(ops); changes.forEach(ch=>{ S.schedules[ch.id]={...S.schedules[ch.id],grid:ch.grid}; });
      for(const ch of changes) if(S.schedules[ch.id]?.status==="approved") await autoCredits(w.unitId,ch.m);
      audit("swap.approve",`${S.staff[w.a]?.name} ⇄ ${S.staff[w.b]?.name}`); closeDialog(); toast(L("تم اعتماد التبديل وتطبيقه على الجدول","Swap approved and applied")); render(); break; }
    case "swapReject": { const r=prompt(L("سبب الرفض:","Reason:")); if(r===null) return; await patch("swaps",id,{status:"rejected",reason:r,finalBy:ME.uid}); render(); break; }
    case "swapDel": if(confirm(L("حذف الطلب؟","Delete request?"))){ await remove("swaps",id); render(); } break;
    /* staff */
    case "staffEdit": { const s=S.staff[id], f=$("#staffForm"), E=f.elements; E.id.value=id;
      ["empNo","name","titleId","unitId","system","annualOpening","compOpening"].forEach(k=>E[k].value=s[k]??"");
      E.nightOk.checked=s.nightOk!==false; E.ramadanReduced.checked=!!s.ramadanReduced; E.active.checked=s.active!==false;
      $("#sfTitle").textContent=L("تعديل: ","Edit: ")+s.name; $("#sfHint").textContent=L("لنقل الموظف لقسم آخر غيّري القسم واحفظي.","To transfer, change the unit and save."); f.scrollIntoView({behavior:"smooth",block:"start"}); break; }
    case "staffNew": { const f=$("#staffForm"); f.reset(); f.elements.id.value=""; $("#sfTitle").textContent=L("إضافة موظف","Add staff member"); $("#sfHint").textContent=""; break; }
    case "bulkAdd": {
      const titles=settings().titles, lines=$("#bulk").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean), ops=[], skipped=[];
      const used=new Set(Object.values(S.staff).map(s=>String(s.empNo)));
      lines.forEach(line=>{ const p=line.split(/\t|,|؛|;/).map(x=>x.trim()); if(!p[0]||!p[1]) return;
        if(used.has(p[0])){ skipped.push(p[0]); return; } used.add(p[0]);
        const tt=titles.find(t=>p[2] && (t.ar===p[2]||(t.en||"").toLowerCase()===p[2].toLowerCase())) || titles[0];
        ops.push({op:"set",col:"staff",id:uid(),data:{empNo:p[0],name:p[1],titleId:tt.id,unitId:unit,system:"",annualOpening:Number(p[3])||0,compOpening:Number(p[4])||0,nightOk:true,ramadanReduced:false,active:true}}); });
      if(ops.length){ await batch(ops); audit("staff.bulk",`${ops.length} → ${unitName(unit)}`); }
      toast(L(`تمت إضافة ${ops.length}`,`Added ${ops.length}`)+(skipped.length?L(` — تم تجاهل أرقام مكررة: ${skipped.join("، ")}`,` — skipped duplicates: ${skipped.join(", ")}`):"")); render(); break; }
    /* users */
    case "userNew": { const f=$("#userForm"); f.reset(); f.elements.id.value=""; f.elements.empNo.disabled=false; $("#pwRow").hidden=false; $("#ufTitle").textContent=L("حساب جديد","New account"); break; }
    case "userEdit": { const u=S.users[id], f=$("#userForm"), E=f.elements; E.id.value=id; E.empNo.value=u.empNo; E.empNo.disabled=true; E.name.value=u.name; E.role.value=u.role; E.email.value=u.email||"";
      $$("#unitChecks input").forEach(i=>i.checked=(u.units||[]).includes(i.value)); $("#pwRow").hidden=true; E.password.required=false; $("#ufTitle").textContent=L("تعديل: ","Edit: ")+u.name; f.scrollIntoView({behavior:"smooth"}); break; }
    case "userOff": if(confirm(L("إيقاف هذا الحساب؟ لن يتمكن من الدخول.","Disable this account? They won't be able to sign in."))){ await patch("users",id,{active:false}); audit("user.disable",S.users[id].name); render(); } break;
    case "userOn": { const u=S.users[id]; if(Object.values(S.users).some(x=>x!==u && x.active!==false && x.empNo===u.empNo)){ toast(L("يوجد حساب فعّال آخر بنفس الرقم","Another active account uses this number"),true); return; } await patch("users",id,{active:true}); render(); break; }
    case "forgot": renderForgot(); break;
    case "backLogin": renderLogin(); break;
    case "userResetMail": {
      const u=S.users[id]; if(DEMO){ toast(L("في الوضع التجريبي لا تُرسل إيميلات","No e-mails in demo mode")); return; }
      try{ const r=await sendReset(u.empNo); toast(r.ok?L(`أُرسل رابط إعادة التعيين إلى ${r.email}`,`Reset link sent to ${r.email}`):L("لا يوجد إيميل لهذا الحساب","No e-mail on this account"), !r.ok); audit("user.resetmail",u.name); }
      catch(err){ toast(err.message||String(err),true); }
      break; }
    case "userReset": {
      const u=S.users[id];
      if(DEMO){ toast(L("في الوضع التجريبي لا توجد كلمات مرور","No passwords in demo mode")); return; }
      const pw=prompt(L(`كلمة مرور مؤقتة جديدة لـ ${u.name} (8 أحرف على الأقل):`,`New temporary password for ${u.name} (min 8):`)); if(!pw) return;
      if(pw.length<8){ toast(L("8 أحرف على الأقل","At least 8 characters"),true); return; }
      try{ await patch("users",id,{active:false}); await createAccount({empNo:u.empNo,name:u.name,role:u.role,units:u.units||[],password:pw}); audit("user.reset",u.name); toast(L("تمت إعادة التعيين. أعطيه كلمة المرور المؤقتة الجديدة.","Reset done. Give them the new temporary password.")); render(); }
      catch(err){ toast(err.message||String(err),true); }
      break; }
    /* settings */
    case "unitPick": UI.unit=id; render(); break;
    case "unitDel": if(staffOf(id,true).length){ toast(L("انقلي موظفي القسم أولاً","Move the unit's staff first"),true); return; } if(confirm(L("حذف القسم؟","Delete unit?"))){ await remove("units",id); audit("unit.delete",id); render(); } break;
    case "unitSave": {
      const rows=readTable("#shiftTbl"), codes=rows.map(r=>(r.code||"").toUpperCase());
      if(codes.some(x=>!x||x==="OFF"||Object.values(HOL_DAY_CODES).some(h=>h.code===x)||LEAVE_BY_CODE[x]) || new Set(codes).size!==codes.length){ toast(L("كل مناوبة تحتاج رمزاً فريداً لا يتكرر مع رموز الإجازات أو OFF","Each shift needs a unique code that isn't a leave code or OFF"),true); return; }
      const mins={}; const shifts=rows.map(r=>{ const code=r.code.toUpperCase(); mins[code]=Number(r.min)||0; return {code,ar:r.ar,en:r.en,start:r.start,end:r.end,hours:Number(r.hours)||0,color:r.color,night:!!r.night}; });
      const ramadan={}; readTable("#ramTbl").forEach(r=>ramadan[r.code]={start:r.start,end:r.end,hours:Number(r.hours)||6});
      await patch("units",unit,{name:$("#uName").value.trim()||S.units[unit].name, nameEn:$("#uNameEn").value.trim(), shifts, mins, assistMin:Number($("#uAssist").value)||0, restAfterNight:Number($("#uRest").value), ramadanApply:$("#uRam").checked, ramadan});
      audit("unit.edit",unitName(unit)); toast(L("تم حفظ إعدادات القسم","Unit settings saved")); render(); break; }
    case "titleAdd": case "titleDel": case "titleSave": {
      let rows=readTable("#titleTbl").map(r=>({id:r.id||uid().slice(0,6),ar:r.ar,en:r.en,cat:r.cat,fixed:!!r.fixed,fixedHours:Number(r.fixedHours)||9}));
      if(act==="titleAdd") rows.push({id:uid().slice(0,6),ar:L("مسمى جديد","New title"),en:"",cat:"counted"});
      if(act==="titleDel"){ const i=Number(t.dataset.i), tid=rows[i]?.id; if(Object.values(S.staff).some(s=>s.titleId===tid)){ toast(L("المسمى مستخدم لموظفين، غيّري مسمياتهم أولاً","This title is in use"),true); return; } rows.splice(i,1); }
      await patch("settings","main",{titles:rows}); if(act==="titleSave"){ audit("titles.save",""); toast(L("تم الحفظ","Saved")); } render(); break; }
    case "dlSave": await patch("settings","main",{deadlines:{requests:Number($("#dlReq").value)||15,submit:Number($("#dlSub").value)||20,final:Number($("#dlFin").value)||25}}); audit("deadlines.save",""); toast(L("تم الحفظ","Saved")); render(); break;
    case "eidShift": { const offs={...settings().eidOffsets}; offs[t.dataset.k]=(Number(offs[t.dataset.k])||0)+Number(t.dataset.v); await patch("settings","main",{eidOffsets:offs}); calCache={}; audit("holiday.adjust",`${t.dataset.k} ${offs[t.dataset.k]}`); render(); break; }
  }
});
document.addEventListener("change", e=>{
  if(e.target.id==="unitSel"){ UI.unit=e.target.value; render(); }
});
$("#dlg").addEventListener("close",()=>{ const d=$("#dlg"); d.innerHTML=""; d.classList.remove("wide"); IMP=null; });


/* =========================================================
   Annual leave plan: whole-year timeline per unit, coverage
   conflicts, and planned leave reflected on monthly rosters
   ========================================================= */
const ydays = y => (y%4===0 && (y%100!==0 || y%400===0)) ? 366 : 365;
const doy = s => Math.round((toDate(s) - new Date(Number(s.slice(0,4)),0,1))/86400000) + 1;
function planCapacity(unitId, year){
  /* for each day: working capacity of counted staff (and assistants) not on leave/plan,
     compared with what the unit's minimums need */
  const c=unitCfg(unitId), staff=staffOf(unitId).filter(s=>!isFixed(s)), N=ydays(year);
  const reqC=c.shifts.reduce((a,sh)=>a+(Number(c.mins[sh.code])||0),0), reqA=c.assistMin*c.shifts.length;
  const off={}; staff.forEach(s=>off[s.id]=new Set());
  const mark=(sid,from,to)=>{ if(!off[sid]) return; let d=from<`${year}-01-01`?`${year}-01-01`:from; const end=to>`${year}-12-31`?`${year}-12-31`:to; while(d<=end){ off[sid].add(doy(d)); d=addDays(d,1); } };
  Object.values(S.plans||{}).forEach(p=>mark(p.staffId,p.from,p.to));
  Object.values(S.leaves).forEach(l=>{ if(l.status!=="rejected") mark(l.staffId,l.from,l.to); });
  const days=[];
  for(let i=1;i<=N;i++){
    let capC=0, capA=0, outC=0, outA=0;
    staff.forEach(s=>{ const P=patternOf(s,unitId), f=P.L/(P.L+P.O), cat=catOf(s); const away=off[s.id].has(i);
      if(cat==="counted"){ if(away) outC++; else capC+=f; } else if(cat==="assist"){ if(away) outA++; else capA+=f; } });
    /* only leave that pushes cover below the minimum counts as a conflict
       (a unit that is short-staffed anyway isn't a leave-plan problem) */
    let st="ok";
    if((outC && reqC && capC<reqC) || (outA && reqA && capA<reqA)) st="bad";
    else if(outC && reqC && capC<reqC*1.1) st="tight";
    days.push({st,outC,outA,capC,reqC});
  }
  return days;
}
function renderPlan(main){
  const unit=UI.unit, year=UI.planYear||Number(UI.month.slice(0,4)), N=ydays(year);
  UI.planYear=year;
  const staff=staffOf(unit), canEdit=canHeadEdit()||isMgr();
  const plans=Object.entries(S.plans||{}).map(([id,p])=>({id,...p})).filter(p=>p.unitId===unit && p.to>=`${year}-01-01` && p.from<=`${year}-12-31`);
  const pos=(from,to)=>{ const a=Math.max(1,from.startsWith(String(year))?doy(from):1), b=Math.min(N,to.startsWith(String(year))?doy(to):N); return {start:(a-1)/N*100, width:(b-a+1)/N*100}; };
  const months=Array.from({length:12},(_,i)=>({i, days:new Date(year,i+1,0).getDate()}));
  const MN=lang==="en"?MONTHS_EN:MONTHS_AR;
  const monthsRow=`<div class="tl-months">${months.map(m=>`<div style="flex:${m.days}"><b>${MN[m.i]}</b><small>${hijri(ds(year,m.i+1,15))?(lang==="en"?HIJRI_EN:HIJRI_AR)[hijri(ds(year,m.i+1,15)).m-1]:""}</small></div>`).join("")}</div>`;
  const grid=`<div class="tl-grid">${months.map(m=>`<i style="flex:${m.days}"></i>`).join("")}</div>`;
  const t=todayStr(), todayMark = t.startsWith(String(year)) ? `<span class="tl-today" style="inset-inline-start:${(doy(t)-0.5)/N*100}%"></span>` : "";
  // actual leave (from the leave module) shown faintly for context
  const actual=Object.values(S.leaves).filter(l=>l.unitId===unit && l.status!=="rejected" && l.to>=`${year}-01-01` && l.from<=`${year}-12-31`);
  const rows=staff.map(s=>{
    const mine=plans.filter(p=>p.staffId===s.id), act=actual.filter(l=>l.staffId===s.id);
    const total=mine.reduce((a,p)=>a+(p.days||0),0);
    return `<div class="tl-row"><div class="tl-name"><b>${esc(s.name)}</b><span>${esc(titleName(s))} · ${L(`${total} يوم مخطط`,`${total} days planned`)}</span></div>
      <div class="tl-track" data-act="${canEdit?"planTrack":""}" data-s="${s.id}">${grid}${todayMark}
        ${act.map(l=>{ const p=pos(l.from,l.to); return `<span class="tl-act" style="inset-inline-start:${p.start}%;width:${p.width}%;--lc:${LEAVE_TYPES[l.type]?.color||"#888"}" title="${esc(leaveName(l.type))}: ${esc(fmtDate(l.from))} – ${esc(fmtDate(l.to))}"></span>`; }).join("")}
        ${mine.map(p=>{ const q=pos(p.from,p.to); return `<button class="tl-bar ${UI.planEdit===p.id?"sel":""}" data-act="planEdit" data-id="${p.id}" style="inset-inline-start:${q.start}%;width:${q.width}%" title="${esc(fmtDate(p.from))} – ${esc(fmtDate(p.to))} (${p.days} ${L("يوم","days")})">${q.width>2.2?p.days:""}</button>`; }).join("")}
      </div></div>`;
  }).join("");
  // coverage strip + conflict list
  const cap=planCapacity(unit,year), segs=[]; let cur=null;
  cap.forEach((d,i)=>{ if(!cur || cur.st!==d.st){ cur={st:d.st,a:i+1,b:i+1,maxOut:d.outC,maxA:d.outA}; segs.push(cur); } else { cur.b=i+1; cur.maxOut=Math.max(cur.maxOut,d.outC); cur.maxA=Math.max(cur.maxA,d.outA); } });
  const dateOf=i=>fromDate(new Date(year,0,i));
  const strip=`<div class="tl-row cov-row"><div class="tl-name"><b>${L("التغطية","Coverage")}</b><span>${L("حسب الحد الأدنى","vs. minimums")}</span></div><div class="tl-track strip">${segs.map(g=>`<span class="seg ${g.st}" style="inset-inline-start:${(g.a-1)/N*100}%;width:${(g.b-g.a+1)/N*100}%" title="${esc(fmtDate(dateOf(g.a)))} – ${esc(fmtDate(dateOf(g.b)))}"></span>`).join("")}</div></div>`;
  const conflicts=segs.filter(g=>g.st!=="ok");
  const staffSel=staff.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("");
  const ed=UI.planEdit && S.plans?.[UI.planEdit];
  main.innerHTML=`
  <div class="plan-head">
    <div><h2 class="page-title">${L("خطة الإجازات السنوية","Annual leave plan")} — ${esc(unitName(unit))}</h2>
      <p class="muted">${L("الإجازات المخططة تظهر في الجداول الشهرية، والتوزيع الذكي يتجاوزها تلقائياً. لا تُخصم من الرصيد إلا عند تسجيلها كإجازة فعلية.","Planned leave appears on the monthly rosters and smart distribution skips it. Balances are only deducted when it's recorded as actual leave.")}</p></div>
    <div class="year-nav"><button class="btn small" data-act="planYear" data-v="-1" aria-label="${L("السنة السابقة","Previous year")}">${lang==="en"?"‹":"›"}</button><strong>${year} ${L("م","AD")}</strong><button class="btn small" data-act="planYear" data-v="1" aria-label="${L("السنة التالية","Next year")}">${lang==="en"?"›":"‹"}</button></div>
  </div>
  <div class="grid2 plan-grid">
    <div>
      ${canEdit?`<div class="panel"><h2>${ed?L("تعديل إجازة مخططة","Edit planned leave"):L("إضافة إجازة للخطة","Add planned leave")}</h2>
        <form class="form" id="planForm">
          <label>${L("الموظف","Staff member")}<select class="field" name="staffId">${staffSel}</select></label>
          <div class="two"><label>${L("من (ميلادي)","From (Gregorian)")}<input class="field" type="date" name="from" required></label><label>${L("إلى (ميلادي)","To (Gregorian)")}<input class="field" type="date" name="to" required></label></div>
          <label>${L("ملاحظة","Note")}<input class="field" name="note"></label>
          <p class="muted small-text" id="planInfo"></p>
          <div class="row"><button class="btn primary" type="submit">${ed?L("حفظ التعديل","Save changes"):L("إضافة للخطة","Add to plan")}</button>
          ${ed?`<button class="btn danger" type="button" data-act="planDel">${L("حذف","Delete")}</button><button class="btn" type="button" data-act="planNew">${L("إلغاء","Cancel")}</button>`:""}</div>
          <p class="muted small-text">${L("تلميح: اضغطي على خط الموظف في الجدول الزمني لتعبئة التاريخ تلقائياً.","Tip: click a person's line on the timeline to prefill the date.")}</p>
        </form></div>`:""}
      <div class="panel"><h2>${L("تعارضات التغطية","Coverage conflicts")}</h2>
        ${conflicts.length?`<ul class="conf-list">${conflicts.map(g=>`<li class="${g.st}"><b>${g.st==="bad"?L("لا تكفي التغطية","Not enough cover"):L("التغطية على الحد","Cover is tight")}</b>
          <span class="period">${fmtDual(dateOf(g.a))}<span class="to">${L("إلى","to")}</span>${fmtDual(dateOf(g.b))}</span>
          <span class="muted small-text">${L(`حتى ${g.maxOut} ستاف نيرس في إجازة`,`Up to ${g.maxOut} staff nurses away`)}${g.maxA?L(` و${g.maxA} مساعد`,` and ${g.maxA} assistant(s)`):""}</span></li>`).join("")}</ul>`
        :`<div class="ok-line">${L("لا توجد تعارضات في هذه السنة ✓","No conflicts this year ✓")}</div>`}
        <p class="muted small-text">${L("يُحسب من عدد الموظفين المتاحين ونظام دوامهم مقارنة بالحد الأدنى لكل مناوبة، مع احتساب الإجازات الفعلية أيضاً.","Based on available staff and their work pattern against each shift's minimum, including actual leave too.")}</p>
      </div>
    </div>
    <div class="panel tl-panel">
      <div class="tl">
        <div class="tl-row tl-head"><div class="tl-name"></div><div class="tl-track bare">${monthsRow}</div></div>
        ${strip}
        ${rows||`<p class="muted">${L("لا يوجد موظفون.","No staff.")}</p>`}
      </div>
      <div class="legend"><span><i class="plan-i solid"></i>${L("إجازة مخططة","Planned")}</span><span><i style="background:#2E8B73;opacity:.45"></i>${L("إجازة فعلية مسجلة","Recorded leave")}</span>
        <span><i class="seg-i bad"></i>${L("لا تكفي التغطية","Not enough cover")}</span><span><i class="seg-i tight"></i>${L("على الحد","Tight")}</span><span><i class="seg-i ok"></i>${L("كافية","OK")}</span></div>
    </div>
  </div>`;
  const pf=$("#planForm");
  if(pf){
    if(ed){ pf.elements.staffId.value=ed.staffId; pf.elements.from.value=ed.from; pf.elements.to.value=ed.to; pf.elements.note.value=ed.note||""; }
    else if(UI._planPrefill){ pf.elements.staffId.value=UI._planPrefill.s; pf.elements.from.value=UI._planPrefill.d; UI._planPrefill=null; }
    const info=()=>{ const f=pf.elements; $("#planInfo").textContent = f.from.value&&f.to.value&&f.to.value>=f.from.value ? L(`${daysBetween(f.from.value,f.to.value)} يوم — رصيد السنوية الحالي ${balances(f.staffId.value).annual}`,`${daysBetween(f.from.value,f.to.value)} day(s) — current annual balance ${balances(f.staffId.value).annual}`) : ""; };
    pf.addEventListener("input",info); info();
    pf.addEventListener("submit",async e=>{
      e.preventDefault(); const f=pf.elements, sid=f.staffId.value, from=f.from.value, to=f.to.value;
      if(!from||!to||to<from){ toast(L("تحققي من التواريخ","Check the dates"),true); return; }
      if(Object.entries(S.plans||{}).some(([k,p])=>k!==UI.planEdit && p.staffId===sid && !(to<p.from||from>p.to))){ toast(L("هذه الفترة متداخلة مع إجازة مخططة أخرى لنفس الموظف","Overlaps another planned leave for this person"),true); return; }
      const id=UI.planEdit||uid();
      await put("plans",id,{unitId:unit,staffId:sid,from,to,days:daysBetween(from,to),note:f.note.value.trim(),by:ME.uid,byName:ME.name,at:new Date().toISOString()});
      audit(UI.planEdit?"plan.edit":"plan.add",`${S.staff[sid]?.name} ${from}→${to}`);
      // warn right away if this creates a coverage conflict
      const cap=planCapacity(unit,Number(from.slice(0,4))); let bad=false; let d=from; while(d<=to && d.startsWith(from.slice(0,4))){ if(cap[doy(d)-1]?.st==="bad"){ bad=true; break; } d=addDays(d,1); }
      UI.planEdit=null; render();
      toast(bad?L("أُضيفت — تنبيه: التغطية لا تكفي في هذه الفترة","Added — warning: not enough cover in this period"):L("تم الحفظ في الخطة","Saved to plan"), bad);
    });
  }
}
document.addEventListener("click", async e=>{
  const t=e.target.closest("[data-act]"); if(!t) return;
  const act=t.dataset.act;
  if(act==="planYear"){ UI.planYear=(UI.planYear||Number(UI.month.slice(0,4)))+Number(t.dataset.v); UI.planEdit=null; render(); }
  else if(act==="planEdit"){ e.stopPropagation(); if(!(canHeadEdit()||isMgr())) return; UI.planEdit=t.dataset.id; render(); }
  else if(act==="planNew"){ UI.planEdit=null; render(); }
  else if(act==="planDel"){ const p=S.plans[UI.planEdit]; if(p && confirm(L("حذف هذه الإجازة من الخطة؟","Remove this planned leave?"))){ audit("plan.delete",`${S.staff[p.staffId]?.name} ${p.from}`); await remove("plans",UI.planEdit); UI.planEdit=null; render(); } }
  else if(act==="planTrack"){
    if(e.target.closest(".tl-bar")) return;
    const r=t.getBoundingClientRect(), rtl=document.documentElement.dir==="rtl", year=UI.planYear, N=ydays(year);
    const frac=(rtl ? r.right-e.clientX : e.clientX-r.left)/r.width, day=Math.min(N,Math.max(1,Math.floor(frac*N)+1));
    UI.planEdit=null; UI._planPrefill={s:t.dataset.s, d:fromDate(new Date(year,0,day))}; render();
    const f=$("#planForm"); if(f){ dateHint(f.elements.from); f.elements.to.focus(); f.scrollIntoView({behavior:"smooth",block:"nearest"}); }
  }
});


/* =========================================================
   Excel import for staff (large files): auto-detect columns,
   match units & titles, preview, then batch-save
   ========================================================= */
const XLSX_SRC="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
function loadXLSX(){ return window.XLSX ? Promise.resolve(window.XLSX) : new Promise((res,rej)=>{ const sc=document.createElement("script"); sc.src=XLSX_SRC; sc.onload=()=>res(window.XLSX); sc.onerror=()=>rej(new Error("xlsx")); document.head.appendChild(sc); }); }
const normAr = s => String(s??"").toLowerCase().replace(/[\u064B-\u0652\u0640]/g,"").replace(/[أإآ]/g,"ا").replace(/ة/g,"ه").replace(/ى/g,"ي").replace(/[^\p{L}\p{N}]+/gu," ").trim();
const IMPORT_FIELDS = [
  {k:"empNo",  ar:"الرقم الوظيفي", en:"Employee no.", req:true, keys:["الرقم الوظيفي","رقم وظيفي","الرقم","رقم الموظف","employee no","employee number","emp no","empno","staff id","employee id","id","badge"]},
  {k:"name",   ar:"الاسم",          en:"Name",         req:true, keys:["الاسم","اسم الموظف","الاسم الكامل","name","full name","employee name","staff name"]},
  {k:"title",  ar:"المسمى",         en:"Job title",    keys:["المسمى الوظيفي","المسمى","الوظيفه","المهنه","title","job title","position","designation","job"]},
  {k:"unit",   ar:"القسم",          en:"Unit",         keys:["القسم","الوحده","الجناح","unit","department","ward","dept"]},
  {k:"annual", ar:"رصيد السنوية",   en:"Annual balance", keys:["رصيد السنويه","رصيد الاجازه السنويه","السنويه","annual balance","annual leave","annual"]},
  {k:"comp",   ar:"رصيد التعويضية", en:"Comp balance", keys:["رصيد التعويضيه","التعويضيه","comp balance","compensatory","comp"]},
  {k:"system", ar:"نظام الدوام",    en:"Work pattern", keys:["نظام الدوام","نظام الساعات","النظام","pattern","shift system","shift hours"]},
  {k:"ramadan",ar:"دوام رمضان المخفض", en:"Reduced Ramadan hours", keys:["دوام رمضان","رمضان","ramadan"]},
  {k:"night",  ar:"يعمل ليلي",      en:"Works nights", keys:["ليلي","يعمل ليلي","night","nights"]}
];
let IMP=null; // current import session
function detectHeader(rows){
  let best={i:0,score:-1,map:{}};
  for(let i=0;i<Math.min(rows.length,10);i++){
    const map={}; let score=0;
    (rows[i]||[]).forEach((h,ci)=>{ const n=normAr(h); if(!n) return;
      for(const f of IMPORT_FIELDS){ if(map[f.k]!==undefined) continue; if(f.keys.some(k=>{ const kk=normAr(k); return n===kk || (kk.length>3 && n.includes(kk)); })){ map[f.k]=ci; score++; break; } } });
    if(score>best.score) best={i,score,map};
  }
  return best;
}
const yes = v => /^(1|y|yes|true|نعم|اي|ايه|صح|✓)$/i.test(normAr(v));
function cellStr(v){ if(v===null||v===undefined) return ""; if(typeof v==="number") return Number.isInteger(v)?String(v):String(v); return String(v).trim(); }
function findUnit(name){ const n=normAr(name); if(!n) return null; const e=Object.entries(S.units).find(([,u])=>normAr(u.name)===n || normAr(u.nameEn)===n); return e?e[0]:null; }
function findTitle(name){ const n=normAr(name); if(!n) return null; return settings().titles.find(t=>normAr(t.ar)===n || normAr(t.en)===n) || null; }
async function handleXlFile(file){
  if(!file) return;
  let XL; try{ XL=await loadXLSX(); }catch(e){ toast(L("تعذّر تحميل قارئ Excel، تحققي من الاتصال","Couldn't load the Excel reader, check your connection"),true); return; }
  try{
    const buf=await file.arrayBuffer();
    const wb=XL.read(buf,{type:"array"});
    const sheets=wb.SheetNames;
    IMP={file:file.name, wb, sheet:sheets[0], existing:"update", createUnits:true, addTitles:false, fallbackTitle:(settings().titles.find(t=>t.cat==="counted")||settings().titles[0]).id, defaultUnit:UI.unit};
    loadSheet(); openImport();
  }catch(e){ console.error(e); toast(L("تعذّرت قراءة الملف. تأكدي أنه ملف Excel أو CSV","Couldn't read the file. Make sure it's Excel or CSV"),true); }
}
function loadSheet(){
  const rows=window.XLSX.utils.sheet_to_json(IMP.wb.Sheets[IMP.sheet],{header:1,raw:true,defval:""});
  const h=detectHeader(rows);
  IMP.rows=rows; IMP.hdr=h.i; IMP.map={...h.map};
}
function buildImport(){
  const m=IMP.map, out=[], seen=new Set(), byEmp={};
  Object.entries(S.staff).forEach(([id,s])=>byEmp[String(s.empNo)]=id);
  const newUnits=new Map(), newTitles=new Map();
  IMP.rows.slice(IMP.hdr+1).forEach((r,ix)=>{
    const g=k=> m[k]!==undefined ? cellStr(r[m[k]]) : "";
    const empNo=g("empNo").replace(/\.0+$/,""), name=g("name");
    if(!empNo && !name) return;
    const row={line:IMP.hdr+ix+2, empNo, name, titleRaw:g("title"), unitRaw:g("unit")};
    if(!empNo || !name){ row.status="error"; row.msg=L("ينقصه الرقم أو الاسم","Missing number or name"); out.push(row); return; }
    if(seen.has(empNo)){ row.status="error"; row.msg=L("رقم مكرر في الملف","Duplicate number in file"); out.push(row); return; }
    seen.add(empNo);
    // unit
    let unitId = m.unit!==undefined && row.unitRaw ? findUnit(row.unitRaw) : IMP.defaultUnit;
    if(m.unit!==undefined && row.unitRaw && !unitId){ newUnits.set(normAr(row.unitRaw), row.unitRaw); row.newUnit=row.unitRaw; }
    if(m.unit!==undefined && !row.unitRaw) unitId=IMP.defaultUnit;
    row.unitId=unitId;
    // title
    const t = row.titleRaw ? findTitle(row.titleRaw) : null;
    if(row.titleRaw && !t){ newTitles.set(normAr(row.titleRaw), row.titleRaw); row.newTitle=row.titleRaw; }
    row.titleId = t ? t.id : null;
    const sysRaw=g("system"); row.system = /12/.test(sysRaw) ? "12" : /\b9\b|^9/.test(sysRaw) ? "9" : "";
    row.annual = m.annual!==undefined ? Number(g("annual"))||0 : null;
    row.comp = m.comp!==undefined ? Number(g("comp"))||0 : null;
    row.ramadan = m.ramadan!==undefined ? yes(g("ramadan")) : null;
    row.night = m.night!==undefined ? (g("night")==="" ? true : yes(g("night"))) : null;
    const ex=byEmp[empNo];
    if(ex){ row.existingId=ex; row.status = IMP.existing==="skip" ? "skip" : ((unitId && S.staff[ex].unitId!==unitId) || row.newUnit ? "transfer" : "update"); }
    else row.status="new";
    if(!row.unitId && !row.newUnit){ row.status="error"; row.msg=L("بدون قسم","No unit"); }
    if(row.newUnit && !IMP.createUnits){ row.status="error"; row.msg=L("القسم غير موجود","Unit not found"); }
    out.push(row);
  });
  IMP.out=out; IMP.newUnits=[...newUnits.values()]; IMP.newTitles=[...newTitles.values()];
  return out;
}
function openImport(){
  const rows=buildImport(), cnt=k=>rows.filter(r=>r.status===k).length;
  const sheetOpts=IMP.wb.SheetNames.map(n=>`<option ${n===IMP.sheet?"selected":""}>${esc(n)}</option>`).join("");
  const headers=(IMP.rows[IMP.hdr]||[]).map((h,i)=>({i,h:cellStr(h)||L(`عمود ${i+1}`,`Column ${i+1}`)}));
  const mapSel=f=>`<label>${esc(L(f.ar,f.en))}${f.req?" *":""}<select class="field" data-map="${f.k}"><option value="">${L("— غير موجود —","— not in file —")}</option>${headers.map(h=>`<option value="${h.i}" ${IMP.map[f.k]===h.i?"selected":""}>${esc(h.h)}</option>`).join("")}</select></label>`;
  const ST={new:["جديد","New","st-approved"],update:["تحديث","Update","st-draft"],transfer:["نقل قسم","Transfer","st-submitted"],skip:["تجاهل","Skip","st-none"],error:["خطأ","Error","st-rejected"]};
  const body=`
   <div class="imp-top"><div><b>${esc(IMP.file)}</b> · ${L(`${rows.length} صف`,`${rows.length} rows`)}</div>
    ${IMP.wb.SheetNames.length>1?`<label class="inline">${L("الورقة:","Sheet:")} <select class="field" id="impSheet">${sheetOpts}</select></label>`:""}</div>
   <div class="imp-stats">
     <span class="pill st-approved">${L("جديد","New")} ${cnt("new")}</span><span class="pill st-draft">${L("تحديث","Update")} ${cnt("update")}</span>
     <span class="pill st-submitted">${L("نقل قسم","Transfer")} ${cnt("transfer")}</span><span class="pill st-none">${L("تجاهل","Skip")} ${cnt("skip")}</span><span class="pill st-rejected">${L("أخطاء","Errors")} ${cnt("error")}</span></div>
   <details class="imp-map" ${(IMP.map.empNo===undefined||IMP.map.name===undefined)?"open":""}><summary>${L("ربط الأعمدة","Column mapping")} ${(IMP.map.empNo===undefined||IMP.map.name===undefined)?`<span class="neg">— ${L("اختاري عمود الرقم والاسم","choose the number and name columns")}</span>`:`<span class="muted small-text">(${L("تم التعرف تلقائياً","detected automatically")})</span>`}</summary>
     <div class="form imp-grid">${IMPORT_FIELDS.map(mapSel).join("")}</div></details>
   <div class="form imp-opts">
     ${IMP.map.unit===undefined?`<label>${L("القسم لكل الموظفين في الملف","Unit for everyone in the file")}<select class="field" id="impUnit">${Object.keys(S.units).map(id=>`<option value="${id}" ${id===IMP.defaultUnit?"selected":""}>${esc(unitName(id))}</option>`).join("")}</select></label>`:""}
     ${IMP.newUnits.length?`<label class="check"><input type="checkbox" id="impCreateUnits" ${IMP.createUnits?"checked":""}> ${L(`إنشاء الأقسام غير الموجودة (${IMP.newUnits.length}) بنظام 12 ساعة: `,`Create missing units (${IMP.newUnits.length}) as 12-hour: `)}<span class="muted small-text">${IMP.newUnits.map(esc).join("، ")}</span></label>`:""}
     ${IMP.newTitles.length?`<div class="imp-titles"><div class="lbl">${L(`مسميات غير معروفة (${IMP.newTitles.length}):`,`Unknown titles (${IMP.newTitles.length}):`)} <span class="muted small-text">${IMP.newTitles.map(esc).join("، ")}</span></div>
        <label class="check"><input type="checkbox" id="impAddTitles" ${IMP.addTitles?"checked":""}> ${L("إضافتها للمسميات (محسوبة في الحد الأدنى — تقدرين تعدلين فئتها بعدين)","Add them as new titles (counted — you can change the category later)")}</label>
        ${IMP.addTitles?"":`<label>${L("أو اعتبارها:","Or treat them as:")}<select class="field" id="impFallback">${settings().titles.map(t=>`<option value="${t.id}" ${t.id===IMP.fallbackTitle?"selected":""}>${esc(L(t.ar,t.en))}</option>`).join("")}</select></label>`}</div>`:""}
     <div class="lbl">${L("الموظفون المسجلون مسبقاً بنفس الرقم:","Staff already registered with the same number:")}</div>
     <div class="row"><label class="check"><input type="radio" name="impEx" value="update" ${IMP.existing==="update"?"checked":""}> ${L("تحديث بياناتهم (ونقلهم إذا تغير القسم)","Update them (and transfer if the unit changed)")}</label>
     <label class="check"><input type="radio" name="impEx" value="skip" ${IMP.existing==="skip"?"checked":""}> ${L("تجاهلهم","Skip them")}</label></div>
   </div>
   <div class="tbl-wrap imp-prev"><table class="list"><thead><tr><th>${L("السطر","Row")}</th><th>${L("الرقم","No.")}</th><th>${L("الاسم","Name")}</th><th>${L("المسمى","Title")}</th><th>${L("القسم","Unit")}</th><th>${L("الحالة","Status")}</th></tr></thead><tbody>
   ${rows.slice(0,300).map(r=>`<tr><td class="muted">${r.line}</td><td>${esc(r.empNo)}</td><td>${esc(r.name)}</td>
     <td>${r.titleId?esc(L(titleById(r.titleId).ar,titleById(r.titleId).en)):r.newTitle?`<span class="warn-t">${esc(r.newTitle)} ⚠</span>`:`<span class="muted">${L("افتراضي","default")}</span>`}</td>
     <td>${r.unitId?esc(unitName(r.unitId)):r.newUnit?`<span class="warn-t">${esc(r.newUnit)} ${L("(جديد)","(new)")}</span>`:"—"}</td>
     <td><span class="pill ${ST[r.status][2]}">${L(ST[r.status][0],ST[r.status][1])}</span>${r.msg?` <span class="neg small-text">${esc(r.msg)}</span>`:""}</td></tr>`).join("")}
   </tbody></table>${rows.length>300?`<p class="muted small-text">${L(`يظهر أول 300 صف من ${rows.length}`,`Showing the first 300 of ${rows.length} rows`)}</p>`:""}</div>`;
  const n=cnt("new")+cnt("update")+cnt("transfer");
  openDialog(L("استيراد الموظفين من Excel","Import staff from Excel"), body,
    `<button class="btn primary" data-act="impRun" ${n&&IMP.map.empNo!==undefined&&IMP.map.name!==undefined?"":"disabled"}>${L(`حفظ ${n} موظف`,`Save ${n} staff`)}</button><button class="btn" data-act="dlgClose">${L("إلغاء","Cancel")}</button>`);
  $("#dlg").classList.add("wide");
}
async function runImport(){
  const rows=IMP.out.filter(r=>["new","update","transfer"].includes(r.status));
  const ops=[], st=settings();
  // new units
  const unitIds={};
  if(IMP.createUnits) IMP.newUnits.forEach(name=>{ const id=uid(), t=TEMPLATES["12"]; unitIds[normAr(name)]=id;
    ops.push({op:"set",col:"units",id,data:{name, nameEn:"", system:"12", shifts:clone(t.shifts), mins:{...t.mins}, assistMin:1, restAfterNight:1, ramadanApply:false, ramadan:clone(t.ramadan)}}); });
  // new titles
  let titles=st.titles.slice(); const titleIds={};
  if(IMP.addTitles && IMP.newTitles.length){
    IMP.newTitles.forEach(name=>{ const id=uid().slice(0,6); titleIds[normAr(name)]=id; titles.push({id, ar:name, en:"", cat:"counted"}); });
    ops.push({op:"update",col:"settings",id:"main",data:{titles}});
  }
  let moved=0;
  rows.forEach(r=>{
    const unitId = r.unitId || unitIds[normAr(r.newUnit)];
    const titleId = r.titleId || (r.newTitle ? (titleIds[normAr(r.newTitle)] || IMP.fallbackTitle) : null);
    if(r.existingId){
      const prev=S.staff[r.existingId], data={...prev, empNo:r.empNo, name:r.name};
      if(titleId) data.titleId=titleId;
      if(unitId) data.unitId=unitId;
      if(r.system) data.system=r.system;
      if(r.annual!==null) data.annualOpening=r.annual;
      if(r.comp!==null) data.compOpening=r.comp;
      if(r.ramadan!==null) data.ramadanReduced=r.ramadan;
      if(r.night!==null) data.nightOk=r.night;
      ops.push({op:"set",col:"staff",id:r.existingId,data});
      if(prev.unitId!==data.unitId){ moved++;
        ["leaves","credits","requests","swaps","plans"].forEach(col=>Object.entries(S[col]||{}).forEach(([k,v])=>{ if(v.staffId===r.existingId||v.a===r.existingId||v.b===r.existingId) ops.push({op:"update",col,id:k,data:{unitId:data.unitId}}); })); }
    } else {
      ops.push({op:"set",col:"staff",id:uid(),data:{empNo:r.empNo,name:r.name,titleId:titleId||IMP.fallbackTitle,unitId,system:r.system||"",
        annualOpening:r.annual??0, compOpening:r.comp??0, nightOk:r.night??true, ramadanReduced:r.ramadan??false, active:true}});
    }
  });
  const btn=$("[data-act=impRun]"); if(btn){ btn.disabled=true; btn.textContent=L("جاري الحفظ…","Saving…"); }
  try{
    await batch(ops);
    audit("staff.import",`${IMP.file}: ${rows.length}`);
    closeDialog(); $("#dlg").classList.remove("wide");
    toast(L(`تم حفظ ${rows.length} موظف${moved?` (منهم ${moved} نُقلوا لقسم آخر)`:""}${IMP.createUnits&&IMP.newUnits.length?` وإنشاء ${IMP.newUnits.length} قسم`:""}`,`Saved ${rows.length} staff${moved?` (${moved} transferred)`:""}${IMP.createUnits&&IMP.newUnits.length?` and created ${IMP.newUnits.length} unit(s)`:""}`));
    IMP=null; render();
  }catch(e){ if(btn){ btn.disabled=false; btn.textContent=L("إعادة المحاولة","Retry"); } }
}
async function downloadTemplate(){
  let XL; try{ XL=await loadXLSX(); }catch(e){ toast(L("تعذّر تحميل أداة Excel","Couldn't load the Excel tool"),true); return; }
  const head=[["الرقم الوظيفي","الاسم","المسمى","القسم","رصيد السنوية","رصيد التعويضية","نظام الدوام","دوام رمضان المخفض","يعمل ليلي"]];
  const ex=[["10234","سارة أحمد","ستاف نيرس",unitName(UI.unit)||"الباطنة نساء",21,0,"12","نعم","نعم"],["20456","منى علي","فني رعاية مرضى",unitName(UI.unit)||"الباطنة نساء",30,2,"12","لا","نعم"]];
  const ws=XL.utils.aoa_to_sheet(head.concat(ex)); ws["!cols"]=head[0].map(()=>({wch:18}));
  const wb=XL.utils.book_new(); XL.utils.book_append_sheet(wb,ws,"الموظفون");
  const t=XL.utils.aoa_to_sheet([["المسميات المتاحة"],...settings().titles.map(x=>[x.ar])]); XL.utils.book_append_sheet(wb,t,"المسميات");
  const u=XL.utils.aoa_to_sheet([["الأقسام المتاحة"],...Object.keys(S.units).map(id=>[S.units[id].name])]); XL.utils.book_append_sheet(wb,u,"الأقسام");
  XL.writeFile(wb,"نموذج-الموظفين.xlsx");
}
document.addEventListener("change", e=>{
  if(e.target.id==="xlFile"){ handleXlFile(e.target.files[0]); e.target.value=""; }
  if(!IMP) return;
  if(e.target.dataset?.map!==undefined){ const v=e.target.value; if(v==="") delete IMP.map[e.target.dataset.map]; else IMP.map[e.target.dataset.map]=Number(v); openImport(); }
  else if(e.target.id==="impSheet"){ IMP.sheet=e.target.value; loadSheet(); openImport(); }
  else if(e.target.id==="impUnit"){ IMP.defaultUnit=e.target.value; openImport(); }
  else if(e.target.id==="impCreateUnits"){ IMP.createUnits=e.target.checked; openImport(); }
  else if(e.target.id==="impAddTitles"){ IMP.addTitles=e.target.checked; openImport(); }
  else if(e.target.id==="impFallback"){ IMP.fallbackTitle=e.target.value; }
  else if(e.target.name==="impEx"){ IMP.existing=e.target.value; openImport(); }
});
document.addEventListener("click", e=>{
  const t=e.target.closest("[data-act]"); if(!t) return;
  if(t.dataset.act==="impRun") runImport();
  else if(t.dataset.act==="xlTemplate") downloadTemplate();
});
["dragover","drop"].forEach(ev=>document.addEventListener(ev, e=>{
  const z=e.target.closest?.("#dropZone"); if(!z) return; e.preventDefault();
  if(ev==="dragover") z.classList.add("over"); else { z.classList.remove("over"); handleXlFile(e.dataTransfer.files[0]); }
}));

/* ---------- start ---------- */
if("serviceWorker" in navigator && location.protocol==="https:") navigator.serviceWorker.register("sw.js").catch(()=>{});
bootAuth();
})();
