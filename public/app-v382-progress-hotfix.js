import { getSupabaseClient } from './app-supabase.js';

const BUILD='3.8.2';
const WEIGHTS_KEY='fitnest.weights';
const PROFILE_KEY='fitnest.profile';
const S={range:90,remote:[],goal:null,loading:false,queued:false,lastCloudLoad:0};

const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const iso=(date=new Date())=>{const copy=new Date(date);copy.setMinutes(copy.getMinutes()-copy.getTimezoneOffset());return copy.toISOString().slice(0,10)};
const parseDate=value=>new Date(`${String(value).slice(0,10)}T12:00:00`);
const fmtDate=value=>new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit'}).format(parseDate(value));
const fmtKg=value=>Number.isFinite(Number(value))?`${Number(value).toFixed(1).replace('.',',')} kg`:'Noch offen';
const fmtDelta=value=>{if(!Number.isFinite(Number(value)))return'Noch offen';const number=Number(value),sign=number>0?'+':'';return`${sign}${number.toFixed(1).replace('.',',')} kg`};

function localWeights(){
  return (read(WEIGHTS_KEY,[])||[])
    .map(item=>({date:String(item?.date||'').slice(0,10),value:Number(item?.value)}))
    .filter(item=>/^\d{4}-\d{2}-\d{2}$/.test(item.date)&&Number.isFinite(item.value));
}

function allWeights(){
  const map=new Map();
  for(const item of S.remote||[])if(item?.measured_on&&Number.isFinite(Number(item.weight_kg)))map.set(String(item.measured_on).slice(0,10),{date:String(item.measured_on).slice(0,10),value:Number(item.weight_kg)});
  for(const item of localWeights())map.set(item.date,item);
  return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
}

function currentGoal(){
  const profile=read(PROFILE_KEY,{})||{};
  return {
    target:Number(S.goal?.target_weight_kg??profile.targetWeight??0),
    start:Number(S.goal?.start_weight_kg??profile.currentWeight??0),
  };
}

function rangeWeights(items){
  if(S.range==='all')return items;
  const days=Number(S.range)||90,from=new Date();from.setHours(12,0,0,0);from.setDate(from.getDate()-(days-1));
  return items.filter(item=>parseDate(item.date)>=from);
}

function progressPercent(start,current,target){
  if(![start,current,target].every(Number.isFinite)||start===target)return null;
  const total=target-start,done=current-start;
  if(total===0)return null;
  return Math.round(clamp(done/total,0,1)*100);
}

function svgChart(items,target){
  if(!items.length)return'<div class="v382-empty"><strong>Noch keine Gewichtsdaten</strong><span>Trage deinen ersten Messwert ein. Danach entsteht hier automatisch dein Verlauf.</span></div>';

  const width=720,height=270,pad={left:48,right:22,top:25,bottom:36};
  const values=items.map(item=>item.value),latest=items.at(-1)?.value;
  let min=Math.min(...values),max=Math.max(...values),span=Math.max(.8,max-min);
  min-=span*.22;max+=span*.22;
  const targetVisible=Number.isFinite(target)&&target>0&&Math.abs(target-latest)<=Math.max(12,span*5);
  if(targetVisible){min=Math.min(min,target-1);max=Math.max(max,target+1)}
  span=Math.max(.8,max-min);

  const firstTime=parseDate(items[0].date).getTime(),lastTime=parseDate(items.at(-1).date).getTime(),timeSpan=Math.max(86400000,lastTime-firstTime);
  const point=item=>({x:pad.left+(parseDate(item.date).getTime()-firstTime)/timeSpan*(width-pad.left-pad.right),y:pad.top+(max-item.value)/span*(height-pad.top-pad.bottom)});
  let points=items.map(point);
  if(items.length===1)points=[{x:(pad.left+width-pad.right)/2,y:point(items[0]).y}];
  const path=points.map((p,index)=>`${index?'L':'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area=`${path} L ${points.at(-1).x.toFixed(1)} ${height-pad.bottom} L ${points[0].x.toFixed(1)} ${height-pad.bottom} Z`;
  const grid=[0,.5,1].map(ratio=>{const y=pad.top+ratio*(height-pad.top-pad.bottom),value=max-ratio*span;return`<line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${width-pad.right}" y2="${y.toFixed(1)}"></line><text x="${pad.left-8}" y="${(y+4).toFixed(1)}">${value.toFixed(1).replace('.',',')}</text>`}).join('');
  const targetY=targetVisible?pad.top+(max-target)/span*(height-pad.top-pad.bottom):null;
  const circles=points.map((p,index)=>`<circle class="${index===points.length-1?'latest':''}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${index===points.length-1?5.5:3.5}"><title>${fmtDate(items[index].date)} · ${fmtKg(items[index].value)}</title></circle>`).join('');
  const latestPoint=points.at(-1),latestLabel=`<g class="v382-latest"><rect x="${Math.max(pad.left,latestPoint.x-64).toFixed(1)}" y="${Math.max(4,latestPoint.y-43).toFixed(1)}" width="60" height="28" rx="10"></rect><text x="${Math.max(pad.left+30,latestPoint.x-34).toFixed(1)}" y="${Math.max(22,latestPoint.y-24).toFixed(1)}">${Number(latest).toFixed(1).replace('.',',')}</text></g>`;

  return `<div class="v382-chart-wrap"><svg class="v382-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gewichtsverlauf"><g class="v382-grid">${grid}</g>${targetY!=null?`<line class="v382-target" x1="${pad.left}" y1="${targetY.toFixed(1)}" x2="${width-pad.right}" y2="${targetY.toFixed(1)}"></line><text class="v382-target-label" x="${width-pad.right}" y="${Math.max(14,targetY-8).toFixed(1)}">Ziel ${Number(target).toFixed(1).replace('.',',')} kg</text>`:''}<path class="v382-area" d="${area}"></path><path class="v382-line" d="${path}"></path>${circles}${latestLabel}<text class="v382-axis-label" x="${pad.left}" y="${height-8}">${fmtDate(items[0].date)}</text><text class="v382-axis-label end" x="${width-pad.right}" y="${height-8}">${fmtDate(items.at(-1).date)}</text></svg></div>`;
}

function progressHtml(){
  const all=allWeights(),items=rangeWeights(all),goal=currentGoal(),latest=all.at(-1)?.value??null,first=items[0]?.value??null,change=latest==null||first==null?null:latest-first,start=Number.isFinite(goal.start)&&goal.start>0?goal.start:all[0]?.value,progress=latest!=null&&goal.target>0?progressPercent(Number(start),Number(latest),Number(goal.target)):null;
  const rangeLabel=S.range==='all'?'Gesamt':`${S.range} Tage`;
  return `<section class="section v382-weight-progress" data-v382-progress data-signature="${S.range}|${all.length}|${all.at(-1)?.date||''}|${latest??''}|${goal.target||''}"><div class="section-head v382-head"><div><small>Gewichtsverlauf</small><h3>Dein Fortschritt</h3></div><span class="pill">Build ${BUILD}</span></div><div class="card v382-chart-card"><div class="v382-chart-top"><div><strong>${fmtKg(latest)}</strong><span>${items.length} Messwerte · ${rangeLabel}</span></div><div class="v382-ranges" role="group" aria-label="Zeitraum auswählen"><button type="button" data-v382-range="30" class="${S.range===30?'active':''}">30 T</button><button type="button" data-v382-range="90" class="${S.range===90?'active':''}">90 T</button><button type="button" data-v382-range="all" class="${S.range==='all'?'active':''}">Gesamt</button></div></div>${svgChart(items,goal.target)}<div class="v382-summary"><article><small>Änderung</small><strong>${fmtDelta(change)}</strong><span>${rangeLabel}</span></article><article><small>Seit Start</small><strong>${latest==null||!Number.isFinite(Number(start))?'Noch offen':fmtDelta(latest-Number(start))}</strong><span>${Number.isFinite(Number(start))?`Start ${fmtKg(start)}`:'Startgewicht fehlt'}</span></article><article><small>Ziel</small><strong>${goal.target>0?fmtKg(goal.target):'Noch offen'}</strong><span>${progress==null?'Zielgewicht hinterlegen':`${progress}% des Weges`}</span></article></div>${goal.target>0&&progress!=null?`<div class="v382-goal-progress" aria-label="${progress}% Fortschritt zum Ziel"><span style="width:${progress}%"></span></div>`:''}</div></section>`;
}

function bindRanges(root){
  root.querySelectorAll('[data-v382-range]').forEach(button=>button.onclick=()=>{S.range=button.dataset.v382Range==='all'?'all':Number(button.dataset.v382Range)||90;queueRender(true)});
}

function renderProgress(force=false){
  if(document.getElementById('pageTitle')?.textContent!=='Fortschritt')return;
  const app=document.getElementById('app');if(!app)return;
  if(app.querySelector('[data-v34-root]'))return;
  const hero=app.querySelector('.progress22-hero');if(!hero)return;
  const html=progressHtml(),signature=html.match(/data-signature="([^"]*)"/)?.[1]||'';
  let section=app.querySelector('[data-v382-progress]');
  if(section&&!force&&section.dataset.signature===signature)return;
  if(section){section.outerHTML=html;section=app.querySelector('[data-v382-progress]')}
  else{hero.insertAdjacentHTML('afterend',html);section=app.querySelector('[data-v382-progress]')}
  if(section)bindRanges(section);
}

function normalizeSheet(){
  const content=document.getElementById('sheetContent');if(!content||!content.childNodes.length)return;
  if(content.children.length===1&&content.firstElementChild?.classList.contains('sheet-inner'))return;
  const wrapper=document.createElement('div');wrapper.className='sheet-inner v382-legacy-sheet';
  while(content.firstChild)wrapper.appendChild(content.firstChild);
  content.appendChild(wrapper);
}

function queueRender(force=false){
  if(S.queued&&!force)return;
  S.queued=true;
  queueMicrotask(()=>{S.queued=false;normalizeSheet();renderProgress(force)});
}

async function loadCloud(force=false){
  if(S.loading)return;
  if(!force&&Date.now()-S.lastCloudLoad<30000){queueRender();return}
  S.loading=true;
  try{
    const db=await getSupabaseClient();if(!db)return;
    const session=(await db.auth.getSession()).data.session,user=session?.user?.id;if(!user){S.remote=[];S.goal=null;return}
    const [weights,goal]=await Promise.all([
      db.from('body_metrics').select('measured_on,weight_kg').eq('user_id',user).not('weight_kg','is',null).order('measured_on'),
      db.from('goals').select('target_weight_kg,start_weight_kg').eq('user_id',user).eq('status','active').order('created_at',{ascending:false}).limit(1).maybeSingle(),
    ]);
    if(weights.error)throw weights.error;if(goal.error)throw goal.error;
    S.remote=weights.data||[];S.goal=goal.data||null;S.lastCloudLoad=Date.now();
  }catch(error){console.warn('v382 progress load',error)}finally{S.loading=false;queueRender(true)}
}

function init(){
  const app=document.getElementById('app'),sheetContent=document.getElementById('sheetContent');
  if(app)new MutationObserver(()=>queueRender()).observe(app,{childList:true});
  if(sheetContent)new MutationObserver(normalizeSheet).observe(sheetContent,{childList:true});
  document.addEventListener('click',event=>{if(event.target.closest('[data-view="progress"],[data-view-go="progress"]'))setTimeout(()=>{queueRender();void loadCloud()},0)});
  document.addEventListener('fitnest:cloud-synced',()=>void loadCloud(true));
  window.addEventListener('storage',event=>{if(event.key===WEIGHTS_KEY||event.key===PROFILE_KEY)queueRender(true)});
  setTimeout(()=>{normalizeSheet();queueRender();if(document.getElementById('pageTitle')?.textContent==='Fortschritt')void loadCloud()},0);
}

init();
