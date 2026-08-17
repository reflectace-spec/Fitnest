import { CONFIG } from './config.js';

const BUILD='2.2';
const KEY='fitnest.progress.';
const DAY=86400000;
const S={sb:null,session:null,remote:null,reviews:read('reviews',{}),busy:false};

function read(name,fallback){try{return JSON.parse(localStorage.getItem(KEY+name))??fallback}catch{return fallback}}
function write(name,value){localStorage.setItem(KEY+name,JSON.stringify(value))}
function local(name,fallback){try{return JSON.parse(localStorage.getItem(name))??fallback}catch{return fallback}}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function iso(d=new Date()){const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)}
function parseDate(v){return new Date(String(v).slice(0,10)+'T12:00:00')}
function monday(d=new Date()){const x=new Date(d);x.setHours(12,0,0,0);x.setDate(x.getDate()-((x.getDay()+6)%7));return iso(x)}
function clamp(n,a,b){return Math.max(a,Math.min(b,n))}
function pct(n,d){return d?Math.round(clamp(n/d,0,1)*100):0}
function daysAgo(n){const d=new Date();d.setHours(23,59,59,999);d.setDate(d.getDate()-n);return d}
function profile(){return local('fitnest.profile',null)}
function toast(msg){const t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),2400)}

async function supabase(){
  if(S.sb)return S.sb;
  if(!CONFIG.supabaseUrl||!CONFIG.supabasePublishableKey)return null;
  const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');
  S.sb=createClient(CONFIG.supabaseUrl,CONFIG.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  return S.sb;
}

async function bootCloud(){
  try{
    const sb=await supabase();if(!sb)return;
    S.session=(await sb.auth.getSession()).data.session||null;
    sb.auth.onAuthStateChange((_e,s)=>{S.session=s;if(s)loadRemote().then(refreshVisible);else{S.remote=null;refreshVisible()}});
    if(S.session)await loadRemote();
  }catch(e){console.warn('progress boot',e)}
  refreshVisible();
}

async function loadRemote(){
  const sb=await supabase(),u=S.session?.user.id;if(!sb||!u)return;
  const since=iso(daysAgo(45));
  try{
    const [weights,workouts,checkins,meals,target,prof,goal,reviews,prefs]=await Promise.all([
      sb.from('body_metrics').select('measured_on,weight_kg').eq('user_id',u).gte('measured_on',since).not('weight_kg','is',null).order('measured_on'),
      sb.from('workout_sessions').select('planned_date,duration_minutes,perceived_effort,completed_at').eq('user_id',u).eq('completed',true).gte('planned_date',since).order('planned_date'),
      sb.from('daily_checkins').select('checkin_date,steps,water_l').eq('user_id',u).gte('checkin_date',since).order('checkin_date'),
      sb.from('meal_logs').select('eaten_on,slot,calories,protein_g').eq('user_id',u).gte('eaten_on',since).order('eaten_on'),
      sb.from('nutrition_targets').select('calories,protein_g,valid_from').eq('user_id',u).order('valid_from',{ascending:false}).limit(1).maybeSingle(),
      sb.from('profiles').select('training_days,session_minutes,step_goal').eq('user_id',u).maybeSingle(),
      sb.from('goals').select('target_weight_kg,target_date,start_weight_kg').eq('user_id',u).eq('status','active').order('created_at',{ascending:false}).limit(1).maybeSingle(),
      sb.from('weekly_reviews').select('*').eq('user_id',u).order('week_start',{ascending:false}).limit(12),
      sb.from('nutrition_preferences').select('meals_per_day').eq('user_id',u).maybeSingle(),
    ]);
    const errors=[weights,workouts,checkins,meals,target,prof,goal,reviews,prefs].map(x=>x.error).filter(Boolean);if(errors.length)throw errors[0];
    S.remote={weights:weights.data||[],workouts:workouts.data||[],checkins:checkins.data||[],meals:meals.data||[],target:target.data||null,profile:prof.data||null,goal:goal.data||null,reviews:reviews.data||[],prefs:prefs.data||null};
    for(const r of S.remote.reviews)S.reviews[r.week_start]=r;
    write('reviews',S.reviews);
  }catch(e){console.warn('progress cloud',e)}
}

function dataset(){
  const p=profile()||{};
  if(S.remote){
    return {
      profile:{...p,trainingDays:+(S.remote.profile?.training_days??p.trainingDays??3),minutes:+(S.remote.profile?.session_minutes??p.minutes??30),stepGoal:+(S.remote.profile?.step_goal??p.stepGoal??8000)},
      goal:{targetWeight:+(S.remote.goal?.target_weight_kg??p.targetWeight??0),targetDate:S.remote.goal?.target_date??p.targetDate,startWeight:+(S.remote.goal?.start_weight_kg??p.currentWeight??0)},
      weights:S.remote.weights.map(x=>({date:x.measured_on,value:+x.weight_kg})),
      workouts:S.remote.workouts.map(x=>({date:x.planned_date,rpe:+(x.perceived_effort||0),duration:+(x.duration_minutes||0)})),
      checkins:S.remote.checkins.map(x=>({date:x.checkin_date,steps:+(x.steps||0)})),
      meals:S.remote.meals.map(x=>({date:x.eaten_on,slot:x.slot,kcal:+(x.calories||0),protein:+(x.protein_g||0)})),
      mealsPerDay:+(S.remote.prefs?.meals_per_day||4),
    };
  }
  const completed=local('fitnest.completed',{}),nutritionLogs=local('fitnest.nutrition.logs',{});
  return {
    profile:{...p,trainingDays:+(p.trainingDays||3),minutes:+(p.minutes||30),stepGoal:+(p.stepGoal||8000)},
    goal:{targetWeight:+(p.targetWeight||0),targetDate:p.targetDate,startWeight:+(p.currentWeight||0)},
    weights:(local('fitnest.weights',[])||[]).map(x=>({date:x.date,value:+x.value})),
    workouts:(local('fitnest.workoutHistory',[])||[]).map(x=>({date:x.date,rpe:+(x.rpe||0),duration:+(x.duration||0)})),
    checkins:Object.entries(completed).map(([date,x])=>({date,steps:+(x.steps||0)})),
    meals:Object.entries(nutritionLogs).flatMap(([date,v])=>Object.entries(v||{}).map(([slot,x])=>({date,slot,kcal:+(x.calories||0),protein:+(x.protein_g||0)}))),
    mealsPerDay:+(local('fitnest.nutrition.settings',{})?.meals||4),
  };
}

function regression(items,days=30){
  const cutoff=daysAgo(days),a=items.filter(x=>parseDate(x.date)>=cutoff&&Number.isFinite(+x.value)).sort((x,y)=>x.date.localeCompare(y.date));
  if(a.length<3)return{count:a.length,slopeWeek:null,first:a[0]?.value,last:a.at(-1)?.value};
  const t0=parseDate(a[0].date).getTime(),xs=a.map(x=>(parseDate(x.date).getTime()-t0)/DAY),ys=a.map(x=>+x.value),mx=xs.reduce((s,x)=>s+x,0)/xs.length,my=ys.reduce((s,x)=>s+x,0)/ys.length;
  const den=xs.reduce((s,x)=>s+(x-mx)**2,0);if(!den)return{count:a.length,slopeWeek:0,first:ys[0],last:ys.at(-1)};
  const slope=xs.reduce((s,x,i)=>s+(x-mx)*(ys[i]-my),0)/den;
  return{count:a.length,slopeWeek:slope*7,first:ys[0],last:ys.at(-1)};
}
function avgWeight(items,days){const c=daysAgo(days),a=items.filter(x=>parseDate(x.date)>=c).map(x=>+x.value).filter(Number.isFinite);return a.length?a.reduce((s,x)=>s+x,0)/a.length:null}
function countRecent(items,days){const c=daysAgo(days);return items.filter(x=>parseDate(x.date)>=c).length}
function meanRpe(workouts,days=14){const c=daysAgo(days),a=workouts.filter(x=>parseDate(x.date)>=c).map(x=>+x.rpe).filter(x=>x>0);return a.length?a.reduce((s,x)=>s+x,0)/a.length:null}

function metrics(){
  const d=dataset(),trend30=regression(d.weights,30),trend7=regression(d.weights,7),avg7=avgWeight(d.weights,7),latest=d.weights.slice().sort((a,b)=>a.date.localeCompare(b.date)).at(-1)?.value??d.goal.startWeight??null;
  const w7=countRecent(d.workouts,7),planned=Math.max(1,+d.profile.trainingDays||3),trainingPct=pct(w7,planned);
  const c7=d.checkins.filter(x=>parseDate(x.date)>=daysAgo(7)),stepHit=c7.filter(x=>x.steps>=d.profile.stepGoal).length,stepPct=pct(stepHit,7),avgSteps=c7.length?Math.round(c7.reduce((s,x)=>s+x.steps,0)/c7.length):0;
  const m7=d.meals.filter(x=>parseDate(x.date)>=daysAgo(7)),mealPct=pct(m7.length,(d.mealsPerDay||4)*7),rpe=meanRpe(d.workouts,14);
  const adherence=Math.round(trainingPct*.45+stepPct*.30+mealPct*.25);
  const enoughPlateau=trend30.count>=8 && d.weights.some(x=>parseDate(x.date)<=daysAgo(21));
  const losingGoal=d.goal.targetWeight>0&&latest>d.goal.targetWeight;
  const plateau=!!(losingGoal&&enoughPlateau&&trend30.slopeWeek!==null&&trend30.slopeWeek>-0.10&&adherence>=65);
  const fast=trend30.count>=5&&trend30.slopeWeek!==null&&trend30.slopeWeek<-1.0;
  let forecast=null;
  if(losingGoal&&trend30.slopeWeek!==null&&trend30.slopeWeek<-0.05){const weeks=(latest-d.goal.targetWeight)/Math.abs(trend30.slopeWeek);if(Number.isFinite(weeks)&&weeks<260){const x=new Date();x.setDate(x.getDate()+Math.round(weeks*7));forecast=iso(x)}}
  return{d,latest,avg7,trend7,trend30,w7,trainingPct,stepPct,mealPct,avgSteps,rpe,adherence,plateau,fast,forecast,enoughPlateau};
}

function recommendation(m){
  const base={stepDelta:0,sessionDelta:0,trainingDelta:0,caloriesDelta:0,type:'hold',title:'Plan beibehalten',body:'Deine Daten geben aktuell keinen Grund für eine stärkere Anpassung. Konsistenz ist der nächste Schritt.'};
  if(m.fast)return{...base,type:'safety',title:'Nicht weiter verschärfen',body:'Der 30-Tage-Trend ist schneller als der von Fitnest vorgesehene Sicherheitsrahmen. Keine weitere Reduktion oder Belastungssteigerung.',stepDelta:0};
  if(m.rpe!==null&&m.rpe>=8.8)return{...base,type:'recovery',title:'Nächste Woche etwas leichter',body:'Die letzten Einheiten waren sehr anstrengend. Fitnest reduziert die geplante Trainingsdauer pro Einheit um 5 Minuten.',sessionDelta:-5};
  if(m.plateau)return{...base,type:'plateau',title:'Plateau: Aktivität moderat erhöhen',body:'Über mindestens drei Wochen zeigt der Trend kaum Abnahme, während die Umsetzung solide ist. Fitnest erhöht zunächst nur das Schrittziel um 750 Schritte pro Tag.',stepDelta:750};
  if(m.trainingPct<60&&m.w7>0)return{...base,type:'consistency',title:'Erst Konstanz, dann Progression',body:'Weniger als 60 % der geplanten Einheiten wurden abgeschlossen. Die nächste Woche bleibt unverändert, statt zusätzliche Belastung aufzubauen.'};
  if(m.rpe!==null&&m.rpe<=6.2&&m.trainingPct>=80)return{...base,type:'progress',title:'Leicht steigern',body:'Die Trainingsquote ist hoch und die Belastung moderat. Fitnest verlängert die Einheit nächste Woche um 5 Minuten.',sessionDelta:5};
  return base;
}

function tone(v){if(v>=80)return'good';if(v>=55)return'mid';return'low'}
function fmtKg(v){return v==null?'–':`${Number(v).toFixed(1).replace('.',',')} kg`}
function fmtRate(v){if(v==null)return'Noch zu wenig Daten';const s=v>0?'+':'';return`${s}${v.toFixed(2).replace('.',',')} kg/Woche`}
function fmtDate(v){return v?new Intl.DateTimeFormat('de-DE').format(parseDate(v)):'–'}
function trendText(m){if(m.trend30.slopeWeek==null)return'Für einen belastbaren 30-Tage-Trend fehlen noch Messwerte.';if(m.fast)return'Der Trend ist derzeit schneller als vorgesehen. Fitnest verschärft den Plan nicht.';if(m.plateau)return'Der Trend ist über mehrere Wochen nahezu stabil. Fitnest erkennt ein mögliches Plateau.';if(m.trend30.slopeWeek<-0.1)return'Der Gewichtstrend bewegt sich in Richtung deines Ziels.';return'Der Trend ist derzeit weitgehend stabil.'}

function renderProgress(){
  const app=document.getElementById('app');if(!app)return;
  const m=metrics(),r=recommendation(m),week=monday();
  app.dataset.progressBuild=BUILD;
  app.innerHTML=`<section class="hero progress22-hero"><span class="label">Fitnest · Build ${BUILD}</span><h2>${fmtKg(m.latest)}</h2><p>${trendText(m)}</p><div class="trend-pills"><span>7 Tage <b>${fmtRate(m.trend7.slopeWeek)}</b></span><span>30 Tage <b>${fmtRate(m.trend30.slopeWeek)}</b></span></div><div class="hero-actions"><button class="primary" data-action="weight">Gewicht eintragen</button><button class="secondary" data-p22="review">Wochenreview speichern</button></div></section>
  <section class="section"><div class="section-head"><h3>Trend</h3><span class="pill">${m.trend30.count} Messwerte / 30 Tage</span></div><div class="card p22-grid"><div class="p22-stat"><small>7-Tage-Ø</small><strong>${fmtKg(m.avg7)}</strong></div><div class="p22-stat"><small>30-Tage-Tempo</small><strong>${fmtRate(m.trend30.slopeWeek)}</strong></div><div class="p22-stat"><small>Zielgewicht</small><strong>${fmtKg(m.d.goal.targetWeight)}</strong></div><div class="p22-stat"><small>Prognose</small><strong>${m.forecast?fmtDate(m.forecast):'Noch offen'}</strong></div></div></section>
  <section class="section"><div class="section-head"><h3>Diese Woche</h3><span class="pill">Score ${m.adherence}%</span></div><div class="card p22-adherence">${adherenceRow('Training',m.trainingPct,`${m.w7} / ${m.d.profile.trainingDays} Einheiten`)}${adherenceRow('Schrittziel',m.stepPct,m.avgSteps?`Ø ${m.avgSteps.toLocaleString('de-DE')} Schritte`:'Noch keine Check-ins')}${adherenceRow('Ernährungs-Logging',m.mealPct,`${m.d.meals.filter(x=>parseDate(x.date)>=daysAgo(7)).length} Mahlzeiten erfasst`)}</div></section>
  <section class="section"><div class="p22-recommend ${esc(r.type)}"><span class="eyebrow">Automatische Wochenanpassung</span><h3>${esc(r.title)}</h3><p>${esc(r.body)}</p><div class="p22-changes">${changePill(r.stepDelta,'Schritte/Tag')}${changePill(r.sessionDelta,'Min./Einheit')}${r.caloriesDelta?changePill(r.caloriesDelta,'kcal'):''}</div><div class="hero-actions"><button class="primary" data-p22="apply" ${(!r.stepDelta&&!r.sessionDelta&&!r.trainingDelta)?'disabled':''}>Für nächste Woche übernehmen</button><button class="secondary" data-p22="details">Warum?</button></div></div></section>
  <section class="section"><div class="section-head"><h3>Wochenreviews</h3></div><div class="card p22-reviews">${reviewList()}</div></section>
  <section class="section"><div class="notice">Fitnest bewertet Trends statt einzelner Gewichtsschwankungen. Kalorien werden in Build 2.2 nicht automatisch gesenkt. Bei ungewöhnlich schnellem Gewichtsverlust oder Beschwerden wird der Plan nicht weiter verschärft.</div></section>`;
  bindProgress();
}

function adherenceRow(label,value,sub){return`<div class="p22-ad-row"><div><strong>${esc(label)}</strong><small>${esc(sub)}</small></div><div class="p22-score ${tone(value)}"><b>${value}%</b><i><span style="width:${value}%"></span></i></div></div>`}
function changePill(v,label){if(!v)return'';return`<span class="p22-change">${v>0?'+':''}${v} ${esc(label)}</span>`}
function reviewList(){const all=Object.values(S.reviews||{}).sort((a,b)=>String(b.week_start||b.weekStart).localeCompare(String(a.week_start||a.weekStart))).slice(0,6);if(!all.length)return'<div class="empty">Noch kein Wochenreview gespeichert.</div>';return all.map(x=>{const w=x.week_start||x.weekStart,m=x.metrics||{},rec=x.recommendation||{};return`<div class="p22-review-row"><div><strong>Woche ab ${fmtDate(w)}</strong><small>Score ${m.adherence??'–'} % · ${esc(rec.title||'Plan bewertet')}</small></div><span class="pill">${x.accepted_at||x.acceptedAt?'Übernommen':'Gespeichert'}</span></div>`}).join('')}

function renderTodaySignal(){
  const app=document.getElementById('app');if(!app||app.querySelector('.p22-today'))return;
  const m=metrics(),r=recommendation(m);
  app.insertAdjacentHTML('beforeend',`<section class="section p22-today"><div class="section-head"><h3>Wochensignal</h3><button data-view-go="progress">Details</button></div><div class="p22-signal ${esc(r.type)}"><div><span class="eyebrow">Build ${BUILD}</span><strong>${esc(r.title)}</strong><small>${esc(r.body)}</small></div><span class="p22-score-badge">${m.adherence}%</span></div></section>`);
}
function renderPlanSignal(){
  const app=document.getElementById('app');if(!app||app.querySelector('.p22-plan'))return;
  const m=metrics(),r=recommendation(m);
  const strip=app.querySelector('.week-strip');const html=`<section class="section p22-plan"><div class="p22-signal ${esc(r.type)}"><div><span class="eyebrow">Adaptive Woche</span><strong>${esc(r.title)}</strong><small>${esc(r.body)}</small></div><button class="secondary compact" data-view-go="progress">Review</button></div></section>`;
  if(strip)strip.insertAdjacentHTML('afterend',html);else app.insertAdjacentHTML('afterbegin',html);
}

async function saveReview(){
  if(S.busy)return;S.busy=true;
  try{
    const m=metrics(),r=recommendation(m),week=monday(),record={weekStart:week,metrics:{latest:m.latest,trend7:m.trend7.slopeWeek,trend30:m.trend30.slopeWeek,trainingPct:m.trainingPct,stepPct:m.stepPct,mealPct:m.mealPct,adherence:m.adherence,avgRpe:m.rpe,plateau:m.plateau,forecast:m.forecast},recommendation:r,status:'generated',acceptedAt:S.reviews[week]?.acceptedAt||S.reviews[week]?.accepted_at||null};
    S.reviews[week]=record;write('reviews',S.reviews);
    const sb=await supabase(),u=S.session?.user.id;
    if(sb&&u){const payload={user_id:u,week_start:week,metrics:record.metrics,recommendation:r,status:'generated',updated_at:new Date().toISOString()};const {data,error}=await sb.from('weekly_reviews').upsert(payload,{onConflict:'user_id,week_start'}).select('*').single();if(error)throw error;S.reviews[week]=data;write('reviews',S.reviews)}
    toast('Wochenreview gespeichert');renderProgress();
  }catch(e){console.warn('save review',e);toast('Wochenreview konnte nicht synchronisiert werden')}
  finally{S.busy=false}
}

async function applyRecommendation(){
  if(S.busy)return;const m=metrics(),r=recommendation(m);if(!r.stepDelta&&!r.sessionDelta&&!r.trainingDelta)return;
  S.busy=true;
  try{
    const p=profile();if(!p)throw new Error('profile missing');
    const next={...p,stepGoal:clamp(+(p.stepGoal||8000)+r.stepDelta,1000,30000),minutes:clamp(+(p.minutes||30)+r.sessionDelta,10,120),trainingDays:clamp(+(p.trainingDays||3)+r.trainingDelta,1,7)};
    localStorage.setItem('fitnest.profile',JSON.stringify(next));
    const week=monday(),now=new Date().toISOString(),reviewMetrics={latest:m.latest,trend7:m.trend7.slopeWeek,trend30:m.trend30.slopeWeek,trainingPct:m.trainingPct,stepPct:m.stepPct,mealPct:m.mealPct,adherence:m.adherence,avgRpe:m.rpe,plateau:m.plateau,forecast:m.forecast};
    const sb=await supabase(),u=S.session?.user.id;
    if(sb&&u){
      const {error:e1}=await sb.from('profiles').update({step_goal:next.stepGoal,session_minutes:next.minutes,training_days:next.trainingDays,updated_at:now}).eq('user_id',u);if(e1)throw e1;
      const {data,error:e2}=await sb.from('weekly_reviews').upsert({user_id:u,week_start:week,metrics:reviewMetrics,recommendation:r,status:'accepted',accepted_at:now,updated_at:now},{onConflict:'user_id,week_start'}).select('*').single();if(e2)throw e2;S.reviews[week]=data;
    }else S.reviews[week]={weekStart:week,metrics:reviewMetrics,recommendation:r,status:'accepted',acceptedAt:now};
    write('reviews',S.reviews);
    toast('Anpassung übernommen');setTimeout(()=>location.reload(),500);
  }catch(e){console.warn('apply recommendation',e);toast('Anpassung konnte nicht übernommen werden')}
  finally{S.busy=false}
}


async function openWeight(){
  const m=metrics(),dlg=document.getElementById('sheet'),c=document.getElementById('sheetContent');if(!dlg||!c)return;
  c.innerHTML=`<div class="sheet-head"><div><span class="eyebrow">Gewicht</span><h2>Messwert eintragen</h2></div><button data-close>×</button></div><form id="p22Weight" class="sheet-body"><div class="field"><label>Datum</label><input name="date" type="date" value="${iso()}" required></div><div class="field"><label>Gewicht in kg</label><input name="weight" type="number" min="35" max="300" step="0.1" value="${m.latest||''}" required></div><button class="primary" type="submit">Speichern</button></form>`;
  c.querySelector('[data-close]').onclick=()=>dlg.close();
  c.querySelector('#p22Weight').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget),date=String(fd.get('date')),value=Number(fd.get('weight'));if(!date||value<35||value>300)return;const arr=local('fitnest.weights',[]).filter(x=>x.date!==date);arr.push({date,value});arr.sort((a,b)=>a.date.localeCompare(b.date));localStorage.setItem('fitnest.weights',JSON.stringify(arr));try{const sb=await supabase(),u=S.session?.user.id;if(sb&&u){const {error}=await sb.from('body_metrics').upsert({user_id:u,measured_on:date,weight_kg:value},{onConflict:'user_id,measured_on'});if(error)throw error;await loadRemote()}}catch(err){console.warn('weight sync',err)}dlg.close();toast('Gewicht gespeichert');renderProgress()};
  dlg.showModal();
}

function showDetails(){
  const m=metrics(),r=recommendation(m),dlg=document.getElementById('sheet'),c=document.getElementById('sheetContent');if(!dlg||!c)return;
  c.innerHTML=`<div class="sheet-head"><div><span class="eyebrow">Adaptive Planung</span><h2>${esc(r.title)}</h2></div><button data-close>×</button></div><div class="sheet-body"><div class="card"><div class="statline"><span>30-Tage-Trend</span><strong>${fmtRate(m.trend30.slopeWeek)}</strong></div><div class="statline"><span>Trainingsquote</span><strong>${m.trainingPct}%</strong></div><div class="statline"><span>Schrittquote</span><strong>${m.stepPct}%</strong></div><div class="statline"><span>Ernährungs-Logging</span><strong>${m.mealPct}%</strong></div><div class="statline"><span>Ø RPE 14 Tage</span><strong>${m.rpe?m.rpe.toFixed(1):'–'}</strong></div></div><div class="notice">Regeln: einzelne Gewichtswerte lösen keine Änderung aus. Ein Plateau wird erst bei mindestens 8 Messwerten und mindestens 21 Tagen Verlauf geprüft. Kalorien werden nicht automatisch reduziert.</div></div>`;c.querySelector('[data-close]').onclick=()=>dlg.close();dlg.showModal();
}

function bindProgress(){
  const app=document.getElementById('app');if(!app)return;
  app.querySelector('[data-action="weight"]')?.addEventListener('click',openWeight);
  app.querySelector('[data-p22="review"]')?.addEventListener('click',saveReview);
  app.querySelector('[data-p22="apply"]')?.addEventListener('click',applyRecommendation);
  app.querySelector('[data-p22="details"]')?.addEventListener('click',showDetails);
}
function refreshVisible(){
  const title=document.getElementById('pageTitle')?.textContent,app=document.getElementById('app');if(!app)return;
  if(title==='Fortschritt'){if(app.dataset.progressBuild!==BUILD||!app.querySelector('.progress22-hero'))renderProgress()}
  else if(title==='Dein Tag')renderTodaySignal();
  else if(title==='Training')renderPlanSignal();
}

const app=document.getElementById('app');
if(app)new MutationObserver(()=>queueMicrotask(refreshVisible)).observe(app,{childList:true});
document.addEventListener('click',e=>{const own=e.target.closest('.p22-today [data-view-go],.p22-plan [data-view-go]');if(own){e.preventDefault();document.querySelector(`.tab[data-view="${own.dataset.viewGo}"]`)?.click();return}const t=e.target.closest('[data-view],[data-view-go]');if(t)setTimeout(refreshVisible,0)});
bootCloud();
