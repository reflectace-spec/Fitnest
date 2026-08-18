import { getSupabaseClient } from './app-supabase.js';

const PROFILES='fitnest.nutrition.profiles.v24';
const ACTIVE='fitnest.nutrition.activeProfile.v24';
const CATEGORIES=[
  {id:'produce',label:'Obst und Gemüse',icon:'◉'},
  {id:'chilled',label:'Kühlung',icon:'❄'},
  {id:'protein',label:'Fleisch, Fisch und Alternativen',icon:'◇'},
  {id:'bakery',label:'Brot und Backwaren',icon:'▱'},
  {id:'pantry',label:'Vorrat und Trockenware',icon:'▦'},
  {id:'frozen',label:'Tiefkühlung',icon:'✣'},
  {id:'other',label:'Sonstiges',icon:'•'}
];
let sb=null,userId='',items=[],loading=false,loaded=false,queued=false,lastError='';

const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
const esc=(value='')=>String(value).replace(/[&<>'\"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[char]));
const iso=(date=new Date())=>{const value=new Date(date);value.setMinutes(value.getMinutes()-value.getTimezoneOffset());return value.toISOString().slice(0,10)};
const fromIso=value=>new Date(`${value}T12:00:00`);
const addDays=(value,days)=>{const date=fromIso(value);date.setDate(date.getDate()+days);return iso(date)};
const nextMonday=()=>{const today=iso(),date=fromIso(today),weekday=(date.getDay()+6)%7;return addDays(today,7-weekday)};
const money=value=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(Number(value||0));
const norm=value=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

function toast(message){
  const node=document.getElementById('toast');
  if(!node)return;
  node.textContent=message;
  node.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>node.classList.remove('show'),3000);
}

async function client(){
  if(sb)return sb;
  sb=await getSupabaseClient();
  return sb;
}

async function session(){
  const known=window.__fitnestV27?.session;
  if(known?.user?.id)return known;
  try{return (await (await client()).auth.getSession()).data.session||null}catch{return null}
}

function activeProfile(){
  const profiles=read(PROFILES,[]),activeId=localStorage.getItem(ACTIVE)||profiles.find(item=>item.isActive)?.id;
  return profiles.find(item=>item.id===activeId)||profiles[0]||null;
}

function weekBudget(profile=activeProfile()){
  const value=Number(profile?.budgetAmount)||0;
  if(!value)return 0;
  if(profile.budgetPeriod==='day')return value*7;
  if(profile.budgetPeriod==='month')return value/30.4*7;
  return value;
}

function categoryId(item){
  const manual=String(item.item_key||'').match(/^manual-([a-z]+)-/i)?.[1];
  if(CATEGORIES.some(category=>category.id===manual))return manual;
  const value=norm(item.item_name);
  const rules={
    produce:['apfel','banane','beere','obst','gemuse','gemüse','tomate','gurke','paprika','salat','spinat','kartoffel','zwiebel','knoblauch','karotte','mohre','brokkoli','zucchini','mais','pilz','kohl','kraut','zitrone','limette','avocado'],
    chilled:['milch','skyr','joghurt','quark','käse','kaese','butter','sahne','ei','eier','frischkäse','frischkaese'],
    protein:['hahnchen','hähnchen','pute','rind','hack','fleisch','lachs','fisch','thunfisch','tofu','tempeh'],
    bakery:['brot','brötchen','broetchen','wrap','toast','baguette'],
    frozen:['tiefkuhl','tiefkühl','tk '],
    pantry:['reis','nudel','pasta','hafer','mehl','linse','bohne','kichererbse','öl','oel','essig','gewürz','gewurz','salz','pfeffer','sauce','kokosmilch','nuss','nüsse','nuesse','samen','honig','dose']
  };
  for(const [category,keywords] of Object.entries(rules))if(keywords.some(keyword=>value.includes(keyword)))return category;
  return'other';
}

function categoryMeta(id){return CATEGORIES.find(category=>category.id===id)||CATEGORIES.at(-1)}
function isPlanItem(item){return String(item.item_key||'').startsWith('v30-')}
function costTotal(){return items.reduce((sum,item)=>sum+(Number(item.estimated_cost_eur)||0),0)}

function itemHtml(item){
  return `<article class="v31-item ${item.checked?'checked':''}">
    <button type="button" class="v31-check" data-v31-toggle="${esc(item.id)}" aria-label="${item.checked?'Als offen markieren':'Als erledigt markieren'}"><span>${item.checked?'✓':''}</span></button>
    <div class="v31-item-copy"><strong>${esc(item.item_name)}</strong><span>${esc(item.amount_text||'Menge offen')}</span><small>${isPlanItem(item)?'Aus Essensplan':'Manuell'}${Number(item.estimated_cost_eur)>0?` · ${money(item.estimated_cost_eur)}`:''}</small></div>
    <button type="button" class="v31-remove" data-v31-remove="${esc(item.id)}" aria-label="Eintrag entfernen">×</button>
  </article>`;
}

function groupHtml(category,values){
  const open=values.filter(item=>!item.checked),done=values.filter(item=>item.checked);
  return `<section class="v31-group">
    <div class="v31-group-head"><span>${category.icon}</span><h4>${esc(category.label)}</h4><small>${values.length}</small></div>
    <div class="v31-list">${open.map(itemHtml).join('')}${done.length?`<div class="v31-done-label"><span>Erledigt</span><i></i></div>${done.map(itemHtml).join('')}`:''}</div>
  </section>`;
}

function emptyHtml(){
  return `<div class="v31-empty"><span>▦</span><h3>Noch keine Einkaufsliste</h3><p>Übernimm zuerst eine Essenswoche. Fitnest fasst danach alle Zutaten automatisch zusammen.</p><button type="button" class="primary" data-v31-plan>Essenswoche vorbereiten</button></div>`;
}

function shoppingHtml(){
  const checked=items.filter(item=>item.checked).length,total=items.length,percentage=total?Math.round(checked/total*100):0,budget=weekBudget(),cost=costTotal(),remaining=budget-cost;
  const grouped=CATEGORIES.map(category=>({category,values:items.filter(item=>categoryId(item)===category.id)})).filter(group=>group.values.length);
  return `<div class="v31-card">
    <div class="v31-overview">
      <div class="v31-progress" style="--v31-progress:${percentage}%"><strong>${percentage}%</strong><small>${checked}/${total}</small></div>
      <div><span class="eyebrow">Woche ab ${new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit'}).format(fromIso(nextMonday()))}</span><h2>Dein Wocheneinkauf</h2><p>${items.filter(isPlanItem).length} aus dem Essensplan · ${items.filter(item=>!isPlanItem(item)).length} manuell</p></div>
    </div>
    <div class="v31-budget">
      <div><small>Geschätzt</small><strong>${money(cost)}</strong></div>
      <div><small>Wochenbudget</small><strong>${budget?money(budget):'Nicht gesetzt'}</strong></div>
      <div class="${budget&&remaining<0?'over':''}"><small>${budget&&remaining<0?'Über Budget':'Noch verfügbar'}</small><strong>${budget?money(Math.abs(remaining)):'–'}</strong></div>
    </div>
    <div class="v31-groups">${grouped.map(group=>groupHtml(group.category,group.values)).join('')}</div>
    <button type="button" class="secondary v31-add" data-v31-add>＋ Eintrag hinzufügen</button>
    <p class="v31-note">Planänderungen ersetzen nur automatisch erzeugte Zutaten. Manuelle Einträge bleiben erhalten.</p>
  </div>`;
}

function render(){
  queued=false;
  const app=document.getElementById('app');
  if(!app||document.getElementById('pageTitle')?.textContent!=='Ernährung')return;
  const legacy=app.querySelector('#v24WeekShopping')?.closest('section');
  if(legacy)legacy.classList.add('v31-legacy-shopping');
  const signature=JSON.stringify([userId,items,loading,loaded,lastError,nextMonday(),activeProfile()?.id]);
  const current=app.querySelector('[data-v31-root]');
  if(current?.dataset.signature===signature)return;
  const section=document.createElement('section');
  section.className='section v31-shopping';
  section.dataset.v31Root='1';
  section.dataset.signature=signature;
  const body=!userId
    ?'<div class="v31-empty"><span>◎</span><h3>Bitte zuerst anmelden</h3><p>Die Einkaufsliste wird sicher mit deinem Fitnest Konto synchronisiert.</p></div>'
    :lastError
      ?`<div class="v31-empty"><span>!</span><h3>Liste nicht verfügbar</h3><p>${esc(lastError)}</p><button type="button" class="secondary" data-v31-retry>Erneut laden</button></div>`
      :!loaded||loading
        ?'<div class="v31-loading"><i></i><span>Einkaufsliste wird geladen</span></div>'
        :items.length?shoppingHtml():emptyHtml();
  section.innerHTML=`<div class="section-head"><div><small>Build 3.1</small><h3>Einkaufsliste 2.0</h3></div><span class="pill">${loading?'Lädt …':`${items.filter(item=>!item.checked).length} offen`}</span></div>${body}`;
  if(current)current.replaceWith(section);
  else{
    const anchor=app.querySelector('[data-v30-root]')||app.querySelector('.hero');
    if(anchor)anchor.after(section);else app.prepend(section);
  }
}

function queueRender(){if(queued)return;queued=true;queueMicrotask(render)}

async function load(force=false){
  const current=await session(),nextUser=current?.user?.id||'';
  if(nextUser!==userId){userId=nextUser;items=[];loaded=false}
  if(!userId){loaded=true;lastError='';queueRender();return}
  if(loaded&&!force){queueRender();return}
  loading=true;lastError='';queueRender();
  try{
    const result=await (await client()).from('shopping_items').select('*').eq('user_id',userId).eq('week_start',nextMonday()).order('item_name',{ascending:true});
    if(result.error)throw result.error;
    items=result.data||[];loaded=true;
  }catch(error){console.error('v31 load',error);lastError='Die Einkaufsliste konnte nicht geladen werden.';loaded=true}
  finally{loading=false;queueRender()}
}

async function toggle(id){
  const item=items.find(value=>value.id===id);
  if(!item||loading)return;
  const previous=item.checked;
  item.checked=!previous;queueRender();
  try{
    const result=await (await client()).from('shopping_items').update({checked:item.checked,updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',userId);
    if(result.error)throw result.error;
  }catch(error){item.checked=previous;queueRender();console.error('v31 toggle',error);toast('Status konnte nicht gespeichert werden.')}
}

async function remove(id){
  const item=items.find(value=>value.id===id);
  if(!item||!confirm(`„${item.item_name}“ aus der Einkaufsliste entfernen?`))return;
  try{
    const result=await (await client()).from('shopping_items').delete().eq('id',id).eq('user_id',userId);
    if(result.error)throw result.error;
    items=items.filter(value=>value.id!==id);queueRender();toast('Eintrag entfernt.');
  }catch(error){console.error('v31 remove',error);toast('Eintrag konnte nicht entfernt werden.')}
}

function addDialog(){
  const sheet=document.getElementById('sheet'),content=document.getElementById('sheetContent');
  if(!sheet||!content||!userId)return;
  content.innerHTML=`<form class="sheet-inner v31-form" data-v31-form><div class="sheet-handle"></div><div class="sheet-head"><div><p class="eyebrow">Einkaufsliste</p><h2>Eintrag hinzufügen</h2></div><button type="button" data-v31-close>×</button></div><label>Produkt<input name="name" maxlength="100" required placeholder="Zum Beispiel Äpfel"></label><label>Menge<input name="amount" maxlength="80" placeholder="Zum Beispiel 6 Stück"></label><label>Kategorie<select name="category">${CATEGORIES.map(category=>`<option value="${category.id}">${esc(category.label)}</option>`).join('')}</select></label><label>Geschätzter Preis in Euro<input name="cost" type="number" min="0" max="500" step="0.01" inputmode="decimal" placeholder="0,00"></label><button class="primary" type="submit">Zur Liste hinzufügen</button><button class="secondary" type="button" data-v31-close>Abbrechen</button></form>`;
  if(!sheet.open)sheet.showModal();
  content.querySelectorAll('[data-v31-close]').forEach(button=>button.onclick=()=>sheet.close());
  content.querySelector('form').onsubmit=async event=>{
    event.preventDefault();
    const form=new FormData(event.currentTarget),profile=activeProfile(),category=String(form.get('category')||'other');
    const row={user_id:userId,week_start:nextMonday(),item_key:`manual-${category}-${crypto.randomUUID()}`.slice(0,128),item_name:String(form.get('name')||'').trim(),amount_text:String(form.get('amount')||'').trim()||null,checked:false,estimated_cost_eur:Number(form.get('cost'))||null,nutrition_profile_id:profile?.id||null,updated_at:new Date().toISOString()};
    if(!row.item_name)return;
    const button=event.currentTarget.querySelector('[type="submit"]');button.disabled=true;
    try{
      const result=await (await client()).from('shopping_items').insert(row).select('*').single();
      if(result.error)throw result.error;
      items.push(result.data);items.sort((a,b)=>a.item_name.localeCompare(b.item_name,'de'));sheet.close();queueRender();toast('Eintrag hinzugefügt.');
    }catch(error){console.error('v31 add',error);toast('Eintrag konnte nicht gespeichert werden.');button.disabled=false}
  };
  requestAnimationFrame(()=>content.querySelector('[name="name"]')?.focus());
}

document.addEventListener('click',event=>{
  const toggleButton=event.target.closest?.('[data-v31-toggle]');
  if(toggleButton){event.preventDefault();void toggle(toggleButton.dataset.v31Toggle);return}
  const removeButton=event.target.closest?.('[data-v31-remove]');
  if(removeButton){event.preventDefault();void remove(removeButton.dataset.v31Remove);return}
  if(event.target.closest?.('[data-v31-add]')){event.preventDefault();addDialog();return}
  if(event.target.closest?.('[data-v31-retry]')){event.preventDefault();loaded=false;void load(true);return}
  if(event.target.closest?.('[data-v31-plan]')){event.preventDefault();document.querySelector('[data-v30-generate]')?.click()}
},true);

const app=document.getElementById('app'),title=document.getElementById('pageTitle');
if(app)new MutationObserver(queueRender).observe(app,{childList:true});
if(title)new MutationObserver(queueRender).observe(title,{childList:true,subtree:true,characterData:true});
document.querySelectorAll('.tab').forEach(button=>button.addEventListener('click',()=>{queueRender();if(button.dataset.view==='nutrition')void load()}));
document.addEventListener('fitnest:v27-auth',()=>{loaded=false;void load(true)});
document.addEventListener('fitnest:cloud-synced',()=>{loaded=false;void load(true)});

void load();
queueRender();
