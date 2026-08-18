import { CONFIG } from './config.js';
import { getSupabaseClient } from './app-supabase.js';

const BUILD='3.7';
const HEALTH_KEY='fitnest.healthDaily.v36';
const CONSENT_KEY='fitnest.coach.aiConsent.v37';
const CONSENT_VERSION='3.7-health-signals';
const COACH_FN=`${CONFIG.supabaseUrl}/functions/v1/coach-analysis`;
const DAY=86400000;
const state={remote:null,loading:false,aiLoading:false,lastInsight:null,source:'local'};

function read(key,fallback){try{const value=JSON.parse(localStorage.getItem(key));return value??fallback}catch{return fallback}}
function write(key,value){localStorage.setItem(key,JSON.stringify(value))}
function esc(value){return String(value??'').replace(/[&<>\"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[char]))}
function avg(values){return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null}
function numeric(value){const number=Number(value);return Number.isFinite(number)?number:null}
function recent(date,days){const time=new Date(date).getTime();return Number.isFinite(time)&&Date.now()-time<(days+1)*DAY}
function fmt(value,digits=1){return value==null?'–':Number(value).toLocaleString('de-DE',{maximumFractionDigits:digits})}
function toast(message){const node=document.getElementById('toast');if(!node)return;node.textContent=message;node.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),3200)}

function weightTrend(weights){
  const ordered=weights.filter(item=>numeric(item.value??item.weight_kg)!=null&&(item.date||item.measured_on)).map(item=>({date:item.date||item.measured_on,value:numeric(item.value??item.weight_kg)})).sort((a,b)=>a.date.localeCompare(b.date));
  if(ordered.length<2)return null;const first=ordered[0],last=ordered.at(-1),days=Math.max(1,(new Date(last.date)-new Date(first.date))/DAY);return Number(((last.value-first.value)/days*7).toFixed(2));
}

function combineHealth(local,remote){
  const map=new Map();
  for(const item of remote||[]){const date=item.checkin_date||item.date;if(!date)continue;map.set(date,{date,steps:numeric(item.steps),sleepHours:numeric(item.sleep_hours??item.sleepHours),waterL:numeric(item.water_l??item.waterL),energy:numeric(item.energy)});}
  for(const item of local||[]){if(!item.date)continue;const before=map.get(item.date)||{date:item.date};map.set(item.date,{...before,...Object.fromEntries(['steps','sleepHours','waterL','energy'].flatMap(key=>numeric(item[key])==null?[]:[[key,numeric(item[key])]]))});}
  return [...map.values()].filter(item=>recent(item.date,7)).sort((a,b)=>a.date.localeCompare(b.date));
}

function uniqueBy(items,key){const map=new Map();for(const item of items){const id=key(item);if(id)map.set(id,item)}return [...map.values()]}

function localInput(){
  const profile=read('fitnest.profile',{})||{},health=read(HEALTH_KEY,[])||[],workouts=(read('fitnest.workoutHistory',[])||[]).filter(item=>recent(item.completedAt||item.date,7)),weights=(read('fitnest.weights',[])||[]).filter(item=>recent(item.date,30));
  return{profile,health,workouts,weights};
}

export function analyzeSignals(input={}){
  const profile=input.profile||{},health=(input.health||[]).filter(item=>recent(item.date||item.checkin_date,7)),workouts=(input.workouts||[]).filter(item=>recent(item.completedAt||item.date||item.planned_date,7)),weights=input.weights||[];
  const sleep=health.map(item=>numeric(item.sleepHours??item.sleep_hours)).filter(value=>value!=null&&value>0),energy=health.map(item=>numeric(item.energy)).filter(value=>value!=null&&value>0),steps=health.map(item=>numeric(item.steps)).filter(value=>value!=null&&value>0),water=health.map(item=>numeric(item.waterL??item.water_l)).filter(value=>value!=null&&value>0),rpes=workouts.map(item=>numeric(item.rpe??item.perceived_effort)).filter(value=>value!=null&&value>0);
  const avgSleep=avg(sleep),avgEnergy=avg(energy),avgSteps=avg(steps),avgWater=avg(water),avgRpe=avg(rpes),lowSleepDays=sleep.filter(value=>value<6).length,lowEnergyDays=energy.filter(value=>value<=2).length,weightPerWeek=weightTrend(weights),healthDays=new Set(health.map(item=>item.date||item.checkin_date)).size,signalCount=[sleep.length,energy.length,steps.length,rpes.length].filter(Boolean).length;
  const stepGoal=numeric(profile.stepGoal??profile.step_goal),waterGoal=numeric(profile.waterGoal??profile.water_goal_l),stepsRatio=avgSteps&&stepGoal?avgSteps/stepGoal:null,waterRatio=avgWater&&waterGoal?avgWater/waterGoal:null;
  let level='unknown',status='Mehr Daten sammeln',summary='Mit einigen Tageswerten kann der Coach deine Belastung und Erholung besser einordnen.';
  const actions=[];
  if(weightPerWeek!=null&&weightPerWeek < -1){level='attention';status='Gewichtstrend prüfen';summary='Der aktuelle Gewichtstrend ist schneller als der sichere Orientierungswert von einem Kilogramm pro Woche.';actions.push('Den Gewichtsverlust nicht weiter beschleunigen und das Kalorienziel nicht automatisch senken.');}
  else if((sleep.length>=2&&avgSleep<6)||lowSleepDays>=2||(energy.length>=2&&avgEnergy<2.5)||lowEnergyDays>=2||(rpes.length>=2&&avgRpe>=8.5)){level='low';status='Erholung priorisieren';summary='Mehrere Signale sprechen für einen vorsichtigeren Trainingstag. Dein Plan bleibt trotzdem vollständig verfügbar.';actions.push('Wenn du dich müde fühlst, wähle heute eine kürzere oder leichtere Einheit.');}
  else if((sleep.length>=2&&avgSleep<7)||(energy.length>=2&&avgEnergy<3.5)||(rpes.length>=2&&avgRpe>=7.5)){level='moderate';status='Kontrolliert planen';summary='Einige Signale sind noch nicht vollständig erholt. Passe die Intensität an deine Tagesform an.';actions.push('Starte kontrolliert und entscheide nach dem Aufwärmen über die Intensität.');}
  else if(healthDays>=3&&signalCount>=2){level='stable';status='Stabile Signale';summary='Die verfügbaren Schlaf-, Energie- und Belastungswerte wirken insgesamt stabil.';actions.push('Der geplante Trainingsrhythmus passt. Eine kleine Steigerung bleibt optional.');}
  else actions.push('Schlaf und Energie an mehreren Tagen erfassen, um die Empfehlung zu verbessern.');
  if(stepsRatio!=null&&stepsRatio<.75)actions.push('Ein kurzer Spaziergang kann dein Schrittziel unterstützen. Er ist keine Pflicht für den Trainingstag.');
  if(waterRatio!=null&&waterRatio<.7)actions.push('Deine Flüssigkeitsmenge liegt unter deinem Ziel. Trinke über den Tag verteilt nach Durst.');
  if(!actions.some(action=>action.includes('Plan')))actions.push('Alle Trainings- und KI-Planfunktionen bleiben verfügbar. Diese Auswertung ist nur ein Hinweis.');
  const confidence=healthDays>=5&&signalCount>=3?'hoch':healthDays>=3&&signalCount>=2?'mittel':'niedrig';
  return{level,status,summary,advisory:'Hinweis, keine Sperre',blocking:false,actions:actions.slice(0,4),confidence,metrics:{healthDays,avgSleep:avgSleep==null?null:Number(avgSleep.toFixed(1)),lowSleepDays,avgEnergy:avgEnergy==null?null:Number(avgEnergy.toFixed(1)),lowEnergyDays,avgSteps:avgSteps==null?null:Math.round(avgSteps),stepsRatio:stepsRatio==null?null:Number(stepsRatio.toFixed(2)),avgWater:avgWater==null?null:Number(avgWater.toFixed(1)),workouts7:workouts.length,avgRpe:avgRpe==null?null:Number(avgRpe.toFixed(1)),weightPerWeek},signals:[{label:'Schlaf',value:avgSleep==null?'Noch keine Daten':`${fmt(avgSleep)} Stunden im Mittel`,tone:avgSleep!=null&&avgSleep<6?'low':avgSleep!=null&&avgSleep<7?'moderate':'stable'},{label:'Energie',value:avgEnergy==null?'Noch keine Daten':`${fmt(avgEnergy)} von 5 im Mittel`,tone:avgEnergy!=null&&avgEnergy<2.5?'low':avgEnergy!=null&&avgEnergy<3.5?'moderate':'stable'},{label:'Trainingslast',value:avgRpe==null?'Noch keine RPE Daten':`RPE ${fmt(avgRpe)} im Mittel`,tone:avgRpe!=null&&avgRpe>=8.5?'low':avgRpe!=null&&avgRpe>=7.5?'moderate':'stable'},{label:'Schritte',value:avgSteps==null?'Noch keine Daten':`${Math.round(avgSteps).toLocaleString('de-DE')} im Mittel`,tone:stepsRatio!=null&&stepsRatio<.75?'moderate':'stable'}]};
}

function currentAnalysis(){
  if(state.lastInsight)return state.lastInsight;const local=localInput(),remote=state.remote||{},workouts=uniqueBy([...(remote.workouts||[]),...local.workouts],item=>`${item.completedAt||item.date||item.planned_date}:${item.rpe??item.perceived_effort??''}`),weights=uniqueBy([...(remote.weights||[]),...local.weights],item=>item.date||item.measured_on);return analyzeSignals({profile:{...local.profile,...(remote.profile||{})},health:combineHealth(local.health,remote.checkins),workouts,weights});
}

function metric(label,value,detail=''){return`<div class="coach37-metric"><small>${esc(label)}</small><strong>${esc(value)}</strong>${detail?`<span>${esc(detail)}</span>`:''}</div>`}
function renderCoach(){
  const app=document.getElementById('app');if(!app)return;const insight=currentAnalysis(),m=insight.metrics||{},consent=read(CONSENT_KEY,false);document.querySelectorAll('.tab').forEach(button=>button.classList.toggle('active',button.dataset.view==='coach'));document.getElementById('pageTitle').textContent='Coach';app.dataset.coachBuild=BUILD;
  app.innerHTML=`<section class="hero coach37-hero tone-${esc(insight.level||'unknown')}"><span class="label">Coach 2.0 · Build ${BUILD}</span><div class="coach37-title"><div><h2>${esc(insight.status)}</h2><p>${esc(insight.summary)}</p></div><span class="coach37-advisory">${esc(insight.advisory||'Hinweis, keine Sperre')}</span></div><div class="hero-actions"><button class="primary" type="button" data-v37-refresh>${state.loading?'Wird aktualisiert …':'Analyse aktualisieren'}</button><button class="secondary" type="button" data-v37-details>Signale verstehen</button></div></section><section class="section"><div class="section-head"><div><span class="eyebrow">Empfehlung</span><h3>Heute sinnvoll</h3></div><span class="coach37-confidence">Datenlage ${esc(insight.confidence||'niedrig')}</span></div><div class="card coach-actions">${(insight.actions||[]).map((action,index)=>`<div class="coach-action"><span>${index+1}</span><strong>${esc(action)}</strong></div>`).join('')}</div></section><section class="section"><div class="section-head"><h3>Erholungssignale</h3><small>Letzte 7 Tage</small></div><div class="coach37-signals">${(insight.signals||[]).map(signal=>`<div class="coach37-signal tone-${esc(signal.tone||'unknown')}"><i></i><div><strong>${esc(signal.label)}</strong><small>${esc(signal.value)}</small></div></div>`).join('')}</div></section><section class="section"><div class="coach-metric-grid coach37-metrics">${metric('Schlaf',m.avgSleep==null?'–':`${fmt(m.avgSleep)} Std.`,`${m.lowSleepDays||0} kurze Nächte`)}${metric('Energie',m.avgEnergy==null?'–':`${fmt(m.avgEnergy)} / 5`,`${m.lowEnergyDays||0} niedrige Tage`)}${metric('Schritte',m.avgSteps==null?'–':Number(m.avgSteps).toLocaleString('de-DE'),'Tagesmittel')}${metric('Trainingslast',m.avgRpe==null?'–':`RPE ${fmt(m.avgRpe)}`,`${m.workouts7||0} Einheiten`)}${metric('Wasser',m.avgWater==null?'–':`${fmt(m.avgWater)} l`,'Tagesmittel')}${metric('Gewicht',m.weightPerWeek==null?'–':`${m.weightPerWeek>0?'+':''}${fmt(m.weightPerWeek,2)} kg`,'pro Woche')}</div></section><section class="section"><div class="card ai-coach-card coach37-ai"><div><span class="eyebrow">Optional</span><h3>KI-Auswertung</h3><p>${consent?'Die erweiterte Einwilligung für Schlaf, Energie, Schritte, Wasser, Gewicht und Trainingsdaten ist aktiv.':'Die Standardauswertung bleibt lokal. Gesundheitsdaten werden erst nach einer eigenen Einwilligung an die KI übertragen.'}</p>${state.source==='ai'?'<small class="coach37-source">Zuletzt mit KI aktualisiert</small>':''}</div><div class="coach37-ai-actions"><button class="secondary" type="button" data-v37-ai>${state.aiLoading?'Wird analysiert …':consent?'KI-Auswertung anfordern':'KI-Auswertung aktivieren'}</button>${consent?'<button class="ghost compact" type="button" data-v37-revoke>Einwilligung widerrufen</button>':''}</div></div></section><section class="section"><div class="notice"><strong>Du entscheidest</strong><span>Der Coach ändert weder Trainingspläne noch Kalorienziele automatisch. Auch bei niedriger Erholung bleiben alle Funktionen aktiv.</span></div></section>`;
  app.querySelector('[data-v37-refresh]').onclick=()=>void refreshCoach(true);app.querySelector('[data-v37-details]').onclick=()=>openDetails(insight);app.querySelector('[data-v37-ai]').onclick=()=>consent?void requestAiCoach():openConsent();app.querySelector('[data-v37-revoke]')?.addEventListener('click',()=>{write(CONSENT_KEY,false);state.lastInsight=null;state.source='local';renderCoach();toast('KI Einwilligung widerrufen. Die lokale Analyse bleibt aktiv.')});
}

function openDetails(insight){
  const sheet=document.getElementById('sheet'),content=document.getElementById('sheetContent');if(!sheet||!content)return;content.innerHTML=`<div class="sheet-inner v37-sheet"><div class="sheet-handle"></div><div class="sheet-head"><div><p class="eyebrow">Coach 2.0</p><h2>So entsteht der Hinweis</h2></div><button type="button" data-v37-close aria-label="Schließen">×</button></div><div class="v37-explain"><p>Fitnest betrachtet die letzten sieben Tage gemeinsam. Einzelne schlechte Werte lösen keine harte Entscheidung aus.</p>${(insight.signals||[]).map(signal=>`<div class="coach37-signal tone-${esc(signal.tone||'unknown')}"><i></i><div><strong>${esc(signal.label)}</strong><small>${esc(signal.value)}</small></div></div>`).join('')}<div class="notice"><strong>${esc(insight.advisory||'Hinweis, keine Sperre')}</strong><span>Du kannst Training und Pläne unabhängig von diesem Hinweis öffnen und erstellen.</span></div></div><button class="primary" type="button" data-v37-close>Verstanden</button></div>`;if(!sheet.open)sheet.showModal();content.querySelectorAll('[data-v37-close]').forEach(button=>button.onclick=()=>sheet.close());
}

function openConsent(){
  const sheet=document.getElementById('sheet'),content=document.getElementById('sheetContent');if(!sheet||!content)return;content.innerHTML=`<div class="sheet-inner v37-sheet"><div class="sheet-handle"></div><div class="sheet-head"><div><p class="eyebrow">Optionale KI-Auswertung</p><h2>Gesundheitsdaten freigeben</h2></div><button type="button" data-v37-close aria-label="Schließen">×</button></div><div class="legal"><p>Für die KI-Auswertung werden deine Schlaf-, Energie-, Schritt-, Wasser-, Gewichts-, Ziel- und Trainingsdaten serverseitig an OpenAI übertragen.</p><p>Die Freigabe gilt für Coach 2.0. Ohne sie bleibt die lokale regelbasierte Auswertung vollständig nutzbar.</p><p>Der Coach erstellt keine Diagnose und sperrt keine Funktion.</p></div><button class="primary" type="button" data-v37-consent>KI-Auswertung erlauben</button><button class="secondary" type="button" data-v37-close>Abbrechen</button></div>`;if(!sheet.open)sheet.showModal();content.querySelectorAll('[data-v37-close]').forEach(button=>button.onclick=()=>sheet.close());content.querySelector('[data-v37-consent]').onclick=()=>{write(CONSENT_KEY,true);sheet.close();void requestAiCoach()};
}

async function loadRemote(){
  const db=await getSupabaseClient();if(!db)return null;const session=(await db.auth.getSession()).data.session;if(!session?.user?.id)return null;const user=session.user.id,cutoff7=new Date(Date.now()-7*DAY).toISOString().slice(0,10),cutoff30=new Date(Date.now()-30*DAY).toISOString().slice(0,10);
  const [profile,checkins,workouts,weights]=await Promise.all([db.from('profiles').select('training_days,step_goal,water_goal_l').eq('user_id',user).maybeSingle(),db.from('daily_checkins').select('checkin_date,steps,water_l,sleep_hours,energy').eq('user_id',user).gte('checkin_date',cutoff7).order('checkin_date',{ascending:true}),db.from('workout_sessions').select('planned_date,perceived_effort,workout_type').eq('user_id',user).eq('completed',true).gte('planned_date',cutoff7).order('planned_date',{ascending:true}),db.from('body_metrics').select('measured_on,weight_kg').eq('user_id',user).gte('measured_on',cutoff30).order('measured_on',{ascending:true})]);
  for(const result of [profile,checkins,workouts,weights])if(result.error)throw result.error;return{profile:profile.data||{},checkins:checkins.data||[],workouts:workouts.data||[],weights:weights.data||[]};
}

async function refreshCoach(showToast=false){
  if(state.loading)return;state.loading=true;state.lastInsight=null;if(document.querySelector('.tab.active')?.dataset.view==='coach')renderCoach();try{state.remote=await loadRemote();if(showToast)toast(state.remote?'Coach mit Cloud Daten aktualisiert':'Lokale Coach Analyse aktualisiert')}catch(error){console.error('v37 coach sync',error);if(showToast)toast('Cloud Daten nicht verfügbar. Lokale Analyse bleibt aktiv.')}finally{state.loading=false;if(document.querySelector('.tab.active')?.dataset.view==='coach')renderCoach();updateTodayCard()}
}

async function requestAiCoach(){
  if(state.aiLoading)return;const db=await getSupabaseClient(),session=db?(await db.auth.getSession()).data.session:null;if(!session?.access_token){toast('Für die KI-Auswertung bitte zuerst anmelden.');return}state.aiLoading=true;renderCoach();try{const response=await fetch(COACH_FN,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({consent:true,consentVersion:CONSENT_VERSION})}),payload=await response.json();if(!response.ok)throw new Error(payload.message||payload.code||`HTTP ${response.status}`);state.lastInsight={...payload.insight,blocking:false,advisory:'Hinweis, keine Sperre'};state.source=payload.source||'rules';toast(state.source==='ai'?'KI-Auswertung aktualisiert':'Regelbasierte Auswertung aktualisiert')}catch(error){console.error('v37 ai coach',error);toast(`KI-Auswertung nicht verfügbar: ${error.message}`)}finally{state.aiLoading=false;renderCoach();updateTodayCard()}
}

function updateTodayCard(){
  if(document.querySelector('.tab.active')?.dataset.view!=='today')return;const app=document.getElementById('app'),hero=app?.querySelector('.hero');if(!hero)return;const insight=currentAnalysis(),signature=`${insight.status}:${insight.summary}`;let card=app.querySelector('.coach-brief-card');if(!card){card=document.createElement('section');card.className='section coach-brief-card';hero.insertAdjacentElement('afterend',card)}if(card.dataset.coachBuild===BUILD&&card.dataset.signature===signature)return;card.dataset.coachBuild=BUILD;card.dataset.signature=signature;card.innerHTML=`<div class="card coach-mini coach37-mini"><div><span class="eyebrow">Coach 2.0 · ${esc(insight.advisory)}</span><strong>${esc(insight.status)}</strong><small>${esc(insight.summary)}</small></div><button class="secondary compact" type="button" data-open-coach>Öffnen</button></div>`;card.querySelector('[data-open-coach]').onclick=()=>document.querySelector('.tab[data-view="coach"]')?.click();
}

function init(){
  document.querySelector('.tab[data-view="coach"]')?.addEventListener('click',()=>setTimeout(()=>{state.lastInsight=null;renderCoach();void refreshCoach(false)},0));document.addEventListener('fitnest:v36-health-saved',()=>{state.lastInsight=null;void refreshCoach(false)});document.addEventListener('fitnest:cloud-synced',()=>{state.lastInsight=null;void refreshCoach(false)});const app=document.getElementById('app');if(app)new MutationObserver(()=>queueMicrotask(updateTodayCard)).observe(app,{childList:true,subtree:false});setTimeout(()=>{updateTodayCard();void refreshCoach(false)},180);
}

if(typeof document!=='undefined')init();

export { combineHealth };
