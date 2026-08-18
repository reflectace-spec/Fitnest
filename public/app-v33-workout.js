import { getSupabaseClient } from './app-supabase.js';
import { exerciseImage } from './exercise-images.js';

const BUILD='3.3';
const DRAFT_KEY='fitnest.workoutDraft';
const HISTORY_KEY='fitnest.workoutHistory';
const COMPLETED_KEY='fitnest.completed';
const UI_KEY='fitnest.workoutUi.v33';
const ADHERENCE_KEY='fitnest.dailyAdherence.v28';
const TRAINING_PLAN_KEY='fitnest.ai.trainingPlan.v26';
const CATALOG_KEY='fitnest.exerciseCatalog.v251';
const SUMMARY_KEY='fitnest.v33.summary';
const DEFAULT_REST_SECONDS=60;
const TIMED_IDS=new Set(['plank','mountain','jumping-jack','wall-sit','side-plank','high-knees','bear-crawl','march-in-place']);
const NAMES={squat:'Kniebeugen',pushup:'Liegestütze','reverse-lunge':'Rückwärts-Ausfallschritte','glute-bridge':'Glute Bridge','bird-dog':'Bird Dog',deadbug:'Dead Bug',plank:'Unterarmstütz',mountain:'Mountain Climbers','jumping-jack':'Jumping Jacks'};
const ALTERNATIVES={squat:['glute-bridge','wall-sit'],pushup:['plank','pike-pushup'],'reverse-lunge':['squat','split-squat'],'glute-bridge':['bird-dog','deadbug'],'bird-dog':['deadbug','superman'],deadbug:['bird-dog','hollow-hold'],plank:['bird-dog','side-plank'],mountain:['jumping-jack','high-knees'],'jumping-jack':['mountain','march-in-place']};
let workout=null;
let ui={draftId:'',exerciseIndex:0,setIndex:0,phase:'set',restEndsAt:0,restRemainingMs:0,difficulty:3,energy:3};
let timer=null;
let renderQueued=false;

const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}};
const esc=(value='')=>String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const dayIndex=date=>(new Date(`${date}T12:00:00`).getDay()+6)%7;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const copy=value=>JSON.parse(JSON.stringify(value));

function toast(message){const node=document.getElementById('toast');if(!node)return;node.textContent=message;node.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),3000)}
function saveUi(){write(UI_KEY,ui)}
function persist(){write(DRAFT_KEY,workout)}
function clearTimer(){if(timer){clearInterval(timer);timer=null}}
function exercises(){return workout?.exercises||[]}
function currentItem(){return exercises()[clamp(ui.exerciseIndex,0,Math.max(0,exercises().length-1))]||null}
function currentSet(){const item=currentItem();return item?.sets?.[clamp(ui.setIndex,0,Math.max(0,(item?.sets?.length||1)-1))]||null}
function catalog(){return read(CATALOG_KEY,[])}
function exercise(item=currentItem()){
  if(!item)return null;
  const row=catalog().find(value=>value.id===item.exerciseId)||{};
  return{id:item.exerciseId,name:row.name||NAMES[item.exerciseId]||item.exerciseId,group:(row.muscle_groups||[]).join(' · ')||'Ganzkörper',steps:Array.isArray(row.instructions)?row.instructions:[],unit:TIMED_IDS.has(item.exerciseId)?'seconds':'reps',reps:TIMED_IDS.has(item.exerciseId)?`${Number(item.sets?.[0]?.value)||30} Sek.`:`${Number(item.sets?.[0]?.value)||10} Wiederholungen`};
}
function activeSets(){return exercises().flatMap(item=>item.skipped?[]:item.sets||[])}
function completedCount(){return activeSets().filter(set=>set.completed).length}
function totalCount(){return activeSets().length}
function averageRpe(){const values=activeSets().filter(set=>set.completed).map(set=>Number(set.effort||0)).filter(Boolean);return values.length?Math.round(values.reduce((sum,value)=>sum+value,0)/values.length*10)/10:0}
function incompleteCount(){return Math.max(0,totalCount()-completedCount())}
function progress(){return totalCount()?Math.round(completedCount()/totalCount()*100):0}
function durationMinutes(){
  if(!workout?.startedAt)return 1;
  const now=Date.now(),started=new Date(workout.startedAt).getTime(),activePause=workout.pausedAt?now-new Date(workout.pausedAt).getTime():0;
  return Math.max(1,Math.round((now-started-(workout.totalPausedMs||0)-activePause)/60000));
}
function image(ex){const src=exerciseImage(ex?.id);return src?`<img src="${src}" alt="${esc(ex?.name)}: Start und Zielposition" decoding="async">`:`<div class="v33-image-fallback"><strong>${esc(ex?.name)}</strong><span>Bewegung kontrolliert ausführen</span></div>`}
function formatClock(seconds){const safe=Math.max(0,Math.ceil(seconds));return`${String(Math.floor(safe/60)).padStart(2,'0')}:${String(safe%60).padStart(2,'0')}`}
function nextPosition(){
  const list=exercises();
  for(let exerciseIndex=ui.exerciseIndex;exerciseIndex<list.length;exerciseIndex++){
    const item=list[exerciseIndex];if(item.skipped)continue;
    const start=exerciseIndex===ui.exerciseIndex?ui.setIndex+1:0;
    for(let setIndex=start;setIndex<(item.sets||[]).length;setIndex++)if(!item.sets[setIndex].completed)return{exerciseIndex,setIndex};
  }
  for(let exerciseIndex=0;exerciseIndex<list.length;exerciseIndex++){
    const item=list[exerciseIndex];if(item.skipped)continue;
    for(let setIndex=0;setIndex<(item.sets||[]).length;setIndex++)if(!item.sets[setIndex].completed)return{exerciseIndex,setIndex};
  }
  return null;
}
function firstOpenPosition(){
  for(let exerciseIndex=0;exerciseIndex<exercises().length;exerciseIndex++){
    const item=exercises()[exerciseIndex];if(item.skipped)continue;
    const setIndex=(item.sets||[]).findIndex(set=>!set.completed);if(setIndex>=0)return{exerciseIndex,setIndex};
  }
  return{exerciseIndex:0,setIndex:0};
}
function ensurePosition(){
  if(!exercises().length)return;
  ui.exerciseIndex=clamp(Number(ui.exerciseIndex)||0,0,exercises().length-1);
  const item=currentItem();ui.setIndex=clamp(Number(ui.setIndex)||0,0,Math.max(0,(item?.sets?.length||1)-1));
  if(item?.skipped){const next=nextPosition()||firstOpenPosition();ui.exerciseIndex=next.exerciseIndex;ui.setIndex=next.setIndex}
}

function open(draft=read(DRAFT_KEY,null)){
  if(!draft?.id||!Array.isArray(draft.exercises))return false;
  workout=draft;
  const stored=read(UI_KEY,{});
  if(stored.draftId===workout.id)ui={...ui,...stored};
  else ui={draftId:workout.id,...firstOpenPosition(),phase:'set',restEndsAt:0,restRemainingMs:0,difficulty:3,energy:3};
  ensurePosition();saveUi();render();return true;
}
function shell(content){
  const root=document.getElementById('sheetContent'),dialog=document.getElementById('sheet');if(!root||!dialog)return;
  root.innerHTML=`<div class="sheet-inner">${content}</div>`;
  if(!dialog.open)dialog.showModal();
}
function close(){clearTimer();saveUi();const dialog=document.getElementById('sheet');if(dialog?.open)dialog.close();toast('Training gespeichert und pausierbar')}

function header(){
  const paused=Boolean(workout?.pausedAt);
  return`<div class="v33-head"><div><span class="eyebrow">Geführtes Training · Build ${BUILD}</span><h2>${esc(workout?.title||'Training')}</h2><small>${durationMinutes()} Min. · ${completedCount()} von ${totalCount()} Sätzen</small></div><button type="button" class="v33-close" data-v33-exit aria-label="Training schließen">×</button></div><div class="v33-progress" aria-label="${progress()} Prozent abgeschlossen"><i style="width:${progress()}%"></i></div>${paused?'<div class="v33-paused"><strong>Training pausiert</strong><span>Dein Fortschritt bleibt gespeichert.</span><button class="primary" type="button" data-v33-action="resume">Training fortsetzen</button></div>':''}`;
}
function setView(){
  const item=currentItem(),ex=exercise(item),set=currentSet();if(!item||!ex||!set)return emptyView();
  const unit=ex.unit==='seconds'?'Sekunden':'Wiederholungen';
  return`${header()}<main class="v33-main ${workout?.pausedAt?'is-paused':''}"><div class="v33-position"><span>Übung ${ui.exerciseIndex+1} von ${exercises().length}</span><span>Satz ${ui.setIndex+1} von ${item.sets.length}</span></div><div class="v33-visual">${image(ex)}</div><section class="v33-copy"><small>${esc(ex.group)}</small><h3>${esc(ex.name)}</h3><p>${esc(ex.reps)}</p></section><section class="v33-set-card"><label>${unit}<div class="v33-stepper"><button type="button" data-v33-adjust="value:-1" aria-label="Wert reduzieren">−</button><input data-v33-value type="number" inputmode="numeric" min="0" max="${ex.unit==='seconds'?600:200}" value="${Number(set.value)||0}"><button type="button" data-v33-adjust="value:1" aria-label="Wert erhöhen">＋</button></div></label><label>Belastung RPE<div class="v33-stepper"><button type="button" data-v33-adjust="effort:-1" aria-label="RPE reduzieren">−</button><output>${Number(set.effort)||7}</output><button type="button" data-v33-adjust="effort:1" aria-label="RPE erhöhen">＋</button></div></label></section><details class="v33-instructions"><summary>Ausführung anzeigen</summary>${ex.steps.length?`<ol>${ex.steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol>`:'<p>Bewegung langsam, stabil und schmerzfrei ausführen.</p>'}</details><div class="v33-primary-actions"><button type="button" class="primary" data-v33-complete>${set.completed?'Weiter':'Satz abschließen'}</button></div><div class="v33-secondary-actions"><button type="button" class="ghost" data-v33-replace>Übung ersetzen</button><button type="button" class="ghost" data-v33-skip>Übung überspringen</button><button type="button" class="ghost" data-v33-overview>Training abschließen</button></div><div class="v33-footer-actions"><button type="button" class="secondary" data-v33-action="pause">Pausieren</button><button type="button" class="secondary" data-v33-exit>Speichern und schließen</button></div></main>`;
}
function restView(){
  const next=nextPosition();if(!next)return feedbackView();
  const nextExercise=exercise(exercises()[next.exerciseIndex]);
  const remaining=workout?.pausedAt?Number(ui.restRemainingMs)||0:(Number(ui.restEndsAt)||Date.now())-Date.now();
  return`${header()}<main class="v33-main v33-rest ${workout?.pausedAt?'is-paused':''}"><span class="eyebrow">Satz gespeichert</span><h3>Kurze Pause</h3><div class="v33-rest-clock" data-v33-rest-clock>${formatClock(remaining/1000)}</div><p>Als Nächstes: <strong>${esc(nextExercise?.name||'Nächster Satz')}</strong> · Satz ${next.setIndex+1}</p><div class="v33-primary-actions"><button type="button" class="primary" data-v33-rest-skip>Pause überspringen</button><button type="button" class="secondary" data-v33-rest-add>30 Sekunden hinzufügen</button></div><div class="v33-footer-actions"><button type="button" class="secondary" data-v33-action="pause">Pausieren</button><button type="button" class="secondary" data-v33-exit>Speichern und schließen</button></div></main>`;
}
function feedbackView(){
  const incomplete=incompleteCount();
  return`${header()}<main class="v33-main v33-feedback"><span class="eyebrow">Einheit abschließen</span><h3>Wie war dein Training?</h3><div class="v33-summary-grid"><div><small>Dauer</small><strong>${durationMinutes()} Min.</strong></div><div><small>Sätze</small><strong>${completedCount()} / ${totalCount()}</strong></div><div><small>Ø RPE</small><strong>${averageRpe()||'–'}</strong></div><div><small>Übersprungen</small><strong>${exercises().filter(item=>item.skipped).length}</strong></div></div>${incomplete?`<div class="v33-notice"><strong>${incomplete} Sätze sind noch offen.</strong><span>Du kannst das Training trotzdem abschließen. Die offenen Sätze werden nicht als erledigt gespeichert.</span><button type="button" class="ghost" data-v33-back-open>Offene Sätze ansehen</button></div>`:''}<label>Schwierigkeit<select data-v33-difficulty>${[[1,'sehr leicht'],[2,'leicht'],[3,'passend'],[4,'schwer'],[5,'sehr schwer']].map(([value,label])=>`<option value="${value}" ${Number(ui.difficulty)===value?'selected':''}>${value} · ${label}</option>`).join('')}</select></label><label>Energie danach<select data-v33-energy>${[[1,'erschöpft'],[2,'wenig Energie'],[3,'neutral'],[4,'gut'],[5,'sehr gut']].map(([value,label])=>`<option value="${value}" ${Number(ui.energy)===value?'selected':''}>${value} · ${label}</option>`).join('')}</select></label><button type="button" class="primary" data-v33-finish>Training speichern</button><button type="button" class="secondary" data-v33-back-set>Zurück zum Training</button></main>`;
}
function emptyView(){return`${header()}<main class="v33-main"><div class="v33-notice"><strong>Keine Übungen gefunden.</strong><span>Schließe die Einheit und öffne deinen Trainingsplan erneut.</span></div><button type="button" class="secondary" data-v33-exit>Schließen</button></main>`}
function render(){clearTimer();shell(ui.phase==='rest'?restView():ui.phase==='feedback'?feedbackView():setView());bind();if(ui.phase==='rest'&&!workout?.pausedAt)startTimer()}
function bind(){
  const root=document.getElementById('sheetContent');if(!root)return;
  root.querySelectorAll('[data-v33-exit]').forEach(button=>button.onclick=close);
  root.querySelectorAll('[data-v33-action]').forEach(button=>button.onclick=()=>workoutAction(button.dataset.v33Action));
  root.querySelector('[data-v33-value]')?.addEventListener('change',event=>{const ex=exercise(),max=ex?.unit==='seconds'?600:200;currentSet().value=clamp(Number(event.currentTarget.value)||0,0,max);persist();render()});
  root.querySelectorAll('[data-v33-adjust]').forEach(button=>button.onclick=()=>adjust(button.dataset.v33Adjust));
  root.querySelector('[data-v33-complete]')?.addEventListener('click',completeSet);
  root.querySelector('[data-v33-replace]')?.addEventListener('click',replaceExercise);
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
function adjust(spec){const[field,rawDelta]=String(spec).split(':'),delta=Number(rawDelta)||0,set=currentSet(),ex=exercise();if(!set)return;if(field==='value')set.value=clamp((Number(set.value)||0)+delta,0,ex?.unit==='seconds'?600:200);if(field==='effort')set.effort=clamp((Number(set.effort)||7)+delta,1,10);persist();render()}
function completeSet(){const set=currentSet();if(!set)return;set.completed=true;persist();const next=nextPosition();if(!next){ui.phase='feedback';ui.restEndsAt=0;saveUi();render();return}ui.phase='rest';ui.restEndsAt=Date.now()+DEFAULT_REST_SECONDS*1000;ui.restRemainingMs=0;saveUi();render()}
function replaceExercise(){const item=currentItem();if(!item)return;const used=new Set(exercises().filter(value=>value!==item).map(value=>value.exerciseId)),pool=[...(ALTERNATIVES[item.exerciseId]||[]),'bird-dog','deadbug','wall-sit','side-plank','march-in-place'],next=pool.find(id=>!used.has(id));if(!next){toast('Keine weitere Alternative verfügbar');return}const target=TIMED_IDS.has(next)?30:10;item.exerciseId=next;item.skipped=false;item.sets=(item.sets||[]).map((set,index)=>({setNumber:index+1,value:target,effort:7,completed:false}));persist();render();toast(`${NAMES[next]||next} eingesetzt`)}
function skipExercise(){const item=currentItem();if(!item)return;item.skipped=true;persist();const next=nextPosition();if(!next)ui.phase='feedback';else{ui.exerciseIndex=next.exerciseIndex;ui.setIndex=next.setIndex;ui.phase='set'}saveUi();render()}
function finishRest(){const next=nextPosition();ui.restEndsAt=0;ui.restRemainingMs=0;if(!next)ui.phase='feedback';else{ui.exerciseIndex=next.exerciseIndex;ui.setIndex=next.setIndex;ui.phase='set'}saveUi();render()}
function updateTimer(){const remaining=(Number(ui.restEndsAt)||0)-Date.now(),node=document.querySelector('[data-v33-rest-clock]');if(node)node.textContent=formatClock(remaining/1000);if(remaining<=0)finishRest()}
function startTimer(){updateTimer();if(ui.phase==='rest'&&!workout?.pausedAt)timer=setInterval(updateTimer,250)}
function workoutAction(action){
  if(action==='pause'&&!workout.pausedAt){if(ui.phase==='rest'){ui.restRemainingMs=Math.max(0,(Number(ui.restEndsAt)||0)-Date.now());ui.restEndsAt=0}workout.pausedAt=new Date().toISOString();persist();saveUi();render();return}
  if(action==='resume'&&workout.pausedAt){workout.totalPausedMs=(workout.totalPausedMs||0)+(Date.now()-new Date(workout.pausedAt).getTime());workout.pausedAt=null;if(ui.phase==='rest'&&ui.restRemainingMs){ui.restEndsAt=Date.now()+ui.restRemainingMs;ui.restRemainingMs=0}persist();saveUi();render()}
}

function plannedTraining(date){const plan=read(TRAINING_PLAN_KEY,null);return(plan?.sessions||[]).find(session=>Number(session.dayIndex)===dayIndex(date))||null}
async function session(){const known=window.__fitnestV27?.session;if(known?.user?.id)return known;try{return(await(await getSupabaseClient()).auth.getSession()).data.session||null}catch{return null}}
async function saveAdherence(db,userId,snapshot){
  const planned=plannedTraining(snapshot.date),itemKey=`training_${planned?.dayIndex??dayIndex(snapshot.date)}`,localUser=userId||'local',key=`${snapshot.date}|training|${itemKey}`,localStoreKey=`${ADHERENCE_KEY}.${localUser}`;
  const store=read(localStoreKey,{}),value={activity_date:snapshot.date,item_type:'training',item_key:itemKey,status:'completed',replacement_text:null,difficulty:Number(ui.difficulty)||3,energy:Number(ui.energy)||3,metadata:{title:snapshot.title,minutes:snapshot.duration,completedSets:snapshot.completedSets,totalSets:snapshot.totalSets,averageRpe:snapshot.averageRpe,build:BUILD},updated_at:new Date().toISOString()};
  store[key]=value;write(localStoreKey,store);document.dispatchEvent(new CustomEvent('fitnest:v28-adherence-saved',{detail:value}));
  if(!db||!userId)return;
  const result=await db.from('daily_adherence').upsert({...value,user_id:userId},{onConflict:'user_id,activity_date,item_type,item_key'});if(result.error)throw result.error;
}
async function syncWorkout(snapshot,exerciseLog){
  const current=await session();if(!current?.user?.id)return false;
  const db=await getSupabaseClient(),userId=current.user.id,now=new Date().toISOString();
  const workoutRow={id:workout.id,user_id:userId,planned_date:workout.date,workout_type:workout.title,duration_minutes:snapshot.duration,perceived_effort:Math.round(snapshot.averageRpe||7),completed:true,exercise_log:exerciseLog,completed_at:now,status:'completed',started_at:workout.startedAt,updated_at:now};
  const saved=await db.from('workout_sessions').upsert(workoutRow);if(saved.error)throw saved.error;
  const rows=exerciseLog.flatMap(item=>item.skipped?[]:item.sets.map(set=>{const ex=exercise({exerciseId:item.exerciseId,sets:item.sets});return{session_id:workout.id,user_id:userId,exercise_id:item.exerciseId,set_number:set.setNumber,reps:ex.unit==='reps'?Number(set.value||0):null,duration_seconds:ex.unit==='seconds'?Number(set.value||0):null,effort:Number(set.effort||7),completed:Boolean(set.completed)}}));
  if(rows.length){const sets=await db.from('workout_set_logs').upsert(rows,{onConflict:'session_id,exercise_id,set_number'});if(sets.error)throw sets.error}
  await saveAdherence(db,userId,snapshot);return true;
}
async function finishWorkout(){
  const button=document.querySelector('[data-v33-finish]');if(button?.disabled)return;if(button){button.disabled=true;button.textContent='Training wird gespeichert …'}
  if(workout.pausedAt){workout.totalPausedMs=(workout.totalPausedMs||0)+(Date.now()-new Date(workout.pausedAt).getTime());workout.pausedAt=null}
  const exerciseLog=copy(exercises()),snapshot={date:workout.date,title:workout.title,duration:durationMinutes(),completedSets:completedCount(),totalSets:totalCount(),averageRpe:averageRpe(),skipped:exercises().filter(item=>item.skipped).length,energy:Number(ui.energy)||3};
  const history={id:workout.id,date:workout.date,title:workout.title,duration:snapshot.duration,rpe:snapshot.averageRpe||7,completedAt:new Date().toISOString(),exerciseLog,source:'local'};
  const historyItems=read(HISTORY_KEY,[]);write(HISTORY_KEY,[history,...historyItems.filter(item=>item.id!==history.id)].slice(0,30));
  const completed=read(COMPLETED_KEY,{});completed[workout.date]={...(completed[workout.date]||{}),training:true};write(COMPLETED_KEY,completed);
  let localOnly=false;
  try{history.source=await syncWorkout(snapshot,exerciseLog)?'cloud':'local';write(HISTORY_KEY,[history,...historyItems.filter(item=>item.id!==history.id)].slice(0,30));if(history.source==='local')await saveAdherence(null,null,snapshot)}catch(error){console.error('v33 workout sync',error);localOnly=true;const current=await session();await saveAdherence(null,current?.user?.id||null,snapshot)}
  clearTimer();localStorage.removeItem(DRAFT_KEY);localStorage.removeItem(UI_KEY);sessionStorage.setItem(SUMMARY_KEY,JSON.stringify({...snapshot,localOnly}));location.reload();
}
function showSummary(snapshot){
  document.querySelector('[data-v33-summary]')?.remove();const overlay=document.createElement('div');overlay.className='v33-summary-backdrop';overlay.dataset.v33Summary='1';
  overlay.innerHTML=`<section class="v33-summary-dialog"><span class="eyebrow">Training abgeschlossen</span><h2>${esc(snapshot.title)}</h2><p>${snapshot.localOnly?'Die Einheit ist lokal gespeichert. Der Cloud Sync wird beim nächsten App Start erneut versucht.':'Deine Einheit und dein Feedback wurden gespeichert.'}</p><div class="v33-summary-grid"><div><small>Dauer</small><strong>${snapshot.duration} Min.</strong></div><div><small>Sätze</small><strong>${snapshot.completedSets} / ${snapshot.totalSets}</strong></div><div><small>Ø RPE</small><strong>${snapshot.averageRpe||'–'}</strong></div><div><small>Energie</small><strong>${snapshot.energy} / 5</strong></div></div><button type="button" class="primary" data-v33-summary-close>Fortschritt ansehen</button></section>`;
  document.body.append(overlay);overlay.querySelector('[data-v33-summary-close]').onclick=()=>{overlay.remove();document.querySelector('.tab[data-view="progress"]')?.click()};
}
function enhance(){
  const root=document.getElementById('sheetContent');if(!root||root.querySelector('.v33-head'))return;
  if(root.querySelector('.workout-session-list')||root.querySelector('.workout-sheet-head'))open();
}
function init(){
  const root=document.getElementById('sheetContent');if(root)new MutationObserver(()=>{if(renderQueued)return;renderQueued=true;queueMicrotask(()=>{renderQueued=false;enhance()})}).observe(root,{childList:true,subtree:true});
  const saved=sessionStorage.getItem(SUMMARY_KEY);if(saved){sessionStorage.removeItem(SUMMARY_KEY);setTimeout(()=>{try{showSummary(JSON.parse(saved))}catch{}},350)}
  setTimeout(enhance,0);
}

window.__fitnestV33Workout={open};
init();
