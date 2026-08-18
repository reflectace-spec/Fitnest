import { getSupabaseClient } from './app-supabase.js';

const STORE='fitnest.dailyAdherence.v28';
const PLANS='fitnest.nutrition.plans';
const TRAIN='fitnest.ai.trainingPlan.v26';
const COMPLETED='fitnest.completed';
const DAY_NAMES=['Mo','Di','Mi','Do','Fr','Sa','So'];
let sb=null,userId='',state={},loaded=false,renderQueued=false;

const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
const esc=(value='')=>String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const iso=(date=new Date())=>{const value=new Date(date);value.setMinutes(value.getMinutes()-value.getTimezoneOffset());return value.toISOString().slice(0,10)};
const dateFromIso=value=>new Date(`${value}T12:00:00`);
const addDays=(value,days)=>{const date=dateFromIso(value);date.setDate(date.getDate()+days);return iso(date)};
const monday=value=>{const date=dateFromIso(value);date.setDate(date.getDate()-((date.getDay()+6)%7));return iso(date)};
const itemId=(date,type,key)=>`${date}|${type}|${key}`;
const localKey=()=>`${STORE}.${userId||'local'}`;

function toast(message){
  const node=document.getElementById('toast');
  if(!node)return;
  node.textContent=message;
  node.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>node.classList.remove('show'),3000);
}

async function client(){
  if(sb)return sb;
  sb=await getSupabaseClient();
  return sb;
}

async function currentSession(){
  const known=window.__fitnestV27?.session;
  if(known?.user?.id)return known;
  try{return (await (await client()).auth.getSession()).data.session||null}catch{return null}
}

function mealPlans(){return read(PLANS,{})}
function trainingPlan(){return read(TRAIN,null)}
function mealKey(meal,index){return String(meal?.slot||`meal_${index+1}`).slice(0,128)}
function dayIndex(date){return(dateFromIso(date).getDay()+6)%7}
function trainingFor(date){
  const sessions=trainingPlan()?.sessions||[];
  return sessions.find(session=>Number(session.dayIndex)===dayIndex(date))||null;
}
function entry(date,type,key){return state[itemId(date,type,key)]||null}
function isDone(item){return item?.status==='completed'||item?.status==='replaced'}

function plannedFor(date){
  const meals=mealPlans()?.[date]?.meals||[];
  const training=trainingFor(date);
  return{
    meals,
    training,
    total:meals.length+(training?1:0)
  };
}

function statusForDay(date){
  const planned=plannedFor(date);
  let done=0,skipped=0;
  planned.meals.forEach((meal,index)=>{
    const value=entry(date,'meal',mealKey(meal,index));
    if(isDone(value))done++;
    if(value?.status==='skipped')skipped++;
  });
  if(planned.training){
    const value=entry(date,'training',`training_${planned.training.dayIndex}`);
    if(isDone(value))done++;
    if(value?.status==='skipped')skipped++;
  }
  if(!planned.total){
    const recorded=Object.values(state).filter(value=>value.activity_date===date);
    return{
      total:recorded.length,
      done:recorded.filter(isDone).length,
      skipped:recorded.filter(value=>value.status==='skipped').length
    };
  }
  return{total:planned.total,done,skipped};
}

function statusText(value){
  if(value?.status==='completed')return'Erledigt';
  if(value?.status==='replaced')return'Ersetzt';
  if(value?.status==='skipped')return'Ausgelassen';
  return'Geplant';
}

function mealHtml(meal,index,date){
  const key=mealKey(meal,index);
  const value=entry(date,'meal',key);
  const detail=[meal.time,meal.kcal!=null?`${meal.kcal} kcal`:null,meal.protein!=null?`${meal.protein} g Protein`:null].filter(Boolean).join(' · ');
  return `<article class="v28-meal ${value?.status||'planned'}">
    <div class="v28-meal-copy">
      <span class="v28-status-dot" aria-hidden="true"></span>
      <div><small>${esc(meal.label||`Mahlzeit ${index+1}`)}</small><strong>${esc(meal.name||'Geplante Mahlzeit')}</strong><span>${esc(detail||statusText(value))}</span>${value?.replacement_text?`<em>Stattdessen: ${esc(value.replacement_text)}</em>`:''}</div>
    </div>
    <div class="v28-meal-actions" role="group" aria-label="Status für ${esc(meal.name||'Mahlzeit')}">
      <button type="button" data-v28-meal="completed" data-date="${date}" data-key="${esc(key)}" class="${value?.status==='completed'?'active':''}">Gegessen</button>
      <button type="button" data-v28-meal="replaced" data-date="${date}" data-key="${esc(key)}" class="${value?.status==='replaced'?'active':''}">Ersetzt</button>
      <button type="button" data-v28-meal="skipped" data-date="${date}" data-key="${esc(key)}" class="${value?.status==='skipped'?'active':''}">Ausgelassen</button>
    </div>
  </article>`;
}

function trainingHtml(session,date){
  if(!session)return `<article class="v28-training rest"><div><small>Training</small><strong>Regenerationstag</strong><span>Heute ist keine Einheit eingeplant.</span></div><span class="pill">Pause</span></article>`;
  const key=`training_${session.dayIndex}`;
  const value=entry(date,'training',key);
  return `<article class="v28-training ${value?.status||'planned'}">
    <div class="v28-training-head">
      <div><small>Training</small><strong>${esc(session.title||'Deine Einheit')}</strong><span>${esc(session.focus||'Ganzkörper')} · ${Number(session.minutes)||30} Min. · ${session.exercises?.length||0} Übungen</span></div>
      <span class="pill">${statusText(value)}</span>
    </div>
    ${value?.status==='completed'?`<div class="v28-feedback-summary"><span>Schwierigkeit <b>${value.difficulty||'–'}/5</b></span><span>Energie <b>${value.energy||'–'}/5</b></span></div>`:''}
    <div class="v28-training-actions">
      ${value?.status!=='completed'?'<button type="button" class="secondary" data-v28-start>Training starten</button>':''}
      <button type="button" class="primary" data-v28-feedback data-date="${date}" data-key="${key}">${value?.status==='completed'?'Feedback ändern':'Erledigt & bewerten'}</button>
    </div>
  </article>`;
}

function weekHtml(today){
  const start=monday(today);
  return Array.from({length:7},(_,index)=>{
    const date=addDays(start,index);
    const status=statusForDay(date);
    const percentage=status.total?Math.round(status.done/status.total*100):0;
    const label=dateFromIso(date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'});
    return `<div class="v28-week-day ${date===today?'today':''} ${percentage===100&&status.total?'complete':''}">
      <span>${DAY_NAMES[index]}</span>
      <div class="v28-week-track"><i style="height:${percentage}%"></i></div>
      <strong>${status.total?`${percentage}%`:'–'}</strong>
      <small>${label}</small>
    </div>`;
  }).join('');
}

function signature(){
  return JSON.stringify([state,mealPlans(),trainingPlan(),iso()]);
}

function render(){
  renderQueued=false;
  const app=document.getElementById('app');
  const isToday=document.getElementById('pageTitle')?.textContent==='Dein Tag';
  if(!app||!isToday){
    app?.removeAttribute('data-v28-daily');
    return;
  }
  const today=iso();
  const planned=plannedFor(today);
  const progress=statusForDay(today);
  const percentage=progress.total?Math.round(progress.done/progress.total*100):0;
  const sig=signature();
  const current=app.querySelector('[data-v28-root]');
  if(current?.dataset.signature===sig)return;
  const section=document.createElement('section');
  section.className='v28-daily';
  section.dataset.v28Root='1';
  section.dataset.signature=sig;
  section.innerHTML=`
    <div class="v28-overview">
      <div class="v28-progress-ring" style="--v28-progress:${percentage*3.6}deg"><span><strong>${percentage}%</strong><small>heute</small></span></div>
      <div><p class="eyebrow">Build 2.8 · Tagesplan</p><h2>Dein Plan für heute</h2><p>${progress.total?`${progress.done} von ${progress.total} Punkten erledigt`:'Für heute sind noch keine Planpunkte vorhanden.'}</p></div>
    </div>
    <div class="v28-section-head"><div><small>Bewegung</small><h3>Heutiges Training</h3></div></div>
    ${trainingHtml(planned.training,today)}
    <div class="v28-section-head"><div><small>Ernährung</small><h3>Geplante Mahlzeiten</h3></div><span class="pill">${planned.meals.length}</span></div>
    <div class="v28-meals">${planned.meals.length?planned.meals.map((meal,index)=>mealHtml(meal,index,today)).join(''):'<div class="notice">Für heute ist noch kein Essensplan hinterlegt.</div>'}</div>
    <div class="v28-section-head v28-week-head"><div><small>Adherence</small><h3>Diese Woche</h3></div><span class="pill">${progress.done}/${progress.total||0} heute</span></div>
    <div class="v28-week" aria-label="Wochenübersicht">${weekHtml(today)}</div>
    <p class="v28-foundation">Deine Rückmeldungen werden für die spätere adaptive Wochenplanung gespeichert.</p>
  `;
  app.dataset.v28Daily='1';
  if(current)current.replaceWith(section);
  else{
    const hero=app.querySelector('.hero');
    if(hero)hero.after(section);
    else app.prepend(section);
  }
}

function queueRender(){
  if(renderQueued)return;
  renderQueued=true;
  queueMicrotask(render);
}

async function saveEntry(value){
  const id=itemId(value.activity_date,value.item_type,value.item_key);
  const previous=state[id];
  state[id]={...previous,...value,updated_at:new Date().toISOString()};
  write(localKey(),state);
  render();
  const session=await currentSession();
  if(!session?.user?.id){toast('Lokal gespeichert. Für Cloud Sync bitte anmelden.');return}
  try{
    const row={
      user_id:session.user.id,
      activity_date:value.activity_date,
      item_type:value.item_type,
      item_key:value.item_key,
      status:value.status,
      replacement_text:value.replacement_text||null,
      difficulty:value.difficulty||null,
      energy:value.energy||null,
      metadata:value.metadata||{},
      updated_at:new Date().toISOString()
    };
    const result=await (await client()).from('daily_adherence').upsert(row,{onConflict:'user_id,activity_date,item_type,item_key'});
    if(result.error)throw result.error;
  }catch(error){
    console.error('v28 adherence save',error);
    toast('Lokal gespeichert. Cloud Sync folgt später.');
  }
}

async function loadCloud(force=false){
  const session=await currentSession();
  const nextUser=session?.user?.id||'';
  if(nextUser!==userId){
    userId=nextUser;
    state=read(localKey(),{});
    loaded=false;
  }
  if(!session?.user?.id){loaded=true;render();return}
  if(loaded&&!force){render();return}
  try{
    const from=addDays(iso(),-41);
    const result=await (await client()).from('daily_adherence').select('*').eq('user_id',session.user.id).gte('activity_date',from).order('activity_date',{ascending:true});
    if(result.error)throw result.error;
    for(const row of result.data||[]){
      state[itemId(row.activity_date,row.item_type,row.item_key)]=row;
    }
    write(localKey(),state);
    loaded=true;
    render();
  }catch(error){
    console.error('v28 adherence load',error);
    loaded=true;
    render();
  }
}

function startTraining(){
  const existing=document.querySelector('[data-v26-today-start]');
  if(existing){existing.click();return}
  const session=trainingFor(iso());
  if(!session){toast('Heute ist keine Trainingseinheit vorgesehen.');return}
  const draft={
    id:crypto.randomUUID(),
    date:iso(),
    title:session.title,
    startedAt:new Date().toISOString(),
    pausedAt:null,
    totalPausedMs:0,
    status:'in_progress',
    exercises:(session.exercises||[]).map(exercise=>({
      exerciseId:exercise.id,
      skipped:false,
      sets:Array.from({length:Number(exercise.sets)||3},(_,index)=>({
        setNumber:index+1,
        value:Number(exercise.target)||10,
        effort:Number(exercise.rpeTarget)||7,
        completed:false
      }))
    }))
  };
  write('fitnest.workoutDraft',draft);
  sessionStorage.setItem('fitnest.v26.openWorkout','1');
  location.reload();
}

document.addEventListener('fitnest:v28-adherence-saved',event=>{
  const value=event.detail;
  if(!value?.activity_date||!value?.item_type||!value?.item_key)return;
  state[itemId(value.activity_date,value.item_type,value.item_key)]={...value,updated_at:value.updated_at||new Date().toISOString()};
  write(localKey(),state);
  render();
});

function feedbackDialog(date,key){
  const current=entry(date,'training',key);
  const overlay=document.createElement('div');
  overlay.className='v28-dialog-backdrop';
  overlay.innerHTML=`<form class="v28-dialog" data-v28-feedback-form>
    <p class="eyebrow">Training abgeschlossen</p>
    <h2>Wie war deine Einheit?</h2>
    <p>Die Rückmeldung bildet die Grundlage für spätere Plananpassungen.</p>
    <label>Schwierigkeit
      <select name="difficulty" required>
        <option value="">Bitte wählen</option>
        <option value="1">1 · sehr leicht</option>
        <option value="2">2 · leicht</option>
        <option value="3">3 · passend</option>
        <option value="4">4 · schwer</option>
        <option value="5">5 · sehr schwer</option>
      </select>
    </label>
    <label>Energie danach
      <select name="energy" required>
        <option value="">Bitte wählen</option>
        <option value="1">1 · erschöpft</option>
        <option value="2">2 · wenig Energie</option>
        <option value="3">3 · neutral</option>
        <option value="4">4 · gut</option>
        <option value="5">5 · sehr gut</option>
      </select>
    </label>
    <div class="v28-dialog-actions"><button type="button" class="secondary" data-v28-cancel>Abbrechen</button><button type="submit" class="primary">Speichern</button></div>
  </form>`;
  document.body.append(overlay);
  if(current?.difficulty)overlay.querySelector('[name="difficulty"]').value=String(current.difficulty);
  if(current?.energy)overlay.querySelector('[name="energy"]').value=String(current.energy);
  const close=()=>overlay.remove();
  overlay.querySelector('[data-v28-cancel]').onclick=close;
  overlay.addEventListener('click',event=>{if(event.target===overlay)close()});
  overlay.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    const planned=trainingFor(date);
    await saveEntry({
      activity_date:date,
      item_type:'training',
      item_key:key,
      status:'completed',
      difficulty:Number(form.get('difficulty')),
      energy:Number(form.get('energy')),
      metadata:{title:planned?.title||'',minutes:Number(planned?.minutes)||0}
    });
    const completed=read(COMPLETED,{});
    completed[date]={...(completed[date]||{}),training:true};
    write(COMPLETED,completed);
    close();
    toast('Training und Feedback gespeichert.');
  });
  requestAnimationFrame(()=>overlay.querySelector('select')?.focus());
}

document.addEventListener('click',async event=>{
  const mealButton=event.target.closest?.('[data-v28-meal]');
  if(mealButton){
    const date=mealButton.dataset.date,key=mealButton.dataset.key,status=mealButton.dataset.v28Meal;
    const current=entry(date,'meal',key);
    let next=status,replacement=null;
    if(current?.status===status)next='planned';
    if(next==='replaced'){
      replacement=window.prompt('Was hast du stattdessen gegessen?',current?.replacement_text||'');
      if(replacement===null)return;
      replacement=replacement.trim().slice(0,160);
      if(!replacement){toast('Bitte die Ersatzmahlzeit kurz benennen.');return}
    }
    const plan=plannedFor(date),index=plan.meals.findIndex((meal,i)=>mealKey(meal,i)===key),meal=plan.meals[index];
    await saveEntry({
      activity_date:date,
      item_type:'meal',
      item_key:key,
      status:next,
      replacement_text:replacement,
      metadata:{name:meal?.name||'',label:meal?.label||'',time:meal?.time||'',kcal:Number(meal?.kcal)||0}
    });
    toast(next==='planned'?'Status zurückgesetzt.':'Mahlzeitenstatus gespeichert.');
    return;
  }
  if(event.target.closest?.('[data-v28-start]')){startTraining();return}
  const feedback=event.target.closest?.('[data-v28-feedback]');
  if(feedback){feedbackDialog(feedback.dataset.date,feedback.dataset.key)}
},true);

const app=document.getElementById('app');
const title=document.getElementById('pageTitle');
if(app)new MutationObserver(queueRender).observe(app,{childList:true});
if(title)new MutationObserver(queueRender).observe(title,{childList:true,subtree:true,characterData:true});
document.querySelectorAll('.tab').forEach(button=>button.addEventListener('click',queueRender));
document.addEventListener('fitnest:v27-auth',()=>void loadCloud(true));
document.addEventListener('fitnest:cloud-synced',()=>void loadCloud(true));
window.addEventListener('storage',event=>{if(event.key?.startsWith(STORE)||event.key===PLANS||event.key===TRAIN){state=read(localKey(),{});queueRender()}});

void loadCloud();
queueRender();
