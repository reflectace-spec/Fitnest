import { CONFIG } from './config.js';
import { getSupabaseClient } from './app-supabase.js';

const V=window.__fitnestV27=window.__fitnestV27||{session:null,google:false,sync:{state:'idle',text:'Cloud-Sync bereit',at:null}};
const K={complete:'fitnest.onboarding.complete.v26',profile:'fitnest.profile',weights:'fitnest.weights',completed:'fitnest.completed',history:'fitnest.workoutHistory',train:'fitnest.ai.trainingPlan.v26',profiles:'fitnest.nutrition.profiles.v24',active:'fitnest.nutrition.activeProfile.v24',plans:'fitnest.nutrition.plans',logs:'fitnest.nutrition.logs',saved:'fitnest.nutrition.saved',celiac:'fitnest.nutrition.celiacProfiles.v242',favorites:'fitnest.exerciseFavorites.v25',reviews:'fitnest.progress.reviews'};
let sb=null,running=false,lastUser='';
const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}};
const writeChanged=(k,v)=>{const n=JSON.stringify(v),p=localStorage.getItem(k);if(n===p)return false;localStorage.setItem(k,n);return true};
function hash(s=''){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(36)}
function emit(state,text='',at=null){V.sync={state,text,at};document.dispatchEvent(new CustomEvent('fitnest:v27-sync',{detail:V.sync}))}
async function client(){if(sb)return sb;return sb=await getSupabaseClient()}
function assertOk(a){const x=a.map(r=>r?.error).find(Boolean);if(x)throw x}
function nutrition(x){return{id:x.id,name:x.name,diet:x.diet_style,allergies:x.allergies||[],dislikes:x.dislikes||[],glutenFreeCeliac:!!x.gluten_free_celiac,calories:+x.calories,protein:+x.protein_g,pattern:x.eating_pattern,mealsPerDay:+x.meals_per_day,schedule:x.meal_schedule||[],budgetAmount:+x.budget_amount||0,budgetPeriod:x.budget_period||'week',currency:x.currency||'EUR',isActive:!!x.is_active,createdAt:x.created_at,updatedAt:x.updated_at}}
async function hydrate(session){
  if(running||!session?.user?.id)return;running=true;const u=session.user.id;lastUser=u;emit('syncing','Synchronisiere …');
  try{
    const c=await client();
    const [prof,goal,metrics,checks,wplans,sessions,nprofiles,mplans,mlogs,saved,reviews,favs]=await Promise.all([
      c.from('profiles').select('*').eq('user_id',u).maybeSingle(),
      c.from('goals').select('*').eq('user_id',u).eq('status','active').order('created_at',{ascending:false}).limit(1).maybeSingle(),
      c.from('body_metrics').select('id,measured_on,weight_kg,created_at').eq('user_id',u).order('measured_on',{ascending:true}).limit(200),
      c.from('daily_checkins').select('*').eq('user_id',u).order('checkin_date',{ascending:false}).limit(120),
      c.from('workout_plans').select('*').eq('user_id',u).order('week_start',{ascending:false}).limit(8),
      c.from('workout_sessions').select('*').eq('user_id',u).eq('completed',true).order('completed_at',{ascending:false}).limit(60),
      c.from('nutrition_profiles').select('*').eq('user_id',u).order('created_at',{ascending:true}),
      c.from('meal_plans').select('*').eq('user_id',u).order('plan_date',{ascending:false}).limit(45),
      c.from('meal_logs').select('*').eq('user_id',u).order('eaten_on',{ascending:false}).limit(300),
      c.from('saved_meals').select('*').eq('user_id',u).order('updated_at',{ascending:false}).limit(100),
      c.from('weekly_reviews').select('*').eq('user_id',u).order('week_start',{ascending:false}).limit(24),
      c.from('exercise_favorites').select('exercise_id').eq('user_id',u),
    ]);
    assertOk([prof,goal,metrics,checks,wplans,sessions,nprofiles,mplans,mlogs,saved,reviews,favs]);
    const p=prof.data,g=goal.data,configured=!!(p?.onboarding_completed_at&&g);let changed=false;
    if(configured){
      const weights=(metrics.data||[]).filter(x=>x.weight_kg!=null).map(x=>({date:x.measured_on,value:+x.weight_kg}));
      const current=weights.at(-1)?.value??+g.start_weight_kg;
      changed=writeChanged(K.profile,{currentWeight:current,targetWeight:+g.target_weight_kg,targetDate:g.target_date,height:p.height_cm==null?null:+p.height_cm,age:p.age==null?null:+p.age,sex:p.sex_for_energy_formula,activity:p.activity_level,trainingDays:+p.training_days,minutes:+p.session_minutes,stepGoal:+p.step_goal,waterGoal:+p.water_goal_l,trainingLevel:p.training_level,primaryGoal:p.primary_goal,equipment:p.equipment||[]})||changed;
      changed=writeChanged(K.weights,weights)||changed;
      const history=(sessions.data||[]).map(r=>({id:r.id,date:r.planned_date,title:r.workout_type,duration:+(r.duration_minutes||0),rpe:+(r.perceived_effort||0),completedAt:r.completed_at,exerciseLog:r.exercise_log||[],source:'cloud'}));
      changed=writeChanged(K.history,history)||changed;
      const comp={...read(K.completed,{})};
      for(const r of checks.data||[])comp[r.checkin_date]={...(comp[r.checkin_date]||{}),steps:+(r.steps||0),water:+(r.water_l||0),...(r.sleep_hours==null?{}:{sleep:+r.sleep_hours}),...(r.energy==null?{}:{energy:+r.energy})};
      for(const r of sessions.data||[])if(r.planned_date)comp[r.planned_date]={...(comp[r.planned_date]||{}),training:true};
      changed=writeChanged(K.completed,comp)||changed;
      const wp=(wplans.data||[]).find(x=>String(x.generation_version||'').startsWith('openai'))||(wplans.data||[])[0];if(wp?.plan)changed=writeChanged(K.train,{...wp.plan,weekStart:wp.week_start})||changed;
      const nps=(nprofiles.data||[]).map(nutrition);
      if(nps.length){changed=writeChanged(K.profiles,nps)||changed;const active=nps.find(x=>x.isActive)||nps[0];if(localStorage.getItem(K.active)!==active.id){localStorage.setItem(K.active,active.id);changed=true}changed=writeChanged(K.celiac,Object.fromEntries(nps.map(x=>[x.id,!!x.glutenFreeCeliac])))||changed}
      const plans={};for(const r of (mplans.data||[]).slice().reverse())plans[r.plan_date]={date:r.plan_date,profileId:r.nutrition_profile_id,profileName:nps.find(x=>x.id===r.nutrition_profile_id)?.name||'Standard',meals:r.meals||[],generatedAt:r.created_at,source:'cloud'};changed=writeChanged(K.plans,plans)||changed;
      const logs={};for(const r of (mlogs.data||[]).slice().reverse()){logs[r.eaten_on]=logs[r.eaten_on]||{};logs[r.eaten_on][r.slot]={id:r.id,slot:r.slot,meal_key:r.meal_key,meal_name:r.meal_name,servings:+r.servings,calories:+r.calories,protein_g:+r.protein_g,completed_at:r.completed_at,scheduled_time:r.scheduled_time,estimated_cost_eur:r.estimated_cost_eur==null?null:+r.estimated_cost_eur,nutrition_profile_id:r.nutrition_profile_id}}changed=writeChanged(K.logs,logs)||changed;
      changed=writeChanged(K.saved,saved.data||[])||changed;
      changed=writeChanged(K.favorites,(favs.data||[]).map(x=>x.exercise_id))||changed;
      const rr={};for(const r of reviews.data||[])rr[r.week_start]=r;changed=writeChanged(K.reviews,rr)||changed;
      if(localStorage.getItem(K.complete)!=='yes'){localStorage.setItem(K.complete,'yes');changed=true}
    }
    const now=new Date().toISOString();
    const{error:syncError}=await c.from('profiles').update({email:session.user.email||null,avatar_url:session.user.user_metadata?.avatar_url||session.user.user_metadata?.picture||null,last_synced_at:now}).eq('user_id',u);if(syncError)throw syncError;
    emit('synced','Synchronisiert',now);
    if(configured&&changed){
      const sig=hash(JSON.stringify([p.updated_at,g.updated_at,(metrics.data||[]).at(-1)?.created_at,(wplans.data||[])[0]?.created_at,(nprofiles.data||[]).map(x=>x.updated_at),(mplans.data||[])[0]?.created_at,(sessions.data||[])[0]?.completed_at]));
      const rk=`fitnest.v27.reload.${u}`;if(sessionStorage.getItem(rk)!==sig){sessionStorage.setItem(rk,sig);location.reload();return}
    }
    document.dispatchEvent(new CustomEvent('fitnest:cloud-synced',{detail:{userId:u,configured}}));
  }catch(e){console.error('v27 sync',e);emit('error',e.message||'Cloud nicht erreichbar')}
  finally{running=false}
}
async function boot(){try{const c=await client(),s=(await c.auth.getSession()).data.session||V.session;V.session=s||null;if(s)await hydrate(s);c.auth.onAuthStateChange((_event,next)=>{V.session=next||null;setTimeout(()=>{if(next&&next.user.id!==lastUser)void hydrate(next);if(!next){lastUser='';emit('idle','Abgemeldet')}},0)});document.addEventListener('fitnest:v27-auth',e=>{const next=e.detail?.session;V.session=next||null;if(next)void hydrate(next)})}catch(e){console.error('v27 sync boot',e);emit('error','Cloud-Sync konnte nicht gestartet werden')}}
void boot();
