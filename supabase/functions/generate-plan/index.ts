import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ORIGIN = "https://fitnest.reflectace.workers.dev";
const H = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MODEL = "gpt-5-mini";
const ALLOWED = ["squat","pushup","reverse-lunge","glute-bridge","bird-dog","plank","mountain","jumping-jack","deadbug"];
const DEFAULTS: Record<string,{sets:number,target:number,unit:"reps"|"seconds"}> = {
  squat:{sets:3,target:12,unit:"reps"}, pushup:{sets:3,target:8,unit:"reps"}, "reverse-lunge":{sets:3,target:10,unit:"reps"},
  "glute-bridge":{sets:3,target:15,unit:"reps"}, "bird-dog":{sets:3,target:8,unit:"reps"}, plank:{sets:3,target:30,unit:"seconds"},
  mountain:{sets:3,target:25,unit:"seconds"}, "jumping-jack":{sets:3,target:30,unit:"seconds"}, deadbug:{sets:3,target:8,unit:"reps"},
};
function res(x:unknown,s=200){return new Response(JSON.stringify(x),{status:s,headers:H})}
function clamp(n:number,a:number,b:number){return Math.max(a,Math.min(b,n))}
function serverClient(){const raw=Deno.env.get("SUPABASE_SECRET_KEYS"),key=raw?JSON.parse(raw).default:Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!key)throw new Error("server_key_missing");return createClient(Deno.env.get("SUPABASE_URL")!,key,{auth:{persistSession:false,autoRefreshToken:false}})}
function outputText(j:any){if(typeof j?.output_text==='string')return j.output_text;for(const item of j?.output||[])for(const c of item?.content||[])if(c?.type==='output_text'&&typeof c.text==='string')return c.text;return ''}
function weeksTo(date:string){const end=new Date(`${date}T12:00:00Z`),now=new Date();return Math.max(1,Math.ceil((end.getTime()-now.getTime())/(7*86400000)))}
function schema(){return {type:"object",additionalProperties:false,required:["sessions","coachNote"],properties:{sessions:{type:"array",minItems:2,maxItems:5,items:{type:"object",additionalProperties:false,required:["dayIndex","title","focus","minutes","exercises"],properties:{dayIndex:{type:"integer",minimum:0,maximum:6},title:{type:"string"},focus:{type:"string"},minutes:{type:"integer",minimum:15,maximum:60},exercises:{type:"array",minItems:3,maxItems:6,items:{type:"object",additionalProperties:false,required:["id","sets","target","unit","rpeTarget"],properties:{id:{type:"string",enum:ALLOWED},sets:{type:"integer",minimum:1,maximum:5},target:{type:"integer",minimum:4,maximum:90},unit:{type:"string",enum:["reps","seconds"]},rpeTarget:{type:"integer",minimum:5,maximum:8}}}}}}},coachNote:{type:"string"}}}}
function fallback(days:number,minutes:number){const templates=[
  ["squat","pushup","reverse-lunge","plank"],
  ["bird-dog","glute-bridge","deadbug","plank"],
  ["squat","pushup","glute-bridge","mountain"],
  ["reverse-lunge","pushup","bird-dog","jumping-jack"],
  ["squat","glute-bridge","plank","mountain"],
];
  const indices=days===2?[1,4]:days===3?[1,3,5]:days===4?[1,2,4,6]:[0,1,2,4,6];
  return indices.slice(0,days).map((dayIndex,i)=>({dayIndex,title:`Training ${i+1}`,focus:i%2?"Core & Stabilität":"Ganzkörper",minutes,exercises:templates[i].map(id=>({...DEFAULTS[id],id,rpeTarget:7}))}));
}
function normalize(raw:any,days:number,minutes:number){const seen=new Set<number>();const out:any[]=[];for(const s of raw?.sessions||[]){const di=clamp(Math.round(Number(s.dayIndex)),0,6);if(seen.has(di))continue;seen.add(di);const ex=(s.exercises||[]).filter((x:any)=>ALLOWED.includes(x.id)).slice(0,6).map((x:any)=>{const d=DEFAULTS[x.id];const unit=x.unit===d.unit?d.unit:d.unit;return{id:x.id,sets:clamp(Math.round(Number(x.sets||d.sets)),1,5),target:clamp(Math.round(Number(x.target||d.target)),4,unit==='seconds'?90:40),unit,rpeTarget:clamp(Math.round(Number(x.rpeTarget||7)),5,8)}});if(ex.length>=3)out.push({dayIndex:di,title:String(s.title||"Training").slice(0,80),focus:String(s.focus||"Ganzkörper").slice(0,100),minutes:clamp(Math.round(Number(s.minutes||minutes)),15,60),exercises:ex})}
  return out.length===days?out.sort((a,b)=>a.dayIndex-b.dayIndex):fallback(days,minutes);
}
function timeMinutes(value:string){const [hours,minutes]=String(value||"00:00").slice(0,5).split(":").map(Number);return hours*60+minutes}
function clock(value:number){const next=((value%1440)+1440)%1440;return `${String(Math.floor(next/60)).padStart(2,"0")}:${String(next%60).padStart(2,"0")}`}
function trainingTime(row:any,duration:number){if(!row?.is_workday)return"10:00";const start=timeMinutes(row.start_time),end=timeMinutes(row.end_time),minutes=Math.max(15,Number(duration)||30);if(start>end)return"10:00";if(end+60+minutes<=21*60+30)return clock(end+60);if(start-minutes-45>=6*60)return clock(start-minutes-45);return null}
function applyWorkSchedule(sessions:any[],rows:any[]){if(!rows?.length)return sessions;const schedule=Array.from({length:7},(_,index)=>rows.find(row=>Number(row.weekday)===index+1)||{weekday:index+1,is_workday:false,start_time:"09:00",end_time:"17:00"}),used=new Set<number>();return sessions.map((session,index)=>{let day=Number(session.dayIndex)||0,time=trainingTime(schedule[day],session.minutes);if(!time){const replacement=[1,-1,2,-2,3,-3,4,-4,5,-5,6,-6].map(offset=>(day+offset+7)%7).find(candidate=>!used.has(candidate)&&!schedule[candidate].is_workday);if(replacement!==undefined)day=replacement;time=trainingTime(schedule[day],session.minutes)||"10:00"}if(used.has(day)){const replacement=[0,1,2,3,4,5,6].find(candidate=>!used.has(candidate)&&trainingTime(schedule[candidate],session.minutes));if(replacement!==undefined){day=replacement;time=trainingTime(schedule[day],session.minutes)||"10:00"}}used.add(day);return{...session,dayIndex:day,suggestedTime:time,workdayAdjusted:true,sequence:index+1}}).sort((a,b)=>a.dayIndex-b.dayIndex)}

Deno.serve(async(req:Request)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:H});if(req.method!=='POST')return res({ok:false,code:'method_not_allowed'},405);try{
  const key=Deno.env.get('OPENAI_API_KEY');if(!key)return res({ok:false,code:'openai_secret_missing'},503);
  const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');if(!token)return res({ok:false,code:'auth_required'},401);
  const db=serverClient(),user=(await db.auth.getUser(token)).data.user;if(!user)return res({ok:false,code:'auth_invalid'},401);
  const b=await req.json().catch(()=>({})),current=Number(b.currentWeight),target=Number(b.targetWeight),targetDate=String(b.targetDate||''),weeks=weeksTo(targetDate),requestedRate=Math.max(0,(current-target)/weeks),plannedRate=Math.min(requestedRate,1),capped=requestedRate>plannedRate;
  if(!Number.isFinite(current)||!Number.isFinite(target)||!/^\d{4}-\d{2}-\d{2}$/.test(targetDate))return res({ok:false,code:'invalid_goal'},400);
  const days=clamp(Math.round(Number(b.trainingDays||3)),2,5),minutes=clamp(Math.round(Number(b.minutes||30)),15,60),level=['beginner','intermediate','advanced'].includes(b.trainingLevel)?b.trainingLevel:'beginner';
  const workResult=await db.from("work_schedules").select("weekday,is_workday,start_time,end_time").eq("user_id",user.id).order("weekday"),workSchedule=workResult.data||[];
  const prompt=`Erzeuge einen sicheren, alltagstauglichen Home-Workout-Wochenplan für Fitnest.\nNutzerprofil: ${JSON.stringify({currentWeight:current,targetWeight:target,targetDate,requestedRateKgPerWeek:+requestedRate.toFixed(2),plannedRateKgPerWeek:+plannedRate.toFixed(2),age:b.age,height:b.height,sex:b.sex,activity:b.activity,trainingLevel:level,primaryGoal:b.primaryGoal||'weight_loss',trainingDays:days,minutes,equipment:b.equipment||[],workSchedule})}\nRegeln:\n- Exakt ${days} Trainingseinheiten auf unterschiedliche Wochentage (dayIndex 0=Montag bis 6=Sonntag).\n- Arbeitszeiten beachten und ausreichend Abstand vor oder nach der Arbeit lassen.\n- Nur diese Übungs-IDs verwenden: ${ALLOWED.join(', ')}.\n- Pro Einheit 3 bis 6 Übungen, insgesamt ungefähr ${minutes} Minuten.\n- RPE-Ziel 5 bis 8; Anfänger nicht bis zum Muskelversagen planen.\n- Gewichtsverlust nicht durch extreme Trainingsmengen erzwingen. Das Training unterstützt Fitness und Muskelerhalt; das Energiedefizit wird separat konservativ berechnet.\n- Wenn der Wunsch-Zieltermin mehr als 1 kg pro Woche erfordern würde, ist er nur ein Wunschdatum. Plane höchstens mit ${plannedRate.toFixed(2)} kg pro Woche und versuche die Differenz nicht durch mehr Training auszugleichen.\n- Keine medizinische Diagnose oder Behandlung.\n- Bei wenig Equipment körpergewichtsbasierte Übungen priorisieren.\n- Gute Verteilung von Ganzkörper, Core und moderater Kondition.\n- Antworte ausschließlich im JSON-Schema.`;
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,store:false,input:prompt,text:{format:{type:'json_schema',name:'fitnest_training_plan',strict:true,schema:schema()}}})});
  if(!r.ok){console.error('openai_training',r.status,await r.text());return res({ok:true,source:'rules-fallback',model:null,weeks,rate:+requestedRate.toFixed(2),plannedRate:+plannedRate.toFixed(2),capped,sessions:applyWorkSchedule(fallback(days,minutes),workSchedule),coachNote:'KI war kurzfristig nicht verfügbar. Fitnest nutzt einen konservativen Ersatzplan.'})}
  const j=await r.json(),text=outputText(j);if(!text)return res({ok:true,source:'rules-fallback',model:null,weeks,rate:+requestedRate.toFixed(2),plannedRate:+plannedRate.toFixed(2),capped,sessions:applyWorkSchedule(fallback(days,minutes),workSchedule),coachNote:'KI lieferte keine verwertbare Antwort. Fitnest nutzt einen konservativen Ersatzplan.'});
  const parsed=JSON.parse(text),sessions=applyWorkSchedule(normalize(parsed,days,minutes),workSchedule);return res({ok:true,source:'openai',model:MODEL,weeks,rate:+requestedRate.toFixed(2),plannedRate:+plannedRate.toFixed(2),capped,sessions,coachNote:String(parsed.coachNote||'').slice(0,500)});
}catch(e:any){console.error('generate-plan',e);return res({ok:false,code:'training_plan_error',message:String(e?.message||e)},500)}});
