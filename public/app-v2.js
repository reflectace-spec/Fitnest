import { CONFIG } from './config.js';

const BUILD='2.0';
const state={
  view:'today',
  profile:read('fitnest.profile',null),
  completed:read('fitnest.completed',{}),
  weights:read('fitnest.weights',[]),
  workoutDraft:read('fitnest.workoutDraft',null),
  workoutHistory:read('fitnest.workoutHistory',[]),
  selectedDate:new Date(),
  supabase:null,
  session:null,
};

const exercises=[
  {id:'squat',name:'Kniebeugen',group:'Beine · Core',sets:3,reps:'12–15',target:12,unit:'reps',level:'Basis',sprite:0,steps:['Füße etwa schulterbreit aufstellen.','Hüfte kontrolliert nach hinten und unten führen.','Knie folgen der Fußrichtung.','Über den ganzen Fuß wieder aufrichten.'],errors:['Knie nach innen kippen lassen','Fersen vom Boden lösen','Rücken unter Last stark einrunden']},
  {id:'pushup',name:'Liegestütze',group:'Brust · Trizeps · Core',sets:3,reps:'6–12',target:8,unit:'reps',level:'Basis',sprite:1,steps:['Hände etwas breiter als schulterbreit aufsetzen.','Körper von Kopf bis Ferse stabil halten.','Brust kontrolliert Richtung Boden senken.','Boden aktiv wegdrücken.'],errors:['Hüfte absinken lassen','Ellbogen komplett seitlich abspreizen','Kopf nach vorne schieben']},
  {id:'reverse-lunge',name:'Reverse Lunges',group:'Beine · Gesäß',sets:3,reps:'10 / Seite',target:10,unit:'reps',level:'Basis',sprite:2,steps:['Aufrecht stehen und einen Fuß nach hinten setzen.','Hinteres Knie Richtung Boden absenken.','Vorderes Knie stabil über dem Fuß halten.','Über das vordere Bein zurück in den Stand.'],errors:['Zu schmaler Stand','Vorderes Knie kippt nach innen','Abstoßen nur aus dem hinteren Bein']},
  {id:'glute-bridge',name:'Glute Bridge',group:'Gesäß · hintere Kette',sets:3,reps:'15–20',target:15,unit:'reps',level:'Basis',sprite:3,steps:['Rückenlage, Füße nah am Gesäß.','Bauch leicht anspannen.','Becken über die Fersen anheben.','Oben Gesäß anspannen und kontrolliert absenken.'],errors:['Ins Hohlkreuz drücken','Füße zu weit entfernt','Bewegung zu schnell ausführen']},
  {id:'bird-dog',name:'Bird Dog',group:'Core · Rücken',sets:3,reps:'8 / Seite',target:8,unit:'reps',level:'Stabilität',sprite:4,steps:['Vierfüßlerstand einnehmen.','Gegenüberliegenden Arm und Bein ausstrecken.','Becken parallel zum Boden halten.','Langsam zurückführen und Seite wechseln.'],errors:['Becken aufdrehen','Hohlkreuz erzeugen','Zu schnell wechseln']},
  {id:'plank',name:'Plank',group:'Core',sets:3,reps:'25–45 Sek.',target:30,unit:'seconds',level:'Stabilität',sprite:5,steps:['Unterarme unter den Schultern platzieren.','Beine strecken und Zehen aufstellen.','Gesäß und Bauch anspannen.','Neutral atmen und Position halten.'],errors:['Hüfte absinken lassen','Gesäß zu hoch schieben','Luft anhalten']},
  {id:'mountain',name:'Mountain Climbers',group:'Cardio · Core',sets:3,reps:'25 Sek.',target:25,unit:'seconds',level:'Kondition',sprite:6,steps:['Hohe Plank Position einnehmen.','Ein Knie kontrolliert zur Brust führen.','Seiten rhythmisch wechseln.','Schultern stabil über den Händen halten.'],errors:['Hüfte stark hoch und runter bewegen','Nur auf Tempo gehen','Schultern nach hinten verlieren']},
  {id:'jumping-jack',name:'Jumping Jacks',group:'Cardio · Ganzkörper',sets:3,reps:'30 Sek.',target:30,unit:'seconds',level:'Kondition',sprite:7,steps:['Aufrecht mit geschlossenen Füßen starten.','Füße seitlich öffnen und Arme über den Kopf führen.','Weich landen und Rumpf stabil halten.','Rhythmisch zurück in die Ausgangsposition.'],errors:['Hart landen','Schultern hochziehen','Tempo vor Kontrolle stellen']},
  {id:'deadbug',name:'Dead Bug',group:'Core · Kontrolle',sets:3,reps:'8 / Seite',target:8,unit:'reps',level:'Stabilität',sprite:null,steps:['Rückenlage, Arme und Beine anheben.','Lendenbereich sanft stabilisieren.','Gegenüberliegenden Arm und Bein strecken.','Kontrolliert zurückführen.'],errors:['Rücken hebt stark vom Boden ab','Bewegung zu groß wählen','Schwung verwenden']}
];

const workoutTemplates=[
  {title:'Ganzkörper A',duration:28,ids:['squat','pushup','reverse-lunge','plank']},
  {title:'Core & Haltung',duration:24,ids:['bird-dog','glute-bridge','deadbug','plank']},
  {title:'Ganzkörper B',duration:30,ids:['squat','pushup','glute-bridge','mountain']},
  {title:'Cardio & Core',duration:24,ids:['jumping-jack','mountain','bird-dog','plank']},
];

function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
function write(key,value){localStorage.setItem(key,JSON.stringify(value))}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function iso(d=new Date()){const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)}
function dayKey(d=new Date()){return iso(d)}
function fmtDate(d){return new Intl.DateTimeFormat('de-DE',{weekday:'long',day:'2-digit',month:'long'}).format(d)}
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function uuid(){return crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`}
function exById(id){return exercises.find(e=>e.id===id)}

async function ensureSupabase(){
  if(state.supabase)return state.supabase;
  if(!CONFIG.supabaseUrl||!CONFIG.supabasePublishableKey)return null;
  const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');
  state.supabase=createClient(CONFIG.supabaseUrl,CONFIG.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  return state.supabase;
}

async function bootstrapCloud(){
  try{
    const sb=await ensureSupabase();if(!sb)return;
    const {data}=await sb.auth.getSession();state.session=data.session||null;
    sb.auth.onAuthStateChange((_event,session)=>{state.session=session;render()});
    if(state.session){
      if(!state.profile){
        const {data:profile}=await sb.from('profiles').select('*').eq('user_id',state.session.user.id).maybeSingle();
        const {data:goal}=await sb.from('goals').select('*').eq('user_id',state.session.user.id).eq('status','active').order('created_at',{ascending:false}).limit(1).maybeSingle();
        if(profile&&goal){
          state.profile={currentWeight:Number(goal.start_weight_kg),targetWeight:Number(goal.target_weight_kg),targetDate:goal.target_date,height:Number(profile.height_cm||0),age:Number(profile.age||0),sex:profile.sex_for_energy_formula||'male',activity:profile.activity_level||'low',trainingDays:Number(profile.training_days||3),minutes:Number(profile.session_minutes||30),stepGoal:Number(profile.step_goal||8000),waterGoal:Number(profile.water_goal_l||2.5)};
          write('fitnest.profile',state.profile);
        }
      }
      await loadRemoteWorkoutHistory();
      render();
    }
  }catch(err){console.warn('Cloud bootstrap failed',err)}
}

async function loadRemoteWorkoutHistory(){
  try{
    const sb=await ensureSupabase();if(!sb||!state.session)return;
    const {data,error}=await sb.from('workout_sessions').select('id,planned_date,workout_type,duration_minutes,perceived_effort,completed,exercise_log,completed_at,status,started_at').eq('user_id',state.session.user.id).eq('completed',true).order('completed_at',{ascending:false}).limit(20);
    if(error)throw error;
    if(data?.length){
      const remote=data.map(r=>({id:r.id,date:r.planned_date,title:r.workout_type,duration:Number(r.duration_minutes||0),rpe:Number(r.perceived_effort||0),completedAt:r.completed_at,exerciseLog:r.exercise_log||[],source:'cloud'}));
      const byId=new Map([...remote,...state.workoutHistory].map(x=>[x.id,x]));
      state.workoutHistory=[...byId.values()].sort((a,b)=>String(b.completedAt||b.date).localeCompare(String(a.completedAt||a.date))).slice(0,30);
      write('fitnest.workoutHistory',state.workoutHistory);
    }
  }catch(err){console.warn('Workout history sync failed',err)}
}

async function syncProfileToCloud(profile){
  try{
    const sb=await ensureSupabase();if(!sb||!state.session)return;
    const user_id=state.session.user.id;
    await sb.from('profiles').upsert({user_id,age:profile.age||null,height_cm:profile.height||null,sex_for_energy_formula:profile.sex,activity_level:profile.activity,training_days:profile.trainingDays,session_minutes:profile.minutes,step_goal:profile.stepGoal,water_goal_l:profile.waterGoal,updated_at:new Date().toISOString()});
    await sb.from('goals').update({status:'paused',updated_at:new Date().toISOString()}).eq('user_id',user_id).eq('status','active');
    await sb.from('goals').insert({user_id,start_weight_kg:profile.currentWeight,target_weight_kg:profile.targetWeight,target_date:profile.targetDate,status:'active'});
  }catch(err){console.warn('Profile sync failed',err)}
}
async function syncWeightToCloud(date,value){try{const sb=await ensureSupabase();if(!sb||!state.session)return;await sb.from('body_metrics').upsert({user_id:state.session.user.id,measured_on:date,weight_kg:value},{onConflict:'user_id,measured_on'})}catch(err){console.warn('Weight sync failed',err)}}
async function syncCheckinToCloud(){try{const sb=await ensureSupabase();if(!sb||!state.session)return;const k=dayKey(),d=state.completed[k]||{};await sb.from('daily_checkins').upsert({user_id:state.session.user.id,checkin_date:k,steps:Number(d.steps||0),water_l:Number(d.water||0),updated_at:new Date().toISOString()},{onConflict:'user_id,checkin_date'})}catch(err){console.warn('Checkin sync failed',err)}}

function weeksBetween(a,b){return Math.max(1,Math.ceil((b-a)/(7*86400000)))}
function goalAssessment(p){
  if(!p)return null;
  const today=new Date();today.setHours(0,0,0,0);
  const end=new Date(p.targetDate+'T12:00:00');
  const weeks=weeksBetween(today,end);
  const kg=Math.max(0,Number(p.currentWeight)-Number(p.targetWeight));
  const rate=kg/weeks;
  const safe=rate<=1;
  const suggestedWeeks=Math.max(weeks,Math.ceil(kg/.75));
  const suggested=new Date(today);suggested.setDate(suggested.getDate()+suggestedWeeks*7);
  return {weeks,kg,rate,safe,suggestedDate:iso(suggested)};
}
function energyEstimate(p){
  if(!p?.height||!p?.age||!p?.currentWeight)return null;
  const w=Number(p.currentWeight),h=Number(p.height),a=Number(p.age),sexAdj=p.sex==='female'?-161:5;
  const bmr=10*w+6.25*h-5*a+sexAdj;
  const factor={low:1.25,medium:1.4,high:1.55}[p.activity]||1.3;
  const tdee=bmr*factor,target=Math.max(bmr,tdee*.82);
  return {bmr:Math.round(bmr/10)*10,tdee:Math.round(tdee/50)*50,target:Math.round(target/50)*50,protein:Math.round(Math.min(w,Number(p.targetWeight)*1.15)*1.6)};
}
function scheduleFor(date=new Date()){
  const days=Number(state.profile?.trainingDays||3);
  const indices=days<=2?[1,4]:days===3?[1,3,5]:days===4?[1,2,4,6]:[1,2,3,5,6];
  const dow=(date.getDay()+6)%7,pos=indices.indexOf(dow);
  if(pos<0)return {title:'Aktive Erholung',duration:45,ids:[],walk:true};
  return workoutTemplates[pos%workoutTemplates.length];
}

function visual(ex,large=false){
  if(Number.isInteger(ex?.sprite)){const col=ex.sprite%4,row=Math.floor(ex.sprite/4),x=col*100/3,y=row*100;return `<div class="exercise-photo${large?' large':''}" role="img" aria-label="${esc(ex.name)}: Start- und Ausführungsposition" style="background-image:url('./assets/exercise-sprite.webp');background-position:${x}% ${y}%"></div>`}
  return `<div class="exercise-fallback${large?' large':''}"><span>${esc(ex?.name||'Übung')}</span><small>Bild folgt</small></div>`;
}

function render(){
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view));
  const titles={today:'Dein Tag',plan:'Training',nutrition:'Ernährung',wiki:'Übungen',progress:'Fortschritt'};
  document.getElementById('pageTitle').textContent=titles[state.view]||'Fitnest';
  document.getElementById('dateLabel').textContent=fmtDate(new Date());
  const app=document.getElementById('app');
  if(state.view==='today')app.innerHTML=renderToday();
  if(state.view==='plan')app.innerHTML=renderPlan();
  if(state.view==='nutrition')app.innerHTML=renderNutrition();
  if(state.view==='wiki')app.innerHTML=renderWiki();
  if(state.view==='progress')app.innerHTML=renderProgress();
  bindView();
}

function renderToday(){
  if(!state.profile)return `<section class="hero"><span class="label">Fitnest · Build ${BUILD}</span><h2>Dein Training wird jetzt protokolliert.</h2><p>Lege Ziel, Zeitrahmen und Trainingsrhythmus fest. Danach begleitet dich Fitnest Satz für Satz.</p><div class="hero-actions"><button class="primary" data-action="onboarding">Plan erstellen</button><button class="secondary" data-action="push">Push testen</button></div></section>`;
  const a=goalAssessment(state.profile),e=energyEstimate(state.profile),w=scheduleFor(new Date()),key=dayKey(),done=state.completed[key]||{};
  const trainingDone=!!done.training,water=Number(done.water||0),steps=Number(done.steps||0),weightDone=state.weights.some(x=>x.date===key),taskCount=[trainingDone,steps>=Number(state.profile.stepGoal||8000),water>=Number(state.profile.waterGoal||2.5),weightDone].filter(Boolean).length;
  const active=state.workoutDraft&&state.workoutDraft.date===key;
  return `<section class="hero"><span class="label">${a.safe?'Ziel im Sicherheitsrahmen':'Ziel zu aggressiv'}</span><h2>${w.walk?'Heute aktiv erholen':active?'Training fortsetzen':trainingDone?'Training erledigt':w.title}</h2><p>${w.walk?'45 Minuten zügig gehen oder locker bewegen.':active?'Dein Workout ist gespeichert und kann jederzeit fortgesetzt werden.':`${w.duration} Minuten · ${w.ids.length} Übungen · Satz-Logging aktiv.`}</p><div class="hero-actions">${!w.walk&&!trainingDone?`<button class="primary" data-action="${active?'resume-workout':'start-today'}">${active?'Fortsetzen':'Workout starten'}</button>`:''}<button class="secondary" data-view-go="plan">Wochenplan</button></div></section>
  <div class="grid"><div class="metric"><span class="metric-icon">✓</span><div><strong>${taskCount}/4</strong><small>Tagesziele</small><div class="progressbar"><i style="width:${taskCount*25}%"></i></div></div></div><div class="metric"><span class="metric-icon">◎</span><div><strong>${e?e.target:'–'}</strong><small>kcal Orientierung</small></div></div><div class="metric"><span class="metric-icon">↟</span><div><strong>${steps.toLocaleString('de-DE')}</strong><small>von ${Number(state.profile.stepGoal||8000).toLocaleString('de-DE')} Schritten</small></div></div><div class="metric"><span class="metric-icon">◌</span><div><strong>${water.toFixed(1)} l</strong><small>von ${Number(state.profile.waterGoal||2.5).toFixed(1)} l</small></div></div></div>
  <section class="section"><div class="section-head"><h3>Heute</h3></div><div class="card">${task('training','Training',trainingDone?'Abgeschlossen':w.title,trainingDone)}${task('steps','Schritte',`${steps.toLocaleString('de-DE')} / ${Number(state.profile.stepGoal||8000).toLocaleString('de-DE')}`,steps>=Number(state.profile.stepGoal||8000))}${task('water','Wasser',`${water.toFixed(1)} / ${Number(state.profile.waterGoal||2.5).toFixed(1)} l`,water>=Number(state.profile.waterGoal||2.5))}${task('weight','Gewicht',weightDone?'Heute eingetragen':'Optionaler Check-in',weightDone)}</div></section>
  ${a.safe?'':`<section class="section"><div class="notice">Dein gewünschtes Tempo liegt bei ${a.rate.toFixed(1)} kg pro Woche. Fitnest erzeugt daraus keinen aggressiveren Trainings- oder Ernährungsplan. Ein entspannteres Zieldatum wäre etwa ${new Intl.DateTimeFormat('de-DE').format(new Date(a.suggestedDate+'T12:00:00'))}.</div></section>`}`;
}
function task(id,title,sub,done){return `<div class="task ${done?'done':''}"><button class="task-check" data-task-action="${id}">${done?'✓':'✓'}</button><div class="task-copy"><strong>${title}</strong><small>${sub}</small></div><span class="pill">${done?'Erledigt':'Offen'}</span></div>`}

function renderPlan(){
  if(!state.profile)return emptySetup();
  const start=new Date();start.setDate(start.getDate()-((start.getDay()+6)%7));
  const days=[...Array(7)].map((_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d});
  const selected=scheduleFor(state.selectedDate),active=state.workoutDraft&&state.workoutDraft.date===dayKey(state.selectedDate),done=!!state.completed[dayKey(state.selectedDate)]?.training;
  return `<div class="week-strip">${days.map(d=>`<button class="day-chip ${iso(d)===iso(state.selectedDate)?'active':''}" data-date="${iso(d)}"><small>${new Intl.DateTimeFormat('de-DE',{weekday:'short'}).format(d)}</small><strong>${d.getDate()}</strong></button>`).join('')}</div>
  <section class="section"><div class="workout-card"><div class="workout-top"><div><span class="eyebrow">${new Intl.DateTimeFormat('de-DE',{weekday:'long'}).format(state.selectedDate)}</span><h3>${selected.title}</h3><span class="workout-meta">${selected.duration} Minuten ${selected.ids.length?`· ${selected.ids.length} Übungen`:'· lockere Intensität'}</span></div><span class="status-dot ${done?'done-dot':''}"></span></div>
  ${selected.walk?`<div class="empty">Zügiger Spaziergang. Tempo so wählen, dass du dich noch in kurzen Sätzen unterhalten kannst.</div>`:selected.ids.map(id=>exerciseRow(exById(id))).join('')}
  <div class="hero-actions">${selected.walk?`<button class="primary" data-action="finish-walk">Erholung erledigt</button>`:done?`<button class="secondary" disabled>Training erledigt</button>`:`<button class="primary" data-action="${active?'resume-workout':'start-selected'}">${active?'Training fortsetzen':'Training starten'}</button>`}<button class="secondary" data-action="swap-workout">Plan anpassen</button></div></div></section>
  ${state.workoutHistory.length?`<section class="section"><div class="section-head"><h3>Letzte Trainings</h3></div><div class="card history-list">${state.workoutHistory.slice(0,5).map(historyRow).join('')}</div></section>`:''}`;
}
function exerciseRow(ex){const p=progressionFor(ex.id);return `<div class="exercise-row"><div class="exercise-visual photo-mini">${visual(ex)}</div><div class="exercise-info"><strong>${ex.name}</strong><small>${ex.sets} × ${ex.reps} · ${ex.group}</small>${p?`<em>${p}</em>`:''}</div><button data-exercise="${ex.id}" aria-label="Übung öffnen">›</button></div>`}
function historyRow(h){return `<div class="history-row"><div><strong>${esc(h.title)}</strong><small>${new Intl.DateTimeFormat('de-DE').format(new Date(h.date+'T12:00:00'))} · ${h.duration||0} Min.</small></div><span class="rpe-badge">RPE ${h.rpe||'–'}</span></div>`}

function renderNutrition(){
  if(!state.profile)return emptySetup();
  const e=energyEstimate(state.profile);
  return `<section class="hero"><span class="label">Tagesrahmen</span><h2>${e?`${e.target} kcal`:'Profil vervollständigen'}</h2><p>${e?`Orientierung: etwa ${e.protein} g Protein. Kein Lebensmittel ist pauschal verboten. Der Plan priorisiert Sättigung, Protein, Gemüse und Alltagstauglichkeit.`:'Alter, Größe und Aktivitätsniveau ergänzen, damit ein grober Orientierungswert berechnet werden kann.'}</p><div class="hero-actions"><button class="primary" data-action="edit-profile">Profil ergänzen</button><button class="secondary" data-action="meal-refresh">Alternativen</button></div></section><section class="section"><div class="section-head"><h3>Heute vorgeschlagen</h3><button data-action="meal-refresh">Neu planen</button></div><div class="card">${food('☼','Frühstück','Skyr Bowl · Beeren · Haferflocken',e?Math.round(e.target*.23):'–')}${food('◒','Mittag','Hähnchen oder Tofu · Reis · Gemüse',e?Math.round(e.target*.34):'–')}${food('◇','Snack','Obst · proteinreiche Komponente',e?Math.round(e.target*.13):'–')}${food('◐','Abendessen','Kartoffeln · Gemüse · Fisch oder Hülsenfrüchte',e?Math.round(e.target*.30):'–')}</div></section><section class="section"><div class="notice">Die detaillierte Mahlzeitenplanung folgt im nächsten Ernährungs-Build. Build 2.0 fokussiert bewusst das vollständige Workout-Logging.</div></section>`;
}
function food(icon,name,desc,kcal){return `<div class="food-card"><div class="food-icon">${icon}</div><div class="food-copy"><strong>${name}</strong><small>${desc}</small></div><span class="pill">${kcal} kcal</span></div>`}

function renderWiki(){return `<section class="wiki-intro"><span class="eyebrow">GPT Image Übungsserie</span><h2>Bewegung auf einen Blick.</h2><p>Die neuen Bilder zeigen Start- und Zielposition in einer einheitlichen, cleanen Bildsprache.</p></section><div class="search"><span>⌕</span><input id="wikiSearch" placeholder="Übung oder Muskelgruppe suchen" autocomplete="off"></div><div class="wiki-grid" id="wikiGrid">${exercises.map(wikiCard).join('')}</div>`}
function wikiCard(ex){return `<button class="wiki-card" data-exercise="${ex.id}" style="text-align:left;color:inherit;padding:0"><div class="wiki-visual photo-wiki">${visual(ex)}</div><div class="wiki-copy"><strong>${ex.name}</strong><small>${ex.group}</small></div></button>`}

function renderProgress(){
  if(!state.profile)return emptySetup();
  const logs=state.weights.slice(-10),vals=logs.map(x=>Number(x.value)),max=Math.max(...vals,Number(state.profile.currentWeight)),min=Math.min(...vals,Number(state.profile.targetWeight));
  const workouts=state.workoutHistory.slice(0,7),avgRpe=workouts.length?(workouts.reduce((s,x)=>s+Number(x.rpe||0),0)/workouts.filter(x=>x.rpe).length||0):0;
  return `<section class="hero"><span class="label">Gewichtstrend</span><h2>${logs.length?`${logs.at(-1).value} kg`:`${state.profile.currentWeight} kg`}</h2><p>Ziel: ${state.profile.targetWeight} kg bis ${new Intl.DateTimeFormat('de-DE').format(new Date(state.profile.targetDate+'T12:00:00'))}.</p><div class="hero-actions"><button class="primary" data-action="weight">Gewicht eintragen</button><button class="secondary" data-action="edit-profile">Ziel bearbeiten</button></div></section>
  <section class="section"><div class="card">${logs.length?`<div class="chart">${logs.map(x=>{const h=35+((Number(x.value)-min)/(Math.max(1,max-min)))*110;return `<div class="bar" style="height:${h}px" data-label="${x.value}"></div>`}).join('')}</div>`:`<div class="empty">Noch keine Messwerte. Trage dein erstes Gewicht ein.</div>`}</div></section>
  <section class="section"><div class="section-head"><h3>Training</h3></div><div class="card"><div class="statline"><span>Gespeicherte Workouts</span><strong>${state.workoutHistory.length}</strong></div><div class="statline"><span>Ø RPE zuletzt</span><strong>${avgRpe?avgRpe.toFixed(1):'–'}</strong></div><div class="statline"><span>Trainingstage</span><strong>${state.profile.trainingDays} / Woche</strong></div><div class="statline"><span>Equipment</span><strong>Yogamatte</strong></div></div></section>
  ${workouts.length?`<section class="section"><div class="section-head"><h3>Verlauf</h3></div><div class="card history-list">${workouts.map(historyRow).join('')}</div></section>`:''}`;
}

function progressionFor(exerciseId){
  const relevant=state.workoutHistory.flatMap(h=>(h.exerciseLog||[]).filter(x=>x.exerciseId===exerciseId)).slice(0,3);
  if(!relevant.length)return '';
  const recent=relevant[0],sets=(recent.sets||[]).filter(s=>!s.skipped),efforts=sets.map(s=>Number(s.effort||0)).filter(Boolean),avg=efforts.length?efforts.reduce((a,b)=>a+b,0)/efforts.length:0;
  if(avg&&avg<=6&&sets.length>=3)return 'Nächstes Mal: leicht steigern';
  if(avg>=9)return 'Nächstes Mal: Belastung reduzieren';
  if(avg)return 'Nächstes Mal: Niveau halten';
  return '';
}

function emptySetup(){return `<section class="hero"><span class="label">Einrichtung fehlt</span><h2>Erst Ziel und Rahmen festlegen.</h2><p>Danach erzeugt Fitnest automatisch deinen Wochenplan.</p><div class="hero-actions"><button class="primary" data-action="onboarding">Jetzt einrichten</button></div></section>`}

function createWorkoutDraft(date){
  const plan=scheduleFor(date);if(plan.walk)return null;
  return {id:uuid(),date:dayKey(date),title:plan.title,startedAt:new Date().toISOString(),pausedAt:null,totalPausedMs:0,status:'in_progress',exercises:plan.ids.map(id=>{const ex=exById(id);return {exerciseId:id,skipped:false,sets:Array.from({length:ex.sets},(_,i)=>({setNumber:i+1,value:ex.target,effort:7,completed:false}))}})};
}
async function startWorkout(date){
  state.workoutDraft=createWorkoutDraft(date);if(!state.workoutDraft)return;
  write('fitnest.workoutDraft',state.workoutDraft);
  try{
    const sb=await ensureSupabase();if(sb&&state.session){
      const d=state.workoutDraft;
      const {error}=await sb.from('workout_sessions').insert({id:d.id,user_id:state.session.user.id,planned_date:d.date,workout_type:d.title,completed:false,exercise_log:[],status:'in_progress',started_at:d.startedAt,updated_at:new Date().toISOString()});
      if(error)throw error;
    }
  }catch(err){console.warn('Workout start sync failed',err)}
  openWorkout();
}
function draftDurationMinutes(){
  const d=state.workoutDraft;if(!d)return 0;
  const end=Date.now(),started=new Date(d.startedAt).getTime(),pause=d.pausedAt?end-new Date(d.pausedAt).getTime():0;
  return Math.max(1,Math.round((end-started-(d.totalPausedMs||0)-pause)/60000));
}
function openWorkout(){
  const d=state.workoutDraft;if(!d){toast('Kein aktives Workout');return}
  sheet(`<div class="sheet-head workout-sheet-head"><div><p class="eyebrow">Aktives Workout · ${esc(d.title)}</p><h2>${d.pausedAt?'Pausiert':'Training läuft'}</h2><p class="workout-clock">${draftDurationMinutes()} Min. · Satz für Satz protokollieren</p></div><button data-close>×</button></div>
  <div class="workout-session-list">${d.exercises.map(workoutExerciseEditor).join('')}</div>
  <div class="workout-footer"><button class="secondary" data-workout-action="${d.pausedAt?'resume':'pause'}">${d.pausedAt?'Fortsetzen':'Pausieren'}</button><button class="primary" data-workout-action="finish">Training beenden</button></div>`);
  bindWorkoutEditor();
}
function workoutExerciseEditor(item){
  const ex=exById(item.exerciseId);
  return `<section class="session-exercise ${item.skipped?'is-skipped':''}" data-session-exercise="${ex.id}"><div class="session-exercise-head"><div class="session-thumb">${visual(ex)}</div><div><strong>${ex.name}</strong><small>${ex.reps} · ${ex.group}</small><em>${progressionFor(ex.id)||'Heute sauber und kontrolliert ausführen'}</em></div></div>
  <div class="set-grid"><span>Satz</span><span>${ex.unit==='seconds'?'Sek.':'Wdh.'}</span><span>RPE</span><span></span>${item.sets.map(s=>`<label>${s.setNumber}</label><input data-set-value="${ex.id}:${s.setNumber}" type="number" inputmode="numeric" min="0" max="${ex.unit==='seconds'?300:100}" value="${s.value}"><select data-set-rpe="${ex.id}:${s.setNumber}">${[4,5,6,7,8,9,10].map(n=>`<option value="${n}" ${Number(s.effort)===n?'selected':''}>${n}</option>`).join('')}</select><button class="set-check ${s.completed?'complete':''}" data-set-complete="${ex.id}:${s.setNumber}">${s.completed?'✓':'○'}</button>`).join('')}</div>
  <div class="session-actions"><button class="ghost mini" data-workout-replace="${ex.id}">Ersetzen</button><button class="ghost mini" data-workout-skip="${ex.id}">${item.skipped?'Wieder aufnehmen':'Überspringen'}</button></div></section>`;
}
function bindWorkoutEditor(){
  document.querySelectorAll('[data-set-value]').forEach(el=>el.onchange=()=>updateSet(el.dataset.setValue,'value',Number(el.value)));
  document.querySelectorAll('[data-set-rpe]').forEach(el=>el.onchange=()=>updateSet(el.dataset.setRpe,'effort',Number(el.value)));
  document.querySelectorAll('[data-set-complete]').forEach(el=>el.onclick=()=>{const [id,n]=el.dataset.setComplete.split(':');const item=state.workoutDraft.exercises.find(x=>x.exerciseId===id),set=item.sets.find(s=>s.setNumber===Number(n));set.completed=!set.completed;persistDraft();openWorkout()});
  document.querySelectorAll('[data-workout-skip]').forEach(el=>el.onclick=()=>{const item=state.workoutDraft.exercises.find(x=>x.exerciseId===el.dataset.workoutSkip);item.skipped=!item.skipped;persistDraft();openWorkout()});
  document.querySelectorAll('[data-workout-replace]').forEach(el=>el.onclick=()=>replaceExercise(el.dataset.workoutReplace));
  document.querySelectorAll('[data-workout-action]').forEach(el=>el.onclick=()=>workoutAction(el.dataset.workoutAction));
}
function updateSet(key,field,value){const [id,n]=key.split(':');const item=state.workoutDraft.exercises.find(x=>x.exerciseId===id),set=item.sets.find(s=>s.setNumber===Number(n));set[field]=value;persistDraft()}
function persistDraft(){write('fitnest.workoutDraft',state.workoutDraft)}
function replaceExercise(id){
  const alternatives={squat:'glute-bridge',pushup:'plank','reverse-lunge':'squat','glute-bridge':'bird-dog','bird-dog':'deadbug',deadbug:'bird-dog',plank:'bird-dog',mountain:'jumping-jack','jumping-jack':'mountain'};
  const next=alternatives[id]||'bird-dog',idx=state.workoutDraft.exercises.findIndex(x=>x.exerciseId===id),ex=exById(next);
  state.workoutDraft.exercises[idx]={exerciseId:next,skipped:false,sets:Array.from({length:ex.sets},(_,i)=>({setNumber:i+1,value:ex.target,effort:7,completed:false}))};persistDraft();openWorkout();toast(`${ex.name} eingesetzt`);
}
function workoutAction(action){
  const d=state.workoutDraft;if(!d)return;
  if(action==='pause'&&!d.pausedAt){d.pausedAt=new Date().toISOString();persistDraft();openWorkout();return}
  if(action==='resume'&&d.pausedAt){d.totalPausedMs=(d.totalPausedMs||0)+(Date.now()-new Date(d.pausedAt).getTime());d.pausedAt=null;persistDraft();openWorkout();return}
  if(action==='finish')finishWorkout();
}
async function finishWorkout(){
  const d=state.workoutDraft;if(!d)return;
  if(d.pausedAt){d.totalPausedMs=(d.totalPausedMs||0)+(Date.now()-new Date(d.pausedAt).getTime());d.pausedAt=null}
  const exerciseLog=d.exercises.map(item=>({exerciseId:item.exerciseId,skipped:item.skipped,sets:item.sets.map(s=>({...s}))}));
  const allSets=exerciseLog.flatMap(x=>x.skipped?[]:x.sets.filter(s=>s.completed)),efforts=allSets.map(s=>Number(s.effort||0)).filter(Boolean),avgRpe=efforts.length?Math.round((efforts.reduce((a,b)=>a+b,0)/efforts.length)*10)/10:7,duration=draftDurationMinutes(),completedAt=new Date().toISOString();
  const history={id:d.id,date:d.date,title:d.title,duration,rpe:avgRpe,completedAt,exerciseLog,source:state.session?'cloud':'local'};
  state.workoutHistory=[history,...state.workoutHistory.filter(x=>x.id!==history.id)].slice(0,30);write('fitnest.workoutHistory',state.workoutHistory);
  state.completed[d.date]={...(state.completed[d.date]||{}),training:true};write('fitnest.completed',state.completed);
  try{
    const sb=await ensureSupabase();if(sb&&state.session){
      const {error}=await sb.from('workout_sessions').upsert({id:d.id,user_id:state.session.user.id,planned_date:d.date,workout_type:d.title,duration_minutes:duration,perceived_effort:Math.round(avgRpe),completed:true,exercise_log:exerciseLog,completed_at:completedAt,status:'completed',started_at:d.startedAt,updated_at:completedAt});if(error)throw error;
      const rows=exerciseLog.flatMap(x=>x.skipped?[]:x.sets.map(s=>({session_id:d.id,user_id:state.session.user.id,exercise_id:x.exerciseId,set_number:s.setNumber,reps:exById(x.exerciseId)?.unit==='reps'?Number(s.value||0):null,duration_seconds:exById(x.exerciseId)?.unit==='seconds'?Number(s.value||0):null,effort:Number(s.effort||7),completed:Boolean(s.completed)})));
      if(rows.length){const {error:setError}=await sb.from('workout_set_logs').upsert(rows,{onConflict:'session_id,exercise_id,set_number'});if(setError)throw setError}
    }
  }catch(err){console.warn('Workout finish sync failed',err);history.source='local'}
  state.workoutDraft=null;localStorage.removeItem('fitnest.workoutDraft');closeSheet();state.view='progress';render();toast('Training gespeichert');
}

function bindView(){
  document.querySelectorAll('[data-view-go]').forEach(x=>x.onclick=()=>{state.view=x.dataset.viewGo;render()});
  document.querySelectorAll('[data-action]').forEach(x=>x.onclick=()=>handleAction(x.dataset.action));
  document.querySelectorAll('[data-exercise]').forEach(x=>x.onclick=()=>openExercise(x.dataset.exercise));
  document.querySelectorAll('[data-date]').forEach(x=>x.onclick=()=>{state.selectedDate=new Date(x.dataset.date+'T12:00:00');render()});
  document.querySelectorAll('[data-task-action]').forEach(x=>x.onclick=e=>{e.stopPropagation();handleTask(x.dataset.taskAction)});
  const q=document.getElementById('wikiSearch');if(q)q.oninput=()=>{document.getElementById('wikiGrid').innerHTML=exercises.filter(e=>(e.name+' '+e.group).toLowerCase().includes(q.value.toLowerCase())).map(wikiCard).join('');document.querySelectorAll('[data-exercise]').forEach(x=>x.onclick=()=>openExercise(x.dataset.exercise))};
}
async function handleAction(action){
  if(action==='onboarding'||action==='edit-profile')openOnboarding();
  if(action==='weight')openWeight();
  if(action==='push')await enablePush();
  if(action==='start-today')await startWorkout(new Date());
  if(action==='start-selected')await startWorkout(state.selectedDate);
  if(action==='resume-workout')openWorkout();
  if(action==='finish-walk'){const k=dayKey(state.selectedDate);state.completed[k]={...(state.completed[k]||{}),training:true};write('fitnest.completed',state.completed);toast('Aktive Erholung gespeichert');render()}
  if(action==='swap-workout')toast('Im Workout kannst du jede Übung einzeln ersetzen');
  if(action==='meal-refresh')toast('Ernährungsplanung folgt in Build 2.1');
}
function handleTask(id){
  const k=dayKey();state.completed[k]=state.completed[k]||{};
  if(id==='training'){state.view='plan';render();return}
  if(id==='weight'){openWeight();return}
  if(id==='water')state.completed[k].water=clamp(Number(state.completed[k].water||0)+.5,0,5);
  if(id==='steps')openNumberSheet('Schritte eintragen','steps',state.completed[k].steps||0,500);
  write('fitnest.completed',state.completed);syncCheckinToCloud();render();
}

function openOnboarding(){
  const p=state.profile||{};
  sheet(`<div class="sheet-head"><div><p class="eyebrow">Persönlicher Plan</p><h2>${state.profile?'Ziel bearbeiten':'Fitnest einrichten'}</h2></div><button data-close>×</button></div><form id="profileForm" class="form-grid"><div class="split"><div class="field"><label>Aktuelles Gewicht</label><input name="currentWeight" type="number" inputmode="decimal" step="0.1" min="35" max="300" required value="${p.currentWeight||''}" placeholder="kg"></div><div class="field"><label>Zielgewicht</label><input name="targetWeight" type="number" inputmode="decimal" step="0.1" min="35" max="300" required value="${p.targetWeight||''}" placeholder="kg"></div></div><div class="field"><label>Zieltermin</label><input name="targetDate" type="date" required min="${iso(new Date(Date.now()+7*86400000))}" value="${p.targetDate||iso(new Date(Date.now()+84*86400000))}"></div><div class="split"><div class="field"><label>Größe</label><input name="height" type="number" min="120" max="230" value="${p.height||''}" placeholder="cm"></div><div class="field"><label>Alter</label><input name="age" type="number" min="16" max="100" value="${p.age||''}" placeholder="Jahre"></div></div><div class="split"><div class="field"><label>Geschlecht für Energieformel</label><select name="sex"><option value="male" ${p.sex==='male'?'selected':''}>männlich</option><option value="female" ${p.sex==='female'?'selected':''}>weiblich</option></select></div><div class="field"><label>Alltag</label><select name="activity"><option value="low" ${p.activity==='low'?'selected':''}>eher sitzend</option><option value="medium" ${p.activity==='medium'?'selected':''}>gemischt</option><option value="high" ${p.activity==='high'?'selected':''}>viel aktiv</option></select></div></div><div class="split"><div class="field"><label>Trainingstage / Woche</label><select name="trainingDays">${[2,3,4,5].map(n=>`<option ${Number(p.trainingDays||3)===n?'selected':''}>${n}</option>`).join('')}</select></div><div class="field"><label>Zeit / Einheit</label><select name="minutes">${[20,30,40,45].map(n=>`<option value="${n}" ${Number(p.minutes||30)===n?'selected':''}>${n} Min.</option>`).join('')}</select></div></div><div class="split"><div class="field"><label>Schrittziel</label><input name="stepGoal" type="number" step="500" min="3000" max="20000" value="${p.stepGoal||8000}"></div><div class="field"><label>Wasserziel</label><input name="waterGoal" type="number" step="0.1" min="1" max="5" value="${p.waterGoal||2.5}"></div></div><div class="notice">Fitnest prüft die gewünschte Abnahmerate. Bei aggressiven Zielen wird kein extremerer Plan erzeugt.</div><button class="primary" type="submit">Plan speichern</button><button class="secondary" type="button" id="googleLogin">Mit Google anmelden</button></form>`);
  document.getElementById('profileForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.currentTarget),p2=Object.fromEntries(f.entries());['currentWeight','targetWeight','height','age','trainingDays','minutes','stepGoal','waterGoal'].forEach(k=>p2[k]=Number(p2[k]));const a=goalAssessment(p2);state.profile=p2;write('fitnest.profile',p2);syncProfileToCloud(p2);closeSheet();render();toast(a.safe?'Plan gespeichert':'Ziel gespeichert · Sicherheitscheck aktiv')};
  document.getElementById('googleLogin').onclick=googleLogin;
}
function openWeight(){const current=state.weights.at(-1)?.value||state.profile?.currentWeight||'';sheet(`<div class="sheet-head"><div><p class="eyebrow">Check-in</p><h2>Gewicht eintragen</h2></div><button data-close>×</button></div><form id="weightForm" class="form-grid"><div class="field"><label>Heute</label><input name="weight" type="number" inputmode="decimal" step="0.1" min="35" max="300" required value="${current}"></div><button class="primary" type="submit">Speichern</button></form>`);document.getElementById('weightForm').onsubmit=e=>{e.preventDefault();const v=Number(new FormData(e.currentTarget).get('weight')),d=dayKey();state.weights=state.weights.filter(x=>x.date!==d).concat({date:d,value:v});write('fitnest.weights',state.weights);syncWeightToCloud(d,v);closeSheet();render();toast('Gewicht gespeichert')}}
function openNumberSheet(title,key,value,step){sheet(`<div class="sheet-head"><div><p class="eyebrow">Heute</p><h2>${title}</h2></div><button data-close>×</button></div><form id="numForm" class="form-grid"><div class="field"><input name="n" type="number" step="${step}" min="0" value="${value}"></div><button class="primary" type="submit">Speichern</button></form>`);document.getElementById('numForm').onsubmit=e=>{e.preventDefault();const k=dayKey();state.completed[k]=state.completed[k]||{};state.completed[k][key]=Number(new FormData(e.currentTarget).get('n'));write('fitnest.completed',state.completed);syncCheckinToCloud();closeSheet();render()}}
function openExercise(id){const ex=exById(id);sheet(`<div class="sheet-head"><div><p class="eyebrow">Übungswiki · ${ex.level}</p><h2>${ex.name}</h2></div><button data-close>×</button></div><div class="exercise-detail-visual">${visual(ex,true)}</div><section class="section"><div class="section-head"><h3>Ausführung</h3></div><div class="card">${ex.steps.map((s,i)=>`<div class="task"><span class="task-check instruction-index">${i+1}</span><div class="task-copy"><strong>${s}</strong></div></div>`).join('')}</div></section><section class="section"><div class="section-head"><h3>Häufige Fehler</h3></div><div class="card">${ex.errors.map(s=>`<div class="task"><span class="pill">!</span><div class="task-copy"><strong>${s}</strong></div></div>`).join('')}</div></section><div class="notice">Bei Schmerzen, Schwindel oder ungewöhnlicher Atemnot Training abbrechen und medizinisch abklären.</div>`)}

function openProfile(){sheet(`<div class="sheet-head"><div><p class="eyebrow">Fitnest · Build ${BUILD}</p><h2>Einstellungen</h2></div><button data-close>×</button></div><div class="form-grid"><button class="secondary" data-sheet-action="edit">Ziel & Profil bearbeiten</button><button class="secondary" data-sheet-action="push">Push Notifications</button><button class="secondary" data-sheet-action="legal-imprint">Impressum</button><button class="secondary" data-sheet-action="legal-privacy">Datenschutz</button><button class="ghost" data-sheet-action="reset">Lokale Demo Daten löschen</button></div>`);document.querySelectorAll('[data-sheet-action]').forEach(x=>x.onclick=()=>{const a=x.dataset.sheetAction;if(a==='edit'){closeSheet();openOnboarding()}if(a==='push')enablePush();if(a==='legal-imprint')openLegal('imprint');if(a==='legal-privacy')openLegal('privacy');if(a==='reset'){['fitnest.profile','fitnest.completed','fitnest.weights','fitnest.workoutDraft','fitnest.workoutHistory'].forEach(k=>localStorage.removeItem(k));location.reload()}})}
function openLegal(type){const imprint=`<div class="legal"><h3>Impressum</h3><p><strong>Angaben gemäß § 5 DDG</strong></p><p>Christian Elies<br><em>[vollständige ladungsfähige Anschrift vor öffentlichem Launch ergänzen]</em><br>Deutschland</p><p>Kontakt:<br><em>[E-Mail-Adresse ergänzen]</em></p><h3>Hinweis</h3><p>Technischer Entwurf. Vor einem öffentlichen oder geschäftsmäßigen Betrieb müssen Anbieterangaben vervollständigt und rechtlich geprüft werden.</p></div>`;const privacy=`<div class="legal"><h3>Datenschutzerklärung</h3><p><strong>Verantwortlicher</strong><br>Christian Elies<br><em>[Anschrift und Kontakt ergänzen]</em></p><h3>Verarbeitete Daten</h3><p>Je nach Nutzung verarbeitet Fitnest Accountdaten, Ziel- und Profildaten, Trainingsdaten einschließlich Satzprotokollen und RPE, Gewichtsverläufe, Ernährungsangaben sowie Push-Abonnementdaten.</p><h3>Dienstleister</h3><p>Supabase wird für Authentifizierung und Datenhaltung eingesetzt, Cloudflare für Hosting. Für optionale KI-Funktionen wird vor Aktivierung transparent ausgewiesen, welche Daten übertragen werden.</p><h3>Status</h3><p>Technischer Entwurf für Build ${BUILD}. Vor öffentlichem Launch ist eine rechtliche Endprüfung erforderlich.</p></div>`;document.getElementById('sheetContent').innerHTML=`<div class="sheet-inner"><div class="sheet-handle"></div><div class="sheet-head"><div><p class="eyebrow">Rechtliches</p><h2>${type==='imprint'?'Impressum':'Datenschutz'}</h2></div><button data-close>×</button></div>${type==='imprint'?imprint:privacy}</div>`;bindSheetClose()}
function sheet(html){const d=document.getElementById('sheet');document.getElementById('sheetContent').innerHTML=`<div class="sheet-inner"><div class="sheet-handle"></div>${html}</div>`;bindSheetClose();if(!d.open)d.showModal()}
function bindSheetClose(){document.querySelectorAll('[data-close]').forEach(x=>x.onclick=closeSheet)}
function closeSheet(){const d=document.getElementById('sheet');if(d.open)d.close()}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),2200)}
async function googleLogin(){if(!CONFIG.supabaseUrl||!CONFIG.supabasePublishableKey){toast('Supabase Projekt noch nicht verbunden');return}try{const sb=await ensureSupabase();await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:CONFIG.appUrl||location.origin}})}catch(err){console.error(err);toast('Google Login konnte nicht gestartet werden')}}
async function enablePush(){if(!('serviceWorker'in navigator)||!('Notification'in window)){toast('Push wird auf diesem Browser nicht unterstützt');return}try{const permission=await Notification.requestPermission();if(permission!=='granted'){toast('Benachrichtigungen nicht freigegeben');return}const reg=await navigator.serviceWorker.ready;if(CONFIG.vapidPublicKey){const existing=await reg.pushManager.getSubscription(),sub=existing||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(CONFIG.vapidPublicKey)});localStorage.setItem('fitnest.pushSubscription',JSON.stringify(sub));if(state.session){const j=sub.toJSON(),sb=await ensureSupabase();await sb.from('push_subscriptions').upsert({user_id:state.session.user.id,endpoint:j.endpoint,p256dh:j.keys?.p256dh||'',auth_secret:j.keys?.auth||'',device_label:navigator.userAgent.slice(0,120),enabled:true,updated_at:new Date().toISOString()},{onConflict:'user_id,endpoint'})}toast('Push auf diesem Gerät aktiviert')}else{await reg.showNotification('Fitnest',{body:'Benachrichtigungen funktionieren. Server Push folgt in Build 2.3.',icon:'./assets/icon.svg',badge:'./assets/icon.svg'});toast('Lokaler Push Test erfolgreich')}}catch(err){console.error(err);toast('Push konnte nicht aktiviert werden')}}
function urlBase64ToUint8Array(base64String){const padding='='.repeat((4-base64String.length%4)%4),base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(base64);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)))}
async function registerSW(){if('serviceWorker'in navigator){try{await navigator.serviceWorker.register('./sw.js')}catch(e){console.warn('SW registration failed',e)}}}

document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;render()});
document.getElementById('profileButton').onclick=openProfile;
document.getElementById('sheet').addEventListener('click',e=>{if(e.target===e.currentTarget)closeSheet()});
registerSW();bootstrapCloud();render();
