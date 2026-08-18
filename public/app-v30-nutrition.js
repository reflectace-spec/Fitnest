import { CONFIG } from './config.js';
import { getSupabaseClient } from './app-supabase.js';

const FN=`${CONFIG.supabaseUrl}/functions/v1/recipe-generator`;
const CONSENT='fitnest.coach.aiConsent';
const PROFILES='fitnest.nutrition.profiles.v24';
const ACTIVE='fitnest.nutrition.activeProfile.v24';
const PLANS='fitnest.nutrition.plans';
let sb=null,preview=null,userId='',loading=false,queued=false;

const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
const esc=(value='')=>String(value).replace(/[&<>'\"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[char]));
const iso=(date=new Date())=>{const value=new Date(date);value.setMinutes(value.getMinutes()-value.getTimezoneOffset());return value.toISOString().slice(0,10)};
const fromIso=value=>new Date(`${value}T12:00:00`);
const addDays=(value,days)=>{const date=fromIso(value);date.setDate(date.getDate()+days);return iso(date)};
const nextMonday=()=>{const today=iso(),date=fromIso(today),weekday=(date.getDay()+6)%7;return addDays(today,7-weekday)};
const formatDate=value=>new Intl.DateTimeFormat('de-DE',{weekday:'short',day:'2-digit',month:'2-digit'}).format(fromIso(value));
const money=value=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(Number(value||0));
const previewKey=id=>`fitnest.nutrition.preview.v30.${id||'local'}`;

function toast(message){
  const node=document.getElementById('toast');
  if(!node)return;
  node.textContent=message;
  node.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>node.classList.remove('show'),3200);
}

async function client(){
  if(sb)return sb;
  sb=await getSupabaseClient();
  return sb;
}

async function session(){
  const known=window.__fitnestV27?.session;
  if(known?.access_token)return known;
  try{return (await (await client()).auth.getSession()).data.session||null}catch{return null}
}

function activeProfile(){
  const profiles=read(PROFILES,[]);
  const activeId=localStorage.getItem(ACTIVE)||profiles.find(item=>item.isActive)?.id;
  return profiles.find(item=>item.id===activeId)||profiles[0]||null;
}

function profilePayload(profile){
  return{
    diet:profile.diet,
    allergies:profile.allergies||[],
    dislikes:profile.dislikes||[],
    glutenFreeCeliac:Boolean(profile.glutenFreeCeliac),
    calories:Number(profile.calories)||2000,
    protein:Number(profile.protein)||80,
    pattern:profile.pattern||'regular',
    mealsPerDay:Number(profile.mealsPerDay)||4,
    schedule:profile.schedule||[],
    budgetAmount:Number(profile.budgetAmount)||0,
    budgetPeriod:profile.budgetPeriod||'week'
  };
}

function totals(plans=preview?.plans||[]){
  const days=plans.length||1;
  const sum=plans.reduce((all,day)=>{
    const meals=day.meals||[];
    all.kcal+=Number(day.summary?.kcal)||meals.reduce((value,meal)=>value+(Number(meal.kcal)||0),0);
    all.protein+=Number(day.summary?.protein)||meals.reduce((value,meal)=>value+(Number(meal.protein)||0),0);
    all.cost+=Number(day.summary?.cost)||meals.reduce((value,meal)=>value+(Number(meal.cost)||0),0);
    all.meals+=meals.length;
    return all;
  },{kcal:0,protein:0,cost:0,meals:0});
  return{...sum,avgKcal:Math.round(sum.kcal/days),avgProtein:Math.round(sum.protein/days)};
}

function validPreview(profile){
  return preview?.plans?.length===7&&preview.plans[0]?.date===nextMonday()&&preview.profileId===profile?.id;
}

function signalText(signals){
  if(!signals?.recorded)return'Noch wenig Rückmeldungen vorhanden. Dein Profil bleibt die Hauptgrundlage.';
  const parts=[`${signals.recorded} Mahlzeiten bewertet`];
  if(signals.skipped)parts.push(`${signals.skipped} ausgelassen`);
  if(signals.replaced)parts.push(`${signals.replaced} ersetzt`);
  return `${parts.join(' · ')}. Diese Muster wurden bei der Auswahl berücksichtigt.`;
}

function emptyHtml(profile){
  if(!profile)return `<div class="v30-card empty"><h2>Ernährungsprofil fehlt</h2><p>Lege zuerst im Essen Tab ein aktives Profil an.</p></div>`;
  return `<div class="v30-card empty">
    <div class="v30-head"><div><span class="eyebrow">Build 3.0 · Nächste Woche</span><h2>Adaptive Essenswoche</h2></div><span class="v30-icon">✦</span></div>
    <p>Fitnest erstellt sieben Tage passend zu deinem aktiven Profil und berücksichtigt zusätzlich ausgelassene oder ersetzte Mahlzeiten.</p>
    <div class="v30-guardrails">
      <span>✓ Kalorien und Protein bleiben am Profilziel</span>
      <span>✓ Allergien, Zöliakie und Ernährungsform bleiben verbindlich</span>
      <span>✓ Speicherung erst nach ausdrücklicher Übernahme</span>
    </div>
    <button class="primary" type="button" data-v30-generate>Essenswoche mit KI vorbereiten</button>
  </div>`;
}

function dayHtml(day){
  const summary=day.summary||{};
  return `<article class="v30-day">
    <div class="v30-day-head"><div><small>${esc(formatDate(day.date))}</small><strong>${day.meals?.length||0} Mahlzeiten</strong></div><span>${money(summary.cost)}</span></div>
    <div class="v30-day-values"><span>${Number(summary.kcal)||0} kcal</span><span>${Number(summary.protein)||0} g Protein</span></div>
    <div class="v30-meal-names">${(day.meals||[]).map(meal=>`<p><time>${esc(meal.time||'')}</time><span>${esc(meal.name||'Mahlzeit')}</span></p>`).join('')}</div>
  </article>`;
}

function previewHtml(profile){
  const value=totals();
  const accepted=Boolean(preview.acceptedAt);
  return `<div class="v30-card ${accepted?'accepted':''}">
    <div class="v30-head"><div><span class="eyebrow">Woche ab ${esc(formatDate(preview.plans[0].date))}</span><h2>${accepted?'Essenswoche übernommen':'Deine Vorschau'}</h2></div><span class="v30-icon">${accepted?'✓':'7'}</span></div>
    <div class="v30-summary-grid">
      <div><small>Ø Kalorien</small><strong>${value.avgKcal}</strong></div>
      <div><small>Ø Protein</small><strong>${value.avgProtein} g</strong></div>
      <div><small>Woche</small><strong>${money(value.cost)}</strong></div>
      <div><small>Mahlzeiten</small><strong>${value.meals}</strong></div>
    </div>
    <p class="v30-adaptive-note">${esc(signalText(preview.adaptiveSignals))}</p>
    <div class="v30-days">${preview.plans.map(dayHtml).join('')}</div>
    ${accepted
      ?`<div class="v30-result"><strong>Ab nächster Woche eingeplant</strong><span>${Number(preview.shoppingCount)||0} Zutaten wurden für den Wocheneinkauf vorbereitet.</span></div><button class="secondary" type="button" data-v30-generate>Neue Vorschau erstellen</button>`
      :`<div class="v30-actions"><button class="secondary" type="button" data-v30-generate>Neu erstellen</button><button class="primary" type="button" data-v30-accept>Für nächste Woche übernehmen</button></div>`}
    <p class="v30-footnote">Kosten sind Schätzwerte. Medizinisch relevante Zutaten und Spurenhinweise bitte weiterhin auf der Verpackung prüfen.</p>
  </div>`;
}

function render(){
  queued=false;
  const app=document.getElementById('app');
  if(!app||document.getElementById('pageTitle')?.textContent!=='Ernährung')return;
  const profile=activeProfile();
  if(!validPreview(profile)&&preview)preview=null;
  const signature=JSON.stringify([profile?.id,preview,loading,nextMonday()]);
  const current=app.querySelector('[data-v30-root]');
  if(current?.dataset.signature===signature)return;
  const section=document.createElement('section');
  section.className='section v30-nutrition';
  section.dataset.v30Root='1';
  section.dataset.signature=signature;
  section.innerHTML=`<div class="section-head"><div><small>Adaptive Ernährung</small><h3>Nächste Essenswoche</h3></div><span class="pill">${loading?'KI plant …':'Build 3.0'}</span></div>${preview?previewHtml(profile):emptyHtml(profile)}`;
  section.querySelectorAll('button').forEach(button=>button.disabled=loading);
  if(current)current.replaceWith(section);
  else{
    const hero=app.querySelector('.hero');
    if(hero)hero.after(section);
    else app.prepend(section);
  }
}

function queueRender(){
  if(queued)return;
  queued=true;
  queueMicrotask(render);
}

async function call(body){
  const current=await session();
  if(!current?.access_token)throw new Error('Bitte zuerst anmelden.');
  const result=await fetch(FN,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${current.access_token}`},body:JSON.stringify(body)});
  const value=await result.json().catch(()=>({}));
  if(!result.ok){
    const messages={profile_changed:'Das aktive Ernährungsprofil wurde geändert. Bitte die Vorschau neu erstellen.',celiac_guard_rejected:'Der Plan hat den Zöliakie Sicherheitscheck nicht bestanden. Bitte neu erstellen.',invalid_plan_week:'Die Vorschau gehört nicht mehr zur nächsten Planwoche.'};
    throw new Error(messages[value.code]||value.message||value.code||`HTTP ${result.status}`);
  }
  return value;
}

function openSheet(html){
  const sheet=document.getElementById('sheet'),content=document.getElementById('sheetContent');
  if(!sheet||!content)return null;
  content.innerHTML=html;
  if(!sheet.open)sheet.showModal();
  content.querySelectorAll('[data-v30-close]').forEach(button=>button.onclick=()=>sheet.close());
  return{sheet,content};
}

function consentDialog(){
  const opened=openSheet(`<div class="sheet-inner"><div class="sheet-handle"></div><div class="sheet-head"><div><p class="eyebrow">Adaptive Ernährung</p><h2>KI Planung freigeben</h2></div><button data-v30-close>×</button></div><div class="legal"><p>Für die Planung werden dein Ernährungsprofil und deine Mahlzeitenrückmeldungen serverseitig an OpenAI übertragen.</p><p>Es wird nichts gespeichert, bevor du die fertige Woche ausdrücklich übernimmst. Kalorien und Protein werden nicht automatisch abgesenkt.</p></div><button class="primary" data-v30-consent>KI Essensplanung erlauben</button><button class="secondary" data-v30-close>Abbrechen</button></div>`);
  if(!opened)return;
  opened.content.querySelector('[data-v30-consent]').onclick=()=>{write(CONSENT,true);opened.sheet.close();void generate()};
}

function summaryDialog(title,subtitle,accepted=false){
  const value=totals();
  openSheet(`<div class="sheet-inner v30-sheet"><div class="sheet-handle"></div><div class="v30-sheet-mark">${accepted?'✓':'7'}</div><p class="eyebrow">Build 3.0</p><h2>${esc(title)}</h2><p>${esc(subtitle)}</p><div class="v30-summary-grid"><div><small>Ø Kalorien</small><strong>${value.avgKcal}</strong></div><div><small>Ø Protein</small><strong>${value.avgProtein} g</strong></div><div><small>Wochenkosten</small><strong>${money(value.cost)}</strong></div><div><small>Mahlzeiten</small><strong>${value.meals}</strong></div></div><button class="primary" data-v30-close>${accepted?'Fertig':'Vorschau prüfen'}</button></div>`);
}

async function generate(){
  if(loading)return;
  if(!read(CONSENT,false)){consentDialog();return}
  const profile=activeProfile();
  if(!profile){toast('Bitte zuerst ein Ernährungsprofil anlegen.');return}
  loading=true;
  queueRender();
  toast('Fitnest plant deine nächste Essenswoche.');
  try{
    const result=await call({mode:'generate',consent:true,days:7,startDate:nextMonday(),profile:profilePayload(profile)});
    preview={plans:result.plans,profileId:profile.id,profileName:profile.name,generatedAt:new Date().toISOString(),adaptiveSignals:result.adaptiveSignals||null,model:result.model||null};
    write(previewKey(userId),preview);
    queueRender();
    summaryDialog('Deine Essenswoche ist vorbereitet',signalText(preview.adaptiveSignals));
  }catch(error){
    console.error('v30 generate',error);
    toast(error.message||'Essenswoche konnte nicht erstellt werden.');
  }finally{
    loading=false;
    queueRender();
  }
}

async function accept(){
  if(loading||!preview)return;
  const profile=activeProfile();
  const start=preview.plans?.[0]?.date;
  if(!confirm(`Essensplan ab ${formatDate(start)} übernehmen? Vorhandene Tagespläne dieser künftigen Woche werden ersetzt. Dein aktueller Plan bleibt unverändert.`))return;
  loading=true;
  queueRender();
  try{
    const result=await call({mode:'accept',profileId:profile.id,plans:preview.plans});
    const localPlans=read(PLANS,{});
    for(const day of preview.plans)localPlans[day.date]={date:day.date,profileId:profile.id,profileName:profile.name,meals:day.meals,generatedAt:preview.generatedAt};
    write(PLANS,localPlans);
    preview={...preview,acceptedAt:new Date().toISOString(),shoppingCount:result.shoppingCount||0};
    write(previewKey(userId),preview);
    document.dispatchEvent(new CustomEvent('fitnest:cloud-synced'));
    queueRender();
    summaryDialog('Plan für nächste Woche übernommen',`Sieben Tagespläne und ${Number(result.shoppingCount)||0} Einkaufspositionen sind vorbereitet.`,true);
  }catch(error){
    console.error('v30 accept',error);
    toast(error.message||'Essenswoche konnte nicht übernommen werden.');
  }finally{
    loading=false;
    queueRender();
  }
}

async function load(){
  const current=await session();
  const nextUser=current?.user?.id||'';
  if(nextUser!==userId){userId=nextUser;preview=read(previewKey(userId),null)}
  queueRender();
}

document.addEventListener('click',event=>{
  if(event.target.closest?.('[data-v30-generate]')){event.preventDefault();void generate();return}
  if(event.target.closest?.('[data-v30-accept]')){event.preventDefault();void accept()}
},true);

const app=document.getElementById('app');
const title=document.getElementById('pageTitle');
if(app)new MutationObserver(queueRender).observe(app,{childList:true});
if(title)new MutationObserver(queueRender).observe(title,{childList:true,subtree:true,characterData:true});
document.querySelectorAll('.tab').forEach(button=>button.addEventListener('click',()=>{queueRender();if(button.dataset.view==='nutrition')void load()}));
document.addEventListener('fitnest:v27-auth',()=>void load());
document.addEventListener('fitnest:cloud-synced',queueRender);
window.addEventListener('storage',event=>{if([PROFILES,ACTIVE,PLANS,previewKey(userId)].includes(event.key)){preview=read(previewKey(userId),null);queueRender()}});

void load();
queueRender();
