import { getSupabaseClient } from './app-supabase.js';
import { exerciseImage } from './exercise-images.js';

const BUILD='3.3';
const UI_KEY='fitnest.workoutUi.v33';
const ADHERENCE_KEY='fitnest.dailyAdherence.v28';
const TRAINING_PLAN_KEY='fitnest.ai.trainingPlan.v26';
const DEFAULT_REST_SECONDS=60;
let bridge=null;
let ui={draftId:'',exerciseIndex:0,setIndex:0,phase:'set',restEndsAt:0,difficulty:3,energy:3};
let timer=null;

const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}};
const esc=(value='')=>String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const iso=(date=new Date())=>{const value=new Date(date);value.setMinutes(value.getMinutes()-value.getTimezoneOffset());return value.toISOString().slice(0,10)};
const dayIndex=date=>(new Date(`${date}T12:00:00`).getDay()+6)%7;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function saveUi(){write(UI_KEY,ui)}
function clearTimer(){if(timer){clearInterval(timer);timer=null}}
function draft(){return bridge?.draft||null}
function exercises(){return draft()?.exercises||[]}
function currentItem(){return exercises()[clamp(ui.exerciseIndex,0,Math.max(0,exercises().length-1))]||null}
function currentSet(){const item=currentItem();return item?.sets?.[clamp(ui.setIndex,0,Math.max(0,(item?.sets?.length||1)-1))]||null}
function exercise(item=currentItem()){return item?bridge?.exercise?.(item.exerciseId):null}
function activeSets(){return exercises().flatMap(item=>item.skipped?[]:item.sets||[])}
function completedCount(){return activeSets().filter(set=>set.completed).length}
function totalCount(){return activeSets().length}
function averageRpe(){const values=activeSets().filter(set=>set.completed).map(set=>Number(set.effort||0)).filter(Boolean);return values.length?Math.round(values.reduce((sum,value)=>sum+value,0)/values.length*10)/10:0}
function incompleteCount(){return Math.max(0,totalCount()-completedCount())}
function progress(){return totalCount()?Math.round(completedCount()/totalCount()*100):0}
function image(ex){const src=exerciseImage(ex?.id);return src?`<img src="${src}" alt="${esc(ex?.name)}: Start und Zielposition" decoding="async">`:bridge?.visual?.(ex,true)||''}
function formatClock(seconds){const safe=Math.max(0,Math.ceil(seconds));return`${String(Math.floor(safe/60)).padStart(2,'0')}:${String(safe%60).padStart(2,'0')}`}
function nextPosition(){
  const list=exercises();
  for(let exerciseIndex=ui.exerciseIndex;exerciseIndex<list.length;exerciseIndex++){
    const item=list[exerciseIndex];
    if(item.skipped)continue;
    const start=exerciseIndex===ui.exerciseIndex?ui.setIndex+1:0;
    for(let setIndex=start;setIndex<(item.sets||[]).length;setIndex++)if(!item.sets[setIndex].completed)return{exerciseIndex,setIndex};
  }
  for(let exerciseIndex=0;exerciseIndex<list.length;exerciseIndex++){
    const item=list[exerciseIndex];
    if(item.skipped)continue;
    for(let setIndex=0;setIndex<(item.sets||[]).length;setIndex++)if(!item.sets[setIndex].completed)return{exerciseIndex,setIndex};
  }
  return null;
}
function firstOpenPosition(){
  for(let exerciseIndex=0;exerciseIndex<exercises().length;exerciseIndex++){
    const item=exercises()[exerciseIndex];
    if(item.skipped)continue;
    const setIndex=(item.sets||[]).findIndex(set=>!set.completed);
    if(setIndex>=0)return{exerciseIndex,setIndex};
  }
  return{exerciseIndex:0,setIndex:0};
}
function ensurePosition(){
  if(!exercises().length)return;
  ui.exerciseIndex=clamp(Number(ui.exerciseIndex)||0,0,exercises().length-1);
  const item=currentItem();
  ui.setIndex=clamp(Number(ui.setIndex)||0,0,Math.max(0,(item?.sets?.length||1)-1));
  if(item?.skipped){const next=nextPosition()||firstOpenPosition();ui.exerciseIndex=next.exerciseIndex;ui.setIndex=next.setIndex}
}

function open(nextBridge){
  if(!nextBridge?.draft)return false;
  bridge=nextBridge;
  const stored=read(UI_KEY,{});
  if(stored.draftId===draft().id)ui={...ui,...stored};
  else ui={draftId:draft().id,...firstOpenPosition(),phase:'set',restEndsAt:0,difficulty:3,energy:3};
  ensurePosition();
  saveUi();
  render();
  return true;
}

function header(){
  const paused=Boolean(draft()?.pausedAt);
  return`<div class="v33-head">
    <div><span class="eyebrow">Geführtes Training · Build ${BUILD}</span><h2>${esc(draft()?.title||'Training')}</h2><small>${bridge.durationMinutes()} Min. · ${completedCount()} von ${totalCount()} Sätzen</small></div>
    <button type="button" class="v33-close" data-v33-exit aria-label="Training schließen">×</button>
  </div>
  <div class="v33-progress" aria-label="${progress()} Prozent abgeschlossen"><i style="width:${progress()}%"></i></div>
  ${paused?'<div class="v33-paused"><strong>Training pausiert</strong><span>Dein Fortschritt bleibt gespeichert.</span><button class="primary" type="button" data-v33-action="resume">Training fortsetzen</button></div>':''}`;
}

function setView(){
  const item=currentItem(),ex=exercise(item),set=currentSet();
  if(!item||!ex||!set)return emptyView();
  const unit=ex.unit==='seconds'?'Sekunden':'Wiederholungen';
  return`${header()}<main class="v33-main ${draft()?.pausedAt?'is-paused':''}">
    <div class="v33-position"><span>Übung ${ui.exerciseIndex+1} von ${exercises().length}</span><span>Satz ${ui.setIndex+1} von ${item.sets.length}</span></div>
    <div class="v33-visual">${image(ex)}</div>
    <section class="v33-copy"><small>${esc(ex.group||'Ganzkörper')}</small><h3>${esc(ex.name)}</h3><p>${esc(ex.reps||'Kontrolliert ausführen')}</p></section>
    <section class="v33-set-card">
      <label>${unit}<div class="v33-stepper"><button type="button" data-v33-adjust="value:-1" aria-label="Wert reduzieren">−</button><input data-v33-value type="number" inputmode="numeric" min="0" max="${ex.unit==='seconds'?600:200}" value="${Number(set.value)||0}"><button type="button" data-v33-adjust="value:1" aria-label="Wert erhöhen">＋</button></div></label>
      <label>Belastung RPE<div class="v33-stepper"><button type="button" data-v33-adjust="effort:-1" aria-label="RPE reduzieren">−</button><output data-v33-rpe>${Number(set.effort)||7}</output><button type="button" data-v33-adjust="effort:1" aria-label="RPE erhöhen">＋</button></div></label>
    </section>
    <details class="v33-instructions"><summary>Ausführung anzeigen</summary><ol>${(ex.steps||[]).map(step=>`<li>${esc(step)}</li>`).join('')}</ol></details>
    <div class="v33-primary-actions"><button type="button" class="primary" data-v33-complete>${set.completed?'Weiter':'Satz abschließen'}</button></div>
    <div class="v33-secondary-actions"><button type="button" class="ghost" data-v33-replace>Übung ersetzen</button><button type="button" class="ghost" data-v33-skip>Übung überspringen</button><button type="button" class="ghost" data-v33-overview>Training abschließen</button></div>
    <div class="v33-footer-actions"><button type="button" class="secondary" data-v33-action="pause">Pausieren</button><button type="button" class="secondary" data-v33-exit>Speichern und schließen</button></div>
  </main>`;
}

function restView(){
  const next=nextPosition();
  if(!next)return feedbackView();
  const nextItem=exercises()[next.exerciseIndex],nextExercise=exercise(nextItem);
  const remaining=(Number(ui.restEndsAt)||Date.now())-Date.now();
  return`${header()}<main class="v33-main v33-rest ${draft()?.pausedAt?'is-paused':''}">
    <span class="eyebrow">Satz gespeichert</span><h3>Kurze Pause</h3><div class="v33-rest-clock" data-v33-rest-clock>${formatClock(remaining/1000)}</div>
    <p>Als Nächstes: <strong>${esc(nextExercise?.name||'Nächster Satz')}</strong> · Satz ${next.setIndex+1}</p>
    <div class="v33-primary-actions"><button type="button" class="primary" data-v33-rest-skip>Pause überspringen</button><button type="button" class="secondary" data-v33-rest-add>30 Sekunden hinzufügen</button></div>
    <div class="v33-footer-actions"><button type="button" class="secondary" data-v33-action="pause">Pausieren</button><button type="button" class="secondary" data-v33-exit>Speichern und schließen</button></div>
  </main>`;
}

function feedbackView(){
  const incomplete=incompleteCount();
  return`${header()}<main class="v33-main v33-feedback">
    <span class="eyebrow">Einheit abschließen</span><h3>Wie war dein Training?</h3>
    <div class="v33-summary-grid"><div><small>Dauer</small><strong>${bridge.durationMinutes()} Min.</strong></div><div><small>Sätze</small><strong>${completedCount()} / ${totalCount()}</strong></div><div><small>Ø RPE</small><strong>${averageRpe()||'–'}</strong></div><div><small>Übersprungen</small><strong>${exercises().filter(item=>item.skipped).length}</strong></div></div>
    ${incomplete?`<div class="v33-notice"><strong>${incomplete} Sätze sind noch offen.</strong><span>Du kannst das Training trotzdem abschließen. Die offenen Sätze werden nicht als erledigt gespeichert.</span><button type="button" class="ghost" data-v33-back-open>Offene Sätze ansehen</button></div>`:''}
    <label>Schwierigkeit<select data-v33-difficulty>${[[1,'sehr leicht'],[2,'leicht'],[3,'passend'],[4,'schwer'],[5,'sehr schwer']].map(([value,label])=>`<option value="${value}" ${Number(ui.difficulty)===value?'selected':''}>${value} · ${label}</option>`).join('')}</select></label>
    <label>Energie danach<select data-v33-energy>${[[1,'erschöpft'],[2,'wenig Energie'],[3,'neutral'],[4,'gut'],[5,'sehr gut']].map(([value,label])=>`<option value="${value}" ${Number(ui.energy)===value?'selected':''}>${value} · ${label}</option>`).join('')}</select></label>
    <button type="button" class="primary" data-v33-finish>Training speichern</button>
    <button type="button" class="secondary" data-v33-back-set>Zurück zum Training</button>
  </main>`;
}

function emptyView(){return`${header()}<main class="v33-main"><div class="v33-notice"><strong>Keine Übungen gefunden.</strong><span>Schließe die Einheit und öffne deinen Trainingsplan erneut.</span></div><button type="button" class="secondary" data-v33-exit>Schließen</button></main>`}

function render(){
  clearTimer();
  bridge.sheet(ui.phase==='rest'?restView():ui.phase==='feedback'?feedbackView():setView());
  bind();
  if(ui.phase==='rest')startTimer();
}

function bind(){
  const root=document.getElementById('sheetContent');if(!root)return;
  root.querySelectorAll('[data-v33-exit]').forEach(button=>button.onclick=()=>{clearTimer();saveUi();bridge.close();bridge.toast('Training gespeichert und pausierbar')});
  root.querySelectorAll('[data-v33-action]').forEach(button=>button.onclick=()=>bridge.action(button.dataset.v33Action));
  root.querySelector('[data-v33-value]')?.addEventListener('change',event=>{const ex=exercise(),max=ex?.unit==='seconds'?600:200;currentSet().value=clamp(Number(event.currentTarget.value)||0,0,max);bridge.persist();render()});
  root.querySelectorAll('[data-v33-adjust]').forEach(button=>button.onclick=()=>adjust(button.dataset.v33Adjust));
  root.querySelector('[data-v33-complete]')?.addEventListener('click',completeSet);
  root.querySelector('[data-v33-replace]')?.addEventListener('click',()=>bridge.replace(currentItem().exerciseId));
  root.querySelector('[data-v33-skip]')?.addEventListener('click',skipExercise);
  root.querySelector('[data-v33-overview]')?.addEventListener('click',()=>{ui.phase='feedback';saveUi();render()});
  root.querySelector('[data-v33-rest-skip]')?.addEventListener('click',finishRest);
  root.querySelector('[data-v33-rest-add]')?.addEventListener('click',()=>{ui.restEndsAt=Math.max(Date.now(),Number(ui.restEndsAt)||0)+30000;saveUi();updateTimer()});
  root.querySelector('[data-v33-back-open]')?.addEventListener('click',()=>{const next=firstOpenPosition();ui={...ui,...next,phase:'set'};saveUi();render()});
  root.querySelector('[data-v33-back-set]')?.addEventListener('click',()=>{ui.phase='set';saveUi();render()});
  root.querySelector('[data-v33-difficulty]')?.addEventListener('change',event=>{ui.difficulty=Number(event.currentTarget.value)||3;saveUi()});
  root.querySelector('[data-v33-energy]')?.addEventListener('change',event=>{ui.energy=Number(event.currentTarget.value)||3;saveUi()});
  root.querySelector('[data-v33-finish]')?.addEventListener('click',finishWorkout);
}

function adjust(spec){
  const[field,rawDelta]=String(spec).split(':'),delta=Number(rawDelta)||0,set=currentSet(),ex=exercise();if(!set)return;
  if(field==='value')set.value=clamp((Number(set.value)||0)+delta,0,ex?.unit==='seconds'?600:200);
  if(field==='effort')set.effort=clamp((Number(set.effort)||7)+delta,1,10);
  bridge.persist();render();
}
function completeSet(){
  const set=currentSet();if(!set)return;
  set.completed=true;bridge.persist();
  const next=nextPosition();
  if(!next){ui.phase='feedback';ui.restEndsAt=0;saveUi();render();return}
  ui.phase='rest';ui.restEndsAt=Date.now()+DEFAULT_REST_SECONDS*1000;saveUi();render();
}
function skipExercise(){
  const item=currentItem();if(!item)return;
  item.skipped=true;bridge.persist();
  const next=nextPosition();
  if(!next){ui.phase='feedback'}else{ui.exerciseIndex=next.exerciseIndex;ui.setIndex=next.setIndex;ui.phase='set'}
  saveUi();render();
}
function finishRest(){
  const next=nextPosition();
  ui.restEndsAt=0;
  if(!next)ui.phase='feedback';
  else{ui.exerciseIndex=next.exerciseIndex;ui.setIndex=next.setIndex;ui.phase='set'}
  saveUi();render();
}
function updateTimer(){
  const remaining=(Number(ui.restEndsAt)||0)-Date.now(),node=document.querySelector('[data-v33-rest-clock]');
  if(node)node.textContent=formatClock(remaining/1000);
  if(remaining<=0)finishRest();
}
function startTimer(){updateTimer();if(ui.phase==='rest')timer=setInterval(updateTimer,250)}

function plannedTraining(date){
  const plan=read(TRAINING_PLAN_KEY,null);
  return(plan?.sessions||[]).find(session=>Number(session.dayIndex)===dayIndex(date))||null;
}
async function saveAdherence(snapshot){
  const session=window.__fitnestV27?.session;
  const planned=plannedTraining(snapshot.date);
  const itemKey=`training_${planned?.dayIndex??dayIndex(snapshot.date)}`;
  const localUser=session?.user?.id||'local',key=`${snapshot.date}|training|${itemKey}`;
  const localStoreKey=`${ADHERENCE_KEY}.${localUser}`;
  const store=read(localStoreKey,{}),value={
    activity_date:snapshot.date,item_type:'training',item_key:itemKey,status:'completed',replacement_text:null,
    difficulty:Number(ui.difficulty)||3,energy:Number(ui.energy)||3,
    metadata:{title:snapshot.title,minutes:snapshot.duration,completedSets:snapshot.completedSets,totalSets:snapshot.totalSets,averageRpe:snapshot.averageRpe,build:BUILD},
    updated_at:new Date().toISOString()
  };
  store[key]=value;write(localStoreKey,store);
  document.dispatchEvent(new CustomEvent('fitnest:v28-adherence-saved',{detail:value}));
  if(!session?.user?.id)return;
  const db=await getSupabaseClient();
  const result=await db.from('daily_adherence').upsert({...value,user_id:session.user.id},{onConflict:'user_id,activity_date,item_type,item_key'});
  if(result.error)throw result.error;
}
async function finishWorkout(){
  const button=document.querySelector('[data-v33-finish]');if(button?.disabled)return;
  if(button){button.disabled=true;button.textContent='Training wird gespeichert …'}
  const snapshot={date:draft().date,title:draft().title,duration:bridge.durationMinutes(),completedSets:completedCount(),totalSets:totalCount(),averageRpe:averageRpe(),skipped:exercises().filter(item=>item.skipped).length};
  try{
    clearTimer();
    await bridge.finish();
    await saveAdherence(snapshot);
    localStorage.removeItem(UI_KEY);
    showSummary(snapshot);
  }catch(error){
    console.error('v33 workout finish',error);
    bridge.toast('Training lokal gespeichert. Cloud Sync folgt später.');
    localStorage.removeItem(UI_KEY);
    showSummary(snapshot,true);
  }
}
function showSummary(snapshot,localOnly=false){
  document.querySelector('[data-v33-summary]')?.remove();
  const overlay=document.createElement('div');overlay.className='v33-summary-backdrop';overlay.dataset.v33Summary='1';
  overlay.innerHTML=`<section class="v33-summary-dialog"><span class="eyebrow">Training abgeschlossen</span><h2>${esc(snapshot.title)}</h2><p>${localOnly?'Die Einheit ist lokal gespeichert. Der Cloud Sync wird beim nächsten App Start erneut versucht.':'Deine Einheit und dein Feedback wurden gespeichert.'}</p><div class="v33-summary-grid"><div><small>Dauer</small><strong>${snapshot.duration} Min.</strong></div><div><small>Sätze</small><strong>${snapshot.completedSets} / ${snapshot.totalSets}</strong></div><div><small>Ø RPE</small><strong>${snapshot.averageRpe||'–'}</strong></div><div><small>Energie</small><strong>${ui.energy} / 5</strong></div></div><button type="button" class="primary" data-v33-summary-close>Fortschritt ansehen</button></section>`;
  document.body.append(overlay);
  overlay.querySelector('[data-v33-summary-close]').onclick=()=>overlay.remove();
}

window.__fitnestV33Workout={open};
