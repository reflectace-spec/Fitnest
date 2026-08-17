const app=document.getElementById('app');
const title=document.getElementById('pageTitle');
function read(k,f){try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}}
function iso(d=new Date()){const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)}
function activeProfile(){const ps=read('fitnest.nutrition.profiles.v24',[]),id=localStorage.getItem('fitnest.nutrition.activeProfile.v24');return ps.find(x=>x.id===id)||ps.find(x=>x.isActive)||ps[0]||null}
function syncTodaySummary(){
  if(document.querySelector('.tab.active')?.dataset.view!=='today')return;
  const p=activeProfile(),summary=app?.querySelector('[data-nsum] .nutrition-summary');
  if(!p||!summary)return;
  const plan=read('fitnest.nutrition.plans',{})[iso()],logs=read('fitnest.nutrition.logs',{})[iso()]||{},meals=plan?.profileId===p.id?plan.meals||[]:[],entries=Object.values(logs),kcal=entries.reduce((s,x)=>s+(+x.calories||0),0),protein=entries.reduce((s,x)=>s+(+x.protein_g||0),0),targetCount=meals.length||p.mealsPerDay;
  const sig=[p.id,entries.length,targetCount,kcal,Math.round(protein),p.calories,p.protein,p.name].join('|');
  if(summary.dataset.v24Sig===sig)return;
  summary.dataset.v24Sig=sig;
  summary.innerHTML=`<div><strong>${entries.length}/${targetCount} Mahlzeiten</strong><small>${kcal}/${p.calories} kcal · ${Math.round(protein)}/${p.protein} g Protein · ${p.name}</small></div><span class="pill">${entries.length===targetCount?'Erledigt':'Heute'}</span>`;
}
function guard(){if(app?.dataset.nutritionBuild==='2.4'&&title?.textContent==='Ernährung')title.textContent='Essen & Budget';syncTodaySummary()}
if(app&&title){new MutationObserver(guard).observe(app,{childList:true,subtree:true});new MutationObserver(guard).observe(title,{childList:true,subtree:true,characterData:true})}
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>queueMicrotask(guard)));
