const BUILD='3.8.6';
const DISMISSED='fitnest.tutorial.dismissed.v381';
const SHOWN_THIS_SESSION='fitnest.tutorial.shown.v381';
const ONBOARDING_COMPLETE='fitnest.onboarding.complete.v26';
let currentStep=0,lockedScroll=0;

export const TUTORIAL_STEPS=[
  {
    icon:'✦',eyebrow:'Willkommen',title:'Fitnest in drei Minuten',
    copy:'Die App verbindet Training, Ernährung, Alltag und Fortschritt. Dieses kurze Tutorial zeigt dir, wo alles liegt und welche Einstellungen du einmal prüfen solltest.',
    features:[['Ein persönlicher Plan','Ziele, Trainingsrhythmus und Ernährung bilden deine Grundlage.'],['Sechs Hauptbereiche','Heute, Plan, Essen, Coach, Übungen und Fortschritt bleiben jederzeit erreichbar.']],
    nav:['Heute','Plan','Essen','Coach','Übungen','Fortschritt']
  },
  {
    icon:'◉',eyebrow:'Heute',title:'Dein tägliches Cockpit',
    copy:'Hier siehst du, was heute relevant ist, und trägst Fortschritte direkt ein.',
    features:[['Tagesziele','Wasser, Schritte, Gewicht und offene Aufgaben auf einen Blick.'],['Training starten','Die heute geplante Einheit inklusive vorgeschlagener Uhrzeit öffnen.'],['Schnell protokollieren','Erledigte Ziele und Check-ins werden direkt mit deinem Account synchronisiert.']]
  },
  {
    icon:'▦',eyebrow:'Plan und Arbeit',title:'Training passt sich deinem Alltag an',
    copy:'Im Plan findest du alle Einheiten. Hinterlege zusätzlich deine Arbeitstage und Arbeitszeiten, damit Fitnest sinnvolle freie Trainingsfenster nutzt.',
    features:[['Trainingsplan','Wochentage, Dauer, Übungen und empfohlene Uhrzeit.'],['Arbeitszeiten','Im Profil unter „Arbeitszeiten & Trainingsplanung“ eintragen.'],['Automatische Anpassung','Unpassende Einheiten werden vor oder nach der Arbeit beziehungsweise auf einen freien Tag gelegt.']]
  },
  {
    icon:'⌁',eyebrow:'Essen',title:'Ernährung vollständig planen',
    copy:'Fitnest verbindet Essensplan, Rezepte, Kochbuch und Einkaufsliste mit deinen persönlichen Vorgaben.',
    features:[['Ernährungsprofil','Ernährungsform, Allergien, Abneigungen, Mahlzeiten und Budget festlegen.'],['KI-Essensplan','Passende Vorschläge für mehrere Tage erzeugen und Mahlzeiten protokollieren.'],['Rezepte und Einkauf','Rezepte speichern, bewerten und Zutaten in die Einkaufsliste übernehmen.']]
  },
  {
    icon:'↗',eyebrow:'Coach und Fortschritt',title:'Entwicklung statt Einzelwerte',
    copy:'Der Coach betrachtet deine Umsetzung im Zusammenhang. Die App erstellt keine Diagnose und sperrt dich nicht wegen eines schlechten Tages.',
    features:[['Coach','Hinweise aus Training, Schlaf, Energie, Schritten, Wasser und Gewicht.'],['Übungswiki','Ausführung, häufige Fehler, Varianten und Favoriten nachschlagen.'],['Fortschritt','Gewichtstrend, Trainingsleistung und Regelmäßigkeit verfolgen.']]
  },
  {
    icon:'◌',eyebrow:'Push und Erinnerungen',title:'Erinnerungen kommen auch bei geschlossener App',
    copy:'Aktiviere Push einmal auf jedem Gerät und lege fest, wann Fitnest dich erinnern darf.',
    features:[['Trinken','Zeitraum, Intervall und Wochentage frei einstellen. Erinnerungen stoppen, sobald das Tagesziel erreicht ist.'],['Training und Check-ins','Training, Wiegen, Schritte und Tagesabschluss separat aktivieren.'],['Gerätehinweis','Desktop und Android funktionieren im Hintergrund. Auf iPhone muss Fitnest als Home-Screen-App installiert sein.']]
  },
  {
    icon:'✓',eyebrow:'Einmal prüfen',title:'Dann ist Fitnest startklar',
    copy:'Diese Einstellungen haben den größten Einfluss auf passende Pläne und sinnvolle Benachrichtigungen.',
    features:[['Pflicht','Ziel, Körperdaten, Trainingshäufigkeit und Zeit pro Einheit.'],['Empfohlen','Arbeitszeiten, Wasserziel, Ernährungsprofil sowie Push-Zeitfenster und Ruhezeiten.'],['Optional','Gesundheitsdaten, Coach-KI, Favoriten und weitere Ernährungsprofile.']],
    setup:'Du kannst dieses Tutorial später jederzeit über Profil → App-Tutorial öffnen erneut starten.'
  }
];

export function shouldShowTutorial({dismissed=false,shownThisSession=false,onboardingComplete=false}={}){
  return !dismissed&&!shownThisSession&&onboardingComplete;
}

export function shouldPreventSheetTouch(touchCount=0,insideSheetInner=false){
  return Number(touchCount)>1||!insideSheetInner;
}

function escapeHtml(value=''){return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}

function syncBodyLock(){
  const sheetOpen=document.getElementById('sheet')?.open===true,tutorialOpen=!!document.getElementById('v381Tutorial'),shouldLock=sheetOpen||tutorialOpen,body=document.body;
  if(shouldLock&&!body.classList.contains('v381-modal-lock')){
    lockedScroll=window.scrollY;
    body.style.top=`-${lockedScroll}px`;
    body.classList.add('v381-modal-lock');
  }else if(!shouldLock&&body.classList.contains('v381-modal-lock')){
    body.classList.remove('v381-modal-lock');
    body.style.top='';
    window.scrollTo(0,lockedScroll);
  }
}

function root(){
  let node=document.getElementById('v381Tutorial');
  if(!node){node=document.createElement('div');node.id='v381Tutorial';node.className='v381-tutorial';document.body.append(node)}
  document.querySelector('.app-shell')?.setAttribute('inert','');
  syncBodyLock();
  return node;
}

function featureMarkup(features=[]){return features.map(([title,copy])=>`<div class="v381-feature"><span>✓</span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(copy)}</small></div></div>`).join('')}

function renderTutorial(){
  const step=TUTORIAL_STEPS[currentStep],node=root(),last=currentStep===TUTORIAL_STEPS.length-1;
  node.innerHTML=`<section class="v381-tutorial-card" role="dialog" aria-modal="true" aria-labelledby="v381TutorialTitle"><header class="v381-tutorial-head"><strong>Fitnest · ${BUILD}</strong><button type="button" data-v381-later aria-label="Tutorial später fortsetzen">Später</button></header><div class="v381-progress" aria-label="Schritt ${currentStep+1} von ${TUTORIAL_STEPS.length}">${TUTORIAL_STEPS.map((_,index)=>`<i class="${index<=currentStep?'active':''}"></i>`).join('')}</div><div class="v381-tutorial-body"><div class="v381-tutorial-icon" aria-hidden="true">${escapeHtml(step.icon)}</div><p class="eyebrow">${escapeHtml(step.eyebrow)} · ${currentStep+1}/${TUTORIAL_STEPS.length}</p><h2 id="v381TutorialTitle">${escapeHtml(step.title)}</h2><p>${escapeHtml(step.copy)}</p><div class="v381-feature-list">${featureMarkup(step.features)}</div>${step.nav?`<div class="v381-nav-preview">${step.nav.map(item=>`<span>${escapeHtml(item)}</span>`).join('')}</div>`:''}${step.setup?`<div class="v381-setup-card"><strong>Jederzeit wieder öffnen</strong><p>${escapeHtml(step.setup)}</p></div>`:''}</div><footer class="v381-tutorial-actions"><button type="button" class="secondary" data-v381-back ${currentStep===0?'disabled':''}>Zurück</button><button type="button" class="primary" data-v381-next>${last?'Verstanden, nicht erneut anzeigen':'Weiter'}</button><button type="button" class="v381-dismiss" data-v381-dismiss>Nicht erneut anzeigen</button></footer></section>`;
  node.querySelector('[data-v381-later]')?.addEventListener('click',()=>closeTutorial(false));
  node.querySelector('[data-v381-dismiss]')?.addEventListener('click',()=>closeTutorial(true));
  node.querySelector('[data-v381-back]')?.addEventListener('click',()=>{if(currentStep>0){currentStep--;renderTutorial()}});
  node.querySelector('[data-v381-next]')?.addEventListener('click',()=>{if(last)closeTutorial(true);else{currentStep++;renderTutorial()}});
  requestAnimationFrame(()=>node.querySelector('[data-v381-next]')?.focus());
}

export function openTutorial(){
  document.getElementById('sheet')?.close();
  currentStep=0;
  sessionStorage.setItem(SHOWN_THIS_SESSION,'yes');
  renderTutorial();
}

function closeTutorial(dismiss){
  if(dismiss)localStorage.setItem(DISMISSED,'yes');
  document.getElementById('v381Tutorial')?.remove();
  document.querySelector('.app-shell')?.removeAttribute('inert');
  syncBodyLock();
}

function injectSettingsButton(){
  const content=document.getElementById('sheetContent');
  if(!content||content.querySelector('.sheet-head h2')?.textContent!=='Einstellungen'||content.querySelector('[data-sheet-action="tutorial"]'))return;
  const button=document.createElement('button');
  button.type='button';button.className='secondary';button.dataset.sheetAction='tutorial';button.textContent='App-Tutorial öffnen';
  const legal=content.querySelector('[data-sheet-action="legal-imprint"]');
  legal?.parentElement?.insertBefore(button,legal);
}

function scheduleFirstRun(attempt=0){
  const dismissed=localStorage.getItem(DISMISSED)==='yes',shownThisSession=sessionStorage.getItem(SHOWN_THIS_SESSION)==='yes',onboardingComplete=localStorage.getItem(ONBOARDING_COMPLETE)==='yes';
  if(!shouldShowTutorial({dismissed,shownThisSession,onboardingComplete}))return;
  if(document.getElementById('v26Onboarding')||document.querySelector('.v26-summary-backdrop')||document.getElementById('sheet')?.open){
    if(attempt<40)setTimeout(()=>scheduleFirstRun(attempt+1),500);
    return;
  }
  openTutorial();
}

const sheet=document.getElementById('sheet');
if(sheet){
  new MutationObserver(()=>{injectSettingsButton();syncBodyLock()}).observe(sheet,{attributes:true,attributeFilter:['open']});
  sheet.addEventListener('close',syncBodyLock);
  sheet.addEventListener('touchmove',event=>{if(shouldPreventSheetTouch(event.touches.length,!!event.target.closest?.('.sheet-inner')))event.preventDefault()},{passive:false});
  sheet.addEventListener('gesturestart',event=>event.preventDefault(),{passive:false});
}
const content=document.getElementById('sheetContent');if(content)new MutationObserver(injectSettingsButton).observe(content,{childList:true,subtree:true});
document.addEventListener('click',event=>{const button=event.target.closest?.('[data-sheet-action="tutorial"]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();openTutorial()},true);
document.addEventListener('keydown',event=>{if(!document.getElementById('v381Tutorial'))return;if(event.key==='Escape')closeTutorial(false);if(event.key==='ArrowRight'&&currentStep<TUTORIAL_STEPS.length-1){currentStep++;renderTutorial()}if(event.key==='ArrowLeft'&&currentStep>0){currentStep--;renderTutorial()}});

injectSettingsButton();
setTimeout(()=>scheduleFirstRun(),900);
