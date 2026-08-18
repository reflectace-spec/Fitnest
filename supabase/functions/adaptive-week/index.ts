import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ORIGIN="https://fitnest.reflectace.workers.dev";
const MODEL="gpt-5-mini";
const H={
  "Content-Type":"application/json",
  "Access-Control-Allow-Origin":ORIGIN,
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
};
const ACTIONS=["maintain","lighter","progress"] as const;

function response(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:H})}
function clamp(value:number,min:number,max:number){return Math.max(min,Math.min(max,value))}
function iso(date=new Date()){return date.toISOString().slice(0,10)}
function fromIso(value:string){return new Date(`${value}T12:00:00Z`)}
function addDays(value:string,days:number){const date=fromIso(value);date.setUTCDate(date.getUTCDate()+days);return iso(date)}
function currentMonday(){const date=new Date(),day=(date.getUTCDay()+6)%7;date.setUTCDate(date.getUTCDate()-day);return iso(date)}
function validWeek(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&fromIso(value).getUTCDay()===1}
function average(values:number[]){return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0}
function adminClient(){
  const raw=Deno.env.get("SUPABASE_SECRET_KEYS");
  const key=raw?JSON.parse(raw).default:Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!key)throw new Error("server_key_missing");
  return createClient(Deno.env.get("SUPABASE_URL")!,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
function outputText(payload:any){
  if(typeof payload?.output_text==="string")return payload.output_text;
  for(const item of payload?.output||[])for(const content of item?.content||[])if(content?.type==="output_text"&&typeof content.text==="string")return content.text;
  return "";
}
function textSchema(){
  return{
    type:"object",
    additionalProperties:false,
    required:["summary","reasoningPoints","nutritionNote"],
    properties:{
      summary:{type:"string"},
      reasoningPoints:{type:"array",minItems:2,maxItems:4,items:{type:"string"}},
      nutritionNote:{type:"string"}
    }
  };
}

async function loadContext(db:any,userId:string,weekStart:string){
  const weekEnd=addDays(weekStart,6);
  const weightFrom=addDays(weekStart,-28);
  const results=await Promise.all([
    db.from("profiles").select("training_days,session_minutes,step_goal,primary_goal,training_level").eq("user_id",userId).maybeSingle(),
    db.from("goals").select("start_weight_kg,target_weight_kg,target_date,status").eq("user_id",userId).eq("status","active").order("created_at",{ascending:false}).limit(1).maybeSingle(),
    db.from("daily_adherence").select("activity_date,item_type,item_key,status,difficulty,energy,metadata").eq("user_id",userId).gte("activity_date",weekStart).lte("activity_date",weekEnd),
    db.from("meal_plans").select("plan_date,meals").eq("user_id",userId).gte("plan_date",weekStart).lte("plan_date",weekEnd),
    db.from("workout_plans").select("week_start,plan,generation_version").eq("user_id",userId).lte("week_start",weekStart).order("week_start",{ascending:false}).limit(1).maybeSingle(),
    db.from("body_metrics").select("measured_on,weight_kg").eq("user_id",userId).gte("measured_on",weightFrom).order("measured_on",{ascending:true}),
    db.from("nutrition_profiles").select("calories,protein_g,eating_pattern,meals_per_day,diet_style").eq("user_id",userId).eq("is_active",true).maybeSingle(),
    db.from("weekly_reviews").select("*").eq("user_id",userId).eq("week_start",weekStart).maybeSingle(),
  ]);
  const error=results.map(result=>result.error).find(Boolean);
  if(error)throw error;
  return{
    weekStart,
    weekEnd,
    profile:results[0].data,
    goal:results[1].data,
    adherence:results[2].data||[],
    mealPlans:results[3].data||[],
    workoutPlan:results[4].data,
    weights:results[5].data||[],
    nutrition:results[6].data,
    existing:results[7].data,
  };
}

function calculateMetrics(context:any){
  const adherence=context.adherence||[];
  const meals=adherence.filter((item:any)=>item.item_type==="meal");
  const trainings=adherence.filter((item:any)=>item.item_type==="training");
  const mealPlanned=(context.mealPlans||[]).reduce((sum:number,day:any)=>sum+(Array.isArray(day.meals)?day.meals.length:0),0);
  const trainingPlanned=context.workoutPlan?.plan?.sessions?.length||Number(context.profile?.training_days||0);
  const mealDone=meals.filter((item:any)=>item.status==="completed"||item.status==="replaced").length;
  const trainingDone=trainings.filter((item:any)=>item.status==="completed").length;
  const plannedTotal=mealPlanned+trainingPlanned;
  const fallbackTotal=adherence.length;
  const completed=mealDone+trainingDone;
  const denominator=plannedTotal||fallbackTotal;
  const difficulty=trainings.map((item:any)=>Number(item.difficulty)).filter((value:number)=>value>0);
  const energy=trainings.map((item:any)=>Number(item.energy)).filter((value:number)=>value>0);
  const trackedDays=new Set(adherence.map((item:any)=>item.activity_date)).size;
  let weightPerWeek:null|number=null;
  const weights=(context.weights||[]).filter((item:any)=>Number.isFinite(Number(item.weight_kg)));
  if(weights.length>1){
    const first=weights[0],last=weights.at(-1);
    const days=Math.max(1,(fromIso(last.measured_on).getTime()-fromIso(first.measured_on).getTime())/86400000);
    weightPerWeek=Number(((Number(last.weight_kg)-Number(first.weight_kg))/days*7).toFixed(2));
  }
  const feedbackCount=Math.min(difficulty.length,energy.length);
  const confidence=trackedDays>=5&&feedbackCount>=2?"high":trackedDays>=3||adherence.length>=6?"medium":"low";
  return{
    plannedTotal,
    completed,
    adherencePct:denominator?Math.round(completed/denominator*100):0,
    mealPlanned,
    mealDone,
    mealSkipped:meals.filter((item:any)=>item.status==="skipped").length,
    trainingPlanned,
    trainingDone,
    avgDifficulty:difficulty.length?Number(average(difficulty).toFixed(1)):null,
    avgEnergy:energy.length?Number(average(energy).toFixed(1)):null,
    trackedDays,
    feedbackCount,
    weightPerWeek,
    confidence,
  };
}

function baseRecommendation(metrics:any){
  const tooFast=metrics.weightPerWeek!==null&&metrics.weightPerWeek < -1;
  const overloaded=(metrics.avgDifficulty!==null&&metrics.avgDifficulty>=4)||(metrics.avgEnergy!==null&&metrics.avgEnergy<=2);
  let trainingAction:typeof ACTIONS[number]="maintain";
  if(metrics.confidence!=="low"&&(tooFast||overloaded))trainingAction="lighter";
  else if(metrics.confidence!=="low"&&metrics.adherencePct>=80&&metrics.avgDifficulty!==null&&metrics.avgDifficulty>=2&&metrics.avgDifficulty<=3.5&&metrics.avgEnergy!==null&&metrics.avgEnergy>=3)trainingAction="progress";
  const volumePercent=trainingAction==="lighter"?-10:trainingAction==="progress"?5:0;
  const rpeDelta=trainingAction==="lighter"?-1:0;
  const nutritionAction=tooFast||overloaded?"protect_recovery":metrics.mealPlanned&&metrics.mealDone/metrics.mealPlanned<.6?"improve_tracking":"maintain";
  const summary=metrics.confidence==="low"
    ?"Noch zu wenig Verlaufsdaten für eine belastbare Steigerung. Der nächste Plan bleibt bewusst stabil."
    :trainingAction==="lighter"
      ?"Die Rückmeldungen sprechen für eine kontrollierte Entlastungswoche."
      :trainingAction==="progress"
        ?"Umsetzung und Belastung erlauben eine kleine, kontrollierte Progression."
        :"Der aktuelle Trainingsrahmen passt und wird für die nächste Woche beibehalten.";
  const reasons:string[]=[];
  if(metrics.confidence==="low")reasons.push("Für eine belastbare Anpassung werden mindestens drei protokollierte Tage benötigt.");
  if(tooFast)reasons.push("Der Gewichtstrend ist schneller als 1 kg pro Woche. Zusätzliche Belastung wird nicht erhöht.");
  if(metrics.avgDifficulty!==null)reasons.push(`Die durchschnittliche Schwierigkeit liegt bei ${metrics.avgDifficulty} von 5.`);
  if(metrics.avgEnergy!==null)reasons.push(`Die durchschnittliche Energie nach dem Training liegt bei ${metrics.avgEnergy} von 5.`);
  if(!reasons.length)reasons.push(`${metrics.adherencePct} Prozent der geplanten Punkte wurden abgeschlossen.`);
  return{trainingAction,volumePercent,rpeDelta,nutritionAction,summary,reasons:reasons.slice(0,4)};
}

function adjustedTarget(exercise:any,percent:number){
  const original=Number(exercise.target||10);
  if(!percent)return original;
  const seconds=exercise.unit==="seconds";
  let next=seconds?Math.round(original*(1+percent/100)/5)*5:Math.round(original*(1+percent/100));
  if(next===original)next=original+(percent>0?(seconds?5:1):(seconds?-5:-1));
  return clamp(next,seconds?10:4,seconds?90:40);
}

function proposedPlan(context:any,base:any,copy:any,source:string,model:string|null){
  const current=context.workoutPlan?.plan;
  if(!current?.sessions?.length)throw new Error("no_training_plan");
  const sessions=current.sessions.map((session:any)=>({
    ...session,
    minutes:clamp(Math.round(Number(session.minutes||30)*(1+base.volumePercent/100)),15,60),
    exercises:(session.exercises||[]).map((exercise:any)=>({
      ...exercise,
      target:adjustedTarget(exercise,base.volumePercent),
      rpeTarget:clamp(Number(exercise.rpeTarget||7)+base.rpeDelta,5,8),
    }))
  }));
  return{
    ...current,
    source:source==="openai"?"openai-adaptive":"rules-adaptive",
    model,
    sessions,
    coachNote:`Build 2.9: ${copy.summary}`,
    adaptedFromWeek:context.weekStart,
    generatedAt:new Date().toISOString(),
  };
}

async function aiCopy(context:any,metrics:any,base:any){
  const key=Deno.env.get("OPENAI_API_KEY");
  if(!key)return{source:"rules",model:null,summary:base.summary,reasoningPoints:base.reasons,nutritionNote:"Kalorienziel und Essensrhythmus bleiben unverändert."};
  const prompt=`Du bist der Fitnest Wochen-Coach. Formuliere ausschließlich die Erklärung zu einer bereits sicher berechneten Anpassung. Antworte im JSON-Schema auf Deutsch.

Sicher festgelegte Anpassung: ${JSON.stringify({trainingAction:base.trainingAction,volumePercent:base.volumePercent,rpeDelta:base.rpeDelta,nutritionAction:base.nutritionAction})}
Wochenmetriken: ${JSON.stringify(metrics)}
Profilrahmen: ${JSON.stringify({trainingDays:context.profile?.training_days,trainingLevel:context.profile?.training_level,primaryGoal:context.profile?.primary_goal,nutrition:context.nutrition,goal:context.goal})}

Regeln:
1. Keine Diagnose und keine medizinische Behandlung.
2. Keine Crash-Diät und nie schnelleres Abnehmen als 1 kg pro Woche fördern.
3. Keine Kaloriensenkung empfehlen. Bei wenig Daten ausdrücklich Stabilität begründen.
4. Die festgelegte Trainingsanpassung nicht verändern.
5. Summary maximal zwei kurze Sätze. Zwei bis vier konkrete Begründungen. NutritionNote maximal ein Satz.`;
  const result=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
    body:JSON.stringify({model:MODEL,store:false,input:prompt,text:{format:{type:"json_schema",name:"fitnest_adaptive_week_copy",strict:true,schema:textSchema()}}})
  });
  if(!result.ok){
    console.warn("adaptive-week openai",result.status,await result.text());
    return{source:"rules-fallback",model:null,summary:base.summary,reasoningPoints:base.reasons,nutritionNote:"Kalorienziel und Essensrhythmus bleiben unverändert."};
  }
  try{
    const parsed=JSON.parse(outputText(await result.json()));
    return{
      source:"openai",
      model:MODEL,
      summary:String(parsed.summary||base.summary).slice(0,500),
      reasoningPoints:(parsed.reasoningPoints||base.reasons).map((item:any)=>String(item).slice(0,220)).slice(0,4),
      nutritionNote:String(parsed.nutritionNote||"Kalorienziel und Essensrhythmus bleiben unverändert.").slice(0,300),
    };
  }catch(error){
    console.warn("adaptive-week parse",error);
    return{source:"rules-fallback",model:null,summary:base.summary,reasoningPoints:base.reasons,nutritionNote:"Kalorienziel und Essensrhythmus bleiben unverändert."};
  }
}

async function generate(db:any,userId:string,body:any){
  if(body.consent!==true)return response({ok:false,code:"consent_required"},400);
  const weekStart=validWeek(String(body.weekStart||""))?String(body.weekStart):currentMonday();
  const context=await loadContext(db,userId,weekStart);
  if(context.existing?.status==="accepted")return response({ok:true,source:"stored",review:context.existing});
  if(context.existing?.status==="generated"&&body.force!==true)return response({ok:true,source:"stored",review:context.existing});
  const metrics=calculateMetrics(context);
  const base=baseRecommendation(metrics);
  const copy=await aiCopy(context,metrics,base);
  const nextWeekStart=addDays(weekStart,7);
  const plan=proposedPlan(context,base,copy,copy.source,copy.model);
  const recommendation={
    version:"2.9",
    source:copy.source,
    model:copy.model,
    summary:copy.summary,
    reasons:copy.reasoningPoints,
    trainingAction:base.trainingAction,
    volumePercent:base.volumePercent,
    rpeDelta:base.rpeDelta,
    trainingNote:base.trainingAction==="lighter"
      ?"Umfang und Zielbelastung werden kontrolliert reduziert."
      :base.trainingAction==="progress"
        ?"Wiederholungen oder Zeit werden leicht erhöht, ohne das RPE Ziel zu verschärfen."
        :"Einheiten, Umfang und Zielbelastung bleiben stabil.",
    nutritionAction:base.nutritionAction,
    nutritionNote:copy.nutritionNote,
    proposedPlan:plan,
    nextWeekStart,
    generatedAt:new Date().toISOString(),
  };
  const saved=await db.from("weekly_reviews").upsert({
    user_id:userId,
    week_start:weekStart,
    metrics,
    recommendation,
    status:"generated",
    accepted_at:null,
    updated_at:new Date().toISOString(),
  },{onConflict:"user_id,week_start"}).select("*").single();
  if(saved.error)throw saved.error;
  return response({ok:true,source:copy.source,review:saved.data});
}

async function accept(db:any,userId:string,weekStart:string){
  if(!validWeek(weekStart))return response({ok:false,code:"invalid_week"},400);
  const found=await db.from("weekly_reviews").select("*").eq("user_id",userId).eq("week_start",weekStart).maybeSingle();
  if(found.error)throw found.error;
  const review=found.data,recommendation=review?.recommendation;
  if(!review||review.status==="dismissed")return response({ok:false,code:"review_not_available"},409);
  const nextWeekStart=String(recommendation?.nextWeekStart||"");
  const plan=recommendation?.proposedPlan;
  if(!validWeek(nextWeekStart)||!plan?.sessions?.length)return response({ok:false,code:"plan_not_available"},409);
  const planResult=await db.from("workout_plans").upsert({
    user_id:userId,
    week_start:nextWeekStart,
    plan,
    generation_version:"openai-adaptive-v2.9",
  },{onConflict:"user_id,week_start"});
  if(planResult.error)throw planResult.error;
  const updated=await db.from("weekly_reviews").update({
    status:"accepted",
    accepted_at:new Date().toISOString(),
    updated_at:new Date().toISOString(),
  }).eq("user_id",userId).eq("week_start",weekStart).select("*").single();
  if(updated.error)throw updated.error;
  return response({ok:true,review:updated.data,nextPlan:{weekStart:nextWeekStart,plan}});
}

async function dismiss(db:any,userId:string,weekStart:string){
  if(!validWeek(weekStart))return response({ok:false,code:"invalid_week"},400);
  const updated=await db.from("weekly_reviews").update({
    status:"dismissed",
    accepted_at:null,
    updated_at:new Date().toISOString(),
  }).eq("user_id",userId).eq("week_start",weekStart).select("*").maybeSingle();
  if(updated.error)throw updated.error;
  return response({ok:true,review:updated.data});
}

Deno.serve(async(request:Request)=>{
  if(request.method==="OPTIONS")return new Response("ok",{headers:H});
  if(request.method!=="POST")return response({ok:false,code:"method_not_allowed"},405);
  try{
    const token=request.headers.get("Authorization")?.replace(/^Bearer\s+/i,"");
    if(!token)return response({ok:false,code:"auth_required"},401);
    const db=adminClient();
    const user=(await db.auth.getUser(token)).data.user;
    if(!user)return response({ok:false,code:"auth_invalid"},401);
    const body=await request.json().catch(()=>({}));
    const mode=String(body.mode||"generate");
    if(mode==="generate")return await generate(db,user.id,body);
    if(mode==="accept")return await accept(db,user.id,String(body.weekStart||""));
    if(mode==="dismiss")return await dismiss(db,user.id,String(body.weekStart||""));
    return response({ok:false,code:"invalid_mode"},400);
  }catch(error:any){
    console.error("adaptive-week",error);
    const message=String(error?.message||error);
    return response({ok:false,code:message==="no_training_plan"?"no_training_plan":"adaptive_week_error",message},500);
  }
});
