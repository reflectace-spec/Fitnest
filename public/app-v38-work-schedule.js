import { getSupabaseClient } from './app-supabase.js';

const BUILD='3.8';
const KEY='fitnest.workSchedule.v38';
const TRAIN='fitnest.ai.trainingPlan.v26';
const DAYS=['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
let sb=null,busy=false;

const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
const esc=(value='')=>String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const iso=(date=new Date())=>{const value=new Date(date);value.setMinutes(value.getMinutes()-value.getTimezoneOffset());return value.toISOString().slice(0,10)};
const monday=()=>{const date=new Date(`${iso()}T12:00:00`);date.setDate(date.getDate()-((date.getDay()+6)%7));return iso(date)};
const toMinutes=value=>{const [hours,minutes]=String(value||'00:00').slice(0,5).split(':').map(Number);return hours*60+minutes};
const asTime=minutes=>`${String(Math.floor(((minutes%1440)+1440)%1440/60)).padStart(2,'0')}:${String(((minutes%1440)+1440)%1440%60).padStart(2,'0')}`;

function defaults(){return DAYS.map((_,index)=>({weekday:index+1,is_workday:index<5,start_time:'09:00',end_time:'17:00'}))}

export function normalizeWorkSchedule(rows){
  const values=Array.isArray(rows)?rows:[];
  return DAYS.map((_,index)=>{
    const weekday=index+1,row=values.find(item=>Number(item.weekday)===weekday)||defaults()[index];
    return{weekday,is_workday:row.is_workday===true,start_time:String(row.start_time||'09:00').slice(0,5),end_time:String(row.end_time||'17:00').slice(0,5)};
  });
}

export function suggestedTrainingTime(row,duration=30){
  if(!row?.is_workday)return'10:00';
  const start=toMinutes(row.start_time),end=toMinutes(row.end_time),minutes=Math.max(10,Number(duration)||30);
  if(start>end)return'10:00';
  const after=end+60;
  if(after+minutes<=21*60+30)return asTime(after);
  const before=start-minutes-45;
  if(before>=6*60)return asTime(before);
  return null;
}

export function adaptPlanToWorkSchedule(plan,rows){
  if(!plan?.sessions?.length)return plan;
  const schedule=normalizeWorkSchedule(rows),used=new Set();
  const sessions=plan.sessions.map((session,index)=>{
    let day=Math.max(0,Math.min(6,Number(session.dayIndex)||0));
    let time=suggestedTrainingTime(schedule[day],session.minutes);
    if(!time){
      const alternatives=[1,-1,2,-2,3,-3,4,-4,5,-5,6,-6].map(offset=>(day+offset+7)%7);
      const replacement=alternatives.find(candidate=>!used.has(candidate)&&!schedule[candidate].is_workday);
      if(replacement!==undefined)day=replacement;
      time=suggestedTrainingTime(schedule[day],session.minutes)||'10:00';
    }
    if(used.has(day)){
      const replacement=[0,1,2,3,4,5,6].find(candidate=>!used.has(candidate)&&suggestedTrainingTime(schedule[candidate],session.minutes));
      if(replacement!==undefined){day=replacement;time=suggestedTrainingTime(schedule[day],session.minutes)||'10:00'}
    }
    used.add(day);
    return{...session,dayIndex:day,suggestedTime:time,workdayAdjusted:true,sequence:index+1};
  }).sort((a,b)=>a.dayIndex-b.dayIndex);
  return{...plan,sessions,scheduleSource:'work-schedule-v3.8',scheduleUpdatedAt:new Date().toISOString()};
}

function toast(message){const node=document.getElementById('toast');if(!node)return;node.textContent=message;node.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),3200)}
async function client(){if(sb)return sb;return sb=await getSupabaseClient()}
async function session(){try{return(await(await client()).auth.getSession()).data.session||null}catch{return null}}

async function loadSchedule(){
  const local=read(KEY,null);
  const current=await session();
  if(!current?.user?.id)return normalizeWorkSchedule(local||defaults());
  try{
    const result=await(await client()).from('work_schedules').select('weekday,is_workday,start_time,end_time').eq('user_id',current.user.id).order('weekday');
    if(result.error)throw result.error;
    if(result.data?.length){const rows=normalizeWorkSchedule(result.data);write(KEY,rows);return rows}
  }catch(error){console.warn('work schedule load',error)}
  return normalizeWorkSchedule(local||defaults());
}

function row(item,index){return`<div class="v38-work-row"><label class="v38-work-toggle"><input type="checkbox" name="work_${index}" ${item.is_workday?'checked':''}><span></span><strong>${DAYS[index]}</strong></label><div class="v38-work-times"><label>Von<input type="time" step="900" name="start_${index}" value="${esc(item.start_time)}"></label><label>Bis<input type="time" step="900" name="end_${index}" value="${esc(item.end_time)}"></label></div></div>`}

async function open(){
  const sheet=document.getElementById('sheet'),content=document.getElementById('sheetContent');
  if(!sheet||!content)return;
  const rows=await loadSchedule(),current=await session();
  content.innerHTML=`<div class="sheet-inner"><div class="sheet-handle"></div><div class="sheet-head"><div><p class="eyebrow">Fitnest · Build ${BUILD}</p><h2>Arbeit & Trainingszeit</h2></div><button data-v38-close>×</button></div><form id="v38WorkForm" class="v38-work-form"><div class="notice"><strong>Automatische Anpassung</strong><br>Fitnest legt Einheiten außerhalb deiner Arbeitszeit. Passt eine Einheit gar nicht, wird sie auf den nächsten geeigneten freien Tag verschoben.</div><div class="v38-work-list">${rows.map(row).join('')}</div>${current?'<div class="v38-cloud"><span>✓</span><div><strong>Mit deinem Account synchronisiert</strong><small>Die Arbeitszeiten gelten auf allen angemeldeten Geräten.</small></div></div>':'<div class="notice">Ohne Anmeldung werden die Arbeitszeiten nur auf diesem Gerät gespeichert.</div>'}<button class="primary" type="submit">Arbeitszeiten speichern und Plan anpassen</button></form></div>`;
  if(!sheet.open)sheet.showModal();
  content.querySelector('[data-v38-close]')?.addEventListener('click',()=>sheet.close());
  content.querySelector('#v38WorkForm')?.addEventListener('submit',save);
}

function formRows(form){const data=new FormData(form);return DAYS.map((_,index)=>({weekday:index+1,is_workday:data.has(`work_${index}`),start_time:String(data.get(`start_${index}`)||'09:00'),end_time:String(data.get(`end_${index}`)||'17:00')}))}

async function persistPlan(current,rows){
  const local=read(TRAIN,null),adjusted=adaptPlanToWorkSchedule(local,rows);
  if(adjusted)write(TRAIN,adjusted);
  if(!current?.user?.id)return adjusted;
  const db=await client();
  const found=await db.from('workout_plans').select('plan,week_start').eq('user_id',current.user.id).lte('week_start',monday()).order('week_start',{ascending:false}).limit(1).maybeSingle();
  if(found.error)throw found.error;
  const cloudPlan=adaptPlanToWorkSchedule(found.data?.plan||local,rows);
  if(cloudPlan){
    const result=await db.from('workout_plans').upsert({user_id:current.user.id,week_start:found.data?.week_start||monday(),plan:cloudPlan,generation_version:'openai-work-schedule-v3.8'},{onConflict:'user_id,week_start'});
    if(result.error)throw result.error;
    write(TRAIN,{...cloudPlan,weekStart:found.data?.week_start||monday()});
  }
  return cloudPlan;
}

async function save(event){
  event.preventDefault();if(busy)return;busy=true;
  const form=event.currentTarget,button=form.querySelector('button[type="submit"]'),rows=formRows(form),invalid=rows.find(item=>item.is_workday&&item.start_time===item.end_time);
  if(invalid){toast(`${DAYS[invalid.weekday-1]}: Start und Ende dürfen nicht gleich sein.`);busy=false;return}
  if(button){button.disabled=true;button.textContent='Plan wird angepasst …'}
  try{
    write(KEY,rows);
    const current=await session();
    if(current?.user?.id){
      const now=new Date().toISOString(),payload=rows.map(item=>({...item,user_id:current.user.id,updated_at:now}));
      const result=await(await client()).from('work_schedules').upsert(payload,{onConflict:'user_id,weekday'});
      if(result.error)throw result.error;
    }
    await persistPlan(current,rows);
    document.getElementById('sheet')?.close();
    toast('Arbeitszeiten gespeichert · Trainingsplan angepasst');
    document.dispatchEvent(new CustomEvent('fitnest:work-schedule-updated',{detail:{rows}}));
    setTimeout(()=>location.reload(),700);
  }catch(error){console.error('work schedule save',error);toast(error.message||'Arbeitszeiten konnten nicht gespeichert werden')}
  finally{busy=false;if(button){button.disabled=false;button.textContent='Arbeitszeiten speichern und Plan anpassen'}}
}

function injectButton(){
  const root=document.getElementById('sheetContent');
  if(!root||root.querySelector('.sheet-head h2')?.textContent!=='Einstellungen'||root.querySelector('[data-sheet-action="work"]'))return;
  const edit=root.querySelector('[data-sheet-action="edit"]');if(!edit)return;
  const button=document.createElement('button');button.className='secondary';button.dataset.sheetAction='work';button.textContent='Arbeitszeiten & Trainingsplanung';edit.after(button);
}

document.addEventListener('click',event=>{const button=event.target.closest?.('[data-sheet-action="work"]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();void open()},true);
const sheetContent=document.getElementById('sheetContent');if(sheetContent)new MutationObserver(injectButton).observe(sheetContent,{childList:true,subtree:true});
injectButton();
