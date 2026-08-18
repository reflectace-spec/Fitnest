import { getSupabaseClient } from './app-supabase.js';

const BUILD='3.4';
const DAY=86400000;
const WEIGHTS_KEY='fitnest.weights';
const HISTORY_KEY='fitnest.workoutHistory';
const PROFILE_KEY='fitnest.profile';
const CATALOG_KEY='fitnest.exerciseCatalog.v251';
const ADHERENCE_KEY='fitnest.dailyAdherence.v28';
const TIMED_IDS=new Set(['plank','mountain','jumping-jack','wall-sit','side-plank','high-knees','bear-crawl','march-in-place']);
const NAMES={squat:'Kniebeugen',pushup:'Liegestütze','reverse-lunge':'Rückwärts Ausfallschritte','glute-bridge':'Glute Bridge','bird-dog':'Bird Dog',deadbug:'Dead Bug',plank:'Unterarmstütz',mountain:'Mountain Climbers','jumping-jack':'Jumping Jacks'};
const S={range:30,session:null,remote:null,loading:false,error:'',queued:false};

const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}};
const esc=(value='')=>String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const iso=(date=new Date())=>{const copy=new Date(date);copy.setMinutes(copy.getMinutes()-copy.getTimezoneOffset());return copy.toISOString().slice(0,10)};
const parseDate=value=>new Date(`${String(value).slice(0,10)}T12:00:00`);
const addDays=(date,amount)=>{const copy=parseDate(date);copy.setDate(copy.getDate()+amount);return iso(copy)};
const cutoff=days=>addDays(iso(),-(days-1));
const inRange=(date,days=S.range)=>String(date||'').slice(0,10)>=cutoff(days);
const fmtDate=value=>value?new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}).format(parseDate(value)):'Noch offen';
const fmtShort=value=>new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit'}).format(parseDate(value));
const fmtKg=value=>Number.isFinite(Number(value))?`${Number(value).toFixed(1).replace('.',',')} kg`:'Noch kein Wert';
const pct=(done,total)=>total?Math.round(clamp(done/total,0,1)*100):null;

function toast(message){const node=document.getElementById('toast');if(!node)return;node.textContent=message;node.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),3000)}
function profile(){return read(PROFILE_KEY,{})||{}}
function catalog(){return read(CATALOG_KEY,[])||[]}
function exerciseName(id){return catalog().find(item=>item.id===id)?.name||NAMES[id]||String(id||'Übung').replaceAll('-',' ')}

function mergeBy(items,key){const map=new Map();for(const item of items)if(item?.[key])map.set(String(item[key]),item);return[...map.values()]}
function localAdherence(){
  const user=S.session?.user?.id||'local';
  return Object.values({...read(`${ADHERENCE_KEY}.local`,{}),...read(`${ADHERENCE_KEY}.${user}`,{})});
}
function data(){
  const localWeights=(read(WEIGHTS_KEY,[])||[]).map(item=>({date:item.date,value:Number(item.value)}));
  const remoteWeights=(S.remote?.weights||[]).map(item=>({date:item.measured_on,value:Number(item.weight_kg)}));
  const localHistory=read(HISTORY_KEY,[])||[];
  const remoteHistory=(S.remote?.sessions||[]).map(item=>({id:item.id,date:item.planned_date,title:item.workout_type,duration:Number(item.duration_minutes||0),rpe:Number(item.perceived_effort||0),completedAt:item.completed_at,exerciseLog:item.exercise_log||[],source:'cloud'}));
  const weights=mergeBy([...localWeights,...remoteWeights],'date').filter(item=>Number.isFinite(item.value)).sort((a,b)=>a.date.localeCompare(b.date));
  const workouts=mergeBy([...localHistory,...remoteHistory],'id').filter(item=>item.date).sort((a,b)=>String(b.completedAt||b.date).localeCompare(String(a.completedAt||a.date)));
  const adherence=mergeBy([...localAdherence(),...(S.remote?.adherence||[])].map(item=>({...item,_key:`${item.activity_date}|${item.item_type}|${item.item_key}`})),'_key');
  const p=profile(),goal=S.remote?.goal||null;
  return{weights,workouts,adherence,goal:{target:Number(goal?.target_weight_kg??p.targetWeight??0),date:goal?.target_date||p.targetDate||'',start:Number(goal?.start_weight_kg??p.currentWeight??0)}};
}

function regression(items){
  if(items.length<3)return null;
  const first=parseDate(items[0].date).getTime(),xs=items.map(item=>(parseDate(item.date).getTime()-first)/DAY),ys=items.map(item=>item.value);
  const avgX=xs.reduce((sum,value)=>sum+value,0)/xs.length,avgY=ys.reduce((sum,value)=>sum+value,0)/ys.length;
  const denominator=xs.reduce((sum,value)=>sum+(value-avgX)**2,0);if(!denominator)return 0;
  return xs.reduce((sum,value,index)=>sum+(value-avgX)*(ys[index]-avgY),0)/denominator;
}
function weightStats(d){
  const all=d.weights,items=all.filter(item=>inRange(item.date)),latest=all.at(-1)?.value??d.goal.start??null,first=items[0]?.value??null,change=first==null||latest==null?null:latest-first,slope=regression(items),weekly=slope==null?null:slope*7;
  let projection='';
  if(items.length>=3&&latest&&d.goal.target&&slope&&((latest>d.goal.target&&slope<-.005)||(latest<d.goal.target&&slope>.005))){
    const days=(d.goal.target-latest)/slope;if(days>0&&days<1825)projection=addDays(iso(),Math.round(days));
  }
  return{items,latest,change,weekly,projection};
}
function setCount(workout){return(workout.exerciseLog||[]).flatMap(item=>item.skipped?[]:item.sets||[]).filter(set=>set.completed).length}
function workoutStats(d){
  const items=d.workouts.filter(item=>inRange(item.date)),durations=items.map(item=>Number(item.duration||0)).filter(value=>value>0),rpes=items.map(item=>Number(item.rpe||0)).filter(value=>value>0),sets=items.reduce((sum,item)=>sum+setCount(item),0);
  return{items,count:items.length,duration:durations.length?Math.round(durations.reduce((sum,value)=>sum+value,0)/durations.length):0,rpe:rpes.length?(rpes.reduce((sum,value)=>sum+value,0)/rpes.length).toFixed(1):null,sets};
}
function adherenceStats(d){
  const items=d.adherence.filter(item=>inRange(item.activity_date)),done=item=>item.status==='completed'||item.status==='replaced',byType=type=>{const rows=items.filter(item=>item.item_type===type);return{done:rows.filter(done).length,total:rows.length,value:pct(rows.filter(done).length,rows.length)}};
  return{items,training:byType('training'),meal:byType('meal')};
}
function performance(d){
  const sessions=d.workouts.filter(item=>inRange(item.date)).slice().reverse(),map=new Map();
  for(const session of sessions)for(const item of session.exerciseLog||[]){
    if(item.skipped||!item.exerciseId)continue;
    const values=(item.sets||[]).filter(set=>set.completed).map(set=>Number(set.value||0)).filter(value=>value>0);if(!values.length)continue;
    const peak=Math.max(...values),row=map.get(item.exerciseId)||{id:item.exerciseId,values:[],lastDate:''};row.values.push(peak);row.lastDate=session.date;map.set(item.exerciseId,row);
  }
  return[...map.values()].map(row=>{const current=row.values.at(-1),before=row.values.slice(0,-1),previous=before.length?Math.max(...before):null;return{...row,current,previous,delta:previous==null?null:current-previous,unit:TIMED_IDS.has(row.id)?'Sek.':'Wdh.'}}).sort((a,b)=>b.lastDate.localeCompare(a.lastDate)).slice(0,4);
}

function chart(items,target){
  if(items.length<2)return`<div class="v34-empty-chart"><strong>Noch zu wenig Messwerte</strong><span>Trage mindestens zwei Gewichte ein, damit der Verlauf sichtbar wird.</span></div>`;
  const width=680,height=220,pad={x:26,y:24},values=items.map(item=>item.value),min=Math.min(...values),max=Math.max(...values),span=Math.max(1,max-min),lo=min-span*.18,hi=max+span*.18,first=parseDate(items[0].date).getTime(),last=parseDate(items.at(-1).date).getTime(),timeSpan=Math.max(DAY,last-first);
  const point=item=>({x:pad.x+(parseDate(item.date).getTime()-first)/timeSpan*(width-pad.x*2),y:pad.y+(hi-item.value)/(hi-lo)*(height-pad.y*2)}),points=items.map(point),path=points.map((p,index)=>`${index?'L':'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '),targetY=target>=lo&&target<=hi?pad.y+(hi-target)/(hi-lo)*(height-pad.y*2):null;
  return`<div class="v34-chart-wrap"><svg class="v34-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gewichtsverlauf der letzten ${S.range} Tage">${targetY!=null?`<line class="v34-target-line" x1="${pad.x}" y1="${targetY.toFixed(1)}" x2="${width-pad.x}" y2="${targetY.toFixed(1)}"></line><text class="v34-target-label" x="${width-pad.x}" y="${Math.max(13,targetY-7).toFixed(1)}">Ziel ${String(target).replace('.',',')} kg</text>`:''}<path class="v34-chart-area" d="${path} L ${points.at(-1).x.toFixed(1)} ${height-pad.y} L ${points[0].x.toFixed(1)} ${height-pad.y} Z"></path><path class="v34-chart-line" d="${path}"></path>${points.map((p,index)=>`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${index===points.length-1?5:3}"><title>${fmtDate(items[index].date)}: ${fmtKg(items[index].value)}</title></circle>`).join('')}</svg><div class="v34-chart-axis"><span>${fmtShort(items[0].date)}</span><span>${fmtShort(items.at(-1).date)}</span></div></div>`;
}
function formatDelta(value,unit='kg'){if(value==null)return'Noch offen';const sign=value>0?'+':'';return`${sign}${Number(value).toFixed(1).replace('.',',')} ${unit}`}
function metric(label,value,sub=''){return`<article class="v34-metric"><small>${esc(label)}</small><strong>${esc(value)}</strong>${sub?`<span>${esc(sub)}</span>`:''}</article>`}
function score(label,row){return`<article class="v34-score"><div><strong>${esc(label)}</strong><span>${row.total?`${row.done} von ${row.total} Rückmeldungen`:'Noch keine Rückmeldung'}</span></div><b>${row.value==null?'–':`${row.value}%`}</b><i><span style="width:${row.value||0}%"></span></i></article>`}
function performanceCards(rows){
  if(!rows.length)return'<div class="v34-empty"><strong>Noch keine Leistungsdaten</strong><span>Abgeschlossene Sätze aus dem geführten Training erscheinen automatisch hier.</span></div>';
  return rows.map(row=>`<article class="v34-performance"><div><small>${fmtShort(row.lastDate)}</small><strong>${esc(exerciseName(row.id))}</strong></div><div><b>${row.current} ${row.unit}</b><span>${row.delta==null?'Erster Wert':row.delta>0?`+${row.delta} zum vorherigen Bestwert`:row.delta===0?'Bestwert bestätigt':`${row.delta} zum vorherigen Bestwert`}</span></div></article>`).join('');
}
function heatmap(adherence,workouts){
  const days=[];for(let offset=27;offset>=0;offset--){const date=addDays(iso(),-offset),rows=adherence.filter(item=>item.activity_date===date),done=rows.filter(item=>item.status==='completed'||item.status==='replaced').length,trained=workouts.some(item=>item.date===date);days.push({date,level:clamp(done+(trained?1:0),0,3)})}
  return`<div class="v34-heat" role="img" aria-label="Aktivität der letzten 28 Tage">${days.map(day=>`<span class="level-${day.level}" title="${fmtDate(day.date)}"></span>`).join('')}</div><div class="v34-heat-legend"><span>Vor 4 Wochen</span><span>Heute</span></div>`;
}
function milestones(d,w,workouts,performanceRows){
  const rows=[];if(d.weights.at(-1))rows.push({icon:'○',title:'Letzte Messung',body:`${fmtKg(d.weights.at(-1).value)} am ${fmtDate(d.weights.at(-1).date)}`});if(workouts.items[0])rows.push({icon:'✓',title:'Letztes Training',body:`${workouts.items[0].title||'Training'} am ${fmtDate(workouts.items[0].date)}`});if(performanceRows[0])rows.push({icon:'↗',title:'Aktueller Leistungswert',body:`${exerciseName(performanceRows[0].id)} mit ${performanceRows[0].current} ${performanceRows[0].unit}`});if(w.projection)rows.push({icon:'◎',title:'Trendprojektion',body:`Ziel bei gleichbleibendem Trend etwa am ${fmtDate(w.projection)}`});return rows.slice(0,4).map(row=>`<article><i>${row.icon}</i><div><strong>${esc(row.title)}</strong><span>${esc(row.body)}</span></div></article>`).join('')||'<div class="v34-empty"><strong>Dein Verlauf beginnt hier</strong><span>Neue Messungen und Trainings werden automatisch ergänzt.</span></div>';
}

function render(){
  S.queued=false;const app=document.getElementById('app');if(!app||document.getElementById('pageTitle')?.textContent!=='Fortschritt')return;
  const d=data(),w=weightStats(d),workouts=workoutStats(d),adherence=adherenceStats(d),performances=performance(d),signature=JSON.stringify([S.range,S.loading,S.error,d.weights.length,d.weights.at(-1),d.workouts.length,d.workouts[0]?.completedAt,d.adherence.length]);
  if(app.dataset.v34Signature===signature&&app.querySelector('[data-v34-root]'))return;
  app.dataset.progressBuild='2.2';app.dataset.v34Signature=signature;
  app.innerHTML=`<div data-v34-root data-build="${BUILD}"><section class="hero progress22-hero v34-hero"><div><span class="label">Fortschritt · Build ${BUILD}</span><h2>${fmtKg(w.latest)}</h2><p>${w.items.length>=3?`Dein Trend liegt bei ${formatDelta(w.weekly,'kg pro Woche')}.`:'Mit drei Messwerten wird dein Wochentrend berechnet.'}</p></div><div class="hero-actions"><button class="primary" type="button" data-v34-weight>Gewicht eintragen</button><button class="secondary" type="button" data-v34-refresh ${S.loading?'disabled':''}>${S.loading?'Wird aktualisiert …':'Daten aktualisieren'}</button></div>${S.error?`<div class="v34-sync-error">Cloud Daten konnten nicht vollständig geladen werden. Lokale Werte bleiben sichtbar.</div>`:''}</section>
  <section class="section"><div class="v34-toolbar"><div><small>Zeitraum</small><div class="v34-ranges" role="group" aria-label="Zeitraum auswählen">${[7,30,90].map(days=>`<button type="button" class="${S.range===days?'active':''}" data-v34-range="${days}" aria-pressed="${S.range===days}">${days} Tage</button>`).join('')}</div></div><button class="ghost" type="button" data-v34-export>CSV exportieren</button></div></section>
  <section class="section"><div class="section-head"><div><small>Gewicht</small><h3>Verlauf und Ziel</h3></div><span class="pill">${w.items.length} Messwerte</span></div><div class="card v34-weight-card">${chart(w.items,d.goal.target)}<div class="v34-metric-grid">${metric('Aktuell',fmtKg(w.latest))}${metric(`Änderung in ${S.range} Tagen`,formatDelta(w.change))}${metric('Wochentrend',w.weekly==null?'Noch offen':formatDelta(w.weekly,'kg'))}${metric('Trendprojektion',w.projection?fmtDate(w.projection):'Noch offen',d.goal.target?`Ziel ${fmtKg(d.goal.target)} · nur Fortschreibung`:'Mindestens drei passende Werte nötig')}</div></div></section>
  <section class="section"><div class="section-head"><div><small>Training</small><h3>Deine Leistung</h3></div><span class="pill">${workouts.count} Einheiten</span></div><div class="v34-metric-grid v34-training-grid">${metric('Abgeschlossen',String(workouts.count),'Einheiten')}${metric('Ø Dauer',workouts.duration?`${workouts.duration} Min.`:'Noch offen')}${metric('Ø RPE',workouts.rpe||'Noch offen','Skala 1 bis 10')}${metric('Sätze',String(workouts.sets),'abgeschlossen')}</div><div class="card v34-performance-list"><h4>Übungsentwicklung</h4>${performanceCards(performances)}</div></section>
  <section class="section"><div class="section-head"><div><small>Umsetzung</small><h3>Rückmeldungen</h3></div><span class="pill">${S.range} Tage</span></div><div class="card v34-score-grid">${score('Training',adherence.training)}${score('Mahlzeiten',adherence.meal)}</div><div class="card v34-activity"><div><h4>Aktivität</h4><span>Letzte 28 Tage</span></div>${heatmap(d.adherence,d.workouts)}</div></section>
  <section class="section"><div class="section-head"><div><small>Chronik</small><h3>Aktuelle Meilensteine</h3></div></div><div class="card v34-milestones">${milestones(d,w,workouts,performances)}</div></section>
  <section class="section"><div class="notice v34-health-note"><strong>Vorbereitet für Gesundheitsdaten</strong><span>Der CSV Export macht deine Daten portabel. Eine direkte Verbindung zu Apple Health oder Health Connect benötigt später eine native App Anbindung.</span></div></section></div>`;
  bind();document.dispatchEvent(new CustomEvent('fitnest:v34-progress-rendered'));
}

function queueRender(){if(S.queued)return;S.queued=true;queueMicrotask(render)}
function bind(){
  const root=document.querySelector('[data-v34-root]');if(!root)return;
  root.querySelectorAll('[data-v34-range]').forEach(button=>button.onclick=()=>{S.range=Number(button.dataset.v34Range)||30;render()});
  root.querySelector('[data-v34-weight]')?.addEventListener('click',openWeight);
  root.querySelector('[data-v34-refresh]')?.addEventListener('click',()=>loadCloud(true));
  root.querySelector('[data-v34-export]')?.addEventListener('click',exportCsv);
}
function openWeight(){
  const d=data(),latest=d.weights.at(-1)?.value||profile().currentWeight||'',dialog=document.getElementById('sheet'),content=document.getElementById('sheetContent');if(!dialog||!content)return;
  content.innerHTML=`<div class="sheet-head"><div><span class="eyebrow">Fortschritt</span><h2>Gewicht eintragen</h2></div><button type="button" data-v34-close aria-label="Schließen">×</button></div><form class="sheet-body v34-weight-form" data-v34-weight-form><label class="field">Datum<input name="date" type="date" value="${iso()}" max="${iso()}" required></label><label class="field">Gewicht in kg<input name="weight" type="number" inputmode="decimal" min="35" max="300" step="0.1" value="${latest}" required></label><p>Der Messwert wird lokal gespeichert und bei angemeldetem Account mit deiner geschützten Cloud synchronisiert.</p><button class="primary" type="submit">Messwert speichern</button></form>`;
  content.querySelector('[data-v34-close]').onclick=()=>dialog.close();content.querySelector('[data-v34-weight-form]').onsubmit=saveWeight;dialog.showModal();
}
async function saveWeight(event){
  event.preventDefault();const button=event.currentTarget.querySelector('button[type="submit"]'),form=new FormData(event.currentTarget),date=String(form.get('date')||''),value=Number(form.get('weight'));if(!date||date>iso()||value<35||value>300){toast('Bitte prüfe Datum und Gewicht.');return}button.disabled=true;button.textContent='Wird gespeichert …';
  const items=(read(WEIGHTS_KEY,[])||[]).filter(item=>item.date!==date);items.push({date,value});items.sort((a,b)=>a.date.localeCompare(b.date));write(WEIGHTS_KEY,items);
  let cloudSaved=false;
  try{const current=await currentSession();if(current?.user?.id){const result=await (await getSupabaseClient()).from('body_metrics').upsert({user_id:current.user.id,measured_on:date,weight_kg:value},{onConflict:'user_id,measured_on'});if(result.error)throw result.error;cloudSaved=true;await loadCloud(false)}}catch(error){console.error('v34 weight sync',error)}
  document.getElementById('sheet')?.close();render();toast(cloudSaved?'Gewicht gespeichert und synchronisiert':'Gewicht lokal gespeichert');
}
function csvCell(value){const string=String(value??'');return/[";,\n]/.test(string)?`"${string.replaceAll('"','""')}"`:string}
function exportCsv(){
  const d=data(),rows=[['Typ','Datum','Bezeichnung','Wert','Einheit','Status']];
  for(const item of d.weights)rows.push(['Gewicht',item.date,'Körpergewicht',item.value,'kg','']);
  for(const item of d.workouts)rows.push(['Training',item.date,item.title||'Training',item.duration||'',item.duration?'Minuten':'','abgeschlossen']);
  for(const item of d.adherence)rows.push(['Rückmeldung',item.activity_date,item.item_type==='meal'?'Mahlzeit':'Training',item.item_key||'',item.item_type,item.status||'']);
  const csv='\ufeff'+rows.map(row=>row.map(csvCell).join(';')).join('\n'),blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`fitnest-fortschritt-${iso()}.csv`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('CSV Export erstellt');
}
async function currentSession(){if(S.session?.user?.id)return S.session;try{return S.session=(await(await getSupabaseClient()).auth.getSession()).data.session||null}catch{return null}}
async function loadCloud(showState=false){
  if(S.loading)return;S.loading=true;S.error='';if(showState)render();
  try{
    const current=await currentSession();if(!current?.user?.id){S.remote=null;return}
    const db=await getSupabaseClient(),user=current.user.id,from=cutoff(100),[weights,sessions,adherence,goal]=await Promise.all([
      db.from('body_metrics').select('measured_on,weight_kg').eq('user_id',user).gte('measured_on',from).order('measured_on',{ascending:true}),
      db.from('workout_sessions').select('id,planned_date,workout_type,duration_minutes,perceived_effort,exercise_log,completed_at').eq('user_id',user).eq('completed',true).gte('planned_date',from).order('completed_at',{ascending:false}),
      db.from('daily_adherence').select('activity_date,item_type,item_key,status,difficulty,energy,metadata,updated_at').eq('user_id',user).gte('activity_date',from).order('activity_date',{ascending:true}),
      db.from('goals').select('target_weight_kg,target_date,start_weight_kg').eq('user_id',user).eq('status','active').order('created_at',{ascending:false}).limit(1).maybeSingle(),
    ]);const error=[weights,sessions,adherence,goal].map(result=>result.error).find(Boolean);if(error)throw error;S.remote={weights:weights.data||[],sessions:sessions.data||[],adherence:adherence.data||[],goal:goal.data||null};if(showState)toast('Fortschritt aktualisiert');
  }catch(error){console.error('v34 progress cloud',error);S.error=error.message||'Cloud nicht erreichbar'}finally{S.loading=false;render()}
}
function init(){
  const app=document.getElementById('app');if(app)new MutationObserver(queueRender).observe(app,{childList:true});
  document.addEventListener('click',event=>{if(event.target.closest('[data-view="progress"],[data-view-go="progress"]'))setTimeout(queueRender,0)});
  document.addEventListener('fitnest:cloud-synced',()=>loadCloud(false));
  document.addEventListener('fitnest:v28-adherence-saved',queueRender);
  void loadCloud(false);setTimeout(queueRender,0);
}

init();
