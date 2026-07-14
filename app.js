/* ================================================================
   FARO v3 — Ed el mapache, hábitos, tiempo, diario y estadísticas
   Diseño premium + cronómetro por tarea + logros + rachas + confetti
   Almacenamiento: window.storage (Claude) → localStorage (PWA) → memoria
================================================================ */
/* ---------------- ALMACENAMIENTO MULTI-PERFIL ----------------
   faro-profiles → [{id,name,pet,accent}]   faro-active → id
   faro-data-<id> → estado S de ese perfil  (fotos: IndexedDB con campo profile)
------------------------------------------------------------------ */
let S=null, MODE='mem';
let PROFILES=[], ACTIVE=null;
const MEM={};                 // fallback en memoria (vista previa)
const OLD_KEY='faro-data';    // formato antiguo (una sola persona, sin perfiles)

function detectMode(){
  if(typeof window!=='undefined' && window.storage){ MODE='claude'; return; }
  try{ localStorage.setItem('__t','1'); localStorage.removeItem('__t'); MODE='local'; return; }catch(e){}
  MODE='mem';
  const n=document.getElementById('mem-notice'); if(n)n.style.display='block';
}
async function rawGet(k){
  try{
    if(MODE==='claude'){ const r=await window.storage.get(k).catch(()=>null); return r&&r.value?r.value:null; }
    if(MODE==='local'){ return localStorage.getItem(k); }
  }catch(e){}
  return (k in MEM)?MEM[k]:null;
}
async function rawSet(k,v){
  try{
    if(MODE==='claude'){ await window.storage.set(k,v); return; }
    if(MODE==='local'){ localStorage.setItem(k,v); return; }
  }catch(e){}
  MEM[k]=v;
}
async function rawDel(k){
  try{
    if(MODE==='claude'){ await window.storage.set(k,''); return; }
    if(MODE==='local'){ localStorage.removeItem(k); return; }
  }catch(e){}
  delete MEM[k];
}
function dataKey(id){ return 'faro-data-'+(id||ACTIVE); }
function saveProfiles(){ rawSet('faro-profiles', JSON.stringify(PROFILES)); }

async function loadProfiles(){
  detectMode();
  let pr=await rawGet('faro-profiles');
  try{ PROFILES = pr?JSON.parse(pr):[]; }catch(e){ PROFILES=[]; }
  ACTIVE = await rawGet('faro-active');
  // migración: si ya usabas FARO sin perfiles, tus datos pasan a un primer perfil
  if(!PROFILES.length){
    const old=await rawGet(OLD_KEY);
    if(old){
      const id='p'+Date.now();
      let nm=''; try{ nm=(JSON.parse(old).name)||''; }catch(e){}
      PROFILES=[{id, name:nm||'Yo', pet:'ed', accent:'blue'}];
      await rawSet(dataKey(id), old);
      saveProfiles();
      ACTIVE=id; await rawSet('faro-active', id);
      await rawDel(OLD_KEY);
    }
  }
}
async function loadActiveState(){
  const raw=await rawGet(dataKey());
  try{ S = raw?Object.assign(defaultState(),JSON.parse(raw)):defaultState(); }
  catch(e){ S=defaultState(); }
  const p=PROFILES.find(x=>x.id===ACTIVE);
  if(p){ S.name=p.name; S.pet=p.pet||'ed'; S.accent=p.accent||'blue'; }
}

function defaultState(){
  return {
    name:'', theme:'light', pet:'ed', accent:'blue',
    habits:[
      {id:'h1', em:'🛏️', t:'Tender la cama al despertar'},
      {id:'h2', em:'🍳', t:'Desayunar bien'},
      {id:'h3', em:'🚿', t:'Arreglarme y estar presentable'},
      {id:'h4', em:'🧹', t:'Aseo / ayudar en casa'},
      {id:'h5', em:'💪', t:'Mover el cuerpo 30 min'},
      {id:'h6', em:'❤️', t:'Momento de calidad con mi pareja'},
    ],
    habitDone:{},
    tasks:[],                    // {id,t,date,p,prog,done,nag,notifyAt}
    goals:[],                    // {id,em,t,why,steps:[{t,done}],due,created}
    notes:[],
    checkins:{},                 // date:{m:{mood,energy,intent}}
    acts:[
      {id:'a1', em:'💼', t:'Trabajo',        goal:480, c:'#3B76F6'},
      {id:'a2', em:'🚀', t:'Marca personal', goal:90,  c:'#F0A93C'},
      {id:'a3', em:'💪', t:'Ejercicio',      goal:60,  c:'#F4735E'},
      {id:'a4', em:'📚', t:'Estudio',        goal:60,  c:'#2FB980'},
      {id:'a5', em:'🌿', t:'Descanso',       goal:90,  c:'#9B85F8'},
      {id:'a6', em:'🍽️', t:'Comidas',        goal:90,  c:'#F49A55'},
    ],
    actLog:{},                   // date:{actId:seconds}
    running:null,                // {id,start} (cronómetro libre)
    pomo:{work:25, break:5, longBreak:15, cycles:4, actId:'a1', sound:true},
    pomoState:null,              // {phase,endsAt,round,actId,paused,remain}
    pomoLog:{},                  // date: nº de pomodoros completados
    reminders:[
      {id:'r1', time:'07:30', label:'☀️ Buenos días. Define tu intención y arranca.', on:true},
      {id:'r2', time:'13:00', label:'🎯 ¿Cómo va tu día? Revisa tus tareas.', on:true},
    ],
    remFired:{},
    beastOn:true,                // modo bestia global
    beastEvery:15,               // minutos entre insistencias
    focusTask:null,              // id de tarea enfocada en el pomodoro
    badges:{},                   // logros desbloqueados {id:fecha}
    celebrated:{},               // días celebrados al 100% {fecha:1}
    tx:[],                       // gastos: {id,type:'in'|'out',amount,cat,note,date} (monto SIEMPRE en pesos)
    budget:null,                 // presupuesto mensual (número, en pesos) o null
    currency:'$',
    viewCur:'COP',               // moneda en la que se MUESTRA: COP | USD | EUR
    fx:null,                     // tasa del día {date, USD:pesos por 1 US$, EUR:pesos por 1 €}
    projects:[],                 // trabajo: {id,em,name,items:[{t,done}],created}
    firstDay:today(),
  };
}
let saveT=null, pendingKey=null, pendingVal=null;
function save(){
  if(!ACTIVE)return;
  // capturamos clave y datos AHORA (no al disparar): así cambiar de perfil no mezcla datos
  pendingKey=dataKey(); pendingVal=JSON.stringify(S);
  clearTimeout(saveT);
  saveT=setTimeout(flushSave,200);
}
function flushSave(){
  clearTimeout(saveT); saveT=null;
  if(pendingKey!=null){ rawSet(pendingKey,pendingVal); pendingKey=null; pendingVal=null; }
}

/* ---------------- utilidades ---------------- */
const $=id=>document.getElementById(id);
function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function today(){return iso(new Date());}
function esc(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');}
function fmtDate(k){const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString('es',{weekday:'long',day:'numeric',month:'long'});}
function fmtHM(sec){const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60);return (h?h+'h ':'')+m+'m';}
let toastT=null;
function toast(m){const t=$('toast');t.textContent=m;t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),2600);}

/* ═══════════ CAPA NATIVA: haptics, dinero, sheets + botón atrás, diálogos ═══════════ */
function haptic(p){ try{ if('vibrate' in navigator) navigator.vibrate(p||10); }catch(e){} }
/* máscara de miles estilo app bancaria: 20000 → 20.000 mientras escribes */
function moneyMask(el){ const d=(el.value||'').replace(/\D/g,'').slice(0,12); el.value=d?parseInt(d).toLocaleString('es-CO'):''; }
function moneyVal(el){ return parseInt((el.value||'').replace(/\D/g,''))||0; }

/* Gestor de sheets/overlays integrado con el historial:
   el botón atrás de Android cierra el sheet/diálogo abierto o vuelve a Hoy,
   nunca saca de la app de forma inesperada. */
const SHEETS=[];
function openSheet(id,onClose){
  const el=$(id); if(!el||el.classList.contains('on'))return;
  el.classList.remove('closing'); el.classList.add('on');
  SHEETS.push({id,onClose:onClose||null});
  try{ history.pushState({sheet:SHEETS.length},''); }catch(e){}
}
function closeSheet(id){
  if(SHEETS.length && SHEETS[SHEETS.length-1].id===id){ try{ history.back(); return; }catch(e){} }
  hideSheet(id);
}
function hideSheet(id){
  const i=SHEETS.map(s=>s.id).lastIndexOf(id);
  const rec=i>=0?SHEETS.splice(i,1)[0]:null;
  const el=$(id);
  if(el&&el.classList.contains('on')){
    el.classList.add('closing');
    setTimeout(()=>el.classList.remove('on','closing'),210);
  }
  if(rec&&rec.onClose)rec.onClose();
}
window.addEventListener('popstate',()=>{
  if(SHEETS.length){ hideSheet(SHEETS[SHEETS.length-1].id); return; }
  if(typeof VIEW!=='undefined' && VIEW!=='hoy'){ viewDepth=0; goRender('hoy'); }
});

/* Diálogo nativo (reemplaza alert / confirm / prompt) */
let dlgActs=[];
function showDlg(o){
  $('dlg-ico').textContent=o.ico||'✨';
  $('dlg-title').textContent=o.title||'';
  const msg=$('dlg-msg'); msg.textContent=o.msg||''; msg.style.display=o.msg?'block':'none';
  const inp=$('dlg-input');
  if(o.input){
    inp.style.display='block'; inp.value=o.input.value||''; inp.placeholder=o.input.placeholder||'';
    inp.inputMode=o.input.money?'numeric':(o.input.mode||'text');
    inp.oninput=o.input.money?function(){moneyMask(inp);}:null;
    if(o.input.money&&inp.value)moneyMask(inp);
  }else{ inp.style.display='none'; inp.oninput=null; }
  dlgActs=o.acts||[];
  $('dlg-acts').innerHTML=dlgActs.map((a,i)=>{
    const cls=a.style==='primary'?'btn':a.style==='danger'?'btn':'btn '+(a.style||'tint');
    const st=a.style==='danger'?'background:var(--danger); box-shadow:0 8px 18px -8px color-mix(in srgb,var(--danger) 70%,transparent)':'';
    return `<button class="${cls}" style="${st}" onclick="dlgAction(${i})">${a.label}</button>`;
  }).join('');
  openSheet('dlg-ov',()=>{dlgActs=[];});
  if(o.input)setTimeout(()=>{try{inp.focus();}catch(e){}},260);
}
function dlgAction(i){
  const a=i>=0?dlgActs[i]:null;
  const val=$('dlg-input').value;
  closeSheet('dlg-ov');
  if(a&&a.cb)setTimeout(()=>a.cb(val),50);
}
/* estado vacío con personalidad */
function emptyHtml(em,title,sub,ctaLabel,ctaJs){
  return `<div class="empty2"><span class="e-em">${em}</span><b>${title}</b><p>${sub}</p>${ctaLabel?`<button class="btn tint small" onclick="${ctaJs}">${ctaLabel}</button>`:''}</div>`;
}
function animateOut(el,cb){ if(!el){cb();return;} el.classList.add('bye'); setTimeout(cb,190); }
function lastNDays(n){const out=[];const d=new Date();for(let i=n-1;i>=0;i--){const x=new Date(d);x.setDate(d.getDate()-i);out.push(iso(x));}return out;}

/* ---------------- FRASES (estoicas, poéticas, románticas) ---------------- */
const QUOTES=[
  ['Tienes poder sobre tu mente, no sobre los acontecimientos. Ahí reside tu fuerza.','Marco Aurelio'],
  ['No pretendas que las cosas ocurran como deseas; desea que ocurran como ocurren, y serás sereno.','Epicteto'],
  ['Ningún viento es favorable para quien no sabe a qué puerto se dirige.','Séneca'],
  ['La dificultad muestra lo que eres. El obstáculo es el camino.','Marco Aurelio'],
  ['Deja de discutir qué debe ser un hombre bueno, y sélo.','Marco Aurelio'],
  ['No es que tengamos poco tiempo, es que perdemos mucho.','Séneca'],
  ['Quien tiene un porqué para vivir encuentra casi cualquier cómo.','Nietzsche'],
  ['La excelencia no es un acto, sino un hábito.','Aristóteles'],
  ['Conócete a ti mismo, y conocerás el universo.','Sócrates'],
  ['Nadie se baña dos veces en el mismo río: todo fluye, todo cambia.','Heráclito'],
  ['Somos lo que hacemos repetidamente. La constancia forja el carácter.','Aristóteles'],
  ['El hombre no es perturbado por las cosas, sino por la opinión que tiene de ellas.','Epicteto'],
  ['La suerte es lo que sucede cuando la preparación se encuentra con la oportunidad.','Séneca'],
  ['Empieza de una vez a vivir, y cuenta cada día como una vida entera.','Séneca'],
  ['Domina tus pasiones, o ellas te dominarán a ti.','Epicteto'],
  ['El presente es lo único de lo que pueden privarte, porque es lo único que tienes.','Marco Aurelio'],
  ['Lo que haces cada día importa más que lo que haces de vez en cuando.','Zenón de Citio'],
  ['Vive de acuerdo con la naturaleza y nada te faltará.','Zenón de Citio'],
  ['La libertad no se consigue satisfaciendo deseos, sino eliminando el deseo innecesario.','Epicteto'],
  ['No expliques tu filosofía. Encárnala.','Epicteto'],
  ['La felicidad de tu vida depende de la calidad de tus pensamientos.','Marco Aurelio'],
  ['Un hombre sabio es dueño de su mente; un necio es esclavo de sus impulsos.','Publilio Siro'],
  ['Sólo sé que no sé nada; y en esa humildad empieza toda sabiduría.','Sócrates'],
  ['Ningún hombre es libre si no es dueño de sí mismo.','Epicteto'],
  ['La paciencia es amarga, pero su fruto es dulce.','Aristóteles'],
  ['Elige no sentirte perjudicado y no lo estarás.','Marco Aurelio'],
  ['La adversidad revela al genio, la fortuna lo esconde.','Horacio'],
  ['Grande es quien es dueño de sí en medio de la tormenta.','Séneca'],
  ['El primer paso hacia la sabiduría es cuestionarlo todo; el último, aceptar lo que no depende de ti.','FARO'],
  ['No cuentes los días; haz que los días cuenten con lo que sostienes en ellos.','FARO'],
  ['A veces avanzar es, simplemente, no rendirse hoy.','FARO'],
];
function dailyQuote(){
  const seed=today().split('-').reduce((a,b)=>a+parseInt(b),0);
  return QUOTES[seed%QUOTES.length];
}

/* ---------------- ED, EL MAPACHE 🦝 ---------------- */
/* Ánimo: 40% check-ins recientes + 35% progreso de hoy + 25% racha */
function edScore(){
  let moods=[], d=new Date();
  for(let i=0;i<3;i++){
    const k=iso(d), ci=S.checkins[k];
    if(ci&&ci.m&&ci.m.mood)moods.push(ci.m.mood);
    d.setDate(d.getDate()-1);
  }
  const moodS = moods.length? (moods.reduce((a,b)=>a+b,0)/moods.length-1)/4*100 : 55;
  const prog = dayProgress();
  const st = Math.min(streak()/7,1)*100;
  return moodS*.4 + prog*.35 + st*.25;
}
function edMood(){
  const h=new Date().getHours();
  if((h>=23||h<6) && dayProgress()<10) return 'sleep';
  const s=edScore();
  return s>=70?'happy':s>=42?'ok':'sad';
}
function edStage(){
  const days=Object.keys(S.habitDone).filter(k=>(S.habitDone[k]||[]).length).length;
  return days>=30?'adulto':days>=7?'joven':'cachorro';
}
function edAccessory(){
  // actividad dominante de los últimos 7 días
  const tot={};
  lastNDays(7).forEach(k=>{
    const l=S.actLog[k]||{};
    for(const id in l) tot[id]=(tot[id]||0)+l[id];
  });
  let best=null,bv=0;
  for(const id in tot){ if(tot[id]>bv){bv=tot[id];best=id;} }
  if(!best||bv<1800) return null; // mínimo 30 min acumulados
  const act=S.acts.find(a=>a.id===best);
  if(!act) return null;
  const t=act.t.toLowerCase();
  if(t.includes('ejerc')||t.includes('gym')||t.includes('entren')) return 'banda';
  if(t.includes('estud')||t.includes('lect')||t.includes('leer')) return 'libro';
  if(t.includes('trabaj')||t.includes('marca')||t.includes('negoc')) return 'gafas';
  return null;
}
function edSVG(size){ return petSVG(size, edMood(), edStage(), edAccessory(), (S&&S.pet)||'ed'); }
/* Ed v2 — mapache con gradientes, bigotes, cola anillada, parpadeo y poses.
   moods: happy | ok | sad | sleep | party (celebración con brazos arriba)   */
let PET_UID=0;
function petSVG(size, mood, stage, acc, pet){
  const u='pg'+(++PET_UID);                       // ids únicos: varios Eds por pantalla
  const sc=stage==='cachorro'?0.82:stage==='joven'?0.93:1;
  const dark='#353B49', darker='#262B36', cream='#F4F0E6', nose='#20242E', blue='var(--accent)';
  const isIss = pet==='issabella';
  const party = mood==='party';
  const open = mood==='ok'||party;
  /* ojos / boca / extras según ánimo */
  let eyes='', mouth='', extra='';
  const blink=`<animate attributeName="opacity" values="1;1;0;1;1" keyTimes="0;.46;.5;.54;1" dur="4.6s" repeatCount="indefinite"/>`;
  if(mood==='happy'){
    eyes=`<path d="M37.5 44 q4.5 -5.5 9 0" stroke="${cream}" stroke-width="3.2" fill="none" stroke-linecap="round"/>
          <path d="M63.5 44 q4.5 -5.5 9 0" stroke="${cream}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`;
    mouth=`<path d="M48 57.5 q7 7 14 0" stroke="${nose}" stroke-width="3" fill="none" stroke-linecap="round"/>
           <path d="M51.5 60.8 q3.5 2.4 7 0" stroke="#D98686" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    extra=`<circle cx="33" cy="52" r="4.2" fill="#EFA8A8" opacity=".7"/><circle cx="77" cy="52" r="4.2" fill="#EFA8A8" opacity=".7"/>`;
  }else if(open){
    eyes=`<g${party?'':''}><circle cx="42" cy="43.5" r="4.6" fill="#fff"/><circle cx="68" cy="43.5" r="4.6" fill="#fff"/>
          <circle cx="42.8" cy="44" r="2.9" fill="${nose}"/><circle cx="68.8" cy="44" r="2.9" fill="${nose}"/>
          <circle cx="43.7" cy="42.9" r="1" fill="#fff"/><circle cx="69.7" cy="42.9" r="1" fill="#fff"/>${blink}</g>`;
    mouth=party
      ?`<path d="M48.5 56.5 q6.5 8 13 0 q-6.5 3.6 -13 0z" fill="${nose}"/><path d="M51.5 61.4 q3.5 1.8 7 0" stroke="#D98686" stroke-width="2.6" fill="none" stroke-linecap="round"/>`
      :`<path d="M50 57.5 q5 3.4 10 0" stroke="${nose}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    if(party)extra=`<circle cx="33" cy="52" r="4.2" fill="#EFA8A8" opacity=".7"/><circle cx="77" cy="52" r="4.2" fill="#EFA8A8" opacity=".7"/>
      <g font-size="9">
        <text x="16" y="22">✦<animate attributeName="opacity" values="0;1;0" dur="1.1s" repeatCount="indefinite"/></text>
        <text x="88" y="16">✦<animate attributeName="opacity" values="0;1;0" dur="1.3s" begin=".3s" repeatCount="indefinite"/></text>
        <text x="94" y="34">✦<animate attributeName="opacity" values="0;1;0" dur="1s" begin=".6s" repeatCount="indefinite"/></text>
      </g>`;
  }else if(mood==='sad'){
    eyes=`<path d="M37.5 45 q4.5 3.2 9 1" stroke="${cream}" stroke-width="3.2" fill="none" stroke-linecap="round"/>
          <path d="M72.5 45 q-4.5 3.2 -9 1" stroke="${cream}" stroke-width="3.2" fill="none" stroke-linecap="round"/>
          <path d="M36 36.5 q4 -2.4 8 -.8" stroke="${darker}" stroke-width="2" fill="none" stroke-linecap="round"/>
          <path d="M74 36.5 q-4 -2.4 -8 -.8" stroke="${darker}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    mouth=`<path d="M49 61 q6 -5 12 0" stroke="${nose}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    extra=`<circle cx="70.5" cy="52" r="2.3" fill="#9CC7EC"><animate attributeName="cy" values="52;59;52" dur="2.4s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;.2;1" dur="2.4s" repeatCount="indefinite"/></circle>`;
  }else{ // sleep
    eyes=`<path d="M37.5 44.5 q4.5 2 9 0 M63.5 44.5 q4.5 2 9 0" stroke="${cream}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    mouth=`<ellipse cx="55" cy="59" rx="3" ry="3.6" fill="${nose}"><animate attributeName="ry" values="3.6;2.4;3.6" dur="3.2s" repeatCount="indefinite"/></ellipse>`;
    extra=`<g fill="${blue}" font-family="'Plus Jakarta Sans',sans-serif" font-weight="800">
      <text x="82" y="26" font-size="11">z<animate attributeName="opacity" values="0;1;0" dur="2.6s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 0;2 -4;4 -8" dur="2.6s" repeatCount="indefinite"/></text>
      <text x="90" y="18" font-size="8">z<animate attributeName="opacity" values="0;1;0" dur="2.6s" begin=".8s" repeatCount="indefinite"/></text></g>`;
  }
  /* accesorios */
  let accSVG='';
  if(acc==='gafas') accSVG=`<g stroke="${blue}" stroke-width="2.6" fill="none" opacity=".95">
      <circle cx="42" cy="44" r="8.6"/><circle cx="68" cy="44" r="8.6"/><path d="M50.6 44 h8.8 M33.4 44 h-5.4 M76.6 44 h5.4"/></g>`;
  if(acc==='banda') accSVG=`<path d="M29.5 29.5 q25.5 -9.5 51 0 l-1.5 7.5 q-24 -8.5 -48 0 z" fill="${blue}"/><path d="M33 33.5 q22 -7.5 44 0" stroke="rgba(255,255,255,.35)" stroke-width="2" fill="none"/>`;
  if(acc==='libro') accSVG=`<g transform="translate(73,64) rotate(10)"><rect width="21" height="16" rx="2.5" fill="${blue}"/><rect x="1.5" y="1.5" width="18" height="13" rx="1.5" fill="rgba(255,255,255,.22)"/><path d="M10.5 1 v14" stroke="${cream}" stroke-width="1.6"/><path d="M3.5 5 h4.5 M3.5 8 h4.5 M13 5 h4.5 M13 8 h4.5" stroke="${cream}" stroke-width="1.2"/></g>`;
  const scarf = stage==='adulto' ? `<path d="M39 71.5 q16 8.5 32 0 l-2 8.5 q-14 6.5 -28 0 z" fill="${blue}"/><rect x="62" y="76" width="7.5" height="15" rx="3.5" fill="${blue}"/><path d="M62 80 h7.5 M62 85 h7.5" stroke="rgba(255,255,255,.3)" stroke-width="1.6"/>` : '';
  /* animaciones de cuerpo */
  const bounce = (mood==='happy'||party) ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -2.6;0 0" dur="${party?'0.9':'1.7'}s" repeatCount="indefinite" additive="sum"/>` : '';
  const tailWag = (mood==='happy'||party) ? `<animateTransform attributeName="transform" type="rotate" values="-4 84 82;6 84 82;-4 84 82" dur="1.4s" repeatCount="indefinite"/>` : '';
  const earL = party?`<animateTransform attributeName="transform" type="rotate" values="0 32 34;-6 32 34;0 32 34" dur=".9s" repeatCount="indefinite"/>`:'';
  const earR = party?`<animateTransform attributeName="transform" type="rotate" values="0 78 34;6 78 34;0 78 34" dur=".9s" begin=".45s" repeatCount="indefinite"/>`:'';
  /* brazos: normales o arriba (celebración) */
  const arms = party
    ? `<g><path d="M36 66 Q26 56 24 46" stroke="url(#${u}-fur)" stroke-width="9" fill="none" stroke-linecap="round"/><circle cx="24" cy="45" r="5.5" fill="${dark}"/>
        <path d="M74 66 Q84 56 86 46" stroke="url(#${u}-fur)" stroke-width="9" fill="none" stroke-linecap="round"/><circle cx="86" cy="45" r="5.5" fill="${dark}"/></g>`
    : `<g><ellipse cx="38" cy="74" rx="6" ry="9" fill="url(#${u}-fur)" transform="rotate(14 38 74)"/><ellipse cx="72" cy="74" rx="6" ry="9" fill="url(#${u}-fur)" transform="rotate(-14 72 74)"/></g>`;
  /* Isabella: moño + pestañas */
  const bow = isIss ? `<g transform="translate(35,23) rotate(-8)"><path d="M0 0 C-9 -8 -13 -2 -10 4 C-8 8 -3 6 0 0" fill="${blue}"/><path d="M0 0 C9 -8 13 -2 10 4 C8 8 3 6 0 0" fill="${blue}"/><circle cx="0" cy="1" r="3.4" fill="var(--accent-press)"/></g>` : '';
  const lashes = isIss ? `<path d="M33.5 40.5 l-3.8 -2 M33 43.5 l-4 -.3 M76.5 40.5 l3.8 -2 M77 43.5 l4 -.3" stroke="${darker}" stroke-width="1.6" stroke-linecap="round" fill="none"/>` : '';
  return `<svg viewBox="0 0 110 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${u}-fur" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9AA3B5"/><stop offset="1" stop-color="#7E8798"/></linearGradient>
    <linearGradient id="${u}-head" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A2ABBD"/><stop offset="1" stop-color="#87909F"/></linearGradient>
    <linearGradient id="${u}-belly" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBF8F0"/><stop offset="1" stop-color="#E9E3D3"/></linearGradient>
  </defs>
  <g transform="translate(55,52) scale(${sc}) translate(-55,-50)">
    <g>${bounce}
    <ellipse cx="55" cy="90" rx="27" ry="7" fill="${darker}" opacity=".14"/>
    <g>${tailWag}
      <path d="M74 80 Q92 84 96 68" stroke="url(#${u}-fur)" stroke-width="13" fill="none" stroke-linecap="round"/>
      <path d="M84 81.5 l6 -8 M90.5 77 l4.5 -7" stroke="${dark}" stroke-width="5.5" stroke-linecap="round"/>
    </g>
    <ellipse cx="55" cy="73" rx="24.5" ry="18.5" fill="url(#${u}-fur)"/>
    <ellipse cx="55" cy="78" rx="14.5" ry="11.5" fill="url(#${u}-belly)"/>
    ${arms}
    <ellipse cx="46" cy="89" rx="6.5" ry="4" fill="${dark}"/><ellipse cx="64" cy="89" rx="6.5" ry="4" fill="${dark}"/>
    <g>${earL}<path d="M27 24 L41 33 L25.5 40 Z" fill="url(#${u}-head)"/><path d="M30.5 27.5 L38.5 32.5 L29.5 36.5 Z" fill="#E8A8B8"/></g>
    <g>${earR}<path d="M83 24 L69 33 L84.5 40 Z" fill="url(#${u}-head)"/><path d="M79.5 27.5 L71.5 32.5 L80.5 36.5 Z" fill="#E8A8B8"/></g>
    <ellipse cx="55" cy="46" rx="27.5" ry="22.5" fill="url(#${u}-head)"/>
    <path d="M28.5 41.5 q11.5 -8.5 23 -1 q-9.5 12.5 -23 8.5 z" fill="${dark}"/>
    <path d="M81.5 41.5 q-11.5 -8.5 -23 -1 q9.5 12.5 23 8.5 z" fill="${dark}"/>
    <path d="M30 40.5 q10 -6.5 20 -.5" stroke="rgba(255,255,255,.14)" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M80 40.5 q-10 -6.5 -20 -.5" stroke="rgba(255,255,255,.14)" stroke-width="2" fill="none" stroke-linecap="round"/>
    <ellipse cx="55" cy="56.5" rx="12.5" ry="10" fill="url(#${u}-belly)"/>
    <path d="M26 50 l-7 -1.5 M26.5 53 l-6.5 .5 M83.5 50 l7 -1.5 M83 53 l6.5 .5" stroke="${dark}" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>
    <ellipse cx="55" cy="52" rx="4.8" ry="3.8" fill="${nose}"/>
    <ellipse cx="53.6" cy="51" rx="1.5" ry="1" fill="rgba(255,255,255,.35)"/>
    ${eyes}${mouth}${extra}${lashes}${accSVG}${scarf}${bow}
    </g>
  </g></svg>`;
}
function petName(){ return (S&&S.pet==='issabella')?'Isabella':'Ed'; }
function petFem(){ return !!(S&&S.pet==='issabella'); }
function moodTxt(m){
  const n=petName(), f=petFem();
  return {
    happy:n+' está feliz y '+(f?'orgullosa':'orgulloso')+' de ti ✨',
    ok:n+' está '+(f?'tranquila':'tranquilo')+', esperándote 🍃',
    sad:n+' está triste... un pequeño paso '+(f?'la':'lo')+' animaría 💙',
    sleep:n+' está durmiendo... shhh 💤'
  }[m];
}
function renderEd(){
  $('ed-stage').innerHTML=edSVG(108);
  $('ed-mood').textContent=moodTxt(edMood());
  const fp=$('foot-pet'); if(fp)fp.textContent=petName();
}
function edTap(){
  $('ed-big').innerHTML=edSVG(190);
  const st=edStage(), acc=edAccessory(), n=petName(), f=petFem();
  const stTxt={
    cachorro:n+' es '+(f?'una cachorrita':'un cachorro')+': está creciendo contigo. A los 7 días activos se hará joven.',
    joven:n+' es '+(f?'joven y curiosa':'joven y curioso')+'. A los 30 días activos se '+(f?'volverá adulta':'volverá adulto')+' (y estrenará bufanda).',
    adulto:n+' es '+(f?'adulta: una mapache sabia':'adulto: un mapache sabio')+', testigo de tu constancia.'
  }[st];
  const accTxt={gafas:'Lleva gafas porque últimamente te has enfocado en tu trabajo y tu marca. 👓',banda:'Lleva su banda deportiva porque el ejercicio ha sido tu prioridad. 💪',libro:'Carga su libro porque has estado estudiando mucho. 📖'}[acc]||'Aún no lleva accesorios: dedica horas a una actividad y verás cómo se equipa.';
  $('ed-desc').textContent=n+' refleja cómo estás tú: tu ánimo en los check-ins, tu progreso del día y tu racha '+(f?'la':'lo')+' alimentan.';
  const t1=$('ed-ov-title'); if(t1)t1.textContent=n;
  const t2=$('ed-facts-h'); if(t2)t2.textContent='Sobre '+n;
  $('ed-facts').innerHTML=`
    <div class="row"><div class="lbl">Etapa: ${st}<span class="sub">${stTxt}</span></div></div>
    <div class="row"><div class="lbl">Accesorio<span class="sub">${accTxt}</span></div></div>
    <div class="row"><div class="lbl">Su ánimo hoy<span class="sub">${moodTxt(edMood())}</span></div></div>`;
  openSheet('ed-ov');
}

/* ---------------- HOY ---------------- */
function habitsToday(){return S.habitDone[today()]||[];}
function tasksOf(k){return S.tasks.filter(t=>t.date===k);}
function dayProgress(){
  const hd=habitsToday().length, ht=S.habits.length;
  const tt=tasksOf(today());
  const tp=tt.reduce((a,t)=>a+(t.prog||0),0);
  const total=ht*100+tt.length*100;
  const got=hd*100+tp;
  return total?Math.round(got/total*100):0;
}
/* Racha global con protector 🧊: un día suelto sin actividad no rompe la racha
   (máx. 1 puente por semana; dos días vacíos seguidos sí la rompen). */
let STREAK_BRIDGED=false;
function streak(){
  STREAK_BRIDGED=false;
  let n=0, lastSkip=-99, i=0;
  const d=new Date();
  if(!(S.habitDone[today()]||[]).length) d.setDate(d.getDate()-1);
  while(i<3650){
    const k=iso(d);
    if((S.habitDone[k]||[]).length){ n++; }
    else{
      const prev=new Date(d); prev.setDate(prev.getDate()-1);
      const prevOk=(S.habitDone[iso(prev)]||[]).length>0;
      if(n>0 && prevOk && (i-lastSkip)>=7){ lastSkip=i; STREAK_BRIDGED=true; }
      else break;
    }
    d.setDate(d.getDate()-1); i++;
  }
  return n;
}
/* Racha individual de un hábito */
function habitStreak(id){
  let n=0;const d=new Date();
  if(!(S.habitDone[today()]||[]).includes(id)) d.setDate(d.getDate()-1);
  for(let i=0;i<400;i++){
    const k=iso(d);
    if((S.habitDone[k]||[]).includes(id)){n++;d.setDate(d.getDate()-1);}
    else break;
  }
  return n;
}
function toggleHabit(id){
  const k=today();
  if(!S.habitDone[k])S.habitDone[k]=[];
  const arr=S.habitDone[k],i=arr.indexOf(id);
  if(i===-1){arr.push(id);edReact();haptic([15,30,25]);}else{arr.splice(i,1);haptic(8);}
  save();renderHoy();renderCal();
}
const PRI={alta:0,media:1,baja:2};
let newTaskP='media';
function setNewTaskP(p){
  newTaskP=p; haptic(6);
  document.querySelectorAll('#prio-pick .prio-chip').forEach(b=>b.classList.toggle('on',b.dataset.p===p));
}
function addTask(){
  const inp=$('new-task'),t=inp.value.trim();if(!t)return;
  const p=newTaskP;
  let est=parseInt(($('new-task-min')||{}).value)||0;
  est=Math.max(0,Math.min(600,est));
  S.tasks.push({id:'t'+Date.now(),t,date:today(),p,prog:0,done:false,nag:p==='alta'&&S.beastOn,est:est||null,timerEnd:null,timerRemain:null});
  haptic();
  inp.value='';if($('new-task-min'))$('new-task-min').value='';
  save();renderHoy();
}
/* --- cuenta regresiva por tarea --- */
function fmtMS(ms){const m=Math.floor(ms/60000),s=Math.floor(ms%60000/1000);return m+':'+String(s).padStart(2,'0');}
function taskRemain(t){
  if(t.timerEnd)return Math.max(0,t.timerEnd-Date.now());
  if(t.timerRemain!=null)return t.timerRemain;
  return (t.est||0)*60000;
}
function taskTimerToggle(id){
  const t=S.tasks.find(x=>x.id===id);if(!t||!t.est||t.done)return;
  if(t.timerEnd){
    t.timerRemain=Math.max(0,t.timerEnd-Date.now());t.timerEnd=null;
    toast('⏸ Cuenta regresiva pausada');
  }else{
    t.timerEnd=Date.now()+(t.timerRemain!=null&&t.timerRemain>0?t.timerRemain:t.est*60000);
    t.timerRemain=null;
    toast('⏱️ '+t.est+' min en marcha. ¡A por ello!');
  }
  save();renderHoy();
}
function askTaskDone(t){
  showDlg({ico:'⏰',title:'¡Tiempo cumplido!',msg:'«'+t.t+'» — ¿la completaste?',acts:[
    {label:'Sí, completada 🎉',style:'primary',cb:()=>{setProg(t.id,100);renderHoy();}},
    {label:'Aún no, dame un momento',style:'plain',cb:null}
  ]});
}
function askHabitDone(h){
  showDlg({ico:'⏰',title:'¡Tiempo cumplido!',msg:'«'+h.t+'» — ¿lo lograste?',acts:[
    {label:'Sí, hecho 🎉',style:'primary',cb:()=>{const k=today();if(!S.habitDone[k])S.habitDone[k]=[];if(!S.habitDone[k].includes(h.id))S.habitDone[k].push(h.id);save();renderHoy();renderCal();}},
    {label:'Aún no',style:'plain',cb:null}
  ]});
}
function tickTaskTimers(){
  let ended=false;
  S.tasks.forEach(t=>{
    if(t.timerEnd&&!t.done){
      const r=t.timerEnd-Date.now();
      if(r<=0){
        t.timerEnd=null;t.timerRemain=null;ended=true;
        notify('⏰ Tiempo cumplido','«'+t.t+'» — ¿la completaste?');
        haptic([300,120,300]);beep2();askTaskDone(t);
      }else{
        const el=$('ttm-'+t.id);if(el)el.textContent=fmtMS(r);
      }
    }
  });
  const doneToday=habitsToday();
  S.habits.forEach(h=>{
    if(h.timerEnd && !doneToday.includes(h.id)){
      const r=h.timerEnd-Date.now();
      if(r<=0){
        h.timerEnd=null;h.timerRemain=null;ended=true;
        notify('⏰ Tiempo cumplido','«'+h.t+'» — ¿lo lograste?');
        haptic([300,120,300]);beep2();askHabitDone(h);
      }else{
        const el=$('htm-'+h.id);if(el)el.textContent=fmtMS(r);
      }
    }
  });
  if(ended){save();renderHoy();}
}
function setProg(id,v){
  const t=S.tasks.find(x=>x.id===id);if(!t)return;
  v=parseInt(v);
  const was=t.done;
  t.prog=v;t.done=v>=100;
  let stepDone=false;
  if(t.done){
    t.nag=false;t.notifyAt=null;
    t.timerEnd=null;t.timerRemain=null;
    if(S.focusTask===t.id)S.focusTask=null;
    if(t.goalRef){
      const g=S.goals.find(x=>x.id===t.goalRef.g);
      if(g&&g.steps[t.goalRef.i]&&!g.steps[t.goalRef.i].done){
        g.steps[t.goalRef.i].done=true;
        g.done=goalPct(g)===100;
        stepDone=true;
      }
    }
  }
  save();
  const el=document.querySelector(`[data-task="${id}"]`);
  if(el)el.classList.toggle('done',t.done);
  if(t.done&&!was){toast(stepDone?'🎯 Tarea y paso de meta completados':'✓ Tarea completada. '+petName()+' sonríe.');renderEd();edReact();}
  updDayline();
}
function delTask(id){
  const el=document.querySelector(`[data-task="${id}"]`);
  haptic(15);
  animateOut(el,()=>{
    S.tasks=S.tasks.filter(x=>x.id!==id);
    if(S.focusTask===id)S.focusTask=null;
    save();renderHoy();renderCal();renderSel();
  });
}
function focusTask(id){
  const t=S.tasks.find(x=>x.id===id);if(!t||t.done)return;
  S.focusTask=id;save();
  go('tiempo');
  if(!S.pomoState)startPomo('work',1,t.est||null);else renderPomo();
  toast('🍅 Enfocando: '+t.t+(t.est?' ('+t.est+' min)':''));
  renderHoy();
}
function clearFocusTask(){S.focusTask=null;save();renderPomo();renderHoy();}
function toggleNag(id){
  const t=S.tasks.find(x=>x.id===id);if(!t)return;
  t.nag=!t.nag;
  t.notifyAt = t.nag ? Date.now()+S.beastEvery*60000 : null;
  save();renderHoy();
  toast(t.nag?'🔥 Modo bestia activado en esta tarea':'Modo bestia desactivado');
}
function addTaskFromSug(em,txt,p){
  S.tasks.push({id:'t'+Date.now(),t:em+' '+txt,date:today(),p:p||'media',prog:0,done:false,nag:false});
  save();renderHoy();toast('✓ Añadida a hoy');
}
const PRI_TXT={alta:'Muy importante',media:'Importante',baja:'Puede esperar'};
function toggleTask(id){
  const t=S.tasks.find(x=>x.id===id);if(!t)return;
  haptic(t.done?8:[15,30,25]);
  setProg(id,t.done?0:100);
  renderHoy();renderSel();
}
function taskTimerPill(t){
  const remain=taskRemain(t), on=!!t.timerEnd;
  return `<button class="hb-timer ${on?'on':''}" onclick="event.stopPropagation();taskTimerToggle('${t.id}')" aria-label="${on?'Pausar':'Iniciar'} cuenta regresiva">
    ${on?'<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
        :'<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'}
    <span id="ttm-${t.id}">${fmtMS(remain)}</span></button>`;
}
function taskRow(t,ctx){
  const isFocus=S.focusTask===t.id;
  const focusBtn = t.done ? '' : `<button class="icon-btn" onclick="focusTask('${t.id}')" aria-label="Enfocar con pomodoro" title="Enfocar con un pomodoro" style="${isFocus?'color:var(--accent);background:var(--accent-soft)':''}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="13" r="7.5"/><path d="M12 10v3.5M9.5 2.5h5"/></svg></button>`;
  const nagBtn = t.done ? '' : `<button class="icon-btn" onclick="toggleNag('${t.id}')" aria-label="Modo bestia" title="Insistir hasta completar">
    <svg viewBox="0 0 24 24" fill="${t.nag?'var(--danger)':'none'}" stroke="${t.nag?'var(--danger)':'currentColor'}" stroke-width="2"><path d="M12 2c1 3-1 5-1 7a3 3 0 006 0c0-1 0-2-.5-3 2 1.5 3.5 4 3.5 7a8 8 0 01-16 0c0-4 3-6 4-9 .5 2 2 2.5 4-2z"/></svg></button>`;
  return `<div class="task2 ${t.done?'done':''}" data-task="${t.id}">
    <div class="cbx" onclick="toggleTask('${t.id}')"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></div>
    <div class="t2-body">
      <span class="txt" onclick="toggleTask('${t.id}')">${esc(t.t)}</span>
      <div class="t2-meta">
        <span class="pchip ${t.p||'media'}">${PRI_TXT[t.p||'media']}</span>
        ${t.est&&!t.done?taskTimerPill(t):''}
        ${t.nag&&!t.done?'<span class="beast-tag">🔥 BESTIA</span>':''}
      </div>
    </div>
    <div class="t2-actions">${focusBtn}${nagBtn}
    <button class="icon-btn" onclick="delTask('${t.id}')${ctx==='cal'?';renderSel()':''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>
  </div>`;
}
function renderHoy(){
  const name=S.name?', '+S.name:'';
  const h=new Date().getHours();
  $('greet').textContent=(h<12?'Buenos días':h<19?'Buenas tardes':'Buenas noches')+name;
  $('today-line').textContent=new Date().toLocaleDateString('es',{weekday:'long',day:'numeric',month:'long'});
  const q=dailyQuote();$('quote-t').textContent='“'+q[0]+'”';$('quote-a').textContent='— '+q[1];
  renderEd();
  renderMoodQuick();
  // intención del día
  const ci=S.checkins[today()]||{};
  $('ci-m-sub').textContent = ci.m ? '✓ Hoy: '+esc(ci.m.intent||'listo') : '¿Qué haría que hoy valga la pena?';
  // hábitos
  const done=habitsToday();
  $('habit-list').innerHTML=S.habits.length?S.habits.map(hb=>{
    const d=done.includes(hb.id);
    const hs=habitStreak(hb.id);
    const on=!!hb.timerEnd;
    const timer = (hb.est&&!d) ? `<button class="hb-timer ${on?'on':''}" onclick="event.stopPropagation();habitTimerToggle('${hb.id}')" aria-label="${on?'Pausar':'Iniciar'} cronómetro">
        ${on?'<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>':'<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'}
        <span id="htm-${hb.id}">${fmtMS(habitRemain(hb))}</span></button>` : '';
    return `<div class="row done-wrap ${d?'done':''}" style="background:var(--card)">
      <div class="cbx" onclick="toggleHabit('${hb.id}')"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></div>
      <span class="hb-txt" onclick="toggleHabit('${hb.id}')">${hb.em?hb.em+' ':''}${esc(hb.t)}${hb.est?`<span class="hb-est">~${hb.est} min</span>`:''}</span>
      ${timer}${hs>=2?`<span class="hstreak">${hs}🔥</span>`:''}</div>`;
  }).join(''):'<div class="empty" style="background:var(--card)">Añade tus hábitos en Ajustes.</div>';
  $('hab-count').textContent=done.length+' / '+S.habits.length;
  // tareas ordenadas por prioridad
  const tt=tasksOf(today()).slice().sort((a,b)=>(a.done-b.done)||(PRI[a.p]-PRI[b.p]));
  $('task-list').innerHTML=tt.length?tt.map(t=>taskRow(t,'hoy')).join(''):emptyHtml('🎯','Día despejado','Añade tu primera tarea abajo, o roba una idea de las sugerencias.','Ver sugerencias','go(\'sugerencias\')');
  updDayline();
  const st=streak();
  $('streak').textContent=st+(STREAK_BRIDGED?' 🧊':'');
}
/* selector de ánimo de un toque (caritas de colores, estilo referencia) */
const MQ_COLORS=['#F2A6A6','#F6C089','#EFD583','#A6C6F4','#93D6AC'];
function renderMoodQuick(){
  const el=$('mood-quick'); if(!el)return;
  const cur=((S.checkins[today()]||{}).m||{}).mood||0;
  el.innerHTML=MOODS.map((m,i)=>`<button class="mq ${cur===i+1?'on':''}" style="background:${MQ_COLORS[i]}" onclick="quickMood(${i+1})" aria-label="Ánimo ${i+1} de 5">${m}</button>`).join('');
}
function quickMood(n){
  const k=today();
  if(!S.checkins[k])S.checkins[k]={};
  if(!S.checkins[k].m)S.checkins[k].m={};
  S.checkins[k].m.mood=n;
  save();haptic(12);
  renderMoodQuick(); renderEd(); renderCIHist();
  const st=$('ed-stage'); if(st){ st.classList.remove('pop'); void st.offsetWidth; st.classList.add('pop'); }
  toast(petName()+' lo tomó en cuenta 💙');
}
function updDayline(){
  const p=dayProgress();
  const C=251.3, ring=$('ring');
  ring.style.strokeDashoffset=C-(C*p/100);
  ring.style.stroke = p===100 ? 'var(--green)' : 'url(#ringGrad)';
  $('ring-pct').textContent=p+'%';
  const hd=habitsToday().length, tt=tasksOf(today());
  const remaining=(S.habits.length-hd)+tt.filter(t=>!t.done).length;
  $('day-sub').textContent = p===100 ? '¡Día completado! '+petName()+' está feliz 🦝' : remaining? remaining+' cosa'+(remaining>1?'s':'')+' por delante' : 'Empieza marcando un hábito';
  // 🎉 celebración (una vez por día) al llegar al 100%
  if(p===100 && (S.habits.length+tt.length)>0){
    if(!S.celebrated)S.celebrated={};
    if(!S.celebrated[today()]){
      S.celebrated[today()]=1;save();
      confetti();beep2();haptic([80,60,80,60,120]);edReact('party');
      if('vibrate' in navigator)navigator.vibrate([100,60,100,60,200]);
    }
  }
  checkBadges();
}


function actSecs(id,k){return (S.actLog[k]&&S.actLog[k][id])||0;}
function runningExtra(id){
  if(S.running&&S.running.id===id)return Math.floor((Date.now()-S.running.start)/1000);
  return 0;
}
function commitRunning(){
  if(!S.running)return;
  const k=today(),sec=Math.floor((Date.now()-S.running.start)/1000);
  if(!S.actLog[k])S.actLog[k]={};
  S.actLog[k][S.running.id]=(S.actLog[k][S.running.id]||0)+sec;
  S.running=null;save();
}
function actToggle(id){
  if(S.running&&S.running.id===id){commitRunning();toast('⏸ Pausado');}
  else{
    if(S.running)commitRunning();
    S.running={id,start:Date.now()};save();
    const a=S.acts.find(x=>x.id===id);
    toast('▶ '+a.em+' '+a.t+' en marcha');
  }
  renderTiempo();
}
function renderTiempo(){
  renderPomo();
  const k=today();
  $('act-list').innerHTML=S.acts.map(a=>{
    const sec=actSecs(a.id,k)+runningExtra(a.id);
    const goal=a.goal*60;
    const pct=Math.min(100,sec/goal*100);
    const on=S.running&&S.running.id===a.id;
    return `<div class="act">
      <div class="act-top">
        <span class="act-ico" style="background:color-mix(in srgb,${a.c} 18%,transparent)">${a.em}</span>
        <span class="nm">${esc(a.t)}</span>
        <span class="tm" id="tm-${a.id}">${fmtHM(sec)}</span>
        <button class="play ${on?'on':''}" onclick="actToggle('${a.id}')" aria-label="${on?'Pausar':'Iniciar'} ${esc(a.t)}">
          ${on?'<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
              :'<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'}
        </button>
      </div>
      <div class="track"><div class="fill" id="fl-${a.id}" style="width:${pct}%; background:${a.c}"></div></div>
      <div class="meta"><span>${pct>=100?'✓ Meta cumplida':Math.round(pct)+'% de la meta'}</span><span>meta ${(a.goal/60).toFixed(1).replace('.0','')} h</span></div>
    </div>`;
  }).join('');
}
setInterval(()=>{
  if(!S)return;
  if(S.running){
    const k=today(),a=S.running;
    const el=$('tm-'+a.id);
    if(el){
      const sec=actSecs(a.id,k)+runningExtra(a.id);
      el.textContent=fmtHM(sec);
      const act=S.acts.find(x=>x.id===a.id);
      const fl=$('fl-'+a.id);
      if(fl&&act)fl.style.width=Math.min(100,sec/(act.goal*60)*100)+'%';
    }
  }
  tickTaskTimers();
},1000);

/* ---------------- INTENCIÓN DEL DÍA ---------------- */
let ciData={};
const MOODS=['😞','😕','😐','🙂','😄'];
function openCI(type){
  ciData={};
  const prev=(S.checkins[today()]||{}).m||{};
  $('ci-title').textContent='☀️ Hoy';
  let html=`<span class="q-label">¿Cómo amaneces?</span>
    <div class="mood-row">${MOODS.map((m,i)=>`<button class="mood ${prev.mood===i+1?'on':''}" data-q="mood" data-v="${i+1}">${m}</button>`).join('')}</div>
    <span class="q-label">¿Cuánta energía tienes?</span>
    <div class="lvl-row">${['Muy poca','Poca','Media','Buena','A tope'].map((l,i)=>`<button class="lvl ${prev.energy===i+1?'on':''}" data-q="energy" data-v="${i+1}">${l}</button>`).join('')}</div>
    <span class="q-label">Tu intención de hoy</span>
    <p class="q-sub">Una sola frase. ¿Qué haría que hoy valga la pena?</p>
    <textarea id="ci-text" placeholder="Hoy quiero…">${esc(prev.intent||'')}</textarea>`;
  $('ci-body').innerHTML=html;
  ciData=Object.assign({},prev);
  document.querySelectorAll('#ci-body [data-q]').forEach(b=>{
    b.onclick=()=>{
      ciData[b.dataset.q]=parseInt(b.dataset.v);
      b.parentElement.querySelectorAll('button').forEach(x=>x.classList.remove('on'));
      b.classList.add('on');
    };
  });
  openSheet('ci-ov',()=>{renderHoy();renderCIHist();});
}
function closeCI(saveIt){
  if(saveIt){
    if(!ciData.mood){toast('Elige cómo te sientes');haptic([40,60,40]);return;}
    const k=today();
    if(!S.checkins[k])S.checkins[k]={};
    ciData.intent=($('ci-text')||{}).value||'';
    S.checkins[k].m=ciData;
    save();haptic();
    toast('☀️ Día iniciado con intención');
  }
  closeSheet('ci-ov');
}
function renderCIHist(){
  const days=Object.keys(S.checkins).sort().reverse().slice(0,7);
  let html='';
  days.forEach(k=>{
    const c=S.checkins[k];
    if(c.m)html+=`<div class="ci-hist-item"><span class="em">${MOODS[c.m.mood-1]||'☀️'}</span><div class="t"><b>${fmtDate(k)}</b><p>${esc(c.m.intent||'—')}</p></div></div>`;
  });
  $('ci-hist').innerHTML=html||emptyHtml('☀️','Cada mañana, una brújula','Define tu intención del día en Hoy y aquí verás tu historial.');
}

/* ---------------- CALENDARIO ---------------- */
let calY,calM,selDate=today();
function calMove(dir){
  if(dir===0){const n=new Date();calY=n.getFullYear();calM=n.getMonth();selDate=today();}
  else{calM+=dir;if(calM<0){calM=11;calY--;}if(calM>11){calM=0;calY++;}}
  renderCal();renderSel();
}
function renderCal(){
  if(calY===undefined){const n=new Date();calY=n.getFullYear();calM=n.getMonth();}
  $('cal-title').textContent=new Date(calY,calM,1).toLocaleDateString('es',{month:'long',year:'numeric'});
  let html=['L','M','X','J','V','S','D'].map(d=>`<div class="dow">${d}</div>`).join('');
  const first=new Date(calY,calM,1);
  let start=(first.getDay()+6)%7;
  const dim=new Date(calY,calM+1,0).getDate(),tk=today();
  for(let i=0;i<start;i++)html+='<div class="day other"></div>';
  for(let d=1;d<=dim;d++){
    const k=calY+'-'+String(calM+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const hd=(S.habitDone[k]||[]).length,tks=tasksOf(k),ci=S.checkins[k];
    const dots=(hd?'<span class="dd" style="background:var(--accent)"></span>':'')+
               (tks.length?'<span class="dd" style="background:var(--ok)"></span>':'')+
               (ci?'<span class="dd" style="background:var(--gold)"></span>':'');
    html+=`<div class="day ${k===tk?'today':''} ${k===selDate?'sel':''}" onclick="selectDay('${k}')">${d}<div class="dots">${dots}</div></div>`;
  }
  $('cal-grid').innerHTML=html;
}
function selectDay(k){selDate=k;renderCal();renderSel();}
function renderSel(){
  $('sel-title').textContent=fmtDate(selDate);
  const hd=(S.habitDone[selDate]||[]).length;
  const secs=Object.values(S.actLog[selDate]||{}).reduce((a,b)=>a+b,0);
  let sum=[];
  if(hd)sum.push(hd+' hábitos');
  if(secs)sum.push(fmtHM(secs)+' registradas');
  const ci=S.checkins[selDate];
  if(ci&&ci.m)sum.push('ánimo AM '+MOODS[ci.m.mood-1]);
  if(ci&&ci.n)sum.push('ánimo PM '+MOODS[ci.n.mood-1]);
  $('sel-summary').textContent=sum.join(' · ')||'Nada registrado este día.';
  const st=tasksOf(selDate);
  $('sel-tasks').innerHTML=st.length?'<div class="list" style="margin:0 0 8px">'+st.map(t=>taskRow(t,'cal')).join('')+'</div>':'';
}
function addPlan(){
  const inp=$('new-plan'),t=inp.value.trim();if(!t)return;
  S.tasks.push({id:'t'+Date.now(),t,date:selDate,p:'media',prog:0,done:false});
  inp.value='';save();renderCal();renderSel();renderHoy();
  toast('📅 Planificado: '+fmtDate(selDate));
}

/* ---------------- STATS ---------------- */
function renderStats(){
  const days=lastNDays(7);
  const labels=days.map(k=>{const[y,m,d]=k.split('-');return new Date(y,m-1,d).toLocaleDateString('es',{weekday:'narrow'});});
  // KPIs
  const weekSecs=days.reduce((a,k)=>a+Object.values(S.actLog[k]||{}).reduce((x,y)=>x+y,0),0);
  const habPct=Math.round(days.reduce((a,k)=>a+((S.habitDone[k]||[]).length/(S.habits.length||1)),0)/7*100);
  const weekPomo=days.reduce((a,k)=>a+(S.pomoLog[k]||0),0);
  const activeGoals=S.goals.filter(g=>goalPct(g)<100).length;
  $('kpis').innerHTML=`
    <div class="kpi"><span class="k-ico">⏱️</span><b>${fmtHM(weekSecs)}</b><span>tiempo enfocado esta semana</span></div>
    <div class="kpi"><span class="k-ico">✅</span><b>${habPct}%</b><span>hábitos cumplidos (7 días)</span></div>
    <div class="kpi"><span class="k-ico">🍅</span><b>${weekPomo}</b><span>sesiones de enfoque</span></div>
    <div class="kpi"><span class="k-ico">🔥</span><b>${streak()}</b><span>racha actual</span></div>`;
  // logros
  if(!S.badges)S.badges={};
  checkBadges();
  $('badges-grid').innerHTML=BADGES.map(b=>`
    <div class="badge ${S.badges[b.id]?'':'locked'}">
      <span class="b-em">${b.em}</span><b>${b.t}</b><span class="b-d">${b.d}</span>
    </div>`).join('');
  // Horas por actividad (barras apiladas)
  const W=340,H=150,bw=32,gap=(W-40-7*bw)/6;
  const maxSec=Math.max(3600,...days.map(k=>Object.values(S.actLog[k]||{}).reduce((a,b)=>a+b,0)));
  let bars='';
  days.forEach((k,i)=>{
    const x=30+i*(bw+gap);let y=H-22;
    S.acts.forEach(a=>{
      const s=actSecs(a.id,k);if(!s)return;
      const h=s/maxSec*(H-40);
      y-=h;
      bars+=`<rect class="bar-anim" x="${x}" y="${y}" width="${bw}" height="${h}" rx="3" fill="${a.c}" style="animation-delay:${i*0.06}s"/>`;
    });
    bars+=`<text x="${x+bw/2}" y="${H-7}" text-anchor="middle" font-size="10" fill="var(--dim)" font-weight="700">${labels[i]}</text>`;
  });
  const hLines=[0.5,1].map(f=>{const y=H-22-f*(H-40);return `<line x1="28" x2="${W}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-dasharray="3 3"/><text x="0" y="${y+3}" font-size="9" fill="var(--dim)">${(maxSec*f/3600).toFixed(1)}h</text>`;}).join('');
  $('ch-time').innerHTML=`<svg viewBox="0 0 ${W} ${H}">${hLines}${bars}</svg>`;
  $('ch-time-leg').innerHTML=S.acts.map(a=>`<span><i style="background:${a.c}"></i>${a.em} ${esc(a.t)}</span>`).join('');
  // Ánimo/energía (líneas)
  function line(vals,color){
    const pts=vals.map((v,i)=>v==null?null:[30+i*((W-50)/6),H-22-((v-1)/4)*(H-45)]);
    let d='',dots='';
    let started=false;
    pts.forEach(p=>{if(!p){started=false;return;}d+=(started?' L':' M')+p[0]+' '+p[1];started=true;dots+=`<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${color}"/>`;});
    return `<path d="${d}" stroke="${color}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`+dots;
  }
  const moods=days.map(k=>{const c=S.checkins[k];return c&&c.m&&c.m.mood?c.m.mood:null;});
  const energy=days.map(k=>{const c=S.checkins[k];return c&&c.m&&c.m.energy?c.m.energy:null;});
  const axis=labels.map((l,i)=>`<text x="${30+i*((W-50)/6)}" y="${H-6}" text-anchor="middle" font-size="10" fill="var(--dim)" font-weight="700">${l}</text>`).join('');
  $('ch-mood').innerHTML=`<svg viewBox="0 0 ${W} ${H}">${axis}${line(energy,'var(--amber)')}${line(moods,'var(--accent)')}</svg>`;
  // Pomodoros por día
  const maxP=Math.max(4,...days.map(k=>S.pomoLog[k]||0));
  let pbars='';
  days.forEach((k,i)=>{
    const v=S.pomoLog[k]||0;const x=30+i*(bw+gap);const h=Math.max(3,v/maxP*(H-40));
    pbars+=`<rect class="bar-anim" x="${x}" y="${H-22-h}" width="${bw}" height="${h}" rx="4" fill="var(--accent)" opacity="${v?1:.25}" style="animation-delay:${i*0.06}s"/>
    ${v?`<text x="${x+bw/2}" y="${H-26-h}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--dim)">${v}</text>`:''}
    <text x="${x+bw/2}" y="${H-7}" text-anchor="middle" font-size="10" fill="var(--dim)" font-weight="700">${labels[i]}</text>`;
  });
  $('ch-pomo').innerHTML=`<svg viewBox="0 0 ${W} ${H}">${pbars}</svg>`;
  // Hábitos
  let hbars='';
  days.forEach((k,i)=>{
    const pct=(S.habitDone[k]||[]).length/(S.habits.length||1);
    const x=30+i*(bw+gap),h=Math.max(3,pct*(H-40));
    hbars+=`<rect class="bar-anim" x="${x}" y="${H-22-h}" width="${bw}" height="${h}" rx="4" fill="${pct>=1?'var(--ok)':'var(--accent)'}" opacity="${0.4+pct*0.6}" style="animation-delay:${i*0.06}s"/>
    <text x="${x+bw/2}" y="${H-7}" text-anchor="middle" font-size="10" fill="var(--dim)" font-weight="700">${labels[i]}</text>`;
  });
  $('ch-hab').innerHTML=`<svg viewBox="0 0 ${W} ${H}">${hbars}</svg>`;
}

/* ---------------- IA ---------------- */
function buildSummary(){
  const days=lastNDays(7);
  let out='Resumen de mi semana (app FARO):\n';
  days.forEach(k=>{
    const hd=(S.habitDone[k]||[]).length;
    const secs=Object.entries(S.actLog[k]||{}).map(([id,s])=>{const a=S.acts.find(x=>x.id===id);return a?a.t+' '+fmtHM(s):'';}).filter(Boolean).join(', ');
    const c=S.checkins[k]||{};
    const pom=S.pomoLog[k]||0;
    const parts=[];
    if(hd)parts.push(hd+'/'+S.habits.length+' hábitos');
    if(pom)parts.push(pom+' pomodoros');
    if(secs)parts.push(secs);
    if(c.m)parts.push('ánimo '+c.m.mood+'/5, energía '+(c.m.energy||'?')+'/5'+(c.m.intent?', intención: "'+c.m.intent+'"':''));
    if(parts.length)out+='- '+k+': '+parts.join(' | ')+'\n';
  });
  if(S.goals.length){
    out+='\nMetas en curso:\n';
    S.goals.forEach(g=>{out+='- '+g.t+': '+goalPct(g)+'%'+(g.due?' (límite '+g.due+')':'')+'\n';});
  }
  out+='\nRacha: '+streak()+' días. Tareas pendientes hoy: '+S.tasks.filter(t=>!t.done&&t.date<=today()).length+'.';
  return out;
}
async function aiAnalyze(){
  const btn=$('ai-btn'),out=$('ai-out');
  btn.disabled=true;btn.textContent=petName()+' está consultando... 🦝';
  out.style.display='block';out.textContent='Analizando tu semana...';
  const summary=buildSummary();
  try{
    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:1000,messages:[{role:'user',content:
        'Eres '+petName()+', '+(petFem()?'una mapache sabia y cálida':'un mapache sabio y cálido')+', coach de hábitos de la app FARO. Analiza esta semana del usuario y responde en español, máximo 220 palabras, con: 1) lo que hizo bien (celebra concreto), 2) el patrón más importante a mejorar (uno solo, con base psicológica breve), 3) un micro-reto específico para mañana. Tono cercano, sin listas largas ni tecnicismos.\n\n'+summary}]})
    });
    const data=await res.json();
    const txt=(data.content||[]).map(c=>c.text||'').join('\n').trim();
    if(!txt)throw 0;
    out.textContent='🦝 '+txt;
  }catch(e){
    out.textContent='La IA vive en la versión de Claude. Aquí tienes tu resumen listo: mantén pulsado para copiarlo y pégamelo a Claude en el chat para tu análisis personalizado.\n\n'+summary;
  }
  btn.disabled=false;btn.textContent='Analizar mi semana';
}

/* ---------------- NOTAS (editor enriquecido + selección múltiple) ---------------- */
let curNote=null, selMode=false, selIds=new Set(), pressT=null;
function notePreview(n){
  if(!n.body)return '—';
  const d=document.createElement('div'); d.innerHTML=n.body;
  const hasImg=!!d.querySelector('img');
  const txt=(d.textContent||'').trim().replace(/\s+/g,' ');
  return (hasImg?'🖼️ ':'')+(txt.slice(0,80)||(hasImg?'Imagen':'—'));
}
function renderNotes(){
  const list=[...S.notes].sort((a,b)=>b.upd-a.upd);
  $('notes-list').innerHTML=list.length?list.map(n=>`
    <div class="note-item ${selIds.has(n.id)?'sel':''}" data-note="${n.id}"
      onclick="noteTap('${n.id}')"
      onpointerdown="notePress('${n.id}')" onpointerup="noteRelease()" onpointercancel="noteRelease()" onpointermove="noteRelease()">
      <span class="n-check"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></span>
      <div style="flex:1; min-width:0">
        <h4>${esc(n.title)||'Sin título'}</h4><p>${esc(notePreview(n))}</p><div class="nd">${fmtDate(n.date)}</div>
      </div>
    </div>`).join(''):emptyHtml('📔','Tu diario está esperándote','Escribir 3 líneas al día cambia cómo ves tu progreso.','Escribir mi primera nota','openNote(null)');
  updateSelBar();
}
function notePress(id){ clearTimeout(pressT); pressT=setTimeout(()=>{ enterSelMode(); toggleSelNote(id); },480); }
function noteRelease(){ clearTimeout(pressT); }
function noteTap(id){
  if(selMode){ toggleSelNote(id); return; }
  openNote(id);
}
function enterSelMode(){
  if(selMode)return;
  selMode=true; selIds.clear(); haptic([30,40,30]);
  $('v-diario').classList.add('selmode','selmode-active');
  renderNotes();
}
function exitSelMode(){
  selMode=false; selIds.clear();
  $('v-diario').classList.remove('selmode','selmode-active');
  renderNotes();
}
function toggleSelNote(id){
  if(selIds.has(id))selIds.delete(id); else selIds.add(id);
  haptic(8);
  if(!selIds.size){ exitSelMode(); return; }
  renderNotes();
}
function updateSelBar(){
  const c=$('sel-count'); if(c)c.textContent=selIds.size+' seleccionada'+(selIds.size===1?'':'s');
}
function delSelNotes(){
  const n=selIds.size; if(!n)return;
  showDlg({ico:'🗑️',title:'¿Eliminar '+n+' nota'+(n>1?'s':'')+'?',msg:'No se puede deshacer.',acts:[
    {label:'Sí, eliminar',style:'danger',cb:()=>{S.notes=S.notes.filter(x=>!selIds.has(x.id));save();exitSelMode();haptic([60,40,60]);toast('🗑️ Notas eliminadas');}},
    {label:'Cancelar',style:'plain',cb:null}
  ]});
}
function openNote(id){
  if(selMode)return;
  if(id)curNote=S.notes.find(n=>n.id===id);
  else{curNote={id:'n'+Date.now(),title:'',body:'',date:today(),upd:Date.now()};S.notes.push(curNote);}
  $('note-title').value=curNote.title;
  const rich=$('note-body-rich');
  if(curNote.body && curNote.body.indexOf('<')===-1) rich.textContent=curNote.body;  // notas viejas (texto plano)
  else rich.innerHTML=curNote.body||'';
  openSheet('note-ov',()=>{
    if(curNote){
      curNote.title=$('note-title').value.trim();
      const html=rich.innerHTML.replace(/^(<br>)+|(<br>)+$/g,'');
      const hasContent=rich.textContent.trim().length>0 || !!rich.querySelector('img,input');
      curNote.body=hasContent?html:'';
      curNote.upd=Date.now();
      if(!curNote.title&&!curNote.body)S.notes=S.notes.filter(n=>n.id!==curNote.id);
      curNote=null;
    }
    save();renderNotes();checkBadges();
  });
  if(!id)setTimeout(()=>$('note-title').focus(),150);
}
function closeNote(){ closeSheet('note-ov'); }
function delNote(){
  const nid=curNote&&curNote.id;
  showDlg({ico:'🗑️',title:'¿Eliminar esta nota?',msg:'No se puede deshacer.',acts:[
    {label:'Sí, eliminar',style:'danger',cb:()=>{S.notes=S.notes.filter(n=>n.id!==nid);curNote=null;save();closeSheet('note-ov');toast('Nota eliminada');}},
    {label:'Cancelar',style:'plain',cb:null}
  ]});
}
/* herramientas del editor */
function ntCmd(c){ try{document.execCommand(c,false,null);}catch(e){} $('note-body-rich').focus(); }
function ntHeading(){
  const sel=window.getSelection();
  const inH=sel.anchorNode&&sel.anchorNode.parentElement&&sel.anchorNode.parentElement.closest('h3');
  try{document.execCommand('formatBlock',false,inH?'p':'h3');}catch(e){}
  $('note-body-rich').focus();
}
function ntChecklist(){
  try{document.execCommand('insertHTML',false,'<div class="chk"><input type="checkbox"><span>&nbsp;</span></div>');}catch(e){}
  $('note-body-rich').focus();
}
function ntColor(c){
  const col=c==='inherit'?getComputedStyle(document.body).color:c;
  try{document.execCommand('foreColor',false,col);}catch(e){}
  $('note-body-rich').focus();
}
function ntImage(inp){
  const f=inp.files[0];if(!f)return;
  const img=new Image();
  img.onload=()=>{
    const MAX=800;let w=img.width,h=img.height;
    if(Math.max(w,h)>MAX){const s=MAX/Math.max(w,h);w=Math.round(w*s);h=Math.round(h*s);}
    const c=document.createElement('canvas');c.width=w;c.height=h;
    c.getContext('2d').drawImage(img,0,0,w,h);
    const url=c.toDataURL('image/jpeg',.78);
    $('note-body-rich').focus();
    try{document.execCommand('insertImage',false,url);}catch(e){}
    URL.revokeObjectURL(img.src);
    toast('🖼️ Imagen añadida a la nota');
  };
  img.src=URL.createObjectURL(f);inp.value='';
}
document.addEventListener('change',e=>{  // persistir checkboxes de checklists
  if(e.target.matches('#note-body-rich input[type=checkbox]')){
    if(e.target.checked)e.target.setAttribute('checked','');else e.target.removeAttribute('checked');
  }
});

/* ---------------- GALERÍA (IndexedDB) ---------------- */
let idb=null,photos=[],allPhotos=[],curPhoto=null,idbOK=false;
function openIDB(){return new Promise(res=>{try{
  const rq=indexedDB.open('faro-photos',1);
  rq.onupgradeneeded=e=>e.target.result.createObjectStore('p',{keyPath:'id'});
  rq.onsuccess=e=>{idb=e.target.result;idbOK=true;res();};
  rq.onerror=()=>res();
}catch(e){res();}});}
function idbAll(){return new Promise(res=>{if(!idbOK)return res([]);try{
  const tx=idb.transaction('p','readonly').objectStore('p').getAll();
  tx.onsuccess=()=>res(tx.result||[]);tx.onerror=()=>res([]);
}catch(e){res([]);}});}
function idbPut(o){if(!idbOK){if(!photos.includes(o))photos.push(o);return;}try{idb.transaction('p','readwrite').objectStore('p').put(o);}catch(e){}}
function idbDel(id){if(!idbOK){photos=photos.filter(p=>p.id!==id);return;}try{idb.transaction('p','readwrite').objectStore('p').delete(id);}catch(e){}}
/* La galería independiente se retiró: ahora las imágenes viven DENTRO de las notas.
   Se mantiene IndexedDB solo para limpiar fotos antiguas al borrar un perfil. */

/* ---------------- AJUSTES ---------------- */
function setName(v){S.name=v.trim();syncProfile();save();renderHoy();}
function setTheme(t){
  S.theme=t;save();
  document.documentElement.dataset.theme=t;
  $('th-light').classList.toggle('on',t==='light');
  $('th-dark').classList.toggle('on',t==='dark');
  renderStats();
}
function addHabit(){
  const t=$('new-habit').value.trim();if(!t)return;
  let est=parseInt(($('new-habit-min')||{}).value)||0; est=Math.max(0,Math.min(600,est));
  S.habits.push({id:'h'+Date.now(),em:$('new-habit-em').value.trim()||'✦',t,est:est||null});
  $('new-habit').value='';$('new-habit-em').value='';if($('new-habit-min'))$('new-habit-min').value='';
  save();renderSet();renderHoy();
}
function delHabit(id){S.habits=S.habits.filter(h=>h.id!==id);save();renderSet();renderHoy();}
/* --- cuenta regresiva por hábito (misma mecánica que las tareas) --- */
function habitRemain(h){
  if(h.timerEnd)return Math.max(0,h.timerEnd-Date.now());
  if(h.timerRemain!=null)return h.timerRemain;
  return (h.est||0)*60000;
}
function htRow(h){
  const total=h.est*60000, remain=habitRemain(h), on=!!h.timerEnd;
  const w=Math.max(0,Math.min(100,remain/total*100));
  return `<div class="ttrow" onclick="event.stopPropagation()">
    <button class="tt-btn ${on?'on':''}" onclick="habitTimerToggle('${h.id}')" aria-label="${on?'Pausar':'Iniciar'} cuenta regresiva">
      ${on?'<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
          :'<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'}
    </button>
    <span class="tt-time" id="htm-${h.id}">${fmtMS(remain)}</span>
    <div class="tt-track"><div class="tt-fill" id="htf-${h.id}" style="width:${w}%"></div></div>
  </div>`;
}
function habitTimerToggle(id){
  const h=S.habits.find(x=>x.id===id);if(!h||!h.est)return;
  if(h.timerEnd){
    h.timerRemain=Math.max(0,h.timerEnd-Date.now());h.timerEnd=null;
    toast('⏸ Cuenta regresiva pausada');
  }else{
    h.timerEnd=Date.now()+(h.timerRemain!=null&&h.timerRemain>0?h.timerRemain:h.est*60000);
    h.timerRemain=null;
    toast('⏱️ '+h.est+' min en marcha. ¡A por ello!');
  }
  save();renderHoy();
}
const ACT_COLORS=['#3B76F6','#F0A93C','#F4735E','#2FB980','#9B85F8','#F49A55','#3EC0D4','#EE7FB2'];
function addAct(){
  const t=$('new-act').value.trim(),g=parseFloat($('new-act-goal').value);
  if(!t){toast('Escribe el nombre');return;}
  S.acts.push({id:'a'+Date.now(),em:$('new-act-em').value.trim()||'⏱',t,goal:Math.round((g||1)*60),c:ACT_COLORS[S.acts.length%ACT_COLORS.length]});
  $('new-act').value='';$('new-act-em').value='';$('new-act-goal').value='';
  save();renderSet();renderTiempo();
}
function delAct(id){
  if(S.running&&S.running.id===id)commitRunning();
  S.acts=S.acts.filter(a=>a.id!==id);save();renderSet();renderTiempo();
}
function editGoal(id){
  const a=S.acts.find(x=>x.id===id);if(!a)return;
  showDlg({ico:a.em,title:'Meta diaria de '+a.t,msg:'¿Cuántas horas al día quieres dedicarle?',
    input:{value:(a.goal/60).toString().replace('.',','),placeholder:'Horas (ej: 1,5)',mode:'decimal'},
    acts:[
      {label:'Guardar',style:'primary',cb:(v)=>{const g=parseFloat((v||'').replace(',','.'));if(g&&g>0){a.goal=Math.round(g*60);save();renderSet();renderTiempo();toast('✓ Meta actualizada');}}},
      {label:'Cancelar',style:'plain',cb:null}
    ]});
}
function renderSet(){
  $('set-name').value=S.name;
  const pe=$('pet-ed'),pi=$('pet-issabella');
  if(pe&&pi){ pe.classList.toggle('on',(S.pet||'ed')==='ed'); pi.classList.toggle('on',S.pet==='issabella'); pe.textContent='Ed'; }
  renderSetColors();
  $('set-habits').innerHTML=S.habits.map(h=>`
    <div class="row"><span class="lead" style="background:var(--fill)">${h.em||'✦'}</span><span class="lbl">${esc(h.t)}${h.est?`<span class="sub">⏱️ ${h.est} min estimados</span>`:''}</span>
    <button class="icon-btn" onclick="delHabit('${h.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg></button></div>`).join('')||'<div class="empty" style="background:var(--card)">Sin hábitos.</div>';
  $('set-acts').innerHTML=S.acts.map(a=>`
    <div class="row"><span class="lead" style="background:color-mix(in srgb,${a.c} 18%,transparent)">${a.em}</span>
    <span class="lbl">${esc(a.t)}</span>
    <button class="btn tint small" onclick="editGoal('${a.id}')">${(a.goal/60).toFixed(1).replace('.0','')} h</button>
    <button class="icon-btn" onclick="delAct('${a.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg></button></div>`).join('')||'<div class="empty" style="background:var(--card)">Sin actividades.</div>';
  const cu=$('set-currency'); if(cu)cu.value=curSym();
  renderEmojiRows();
  renderRems();updNotifStatus();
}
/* biblioteca de emojis sugeridos: cada hábito/actividad con identidad propia */
const EMOJI_LIB=['💼','🎬','✂️','🎨','📚','💪','🏃','🧘','🍳','🌱','📈','🎵','🎮','📝','🧹','💤','💧','🌅','📵','🙏','🥗','💰','❤️','📷','🚀','🧠'];
function renderEmojiRows(){
  const mk=(target)=>EMOJI_LIB.map(e=>`<button onclick="document.getElementById('${target}').value='${e}';haptic(6)">${e}</button>`).join('');
  const h=$('emoji-row-habit'); if(h)h.innerHTML=mk('new-habit-em');
  const a=$('emoji-row-act'); if(a)a.innerHTML=mk('new-act-em');
}
function renderRems(){
  $('rem-list').innerHTML=S.reminders.map(r=>`
    <div class="row"><div class="lbl">${r.time}<span class="sub">${esc(r.label)}</span></div>
    <div class="switch ${r.on?'on':''}" onclick="toggleRem('${r.id}')"></div>
    <button class="icon-btn" onclick="delRem('${r.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg></button></div>`).join('')||'<div class="empty" style="background:var(--card)">Sin recordatorios.</div>';
}
let newRemTime='08:00';
function pickRemTime(){ openTimePicker(newRemTime, v=>{ newRemTime=v; $('rem-time-txt').textContent=v; }); }
function addRem(){
  const time=newRemTime,label=$('rem-label').value.trim();
  if(!time){toast('Elige una hora');return;}
  S.reminders.push({id:'r'+Date.now(),time,label:label||'Recordatorio de FARO',on:true});
  $('rem-label').value='';haptic();save();renderRems();
}
function toggleRem(id){const r=S.reminders.find(x=>x.id===id);if(r){r.on=!r.on;save();renderRems();}}
function delRem(id){S.reminders=S.reminders.filter(r=>r.id!==id);save();renderRems();}
function updNotifStatus(){
  const el=$('notif-status');
  if(!('Notification' in window)){el.textContent='No disponibles en este navegador';return;}
  el.textContent=Notification.permission==='granted'?'✓ Activadas':
    Notification.permission==='denied'?'Bloqueadas — revisa ajustes del navegador':'Actívalas para recibir alertas';
}
async function askNotif(){
  if(!('Notification' in window)){toast('Navegador sin soporte');return;}
  const p=await Notification.requestPermission();updNotifStatus();
  if(p==='granted')notify('FARO 🦝','Ed te avisará por aquí. ¡Notificaciones activas!');
}
let swReg=null;
function notify(title,body){
  try{
    if(Notification.permission!=='granted')return;
    if(swReg&&swReg.showNotification)swReg.showNotification(title,{body,icon:'icon-192.png',badge:'icon-192.png'});
    else new Notification(title,{body});
  }catch(e){}
}
function tickReminders(){
  if(!S)return;
  const now=new Date();
  const hm=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  const k=today();
  if(!S.remFired[k]){S.remFired={};S.remFired[k]=[];}
  S.reminders.forEach(r=>{
    if(r.on&&r.time===hm&&!S.remFired[k].includes(r.id)){
      S.remFired[k].push(r.id);save();
      notify('FARO 🦝',r.label);toast('🔔 '+r.label);
    }
  });
  // recordatorio propio de cada meta (solo si no está completa)
  S.goals.forEach(g=>{
    const fid='g-'+g.id;
    if(g.remOn && (g.remTime||'19:00')===hm && goalPct(g)<100 && !S.remFired[k].includes(fid)){
      S.remFired[k].push(fid);save();
      notify('🎯 Avanza en tu meta',(g.em||'🎯')+' '+g.t+' — un pasito hoy cuenta.');
      toast('🎯 '+g.t);
    }
  });
}
setInterval(tickReminders,20000);

/* ---------------- DATOS ---------------- */
function exportData(){
  const blob=new Blob([JSON.stringify(S,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download='faro-respaldo-'+today()+'.json';a.click();
  toast('💾 Respaldo descargado');
}
function importData(inp){
  const f=inp.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=()=>{try{
    const d=JSON.parse(r.result);
    if(!d.habits||!d.acts)throw 0;
    S=Object.assign(defaultState(),d);
    if(!S.pet)S.pet='ed'; if(!S.accent)S.accent='blue';
    syncProfile();save();applyAccent();renderAll();toast('✓ Respaldo importado');
  }catch(e){toast('Archivo no válido');}};
  r.readAsText(f);inp.value='';
}
function wipeAll(){
  showDlg({ico:'⚠️',title:'¿Borrar todo este perfil?',msg:'Hábitos, tareas, metas, diario, gastos… '+petName()+' vuelve a empezar. No se puede deshacer.',acts:[
    {label:'Sí, borrar todo',style:'danger',cb:()=>{
      const keepName=S.name, keepPet=S.pet, keepAccent=S.accent;
      S=defaultState(); S.name=keepName; S.pet=keepPet; S.accent=keepAccent;
      save();renderAll();applyAccent();haptic([80,60,80]);toast('Nuevo comienzo. '+petName()+' te espera. 🦝');
    }},
    {label:'Cancelar',style:'plain',cb:null}
  ]});
}

/* ---------------- LOGO ---------------- */
function renderLogo(){
  $('logo').innerHTML=`
  <g fill="var(--accent)">
    <path d="M20 16 L30 24 L18 27 Z"/>
    <path d="M44 16 L34 24 L46 27 Z"/>
    <path d="M32 20 C20 20 13 27 13 36 C13 46 21 51 32 51 C43 51 51 46 51 36 C51 27 44 20 32 20 Z"/>
  </g>
  <path d="M21 33 C24 30 28 30 30 33 C28 39 23 39 21 37 Z" fill="var(--card)"/>
  <path d="M43 33 C40 30 36 30 34 33 C36 39 41 39 43 37 Z" fill="var(--card)"/>
  <circle cx="25.5" cy="34" r="2.4" fill="var(--accent)"/>
  <circle cx="38.5" cy="34" r="2.4" fill="var(--accent)"/>
  <circle cx="32" cy="42" r="2.8" fill="var(--card)"/>`;
}

/* ================= METAS ================= */
let curGoal=null;
function goalPct(g){
  if(!g.steps.length) return g.done?100:0;
  return Math.round(g.steps.filter(s=>s.done).length/g.steps.length*100);
}
function daysLeft(due){
  if(!due) return null;
  const d=new Date(due+'T23:59:59'), now=new Date();
  return Math.ceil((d-now)/864e5);
}
const GOAL_COLORS=['#3B76F6','#F0A93C','#F4735E','#2FB980','#9B85F8','#F49A55','#3EC0D4','#EE7FB2'];
function renderGoals(){
  const list=[...S.goals].sort((a,b)=>goalPct(a)-goalPct(b));
  $('goals-empty').style.display='none';
  if(!S.goals.length){ $('goals-list').innerHTML=emptyHtml('🌟','Un sueño con pasos es una meta','Crea tu primera meta y divídela en pasos pequeños. '+petName()+' te acompaña.','Crear mi primera meta','openGoal(null)'); return; }
  $('goals-list').innerHTML=list.map((g,idx)=>{
    const pct=goalPct(g);
    const c=GOAL_COLORS[idx%GOAL_COLORS.length];
    const dl=daysLeft(g.due);
    let dueTxt='';
    if(dl!==null){
      dueTxt = dl<0?`Venció hace ${-dl} d`:dl===0?'Vence hoy':dl===1?'Falta 1 día':`Faltan ${dl} días`;
    }
    const stepsN=g.steps.length;
    const doneN=g.steps.filter(s=>s.done).length;
    return `<div class="goal-card ${pct===100?'done-goal':''}" onclick="openGoal('${g.id}')">
      <div class="g-top">
        <span class="g-ico" style="background:color-mix(in srgb,${c} 18%,transparent)">${g.em||'🎯'}</span>
        <span class="g-name">${esc(g.t)}</span>
        <span class="g-pct" style="color:${pct===100?'var(--green)':c}">${pct}%</span>
      </div>
      <div class="g-bar"><div class="g-fill" style="width:${pct}%; background:${pct===100?'var(--green)':c}"></div></div>
      <div class="g-meta"><span>${stepsN?doneN+' de '+stepsN+' pasos':'Sin pasos aún'}</span><span class="g-due ${dl!==null&&dl<=3?'urgent':''}">${dueTxt}</span></div>
    </div>`;
  }).join('');
}
function openGoal(id){
  if(id) curGoal=S.goals.find(g=>g.id===id);
  else{ curGoal={id:'g'+Date.now(),em:'🎯',t:'',why:'',steps:[],due:'',created:today()}; S.goals.push(curGoal); }
  $('goal-em').value=curGoal.em;
  $('goal-name').value=curGoal.t;
  $('goal-why').value=curGoal.why;
  updateGoalDueBtn();
  $('goal-rem-sw').classList.toggle('on',!!curGoal.remOn);
  $('goal-rem-time-txt').textContent=curGoal.remTime||'19:00';
  renderSteps();
  openSheet('goal-ov',()=>{
    if(curGoal){
      saveGoalLive();
      if(!curGoal.t && !curGoal.steps.length) S.goals=S.goals.filter(g=>g.id!==curGoal.id);
      curGoal=null;
    }
    save();renderGoals();checkBadges();
  });
  if(!id) setTimeout(()=>$('goal-name').focus(),150);
}
function goalRemToggle(){
  if(!curGoal)return;
  curGoal.remOn=!curGoal.remOn;
  if(curGoal.remOn && !curGoal.remTime){ curGoal.remTime='19:00'; $('goal-rem-time-txt').textContent='19:00'; }
  $('goal-rem-sw').classList.toggle('on',curGoal.remOn);
  haptic(10);
  saveGoalLive();
  toast(curGoal.remOn?'🔔 Recordatorio de meta activado':'Recordatorio desactivado');
}
/* puentes entre los botones custom y los pickers */
function updateGoalDueBtn(){
  const b=$('goal-due-btn'), t=$('goal-due-txt');
  if(curGoal&&curGoal.due){ t.textContent=fmtDueShort(curGoal.due); b.classList.remove('empty'); }
  else{ t.textContent='Elegir fecha'; b.classList.add('empty'); }
}
function pickGoalDue(){ openDatePicker(curGoal.due||'', v=>{ curGoal.due=v; updateGoalDueBtn(); saveGoalLive(); renderGoals(); }); }
function pickGoalRemTime(){ openTimePicker(curGoal.remTime||'19:00', v=>{ curGoal.remTime=v; $('goal-rem-time-txt').textContent=v; if(curGoal.remOn)saveGoalLive(); }); }
function goalRemTime(v){ if(curGoal){ curGoal.remTime=v; saveGoalLive(); } }
function renderSteps(){
  const pct=goalPct(curGoal);
  $('goal-prog-lbl').textContent = curGoal.steps.length ? pct+'% · '+curGoal.steps.filter(s=>s.done).length+'/'+curGoal.steps.length : '';
  $('goal-steps').innerHTML=curGoal.steps.map((s,i)=>`
    <div class="step ${s.done?'done':''}">
      <div class="cbx" onclick="toggleStep(${i})"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></div>
      <span class="step-txt" onclick="toggleStep(${i})">${esc(s.t)}</span>
      ${s.done?'':`<button class="icon-btn" onclick="stepToToday(${i})" title="Enviar a las tareas de hoy" aria-label="Enviar a hoy" style="font-size:14px">☀️</button>`}
      <span class="del-step" onclick="delStep(${i})"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--dim)" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></span>
    </div>`).join('')||'<div class="q-sub" style="padding:8px 0">Añade pasos para dividir tu meta.</div>';
}
function addStep(){
  const inp=$('new-step'),t=inp.value.trim();if(!t)return;
  curGoal.steps.push({t,done:false});
  inp.value='';saveGoalLive();renderSteps();
}
function toggleStep(i){
  const was=goalPct(curGoal)===100;
  curGoal.steps[i].done=!curGoal.steps[i].done;
  curGoal.done=goalPct(curGoal)===100;
  saveGoalLive();renderSteps();
  if(!was && curGoal.done){toast('🎉 ¡Meta completada! '+petName()+' está '+(petFem()?'orgullosa':'orgulloso')+'.');beep2();}
}
function delStep(i){
  curGoal.steps.splice(i,1);
  // reajustar tareas vinculadas a pasos de esta meta
  S.tasks.forEach(t=>{
    if(t.goalRef&&t.goalRef.g===curGoal.id){
      if(t.goalRef.i===i)delete t.goalRef;
      else if(t.goalRef.i>i)t.goalRef.i--;
    }
  });
  saveGoalLive();renderSteps();
}
function stepToToday(i){
  const s=curGoal.steps[i];if(!s||s.done)return;
  const dup=S.tasks.find(t=>t.goalRef&&t.goalRef.g===curGoal.id&&t.goalRef.i===i&&!t.done&&t.date===today());
  if(dup){toast('Ese paso ya está en tus tareas de hoy');return;}
  saveGoalLive();
  S.tasks.push({id:'t'+Date.now(),t:s.t,date:today(),p:'media',prog:0,done:false,nag:false,goalRef:{g:curGoal.id,i:i}});
  save();renderHoy();
  toast('☀️ Paso añadido a las tareas de hoy');
}
function saveGoalLive(){
  curGoal.em=$('goal-em').value.trim()||'🎯';
  curGoal.t=$('goal-name').value.trim();
  curGoal.why=$('goal-why').value;
  // due y remTime se fijan desde los pickers (no hay inputs nativos)
  save();
}
function closeGoal(){ closeSheet('goal-ov'); }
function delGoal(){
  const g=curGoal;
  showDlg({ico:'🗑️',title:'¿Eliminar esta meta?',msg:'Se borrará con todos sus pasos. No se puede deshacer.',acts:[
    {label:'Sí, eliminar',style:'danger',cb:()=>{
      S.goals=S.goals.filter(x=>x.id!==g.id);
      S.tasks.forEach(t=>{if(t.goalRef&&t.goalRef.g===g.id)delete t.goalRef;});
      curGoal=null; save(); closeSheet('goal-ov'); haptic([60,40,60]); toast('Meta eliminada');
    }},
    {label:'Cancelar',style:'plain',cb:null}
  ]});
}
['goal-em','goal-name','goal-why'].forEach(id=>{
  document.addEventListener('input',e=>{ if(e.target.id===id && curGoal) saveGoalLive(); });
});

/* ================= POMODORO ================= */
let pomoTick=null;
function pomoActColor(){const a=S.acts.find(x=>x.id===S.pomo.actId);return a?a.c:'var(--accent)';}
function renderPomo(){
  // tarea enfocada (chip bajo el anillo)
  let ft=S.focusTask?S.tasks.find(t=>t.id===S.focusTask&&!t.done):null;
  if(S.focusTask&&!ft){S.focusTask=null;save();}
  const pt=$('pomo-task');
  if(ft){pt.classList.add('on');pt.innerHTML='🍅 '+esc(ft.t)+'<button class="pt-x" onclick="clearFocusTask()" aria-label="Quitar tarea">✕</button>';}
  else{pt.classList.remove('on');pt.innerHTML='';}
  // selector de actividad
  $('pomo-act-sel').innerHTML='<span>Enfocando en:</span>'+S.acts.map(a=>
    `<button class="pomo-chip ${S.pomo.actId===a.id?'on':''}" onclick="setPomoAct('${a.id}')">${a.em} ${esc(a.t)}</button>`
  ).join('');
  // segmented de duraciones
  $('seg-work').innerHTML=[15,25,45,60].map(m=>`<button class="${S.pomo.work===m?'on':''}" onclick="setPomo('work',${m})">${m}</button>`).join('');
  $('seg-break').innerHTML=[5,10,15].map(m=>`<button class="${S.pomo.break===m?'on':''}" onclick="setPomo('break',${m})">${m}</button>`).join('');
  $('pomo-cycles').value=S.pomo.cycles;
  $('pomo-sound-sw').classList.toggle('on',S.pomo.sound);
  // stat de hoy
  const done=S.pomoLog[today()]||0;
  $('pomo-stat').textContent=done?`✓ ${done} pomodoro${done>1?'s':''} completado${done>1?'s':''} hoy`:'Aún sin sesiones hoy';
  updPomoUI();
}
function setPomoAct(id){S.pomo.actId=id;save();renderPomo();}
function setPomo(key,v){S.pomo[key]=parseInt(v);save();renderPomo();if(!S.pomoState)pomoDisplayIdle();}
function togglePomoSound(){S.pomo.sound=!S.pomo.sound;save();renderPomo();}
function pomoDisplayIdle(){
  $('pomo-time').textContent=String(S.pomo.work).padStart(2,'0')+':00';
  $('pomo-phase').textContent='Listo';$('pomo-phase').style.color='var(--accent)';
  $('pomo-round').textContent='';
  $('pring').style.strokeDashoffset=0;
  $('pring').style.stroke=pomoActColor();
  $('pomo-main').textContent='Empezar';
}
function pomoMain(){
  if(!S.pomoState){ startPomo('work',1); }
  else if(S.pomoState.paused){ // reanudar
    S.pomoState.endsAt=Date.now()+S.pomoState.remain;
    S.pomoState.paused=false;save();updPomoUI();
  }else{ // pausar
    S.pomoState.remain=S.pomoState.endsAt-Date.now();
    S.pomoState.paused=true;save();updPomoUI();
  }
}
function startPomo(phase,round,customMins){
  const mins = customMins || (phase==='work'?S.pomo.work : phase==='long'?S.pomo.longBreak : S.pomo.break);
  S.pomoState={phase,round,mins,endsAt:Date.now()+mins*60000,paused:false,remain:mins*60000,actId:S.pomo.actId};
  save();updPomoUI();
}
function pomoReset(){
  S.pomoState=null;save();pomoDisplayIdle();
  if(pomoTick){clearInterval(pomoTick);pomoTick=null;}
}
function updPomoUI(){
  const ps=S.pomoState;
  if(!ps){pomoDisplayIdle();return;}
  const total=(ps.mins?ps.mins:(ps.phase==='work'?S.pomo.work:ps.phase==='long'?S.pomo.longBreak:S.pomo.break))*60000;
  const remain=ps.paused?ps.remain:Math.max(0,ps.endsAt-Date.now());
  const mm=Math.floor(remain/60000), ss=Math.floor(remain%60000/1000);
  $('pomo-time').textContent=String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0');
  const isWork=ps.phase==='work';
  const col=isWork?pomoActColor():'var(--green)';
  $('pomo-phase').textContent=ps.paused?'En pausa':isWork?'Enfoque':ps.phase==='long'?'Descanso largo':'Descanso';
  $('pomo-phase').style.color=col;
  $('pomo-round').textContent=isWork?`Sesión ${ps.round} de ${S.pomo.cycles}`:'Respira y estira';
  const C=653.5, frac=remain/total;
  $('pring').style.strokeDashoffset=C*(1-frac);
  $('pring').style.stroke=col;
  $('pomo-main').textContent=ps.paused?'Reanudar':'Pausar';
  if(!pomoTick){ pomoTick=setInterval(pomoLoop,250); }
}
function pomoLoop(){
  const ps=S.pomoState;
  if(!ps||ps.paused)return;
  const remain=ps.endsAt-Date.now();
  if(remain<=0){ pomoPhaseEnd(); return; }
  // actualizar solo si estamos en la pestaña
  if($('v-tiempo').classList.contains('on')) updPomoUI();
}
function pomoPhaseEnd(){
  const ps=S.pomoState;
  if(ps.phase==='work'){
    // registrar tiempo trabajado + contar pomodoro
    const k=today();
    if(!S.actLog[k])S.actLog[k]={};
    S.actLog[k][ps.actId]=(S.actLog[k][ps.actId]||0)+(ps.mins||S.pomo.work)*60;
    S.pomoLog[k]=(S.pomoLog[k]||0)+1;
    // sesión terminada con tarea enfocada → preguntar si la completó
    const ft=S.focusTask?S.tasks.find(t=>t.id===S.focusTask&&!t.done):null;
    beep2();
    notify('¡Sesión completa! 🎉',ft?('Buen trabajo con «'+ft.t+'».'):'Buen trabajo. Tómate un descanso.');
    if(ft)setTimeout(()=>showDlg({ico:'🍅',title:'¡Sesión completa!',msg:'¿Terminaste «'+ft.t+'»?',acts:[
      {label:'Sí, completada 🎉',style:'primary',cb:()=>{setProg(ft.id,100);renderHoy();}},
      {label:'Todavía no',style:'plain',cb:null}
    ]}),400);
    if('vibrate' in navigator)navigator.vibrate([200,100,200]);
    // ¿descanso largo?
    const nextRound=ps.round+1;
    if(ps.round>=S.pomo.cycles){ startPomo('long',1); toast('Ciclo completo. Descanso largo 🌿'); }
    else{ startPomo('break',ps.round); toast('Descanso corto ☕'); }
  }else{
    beep2();
    notify('Descanso terminado','A por la siguiente sesión de enfoque.');
    if('vibrate' in navigator)navigator.vibrate(200);
    const nextRound = ps.phase==='long'?1:ps.round+1;
    startPomo('work',nextRound);
    toast('¡A enfocar! 🎯');
  }
  save();renderPomo();renderStats();checkBadges();
}

/* ================= SUGERENCIAS ================= */
const SUG_TASKS=[
  ['💧','Tomar un vaso grande de agua','Hidratación = energía y foco','baja'],
  ['🚶','Caminar 10 min sin celular','Resetea tu mente y creatividad','baja'],
  ['📵','30 min sin redes sociales','Recupera tu atención','media'],
  ['🧘','Respirar profundo 2 minutos','Baja el estrés al instante','baja'],
  ['💌','Mensaje bonito a tu pareja','Nutre el vínculo que te importa','baja'],
  ['🧺','Ordenar una superficie','Orden externo, calma interna','baja'],
  ['📖','Leer 10 páginas','Pequeño hábito, gran compuesto','media'],
  ['🎯','Definir la tarea #1 de mañana','Duerme con rumbo claro','media'],
  ['🤸','Estirar el cuerpo 5 minutos','Tu espalda lo agradecerá','baja'],
  ['✉️','Responder ese correo pendiente','Quita el peso mental','alta'],
  ['🧠','25 min de trabajo profundo','Un pomodoro sin distracciones','alta'],
  ['💰','Revisar tus gastos del día','Conciencia financiera','media'],
  ['☀️','Salir a tomar sol 10 min','Vitamina D y mejor ánimo','baja'],
  ['🛏️','Hacer la cama con calma','Primera victoria del día','baja'],
  ['📴','Modo avión mientras trabajas','Foco sin interrupciones','media'],
  ['🍎','Preparar una comida sana','Tu cuerpo es tu herramienta','media'],
  ['📞','Llamar a alguien que quieres','Los vínculos te sostienen','baja'],
  ['🧹','10 min de orden exprés','Espacio limpio, mente clara','baja'],
  ['✍️','Escribir 3 cosas por hacer','Vacía la mente al papel','baja'],
  ['🎧','Escuchar un podcast que enseñe','Aprende mientras te mueves','baja'],
  ['💤','Acostarte 30 min antes','El sueño lo cura casi todo','media'],
  ['🚿','Ducha fría de 30 segundos','Despierta cuerpo y voluntad','baja'],
  ['📷','Tomar una foto de tu progreso','El yo del futuro lo agradecerá','baja'],
  ['🙅','Decir "no" a algo que no suma','Proteger tu tiempo es avanzar','media'],
  ['💸','Anotar cada gasto de hoy','Conciencia = control','media'],
  ['🎨','15 min de tu proyecto creativo','Tu talento pide práctica','media'],
  ['🤝','Avanzar 1 pendiente del trabajo','Lo difícil primero','alta'],
  ['🌳','Caminata larga al aire libre','Naturaleza que recarga','baja'],
  ['📝','Planear tu semana 10 min','Rumbo claro, menos estrés','media'],
  ['🧴','Cuidar tu piel / rutina personal','Autocuidado también es disciplina','baja'],
  ['💬','Agradecer a alguien por texto','Sembrar buena energía','baja'],
  ['🔕','Silenciar notificaciones 1 hora','Tu atención es oro','media'],
];
const SUG_GOALS=[
  ['🎬','Editar y publicar un video',['Escribir el guion','Grabar el material','Editar en el programa','Diseñar la miniatura','Publicar y compartir']],
  ['🚀','Lanzar mi marca personal',['Definir mi nicho y propuesta','Crear logo e identidad','Abrir redes sociales','Publicar mis primeros 5 posts','Conseguir mis primeros seguidores']],
  ['💪','Ponerme en forma (12 semanas)',['Definir rutina de ejercicios','Armar plan de comidas','Entrenar 3x por semana','Medir progreso cada mes','Alcanzar mi peso meta']],
  ['📚','Leer 12 libros este año',['Elegir los 12 títulos','Leer 20 páginas al día','Tomar notas de cada libro','Reseñar al terminar cada uno']],
  ['🌐','Crear mi portafolio web',['Definir qué mostrar','Elegir plantilla o diseño','Escribir los textos','Subirlo a internet','Compartirlo con el mundo']],
  ['💵','Ahorrar mi primer fondo',['Definir monto meta','Calcular ahorro mensual','Abrir cuenta separada','Automatizar el ahorro','Revisar progreso mensual']],
  ['🎓','Aprender una habilidad nueva',['Elegir qué aprender','Buscar un buen curso','Practicar 30 min al día','Hacer un mini proyecto','Enseñárselo a alguien']],
  ['🧠','Mejorar mi enfoque y disciplina',['Definir mis 3 prioridades','Rutina de mañana fija','Bloques de trabajo profundo','Revisar mi semana los domingos']],
  ['✈️','Planear un viaje soñado',['Elegir el destino','Definir presupuesto','Ahorrar cada mes','Reservar vuelo y estadía','Armar el itinerario']],
  ['🍳','Aprender a cocinar mejor',['Elegir 5 recetas base','Comprar lo necesario','Cocinar 2 veces por semana','Dominar un platillo favorito']],
  ['💤','Arreglar mi sueño',['Hora fija para dormir','Sin pantallas antes de dormir','Cuarto oscuro y fresco','Despertar sin snooze 7 días']],
  ['🎥','Crecer mi canal / redes',['Definir mi temática','Calendario de contenido','Publicar 3x por semana','Analizar qué funciona','Llegar a mi primera meta']],
];
const SUG_HABITS=[
  ['🌅','Despertar a la misma hora'],['💧','Beber agua al levantarme'],['📵','No tocar el celular la 1ª hora'],
  ['🧘','Meditar 5 minutos'],['📔','Escribir una línea de diario'],['🚶','Caminar después de comer'],
  ['📚','Leer antes de dormir'],['🙏','Anotar algo que agradezco'],['🥗','Comer una fruta o verdura'],
  ['💤','Apagar pantallas 30 min antes de dormir'],['🛏️','Tender la cama'],['🦷','Cuidar mi higiene'],
  ['🏃','Moverme 20 minutos'],['☀️','Tomar sol un rato'],['💊','Tomar mis vitaminas'],
  ['📝','Planear el día en la mañana'],['🚭','Evitar un mal hábito hoy'],['🧴','Rutina de autocuidado'],
  ['💰','Anotar mis gastos'],['🎯','Revisar mi meta principal'],['📴','1 hora sin distracciones'],
  ['💬','Un gesto amable con alguien'],['🧹','5 min de orden'],['🌬️','3 respiraciones profundas'],
];
/* rotación diaria: cada día muestra un set fresco (como la frase del día) */
function dayOffset(len){ if(!len)return 0; const seed=today().split('-').reduce((a,b)=>a+parseInt(b),0); return seed%len; }
function dayRotate(arr,n){ const len=arr.length; if(len<=n)return arr.slice(); const off=dayOffset(len),out=[]; for(let i=0;i<n;i++)out.push(arr[(off+i)%len]); return out; }
function dayRotateIdx(len,n){ if(len<=n)return [...Array(len).keys()]; const off=dayOffset(len),out=[]; for(let i=0;i<n;i++)out.push((off+i)%len); return out; }
let sugCurrentTab='tareas';
function sugTab(t){
  sugCurrentTab=t;
  document.querySelectorAll('#sug-tabs button').forEach((b,i)=>b.classList.toggle('on',['tareas','metas','habitos'][i]===t));
  renderSug();
}
function renderSug(){
  const c=$('sug-content');
  const fresh='<div class="grp-f" style="padding-top:12px">✨ Se renuevan cada día. Vuelve mañana por ideas nuevas.</div>';
  if(sugCurrentTab==='tareas'){
    const list=dayRotate(SUG_TASKS,8);
    c.innerHTML='<div class="sug-scroll">'+list.map(s=>`
      <div class="sug-card"><div class="s-em">${s[0]}</div><div class="s-t">${s[1]}</div><div class="s-why">${s[2]}</div>
      <button class="btn tint s-add" onclick="addTaskFromSug('${s[0]}','${s[1].replace(/'/g,"\\'")}','${s[3]}')">+ Añadir a hoy</button></div>`).join('')+'</div>'+fresh;
  }else if(sugCurrentTab==='metas'){
    const idx=dayRotateIdx(SUG_GOALS.length,6);
    c.innerHTML=idx.map((i,pos)=>{const g=SUG_GOALS[i];return `
      <div class="goal-card" style="cursor:default">
        <div class="g-top"><span class="g-ico" style="background:color-mix(in srgb,${GOAL_COLORS[pos%GOAL_COLORS.length]} 18%,transparent)">${g[0]}</span>
        <span class="g-name">${g[1]}</span></div>
        <div class="g-meta" style="margin-top:8px"><span>${g[2].length} pasos incluidos</span></div>
        <button class="btn tint wide" style="margin-top:12px" onclick="addGoalFromSug(${i})">+ Añadir esta meta</button>
      </div>`;}).join('')+fresh;
  }else{
    const list=dayRotate(SUG_HABITS,10);
    c.innerHTML='<div class="list" style="margin-top:0">'+list.map((h,i)=>`
      <div class="row ${i<list.length-1?'inset-sep':''}"><span class="lead" style="background:var(--fill)">${h[0]}</span>
      <span class="lbl">${h[1]}</span>
      <button class="btn tint small" onclick="addHabitFromSug('${h[0]}','${h[1].replace(/'/g,"\\'")}')">Añadir</button></div>`).join('')+'</div>'+fresh;
  }
}
function addGoalFromSug(i){
  const g=SUG_GOALS[i];
  S.goals.push({id:'g'+Date.now(),em:g[0],t:g[1],why:'',steps:g[2].map(t=>({t,done:false})),due:'',created:today()});
  save();renderGoals();toast('🎯 Meta añadida');go('metas');
}
function addHabitFromSug(em,t){
  S.habits.push({id:'h'+Date.now(),em,t});
  save();renderHoy();renderSet();toast('✓ Hábito añadido');
}

/* ================= LOGROS, CONFETTI Y REACCIONES ================= */
function totalPomos(){return Object.values(S.pomoLog).reduce((a,b)=>a+b,0);}
const BADGES=[
  {id:'b_tarea1', em:'✅', t:'Primera tarea',   d:'Completa tu primera tarea',        f:()=>S.tasks.some(t=>t.done)},
  {id:'b_dia100', em:'🌟', t:'Día perfecto',    d:'Completa un día al 100%',          f:()=>Object.keys(S.celebrated||{}).length>0},
  {id:'b_racha3', em:'🔥', t:'Racha de 3',      d:'3 días seguidos activos',          f:()=>streak()>=3},
  {id:'b_racha7', em:'⚡', t:'Racha de 7',      d:'Una semana entera sin fallar',     f:()=>streak()>=7},
  {id:'b_racha30',em:'👑', t:'Racha de 30',     d:'Un mes de pura constancia',        f:()=>streak()>=30},
  {id:'b_pomo1',  em:'🍅', t:'Primer pomodoro', d:'Completa una sesión de enfoque',   f:()=>totalPomos()>=1},
  {id:'b_pomo50', em:'🧠', t:'50 pomodoros',    d:'Enfoque de acero',                 f:()=>totalPomos()>=50},
  {id:'b_meta1',  em:'🎯', t:'Primera meta',    d:'Completa una meta con sus pasos',  f:()=>S.goals.some(g=>g.steps.length&&goalPct(g)===100)},
  {id:'b_intent7',em:'☀️', t:'7 intenciones',   d:'Define tu día 7 veces',            f:()=>Object.keys(S.checkins).length>=7},
  {id:'b_notas5', em:'✍️', t:'Escritor',        d:'Escribe 5 notas en tu diario',     f:()=>S.notes.length>=5},
  {id:'b_foto1',  em:'🖼️', t:'Primer registro', d:'Añade una imagen a una nota',      f:()=>S.notes.some(n=>n.body&&n.body.indexOf('<img')>=0)},
  {id:'b_focus4h',em:'🏃', t:'Maratón',         d:'4 horas enfocadas en un día',      f:()=>Object.values(S.actLog).some(day=>Object.values(day).reduce((a,b)=>a+b,0)>=14400)},
];
function checkBadges(){
  if(!S)return;
  if(!S.badges)S.badges={};
  const nuevos=[];
  BADGES.forEach(b=>{
    if(!S.badges[b.id]){
      let ok=false; try{ok=b.f();}catch(e){}
      if(ok){S.badges[b.id]=today(); nuevos.push(b);}
    }
  });
  if(nuevos.length){
    save();
    toast('🏅 Logro desbloqueado: '+nuevos[0].t);
    beep2();edReact();
  }
}
function confetti(){
  try{
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const c=document.createElement('div');c.className='confetti';
    const colors=['#2D68F8','#6D5BF0','#F0A93C','#2FB980','#EC6BA0','#3EC0D4'];
    for(let i=0;i<60;i++){
      const p=document.createElement('i');
      p.style.left=(Math.random()*100)+'vw';
      p.style.background=colors[i%colors.length];
      p.style.animationDelay=(Math.random()*0.4)+'s';
      p.style.animationDuration=(1.6+Math.random()*1.4)+'s';
      c.appendChild(p);
    }
    document.body.appendChild(c);
    setTimeout(()=>c.remove(),3400);
  }catch(e){}
}
let edReactT=null, edPartyT=null;
function edReact(kind){
  const el=$('ed-stage');if(!el)return;
  el.classList.remove('pop');void el.offsetWidth;el.classList.add('pop');
  clearTimeout(edReactT);edReactT=setTimeout(()=>el.classList.remove('pop'),700);
  if(kind==='party'){                       // pose de celebración unos segundos
    el.innerHTML=petSVG(140,'party',edStage(),edAccessory(),(S&&S.pet)||'ed');
    clearTimeout(edPartyT);edPartyT=setTimeout(()=>renderEd(),4000);
  }
}

/* ================= MODO BESTIA + NOTIFICACIONES ================= */
function toggleBeast(){S.beastOn=!S.beastOn;save();$('beast-sw').classList.toggle('on',S.beastOn);toast(S.beastOn?'🔥 Modo bestia activado':'Modo bestia desactivado');}
function setBeastEvery(v){S.beastEvery=parseInt(v);save();}
function testBeast(){
  if(Notification.permission!=='granted'){ toast('Primero activa el permiso de notificaciones'); return; }
  notify('🔥 ¡A trabajar!','Esta es una notificación bestia. Así te insistiré con tus tareas.');
  if('vibrate' in navigator)navigator.vibrate([300,150,300,150,300]);
  toast('Enviada — mira tu barra de notificaciones');
}
function beastTick(){
  if(!S||!S.beastOn)return;
  if(Notification.permission!=='granted')return;
  const now=Date.now();
  S.tasks.forEach(t=>{
    if(t.nag && !t.done && t.date<=today()){
      if(!t.notifyAt) t.notifyAt=now+S.beastEvery*60000;
      if(now>=t.notifyAt){
        notify('🔥 Tarea pendiente','«'+t.t.replace(/^[^\w]+/,'')+'» sigue sin terminar. ¡Hazla ahora!');
        if('vibrate' in navigator)navigator.vibrate([300,150,300]);
        t.notifyAt=now+S.beastEvery*60000;
        save();
      }
    }
  });
}
setInterval(beastTick,30000);

function alarmHelp(){
  showDlg({ico:'⏰',title:'Alarmas de respaldo',
    msg:'Los recordatorios de FARO suenan mientras la app está abierta o reciente en segundo plano — una app web no puede despertar el teléfono si la cierras del todo (eso requiere un servidor). Para avisos 100% garantizados: crea alarmas en la app Reloj de tu celular con el nombre "Abrir FARO" en tus horas clave. Ese ritual es lo que más fortalece el hábito.',
    acts:[{label:'Entendido',style:'primary',cb:null}]});
}

/* sonido de campana (pomodoro/logros) */
let actx=null;
function beep2(){
  try{
    actx=actx||new (window.AudioContext||window.webkitAudioContext)();
    [880,1175,1568].forEach((f,i)=>{
      const o=actx.createOscillator(),g=actx.createGain();
      o.type='sine';o.frequency.value=f;
      const t=actx.currentTime+i*0.12;
      g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.12,t+.02);g.gain.exponentialRampToValueAtTime(.0001,t+.3);
      o.connect(g);g.connect(actx.destination);o.start(t);o.stop(t+.3);
    });
  }catch(e){}
}

/* navegación programática */
const PRIMARY_NAV=['hoy','trabajo','tiempo','gastos'];
let VIEW='hoy', viewDepth=0;
function goRender(v){
  VIEW=v;
  document.querySelectorAll('.nv').forEach(x=>x.classList.remove('on'));
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('on'));
  const btn=document.querySelector(PRIMARY_NAV.includes(v)?`.nv[data-v="${v}"]`:`.nv[data-v="more"]`);
  if(btn)btn.classList.add('on');
  const view=$('v-'+v); if(view)view.classList.add('on');
  if(v==='tiempo')renderTiempo();
  if(v==='metas')renderGoals();
  if(v==='trabajo')renderTrabajo();
  if(v==='gastos'){renderGastos();fetchFx();}
  if(v==='sugerencias')renderSug();
  if(v==='stats'){renderStats();renderCal();renderSel();}
  if(v==='diario'){renderCIHist();renderNotes();}
  if(v==='set')renderSet();
  window.scrollTo({top:0});
}
function go(v){
  haptic(6);
  while(SHEETS.length)hideSheet(SHEETS[SHEETS.length-1].id);   // cerrar sheets abiertos
  if(v===VIEW){ window.scrollTo({top:0,behavior:'smooth'}); return; }
  if(v==='hoy'){
    if(viewDepth>0){ try{history.back();return;}catch(e){} }   // popstate renderiza Hoy
    viewDepth=0; goRender('hoy'); return;
  }
  goRender(v);
  try{
    if(viewDepth===0){ viewDepth=1; history.pushState({v:1},''); }
    else history.replaceState({v:1},'');
  }catch(e){}
}

document.querySelectorAll('.nv').forEach(b=>{
  b.onclick=()=> b.dataset.v==='more' ? openMore() : go(b.dataset.v);
});
['new-task','new-plan','new-habit','new-act','rem-label','new-step','new-proj-item','tx-amt','tx-note'].forEach(id=>{
  const el=$(id);
  if(el)el.addEventListener('keydown',e=>{if(e.key==='Enter'){
    ({['new-task']:addTask,['new-plan']:addPlan,['new-habit']:addHabit,['new-act']:addAct,['rem-label']:addRem,['new-step']:addStep,['new-proj-item']:addProjItem,['tx-amt']:addTx,['tx-note']:addTx})[id]();
  }});
});
/* ================= PERFILES + GATE (¿Quién eres?) ================= */
const ACCENTS=[
  {id:'blue',   c:'#2D68F8', c2:'#6D5BF0', name:'Azul'},
  {id:'green',  c:'#12A15E', c2:'#12B49A', name:'Verde'},
  {id:'pink',   c:'#E1568F', c2:'#F2779B', name:'Rosa'},
  {id:'purple', c:'#8B5CF6', c2:'#B57BF0', name:'Lila'},
  {id:'teal',   c:'#0E9AA7', c2:'#22B4A6', name:'Turquesa'},
];
function applyAccent(){ document.documentElement.dataset.accent=(S&&S.accent)||'blue'; }
function applyInlineAccent(el,id){
  const a=ACCENTS.find(x=>x.id===id)||ACCENTS[0];
  el.style.setProperty('--accent',a.c);
  el.style.setProperty('--accent-soft','color-mix(in srgb,'+a.c+' 13%,transparent)');
  el.style.setProperty('--accent2',a.c2);
}
function accentStyle(id){
  const a=ACCENTS.find(x=>x.id===id)||ACCENTS[0];
  return '--accent:'+a.c+'; --accent-soft:color-mix(in srgb,'+a.c+' 13%,transparent); --accent2:'+a.c2+';';
}
let gfEditId=null, gfPet='ed', gfAccent='blue';
function showGate(firstTime){
  renderLogo();
  const gl=$('gate-logo'); if(gl)gl.innerHTML=$('logo').innerHTML;
  $('gate-close').style.display = (ACTIVE?'flex':'none');
  if(ACTIVE) openSheet('gate');            // con perfil activo, atrás lo cierra
  else $('gate').classList.add('on');      // primera vez: pantalla obligatoria
  if(firstTime){ openProfileForm(null); }
  else{ $('gate-form').classList.remove('on'); $('gate-choose').style.display='flex'; renderGateList(); }
}
function gateClose(){ if(ACTIVE) closeSheet('gate'); }
function switchProfile(){ showGate(false); }
function renderGateList(){
  $('gate-list').innerHTML = PROFILES.map(p=>`
    <div class="gate-card" style="${accentStyle(p.accent||'blue')}" onclick="pickProfile('${p.id}')">
      <button class="gc-edit" onclick="event.stopPropagation();openProfileForm('${p.id}')" aria-label="Editar perfil">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg></button>
      <div class="gc-ring">${petSVG(74,'happy','joven',null,p.pet||'ed')}</div>
      <div class="gc-name">${esc(p.name)||'Perfil'}</div>
      <div class="gc-pet">con ${p.pet==='issabella'?'Isabella':'Ed'}</div>
    </div>`).join('') +
    `<button class="gate-add" onclick="openProfileForm(null)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
      Crear perfil</button>`;
}
async function pickProfile(id){ await enterApp(id); }
function openProfileForm(id){
  gfEditId=id;
  $('gate-choose').style.display='none';
  $('gate-form').classList.add('on');
  $('gate-close').style.display='none';
  if(id){
    const p=PROFILES.find(x=>x.id===id)||{};
    $('gf-title').textContent='Editar perfil';
    $('gf-name').value=p.name||'';
    gfPet=p.pet||'ed'; gfAccent=p.accent||'blue';
    $('gf-delete').style.display = PROFILES.length>1?'block':'none';
  }else{
    $('gf-title').textContent = PROFILES.length?'Nuevo perfil':'Crea tu perfil';
    $('gf-name').value='';
    gfPet='ed'; gfAccent = PROFILES.length?'green':'blue';   // sugerir verde al 2º perfil
    $('gf-delete').style.display='none';
  }
  $('gf-cancel').style.display = PROFILES.length?'block':'none';
  renderGfColors(); gfSetPet(gfPet);
  setTimeout(()=>$('gf-name').focus(),200);
}
function gfSetPet(p){
  gfPet=p;
  $('gf-pet-ed').classList.toggle('on',p==='ed');
  $('gf-pet-issabella').classList.toggle('on',p==='issabella');
  updateGfPreview();
}
function gfPickColor(a){ gfAccent=a; renderGfColors(); updateGfPreview(); }
function renderGfColors(){
  $('gf-colors').innerHTML=ACCENTS.map(a=>`<button class="gf-color ${a.id===gfAccent?'on':''}" style="background:${a.c}" onclick="gfPickColor('${a.id}')" aria-label="${a.name}"></button>`).join('');
  $('gf-pet-ed-svg').innerHTML=petSVG(52,'happy','joven',null,'ed');
  $('gf-pet-iss-svg').innerHTML=petSVG(52,'happy','joven',null,'issabella');
}
function updateGfPreview(){
  const pv=$('gf-preview');
  applyInlineAccent(pv,gfAccent);
  pv.innerHTML=petSVG(86,'happy','joven',null,gfPet);
}
async function gfSave(){
  const name=$('gf-name').value.trim();
  if(!name){ toast('Escribe un nombre'); $('gf-name').focus(); return; }
  if(gfEditId){
    const p=PROFILES.find(x=>x.id===gfEditId);
    if(p){ p.name=name; p.pet=gfPet; p.accent=gfAccent; }
    saveProfiles();
    await enterApp(gfEditId);
  }else{
    const id='p'+Date.now();
    PROFILES.push({id, name, pet:gfPet, accent:gfAccent});
    saveProfiles();
    const st=defaultState(); st.name=name; st.pet=gfPet; st.accent=gfAccent;
    await rawSet(dataKey(id), JSON.stringify(st));
    await enterApp(id);
  }
}
function gfCancel(){
  if(!PROFILES.length) return;              // el primer perfil es obligatorio
  $('gate-form').classList.remove('on');
  $('gate-choose').style.display='flex';
  $('gate-close').style.display = (ACTIVE?'flex':'none');
  renderGateList();
}
function gfDelete(){
  if(!gfEditId || PROFILES.length<=1){ toast('Debe existir al menos un perfil'); return; }
  const p=PROFILES.find(x=>x.id===gfEditId);
  showDlg({ico:'⚠️',title:'¿Eliminar el perfil de '+(p?p.name:'')+'?',msg:'Se borrarán TODOS sus datos y no se puede deshacer.',acts:[
    {label:'Sí, eliminar perfil',style:'danger',cb:async()=>{
      PROFILES=PROFILES.filter(x=>x.id!==gfEditId);
      saveProfiles();
      await rawDel(dataKey(gfEditId));
      allPhotos.filter(ph=>ph.profile===gfEditId).forEach(ph=>idbDel(ph.id));
      allPhotos=allPhotos.filter(ph=>ph.profile!==gfEditId);
      if(ACTIVE===gfEditId){ ACTIVE=null; await rawSet('faro-active',''); }
      gfEditId=null;
      gfCancel();
    }},
    {label:'Cancelar',style:'plain',cb:null}
  ]});
}
async function enterApp(id){
  flushSave();                               // persistir el perfil saliente antes de cambiar
  if(id){ ACTIVE=id; await rawSet('faro-active',id); }
  setTimeout(fetchFx,600);                   // tasa de cambio del día (si hay internet)
  await loadActiveState();
  const firstId=PROFILES[0]&&PROFILES[0].id;
  photos=allPhotos.filter(p=>(p.profile||firstId)===ACTIVE);
  applyAccent();
  hideSheet('gate');
  $('gate').classList.remove('on','closing');
  $('gate-form').classList.remove('on');
  renderAll();
  const goParam=new URLSearchParams(location.search).get('go');
  if(goParam&&$('v-'+goParam))go(goParam); else go('hoy');
  if(S.pomoState && !S.pomoState.paused){ updPomoUI(); }
}
function syncProfile(){
  const p=PROFILES.find(x=>x.id===ACTIVE);
  if(p){ p.name=S.name; p.pet=S.pet; p.accent=S.accent; saveProfiles(); }
}
function setPet(p){
  S.pet=p; syncProfile(); save(); applyAccent();
  $('pet-ed').classList.toggle('on',p==='ed');
  $('pet-issabella').classList.toggle('on',p==='issabella');
  renderEd(); renderStats(); toast('Mascota: '+petName());
}
function setAccent(a){
  S.accent=a; syncProfile(); save();
  applyAccent(); renderSetColors(); renderStats(); renderEd();
}
function renderSetColors(){
  const el=$('set-colors'); if(!el)return;
  el.innerHTML=ACCENTS.map(a=>`<button class="gf-color ${a.id===(S.accent||'blue')?'on':''}" style="background:${a.c}" onclick="setAccent('${a.id}')" aria-label="${a.name}"></button>`).join('');
}

/* ================= GASTOS ================= */
const TX_CATS={
  out:[['🍔','Comida'],['🚌','Transporte'],['🎉','Ocio'],['🏠','Hogar'],['💊','Salud'],['🛒','Compras'],['📱','Servicios'],['✨','Otros']],
  in:[['💼','Sueldo'],['💸','Extra'],['🎁','Regalo'],['📈','Inversión'],['✨','Otros']]
};
let txType='out';
function curSym(){return S.currency||'$';}
/* tasa de cambio del día (gratis, sin clave). Los montos se guardan en pesos;
   USD/EUR son solo una "lente" para verlos convertidos. */
async function fetchFx(){
  try{
    if(S.fx && S.fx.date===today()) return;
    const res=await fetch('https://open.er-api.com/v6/latest/USD');
    const j=await res.json();
    if(j && j.rates && j.rates.COP && j.rates.EUR){
      S.fx={date:today(), USD:j.rates.COP, EUR:j.rates.COP/j.rates.EUR};
      save();
      if($('v-gastos').classList.contains('on')) renderGastos();
    }
  }catch(e){}
}
function viewRate(){
  if(S.viewCur==='USD' && S.fx && S.fx.USD) return S.fx.USD;
  if(S.viewCur==='EUR' && S.fx && S.fx.EUR) return S.fx.EUR;
  return 1;
}
function curLabel(){ return S.viewCur==='USD'?'US$':S.viewCur==='EUR'?'€':curSym(); }
function setViewCur(c){
  if(c!=='COP' && !(S.fx && S.fx.USD)){ toast('Conéctate a internet una vez para traer la tasa del día'); fetchFx(); return; }
  S.viewCur=c; save(); renderGastos();
}
function fmtMoney(n){
  const r=viewRate(), v=n/r, neg=v<0, av=Math.abs(v);
  const txt = r===1
    ? Math.round(av).toLocaleString('es-CO')
    : av.toLocaleString('es-CO',{minimumFractionDigits:2, maximumFractionDigits:2});
  return (neg?'-':'')+curLabel()+txt;
}
function monthKey(d){ return (d||today()).slice(0,7); }
function txOfMonth(mk){ mk=mk||monthKey(); return S.tx.filter(t=>t.date.slice(0,7)===mk); }
function catInfo(type,cat){ return (TX_CATS[type]||[]).find(c=>c[1]===cat)||['✨',cat||'Otros']; }
let curTxCat='Comida';
function txSetType(t){
  txType=t; haptic(6);
  $('tx-in').classList.toggle('on',t==='in');
  $('tx-out').classList.toggle('on',t==='out');
  curTxCat=TX_CATS[t][0][1];
  renderTxCats();
}
function renderTxCats(){
  const ci=catInfo(txType,curTxCat);
  const lbl=$('tx-cat-lbl'); if(lbl)lbl.textContent=ci[0]+' '+ci[1];
}
/* helper genérico para las hojas inferiores (categoría / hora / fecha) */
function openHalfSheet(id){
  $('half-bg').classList.remove('closing'); $('half-bg').classList.add('on');
  openSheet(id,()=>{ const bg=$('half-bg'); bg.classList.add('closing'); setTimeout(()=>bg.classList.remove('on','closing'),200); });
}
function closeAnyHalf(){ ['cat-sheet','time-sheet','date-sheet'].forEach(id=>{ if($(id)&&$(id).classList.contains('on')) closeSheet(id); }); }

function openCatSheet(){
  haptic(6);
  $('cat-sheet-title').textContent=txType==='in'?'Categoría del ingreso':'Categoría del gasto';
  $('cat-grid').innerHTML=TX_CATS[txType].map(c=>`
    <button class="cat-opt ${c[1]===curTxCat?'on':''}" onclick="pickCat('${c[1]}')"><span class="co-em">${c[0]}</span>${c[1]}</button>`).join('');
  openHalfSheet('cat-sheet');
}
function closeCatSheet(){ closeSheet('cat-sheet'); }

/* ═══ PICKER DE HORA (propio) ═══ */
let tpH=19,tpM=0,tpCb=null;
function openTimePicker(cur,cb){
  const p=(cur||'19:00').split(':'); tpH=parseInt(p[0])||0; tpM=Math.round((parseInt(p[1])||0)/5)*5; if(tpM>55)tpM=55;
  tpCb=cb; renderTimePicker(); haptic(6); openHalfSheet('time-sheet');
  setTimeout(()=>{ const el=document.querySelector('#tp-hours .tp-cell.on'); if(el)el.scrollIntoView({inline:'center',block:'nearest'}); },40);
}
function renderTimePicker(){
  $('tp-display').textContent=String(tpH).padStart(2,'0')+':'+String(tpM).padStart(2,'0');
  $('tp-hours').innerHTML=Array.from({length:24},(_,h)=>`<button class="tp-cell ${h===tpH?'on':''}" onclick="tpSetH(${h})">${String(h).padStart(2,'0')}</button>`).join('');
  $('tp-mins').innerHTML=Array.from({length:12},(_,i)=>i*5).map(m=>`<button class="tp-cell ${m===tpM?'on':''}" onclick="tpSetM(${m})">${String(m).padStart(2,'0')}</button>`).join('');
}
function tpSetH(h){tpH=h;haptic(5);renderTimePicker();}
function tpSetM(m){tpM=m;haptic(5);renderTimePicker();}
function timePickDone(){ const v=String(tpH).padStart(2,'0')+':'+String(tpM).padStart(2,'0'); closeSheet('time-sheet'); if(tpCb)tpCb(v); }

/* ═══ PICKER DE FECHA (propio) ═══ */
let dpY,dpM,dpSel,dpCb;
function openDatePicker(cur,cb){
  dpCb=cb;
  if(cur){ const a=cur.split('-').map(Number); dpY=a[0]; dpM=a[1]-1; dpSel=cur; }
  else{ const n=new Date(); dpY=n.getFullYear(); dpM=n.getMonth(); dpSel=null; }
  renderDatePicker(); haptic(6); openHalfSheet('date-sheet');
}
function dpMove(dir){ dpM+=dir; if(dpM<0){dpM=11;dpY--;} if(dpM>11){dpM=0;dpY++;} haptic(5); renderDatePicker(); }
function renderDatePicker(){
  $('dp-title').textContent=new Date(dpY,dpM,1).toLocaleDateString('es',{month:'long',year:'numeric'});
  let html=''; const start=(new Date(dpY,dpM,1).getDay()+6)%7;
  const dim=new Date(dpY,dpM+1,0).getDate(), tk=today();
  for(let i=0;i<start;i++)html+='<button class="dp-day other" disabled></button>';
  for(let d=1;d<=dim;d++){
    const k=dpY+'-'+String(dpM+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    html+=`<button class="dp-day ${k===tk?'today':''} ${k===dpSel?'on':''}" onclick="dpPick('${k}')">${d}</button>`;
  }
  $('dp-grid').innerHTML=html;
}
function dpPick(k){ dpSel=k; haptic(8); closeSheet('date-sheet'); if(dpCb)dpCb(k); }
function datePickClear(){ closeSheet('date-sheet'); if(dpCb)dpCb(''); }
function datePickToday(){ dpPick(today()); }
function fmtDueShort(k){ if(!k)return ''; const [y,m,d]=k.split('-').map(Number); return new Date(y,m-1,d).toLocaleDateString('es',{day:'numeric',month:'long',year:'numeric'}); }
function pickCat(c){ curTxCat=c; haptic(10); renderTxCats(); closeSheet('cat-sheet'); }
function addTx(){
  const amt=moneyVal($('tx-amt'));
  if(!amt||amt<=0){ toast('Escribe un monto válido'); haptic([40,60,40]); return; }
  S.tx.push({id:'x'+Date.now(),type:txType,amount:amt,cat:curTxCat,note:$('tx-note').value.trim(),date:today()});
  $('tx-amt').value=''; $('tx-note').value='';
  save(); renderGastos();
  const m=txOfMonth();
  const bal=m.filter(t=>t.type==='in').reduce((a,t)=>a+t.amount,0)-m.filter(t=>t.type==='out').reduce((a,t)=>a+t.amount,0);
  if(txType==='out' && bal<0){
    haptic([200,100,200]);
    toast('⚠️ Ojo: con este gasto entraste en negativo');
    notify('⚠️ Cuidado con tus finanzas','Este mes ya gastaste más de lo que entró.');
  }else{
    haptic();
    toast(txType==='in'?'💰 Ingreso anotado':'💸 Gasto anotado');
  }
}
function delTx(id){
  const el=document.querySelector(`[data-tx="${id}"]`);
  haptic(15);
  animateOut(el,()=>{ S.tx=S.tx.filter(t=>t.id!==id); save(); renderGastos(); });
}
function setBudget(){
  showDlg({ico:'🎯',title:'Presupuesto mensual',msg:'¿Cuánto quieres gastar como máximo este mes? (en pesos; deja vacío para quitarlo)',
    input:{value:S.budget?S.budget.toString():'',placeholder:'0',money:true},
    acts:[
      {label:'Guardar',style:'primary',cb:(v)=>{const n=parseInt((v||'').replace(/\D/g,''))||0;S.budget=n>0?n:null;save();renderGastos();toast(S.budget?'🎯 Presupuesto fijado':'Presupuesto quitado');}},
      {label:'Cancelar',style:'plain',cb:null}
    ]});
}
function setCurrency(v){ S.currency=(v||'$').trim().slice(0,3)||'$'; save(); renderGastos(); }
function renderGastos(){
  const mk=monthKey(), list=txOfMonth(mk).slice().sort((a,b)=>a.id<b.id?1:-1);
  const income=list.filter(t=>t.type==='in').reduce((a,t)=>a+t.amount,0);
  const expense=list.filter(t=>t.type==='out').reduce((a,t)=>a+t.amount,0);
  const bal=income-expense;
  const monthName=new Date(mk+'-01T12:00').toLocaleDateString('es',{month:'long',year:'numeric'});
  // selector de moneda (los montos se anotan en pesos; USD/EUR los muestran convertidos)
  const sym=$('amt-sym'); if(sym)sym.textContent=curSym();
  const CURS=[['COP',curSym()+' Pesos'],['USD','US$ Dólar'],['EUR','€ Euro']];
  $('cur-pills').innerHTML=CURS.map(([c,l])=>`<button class="cur-pill ${(S.viewCur||'COP')===c?'on':''}" onclick="setViewCur('${c}')">${l}</button>`).join('');
  const fxEl=$('fx-note');
  if(S.viewCur!=='COP' && S.fx){
    const r=viewRate();
    fxEl.textContent='1 '+(S.viewCur==='USD'?'US$':'€')+' = '+curSym()+Math.round(r).toLocaleString('es-CO')+' · tasa del '+(S.fx.date===today()?'día':S.fx.date);
  }else fxEl.textContent='';
  const sum=$('gastos-summary');
  sum.classList.toggle('neg', bal<0);
  sum.innerHTML=`
    <div class="gs-top">Balance de ${monthName}</div>
    <div class="gs-bal">${fmtMoney(bal)}</div>
    <div class="gs-io"><span>↑ ${fmtMoney(income)}<i>ingresos</i></span><span>↓ ${fmtMoney(expense)}<i>gastos</i></span></div>
    ${bal<0?'<div class="gs-alert">⚠️ Este mes vas en negativo: gastaste más de lo que entró</div>':''}`;
  let budHtml='';
  if(S.budget){
    const pct=Math.min(100,Math.round(expense/S.budget*100)), over=expense>S.budget;
    budHtml=`<div class="bud-head"><span>Presupuesto del mes</span><button class="btn plain small" style="padding:0" onclick="setBudget()">${fmtMoney(S.budget)} ›</button></div>
      <div class="bud-bar"><div class="bud-fill ${over?'over':''}" style="width:${pct}%"></div></div>
      <div class="bud-meta ${over?'over':''}">${over?'⚠️ Te pasaste por '+fmtMoney(expense-S.budget):'Llevas '+pct+'% · te queda '+fmtMoney(S.budget-expense)}</div>`;
  }else{
    budHtml=`<button class="btn tint wide" onclick="setBudget()">🎯 Poner un presupuesto mensual</button>`;
  }
  $('gastos-budget').innerHTML=budHtml;
  const byCat={};
  list.filter(t=>t.type==='out').forEach(t=>{ byCat[t.cat]=(byCat[t.cat]||0)+t.amount; });
  const cats=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  $('gastos-cats').innerHTML = cats.length? '<div class="grp-h">En qué gastas</div><div class="card-plain" style="padding:16px 18px">'+cats.map(([cat,amt])=>{
    const ci=catInfo('out',cat), w=expense?Math.round(amt/expense*100):0;
    return `<div class="catrow"><span class="cat-em">${ci[0]}</span><div class="cat-body"><div class="cat-line"><span>${cat}</span><b>${fmtMoney(amt)}</b></div><div class="cat-bar"><div class="cat-fill" style="width:${w}%"></div></div></div></div>`;
  }).join('')+'</div>' : '';
  $('gastos-list').innerHTML = list.length? list.map(t=>{
    const ci=catInfo(t.type,t.cat);
    return `<div class="txrow" data-tx="${t.id}"><span class="tx-em" style="background:${t.type==='in'?'color-mix(in srgb,var(--ok) 15%,transparent)':'var(--fill)'}">${ci[0]}</span>
      <div class="tx-body"><div class="tx-t">${esc(t.cat)}${t.note?' · <span class="tx-note">'+esc(t.note)+'</span>':''}</div><div class="tx-d">${fmtDate(t.date)}</div></div>
      <span class="tx-amt ${t.type}">${t.type==='in'?'+':'−'}${fmtMoney(t.amount)}</span>
      <button class="icon-btn" onclick="delTx('${t.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>`;
  }).join('') : emptyHtml('🌱','Mes en blanco, cuentas claras','Anota tu primer movimiento arriba. La conciencia es el primer paso del control.');
  renderTxCats();
}

/* ================= TRABAJO (listas con avance) ================= */
let curProj=null;
function projPct(p){ if(!p.items.length)return 0; return Math.round(p.items.filter(i=>i.done).length/p.items.length*100); }
function renderTrabajo(){
  const list=S.projects;
  $('proj-empty').style.display='none';
  if(!list.length){ $('proj-list').innerHTML=emptyHtml('💼','Tu trabajo, bajo control','Crea listas por proyecto o cliente y marca pendientes a medida que avanzas.','Crear mi primera lista','openProj(null)'); return; }
  $('proj-list').innerHTML=list.map((p,idx)=>{
    const pct=projPct(p), c=GOAL_COLORS[idx%GOAL_COLORS.length], doneN=p.items.filter(i=>i.done).length;
    return `<div class="goal-card ${pct===100?'done-goal':''}" onclick="openProj('${p.id}')">
      <div class="g-top"><span class="g-ico" style="background:color-mix(in srgb,${c} 18%,transparent)">${p.em||'📋'}</span>
      <span class="g-name">${esc(p.name)}</span><span class="g-pct" style="color:${pct===100?'var(--green)':c}">${pct}%</span></div>
      <div class="g-bar"><div class="g-fill" style="width:${pct}%; background:${pct===100?'var(--green)':c}"></div></div>
      <div class="g-meta"><span>${p.items.length?doneN+' de '+p.items.length+' pendientes':'Sin pendientes aún'}</span></div>
    </div>`;
  }).join('');
}
function openProj(id){
  if(id) curProj=S.projects.find(p=>p.id===id);
  else{ curProj={id:'pr'+Date.now(),em:'📋',name:'',items:[],created:today()}; S.projects.push(curProj); }
  $('proj-em').value=curProj.em; $('proj-name').value=curProj.name;
  renderProjItems();
  openSheet('proj-ov',()=>{
    if(curProj){
      saveProjLive();
      if(!curProj.name && !curProj.items.length) S.projects=S.projects.filter(p=>p.id!==curProj.id);
      curProj=null;
    }
    save();renderTrabajo();
  });
  if(!id)setTimeout(()=>$('proj-name').focus(),150);
}
function saveProjLive(){ if(!curProj)return; curProj.em=$('proj-em').value.trim()||'📋'; curProj.name=$('proj-name').value.trim(); save(); }
function renderProjItems(){
  const pct=projPct(curProj);
  $('proj-prog-lbl').textContent=curProj.items.length?pct+'% · '+curProj.items.filter(i=>i.done).length+'/'+curProj.items.length:'';
  $('proj-items').innerHTML=curProj.items.map((s,i)=>`
    <div class="step ${s.done?'done':''}">
      <div class="cbx" onclick="toggleProjItem(${i})"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></div>
      <span class="step-txt" onclick="toggleProjItem(${i})">${esc(s.t)}</span>
      <span class="del-step" onclick="delProjItem(${i})"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--dim)" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></span>
    </div>`).join('')||'<div class="q-sub" style="padding:8px 0">Añade pendientes a esta lista.</div>';
}
function addProjItem(){
  const inp=$('new-proj-item'),t=inp.value.trim();if(!t)return;
  curProj.items.push({t,done:false}); inp.value=''; saveProjLive(); renderProjItems();
}
function toggleProjItem(i){
  const was=projPct(curProj)===100;
  curProj.items[i].done=!curProj.items[i].done; saveProjLive(); renderProjItems();
  if(!was && projPct(curProj)===100){ toast('🎉 ¡Lista completada!'); beep2(); }
}
function delProjItem(i){ curProj.items.splice(i,1); saveProjLive(); renderProjItems(); }
function closeProj(){ closeSheet('proj-ov'); }
function delProj(){
  const p=curProj;
  showDlg({ico:'🗑️',title:'¿Eliminar esta lista?',msg:'Se borrará con todos sus pendientes.',acts:[
    {label:'Sí, eliminar',style:'danger',cb:()=>{S.projects=S.projects.filter(x=>x.id!==p.id);curProj=null;save();closeSheet('proj-ov');toast('Lista eliminada');}},
    {label:'Cancelar',style:'plain',cb:null}
  ]});
}
['proj-em','proj-name'].forEach(id=>{ document.addEventListener('input',e=>{ if(e.target.id===id && curProj) saveProjLive(); }); });

/* menú "Más" */
function openMore(){ haptic(6); openSheet('more-ov'); }
function closeMore(){ closeSheet('more-ov'); }

function renderAll(){
  applyAccent();
  document.documentElement.dataset.theme=S.theme;
  $('th-light').classList.toggle('on',S.theme==='light');
  $('th-dark').classList.toggle('on',S.theme==='dark');
  $('beast-sw').classList.toggle('on',S.beastOn);
  $('beast-every').value=S.beastEvery;
  renderLogo();renderHoy();renderGoals();renderTiempo();renderCIHist();renderNotes();renderStats();renderCal();renderSel();renderSet();renderGastos();renderTrabajo();
}
(async function init(){
  try{ history.replaceState({root:1},''); }catch(e){}
  const amtIn=$('tx-amt'); if(amtIn)amtIn.addEventListener('input',()=>moneyMask(amtIn));
  document.addEventListener('contextmenu',e=>{ if(!e.target.closest('input,textarea,[contenteditable]'))e.preventDefault(); });
  await loadProfiles();
  await openIDB();
  allPhotos=await idbAll();
  if('serviceWorker' in navigator&&location.protocol.startsWith('http')){
    navigator.serviceWorker.register('sw.js').then(r=>swReg=r).catch(()=>{});
  }
  tickReminders();beastTick();
  if(!PROFILES.length){ showGate(true); return; }          // primera vez: crear perfil
  if(PROFILES.length===1){ await enterApp(PROFILES[0].id); } // un perfil: entrar directo
  else{ showGate(false); }                                   // varios: elegir quién eres
})();
