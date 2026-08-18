import { getSupabaseClient } from './app-supabase.js';

const PLANS='fitnest.nutrition.plans';
const LOGS='fitnest.nutrition.logs';
const SAVED='fitnest.nutrition.saved';
const PROFILES='fitnest.nutrition.profiles.v24';
const ACTIVE='fitnest.nutrition.activeProfile.v24';
const ADHERENCE='fitnest.dailyAdherence.v28';
const COOK_PROGRESS='fitnest.recipe.progress.v32';
const FN=`${CONFIG.supabaseUrl}/functions/v1/recipe-generator`;
let sb=null,userId='',cloudPlans=[],favorites=[],loaded=false,loading=false,queued=false,lastError='';
let registry=new Map(),currentRecipe=null,cookStep=0,wakeLock=null;
let timer={deadline:0,interval:0};

const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
const esc=(value='')=>String(value).replace(/[&<>'\"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[char]));
const norm=value=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const iso=(date=new Date())=>{const value=new Date(date);value.setMinutes(value.getMinutes()-value.getTimezoneOffset());return value.toISOString().slice(0,10)};
const fromIso=value=>new Date(`${value}T12:00:00`);
const addDays=(value,days)=>{const date=fromIso(value);date.setDate(date.getDate()+days);return iso(date)};
const money=value=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(Number(value||0));
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function toast(message){
  const node=document.getElementById('toast');
  if(!node)return;
  node.textContent=message;node.classList.add('show');
  clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),3200);
}

async function client(){if(sb)return sb;sb=await getSupabaseClient();return sb}
async function session(){
  const known=window.__fitnestV27?.session;
  if(known?.user?.id)return known;
  try{return(await(await client()).auth.getSession()).data.session||null}catch{return null}
}

function activeProfile(){
  const profiles=read(PROFILES,[]),activeId=localStorage.getItem(ACTIVE)||profiles.find(item=>item.isActive)?.id;
  return profiles.find(item=>item.id===activeId)||profiles[0]||null;
}

function profileCeliac(profile=activeProfile()){
  return Boolean(profile?.glutenFreeCeliac||profile?.gluten_free_celiac)||(profile?.allergies||[]).some(value=>/zöliak|zoeliak|celiac|coeliac/i.test(String(value)));
}

function profileDiet(profile=activeProfile()){
  const value=String(profile?.diet||profile?.diet_style||'omnivore');
  return['omnivore','vegetarian','vegan'].includes(value)?value:'omnivore';
}

function ingredient(raw){
  if(Array.isArray(raw))return{name:String(raw[0]||'').trim(),amount:String(raw[1]||'').trim(),meta:raw[2]||null};
  return{name:String(raw?.name||'').trim(),amount:String(raw?.amount||'').trim(),meta:raw?._fitnestRecipe||null};
}

function ingredients(meal){return(meal?.ingredients||[]).map(ingredient).filter(item=>item.name)}
function favoriteMeta(row){return row?.ingredients?.find?.(item=>item&&typeof item==='object'&&!Array.isArray(item)&&item._fitnestRecipe)?._fitnestRecipe||{}}

function fallbackSteps(meal){
  const names=ingredients(meal).map(item=>item.name).slice(0,4).join(', ');
  return[
    `Alle Zutaten bereitstellen${names?`: ${names}`:''}.`,
    'Frische Zutaten waschen, nach Bedarf schälen und passend schneiden.',
    'Die Zutaten entsprechend ihrer Garzeit schonend zubereiten und regelmäßig prüfen.',
    'Alles zusammenführen, abschmecken und direkt servieren.'
  ];
}

function steps(meal){
  const direct=Array.isArray(meal?.steps)?meal.steps:[];
  const meta=meal?._favoriteRow?favoriteMeta(meal._favoriteRow):{};
  const saved=Array.isArray(meta.steps)?meta.steps:[];
  return(direct.length?direct:saved.length?saved:fallbackSteps(meal)).map(value=>String(value||'').trim()).filter(Boolean).slice(0,12);
}

function planMap(){
  const values=new Map();
  for(const [date,plan] of Object.entries(read(PLANS,{}))){
    if(plan?.meals?.length)values.set(date,{date,profileId:plan.profileId||null,meals:plan.meals,source:'local'});
  }
  for(const row of cloudPlans){
    if(row?.plan_date&&Array.isArray(row.meals))values.set(row.plan_date,{date:row.plan_date,profileId:row.nutrition_profile_id||null,meals:row.meals,source:'cloud',rowId:row.id});
  }
  return values;
}

function planRecipes(){
  const result=[];
  for(const plan of [...planMap().values()].sort((a,b)=>a.date.localeCompare(b.date))){
    plan.meals.forEach((meal,index)=>result.push({...meal,_kind:'plan',_date:plan.date,_profileId:plan.profileId,_planSource:plan.source,_planIndex:index,_key:`plan:${plan.date}:${meal.slot||index}`}));
  }
  return result;
}

function favoriteRecipes(){
  return favorites.map(row=>{
    const meta=favoriteMeta(row);
    return{
      name:row.name,slot:row.slot,label:meta.label||'Favorit',time:meta.time||'',kcal:Number(row.calories)||0,protein:Number(row.protein_g)||0,cost:Number(row.estimated_cost_eur)||0,
      ingredients:row.ingredients||[],steps:meta.steps||[],servings:Number(meta.servings)||1,generatedBy:meta.generatedBy||'saved',model:meta.model||null,
      _kind:'favorite',_favoriteRow:row,_profileId:meta.profileId||null,_safeCeliac:Boolean(meta.glutenFreeCeliac),_key:`favorite:${row.id}`
    };
  });
}

function rebuildRegistry(){
  registry=new Map();
  [...planRecipes(),...favoriteRecipes()].forEach(meal=>registry.set(meal._key,meal));
}

function dateLabel(value){
  if(value===iso())return'Heute';
  if(value===addDays(iso(),1))return'Morgen';
  return new Intl.DateTimeFormat('de-DE',{weekday:'short',day:'2-digit',month:'2-digit'}).format(fromIso(value));
}

function recipeKey(meal){return meal?._key||''}
function metricValue(value,factor){return Math.round((Number(value)||0)*factor)}
function favoriteFor(meal){return favorites.find(row=>norm(row.name)===norm(meal.name)&&String(row.slot)===safeSlot(meal.slot))||null}
function safeSlot(value){return String(value||'meal').toLowerCase().replace(/[^a-z0-9_-]/g,'_').slice(0,32)||'meal'}

function recipeCard(meal){
  const context=meal._kind==='favorite'?'Favorit':dateLabel(meal._date);
  return `<button type="button" class="v32-recipe-card" data-v32-open="${esc(recipeKey(meal))}">
    <span class="v32-card-mark">${meal._kind==='favorite'?'♥':'○'}</span>
    <small>${esc(context)}${meal.time?` · ${esc(meal.time)}`:''}</small>
    <strong>${esc(meal.name||'Rezept')}</strong>
    <span>${metricValue(meal.kcal,1)} kcal · ${metricValue(meal.protein,1)} g Protein · ${money(meal.cost)}</span>
  </button>`;
}

function renderRoot(){
  queued=false;
  const app=document.getElementById('app');
  if(!app||document.getElementById('pageTitle')?.textContent!=='Ernährung')return;
  rebuildRegistry();
  const plans=planRecipes().filter(meal=>meal._date>=iso()).slice(0,6),saved=favoriteRecipes().slice(0,4);
  const signature=JSON.stringify([userId,loaded,loading,lastError,plans.map(meal=>[meal._date,meal.slot,meal.name]),favorites.map(row=>[row.id,row.updated_at])]);
  const current=app.querySelector('[data-v32-root]');
  if(current?.dataset.signature===signature){decorateTodayCards();return}
  const section=document.createElement('section');section.className='section v32-recipes';section.dataset.v32Root='1';section.dataset.signature=signature;
  let body='';
  if(lastError)body=`<div class="v32-empty"><strong>Rezepte nicht verfügbar</strong><p>${esc(lastError)}</p><button class="secondary" data-v32-retry>Erneut laden</button></div>`;
  else if(!loaded||loading)body='<div class="v32-loading"><i></i><span>Rezepte werden geladen</span></div>';
  else body=`
    ${plans.length?`<div class="v32-subhead"><div><small>Geplante Mahlzeiten</small><strong>Als Nächstes</strong></div><button data-v32-browser>Alle anzeigen</button></div><div class="v32-card-grid">${plans.map(recipeCard).join('')}</div>`:`<div class="v32-empty"><strong>Noch keine Rezepte geplant</strong><p>Erstelle zuerst eine Essenswoche. Danach stehen alle Gerichte hier mit Zutaten und Zubereitung bereit.</p><button class="primary" data-v32-generate>Essenswoche vorbereiten</button></div>`}
    <div class="v32-subhead"><div><small>Deine Sammlung</small><strong>Favoriten</strong></div><span>${favorites.length}</span></div>
    ${saved.length?`<div class="v32-card-grid favorites">${saved.map(recipeCard).join('')}</div>`:'<div class="v32-favorite-empty">Speichere ein Rezept über das Herz. Favoriten werden mit deinem Konto synchronisiert.</div>'}`;
  section.innerHTML=`<div class="section-head"><div><small>Build 3.2</small><h3>Rezepte und Kochmodus</h3></div><button class="secondary compact" data-v32-browser>Öffnen</button></div>${body}`;
  if(current)current.replaceWith(section);else{const anchor=app.querySelector('[data-v31-root]')||app.querySelector('[data-v30-root]')||app.querySelector('.hero');if(anchor)anchor.after(section);else app.prepend(section)}
  decorateTodayCards();
}

function decorateTodayCards(){
  const app=document.getElementById('app');if(!app)return;
  const today=planRecipes().filter(meal=>meal._date===iso());
  app.querySelectorAll('.v24-meal').forEach((card,index)=>{
    if(card.querySelector('[data-v32-card-open]'))return;
    const meal=today[index];if(!meal)return;
    const button=document.createElement('button');button.type='button';button.className='secondary compact v32-open-recipe';button.dataset.v32CardOpen=meal._key;button.textContent='Rezept öffnen';
    card.append(button);
  });
}

function queueRender(){if(queued)return;queued=true;queueMicrotask(renderRoot)}

async function load(force=false){
  const auth=await session(),nextUser=auth?.user?.id||'';
  if(nextUser!==userId){userId=nextUser;cloudPlans=[];loaded=false}
  favorites=read(SAVED,[]);
  if(!userId){loaded=true;lastError='';queueRender();return}
  if(loaded&&!force){queueRender();return}
  loading=true;lastError='';queueRender();
  try{
    const db=await client(),from=addDays(iso(),-1),to=addDays(iso(),14);
    const[plansResult,savedResult]=await Promise.all([
      db.from('meal_plans').select('*').eq('user_id',userId).gte('plan_date',from).lte('plan_date',to).order('plan_date',{ascending:true}),
      db.from('saved_meals').select('*').eq('user_id',userId).order('updated_at',{ascending:false})
    ]);
    if(plansResult.error)throw plansResult.error;if(savedResult.error)throw savedResult.error;
    cloudPlans=plansResult.data||[];favorites=savedResult.data||[];write(SAVED,favorites);loaded=true;
  }catch(error){console.error('v32 load',error);lastError='Pläne und Favoriten konnten nicht geladen werden.';loaded=true}
  finally{loading=false;queueRender()}
}

function showSheet(html){
  const sheet=document.getElementById('sheet'),content=document.getElementById('sheetContent');if(!sheet||!content)return;
  content.innerHTML=html;sheet.classList.add('v32-sheet-host');if(!sheet.open)sheet.showModal();
}

async function closeSheet(){
  const sheet=document.getElementById('sheet');sheet?.close();sheet?.classList.remove('v32-sheet-host');
  if(wakeLock){try{await wakeLock.release()}catch{}wakeLock=null}
}

function openBrowser(){
  rebuildRegistry();const plans=planRecipes().filter(meal=>meal._date>=iso()),saved=favoriteRecipes();
  const grouped=[...new Set(plans.map(meal=>meal._date))].map(date=>`<section class="v32-browser-day"><h3>${esc(dateLabel(date))}</h3><div class="v32-card-grid">${plans.filter(meal=>meal._date===date).map(recipeCard).join('')}</div></section>`).join('');
  showSheet(`<div class="sheet-inner v32-browser"><div class="sheet-handle"></div><div class="sheet-head"><div><p class="eyebrow">Build 3.2</p><h2>Deine Rezepte</h2></div><button data-v32-close>×</button></div>${saved.length?`<section class="v32-browser-day"><h3>Favoriten</h3><div class="v32-card-grid favorites">${saved.map(recipeCard).join('')}</div></section>`:''}${grouped||'<div class="v32-empty"><strong>Noch keine Essenswoche</strong><p>Nach der Planung erscheinen die vollständigen Rezepte hier.</p></div>'}</div>`);
}

function parseStart(text){
  const value=String(text||'').trim(),fractions={'¼':.25,'½':.5,'¾':.75};
  if(fractions[value[0]])return{number:fractions[value[0]],length:1};
  let match=value.match(/^(\d+)\s+(\d+)\/(\d+)/);if(match)return{number:Number(match[1])+Number(match[2])/Number(match[3]),length:match[0].length};
  match=value.match(/^(\d+)\/(\d+)/);if(match)return{number:Number(match[1])/Number(match[2]),length:match[0].length};
  match=value.match(/^\d+(?:[.,]\d+)?/);if(match)return{number:Number(match[0].replace(',','.')),length:match[0].length};
  return null;
}

function numberText(value){
  const rounded=Math.round(value*100)/100;
  if(Math.abs(rounded-.25)<.01)return'¼';if(Math.abs(rounded-.5)<.01)return'½';if(Math.abs(rounded-.75)<.01)return'¾';
  return new Intl.NumberFormat('de-DE',{maximumFractionDigits:2}).format(rounded);
}

function scaleAmount(value,factor){
  if(!value||factor===1)return value||'';const parsed=parseStart(value);if(!parsed)return value;
  return`${numberText(parsed.number*factor)}${String(value).slice(parsed.length)}`;
}

function recipeSafety(meal){
  const profile=activeProfile(),celiac=profileCeliac(profile),allergies=profile?.allergies||[];
  if(celiac){
    const trusted=meal.generatedBy==='openai'||meal._safeCeliac||meal._kind==='plan'&&meal._profileId===profile?.id;
    return trusted
      ?'<div class="v32-safety safe"><strong>Zöliakieprofil berücksichtigt</strong><span>Trotzdem Kennzeichnung, Spurenhinweise und Kreuzkontamination prüfen.</span></div>'
      :'<div class="v32-safety caution"><strong>Zutaten besonders prüfen</strong><span>Für dieses ältere oder manuell gespeicherte Rezept liegt kein eindeutiger Zöliakie-Nachweis vor.</span></div>';
  }
  if(allergies.length)return`<div class="v32-safety caution"><strong>Allergiehinweis</strong><span>Vor der Zubereitung auf ${esc(allergies.join(', '))} und mögliche Spuren prüfen.</span></div>`;
  return'';
}

function progressFor(key){return read(COOK_PROGRESS,{})[key]||{ingredients:[],step:0}}
function saveProgress(key,value){const all=read(COOK_PROGRESS,{});all[key]=value;write(COOK_PROGRESS,all)}

function renderRecipe(){
  if(!currentRecipe)return;const{meal,key}=currentRecipe,base=Math.max(.25,Number(meal.servings)||1),factor=currentRecipe.servings/base,list=ingredients(meal),done=new Set(progressFor(key).ingredients||[]),isFavorite=Boolean(favoriteFor(meal));
  showSheet(`<div class="sheet-inner v32-detail"><div class="sheet-handle"></div><div class="sheet-head"><div><p class="eyebrow">${esc(meal._kind==='favorite'?'Favorit':dateLabel(meal._date))}${meal.time?` · ${esc(meal.time)}`:''}</p><h2>${esc(meal.name||'Rezept')}</h2></div><button data-v32-close>×</button></div>
    <div class="v32-metrics"><div><small>Kalorien</small><strong>${metricValue(meal.kcal,factor)}</strong></div><div><small>Protein</small><strong>${metricValue(meal.protein,factor)} g</strong></div><div><small>Kosten</small><strong>${money((Number(meal.cost)||0)*factor)}</strong></div></div>
    ${recipeSafety(meal)}
    <div class="v32-serving"><div><small>Portionen</small><strong>${numberText(currentRecipe.servings)}</strong></div><div><button data-v32-serving="-0.5" aria-label="Weniger Portionen">−</button><button data-v32-serving="0.5" aria-label="Mehr Portionen">＋</button></div></div>
    <section class="v32-ingredients"><div class="v32-detail-head"><h3>Zutaten</h3><span>${done.size}/${list.length}</span></div>${list.map((item,index)=>`<button type="button" class="${done.has(index)?'checked':''}" data-v32-ingredient="${index}"><i>${done.has(index)?'✓':''}</i><span>${esc(item.name)}</span><small>${esc(scaleAmount(item.amount,factor)||'nach Bedarf')}</small></button>`).join('')}</section>
    <section class="v32-steps"><div class="v32-detail-head"><h3>Zubereitung</h3><span>${steps(meal).length} Schritte</span></div>${steps(meal).map((step,index)=>`<article><b>${index+1}</b><p>${esc(step)}</p></article>`).join('')}</section>
    <div class="v32-actions"><button class="primary" data-v32-cook>Kochmodus starten</button><button class="secondary" data-v32-favorite>${isFavorite?'♥ Favorit entfernen':'♡ Als Favorit speichern'}</button>${meal._kind==='plan'?'<button class="secondary" data-v32-alternatives>Passende Alternative</button>':''}${meal._date===iso()?'<button class="secondary" data-v32-eaten>Als gegessen speichern</button>':''}</div>
    <p class="v32-disclaimer">Kosten und Nährwerte sind Schätzwerte. Medizinisch relevante Allergien und Zöliakie erfordern weiterhin die Prüfung konkreter Produktkennzeichnungen.</p></div>`);
}

function openRecipe(key){
  rebuildRegistry();const meal=registry.get(key);if(!meal)return;
  currentRecipe={meal,key,servings:clamp(Number(meal.servings)||1,.5,8)};cookStep=clamp(Number(progressFor(key).step)||0,0,Math.max(0,steps(meal).length-1));renderRecipe();
}

async function toggleFavorite(){
  if(!currentRecipe)return;const meal=currentRecipe.meal,existing=favoriteFor(meal);
  try{
    if(existing){
      if(userId){const result=await(await client()).from('saved_meals').delete().eq('id',existing.id).eq('user_id',userId);if(result.error)throw result.error}
      favorites=favorites.filter(row=>row.id!==existing.id);toast('Favorit entfernt.');
    }else{
      const profile=activeProfile(),list=ingredients(meal).map(item=>({name:item.name,amount:item.amount}));
      if(!list.length)throw new Error('ingredients_missing');
      list[0]._fitnestRecipe={steps:steps(meal),servings:Number(meal.servings)||1,label:meal.label||'Mahlzeit',time:meal.time||'',generatedBy:meal.generatedBy||'fitnest',model:meal.model||null,profileId:meal._profileId||profile?.id||null,glutenFreeCeliac:profileCeliac(profile),savedAt:new Date().toISOString()};
      const row={id:crypto.randomUUID(),user_id:userId||null,name:String(meal.name||'Rezept').slice(0,120),slot:safeSlot(meal.slot),calories:clamp(Math.round(Number(meal.kcal)||0),0,4000),protein_g:clamp(Number(meal.protein)||0,0,300),ingredients:list,diet_style:profileDiet(profile),estimated_cost_eur:clamp(Number(meal.cost)||0,0,500),updated_at:new Date().toISOString()};
      if(userId){const result=await(await client()).from('saved_meals').insert(row).select('*').single();if(result.error)throw result.error;favorites.unshift(result.data)}else favorites.unshift({...row,created_at:new Date().toISOString()});
      toast('Rezept als Favorit gespeichert.');
    }
    write(SAVED,favorites);queueRender();renderRecipe();
  }catch(error){console.error('v32 favorite',error);toast('Favorit konnte nicht gespeichert werden.')}
}

function candidateAllowed(candidate,original){
  if(candidate._key===original._key||norm(candidate.name)===norm(original.name))return false;
  const profile=activeProfile(),diet=profileDiet(profile),candidateDiet=candidate._favoriteRow?.diet_style;
  if(candidateDiet&&diet==='vegan'&&candidateDiet!=='vegan')return false;
  if(candidateDiet&&diet==='vegetarian'&&candidateDiet==='omnivore')return false;
  if(profileCeliac(profile)){
    const meta=candidate._favoriteRow?favoriteMeta(candidate._favoriteRow):{};
    if(candidate._kind==='favorite'&&!meta.glutenFreeCeliac)return false;
    if(candidate._kind==='plan'&&candidate._profileId&&profile?.id&&candidate._profileId!==profile.id)return false;
  }
  const allergies=(profile?.allergies||[]).map(norm).filter(Boolean);
  if(allergies.length&&candidate._kind==='favorite'&&favoriteMeta(candidate._favoriteRow).profileId!==profile?.id)return false;
  return true;
}

function openAlternatives(){
  if(!currentRecipe)return;rebuildRegistry();const original=currentRecipe.meal,candidates=[...registry.values()].filter(candidate=>candidateAllowed(candidate,original)).slice(0,10);
  showSheet(`<div class="sheet-inner v32-alternatives"><div class="sheet-handle"></div><div class="sheet-head"><div><p class="eyebrow">Sicher ersetzen</p><h2>Alternative auswählen</h2></div><button data-v32-close>×</button></div><div class="v32-replace-current"><small>Statt</small><strong>${esc(original.name)}</strong><span>${original.kcal||0} kcal · ${original.protein||0} g Protein</span></div>${candidates.length?`<div class="v32-candidate-list">${candidates.map(candidate=>`<button data-v32-replace="${esc(candidate._key)}" data-v32-original="${esc(original._key)}"><div><small>${candidate._kind==='favorite'?'Favorit':dateLabel(candidate._date)}</small><strong>${esc(candidate.name)}</strong><span>${candidate.kcal||0} kcal · ${candidate.protein||0} g Protein</span></div><b>${(Number(candidate.kcal)||0)-(Number(original.kcal)||0)>=0?'+':''}${(Number(candidate.kcal)||0)-(Number(original.kcal)||0)} kcal</b></button>`).join('')}</div>`:'<div class="v32-empty"><strong>Keine sichere Alternative verfügbar</strong><p>Für dein aktives Profil wurde keine eindeutig passende Alternative gefunden.</p></div>'}<div class="v32-safety safe"><strong>Keine automatische Zieländerung</strong><span>Der Austausch ändert nur diese Mahlzeit. Kalorienziel und Essensrhythmus bleiben unverändert.</span></div></div>`);
}

function plainMeal(candidate,original){
  return{slot:original.slot,label:original.label,time:original.time,name:String(candidate.name||'Alternative').slice(0,140),kcal:clamp(Math.round(Number(candidate.kcal)||0),100,4000),protein:clamp(Math.round(Number(candidate.protein)||0),0,300),cost:+clamp(Number(candidate.cost)||0,0,500).toFixed(2),servings:Number(candidate.servings)||1,ingredients:ingredients(candidate).slice(0,18).map(item=>[item.name,item.amount]),steps:steps(candidate).slice(0,8),generatedBy:candidate.generatedBy||'fitnest',model:candidate.model||null,replacementOf:original.name,replacedAt:new Date().toISOString()};
}

function updateLocalPlan(date,original,replacement){
  const plans=read(PLANS,{}),plan=plans[date];if(!plan?.meals)return;
  const index=plan.meals.findIndex((meal,i)=>(meal.slot||`meal_${i+1}`)===(original.slot||`meal_${original._planIndex+1}`));if(index<0)return;
  plan.meals[index]=replacement;plans[date]=plan;write(PLANS,plans);
}

async function replaceRecipe(candidateKey,originalKey){
  rebuildRegistry();const candidate=registry.get(candidateKey),original=registry.get(originalKey);if(!candidate||!original||!candidateAllowed(candidate,original))return;
  const replacement=plainMeal(candidate,original),date=original._date;
  if(!confirm(`„${original.name}“ durch „${candidate.name}“ ersetzen?`))return;
  try{
    if(userId&&original._planSource==='cloud'){
      const auth=await session(),response=await fetch(FN,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth?.access_token||''}`},body:JSON.stringify({mode:'replace',date,slot:original.slot,profileId:original._profileId,meal:replacement})});
      const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.code||`HTTP ${response.status}`);
      const row=cloudPlans.find(value=>value.plan_date===date);if(row)row.meals=result.meals||row.meals;
    }
    updateLocalPlan(date,original,replacement);await load(true);await closeSheet();toast('Mahlzeit und Einkaufsliste wurden aktualisiert.');
  }catch(error){console.error('v32 replace',error);toast('Mahlzeit konnte nicht ersetzt werden.')}
}

async function markEaten(){
  if(!currentRecipe||currentRecipe.meal._date!==iso())return;const meal=currentRecipe.meal,date=meal._date,slot=safeSlot(meal.slot),now=new Date().toISOString();
  const logs=read(LOGS,{});logs[date]=logs[date]||{};logs[date][slot]={slot,meal_key:slot,meal_name:meal.name,servings:currentRecipe.servings,calories:metricValue(meal.kcal,currentRecipe.servings/(Number(meal.servings)||1)),protein_g:metricValue(meal.protein,currentRecipe.servings/(Number(meal.servings)||1)),scheduled_time:meal.time||null,estimated_cost_eur:+((Number(meal.cost)||0)*currentRecipe.servings/(Number(meal.servings)||1)).toFixed(2),nutrition_profile_id:meal._profileId||activeProfile()?.id||null,completed_at:now};write(LOGS,logs);
  const adherenceKey=`${date}|meal|${slot}`,storeKey=`${ADHERENCE}.${userId||'local'}`,adherence=read(storeKey,{}),entry={activity_date:date,item_type:'meal',item_key:slot,status:'completed',replacement_text:null,difficulty:null,energy:null,metadata:{name:meal.name,source:'cook_mode'},updated_at:now};adherence[adherenceKey]=entry;write(storeKey,adherence);
  try{
    if(userId){const db=await client(),mealRow={...logs[date][slot],user_id:userId,eaten_on:date},dailyRow={...entry,user_id:userId};const[a,b]=await Promise.all([db.from('meal_logs').upsert(mealRow,{onConflict:'user_id,eaten_on,slot'}),db.from('daily_adherence').upsert(dailyRow,{onConflict:'user_id,activity_date,item_type,item_key'})]);if(a.error)throw a.error;if(b.error)throw b.error}
    document.dispatchEvent(new CustomEvent('fitnest:cloud-synced'));await closeSheet();toast(userId?'Als gegessen gespeichert.':'Lokal als gegessen gespeichert.');
  }catch(error){console.error('v32 eaten',error);toast('Lokal gespeichert. Cloud Sync folgt später.')}
}

async function requestWakeLock(){try{if('wakeLock'in navigator)wakeLock=await navigator.wakeLock.request('screen')}catch{wakeLock=null}}
function stepMinutes(value){const match=String(value||'').match(/\b(\d{1,3})\s*(?:min(?:ute)?n?)\b/i);return match?clamp(Number(match[1]),1,180):0}

function timerText(){
  const left=Math.max(0,Math.ceil((timer.deadline-Date.now())/1000)),minutes=Math.floor(left/60),seconds=left%60;
  return`${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
}

function updateTimer(){
  const node=document.querySelector('[data-v32-timer-display]');if(node)node.textContent=timerText();
  if(timer.deadline&&Date.now()>=timer.deadline){clearInterval(timer.interval);timer={deadline:0,interval:0};toast('Timer beendet.');navigator.vibrate?.([150,100,150])}
}

function startTimer(minutes){
  clearInterval(timer.interval);timer.deadline=Date.now()+minutes*60000;timer.interval=setInterval(updateTimer,1000);updateTimer();toast(`Timer für ${minutes} Minuten gestartet.`);
}

function renderCook(){
  if(!currentRecipe)return;const meal=currentRecipe.meal,allSteps=steps(meal),step=allSteps[cookStep],minutes=stepMinutes(step),progress=progressFor(currentRecipe.key);progress.step=cookStep;saveProgress(currentRecipe.key,progress);
  showSheet(`<div class="sheet-inner v32-cook"><div class="v32-cook-top"><button data-v32-recipe-back>‹ Rezept</button><span>Schritt ${cookStep+1} von ${allSteps.length}</span><button data-v32-close>×</button></div><div class="v32-cook-progress"><i style="width:${Math.round((cookStep+1)/allSteps.length*100)}%"></i></div><div class="v32-cook-name">${esc(meal.name)}</div><div class="v32-cook-step"><b>${cookStep+1}</b><p>${esc(step)}</p></div>${minutes?`<button class="v32-timer" data-v32-timer="${minutes}"><span>Timer</span><strong data-v32-timer-display>${timer.deadline?timerText():`${minutes}:00`}</strong></button>`:''}<div class="v32-cook-actions"><button class="secondary" data-v32-step="-1" ${cookStep===0?'disabled':''}>Zurück</button><button class="primary" data-v32-step="1">${cookStep===allSteps.length-1?'Zubereitung abschließen':'Nächster Schritt'}</button></div></div>`);updateTimer();
}

async function startCook(){cookStep=clamp(Number(progressFor(currentRecipe.key).step)||0,0,steps(currentRecipe.meal).length-1);void requestWakeLock();renderCook()}
function moveStep(delta){
  if(!currentRecipe)return;const length=steps(currentRecipe.meal).length;
  if(delta>0&&cookStep===length-1){
    showSheet(`<div class="sheet-inner v32-finished"><div class="sheet-handle"></div><div class="v32-finish-mark">✓</div><p class="eyebrow">Kochmodus abgeschlossen</p><h2>${esc(currentRecipe.meal.name)}</h2><p>Alle Zubereitungsschritte sind abgeschlossen.</p>${currentRecipe.meal._date===iso()?'<button class="primary" data-v32-eaten>Als gegessen speichern</button>':''}<button class="secondary" data-v32-close>Fertig</button></div>`);return;
  }
  cookStep=clamp(cookStep+delta,0,length-1);renderCook();
}

document.addEventListener('click',event=>{
  const target=event.target.closest?.('[data-v32-open],[data-v32-card-open],[data-v32-close],[data-v32-browser],[data-v32-retry],[data-v32-generate],[data-v32-serving],[data-v32-ingredient],[data-v32-favorite],[data-v32-cook],[data-v32-alternatives],[data-v32-replace],[data-v32-eaten],[data-v32-recipe-back],[data-v32-step],[data-v32-timer]');
  if(!target)return;
  event.preventDefault();
  if(target.dataset.v32Open){openRecipe(target.dataset.v32Open);return}
  if(target.dataset.v32CardOpen){openRecipe(target.dataset.v32CardOpen);return}
  if(target.hasAttribute('data-v32-close')){void closeSheet();return}
  if(target.hasAttribute('data-v32-browser')){openBrowser();return}
  if(target.hasAttribute('data-v32-retry')){loaded=false;void load(true);return}
  if(target.hasAttribute('data-v32-generate')){document.querySelector('[data-v30-generate]')?.click();return}
  if(target.dataset.v32Serving&&currentRecipe){currentRecipe.servings=clamp(currentRecipe.servings+Number(target.dataset.v32Serving),.5,8);renderRecipe();return}
  if(target.dataset.v32Ingredient!=null&&currentRecipe){const index=Number(target.dataset.v32Ingredient),value=progressFor(currentRecipe.key),set=new Set(value.ingredients||[]);set.has(index)?set.delete(index):set.add(index);value.ingredients=[...set];saveProgress(currentRecipe.key,value);renderRecipe();return}
  if(target.hasAttribute('data-v32-favorite')){void toggleFavorite();return}
  if(target.hasAttribute('data-v32-cook')){void startCook();return}
  if(target.hasAttribute('data-v32-alternatives')){openAlternatives();return}
  if(target.dataset.v32Replace){void replaceRecipe(target.dataset.v32Replace,target.dataset.v32Original);return}
  if(target.hasAttribute('data-v32-eaten')){void markEaten();return}
  if(target.hasAttribute('data-v32-recipe-back')){renderRecipe();return}
  if(target.dataset.v32Step){moveStep(Number(target.dataset.v32Step));return}
  if(target.dataset.v32Timer){startTimer(Number(target.dataset.v32Timer))}
},true);

const app=document.getElementById('app'),title=document.getElementById('pageTitle');
if(app)new MutationObserver(queueRender).observe(app,{childList:true});
if(title)new MutationObserver(queueRender).observe(title,{childList:true,subtree:true,characterData:true});
document.querySelectorAll('.tab').forEach(button=>button.addEventListener('click',()=>{queueRender();if(button.dataset.view==='nutrition')void load()}));
document.addEventListener('fitnest:v27-auth',()=>{loaded=false;void load(true)});
document.addEventListener('fitnest:cloud-synced',()=>{loaded=false;void load(true)});

void load();queueRender();
