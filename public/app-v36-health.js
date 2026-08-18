import { getSupabaseClient } from './app-supabase.js';

const BUILD='3.6';
const DAILY_KEY='fitnest.healthDaily.v36';
const WEIGHTS_KEY='fitnest.weights';
const MAX_FILE_BYTES=80*1024*1024;
const MAX_HISTORY_DAYS=730;
const S={session:null,remote:[],loading:false,pending:null,sourceName:'',loaded:false,queued:false};

const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}};
const esc=(value='')=>String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const iso=(date=new Date())=>{const copy=new Date(date);copy.setMinutes(copy.getMinutes()-copy.getTimezoneOffset());return copy.toISOString().slice(0,10)};
const cutoff=()=>{const date=new Date();date.setDate(date.getDate()-MAX_HISTORY_DAYS);return iso(date)};
const fmtDate=value=>value?new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(`${value}T12:00:00`)):'Noch offen';
const avg=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
const valid=value=>value!==null&&value!==''&&Number.isFinite(Number(value));
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function toast(message){const node=document.getElementById('toast');if(!node)return;node.textContent=message;node.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),3200)}
function sheet(html){const dialog=document.getElementById('sheet'),content=document.getElementById('sheetContent');if(!dialog||!content)return null;content.innerHTML=html;content.querySelectorAll('[data-v36-close]').forEach(button=>button.onclick=()=>dialog.close());if(!dialog.open)dialog.showModal();return content}
function number(value){const raw=String(value??'').trim();if(!raw)return null;const parsed=Number(raw.replace(',','.'));return Number.isFinite(parsed)?parsed:null}
function normalizeDate(value){const raw=String(value??'').trim();if(/^\d{4}-\d{2}-\d{2}/.test(raw))return raw.slice(0,10);const match=raw.match(/^(\d{1,2})[.\/]([0-1]?\d)[.\/](\d{4})$/);if(!match)return'';return`${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`}
function allowedDate(date){return date&&date>=cutoff()&&date<=iso()}
function cleanEntry(item){
  const entry={date:normalizeDate(item.date),source:item.source||'Manuell'};if(!allowedDate(entry.date))return null;
  if(valid(item.weight))entry.weight=clamp(Number(item.weight),35,300);
  if(valid(item.steps))entry.steps=Math.round(clamp(Number(item.steps),0,100000));
  if(valid(item.sleepHours))entry.sleepHours=Number(clamp(Number(item.sleepHours),0,24).toFixed(1));
  if(valid(item.waterL))entry.waterL=Number(clamp(Number(item.waterL),0,12).toFixed(1));
  if(valid(item.energy))entry.energy=Math.round(clamp(Number(item.energy),1,5));
  return Object.keys(entry).length>2?entry:null;
}
function mergeEntries(items){
  const map=new Map();for(const raw of items){const item=cleanEntry(raw);if(!item)continue;const before=map.get(item.date)||{date:item.date,source:item.source};map.set(item.date,{...before,...item})}return[...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
function localDaily(){return mergeEntries(read(DAILY_KEY,[])||[])}
function dailyData(){return mergeEntries([...(S.remote||[]).map(item=>({date:item.checkin_date,steps:item.steps,sleepHours:item.sleep_hours,waterL:item.water_l,energy:item.energy,source:'Cloud'})),...localDaily()])}
function lastDays(days=7){const from=new Date();from.setDate(from.getDate()-(days-1));const min=iso(from);return dailyData().filter(item=>item.date>=min)}
function metricValue(items,key){return items.map(item=>Number(item[key])).filter(Number.isFinite)}

function healthSection(){
  const days=lastDays(),steps=avg(metricValue(days,'steps')),sleep=avg(metricValue(days,'sleepHours')),water=avg(metricValue(days,'waterL')),latest=days.at(-1);
  return`<section class="section v36-health" data-v36-health><div class="section-head"><div><small>Gesundheitsdaten</small><h3>Dein Daten Hub</h3></div><span class="pill">Build ${BUILD}</span></div><div class="card v36-health-card"><div class="v36-health-head"><div class="v36-health-mark">♥</div><div><strong>${S.loading?'Daten werden geladen …':latest?`Aktuell bis ${fmtDate(latest.date)}`:'Bereit für deine Daten'}</strong><span>Apple Health Import, CSV Import und tägliche Erfassung</span></div></div><div class="v36-metrics"><article><small>Schritte</small><b>${steps==null?'Noch offen':Math.round(steps).toLocaleString('de-DE')}</b><span>Ø 7 Tage</span></article><article><small>Schlaf</small><b>${sleep==null?'Noch offen':`${sleep.toFixed(1).replace('.',',')} Std.`}</b><span>Ø 7 Tage</span></article><article><small>Wasser</small><b>${water==null?'Noch offen':`${water.toFixed(1).replace('.',',')} l`}</b><span>Ø 7 Tage</span></article></div><div class="v36-actions"><button class="primary" type="button" data-v36-open>Gesundheitsdaten öffnen</button><button class="secondary" type="button" data-v36-quick>Tageswerte eintragen</button></div></div></section>`;
}
function render(){
  S.queued=false;const root=document.querySelector('[data-v34-root]');if(!root||document.getElementById('pageTitle')?.textContent!=='Fortschritt'||root.querySelector('[data-v36-health]'))return;
  const note=root.querySelector('.v34-health-note')?.closest('section');if(note)note.insertAdjacentHTML('beforebegin',healthSection());else root.insertAdjacentHTML('beforeend',healthSection());
  root.querySelector('[data-v36-open]')?.addEventListener('click',openHub);root.querySelector('[data-v36-quick]')?.addEventListener('click',openManual);
}
function queueRender(){if(S.queued)return;S.queued=true;queueMicrotask(render)}
function refreshSection(){document.querySelector('[data-v36-health]')?.remove();queueRender()}

function openHub(){
  const content=sheet(`<div class="sheet-inner v36-sheet"><div class="sheet-handle"></div><div class="sheet-head"><div><p class="eyebrow">Build ${BUILD}</p><h2>Gesundheitsdaten</h2></div><button type="button" data-v36-close aria-label="Schließen">×</button></div><div class="sheet-body"><div class="v36-source-grid"><article><i></i><div><strong>Apple Health</strong><span>Die entpackte Datei <b>export.xml</b> importieren. Gewicht, Schritte und Schlaf werden lokal ausgewertet.</span></div></article><article><i>CSV</i><div><strong>Apps und Waagen</strong><span>CSV Dateien mit Datum, Gewicht, Schritten, Schlaf, Wasser oder Energie importieren.</span></div></article><article class="muted"><i>H</i><div><strong>Health Connect</strong><span>Direkte Synchronisierung folgt mit der nativen Android App. Die PWA hat keinen Zugriff auf die Geräte API.</span></div></article></div><div class="v36-hub-actions"><button class="primary" type="button" data-v36-import>Datei importieren</button><button class="secondary" type="button" data-v36-manual>Tageswerte eintragen</button><button class="ghost" type="button" data-v36-template>CSV Vorlage laden</button></div><div class="notice v36-privacy"><strong>Private Verarbeitung</strong><span>Die Datei wird zunächst nur auf diesem Gerät analysiert. Erst nach deiner Bestätigung werden die ausgewählten Tageswerte in Fitnest gespeichert und mit deinem Konto synchronisiert.</span></div></div></div>`);if(!content)return;
  content.querySelector('[data-v36-import]').onclick=openImport;content.querySelector('[data-v36-manual]').onclick=openManual;content.querySelector('[data-v36-template]').onclick=downloadTemplate;
}
function openManual(){
  const today=dailyData().find(item=>item.date===iso())||{},weight=(read(WEIGHTS_KEY,[])||[]).find(item=>item.date===iso())?.value??'';
  const content=sheet(`<div class="sheet-inner v36-sheet"><div class="sheet-handle"></div><div class="sheet-head"><div><p class="eyebrow">Gesundheitsdaten</p><h2>Tageswerte</h2></div><button type="button" data-v36-close aria-label="Schließen">×</button></div><form class="sheet-body v36-form" data-v36-form><label class="field">Datum<input name="date" type="date" value="${iso()}" min="${cutoff()}" max="${iso()}" required></label><div class="split"><label class="field">Gewicht in kg<input name="weight" type="number" inputmode="decimal" min="35" max="300" step="0.1" value="${weight}"></label><label class="field">Schritte<input name="steps" type="number" inputmode="numeric" min="0" max="100000" step="1" value="${today.steps??''}"></label></div><div class="split"><label class="field">Schlaf in Stunden<input name="sleep" type="number" inputmode="decimal" min="0" max="24" step="0.1" value="${today.sleepHours??''}"></label><label class="field">Wasser in Litern<input name="water" type="number" inputmode="decimal" min="0" max="12" step="0.1" value="${today.waterL??''}"></label></div><label class="field">Energie<select name="energy"><option value="">Keine Angabe</option>${[1,2,3,4,5].map(value=>`<option value="${value}" ${Number(today.energy)===value?'selected':''}>${value} von 5</option>`).join('')}</select></label><p class="v36-form-note">Leere Felder ändern keine bereits gespeicherten Werte.</p><button class="primary" type="submit">Tageswerte speichern</button></form></div>`);if(!content)return;content.querySelector('[data-v36-form]').onsubmit=saveManual;
}
async function saveManual(event){
  event.preventDefault();const button=event.currentTarget.querySelector('button[type="submit"]'),form=new FormData(event.currentTarget),entry=cleanEntry({date:form.get('date'),weight:number(form.get('weight')),steps:number(form.get('steps')),sleepHours:number(form.get('sleep')),waterL:number(form.get('water')),energy:number(form.get('energy')),source:'Manuell'});if(!entry){toast('Bitte mindestens einen gültigen Wert eintragen.');return}button.disabled=true;button.textContent='Wird gespeichert …';const cloud=await persist([entry]);document.getElementById('sheet')?.close();toast(cloud?'Tageswerte gespeichert und synchronisiert':'Tageswerte lokal gespeichert');
}
function openImport(){
  S.pending=null;S.sourceName='';const content=sheet(`<div class="sheet-inner v36-sheet"><div class="sheet-handle"></div><div class="sheet-head"><div><p class="eyebrow">Gesundheitsdaten</p><h2>Datei importieren</h2></div><button type="button" data-v36-close aria-label="Schließen">×</button></div><div class="sheet-body"><label class="v36-drop"><input type="file" accept=".csv,.xml,text/csv,text/xml,application/xml" data-v36-file><i>⇧</i><strong>CSV oder export.xml auswählen</strong><span>Maximal 80 MB. Es werden höchstens die letzten zwei Jahre übernommen.</span></label><div data-v36-preview><div class="v36-import-empty">Nach der Analyse siehst du zuerst eine Zusammenfassung. Es wird noch nichts gespeichert.</div></div></div></div>`);if(!content)return;content.querySelector('[data-v36-file]').onchange=handleFile;
}
async function handleFile(event){
  const file=event.target.files?.[0],preview=event.currentTarget.closest('.sheet-body')?.querySelector('[data-v36-preview]');if(!file||!preview)return;if(file.size>MAX_FILE_BYTES){preview.innerHTML='<div class="v36-import-error">Die Datei ist größer als 80 MB. Bitte eine kleinere Exportdatei verwenden.</div>';return}preview.innerHTML='<div class="v36-import-empty">Datei wird lokal analysiert …</div>';
  try{const text=await file.text(),entries=/\.xml$/i.test(file.name)||/^\s*<\?xml|<HealthData\b/.test(text)?parseAppleHealth(text):parseCsv(text);if(!entries.length)throw new Error('Keine unterstützten Gesundheitswerte gefunden.');S.pending=entries;S.sourceName=file.name;preview.innerHTML=previewHtml(entries,file.name);preview.querySelector('[data-v36-confirm]').onclick=confirmImport}catch(error){S.pending=null;preview.innerHTML=`<div class="v36-import-error"><strong>Import nicht möglich</strong><span>${esc(error.message||'Die Datei konnte nicht gelesen werden.')}</span></div>`}
}
function previewHtml(entries,name){
  const counts={weight:0,steps:0,sleepHours:0,waterL:0,energy:0};for(const item of entries)for(const key of Object.keys(counts))if(valid(item[key]))counts[key]++;
  const chips=[['Gewicht',counts.weight],['Schritte',counts.steps],['Schlaf',counts.sleepHours],['Wasser',counts.waterL],['Energie',counts.energy]].filter(([,count])=>count);
  return`<div class="v36-preview"><div class="v36-preview-ok">✓</div><div><small>${esc(name)}</small><h3>${entries.length} Tage erkannt</h3><p>${fmtDate(entries[0].date)} bis ${fmtDate(entries.at(-1).date)}</p></div><div class="v36-preview-chips">${chips.map(([label,count])=>`<span>${label}: ${count}</span>`).join('')}</div><div class="notice"><strong>Vor dem Speichern</strong><span>Importierte Felder ersetzen denselben Wert am selben Tag. Andere bestehende Tageswerte bleiben erhalten.</span></div><button class="primary" type="button" data-v36-confirm>Import bestätigen</button></div>`;
}
async function confirmImport(event){
  if(!S.pending?.length)return;const button=event.currentTarget;button.disabled=true;button.textContent='Wird gespeichert …';const count=S.pending.length,cloud=await persist(S.pending);S.pending=null;document.getElementById('sheet')?.close();toast(cloud?`${count} Tage importiert und synchronisiert`:`${count} Tage lokal importiert`);
}
function parseAttributes(source){const attrs={};for(const match of source.matchAll(/([A-Za-z][\w:]*)="([^"]*)"/g))attrs[match[1]]=match[2].replaceAll('&quot;','"').replaceAll('&amp;','&');return attrs}
function parseAppleHealth(text){
  if(!/<HealthData\b/.test(text))throw new Error('Die Datei ist kein Apple Health Export. Bitte export.xml auswählen.');const map=new Map(),record=/<Record\b([^>]*?)(?:\/>|>)/g;let match;
  while((match=record.exec(text))){const a=parseAttributes(match[1]),date=normalizeDate(a.startDate);if(!allowedDate(date))continue;const item=map.get(date)||{date,source:'Apple Health'};
    if(a.type==='HKQuantityTypeIdentifierBodyMass'){let value=number(a.value);if(value==null)continue;if(String(a.unit).toLowerCase()==='lb')value*=.45359237;if(value>=35&&value<=300)item.weight=Number(value.toFixed(1));}
    else if(a.type==='HKQuantityTypeIdentifierStepCount'){const value=number(a.value),source=a.sourceName||'Apple Health';if(value!=null){item._stepSources=item._stepSources||{};item._stepSources[source]=(item._stepSources[source]||0)+value;}}
    else if(a.type==='HKCategoryTypeIdentifierSleepAnalysis'&&/Asleep/i.test(a.value||'')){const start=new Date(a.startDate),end=new Date(a.endDate),hours=(end-start)/3600000,source=a.sourceName||'Apple Health';if(hours>0&&hours<=24){item._sleepSources=item._sleepSources||{};item._sleepSources[source]=(item._sleepSources[source]||0)+hours;}}
    map.set(date,item);
  }
  const entries=[...map.values()].map(item=>{const steps=Object.values(item._stepSources||{}),sleep=Object.values(item._sleepSources||{});if(steps.length)item.steps=clamp(Math.round(Math.max(...steps)),0,100000);if(sleep.length)item.sleepHours=Number(clamp(Math.max(...sleep),0,24).toFixed(1));delete item._stepSources;delete item._sleepSources;return item});return mergeEntries(entries);
}
function csvRows(text){
  const first=(text.split(/\r?\n/,1)[0]||''),delimiter=(first.match(/;/g)||[]).length>=(first.match(/,/g)||[]).length?';':first.includes('\t')?'\t':',';const rows=[];let row=[],cell='',quoted=false;
  for(let index=0;index<text.length;index++){const char=text[index];if(char==='"'){if(quoted&&text[index+1]==='"'){cell+='"';index++}else quoted=!quoted}else if(char===delimiter&&!quoted){row.push(cell);cell=''}else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&text[index+1]==='\n')index++;row.push(cell);if(row.some(value=>String(value).trim()))rows.push(row);row=[];cell=''}else cell+=char}
  row.push(cell);if(row.some(value=>String(value).trim()))rows.push(row);return rows;
}
const header=value=>String(value||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
function parseCsv(text){
  const rows=csvRows(text.replace(/^\ufeff/,''));if(rows.length<2)throw new Error('Die CSV Datei enthält keine Datenzeilen.');const headers=rows[0].map(header),find=(names)=>names.map(name=>headers.indexOf(name)).find(index=>index>=0)??-1,at=(row,index)=>index>=0?row[index]:'';
  const index={date:find(['date','datum','checkin_date','measured_on','start_date','startdate']),weight:find(['weight_kg','weight','gewicht_kg','gewicht','body_mass']),steps:find(['steps','schritte','step_count']),sleep:find(['sleep_hours','sleep','schlaf_stunden','schlaf']),water:find(['water_l','water','wasser_l','wasser']),energy:find(['energy','energie']),type:find(['typ','type']),value:find(['wert','value']),unit:find(['einheit','unit'])};if(index.date<0)throw new Error('Eine Spalte Datum oder Date fehlt.');const items=[];
  for(const row of rows.slice(1)){const date=normalizeDate(at(row,index.date));if(!allowedDate(date))continue;const item={date,source:'CSV Import'},type=String(at(row,index.type)).toLowerCase(),value=number(at(row,index.value)),unit=String(at(row,index.unit)).toLowerCase();
    if(type&&value!=null){if(type.includes('gewicht'))item.weight=unit.includes('lb')?value*.45359237:value;else if(type.includes('schritt'))item.steps=value;else if(type.includes('schlaf'))item.sleepHours=value;else if(type.includes('wasser'))item.waterL=value;else if(type.includes('energie'))item.energy=value;}
    if(index.weight>=0)item.weight=number(at(row,index.weight));if(index.steps>=0)item.steps=number(at(row,index.steps));if(index.sleep>=0)item.sleepHours=number(at(row,index.sleep));if(index.water>=0)item.waterL=number(at(row,index.water));if(index.energy>=0)item.energy=number(at(row,index.energy));items.push(item);
  }
  return mergeEntries(items);
}
function downloadTemplate(){
  const content='Datum;Gewicht_kg;Schritte;Schlaf_Stunden;Wasser_l;Energie\n'+`${iso()};;;;;`,blob=new Blob(['\ufeff'+content],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='fitnest-gesundheitsdaten-vorlage.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('CSV Vorlage erstellt');
}
function saveLocal(entries){
  const daily=new Map(localDaily().map(item=>[item.date,item])),weights=new Map((read(WEIGHTS_KEY,[])||[]).filter(item=>item.date).map(item=>[item.date,item]));
  for(const item of entries){const before=daily.get(item.date)||{date:item.date};daily.set(item.date,{...before,...item,updatedAt:new Date().toISOString()});if(valid(item.weight))weights.set(item.date,{date:item.date,value:Number(item.weight)})}
  write(DAILY_KEY,[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date)));write(WEIGHTS_KEY,[...weights.values()].sort((a,b)=>a.date.localeCompare(b.date)));
}
async function currentSession(){if(S.session?.user?.id)return S.session;try{return S.session=(await(await getSupabaseClient()).auth.getSession()).data.session||null}catch{return null}}
async function persist(rawEntries){
  const entries=mergeEntries(rawEntries);if(!entries.length)return false;saveLocal(entries);let cloud=false;
  try{const session=await currentSession();if(session?.user?.id){const db=await getSupabaseClient(),user=session.user.id,weightRows=entries.filter(item=>valid(item.weight)).map(item=>({user_id:user,measured_on:item.date,weight_kg:item.weight})),dailyEntries=entries.filter(item=>['steps','sleepHours','waterL','energy'].some(key=>valid(item[key])));
      for(let start=0;start<weightRows.length;start+=100){const result=await db.from('body_metrics').upsert(weightRows.slice(start,start+100),{onConflict:'user_id,measured_on'});if(result.error)throw result.error}
      for(let start=0;start<dailyEntries.length;start+=100){const batch=dailyEntries.slice(start,start+100),dates=batch.map(item=>item.date),existing=await db.from('daily_checkins').select('checkin_date,steps,water_l,sleep_hours,energy').eq('user_id',user).in('checkin_date',dates);if(existing.error)throw existing.error;const map=new Map((existing.data||[]).map(item=>[item.checkin_date,item])),now=new Date().toISOString(),rows=batch.map(item=>{const before=map.get(item.date)||{};return{user_id:user,checkin_date:item.date,steps:valid(item.steps)?item.steps:(before.steps??0),water_l:valid(item.waterL)?item.waterL:(before.water_l??0),sleep_hours:valid(item.sleepHours)?item.sleepHours:(before.sleep_hours??null),energy:valid(item.energy)?item.energy:(before.energy??null),updated_at:now}}),result=await db.from('daily_checkins').upsert(rows,{onConflict:'user_id,checkin_date'});if(result.error)throw result.error}
      cloud=true;await loadCloud(false);
    }
  }catch(error){console.error('v36 health sync',error);toast('Lokal gespeichert. Cloud Synchronisierung folgt automatisch.')}
  refreshSection();document.dispatchEvent(new CustomEvent('fitnest:v36-health-saved',{detail:{count:entries.length,cloud}}));document.dispatchEvent(new CustomEvent('fitnest:cloud-synced'));return cloud;
}
async function loadCloud(showState=true){
  if(S.loading)return;S.loading=true;if(showState)refreshSection();try{const session=await currentSession();if(!session?.user?.id){S.remote=[];return}const result=await(await getSupabaseClient()).from('daily_checkins').select('checkin_date,steps,water_l,sleep_hours,energy').eq('user_id',session.user.id).gte('checkin_date',cutoff()).order('checkin_date',{ascending:true});if(result.error)throw result.error;S.remote=result.data||[];S.loaded=true}catch(error){console.error('v36 load health',error)}finally{S.loading=false;refreshSection()}
}
function init(){
  document.addEventListener('fitnest:v34-progress-rendered',()=>{queueRender();if(!S.loaded)void loadCloud(false)});document.addEventListener('fitnest:cloud-synced',()=>{S.session=null;void loadCloud(false)});document.addEventListener('click',event=>{if(event.target.closest('[data-view="progress"],[data-view-go="progress"]'))setTimeout(queueRender,0)});setTimeout(queueRender,0);
}

if(typeof document!=='undefined')init();

export { mergeEntries, parseAppleHealth, parseCsv };
