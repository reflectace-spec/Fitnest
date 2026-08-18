const BUILD='3.5';
const DISMISSED_KEY='fitnest.pwa.installDismissed.v35';
const S={prompt:null,registration:null,waiting:null,applying:false,storage:'Wird geprüft …',queued:false};

const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const ios=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);
const android=()=>/android/i.test(navigator.userAgent);
const dismissed=()=>localStorage.getItem(DISMISSED_KEY)==='yes';
const esc=(value='')=>String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

function toast(message){const node=document.getElementById('toast');if(!node)return;node.textContent=message;node.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove('show'),3000)}
function formatBytes(value){if(!Number.isFinite(value)||value<=0)return'Noch keine Angabe';if(value<1024*1024)return`${Math.round(value/1024)} KB`;return`${(value/1024/1024).toFixed(1).replace('.',',')} MB`}
function pushStatus(){if(!('Notification'in window)||!('PushManager'in window))return{label:'Nicht verfügbar',tone:'muted'};if(Notification.permission==='granted')return{label:'Freigegeben',tone:'good'};if(Notification.permission==='denied')return{label:'Im System blockiert',tone:'warn'};return{label:'Noch nicht freigegeben',tone:'muted'}}
function syncStatus(){const sync=window.__fitnestV27?.sync;if(!window.__fitnestV27?.session)return{label:'Nur lokal',tone:'muted'};if(sync?.state==='synced')return{label:'Synchronisiert',tone:'good'};if(sync?.state==='error')return{label:'Fehler',tone:'warn'};return{label:'Wird synchronisiert',tone:'muted'}}
function installStatus(){if(standalone())return{label:'Installiert',tone:'good'};if(S.prompt)return{label:'Bereit zur Installation',tone:'good'};if(ios())return{label:'Über Safari installierbar',tone:'muted'};return{label:'Über das Browsermenü',tone:'muted'}}
function swStatus(){if(!('serviceWorker'in navigator))return{label:'Nicht unterstützt',tone:'warn'};if(S.waiting)return{label:'Update verfügbar',tone:'warn'};if(navigator.serviceWorker.controller)return{label:'Offline bereit',tone:'good'};return{label:'Wird vorbereitet',tone:'muted'}}
function statusRow(icon,title,status,detail){return`<article class="v35-status"><i>${icon}</i><div><strong>${esc(title)}</strong><span>${esc(detail)}</span></div><b class="${status.tone}">${esc(status.label)}</b></article>`}

function installGuide(){
  if(standalone())return`<div class="v35-guide success"><strong>Fitnest ist installiert</strong><span>Du kannst die App direkt vom Home Bildschirm beziehungsweise aus deiner App Liste öffnen.</span></div>`;
  if(S.prompt)return`<div class="v35-guide"><strong>Als App installieren</strong><span>Fitnest öffnet sich anschließend ohne Browserleisten und bleibt offline erreichbar.</span><button type="button" class="primary" data-v35-install>Fitnest installieren</button></div>`;
  if(ios())return`<div class="v35-guide"><strong>Installation auf iPhone oder iPad</strong><ol><li>Fitnest in Safari öffnen.</li><li>Unten auf „Teilen“ tippen.</li><li>„Zum Home Bildschirm“ auswählen.</li><li>Fitnest über das neue Icon öffnen.</li></ol><div class="v35-note">Hintergrund Push funktioniert unter iOS erst nach dieser Installation.</div></div>`;
  if(android())return`<div class="v35-guide"><strong>Installation auf Android</strong><ol><li>Das Browsermenü öffnen.</li><li>„App installieren“ oder „Zum Startbildschirm hinzufügen“ auswählen.</li><li>Fitnest anschließend über das App Icon öffnen.</li></ol></div>`;
  return`<div class="v35-guide"><strong>Installation auf diesem Gerät</strong><span>Öffne das Browsermenü und wähle „App installieren“, sobald die Option angeboten wird.</span></div>`;
}
async function openCenter(){
  await inspect();const dialog=document.getElementById('sheet'),content=document.getElementById('sheetContent');if(!dialog||!content)return;
  const install=installStatus(),worker=swStatus(),push=pushStatus(),sync=syncStatus();
  content.innerHTML=`<div class="sheet-inner v35-center"><div class="sheet-handle"></div><div class="sheet-head"><div><span class="eyebrow">Fitnest · Build ${BUILD}</span><h2>App & Gerät</h2></div><button type="button" data-v35-close aria-label="Schließen">×</button></div><section class="v35-status-list">${statusRow('⌂','Installation',install,'Home Bildschirm und App Modus')}${statusRow('↻','App Version',worker,`Build ${BUILD} und Offline Cache`)}${statusRow('◉','Internet',navigator.onLine?{label:'Online',tone:'good'}:{label:'Offline',tone:'warn'},navigator.onLine?'Cloud Funktionen erreichbar':'Lokale Funktionen bleiben verfügbar')}${statusRow('☁','Account & Cloud',sync,'Supabase Sync für deine Daten')}${statusRow('●','Benachrichtigungen',push,'Push Berechtigung auf diesem Gerät')}${statusRow('▣','Lokaler Speicher',{label:S.storage,tone:'muted'},'Offline Daten und App Dateien')}</section>${installGuide()}<section class="v35-actions"><button type="button" class="secondary" data-v35-update>Nach Updates suchen</button>${push.label!=='Nicht verfügbar'?'<button type="button" class="secondary" data-v35-push>Push & Erinnerungen öffnen</button>':''}<button type="button" class="ghost" data-v35-reload>App neu laden</button></section><div class="notice">Fitnest speichert wichtige App Dateien für die Offline Nutzung. Persönliche Cloud Daten bleiben durch die bestehenden Supabase Zugriffsregeln geschützt.</div></div>`;
  if(!dialog.open)dialog.showModal();bindCenter(content);
}
function bindCenter(root){
  root.querySelector('[data-v35-close]')?.addEventListener('click',()=>document.getElementById('sheet')?.close());
  root.querySelector('[data-v35-install]')?.addEventListener('click',installApp);
  root.querySelector('[data-v35-update]')?.addEventListener('click',checkUpdate);
  root.querySelector('[data-v35-reload]')?.addEventListener('click',()=>location.reload());
  root.querySelector('[data-v35-push]')?.addEventListener('click',()=>{document.getElementById('sheet')?.close();setTimeout(()=>{document.getElementById('profileButton')?.click();setTimeout(()=>document.querySelector('[data-sheet-action="push"]')?.click(),80)},80)});
}
async function inspect(){
  try{S.registration=await navigator.serviceWorker?.getRegistration?.();S.waiting=S.registration?.waiting||null}catch{}
  try{const estimate=await navigator.storage?.estimate?.();S.storage=formatBytes(estimate?.usage)}catch{S.storage='Nicht verfügbar'}
}
async function installApp(){
  if(!S.prompt){toast(ios()?'Nutze in Safari „Teilen“ und „Zum Home Bildschirm“.':'Nutze im Browsermenü „App installieren“.');return}
  const prompt=S.prompt;S.prompt=null;await prompt.prompt();const choice=await prompt.userChoice.catch(()=>null);if(choice?.outcome==='accepted'){localStorage.removeItem(DISMISSED_KEY);toast('Fitnest wird installiert')}else toast('Installation abgebrochen');enhanceToday();
}
async function checkUpdate(){
  try{const registration=S.registration||await navigator.serviceWorker?.getRegistration?.();if(!registration){toast('Offline Dienst noch nicht bereit');return}toast('Suche nach Updates …');await registration.update();S.waiting=registration.waiting||S.waiting;if(S.waiting){showUpdate();toast('Neue Version verfügbar')}else toast(`Build ${BUILD} ist aktuell`);setTimeout(openCenter,450)}catch(error){console.error('v35 update',error);toast('Update Prüfung nicht möglich')}
}
function applyUpdate(){if(!S.waiting)return;S.applying=true;S.waiting.postMessage({type:'SKIP_WAITING'});const button=document.querySelector('[data-v35-apply]');if(button){button.disabled=true;button.textContent='Update wird installiert …'}}
function showUpdate(){
  if(!S.waiting||document.querySelector('[data-v35-update-banner]'))return;
  const node=document.createElement('aside');node.className='v35-update-banner';node.dataset.v35UpdateBanner='1';node.innerHTML=`<div><strong>Neue Fitnest Version verfügbar</strong><span>Jetzt aktualisieren, ohne deine Daten zu verändern.</span></div><button type="button" class="primary" data-v35-apply>Aktualisieren</button>`;document.body.append(node);node.querySelector('[data-v35-apply]').onclick=applyUpdate;
}
function networkBanner(){
  let node=document.querySelector('[data-v35-network]');if(navigator.onLine){node?.remove();return}if(node)return;
  node=document.createElement('aside');node.className='v35-network-banner';node.dataset.v35Network='1';node.innerHTML='<strong>Offline</strong><span>Gespeicherte Pläne und Einträge bleiben verfügbar.</span>';document.body.append(node);
}
function enhanceSettings(){
  const root=document.getElementById('sheetContent');if(!root||root.querySelector('.sheet-head h2')?.textContent!=='Einstellungen'||root.querySelector('[data-v35-center-open]'))return;
  const button=document.createElement('button');button.type='button';button.className='secondary v35-settings-button';button.dataset.v35CenterOpen='1';button.innerHTML='<span>App & Gerät</span><small>Installation, Updates und Offline Status</small>';button.onclick=event=>{event.preventDefault();event.stopImmediatePropagation();openCenter()};const push=root.querySelector('[data-sheet-action="push"]');if(push)push.after(button);else root.querySelector('.form-grid')?.prepend(button);
}
function enhanceToday(){
  const app=document.getElementById('app');if(!app||document.getElementById('pageTitle')?.textContent!=='Dein Tag')return;const current=app.querySelector('[data-v35-install-card]');if(standalone()||dismissed()||(!S.prompt&&!ios()&&!android())){current?.remove();return}if(current)return;
  const section=document.createElement('section');section.className='section v35-install-card';section.dataset.v35InstallCard='1';section.innerHTML=`<div><span class="eyebrow">Fitnest als App</span><strong>${ios()?'Auf dem Home Bildschirm installieren':'Schneller und offline öffnen'}</strong><small>${ios()?'In Safari über „Teilen“ und „Zum Home Bildschirm“.':'Fitnest ohne Browserleisten nutzen.'}</small></div><div><button type="button" class="primary" data-v35-card-install>${S.prompt?'Installieren':'Anleitung'}</button><button type="button" class="ghost" data-v35-dismiss aria-label="Hinweis ausblenden">×</button></div>`;app.prepend(section);section.querySelector('[data-v35-card-install]').onclick=()=>S.prompt?installApp():openCenter();section.querySelector('[data-v35-dismiss]').onclick=()=>{localStorage.setItem(DISMISSED_KEY,'yes');section.remove()};
}
function queueEnhance(){if(S.queued)return;S.queued=true;queueMicrotask(()=>{S.queued=false;enhanceSettings();enhanceToday()})}
async function monitorServiceWorker(){
  if(!('serviceWorker'in navigator))return;
  try{S.registration=await navigator.serviceWorker.ready;S.waiting=S.registration.waiting||null;if(S.waiting)showUpdate();S.registration.addEventListener('updatefound',()=>{const worker=S.registration.installing;if(!worker)return;worker.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller){S.waiting=S.registration.waiting||worker;showUpdate()}})})}catch(error){console.warn('v35 service worker',error)}
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(S.applying)location.reload()});
}
function openShortcut(){const view=new URL(location.href).searchParams.get('view');if(!['today','plan','nutrition','wiki','progress'].includes(view))return;setTimeout(()=>document.querySelector(`.tab[data-view="${view}"]`)?.click(),250)}
function init(){
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();S.prompt=event;queueEnhance()});
  window.addEventListener('appinstalled',()=>{S.prompt=null;localStorage.removeItem(DISMISSED_KEY);toast('Fitnest wurde installiert');queueEnhance()});
  window.addEventListener('online',()=>{networkBanner();queueEnhance();toast('Wieder online')});window.addEventListener('offline',()=>{networkBanner();queueEnhance()});
  document.addEventListener('fitnest:v27-sync',queueEnhance);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')S.registration?.update?.().catch(()=>{})});
  const app=document.getElementById('app'),sheet=document.getElementById('sheetContent');if(app)new MutationObserver(queueEnhance).observe(app,{childList:true});if(sheet)new MutationObserver(queueEnhance).observe(sheet,{childList:true,subtree:true});
  networkBanner();monitorServiceWorker();inspect();openShortcut();setTimeout(queueEnhance,0);
}

init();