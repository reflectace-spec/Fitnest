import { CONFIG } from './config.js';
import { getSupabaseClient } from './app-supabase.js';

const BUILD='2.4.4';
const PROFILE_KEY='fitnest.profile';
const NUTRITION_PROFILES_KEY='fitnest.nutrition.profiles.v24';
const ACTIVE_NUTRITION_KEY='fitnest.nutrition.activeProfile.v24';
const PLAN_KEY='fitnest.nutrition.plans';
const LOG_KEY='fitnest.nutrition.logs';
const REPLAN_KEY='fitnest.goalReplan.v244';
const RECIPE_CONSENT_KEY='fitnest.ai.recipeConsent';
const RECIPE_FN=`${CONFIG.supabaseUrl}/functions/v1/recipe-generator`;
let sb=null,busy=false;

function read(k,f){try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}}
function write(k,v){localStorage.setItem(k,JSON.stringify(v))}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function clamp(n,a,b){return Math.max(a,Math.min(b,n))}
function iso(d=new Date()){const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)}
function money(v){return new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(Number(v||0))}
function fmtDate(v){return new Intl.DateTimeFormat('de-DE').format(new Date(`${v}T12:00:00`))}
function toast(m){const t=document.getElementById('toast');if(!t)return;t.textContent=m;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),3000)}
function round50(n){return Math.round(n/50)*50}
function round5(n){return Math.round(n/5)*5}
function currentProfile(){return read(PROFILE_KEY,null)}
function nutritionProfiles(){return read(NUTRITION_PROFILES_KEY,[])}
function activeNutritionProfile(){const ps=nutritionProfiles(),id=localStorage.getItem(ACTIVE_NUTRITION_KEY);return ps.find(x=>x.id===id)||ps.find(x=>x.isActive)||ps[0]||null}
function currentWeekStart(offset=0){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7)+(offset*7));return iso(d)}

async function client(){if(sb)return sb;if(!CONFIG.supabaseUrl||!CONFIG.supabasePublishableKey)return null;return sb=await getSupabaseClient()}
async function session(){const c=await client();return c?(await c.auth.getSession()).data.session||null:null}

function profileFromForm(form){const f=new FormData(form),p=Object.fromEntries(f.entries());['currentWeight','targetWeight','height','age','trainingDays','minutes','stepGoal','waterGoal'].forEach(k=>p[k]=Number(p[k]));return p}
function changed(a,b,k){return String(a?.[k]??'')!==String(b?.[k]??'')}
function goalRelevantChanged(old,next){return !old||['currentWeight','targetWeight','targetDate','height','age','sex','activity'].some(k=>changed(old,next,k))}

function calculateReplan(p){
  const now=new Date();now.setHours(12,0,0,0);const end=new Date(`${p.targetDate}T12:00:00`);
  const days=Math.max(7,Math.ceil((end-now)/86400000)),weeks=Math.max(1,days/7),loss=Math.max(0,+p.currentWeight-(+p.targetWeight||0));
  const desiredRate=loss/weeks,w=+p.currentWeight||0,h=+p.height||0,a=+p.age||0,sexAdj=p.sex==='female'?-161:5;
  const bmr=w&&h&&a?10*w+6.25*h-5*a+sexAdj:0,factor=({low:1.25,medium:1.4,high:1.55})[p.activity]||1.3,tdee=bmr?bmr*factor:0;
  const boundedRate=Math.min(1,Math.max(0,desiredRate)),desiredDeficit=boundedRate*7700/7,maxDeficit=tdee?Math.max(0,Math.min(tdee*.25,tdee-bmr)):0,deficit=Math.min(desiredDeficit,maxDeficit);
  const calories=tdee?round50(clamp(tdee-deficit,bmr,tdee)):null,projectedRate=deficit*7/7700;
  const protein=w?round5(clamp(Math.min(w,(+p.targetWeight||w)*1.15)*1.6,50,250)):null;
  let stepGoal=+p.stepGoal||8000;
  if(loss>0&&desiredRate>projectedRate+.05&&stepGoal<10000)stepGoal=Math.min(10000,stepGoal+500);
  const tooAggressive=desiredRate>1||desiredRate>projectedRate+.20;
  return{desiredRate,projectedRate,loss,weeks,bmr:Math.round(bmr),tdee:round50(tdee),calories,protein,stepGoal,trainingDays:+p.trainingDays||3,minutes:+p.minutes||30,tooAggressive};
}

async function saveCoreProfile(next,goalChanged){
  write(PROFILE_KEY,next);
  const c=await client(),s=await session();if(!c||!s)return;
  const user_id=s.user.id,now=new Date().toISOString();
  const{error:pErr}=await c.from('profiles').upsert({user_id,age:next.age||null,height_cm:next.height||null,sex_for_energy_formula:next.sex,activity_level:next.activity,training_days:next.trainingDays,session_minutes:next.minutes,step_goal:next.stepGoal,water_goal_l:next.waterGoal,updated_at:now});if(pErr)throw pErr;
  if(goalChanged){const{error:pauseErr}=await c.from('goals').update({status:'paused',updated_at:now}).eq('user_id',user_id).eq('status','active');if(pauseErr)throw pauseErr;const{error:gErr}=await c.from('goals').insert({user_id,start_weight_kg:next.currentWeight,target_weight_kg:next.targetWeight,target_date:next.targetDate,status:'active'});if(gErr)throw gErr}
}

function proposalHtml(old,next,r,np){
  const oldCal=np?.calories??'–',oldProtein=np?.protein??'–',rate=r.desiredRate.toFixed(2).replace('.',','),planned=r.projectedRate.toFixed(2).replace('.',',');
  return `<div class="sheet-inner"><div class="sheet-handle"></div><div class="sheet-head"><div><p class="eyebrow">Fitnest · Build ${BUILD}</p><h2>Plan neu abstimmen</h2></div><button data-v244-close>×</button></div>
  <div class="v244-goal-summary"><div><small>Neues Ziel</small><strong>${next.targetWeight} kg</strong><span>bis ${fmtDate(next.targetDate)}</span></div><div><small>Gewünschtes Tempo</small><strong>${rate} kg/Woche</strong><span>Planrahmen ca. ${planned} kg/Woche</span></div></div>
  ${r.tooAggressive?'<div class="notice caution"><strong>Ziel schneller als der konservative Planrahmen</strong><br>Fitnest senkt Kalorien nicht unter den berechneten Grundumsatz und erhöht Training nicht automatisch, nur um einen aggressiven Termin zu erzwingen.</div>':''}
  <section class="section"><div class="section-head"><h3>Ernährung</h3></div><div class="card v244-change-list"><div><span>Kalorien</span><strong>${oldCal} → ${r.calories??'–'} kcal</strong></div><div><span>Protein</span><strong>${oldProtein} → ${r.protein??'–'} g</strong></div><div><span>Essensrhythmus</span><strong>${np?`${np.mealsPerDay}× / Tag`:'kein Profil'}</strong></div></div></section>
  <section class="section"><div class="section-head"><h3>Training & Alltag</h3></div><div class="card v244-change-list"><div><span>Training</span><strong>${r.trainingDays} Tage · ${r.minutes} Min.</strong></div><div><span>Schrittziel</span><strong>${next.stepGoal} → ${r.stepGoal.toLocaleString('de-DE')}</strong></div></div><p class="v244-helper">Trainingstage werden durch eine Zieländerung nicht blind erhöht. RPE, Trainingsquote und Wochenreview steuern weiterhin die Belastungsprogression.</p></section>
  <div class="notice"><strong>Bleibt unverändert:</strong> Budget, Essenszeiten, Mahlzeitenanzahl, Ernährungsform, Allergien, Zöliakie-Einstellung, Abneigungen und bereits protokollierte Mahlzeiten/Workouts.</div>
  <div class="v244-actions"><button class="primary" data-v244-apply ${!np||!r.calories?'disabled':''}>Neue Planung übernehmen</button><button class="secondary" data-v244-goal-only>Nur Ziel speichern</button></div></div>`;
}

function showProposal(old,next,r){const d=document.getElementById('sheet'),c=document.getElementById('sheetContent'),np=activeNutritionProfile();c.innerHTML=proposalHtml(old,next,r,np);if(!d.open)d.showModal();c.querySelector('[data-v244-close]').onclick=()=>d.close();c.querySelector('[data-v244-goal-only]').onclick=()=>{write(REPLAN_KEY,{status:'goal_only',at:new Date().toISOString(),goal:{targetWeight:next.targetWeight,targetDate:next.targetDate},desiredRate:r.desiredRate});d.close();location.reload()};const apply=c.querySelector('[data-v244-apply]');if(apply)apply.onclick=()=>applyReplan(next,r,np)}

function profilePayload(p){return{diet:p.diet,allergies:p.allergies||[],dislikes:p.dislikes||[],glutenFreeCeliac:!!p.glutenFreeCeliac,calories:+p.calories,protein:+p.protein,pattern:p.pattern,mealsPerDay:+p.mealsPerDay,mealSchedule:p.schedule||[],budgetAmount:+p.budgetAmount||0,budgetPeriod:p.budgetPeriod||'week'}}
function mergeLoggedMeals(next,store,logs){const previous=store[next.date];if(!previous?.meals)return next;const dayLogs=logs[next.date]||{};return{...next,meals:next.meals.map(m=>dayLogs[m.slot]?(previous.meals.find(x=>x.slot===m.slot)||m):m)}}

async function generateChatGPTWeek(np){
  if(localStorage.getItem(RECIPE_CONSENT_KEY)!=='yes')return{generated:false,reason:'consent'};
  const s=await session();if(!s)return{generated:false,reason:'auth'};
  const r=await fetch(RECIPE_FN,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.access_token}`},body:JSON.stringify({mode:'generate',days:7,startDate:iso(),profile:profilePayload(np)})});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.message||j.code||`HTTP ${r.status}`);
  const store=read(PLAN_KEY,{}),logs=read(LOG_KEY,{}),saved=[];for(const raw of j.plans||[]){const next=mergeLoggedMeals({...raw,profileId:np.id,profileName:np.name,generatedAt:new Date().toISOString(),source:'openai',model:j.model},store,logs);store[next.date]=next;saved.push(next)}write(PLAN_KEY,store);
  const c=await client();if(c&&s){for(const plan of saved){const{error}=await c.from('meal_plans').upsert({user_id:s.user.id,plan_date:plan.date,meals:plan.meals,nutrition_profile_id:np.id},{onConflict:'user_id,plan_date'});if(error)console.warn('replan meal sync',error)}}
  return{generated:true};
}

async function applyReplan(next,r,np){if(busy)return;busy=true;const apply=document.querySelector('[data-v244-apply]');if(apply){apply.disabled=true;apply.textContent='Plan wird aktualisiert …'}try{
  const updatedCore={...next,stepGoal:r.stepGoal};write(PROFILE_KEY,updatedCore);
  const ps=nutritionProfiles(),idx=ps.findIndex(x=>x.id===np.id),updatedNutrition={...np,calories:r.calories,protein:r.protein,updatedAt:new Date().toISOString()};if(idx>=0)ps[idx]=updatedNutrition;write(NUTRITION_PROFILES_KEY,ps);
  const today=iso(),plans=read(PLAN_KEY,{}),logs=read(LOG_KEY,{});for(const date of Object.keys(plans)){if(date>today||(date===today&&!Object.keys(logs[today]||{}).length))delete plans[date]}write(PLAN_KEY,plans);
  const c=await client(),s=await session(),now=new Date().toISOString();if(c&&s){const u=s.user.id;
    const{error:pErr}=await c.from('profiles').update({step_goal:r.stepGoal,training_days:r.trainingDays,session_minutes:r.minutes,updated_at:now}).eq('user_id',u);if(pErr)throw pErr;
    const{error:nErr}=await c.from('nutrition_profiles').update({calories:r.calories,protein_g:r.protein,updated_at:now}).eq('user_id',u).eq('id',np.id);if(nErr)throw nErr;
    const{error:tErr}=await c.from('nutrition_targets').upsert({user_id:u,valid_from:today,calories:r.calories,protein_g:r.protein,source:'goal-replan-v2.4.4'},{onConflict:'user_id,valid_from'});if(tErr)throw tErr;
    const planMeta={source:'goal-replan-v2.4.4',goal:{currentWeight:next.currentWeight,targetWeight:next.targetWeight,targetDate:next.targetDate,desiredRateKgWeek:+r.desiredRate.toFixed(3),plannedRateKgWeek:+r.projectedRate.toFixed(3)},training:{days:r.trainingDays,sessionMinutes:r.minutes,stepGoal:r.stepGoal},nutrition:{calories:r.calories,proteinG:r.protein},updatedAt:now};
    const rows=[0,1].map(o=>({user_id:u,week_start:currentWeekStart(o),plan:planMeta,generation_version:'goal-replan-v2.4.4'}));const{error:wErr}=await c.from('workout_plans').upsert(rows,{onConflict:'user_id,week_start'});if(wErr)throw wErr;
    const{error:delFuture}=await c.from('meal_plans').delete().eq('user_id',u).gt('plan_date',today);if(delFuture)console.warn('future meal cleanup',delFuture);if(!Object.keys(logs[today]||{}).length){const{error:delToday}=await c.from('meal_plans').delete().eq('user_id',u).eq('plan_date',today);if(delToday)console.warn('today meal cleanup',delToday)}
  }
  let chatgpt={generated:false,reason:'not_attempted'};try{chatgpt=await generateChatGPTWeek(updatedNutrition)}catch(e){console.error('goal replan ChatGPT',e);chatgpt={generated:false,reason:'error',message:e.message}}
  write(REPLAN_KEY,{status:'applied',at:new Date().toISOString(),goal:{targetWeight:next.targetWeight,targetDate:next.targetDate},desiredRate:r.desiredRate,plannedRate:r.projectedRate,calories:r.calories,protein:r.protein,stepGoal:r.stepGoal,trainingDays:r.trainingDays,minutes:r.minutes,chatgptGenerated:!!chatgpt.generated});
  sessionStorage.setItem('fitnest.replan.justApplied',chatgpt.generated?'chatgpt':'pending');location.reload();
 }catch(e){console.error('apply replan',e);toast(`Plan konnte nicht vollständig aktualisiert werden: ${e.message}`);if(apply){apply.disabled=false;apply.textContent='Neue Planung übernehmen'}}finally{busy=false}}

async function onProfileSubmit(e){const form=e.currentTarget;if(form.dataset.v244Handling==='1')return;e.preventDefault();e.stopImmediatePropagation();form.dataset.v244Handling='1';const old=currentProfile(),next=profileFromForm(form),relevant=goalRelevantChanged(old,next),r=calculateReplan(next);const btn=form.querySelector('button[type="submit"]');if(btn){btn.disabled=true;btn.textContent='Ziel wird gespeichert …'}try{await saveCoreProfile(next,relevant);if(old&&relevant){showProposal(old,next,r)}else{write(REPLAN_KEY,{status:'saved',at:new Date().toISOString(),goal:{targetWeight:next.targetWeight,targetDate:next.targetDate}});location.reload()}}catch(err){console.error('goal save',err);toast(`Ziel konnte nicht synchronisiert werden: ${err.message}`);form.dataset.v244Handling='0';if(btn){btn.disabled=false;btn.textContent='Plan speichern'}}}

function enhanceGoalForm(){const form=document.getElementById('profileForm');if(!form||form.dataset.v244==='1')return;form.dataset.v244='1';const btn=form.querySelector('button[type="submit"]');if(btn&&currentProfile())btn.textContent='Ziel speichern & Pläne prüfen';form.addEventListener('submit',onProfileSubmit,true)}
function openGoalEditor(){document.getElementById('profileButton')?.click();setTimeout(()=>document.querySelector('[data-sheet-action="edit"]')?.click(),30)}

function enhanceProgress(){const app=document.getElementById('app'),title=document.getElementById('pageTitle');if(!app||title?.textContent!=='Fortschritt')return;const hero=app.querySelector('.progress22-hero,.hero');if(!hero||hero.querySelector('[data-v244-goal-edit]'))return;let actions=hero.querySelector('.hero-actions');if(!actions){actions=document.createElement('div');actions.className='hero-actions';hero.append(actions)}const b=document.createElement('button');b.className='secondary';b.dataset.v244GoalEdit='1';b.textContent='Abnehmziel ändern';b.onclick=openGoalEditor;actions.append(b)}
function enhancePlanContext(){const app=document.getElementById('app'),title=document.getElementById('pageTitle'),r=read(REPLAN_KEY,null);if(!app||title?.textContent!=='Training'||r?.status!=='applied'||app.querySelector('[data-v244-plan-context]'))return;const hero=app.querySelector('.hero'),sec=document.createElement('section');sec.className='section';sec.dataset.v244PlanContext='1';sec.innerHTML=`<div class="card v244-plan-context"><div><span class="eyebrow">Aktuelles Abnehmziel berücksichtigt</span><strong>${esc(r.trainingDays)} Trainingstage · ${esc(r.minutes)} Min. · ${Number(r.stepGoal||0).toLocaleString('de-DE')} Schritte</strong><small>Belastungssteigerungen bleiben an RPE und Wochen-Umsetzung gekoppelt.</small></div></div>`;hero?.after(sec)}
function enhanceTodayContext(){const app=document.getElementById('app'),title=document.getElementById('pageTitle'),r=read(REPLAN_KEY,null);if(!app||title?.textContent!=='Dein Tag'||r?.status!=='applied'||app.querySelector('[data-v244-today-context]'))return;const first=app.querySelector('.section'),sec=document.createElement('section');sec.className='section';sec.dataset.v244TodayContext='1';sec.innerHTML=`<div class="notice"><strong>Plan auf dein aktuelles Ziel abgestimmt</strong><br>${r.calories} kcal · ${r.protein} g Protein · ${Number(r.stepGoal||0).toLocaleString('de-DE')} Schritte. ${r.chatgptGenerated?'Der 7-Tage-Essensplan wurde mit ChatGPT neu erzeugt.':'Unter Essen kannst du den aktualisierten Plan mit ChatGPT erzeugen.'}</div>`;(first||app.firstElementChild)?.after(sec)}
function run(){enhanceGoalForm();enhanceProgress();enhancePlanContext();enhanceTodayContext()}

const sheet=document.getElementById('sheetContent'),app=document.getElementById('app'),title=document.getElementById('pageTitle');if(sheet)new MutationObserver(()=>queueMicrotask(enhanceGoalForm)).observe(sheet,{childList:true,subtree:true});if(app)new MutationObserver(()=>queueMicrotask(run)).observe(app,{childList:true,subtree:true});if(title)new MutationObserver(()=>queueMicrotask(run)).observe(title,{childList:true,subtree:true,characterData:true});document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>queueMicrotask(run)));
const applied=sessionStorage.getItem('fitnest.replan.justApplied');if(applied){sessionStorage.removeItem('fitnest.replan.justApplied');setTimeout(()=>toast(applied==='chatgpt'?'Ziel, Training und ChatGPT-Essensplan aktualisiert':'Ziel und Pläne aktualisiert · ChatGPT-Plan unter Essen starten'),250)}
run();
