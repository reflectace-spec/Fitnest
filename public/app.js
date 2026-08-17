import { CONFIG } from './config.js';

const state = {
  view: 'today',
  profile: read('fitnest.profile', null),
  completed: read('fitnest.completed', {}),
  weights: read('fitnest.weights', []),
  selectedDate: new Date(),
  supabase: null,
  session: null,
};

const exercises = [
  {id:'squat',name:'Kniebeugen',group:'Beine · Core',sets:3,reps:'12–15',level:'Basis',steps:['Füße etwa schulterbreit aufstellen.','Hüfte kontrolliert nach hinten und unten führen.','Knie folgen der Fußrichtung.','Über den ganzen Fuß wieder aufrichten.'],errors:['Knie nach innen kippen lassen','Fersen vom Boden lösen','Rücken unter Last stark einrunden']},
  {id:'pushup',name:'Liegestütze',group:'Brust · Trizeps · Core',sets:3,reps:'6–12',level:'Basis',steps:['Hände etwas breiter als schulterbreit.','Körper von Kopf bis Ferse in einer Linie halten.','Brust kontrolliert Richtung Boden senken.','Boden aktiv wegdrücken.'],errors:['Hüfte absinken lassen','Ellbogen komplett seitlich abspreizen','Kopf nach vorne schieben']},
  {id:'reverse-lunge',name:'Reverse Lunges',group:'Beine · Gesäß',sets:3,reps:'10 / Seite',level:'Basis',steps:['Aufrecht stehen und einen Fuß nach hinten setzen.','Hinteres Knie Richtung Boden absenken.','Vorderes Knie stabil über dem Fuß halten.','Über das vordere Bein zurück in den Stand.'],errors:['Zu schmaler Stand','Vorderes Knie kippt nach innen','Abstoßen nur aus dem hinteren Bein']},
  {id:'glute-bridge',name:'Glute Bridge',group:'Gesäß · hintere Kette',sets:3,reps:'15–20',level:'Basis',steps:['Rückenlage, Füße nah am Gesäß.','Bauch leicht anspannen.','Becken über die Fersen anheben.','Oben Gesäß anspannen und kontrolliert absenken.'],errors:['Ins Hohlkreuz drücken','Füße zu weit entfernt','Bewegung zu schnell ausführen']},
  {id:'bird-dog',name:'Bird Dog',group:'Core · Rücken',sets:3,reps:'8 / Seite',level:'Stabilität',steps:['Vierfüßlerstand einnehmen.','Gegenüberliegenden Arm und Bein ausstrecken.','Becken parallel zum Boden halten.','Langsam zurückführen und Seite wechseln.'],errors:['Becken aufdrehen','Hohlkreuz erzeugen','Zu schnell wechseln']},
  {id:'plank',name:'Plank',group:'Core',sets:3,reps:'25–45 Sek.',level:'Stabilität',steps:['Unterarme unter den Schultern platzieren.','Beine strecken und Zehen aufstellen.','Gesäß und Bauch anspannen.','Neutral atmen und Position halten.'],errors:['Hüfte absinken lassen','Gesäß zu hoch schieben','Luft anhalten']},
  {id:'mountain',name:'Mountain Climbers',group:'Cardio · Core',sets:3,reps:'25 Sek.',level:'Kondition',steps:['Hohe Plank Position einnehmen.','Ein Knie kontrolliert zur Brust führen.','Seiten rhythmisch wechseln.','Schultern stabil über den Händen halten.'],errors:['Hüfte stark hoch und runter bewegen','Nur auf Tempo gehen','Schultern nach hinten verlieren']},
  {id:'deadbug',name:'Dead Bug',group:'Core · Kontrolle',sets:3,reps:'8 / Seite',level:'Stabilität',steps:['Rückenlage, Arme und Beine anheben.','Lendenbereich sanft stabilisieren.','Gegenüberliegenden Arm und Bein strecken.','Kontrolliert zurückführen.'],errors:['Rücken hebt stark vom Boden ab','Bewegung zu groß wählen','Schwung verwenden']}
];

const workoutTemplates = [
  {title:'Ganzkörper A',duration:28,ids:['squat','pushup','reverse-lunge','plank']},
  {title:'Core & Haltung',duration:24,ids:['bird-dog','glute-bridge','deadbug','plank']},
  {title:'Ganzkörper B',duration:30,ids:['squat','pushup','glute-bridge','mountain']},
  {title:'Mobility Walk',duration:45,ids:[]}
];

async function ensureSupabase(){
  if(state.supabase) return state.supabase;
  if(!CONFIG.supabaseUrl||!CONFIG.supabasePublishableKey) return null;
  const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');
  state.supabase=createClient(CONFIG.supabaseUrl,CONFIG.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  return state.supabase;
}

async function bootstrapCloud(){
  try{
    const sb=await ensureSupabase(); if(!sb) return;
    const {data}=await sb.auth.getSession(); state.session=data.session||null;
    sb.auth.onAuthStateChange((_event,session)=>{state.session=session;render()});
    if(state.session&&!state.profile){
      const {data:profile}=await sb.from('profiles').select('*').eq('user_id',state.session.user.id).maybeSingle();
      const {data:goal}=await sb.from('goals').select('*').eq('user_id',state.session.user.id).eq('status','active').order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(profile&&goal){state.profile={currentWeight:Number(goal.start_weight_kg),targetWeight:Number(goal.target_weight_kg),targetDate:goal.target_date,height:Number(profile.height_cm||0),age:Number(profile.age||0),sex:profile.sex_for_energy_formula||'male',activity:profile.activity_level||'low',trainingDays:Number(profile.training_days||3),minutes:Number(profile.session_minutes||30),stepGoal:Number(profile.step_goal||8000),waterGoal:Number(profile.water_goal_l||2.5)};write('fitnest.profile',state.profile);render()}
    }
  }catch(err){console.warn('Cloud bootstrap failed',err)}
}

async function syncProfileToCloud(profile){
  try{
    const sb=await ensureSupabase(); if(!sb||!state.session) return;
    const user_id=state.session.user.id;
    await sb.from('profiles').upsert({user_id,age:profile.age||null,height_cm:profile.height||null,sex_for_energy_formula:profile.sex,activity_level:profile.activity,training_days:profile.trainingDays,session_minutes:profile.minutes,step_goal:profile.stepGoal,water_goal_l:profile.waterGoal,updated_at:new Date().toISOString()});
    await sb.from('goals').update({status:'paused',updated_at:new Date().toISOString()}).eq('user_id',user_id).eq('status','active');
    await sb.from('goals').insert({user_id,start_weight_kg:profile.currentWeight,target_weight_kg:profile.targetWeight,target_date:profile.targetDate,status:'active'});
  }catch(err){console.warn('Profile sync failed',err)}
}

async function syncWeightToCloud(date,value){
  try{const sb=await ensureSupabase();if(!sb||!state.session)return;await sb.from('body_metrics').upsert({user_id:state.session.user.id,measured_on:date,weight_kg:value},{onConflict:'user_id,measured_on'})}catch(err){console.warn('Weight sync failed',err)}
}

async function syncCheckinToCloud(){
  try{const sb=await ensureSupabase();if(!sb||!state.session)return;const k=dayKey(),d=state.completed[k]||{};await sb.from('daily_checkins').upsert({user_id:state.session.user.id,checkin_date:k,steps:Number(d.steps||0),water_l:Number(d.water||0),updated_at:new Date().toISOString()},{onConflict:'user_id,checkin_date'})}catch(err){console.warn('Checkin sync failed',err)}
}

function read(key, fallback){try{return JSON.parse(localStorage.getItem(key)) ?? fallback}catch{return fallback}}
function write(key,value){localStorage.setItem(key,JSON.stringify(value))}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function iso(d=new Date()){return d.toISOString().slice(0,10)}
function dayKey(d=new Date()){return iso(d)}
function fmtDate(d){return new Intl.DateTimeFormat('de-DE',{weekday:'long',day:'2-digit',month:'long'}).format(d)}
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}

function iconSvg(type){
  const common='fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"';
  const map={
    squat:`<circle cx="50" cy="24" r="10" ${common}/><path d="M50 35v24l-19 13m19-13 22 10M50 44 30 52m20-8 19 9M31 72l-6 22m47-25 8 22" ${common}/>`,
    pushup:`<circle cx="79" cy="48" r="8" ${common}/><path d="M72 55 51 63 28 58M51 63 77 76m-26-13-20 17M28 58 15 76m62 0 14 12" ${common}/>`,
    'reverse-lunge':`<circle cx="48" cy="22" r="9" ${common}/><path d="M48 32v29m0-17-18 10m18-10 18 9M48 61 29 75 17 95m31-34 20 16 18 3" ${common}/>`,
    'glute-bridge':`<circle cx="20" cy="68" r="8" ${common}/><path d="M28 68 47 60 67 42 86 62m-39-2 20 3m19-1 7 23M20 76 11 86" ${common}/>`,
    'bird-dog':`<circle cx="35" cy="43" r="8" ${common}/><path d="M43 47 58 57 75 56M55 57 41 76M75 56 92 42M58 57 75 78" ${common}/>`,
    plank:`<circle cx="78" cy="46" r="8" ${common}/><path d="M70 52 50 59 25 57M50 59 78 72M25 57 13 76m65-4 15 8" ${common}/>`,
    mountain:`<circle cx="72" cy="35" r="8" ${common}/><path d="M65 42 49 55 26 53M49 55 75 69M49 55 39 79 20 86m55-17 17 14" ${common}/>`,
    deadbug:`<circle cx="50" cy="65" r="8" ${common}/><path d="M50 57V43m0 7L28 32m22 18 22-20M50 43 31 73m19-30 23 29" ${common}/>`
  };
  return `<svg viewBox="0 0 105 105" aria-hidden="true" style="color:#a9baff">${map[type]||map.squat}</svg>`;
}

function weeksBetween(a,b){return Math.max(1,Math.ceil((b-a)/(7*86400000)))}
function goalAssessment(p){
  if(!p) return null;
  const today=new Date(); today.setHours(0,0,0,0);
  const end=new Date(p.targetDate+'T12:00:00');
  const weeks=weeksBetween(today,end);
  const kg=Math.max(0,Number(p.currentWeight)-Number(p.targetWeight));
  const rate=kg/weeks;
  const safe=rate<=1;
  const suggestedWeeks=Math.max(weeks,Math.ceil(kg/.75));
  const suggested=new Date(today); suggested.setDate(suggested.getDate()+suggestedWeeks*7);
  return {weeks,kg,rate,safe,suggestedDate:iso(suggested)};
}

function energyEstimate(p){
  if(!p?.height || !p?.age || !p?.currentWeight) return null;
  const w=Number(p.currentWeight),h=Number(p.height),a=Number(p.age);
  const sexAdj=p.sex==='female'?-161:5;
  const bmr=10*w+6.25*h-5*a+sexAdj;
  const factor={low:1.25,medium:1.4,high:1.55}[p.activity]||1.3;
  const tdee=bmr*factor;
  const target=Math.max(bmr,tdee*.82);
  return {bmr:Math.round(bmr/10)*10,tdee:Math.round(tdee/50)*50,target:Math.round(target/50)*50,protein:Math.round(Math.min(w,Number(p.targetWeight)*1.15)*1.6)};
}

function scheduleFor(date=new Date()){
  const p=state.profile;
  const days=Number(p?.trainingDays||3);
  const indices=days<=2?[1,4]:days===3?[1,3,5]:days===4?[1,2,4,6]:[1,2,3,5,6];
  const dow=(date.getDay()+6)%7;
  const pos=indices.indexOf(dow);
  if(pos<0) return {title:'Aktive Erholung',duration:45,ids:[],walk:true};
  return workoutTemplates[pos%3];
}

function render(){
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view));
  const titles={today:'Dein Tag',plan:'Trainingsplan',nutrition:'Ernährung',wiki:'Übungen',progress:'Fortschritt'};
  document.getElementById('pageTitle').textContent=titles[state.view]||'Fitnest';
  document.getElementById('dateLabel').textContent=fmtDate(new Date());
  const app=document.getElementById('app');
  if(state.view==='today') app.innerHTML=renderToday();
  if(state.view==='plan') app.innerHTML=renderPlan();
  if(state.view==='nutrition') app.innerHTML=renderNutrition();
  if(state.view==='wiki') app.innerHTML=renderWiki();
  if(state.view==='progress') app.innerHTML=renderProgress();
  bindView();
}

function renderToday(){
  if(!state.profile) return `
    <section class="hero"><span class="label">Fitnest · Build 1</span><h2>Ein Plan, der dir jeden Tag sagt, was dran ist.</h2><p>Ziel definieren, Zeitrahmen festlegen und daraus Training, Ernährung und Erinnerungen ableiten.</p><div class="hero-actions"><button class="primary" data-action="onboarding">Plan erstellen</button><button class="secondary" data-action="push">Push testen</button></div></section>
    <section class="section"><div class="section-head"><h3>Was bereits steht</h3></div><div class="card">${['Persönliches Ziel & Sicherheitscheck','Automatischer Wochenplan','Übungswiki mit Ausführung','Gewicht & Compliance Tracking','PWA und Push Infrastruktur'].map((x,i)=>`<div class="task done"><span class="task-check">✓</span><div class="task-copy"><strong>${x}</strong><small>Build 1</small></div></div>`).join('')}</div></section>`;
  const a=goalAssessment(state.profile), e=energyEstimate(state.profile), w=scheduleFor(new Date()), key=dayKey(), done=state.completed[key]||{};
  const trainingDone=!!done.training, water=Number(done.water||0), steps=Number(done.steps||0), weightDone=state.weights.some(x=>x.date===key);
  const taskCount=[trainingDone,steps>=Number(state.profile.stepGoal||8000),water>=Number(state.profile.waterGoal||2.5),weightDone].filter(Boolean).length;
  return `
    <section class="hero">
      <span class="label">${a.safe?'Ziel aktiv':'Ziel prüfen'}</span>
      <h2>${a.safe?`${a.kg.toFixed(1)} kg in ${a.weeks} Wochen`:'Zeitraum ist zu aggressiv'}</h2>
      <p>${a.safe?`Heute zählt nur der nächste Schritt. ${w.walk?'Aktive Erholung und Bewegung':'Dein Training ist vorbereitet.'}`:`Das wären ${a.rate.toFixed(1)} kg pro Woche. Fitnest erzeugt dafür keinen aggressiven Crash-Plan.`}</p>
      <div class="hero-actions"><button class="primary" data-view-go="plan">${w.walk?'Tagesziel ansehen':'Training starten'}</button><button class="secondary" data-action="edit-profile">Ziel ändern</button></div>
    </section>
    <div class="grid">
      <article class="metric"><span class="metric-icon">✓</span><div><strong>${taskCount}/4</strong><small>Tagesziele</small><div class="progressbar"><i style="width:${taskCount*25}%"></i></div></div></article>
      <article class="metric"><span class="metric-icon">⌁</span><div><strong>${e?e.target:'–'}${e?' kcal':''}</strong><small>Orientierungswert</small><div class="progressbar"><i style="width:32%"></i></div></div></article>
      <article class="metric"><span class="metric-icon">↟</span><div><strong>${steps.toLocaleString('de-DE')}</strong><small>von ${Number(state.profile.stepGoal||8000).toLocaleString('de-DE')} Schritten</small><div class="progressbar"><i style="width:${clamp(steps/(state.profile.stepGoal||8000)*100,0,100)}%"></i></div></div></article>
      <article class="metric"><span class="metric-icon">◌</span><div><strong>${water.toFixed(1)} l</strong><small>von ${Number(state.profile.waterGoal||2.5).toFixed(1)} l</small><div class="progressbar"><i style="width:${clamp(water/(state.profile.waterGoal||2.5)*100,0,100)}%"></i></div></div></article>
    </div>
    <section class="section"><div class="section-head"><h3>Heute</h3><button data-action="push">Erinnerungen</button></div><div class="card">
      ${task('training',w.walk?'45 Min. zügig gehen':`${w.title} · ${w.duration} Min.`,w.walk?'Aktive Erholung':`${w.ids.length} Übungen`,trainingDone)}
      ${task('steps',`${Number(state.profile.stepGoal||8000).toLocaleString('de-DE')} Schritte`,`${steps.toLocaleString('de-DE')} erledigt`,steps>=Number(state.profile.stepGoal||8000))}
      ${task('water',`${Number(state.profile.waterGoal||2.5).toFixed(1)} l Wasser`,`${water.toFixed(1)} l eingetragen`,water>=Number(state.profile.waterGoal||2.5))}
      ${task('weight','Gewicht eintragen',weightDone?'Heute erfasst':'10 Sekunden',weightDone)}
    </div></section>
    ${!a.safe?`<section class="section"><div class="notice">Vorschlag: Zieltermin auf <strong>${new Intl.DateTimeFormat('de-DE').format(new Date(a.suggestedDate+'T12:00:00'))}</strong> verschieben. Das entspricht etwa 0,75 kg pro Woche.</div></section>`:''}`;
}

function task(id,title,sub,done){return `<div class="task ${done?'done':''}" data-task="${id}"><button class="task-check" data-task-action="${id}">${done?'✓':'✓'}</button><div class="task-copy"><strong>${title}</strong><small>${sub}</small></div><span class="pill">${done?'Erledigt':'Offen'}</span></div>`}

function renderPlan(){
  if(!state.profile) return emptySetup();
  const start=new Date(); start.setDate(start.getDate()-((start.getDay()+6)%7));
  const days=[...Array(7)].map((_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d});
  const selected=scheduleFor(state.selectedDate);
  return `<div class="week-strip">${days.map(d=>`<button class="day-chip ${iso(d)===iso(state.selectedDate)?'active':''}" data-date="${iso(d)}"><small>${new Intl.DateTimeFormat('de-DE',{weekday:'short'}).format(d)}</small><strong>${d.getDate()}</strong></button>`).join('')}</div>
  <section class="section"><div class="workout-card"><div class="workout-top"><div><span class="eyebrow">${new Intl.DateTimeFormat('de-DE',{weekday:'long'}).format(state.selectedDate)}</span><h3>${selected.title}</h3><span class="workout-meta">${selected.duration} Minuten ${selected.ids.length?`· ${selected.ids.length} Übungen`:'· lockere Intensität'}</span></div><span class="status-dot"></span></div>
  ${selected.walk?`<div class="empty">Zügiger Spaziergang. Tempo so wählen, dass du dich noch in kurzen Sätzen unterhalten kannst.</div>`:selected.ids.map(id=>exerciseRow(exercises.find(e=>e.id===id))).join('')}
  <div class="hero-actions"><button class="primary" data-action="finish-workout">Training abschließen</button><button class="secondary" data-action="swap-workout">Anpassen</button></div></div></section>
  <section class="section"><div class="notice">Progression wird in Build 2 aus deinen echten Wiederholungen, Belastungsratings und absolvierten Einheiten automatisch angepasst.</div></section>`;
}
function exerciseRow(ex){return `<div class="exercise-row"><div class="exercise-visual">${iconSvg(ex.id)}</div><div class="exercise-info"><strong>${ex.name}</strong><small>${ex.sets} × ${ex.reps} · ${ex.group}</small></div><button data-exercise="${ex.id}" aria-label="Übung öffnen">›</button></div>`}

function renderNutrition(){
  if(!state.profile) return emptySetup();
  const e=energyEstimate(state.profile);
  return `<section class="hero"><span class="label">Tagesrahmen</span><h2>${e?`${e.target} kcal`:'Profil vervollständigen'}</h2><p>${e?`Orientierung: etwa ${e.protein} g Protein. Kein Lebensmittel ist pauschal verboten. Der Plan priorisiert Sättigung, Protein, Gemüse und Alltagstauglichkeit.`:'Alter, Größe und Aktivitätsniveau ergänzen, damit ein grober Orientierungswert berechnet werden kann.'}</p><div class="hero-actions"><button class="primary" data-action="edit-profile">Profil ergänzen</button><button class="secondary" data-action="meal-refresh">Alternativen</button></div></section>
  <section class="section"><div class="section-head"><h3>Heute vorgeschlagen</h3><button data-action="meal-refresh">Neu planen</button></div><div class="card">
  ${food('☼','Frühstück','Skyr Bowl · Beeren · Haferflocken',e?Math.round(e.target*.23):'–')}
  ${food('◒','Mittag','Hähnchen oder Tofu · Reis · Gemüse',e?Math.round(e.target*.34):'–')}
  ${food('◇','Snack','Obst · proteinreiche Komponente',e?Math.round(e.target*.13):'–')}
  ${food('◐','Abendessen','Kartoffeln · Gemüse · Fisch oder Hülsenfrüchte',e?Math.round(e.target*.30):'–')}
  </div></section>
  <section class="section"><div class="notice">Der Ernährungsbereich ist bewusst nicht als „nur das darfst du essen“ gebaut. Build 3 ergänzt Rezeptplanung, Einkaufsliste, Vorlieben, Allergien und automatische Tauschoptionen.</div></section>`;
}
function food(icon,name,desc,kcal){return `<div class="food-card"><div class="food-icon">${icon}</div><div class="food-copy"><strong>${name}</strong><small>${desc}</small></div><span class="pill">${kcal} kcal</span></div>`}

function renderWiki(){return `<div class="search"><span>⌕</span><input id="wikiSearch" placeholder="Übung oder Muskelgruppe suchen" autocomplete="off" /></div><div class="wiki-grid" id="wikiGrid">${exercises.map(wikiCard).join('')}</div>`}
function wikiCard(ex){return `<button class="wiki-card" data-exercise="${ex.id}" style="text-align:left;color:inherit;padding:0"><div class="wiki-visual">${iconSvg(ex.id)}</div><div class="wiki-copy"><strong>${ex.name}</strong><small>${ex.group}</small></div></button>`}

function renderProgress(){
  if(!state.profile) return emptySetup();
  const logs=state.weights.slice(-10), vals=logs.map(x=>Number(x.value)); const max=Math.max(...vals,Number(state.profile.currentWeight)), min=Math.min(...vals,Number(state.profile.targetWeight));
  return `<section class="hero"><span class="label">Gewichtstrend</span><h2>${logs.length?`${logs.at(-1).value} kg`:`${state.profile.currentWeight} kg`}</h2><p>Ziel: ${state.profile.targetWeight} kg bis ${new Intl.DateTimeFormat('de-DE').format(new Date(state.profile.targetDate+'T12:00:00'))}.</p><div class="hero-actions"><button class="primary" data-action="weight">Gewicht eintragen</button><button class="secondary" data-action="edit-profile">Ziel bearbeiten</button></div></section>
  <section class="section"><div class="card">${logs.length?`<div class="chart">${logs.map(x=>{const h=35+((Number(x.value)-min)/(Math.max(1,max-min)))*110;return `<div class="bar" style="height:${h}px" data-label="${x.value}"></div>`}).join('')}</div>`:`<div class="empty">Noch keine Messwerte. Trage dein erstes Gewicht ein.</div>`}</div></section>
  <section class="section"><div class="card"><div class="statline"><span>Start</span><strong>${state.profile.currentWeight} kg</strong></div><div class="statline"><span>Ziel</span><strong>${state.profile.targetWeight} kg</strong></div><div class="statline"><span>Trainingstage</span><strong>${state.profile.trainingDays} / Woche</strong></div><div class="statline"><span>Equipment</span><strong>Yogamatte</strong></div></div></section>`;
}

function emptySetup(){return `<section class="hero"><span class="label">Einrichtung fehlt</span><h2>Erst Ziel und Rahmen festlegen.</h2><p>Danach erzeugt Fitnest automatisch deinen Wochenplan.</p><div class="hero-actions"><button class="primary" data-action="onboarding">Jetzt einrichten</button></div></section>`}

function bindView(){
  document.querySelectorAll('[data-view-go]').forEach(x=>x.onclick=()=>{state.view=x.dataset.viewGo;render()});
  document.querySelectorAll('[data-action]').forEach(x=>x.onclick=()=>handleAction(x.dataset.action));
  document.querySelectorAll('[data-exercise]').forEach(x=>x.onclick=()=>openExercise(x.dataset.exercise));
  document.querySelectorAll('[data-date]').forEach(x=>x.onclick=()=>{state.selectedDate=new Date(x.dataset.date+'T12:00:00');render()});
  document.querySelectorAll('[data-task-action]').forEach(x=>x.onclick=e=>{e.stopPropagation();handleTask(x.dataset.taskAction)});
  const q=document.getElementById('wikiSearch'); if(q) q.oninput=()=>{document.getElementById('wikiGrid').innerHTML=exercises.filter(e=>(e.name+' '+e.group).toLowerCase().includes(q.value.toLowerCase())).map(wikiCard).join('');document.querySelectorAll('[data-exercise]').forEach(x=>x.onclick=()=>openExercise(x.dataset.exercise))};
}

async function handleAction(action){
  if(action==='onboarding'||action==='edit-profile') openOnboarding();
  if(action==='weight') openWeight();
  if(action==='push') await enablePush();
  if(action==='finish-workout'){const k=dayKey(state.selectedDate);state.completed[k]={...(state.completed[k]||{}),training:true};write('fitnest.completed',state.completed);toast('Training gespeichert');state.view='today';render()}
  if(action==='swap-workout') toast('Trainingsanpassung kommt in Build 2');
  if(action==='meal-refresh') toast('Neue Mahlzeitenvarianten kommen mit der KI Planung');
}

function handleTask(id){
  const k=dayKey(); state.completed[k]=state.completed[k]||{};
  if(id==='training'){state.view='plan';render();return}
  if(id==='weight'){openWeight();return}
  if(id==='water'){state.completed[k].water=clamp(Number(state.completed[k].water||0)+.5,0,5)}
  if(id==='steps') openNumberSheet('Schritte eintragen','steps',state.completed[k].steps||0,500);
  write('fitnest.completed',state.completed);syncCheckinToCloud();render();
}

function openOnboarding(){
  const p=state.profile||{};
  sheet(`
    <div class="sheet-head"><div><p class="eyebrow">Persönlicher Plan</p><h2>${state.profile?'Ziel bearbeiten':'Fitnest einrichten'}</h2></div><button data-close>×</button></div>
    <form id="profileForm" class="form-grid">
      <div class="split"><div class="field"><label>Aktuelles Gewicht</label><input name="currentWeight" type="number" inputmode="decimal" step="0.1" min="35" max="300" required value="${p.currentWeight||''}" placeholder="kg"></div><div class="field"><label>Zielgewicht</label><input name="targetWeight" type="number" inputmode="decimal" step="0.1" min="35" max="300" required value="${p.targetWeight||''}" placeholder="kg"></div></div>
      <div class="field"><label>Zieltermin</label><input name="targetDate" type="date" required min="${iso(new Date(Date.now()+7*86400000))}" value="${p.targetDate||iso(new Date(Date.now()+84*86400000))}"></div>
      <div class="split"><div class="field"><label>Größe</label><input name="height" type="number" min="120" max="230" value="${p.height||''}" placeholder="cm"></div><div class="field"><label>Alter</label><input name="age" type="number" min="16" max="100" value="${p.age||''}" placeholder="Jahre"></div></div>
      <div class="split"><div class="field"><label>Geschlecht für Energieformel</label><select name="sex"><option value="male" ${p.sex==='male'?'selected':''}>männlich</option><option value="female" ${p.sex==='female'?'selected':''}>weiblich</option></select></div><div class="field"><label>Alltag</label><select name="activity"><option value="low" ${p.activity==='low'?'selected':''}>eher sitzend</option><option value="medium" ${p.activity==='medium'?'selected':''}>gemischt</option><option value="high" ${p.activity==='high'?'selected':''}>viel aktiv</option></select></div></div>
      <div class="split"><div class="field"><label>Trainingstage / Woche</label><select name="trainingDays">${[2,3,4,5].map(n=>`<option ${Number(p.trainingDays||3)===n?'selected':''}>${n}</option>`).join('')}</select></div><div class="field"><label>Zeit / Einheit</label><select name="minutes">${[20,30,40,45].map(n=>`<option ${Number(p.minutes||30)===n?'selected':''}>${n} Min.</option>`).join('')}</select></div></div>
      <div class="split"><div class="field"><label>Schrittziel</label><input name="stepGoal" type="number" step="500" min="3000" max="20000" value="${p.stepGoal||8000}"></div><div class="field"><label>Wasserziel</label><input name="waterGoal" type="number" step="0.1" min="1" max="5" value="${p.waterGoal||2.5}"></div></div>
      <div id="goalNotice" class="notice">Fitnest prüft die gewünschte Abnahmerate vor dem Speichern. Bei aggressiven Zielen wird kein extremer Plan erzeugt.</div>
      <button class="primary" type="submit">Plan speichern</button>
      <button class="secondary" type="button" id="googleLogin">Mit Google anmelden</button>
    </form>`);
  document.getElementById('profileForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.currentTarget);const p2=Object.fromEntries(f.entries());['currentWeight','targetWeight','height','age','trainingDays','minutes','stepGoal','waterGoal'].forEach(k=>p2[k]=Number(p2[k]));const a=goalAssessment(p2);state.profile=p2;write('fitnest.profile',p2);syncProfileToCloud(p2);closeSheet();render();toast(a.safe?'Plan gespeichert':'Ziel gespeichert · Sicherheitscheck aktiv')};
  document.getElementById('googleLogin').onclick=googleLogin;
}

function openWeight(){
  const current=state.weights.at(-1)?.value||state.profile?.currentWeight||'';
  sheet(`<div class="sheet-head"><div><p class="eyebrow">Check-in</p><h2>Gewicht eintragen</h2></div><button data-close>×</button></div><form id="weightForm" class="form-grid"><div class="field"><label>Heute</label><input name="weight" type="number" inputmode="decimal" step="0.1" min="35" max="300" required value="${current}"></div><button class="primary" type="submit">Speichern</button></form>`);
  document.getElementById('weightForm').onsubmit=e=>{e.preventDefault();const v=Number(new FormData(e.currentTarget).get('weight'));const d=dayKey();state.weights=state.weights.filter(x=>x.date!==d).concat({date:d,value:v});write('fitnest.weights',state.weights);syncWeightToCloud(d,v);closeSheet();render();toast('Gewicht gespeichert')};
}

function openNumberSheet(title,key,value,step){sheet(`<div class="sheet-head"><div><p class="eyebrow">Heute</p><h2>${title}</h2></div><button data-close>×</button></div><form id="numForm" class="form-grid"><div class="field"><input name="n" type="number" step="${step}" min="0" value="${value}"></div><button class="primary" type="submit">Speichern</button></form>`);document.getElementById('numForm').onsubmit=e=>{e.preventDefault();const k=dayKey();state.completed[k]=state.completed[k]||{};state.completed[k][key]=Number(new FormData(e.currentTarget).get('n'));write('fitnest.completed',state.completed);syncCheckinToCloud();closeSheet();render()}}

function openExercise(id){const ex=exercises.find(e=>e.id===id);sheet(`<div class="sheet-head"><div><p class="eyebrow">Übungswiki · ${ex.level}</p><h2>${ex.name}</h2></div><button data-close>×</button></div><div class="wiki-visual" style="height:210px;border-radius:26px;margin-top:18px">${iconSvg(ex.id)}</div><section class="section"><div class="section-head"><h3>Ausführung</h3></div><div class="card">${ex.steps.map((s,i)=>`<div class="task"><span class="task-check" style="color:#b8c6ff">${i+1}</span><div class="task-copy"><strong>${s}</strong></div></div>`).join('')}</div></section><section class="section"><div class="section-head"><h3>Häufige Fehler</h3></div><div class="card">${ex.errors.map(s=>`<div class="task"><span class="pill">!</span><div class="task-copy"><strong>${s}</strong></div></div>`).join('')}</div></section><div class="notice">Bei Schmerzen, Schwindel oder ungewöhnlicher Atemnot Training abbrechen und medizinisch abklären.</div>`)}

function openProfile(){
  sheet(`<div class="sheet-head"><div><p class="eyebrow">Fitnest</p><h2>Einstellungen</h2></div><button data-close>×</button></div><div class="form-grid"><button class="secondary" data-sheet-action="edit">Ziel & Profil bearbeiten</button><button class="secondary" data-sheet-action="push">Push Notifications</button><button class="secondary" data-sheet-action="legal-imprint">Impressum</button><button class="secondary" data-sheet-action="legal-privacy">Datenschutz</button><button class="ghost" data-sheet-action="reset">Lokale Demo Daten löschen</button></div>`);
  document.querySelectorAll('[data-sheet-action]').forEach(x=>x.onclick=()=>{const a=x.dataset.sheetAction;if(a==='edit'){closeSheet();openOnboarding()}if(a==='push'){enablePush()}if(a==='legal-imprint')openLegal('imprint');if(a==='legal-privacy')openLegal('privacy');if(a==='reset'){localStorage.removeItem('fitnest.profile');localStorage.removeItem('fitnest.completed');localStorage.removeItem('fitnest.weights');location.reload()}})
}

function openLegal(type){
  const imprint=`<div class="legal"><h3>Impressum</h3><p><strong>Angaben gemäß § 5 DDG</strong></p><p>Christian Elies<br><em>[vollständige ladungsfähige Anschrift vor Veröffentlichung ergänzen]</em><br>Deutschland</p><p>Kontakt:<br><em>[E-Mail-Adresse ergänzen]</em></p><h3>Hinweis</h3><p>Diese Fassung enthält bewusst Platzhalter und muss vor einer öffentlichen Veröffentlichung mit den tatsächlichen Anbieterangaben vervollständigt werden.</p></div>`;
  const privacy=`<div class="legal"><h3>Datenschutzerklärung</h3><p><strong>Verantwortlicher</strong><br>Christian Elies<br><em>[Anschrift und Kontakt ergänzen]</em></p><h3>Verarbeitete Daten</h3><p>Je nach Nutzung verarbeitet Fitnest Accountdaten, Ziel- und Profildaten, Trainingsdaten, Gewichtsverläufe, Ernährungsangaben sowie Push Subscription Daten.</p><h3>Zwecke</h3><p>Bereitstellung des Accounts, Synchronisation zwischen Geräten, Erstellung persönlicher Trainings- und Ernährungspläne, Fortschrittsdarstellung und Versand angeforderter Erinnerungen.</p><h3>Dienstleister</h3><p>Geplant sind Supabase für Authentifizierung und Datenhaltung sowie Cloudflare für Hosting. Für KI Funktionen wird vor Aktivierung transparent ausgewiesen, welche Daten an den Modellanbieter übertragen werden.</p><h3>Deine Rechte</h3><p>Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch nach den jeweils anwendbaren gesetzlichen Voraussetzungen.</p><h3>Status</h3><p>Technischer Entwurf für Build 1. Vor öffentlichem Launch ist eine rechtliche Endprüfung und Vervollständigung der Verantwortlichen- und Kontaktangaben erforderlich.</p></div>`;
  document.getElementById('sheetContent').innerHTML=`<div class="sheet-inner"><div class="sheet-handle"></div><div class="sheet-head"><div><p class="eyebrow">Rechtliches</p><h2>${type==='imprint'?'Impressum':'Datenschutz'}</h2></div><button data-close>×</button></div>${type==='imprint'?imprint:privacy}</div>`;bindSheetClose();
}

function sheet(html){const d=document.getElementById('sheet');document.getElementById('sheetContent').innerHTML=`<div class="sheet-inner"><div class="sheet-handle"></div>${html}</div>`;bindSheetClose();if(!d.open)d.showModal()}
function bindSheetClose(){document.querySelectorAll('[data-close]').forEach(x=>x.onclick=closeSheet)}
function closeSheet(){document.getElementById('sheet').close()}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),2200)}

async function googleLogin(){
  if(!CONFIG.supabaseUrl||!CONFIG.supabasePublishableKey){toast('Supabase Projekt noch nicht verbunden');return}
  try{
    const sb=await ensureSupabase();
    await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:CONFIG.appUrl||location.origin}})
  }catch(err){console.error(err);toast('Google Login konnte nicht gestartet werden')}
}

async function enablePush(){
  if(!('serviceWorker'in navigator)||!('Notification'in window)){toast('Push wird auf diesem Browser nicht unterstützt');return}
  try{
    const permission=await Notification.requestPermission();if(permission!=='granted'){toast('Benachrichtigungen nicht freigegeben');return}
    const reg=await navigator.serviceWorker.ready;
    if(CONFIG.vapidPublicKey){
      const existing=await reg.pushManager.getSubscription();
      const sub=existing||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(CONFIG.vapidPublicKey)});
      localStorage.setItem('fitnest.pushSubscription',JSON.stringify(sub));
      if(state.session){
        const j=sub.toJSON();
        const sb=await ensureSupabase();
        await sb.from('push_subscriptions').upsert({user_id:state.session.user.id,endpoint:j.endpoint,p256dh:j.keys?.p256dh||'',auth_secret:j.keys?.auth||'',device_label:navigator.userAgent.slice(0,120),enabled:true,updated_at:new Date().toISOString()},{onConflict:'user_id,endpoint'});
      }
      toast('Push auf diesem Gerät aktiviert');
    }else{
      await reg.showNotification('Fitnest',{body:'Benachrichtigungen funktionieren. Server Push wird nach Supabase Verbindung aktiviert.',icon:'./assets/icon.svg',badge:'./assets/icon.svg'});
      toast('Lokaler Push Test erfolgreich');
    }
  }catch(err){console.error(err);toast('Push konnte nicht aktiviert werden')}
}
function urlBase64ToUint8Array(base64String){const padding='='.repeat((4-base64String.length%4)%4);const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');const raw=atob(base64);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)))}

async function registerSW(){if('serviceWorker'in navigator){try{await navigator.serviceWorker.register('./sw.js')}catch(e){console.warn('SW registration failed',e)}}}

document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;render()});
document.getElementById('profileButton').onclick=openProfile;
document.getElementById('sheet').addEventListener('click',e=>{if(e.target===e.currentTarget)closeSheet()});
registerSW();
bootstrapCloud();
render();
