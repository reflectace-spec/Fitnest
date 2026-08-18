import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ORIGIN="https://fitnest.reflectace.workers.dev";
const H={"Content-Type":"application/json","Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const MODEL="gpt-5-mini";
function res(x:unknown,s=200){return new Response(JSON.stringify(x),{status:s,headers:H})}
function clamp(n:number,a:number,b:number){return Math.max(a,Math.min(b,n))}
function dayBudget(p:any){const a=Number(p?.budgetAmount||0);if(!a)return 0;return p.budgetPeriod==='day'?a:p.budgetPeriod==='month'?a/30.4:a/7}
function dateAdd(date:string,n:number){const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function validDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(new Date(`${value}T12:00:00Z`).valueOf())}
function weekMonday(value:string){const date=new Date(`${value}T12:00:00Z`),offset=(date.getUTCDay()+6)%7;date.setUTCDate(date.getUTCDate()-offset);return date.toISOString().slice(0,10)}
function serverClient(){const raw=Deno.env.get("SUPABASE_SECRET_KEYS"),key=raw?JSON.parse(raw).default:Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!key)throw new Error("server_key_missing");return createClient(Deno.env.get("SUPABASE_URL")!,key,{auth:{persistSession:false,autoRefreshToken:false}})}
function outputText(j:any){if(typeof j?.output_text==='string')return j.output_text;for(const item of j?.output||[])for(const c of item?.content||[])if(c?.type==='output_text'&&typeof c.text==='string')return c.text;return ''}
function celiacFromProfile(p:any){const xs=(p?.allergies||[]).map((x:any)=>String(x).toLowerCase());return Boolean(p?.glutenFreeCeliac)||Boolean(p?.gluten_free_celiac)||xs.some((x:string)=>x.includes('zöliak')||x.includes('zoeliak')||x.includes('celiac')||x.includes('coeliac'))}
function normalizedText(value:any){return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}
function replacementProfileViolations(profile:any,meal:any){
  const text=normalizedText((meal.ingredients||[]).map((item:any)=>`${item?.[0]||''} ${item?.[1]||''}`).join(' ')),violations:string[]=[];
  for(const blocked of [...(profile?.allergies||[]),...(profile?.dislikes||[])]){const needle=normalizedText(blocked);if(needle&&text.includes(needle))violations.push(String(blocked).slice(0,80))}
  const diet=String(profile?.diet_style||'omnivore'),meat=/\b(rind|schwein|hahnchen|haehnchen|pute|lamm|speck|salami|schinken|fleisch|fisch|lachs|thunfisch|garnele)\b/i,animal=/\b(milch|joghurt|quark|skyr|kase|kaese|butter|sahne|ei|eier|honig)\b/i;
  if((diet==='vegetarian'||diet==='vegan')&&meat.test(text))violations.push('diet_style');
  if(diet==='vegan'&&animal.test(text))violations.push('diet_style');
  return[...new Set(violations)].slice(0,8);
}
function schema(){return{type:'object',additionalProperties:false,required:['days'],properties:{days:{type:'array',minItems:1,maxItems:7,items:{type:'object',additionalProperties:false,required:['date','meals'],properties:{date:{type:'string'},meals:{type:'array',minItems:1,maxItems:6,items:{type:'object',additionalProperties:false,required:['name','kcal','protein','estimatedCostEur','ingredients','steps'],properties:{name:{type:'string'},kcal:{type:'integer'},protein:{type:'integer'},estimatedCostEur:{type:'number'},ingredients:{type:'array',items:{type:'object',additionalProperties:false,required:['name','amount'],properties:{name:{type:'string'},amount:{type:'string'}}}},steps:{type:'array',minItems:2,maxItems:8,items:{type:'string'}}}}}}}}}}}
function normalize(data:any,p:any,startDate:string,days:number){const schedule=(p.mealSchedule||p.schedule||[]).slice(0,clamp(Number(p.mealsPerDay||4),1,6));const targetKcal=clamp(Number(p.calories||2000),1000,6000),targetProtein=clamp(Number(p.protein||80),20,400),budget=dayBudget(p);return Array.from({length:days},(_,di)=>{const raw=data?.days?.[di]||{},meals=schedule.map((slot:any,i:number)=>{const m=raw.meals?.[i]||{};return{slot:slot.id||`meal_${i+1}`,label:slot.label||`Mahlzeit ${i+1}`,time:slot.time||'12:00',name:String(m.name||`ChatGPT-Mahlzeit ${i+1}`).slice(0,140),kcal:clamp(Math.round(Number(m.kcal||targetKcal/schedule.length)),100,4000),protein:clamp(Math.round(Number(m.protein||targetProtein/schedule.length)),0,300),cost:+Math.max(0,Number(m.estimatedCostEur||0)).toFixed(2),servings:1,ingredients:(m.ingredients||[]).slice(0,18).map((x:any)=>[String(x.name||'').slice(0,100),String(x.amount||'').slice(0,80)]),steps:(m.steps||[]).slice(0,8).map((x:any)=>String(x).slice(0,260)),generatedBy:'openai',model:MODEL}});const kcal=meals.reduce((s:number,m:any)=>s+m.kcal,0),protein=meals.reduce((s:number,m:any)=>s+m.protein,0),cost=meals.reduce((s:number,m:any)=>s+m.cost,0);return{date:dateAdd(startDate,di),meals,summary:{kcal,protein,cost:+cost.toFixed(2),budget:+budget.toFixed(2),overBudget:Boolean(budget&&cost>budget)}}})}
function celiacViolations(plans:any[]){const bad:string[]=[];const grains=/\b(weizen|dinkel|grünkern|gruenkern|roggen|gerste|triticale|seitan|bulgur|couscous)\b/i;for(const d of plans)for(const m of d.meals||[])for(const i of m.ingredients||[]){const text=`${i[0]||''} ${i[1]||''}`;if(grains.test(text))bad.push(text);if(/\bhafer/i.test(text)&&!/glutenfrei/i.test(text))bad.push(text)}return [...new Set(bad)].slice(0,8)}

async function mealSignals(db:any,userId:string,startDate:string){
  const from=dateAdd(startDate,-21),to=dateAdd(startDate,-1);
  const result=await db.from('daily_adherence').select('status,replacement_text,metadata').eq('user_id',userId).eq('item_type','meal').gte('activity_date',from).lte('activity_date',to);
  if(result.error){console.warn('meal_signals',result.error.message);return{recorded:0,completed:0,skipped:0,replaced:0,skippedMeals:[],recentReplacements:[]}}
  const rows=result.data||[],skippedMeals:string[]=[],recentReplacements:string[]=[];
  for(const row of rows){
    if(row.status==='skipped'&&row.metadata?.name)skippedMeals.push(String(row.metadata.name).slice(0,100));
    if(row.status==='replaced'&&row.replacement_text)recentReplacements.push(String(row.replacement_text).slice(0,100));
  }
  return{
    recorded:rows.length,
    completed:rows.filter((row:any)=>row.status==='completed').length,
    skipped:rows.filter((row:any)=>row.status==='skipped').length,
    replaced:rows.filter((row:any)=>row.status==='replaced').length,
    skippedMeals:[...new Set(skippedMeals)].slice(0,8),
    recentReplacements:[...new Set(recentReplacements)].slice(0,8)
  };
}

type ShoppingAggregate={name:string;units:Map<string,number>;texts:Set<string>;cost:number};
function addAmount(target:ShoppingAggregate,raw:string){
  const value=String(raw||'').trim().slice(0,80),match=value.match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|stück|stk|dose|dosen|packung|packungen|bund|el|tl)?$/i);
  if(!match){if(value)target.texts.add(value);return}
  let amount=Number(match[1].replace(',','.')),unit=String(match[2]||'Stück').toLowerCase();
  if(unit==='kg'){amount*=1000;unit='g'}
  if(unit==='l'){amount*=1000;unit='ml'}
  if(unit==='stk')unit='stück';
  if(unit==='dosen')unit='dose';
  if(unit==='packungen')unit='packung';
  target.units.set(unit,(target.units.get(unit)||0)+amount);
}
function formatAmountValue(value:number,unit:string){
  let amount=value,label=unit;
  if(unit==='g'&&value>=1000){amount=value/1000;label='kg'}
  if(unit==='ml'&&value>=1000){amount=value/1000;label='l'}
  const number=new Intl.NumberFormat('de-DE',{maximumFractionDigits:2}).format(amount);
  const labels:{[key:string]:string}={stück:'Stück',dose:value===1?'Dose':'Dosen',packung:value===1?'Packung':'Packungen',bund:'Bund',el:'EL',tl:'TL'};
  return`${number} ${labels[label]||label}`;
}
function formatAmounts(value:ShoppingAggregate){
  return[...[...value.units.entries()].map(([unit,amount])=>formatAmountValue(amount,unit)),...value.texts].slice(0,8).join(' + ').slice(0,500);
}
function shoppingRows(userId:string,weekStart:string,profileId:string,plans:any[]){
  const grouped=new Map<string,ShoppingAggregate>();
  for(const day of plans)for(const meal of day.meals||[]){
    const ingredients=(meal.ingredients||[]).filter((ingredient:any)=>String(ingredient?.[0]||'').trim()),share=ingredients.length?Math.max(0,Number(meal.cost)||0)/ingredients.length:0;
    for(const ingredient of ingredients){
      const name=String(ingredient?.[0]||'').trim().slice(0,100),amount=String(ingredient?.[1]||'').trim().slice(0,80);
      const normalized=name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70);
      if(!normalized)continue;
      const current=grouped.get(normalized)||{name,units:new Map<string,number>(),texts:new Set<string>(),cost:0};
      addAmount(current,amount);current.cost+=share;grouped.set(normalized,current);
    }
  }
  return[...grouped.entries()].slice(0,180).map(([key,value])=>({user_id:userId,week_start:weekStart,item_key:`v30-${key}`,item_name:value.name,amount_text:formatAmounts(value),checked:false,estimated_cost_eur:+value.cost.toFixed(2),nutrition_profile_id:profileId,updated_at:new Date().toISOString()}));
}

async function acceptPlans(db:any,userId:string,body:any){
  const plans=Array.isArray(body.plans)?body.plans:[];
  if(plans.length!==7||!validDate(String(plans[0]?.date||'')))return res({ok:false,code:'invalid_plan_week'},400);
  const weekStart=String(plans[0].date),start=new Date(`${weekStart}T12:00:00Z`),today=new Date(`${new Date().toISOString().slice(0,10)}T12:00:00Z`),daysAhead=Math.round((start.valueOf()-today.valueOf())/86400000);
  if(start.getUTCDay()!==1||daysAhead<1||daysAhead>14||plans.some((day:any,index:number)=>day.date!==dateAdd(weekStart,index)||!Array.isArray(day.meals)||day.meals.length<1||day.meals.length>6))return res({ok:false,code:'invalid_plan_week'},400);
  const profileResult=await db.from('nutrition_profiles').select('*').eq('user_id',userId).eq('is_active',true).maybeSingle();
  if(profileResult.error)throw profileResult.error;
  const profile=profileResult.data;
  if(!profile||String(profile.id)!==String(body.profileId||''))return res({ok:false,code:'profile_changed'},409);
  if(celiacFromProfile(profile)){
    const violations=celiacViolations(plans);
    if(violations.length)return res({ok:false,code:'celiac_guard_rejected'},422);
  }
  const mealRows=plans.map((day:any)=>({user_id:userId,plan_date:day.date,meals:day.meals,nutrition_profile_id:profile.id}));
  const saved=await db.from('meal_plans').upsert(mealRows,{onConflict:'user_id,plan_date'});
  if(saved.error)throw saved.error;
  const removed=await db.from('shopping_items').delete().eq('user_id',userId).eq('week_start',weekStart).like('item_key','v30-%');
  if(removed.error)throw removed.error;
  const items=shoppingRows(userId,weekStart,profile.id,plans);
  if(items.length){const shopping=await db.from('shopping_items').upsert(items,{onConflict:'user_id,week_start,item_key'});if(shopping.error)throw shopping.error}
  const summary=plans.reduce((all:any,day:any)=>{for(const meal of day.meals||[]){all.kcal+=Number(meal.kcal)||0;all.protein+=Number(meal.protein)||0;all.cost+=Number(meal.cost)||0;all.meals++}return all},{kcal:0,protein:0,cost:0,meals:0});
  return res({ok:true,weekStart,shoppingCount:items.length,summary:{averageCalories:Math.round(summary.kcal/7),averageProtein:Math.round(summary.protein/7),weekCost:+summary.cost.toFixed(2),meals:summary.meals}});
}

function replacementMeal(input:any,original:any){
  const ingredients=(input?.ingredients||[]).slice(0,18).map((item:any)=>[String(item?.[0]||item?.name||'').trim().slice(0,100),String(item?.[1]||item?.amount||'').trim().slice(0,80)]).filter((item:any)=>item[0]);
  const steps=(input?.steps||[]).slice(0,8).map((value:any)=>String(value||'').trim().slice(0,260)).filter(Boolean);
  if(!String(input?.name||'').trim()||!ingredients.length||steps.length<2)return null;
  return{
    slot:String(original.slot||'meal').slice(0,32),label:String(original.label||'Mahlzeit').slice(0,40),time:String(original.time||'12:00').slice(0,8),
    name:String(input.name).trim().slice(0,140),kcal:clamp(Math.round(Number(input.kcal)||0),100,4000),protein:clamp(Math.round(Number(input.protein)||0),0,300),
    cost:+clamp(Number(input.cost)||0,0,500).toFixed(2),servings:clamp(Number(input.servings)||1,.25,8),ingredients,steps,
    generatedBy:String(input.generatedBy||'fitnest').slice(0,40),model:input.model?String(input.model).slice(0,80):null,
    replacementOf:String(original.name||'').slice(0,140),replacedAt:new Date().toISOString()
  };
}

async function replacePlanMeal(db:any,userId:string,body:any){
  const date=String(body.date||''),slot=String(body.slot||'').slice(0,32),today=new Date(`${new Date().toISOString().slice(0,10)}T12:00:00Z`),target=new Date(`${date}T12:00:00Z`),days=Math.round((target.valueOf()-today.valueOf())/86400000);
  if(!validDate(date)||!slot||days<0||days>14)return res({ok:false,code:'invalid_replacement_date'},400);
  const profileResult=await db.from('nutrition_profiles').select('*').eq('user_id',userId).eq('is_active',true).maybeSingle();
  if(profileResult.error)throw profileResult.error;
  const profile=profileResult.data;
  if(!profile||String(profile.id)!==String(body.profileId||''))return res({ok:false,code:'profile_changed'},409);
  const planResult=await db.from('meal_plans').select('id,meals,nutrition_profile_id').eq('user_id',userId).eq('plan_date',date).maybeSingle();
  if(planResult.error)throw planResult.error;
  const plan=planResult.data,meals=Array.isArray(plan?.meals)?plan.meals:[],index=meals.findIndex((meal:any)=>String(meal?.slot||'')===slot);
  if(!plan||index<0)return res({ok:false,code:'planned_meal_not_found'},404);
  if(String(plan.nutrition_profile_id||'')!==String(profile.id))return res({ok:false,code:'profile_changed'},409);
  const replacement=replacementMeal(body.meal,meals[index]);
  if(!replacement)return res({ok:false,code:'invalid_replacement_meal'},400);
  if(replacementProfileViolations(profile,replacement).length)return res({ok:false,code:'profile_guard_rejected'},422);
  if(celiacFromProfile(profile)){
    const violations=celiacViolations([{meals:[replacement]}]);
    if(violations.length)return res({ok:false,code:'celiac_guard_rejected'},422);
  }
  const originalMeals=structuredClone(meals);meals[index]=replacement;
  const updated=await db.from('meal_plans').update({meals}).eq('id',plan.id).eq('user_id',userId);
  if(updated.error)throw updated.error;
  const weekStart=weekMonday(date),weekEnd=dateAdd(weekStart,6),weekResult=await db.from('meal_plans').select('plan_date,meals').eq('user_id',userId).gte('plan_date',weekStart).lte('plan_date',weekEnd).order('plan_date');
  if(weekResult.error)throw weekResult.error;
  const weekPlans=(weekResult.data||[]).map((row:any)=>({date:row.plan_date,meals:row.meals||[]}));
  const items=shoppingRows(userId,weekStart,profile.id,weekPlans);
  try{
    const removed=await db.from('shopping_items').delete().eq('user_id',userId).eq('week_start',weekStart).like('item_key','v30-%');
    if(removed.error)throw removed.error;
    if(items.length){const shopping=await db.from('shopping_items').upsert(items,{onConflict:'user_id,week_start,item_key'});if(shopping.error)throw shopping.error}
  }catch(error){
    console.error('replacement_shopping_rollback',error);
    await db.from('meal_plans').update({meals:originalMeals}).eq('id',plan.id).eq('user_id',userId);
    const restoredWeek=weekPlans.map((day:any)=>day.date===date?{...day,meals:originalMeals}:day),restoredItems=shoppingRows(userId,weekStart,profile.id,restoredWeek);
    await db.from('shopping_items').delete().eq('user_id',userId).eq('week_start',weekStart).like('item_key','v30-%');
    if(restoredItems.length)await db.from('shopping_items').upsert(restoredItems,{onConflict:'user_id,week_start,item_key'});
    throw error;
  }
  return res({ok:true,date,slot,meals,weekStart,shoppingCount:items.length});
}

async function generatePlan(db:any,userId:string,body:any,key:string){
  const p=body.profile||{},days=clamp(Number(body.days||1),1,7),startDate=validDate(String(body.startDate||''))?String(body.startDate):new Date().toISOString().slice(0,10),meals=clamp(Number(p.mealsPerDay||4),1,6),schedule=(p.mealSchedule||p.schedule||[]).slice(0,meals);
  if(schedule.length!==meals)return res({ok:false,code:'invalid_schedule'},400);
  const{data:activeDbProfile}=await db.from('nutrition_profiles').select('gluten_free_celiac').eq('user_id',userId).eq('is_active',true).maybeSingle();
  const celiac=Boolean(activeDbProfile?.gluten_free_celiac)||celiacFromProfile(p),budget=dayBudget(p),signals=await mealSignals(db,userId,startDate);
  const celiacRules=celiac?`\n- ZÖLIAKIE IST AKTIV: Der komplette Plan muss strikt glutenfrei sein. Kein Weizen, Dinkel, Grünkern, Roggen, Gerste, Triticale, Seitan, Bulgur oder Couscous.\n- Hafer/Haferflocken nur verwenden, wenn in der Zutat ausdrücklich "glutenfrei" steht.\n- Bei Brot, Pasta, Wraps, Panaden, Sojasauce und anderen verarbeiteten Produkten nur ausdrücklich glutenfrei gekennzeichnete Varianten einplanen.\n- Keine absichtliche Kreuzkontamination voraussetzen; bei verarbeiteten Produkten die glutenfreie Kennzeichnung in der Zutatenbezeichnung sichtbar machen.`:'';
  const behaviorRules=signals.recorded?`\nMahlzeitenrückmeldungen der letzten drei Wochen: ${JSON.stringify(signals)}\n- Nutze ausgelassene Mahlzeiten nur als Signal für praktischere oder abwechslungsreichere Alternativen.\n- Ersatzmahlzeiten sind Vorlieben, aber keine neuen Allergieangaben. Profilregeln haben immer Vorrang.\n- Wiederhole nicht einfach häufig ausgelassene Gerichte.`:'\nEs liegen noch keine belastbaren Mahlzeitenrückmeldungen vor. Plane konservativ anhand des Profils.';
  const prompt=`Erzeuge mit ChatGPT einen realistischen deutschen Fitnest-Ernährungsplan für ${days} Tag(e). Alle vom Nutzer gewählten Profilwerte sind verbindliche Planungsparameter:\n${JSON.stringify({diet:p.diet,allergies:p.allergies||[],dislikes:p.dislikes||[],glutenFreeCeliac:celiac,calories:p.calories,protein:p.protein,pattern:p.pattern,mealsPerDay:meals,schedule,budgetAmount:p.budgetAmount,budgetPeriod:p.budgetPeriod,dailyBudgetEur:+budget.toFixed(2)})}\n${behaviorRules}\n\nRegeln:\n- Exakt ${meals} Mahlzeit(en) pro Tag, in derselben Reihenfolge und zu den gewählten Zeiten.\n- Allergien/Unverträglichkeiten und Abneigungen strikt vermeiden.\n- Ernährungsform strikt einhalten.${celiacRules}\n- Tageskalorien ungefähr am Ziel halten, nicht eigenständig stärker reduzieren.\n- Protein möglichst am Ziel halten.\n- Bei 1MAD/OMAD nur die Mahlzeitenfrequenz abbilden, kein größeres Defizit erzeugen; eine vollständige, nährstoffdichte Tagesmahlzeit planen.\n- Budget ist ein Planungsrahmen. Bevorzuge übliche preiswerte Zutaten und bleibe möglichst unter ${budget?`${budget.toFixed(2)} EUR pro Tag`:'dem vom Nutzer gesetzten Rahmen'}.\n- Kosten sind realistische Schätzwerte, keine Live-Händlerpreise.\n- Jede Mahlzeit braucht konkrete Mengen und 2 bis 8 kurze Zubereitungsschritte.\n- Keine Nahrungsergänzungsmittel voraussetzen.\n- Antworte nur im vorgegebenen JSON-Schema.`;
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,store:false,input:prompt,text:{format:{type:'json_schema',name:'fitnest_meal_plan',strict:true,schema:schema()}}})});
  if(!r.ok){const detail=await r.text();console.error('openai_recipe',r.status,detail);return res({ok:false,code:'openai_error',status:r.status},502)}
  const j=await r.json(),text=outputText(j);
  if(!text)return res({ok:false,code:'empty_model_output'},502);
  const plans=normalize(JSON.parse(text),p,startDate,days);
  if(celiac){const violations=celiacViolations(plans);if(violations.length){console.error('celiac_guard_rejected',violations);return res({ok:false,code:'celiac_guard_rejected',message:'Der erzeugte Plan hat den Zöliakie-Guard nicht bestanden. Bitte erneut generieren.'},502)}}
  return res({ok:true,source:'openai',model:MODEL,glutenFreeCeliac:celiac,adaptiveSignals:signals,plans});
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:H});
  if(req.method!=='POST')return res({ok:false,code:'method_not_allowed'},405);
  try{
    const body=await req.json().catch(()=>({})),key=Deno.env.get('OPENAI_API_KEY');
    if(body.mode==='status')return res({ok:true,openaiConfigured:Boolean(key),model:MODEL,generator:'openai-responses'});
    if(body.mode!=='generate'&&body.mode!=='accept'&&body.mode!=='replace')return res({ok:false,code:'invalid_mode'},400);
    const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
    if(!token)return res({ok:false,code:'auth_required',message:'Für ChatGPT-Rezepte musst du in Fitnest angemeldet sein.'},401);
    const db=serverClient(),user=(await db.auth.getUser(token)).data.user;
    if(!user)return res({ok:false,code:'auth_invalid'},401);
    if(body.mode==='accept')return await acceptPlans(db,user.id,body);
    if(body.mode==='replace')return await replacePlanMeal(db,user.id,body);
    if(!key)return res({ok:false,code:'openai_secret_missing',message:'OPENAI_API_KEY ist im Fitnest-Supabase-Projekt noch nicht gesetzt.'},503);
    return await generatePlan(db,user.id,body,key);
  }catch(e:any){console.error('recipe-generator',e);return res({ok:false,code:'recipe_error',message:String(e?.message||e)},500)}
});
