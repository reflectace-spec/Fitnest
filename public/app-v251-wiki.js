import { CONFIG } from './config.js';

const BUILD='2.5.1';
const CATALOG_KEY='fitnest.exerciseCatalog.v251';
const FAV_KEY='fitnest.exerciseFavorites.v25';
const FILTER_KEY='fitnest.exerciseFilters.v251';
const SPRITES={squat:0,pushup:1,'reverse-lunge':2,'glute-bridge':3,'bird-dog':4,plank:5,mountain:6,'jumping-jack':7};
let catalog=read(CATALOG_KEY,[]);
let favorites=new Set(read(FAV_KEY,[]));
let filters={q:'',category:'all',level:'all',equipment:'all',favoritesOnly:false,...read(FILTER_KEY,{})};
let loading=false,renderQueued=false,sb=null,session=null;

function read(k,f){try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}}
function write(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function toast(m){const t=document.getElementById('toast');if(!t)return;t.textContent=m;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),2400)}
function isWiki(){return document.querySelector('.tab.active')?.dataset.view==='wiki'||document.getElementById('pageTitle')?.textContent==='Übungen'}
function categoryLabel(v){return({'lower-body':'Beine','upper-body':'Oberkörper',core:'Core',cardio:'Cardio',mobility:'Mobilität'})[v]||v||'Training'}
function levelLabel(v){return String(v||'').replace(/^./,c=>c.toUpperCase())}
function equipmentLabel(x){return x.equipment?.length?x.equipment.join(' · '):'Ohne Equipment'}
function saveFilters(){write(FILTER_KEY,filters)}
function byId(id){return catalog.find(x=>x.id===id)}

async function loadCatalog(){
  if(loading)return;
  loading=true;
  try{
    const select='id,name,muscle_groups,level,instructions,common_errors,image_path,category,equipment,regression_ids,progression_ids,alternative_ids,impact';
    const url=`${CONFIG.supabaseUrl}/rest/v1/exercise_library?select=${encodeURIComponent(select)}&is_active=eq.true&order=name.asc`;
    const r=await fetch(url,{headers:{apikey:CONFIG.supabasePublishableKey}});
    if(!r.ok)throw new Error(`Katalog HTTP ${r.status}`);
    const rows=await r.json();
    if(Array.isArray(rows)&&rows.length){catalog=rows;write(CATALOG_KEY,rows)}
    await loadCloudFavorites();
  }catch(e){console.warn('exercise catalog',e);if(!catalog.length)toast('Übungskatalog konnte nicht geladen werden')}
  finally{loading=false;if(isWiki()&&catalog.length)renderWiki()}
}

async function cloudClient(){
  if(sb)return sb;
  try{
    const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');
    sb=createClient(CONFIG.supabaseUrl,CONFIG.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    return sb;
  }catch{return null}
}
async function loadCloudFavorites(){
  try{
    const c=await cloudClient();if(!c)return;
    session=(await c.auth.getSession()).data.session||null;if(!session)return;
    const {data,error}=await c.from('exercise_favorites').select('exercise_id').eq('user_id',session.user.id);
    if(error)throw error;
    favorites=new Set([...favorites,...(data||[]).map(x=>x.exercise_id)]);write(FAV_KEY,[...favorites]);
  }catch(e){console.warn('favorite sync',e)}
}
async function syncFavorite(id,on){
  try{
    const c=await cloudClient();if(!c)return;
    const s=session||(await c.auth.getSession()).data.session;if(!s)return;
    if(on){const {error}=await c.from('exercise_favorites').upsert({user_id:s.user.id,exercise_id:id},{onConflict:'user_id,exercise_id'});if(error)throw error}
    else{const {error}=await c.from('exercise_favorites').delete().eq('user_id',s.user.id).eq('exercise_id',id);if(error)throw error}
  }catch(e){console.warn('favorite sync',e)}
}

function filtered(){
  const q=filters.q.trim().toLowerCase();
  return catalog.filter(x=>{
    if(filters.category!=='all'&&x.category!==filters.category)return false;
    if(filters.level!=='all'&&x.level!==filters.level)return false;
    if(filters.equipment==='none'&&x.equipment?.length)return false;
    if(filters.equipment==='mat'&&!x.equipment?.some(e=>String(e).toLowerCase().includes('matte')))return false;
    if(filters.favoritesOnly&&!favorites.has(x.id))return false;
    if(q&&!`${x.name} ${(x.muscle_groups||[]).join(' ')} ${categoryLabel(x.category)} ${equipmentLabel(x)}`.toLowerCase().includes(q))return false;
    return true;
  })
}
function visual(x){
  const sprite=SPRITES[x.id];
  if(Number.isInteger(sprite)){const col=sprite%4,row=Math.floor(sprite/4),px=col*100/3,py=row*100;return `<div class="v25-photo" style="background-image:url('./assets/exercise-sprite.webp');background-position:${px}% ${py}%" aria-label="${esc(x.name)}"></div>`}
  const mark=({ 'lower-body':'LB','upper-body':'UB',core:'C',cardio:'HR',mobility:'M'})[x.category]||'FX';
  return `<div class="v25-fallback"><span>${mark}</span><small>${esc(categoryLabel(x.category))}</small></div>`
}
function card(x){const fav=favorites.has(x.id);return `<article class="v25-card"><button class="v25-visual" data-v251-open="${esc(x.id)}">${visual(x)}</button><div class="v25-card-copy"><div class="v25-card-head"><button class="v25-name" data-v251-open="${esc(x.id)}">${esc(x.name)}</button><button class="v25-fav ${fav?'active':''}" data-v251-fav="${esc(x.id)}" aria-label="${fav?'Favorit entfernen':'Als Favorit speichern'}">${fav?'★':'☆'}</button></div><small>${esc((x.muscle_groups||[]).join(' · '))}</small><div class="v25-tags"><span>${esc(levelLabel(x.level))}</span><span>${esc(equipmentLabel(x))}</span>${x.impact==='low'?'<span>Low Impact</span>':''}</div></div></article>`}

function renderWiki(){
  if(!isWiki()||!catalog.length)return;
  const app=document.getElementById('app');if(!app)return;
  const list=filtered();
  app.innerHTML=`<div data-v251-root><section class="hero v25-hero"><span class="label">Fitnest · Build ${BUILD}</span><h2>Übungswiki 2.0</h2><p>${catalog.length} Übungen für dein Training zuhause. Suche eine passende Variante, statt eine Übung einfach auszulassen.</p><div class="v25-summary"><span><b>${favorites.size}</b> Favoriten</span><span><b>${list.length}</b> Treffer</span></div></section><section class="section v25-controls"><div class="v25-search"><span>⌕</span><input data-v251-search value="${esc(filters.q)}" placeholder="Übung oder Muskelgruppe suchen" autocomplete="off"></div><div class="v25-category-row">${[['all','Alle'],['lower-body','Beine'],['upper-body','Oberkörper'],['core','Core'],['cardio','Cardio'],['mobility','Mobilität']].map(([v,l])=>`<button class="v25-chip ${filters.category===v?'active':''}" data-v251-category="${v}">${l}</button>`).join('')}</div><div class="v25-filter-row"><label>Level<select data-v251-level><option value="all">Alle</option>${['einsteiger','basis','stabilität','kondition','fortgeschritten','mobilität'].map(v=>`<option value="${v}" ${filters.level===v?'selected':''}>${levelLabel(v)}</option>`).join('')}</select></label><label>Equipment<select data-v251-equipment><option value="all" ${filters.equipment==='all'?'selected':''}>Alles</option><option value="none" ${filters.equipment==='none'?'selected':''}>Ohne Equipment</option><option value="mat" ${filters.equipment==='mat'?'selected':''}>Matte</option></select></label><button class="secondary compact ${filters.favoritesOnly?'active':''}" data-v251-favorites>${filters.favoritesOnly?'★ Nur Favoriten':'☆ Nur Favoriten'}</button></div></section><section class="section"><div class="section-head"><h3>${filters.favoritesOnly?'Deine Favoriten':'Übungen'}</h3><span class="pill">${list.length}</span></div><div class="v25-grid">${list.length?list.map(card).join(''):'<div class="card v25-empty"><strong>Keine passende Übung gefunden.</strong><small>Ändere Filter oder Suche.</small><button class="secondary compact" data-v251-reset>Filter zurücksetzen</button></div>'}</div></section><section class="section"><div class="notice">Bei Schmerzen, Schwindel, ungewöhnlicher Atemnot oder Unsicherheit die Übung abbrechen und medizinisch abklären.</div></section></div>`;
  bindWiki();
}
function bindWiki(){
  const app=document.getElementById('app');if(!app)return;
  app.querySelector('[data-v251-search]')?.addEventListener('input',e=>{filters.q=e.target.value;saveFilters();renderWiki()});
  app.querySelectorAll('[data-v251-category]').forEach(b=>b.onclick=()=>{filters.category=b.dataset.v251Category;saveFilters();renderWiki()});
  app.querySelector('[data-v251-level]')?.addEventListener('change',e=>{filters.level=e.target.value;saveFilters();renderWiki()});
  app.querySelector('[data-v251-equipment]')?.addEventListener('change',e=>{filters.equipment=e.target.value;saveFilters();renderWiki()});
  app.querySelector('[data-v251-favorites]')?.addEventListener('click',()=>{filters.favoritesOnly=!filters.favoritesOnly;saveFilters();renderWiki()});
  app.querySelector('[data-v251-reset]')?.addEventListener('click',()=>{filters={q:'',category:'all',level:'all',equipment:'all',favoritesOnly:false};saveFilters();renderWiki()});
  app.querySelectorAll('[data-v251-open]').forEach(b=>b.onclick=()=>openExercise(b.dataset.v251Open));
  app.querySelectorAll('[data-v251-fav]').forEach(b=>b.onclick=()=>toggleFavorite(b.dataset.v251Fav));
}
function relation(title,ids){const rows=(ids||[]).map(byId).filter(Boolean);if(!rows.length)return'';return `<section class="section"><div class="section-head"><h3>${title}</h3></div><div class="v25-relations">${rows.map(x=>`<button class="v25-relation" data-v251-related="${esc(x.id)}"><span>${esc(x.name)}</span><small>${esc((x.muscle_groups||[]).join(' · '))}</small><b>›</b></button>`).join('')}</div></section>`}
function openExercise(id){
  const x=byId(id);if(!x)return;
  const d=document.getElementById('sheet'),c=document.getElementById('sheetContent');if(!d||!c)return;
  const fav=favorites.has(id);
  c.innerHTML=`<div class="sheet-inner v25-detail"><div class="sheet-handle"></div><div class="sheet-head"><div><p class="eyebrow">${esc(categoryLabel(x.category))} · ${esc(levelLabel(x.level))}</p><h2>${esc(x.name)}</h2></div><button data-v251-close>×</button></div><div class="v25-detail-visual">${visual(x)}</div><div class="v25-detail-meta"><span>${esc((x.muscle_groups||[]).join(' · '))}</span><span>${esc(equipmentLabel(x))}</span><span>${x.impact==='low'?'Low Impact':'Dynamisch'}</span></div><button class="secondary v25-detail-fav ${fav?'active':''}" data-v251-detail-fav>${fav?'★ Favorit':'☆ Als Favorit speichern'}</button><section class="section"><div class="section-head"><h3>Ausführung</h3></div><div class="card v25-steps">${(x.instructions||[]).map((s,i)=>`<div><span>${i+1}</span><p>${esc(s)}</p></div>`).join('')}</div></section><section class="section"><div class="section-head"><h3>Häufige Fehler</h3></div><div class="card v25-errors">${(x.common_errors||[]).map(s=>`<div><span>!</span><p>${esc(s)}</p></div>`).join('')}</div></section>${relation('Leichtere Variante',x.regression_ids)}${relation('Schwerere Variante',x.progression_ids)}${relation('Alternativen',x.alternative_ids)}</div>`;
  c.querySelector('[data-v251-close]').onclick=()=>d.close();
  c.querySelector('[data-v251-detail-fav]').onclick=async()=>{await toggleFavorite(id);openExercise(id)};
  c.querySelectorAll('[data-v251-related]').forEach(b=>b.onclick=()=>openExercise(b.dataset.v251Related));
  if(!d.open)d.showModal();
}
async function toggleFavorite(id){const on=!favorites.has(id);if(on)favorites.add(id);else favorites.delete(id);write(FAV_KEY,[...favorites]);if(isWiki())renderWiki();void syncFavorite(id,on)}

function ensureWiki(){
  if(!isWiki())return;
  const app=document.getElementById('app');if(!app||app.querySelector('[data-v251-root]'))return;
  if(renderQueued)return;renderQueued=true;
  queueMicrotask(()=>{renderQueued=false;if(!isWiki())return;if(catalog.length)renderWiki();else void loadCatalog()});
}
const app=document.getElementById('app'),title=document.getElementById('pageTitle');
if(app)new MutationObserver(ensureWiki).observe(app,{childList:true});
if(title)new MutationObserver(ensureWiki).observe(title,{childList:true,characterData:true,subtree:true});
document.querySelector('.tab[data-view="wiki"]')?.addEventListener('click',()=>queueMicrotask(ensureWiki));
window.addEventListener('pageshow',ensureWiki);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)ensureWiki()});
void loadCatalog();
ensureWiki();
