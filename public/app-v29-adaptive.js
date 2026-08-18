import { CONFIG } from './config.js';
import { getSupabaseClient } from './app-supabase.js';

const FN=`${CONFIG.supabaseUrl}/functions/v1/adaptive-week`;
const CONSENT='fitnest.coach.aiConsent';
const REVIEWS='fitnest.progress.reviews';
const TRAIN='fitnest.ai.trainingPlan.v26';
const NEXT='fitnest.ai.trainingPlan.next.v29';
let sb=null,review=null,loading=false,loaded=false,queued=false;

const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
const esc=(value='')=>String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const iso=(date=new Date())=>{const value=new Date(date);value.setMinutes(value.getMinutes()-value.getTimezoneOffset());return value.toISOString().slice(0,10)};
const fromIso=value=>new Date(`${value}T12:00:00`);
const monday=(value=iso())=>{const date=fromIso(value);date.setDate(date.getDate()-((date.getDay()+6)%7));return iso(date)};
const formatDate=value=>new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}).format(fromIso(value));

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

function confidenceLabel(value){
  return value==='high'?'hoch':value==='medium'?'mittel':'niedrig';
}

function actionTitle(value){
  if(value==='progress')return'Kleine Progression';
  if(value==='lighter')return'Kontrollierte Entlastung';
  return'Plan stabil halten';
}

function actionIcon(value){
  if(value==='progress')return'↗';
  if(value==='lighter')return'↓';
  return'→';
}

function localReview(value){
  const reviews=read(REVIEWS,{});
  if(value)reviews[value.week_start]=value;
  write(REVIEWS,reviews);
}

function activatePending(){
  const pending=read(NEXT,null);
  if(!pending?.weekStart||!pending?.plan)return;
  if(iso()>=pending.weekStart){
    write(TRAIN,{...pending.plan,weekStart:pending.weekStart});
    localStorage.removeItem(NEXT);
  }
}

async function load(force=false){
  if(loaded&&!force){queueRender();return}
  const current=await session();
  if(!current?.user?.id){
    review=read(REVIEWS,{})[monday()]||null;
    loaded=true;
    queueRender();
    return;
  }
  try{
    const result=await (await client()).from('weekly_reviews').select('*').eq('user_id',current.user.id).eq('week_start',monday()).maybeSingle();
    if(result.error)throw result.error;
    review=result.data||read(REVIEWS,{})[monday()]||null;
    if(review)localReview(review);
  }catch(error){
    console.error('v29 weekly review load',error);
    review=read(REVIEWS,{})[monday()]||null;
  }
  loaded=true;
  queueRender();
}

function metric(label,value){
  return `<div class="v29-metric"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`;
}

function reviewHtml(value){
  const recommendation=value.recommendation||{};
  const metrics=value.metrics||{};
  const accepted=value.status==='accepted';
  const dismissed=value.status==='dismissed';
  const volume=Number(recommendation.volumePercent||0);
  const rpe=Number(recommendation.rpeDelta||0);
  const source=recommendation.source==='openai'?'KI Analyse':'Sicherheitsregeln';
  return `<div class="v29-review ${value.status||'generated'}">
    <div class="v29-review-top">
      <div><span class="eyebrow">${esc(source)} · Woche ab ${formatDate(value.week_start)}</span><h2>${esc(actionTitle(recommendation.trainingAction))}</h2></div>
      <span class="v29-action-icon ${esc(recommendation.trainingAction||'maintain')}">${actionIcon(recommendation.trainingAction)}</span>
    </div>
    <p class="v29-summary">${esc(recommendation.summary||'Deine Woche wurde ausgewertet.')}</p>
    <div class="v29-metrics">
      ${metric('Umsetzung',`${metrics.adherencePct||0}%`)}
      ${metric('Erledigt',`${metrics.completed||0}/${metrics.plannedTotal||0}`)}
      ${metric('Training',`${metrics.trainingDone||0}/${metrics.trainingPlanned||0}`)}
      ${metric('Schwierigkeit',metrics.avgDifficulty!=null?`${metrics.avgDifficulty}/5`:'–')}
      ${metric('Energie',metrics.avgEnergy!=null?`${metrics.avgEnergy}/5`:'–')}
      ${metric('Datenbasis',confidenceLabel(metrics.confidence))}
    </div>
    <div class="v29-changes">
      <article><small>Training nächste Woche</small><strong>${volume>0?'+':''}${volume}% Umfang · RPE ${rpe>0?'+':''}${rpe}</strong><p>${esc(recommendation.trainingNote||'Der Trainingsrahmen bleibt stabil.')}</p></article>
      <article><small>Ernährung</small><strong>Keine automatische Kaloriensenkung</strong><p>${esc(recommendation.nutritionNote||'Kalorienziel und Essensrhythmus bleiben unverändert.')}</p></article>
    </div>
    ${recommendation.reasons?.length?`<div class="v29-reasons"><small>Warum dieser Vorschlag?</small>${recommendation.reasons.map(reason=>`<p><span>✓</span>${esc(reason)}</p>`).join('')}</div>`:''}
    <div class="v29-next"><span>Nächste Planwoche</span><strong>${recommendation.nextWeekStart?formatDate(recommendation.nextWeekStart):'–'}</strong></div>
    ${accepted
      ?'<div class="v29-result success"><strong>Plan übernommen</strong><span>Der neue Trainingsplan wird ab der nächsten Planwoche automatisch aktiv.</span></div>'
      :dismissed
        ?'<div class="v29-result"><strong>Vorschlag verworfen</strong><span>Dein bestehender Plan bleibt unverändert.</span></div><button class="secondary" type="button" data-v29-generate data-force="1">Neu analysieren</button>'
        :'<div class="v29-actions"><button class="secondary" type="button" data-v29-dismiss>Verwerfen</button><button class="primary" type="button" data-v29-accept>Für nächste Woche übernehmen</button></div>'}
  </div>`;
}

function emptyHtml(){
  return `<div class="v29-review empty">
    <div class="v29-review-top"><div><span class="eyebrow">Build 2.9 · Adaptiver Wochenplan</span><h2>Deine Woche auswerten</h2></div><span class="v29-action-icon maintain">✦</span></div>
    <p class="v29-summary">Fitnest prüft Umsetzung, Trainingsschwierigkeit, Energie und Gewichtsverlauf. Daraus entsteht ein sicherer Vorschlag für die nächste Trainingswoche.</p>
    <div class="v29-safety">
      <span>✓ Keine automatische Planänderung</span>
      <span>✓ Keine automatische Kaloriensenkung</span>
      <span>✓ Übernahme nur nach Bestätigung</span>
    </div>
    <button class="primary" type="button" data-v29-generate>Woche mit KI analysieren</button>
  </div>`;
}

function render(){
  queued=false;
  const app=document.getElementById('app');
  if(!app||document.getElementById('pageTitle')?.textContent!=='Fortschritt')return;
  const signature=JSON.stringify([review,loading,monday()]);
  const current=app.querySelector('[data-v29-root]');
  if(current?.dataset.signature===signature)return;
  const section=document.createElement('section');
  section.className='section v29-adaptive';
  section.dataset.v29Root='1';
  section.dataset.signature=signature;
  section.innerHTML=`<div class="section-head"><div><small>Adaptive Planung</small><h3>KI Wochenanpassung</h3></div><span class="pill">${loading?'Analysiert …':'Build 2.9'}</span></div>${review?reviewHtml(review):emptyHtml()}`;
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

async function call(mode,extra={}){
  const current=await session();
  if(!current?.access_token)throw new Error('Bitte zuerst anmelden.');
  const result=await fetch(FN,{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${current.access_token}`},
    body:JSON.stringify({mode,weekStart:monday(),...extra})
  });
  const body=await result.json().catch(()=>({}));
  if(!result.ok)throw new Error(body.code==='no_training_plan'?'Es ist noch kein Trainingsplan vorhanden.':body.message||body.code||`HTTP ${result.status}`);
  return body;
}

function consentDialog(force=false){
  const sheet=document.getElementById('sheet');
  const content=document.getElementById('sheetContent');
  content.innerHTML=`<div class="sheet-inner"><div class="sheet-handle"></div><div class="sheet-head"><div><p class="eyebrow">Adaptive KI Planung</p><h2>Wochenanalyse freigeben</h2></div><button data-v29-close>×</button></div><div class="legal"><p>Für die adaptive Wochenanalyse werden Ziel, Gewichtstrend, Planumsetzung sowie Trainingsschwierigkeit und Energie serverseitig an OpenAI übertragen.</p><p>Fitnest senkt das Kalorienziel nicht automatisch. Der nächste Trainingsplan wird erst nach deiner ausdrücklichen Bestätigung gespeichert.</p></div><button class="primary" data-v29-consent>KI Wochenanalyse erlauben</button><button class="secondary" data-v29-close>Abbrechen</button></div>`;
  if(!sheet.open)sheet.showModal();
  content.querySelectorAll('[data-v29-close]').forEach(button=>button.onclick=()=>sheet.close());
  content.querySelector('[data-v29-consent]').onclick=()=>{
    write(CONSENT,true);
    sheet.close();
    void generate(force);
  };
}

async function generate(force=false){
  if(loading)return;
  if(!read(CONSENT,false)){consentDialog(force);return}
  loading=true;
  queueRender();
  toast('Fitnest analysiert deine Woche.');
  try{
    const result=await call('generate',{consent:true,force});
    review=result.review;
    localReview(review);
    toast(result.source==='openai'?'KI Wochenvorschlag erstellt.':'Sicherer Wochenvorschlag erstellt.');
  }catch(error){
    console.error('v29 generate',error);
    toast(error.message||'Wochenanalyse fehlgeschlagen.');
  }finally{
    loading=false;
    queueRender();
  }
}

async function accept(){
  if(loading||!review)return;
  const next=review.recommendation?.nextWeekStart;
  if(!confirm(`Trainingsanpassung ab ${next?formatDate(next):'nächster Woche'} übernehmen? Dein aktueller Wochenplan bleibt bis dahin aktiv.`))return;
  loading=true;
  queueRender();
  try{
    const result=await call('accept');
    review=result.review;
    if(result.nextPlan)write(NEXT,result.nextPlan);
    localReview(review);
    toast('Nächster Wochenplan wurde vorbereitet.');
  }catch(error){
    console.error('v29 accept',error);
    toast(error.message||'Plan konnte nicht übernommen werden.');
  }finally{
    loading=false;
    queueRender();
  }
}

async function dismiss(){
  if(loading||!review)return;
  if(!confirm('Diesen Vorschlag verwerfen? Dein bestehender Trainingsplan bleibt unverändert.'))return;
  loading=true;
  queueRender();
  try{
    const result=await call('dismiss');
    review=result.review;
    localReview(review);
    toast('Vorschlag verworfen.');
  }catch(error){
    console.error('v29 dismiss',error);
    toast(error.message||'Vorschlag konnte nicht verworfen werden.');
  }finally{
    loading=false;
    queueRender();
  }
}

document.addEventListener('click',event=>{
  const generateButton=event.target.closest?.('[data-v29-generate]');
  if(generateButton){event.preventDefault();void generate(generateButton.dataset.force==='1');return}
  if(event.target.closest?.('[data-v29-accept]')){event.preventDefault();void accept();return}
  if(event.target.closest?.('[data-v29-dismiss]')){event.preventDefault();void dismiss()}
},true);

const app=document.getElementById('app');
const title=document.getElementById('pageTitle');
if(app)new MutationObserver(queueRender).observe(app,{childList:true});
if(title)new MutationObserver(queueRender).observe(title,{childList:true,subtree:true,characterData:true});
document.querySelectorAll('.tab').forEach(button=>button.addEventListener('click',()=>{queueRender();if(button.dataset.view==='progress')void load()}));
document.addEventListener('fitnest:v27-auth',()=>{loaded=false;void load(true)});
document.addEventListener('fitnest:cloud-synced',()=>{loaded=false;void load(true)});

activatePending();
void load();
queueRender();
