import { CONFIG } from './config.js';

const PROFILE_KEY='fitnest.nutrition.profiles.v24';
const ACTIVE_KEY='fitnest.nutrition.activeProfile.v24';
const CELIAC_KEY='fitnest.nutrition.celiacProfiles.v242';
let sb=null;

function read(k,f){try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}}
function write(k,v){localStorage.setItem(k,JSON.stringify(v))}
function profiles(){return read(PROFILE_KEY,[])}
function celiacMap(){return read(CELIAC_KEY,{})}
function norm(v=''){return String(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim()}
function isCeliac(p){if(!p)return false;const m=celiacMap();if(typeof m[p.id]==='boolean')return m[p.id];return (p.allergies||[]).some(x=>['zoliakie','celiac','coeliac'].some(k=>norm(x).includes(k)))}
function activeProfile(){const ps=profiles(),id=localStorage.getItem(ACTIVE_KEY);return ps.find(x=>x.id===id)||ps.find(x=>x.isActive)||ps[0]||null}
function splitAllergies(v=''){return String(v).split(',').map(x=>x.trim()).filter(Boolean)}
function unique(xs){return [...new Map(xs.map(x=>[norm(x),x])).values()]}
function toast(m){const t=document.getElementById('toast');if(!t)return;t.textContent=m;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),2800)}

async function client(){if(sb)return sb;if(!CONFIG.supabaseUrl||!CONFIG.supabasePublishableKey)return null;const{createClient}=await import('https://esm.sh/@supabase/supabase-js@2');return sb=createClient(CONFIG.supabaseUrl,CONFIG.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})}
async function syncCeliac(id,enabled,allergies){try{const c=await client();if(!c)return;const s=(await c.auth.getSession()).data.session;if(!s)return;await c.from('nutrition_profiles').update({gluten_free_celiac:enabled,allergies,updated_at:new Date().toISOString()}).eq('user_id',s.user.id).eq('id',id)}catch(e){console.warn('celiac sync',e)}}
async function loadCloudCeliac(){try{const c=await client();if(!c)return;const s=(await c.auth.getSession()).data.session;if(!s)return;const{data,error}=await c.from('nutrition_profiles').select('id,gluten_free_celiac,allergies').eq('user_id',s.user.id);if(error)throw error;const map=celiacMap(),ps=profiles();for(const row of data||[]){map[row.id]=!!row.gluten_free_celiac;const p=ps.find(x=>x.id===row.id);if(p){p.glutenFreeCeliac=!!row.gluten_free_celiac;p.allergies=row.allergies||p.allergies||[]}}write(CELIAC_KEY,map);write(PROFILE_KEY,ps);run()}catch(e){console.warn('celiac load',e)}}

function profileForForm(form){const initial=String(form.querySelector('[name="name"]')?.value||'').trim(),ps=profiles(),active=activeProfile();return ps.find(p=>p.name===initial)||(active?.name===initial?active:null)}
function enhanceProfileForm(){const form=document.getElementById('v24ProfileForm');if(!form||form.querySelector('[name="celiac_gluten_free"]'))return;const allergyInput=form.querySelector('[name="allergies"]'),field=allergyInput?.closest('.field');if(!allergyInput||!field)return;const p=profileForForm(form),enabled=isCeliac(p);const box=document.createElement('div');box.className='notice';box.dataset.v242Celiac='1';box.innerHTML=`<label class="safety-check"><input type="checkbox" name="celiac_gluten_free" ${enabled?'checked':''}> <strong>Glutenfrei bei Zöliakie</strong></label><small>Wenn aktiv, werden alle Essenspläne strikt glutenfrei behandelt. Hafer wird nur als ausdrücklich glutenfreie Variante zugelassen.</small>`;field.before(box);
 form.addEventListener('submit',()=>{const checked=form.querySelector('[name="celiac_gluten_free"]')?.checked===true,wasEnabled=enabled,allergies=splitAllergies(allergyInput.value);let next=allergies.filter(x=>!['zoliakie','celiac','coeliac'].some(k=>norm(x).includes(k)));if(checked){next=unique([...next.filter(x=>norm(x)!=='gluten'),'Gluten','Zöliakie'])}else if(wasEnabled){next=next.filter(x=>norm(x)!=='gluten')}allergyInput.value=next.join(', ');const submittedName=String(form.querySelector('[name="name"]')?.value||'').trim(),beforeIds=new Set(profiles().map(x=>x.id));setTimeout(()=>{const ps=profiles(),created=ps.find(x=>!beforeIds.has(x.id)),target=created||ps.filter(x=>x.name===submittedName).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))[0]||activeProfile();if(!target)return;const map=celiacMap();map[target.id]=checked;target.glutenFreeCeliac=checked;write(CELIAC_KEY,map);write(PROFILE_KEY,ps);void syncCeliac(target.id,checked,target.allergies||next);run()},120)},true)}

function relabelChatGPT(){document.querySelectorAll('[data-v241-ai]').forEach(b=>{if(b.disabled)return;const text=b.dataset.v241Ai==='7'?'Mit ChatGPT · 7 Tage':'Mit ChatGPT · Heute';if(b.textContent!==text)b.textContent=text});const h=[...document.querySelectorAll('.ai-recipe-card h3')].find(x=>x.textContent?.includes('Rezepte aus deinem Profil'));const eye=h?.parentElement?.querySelector('.eyebrow');if(eye&&eye.textContent!=='ChatGPT Rezeptplaner')eye.textContent='ChatGPT Rezeptplaner';const st=document.querySelector('[data-v241-ai-status]');if(st?.textContent?.startsWith('KI ist bereit'))st.textContent=st.textContent.replace('KI ist bereit','ChatGPT ist bereit')}
function showCeliacStatus(){const app=document.getElementById('app'),title=document.getElementById('pageTitle'),p=activeProfile();if(!app||!['Ernährung','Essen & Budget'].includes(title?.textContent||''))return;const old=app.querySelector('[data-v242-celiac-status]');if(!isCeliac(p)){old?.remove();return}if(old)return;const hero=app.querySelector('.nutrition-v24-hero');if(!hero)return;const s=document.createElement('section');s.className='section';s.dataset.v242CeliacStatus='1';s.innerHTML='<div class="notice"><strong>Zöliakie · strikt glutenfrei aktiv</strong><br>ChatGPT muss das komplette Profil einschließlich Glutenfreiheit, Budget, Mahlzeitenanzahl und Essenszeiten berücksichtigen. Zusätzlich prüft der Server die Ausgabe auf offensichtliche Glutenquellen.</div>';hero.after(s)}
function routeLegacyGeneration(e){const b=e.target.closest?.('[data-v24-regen],[data-v24-week]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();const days=b.hasAttribute('data-v24-week')?'7':'1';const trigger=()=>{const ai=document.querySelector(`[data-v241-ai="${days}"]`);if(ai)ai.click();else toast('ChatGPT-Planer lädt noch. Bitte erneut versuchen.')};queueMicrotask(trigger)}
function run(){enhanceProfileForm();relabelChatGPT();showCeliacStatus()}

document.addEventListener('click',routeLegacyGeneration,true);
const app=document.getElementById('app'),sheet=document.getElementById('sheetContent'),title=document.getElementById('pageTitle');
if(app)new MutationObserver(()=>queueMicrotask(run)).observe(app,{childList:true,subtree:true});
if(sheet)new MutationObserver(()=>queueMicrotask(enhanceProfileForm)).observe(sheet,{childList:true,subtree:true});
if(title)new MutationObserver(()=>queueMicrotask(run)).observe(title,{childList:true,subtree:true,characterData:true});
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>queueMicrotask(run)));
void loadCloudCeliac();
run();
