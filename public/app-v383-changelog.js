const BUILD='3.8.3';

export const CHANGELOG=[
  {date:'20.08.2026',version:'Build 3.8.3',title:'Changelog in den Einstellungen',changes:[
    'Der vollständige Fitnest-Changelog ist direkt in den Einstellungen erreichbar.',
    'Jeder Eintrag zeigt Datum, Build-Stand, Titel und die wichtigsten Änderungen.',
    'Der aktuelle App-Stand wird in den Einstellungen sichtbar als Build 3.8.3 ausgewiesen.'
  ]},
  {date:'20.08.2026',version:'Build 3.8.2',title:'Gewichtsverlauf und mobile Anzeige korrigiert',changes:[
    'Der Dialog zum Eintragen des Gewichts bleibt auf schmalen iPhones vollständig innerhalb des sichtbaren App-Bereichs.',
    'Im Fortschritt gibt es einen responsiven Gewichtsverlauf für 30 Tage, 90 Tage und den gesamten Zeitraum.',
    'Aktuelles Gewicht, Veränderung, Startgewicht, Zielgewicht und Ziel-Fortschritt werden gemeinsam dargestellt.'
  ]},
  {date:'19.08.2026',version:'Build 3.8.1',title:'App-Tutorial und feste Dialoge',changes:[
    'Einstellungsdialoge verhalten sich als feste App-Layer ohne horizontales Verschieben oder Mehrfinger-Gesten.',
    'Ein siebenteiliges Tutorial erklärt Heute, Plan, Essen, Coach, Übungen, Fortschritt, Arbeitszeiten und Push.',
    'Das Tutorial kann dauerhaft ausgeblendet und später über die Einstellungen erneut geöffnet werden.'
  ]},
  {date:'19.08.2026',version:'Build 3.8',title:'Arbeitszeiten und Trink-Erinnerungen',changes:[
    'Arbeitstage sowie Start- und Endzeiten können pro Wochentag hinterlegt werden.',
    'Fitnest legt Training automatisch in sinnvolle freie Zeitfenster außerhalb der Arbeitszeit.',
    'Trink-Erinnerungen unterstützen eigenen Zeitraum, Intervall und frei wählbare Wochentage.',
    'Training und Wasser können serverseitig auch bei geschlossener App erinnert werden.'
  ]},
  {date:'18.08.2026',version:'Build 3.7',title:'Coach 2.0',changes:[
    'Schlaf, Energie, Schritte, Wasser, Gewichtstrend und Trainingsbelastung werden gemeinsam bewertet.',
    'Empfehlungen bleiben Hinweise und sperren weder Training noch Planerstellung.',
    'Für die optionale KI-Auswertung von Gesundheitsdaten gilt eine eigene ausdrückliche Einwilligung.'
  ]},
  {date:'18.08.2026',version:'Build 3.6',title:'Gesundheitsdaten Hub',changes:[
    'Apple-Health-Daten können aus einer exportierten XML-Datei lokal eingelesen werden.',
    'CSV-Import unterstützt Gewicht, Schritte, Schlaf, Wasser und Energie mit Vorschau vor dem Speichern.',
    'Tägliche Gesundheitswerte können zusätzlich manuell erfasst und mit dem Account synchronisiert werden.'
  ]},
  {date:'18.08.2026',version:'Build 3.5',title:'PWA Premium',changes:[
    'Neue Geräteverwaltung mit Installationshilfe für iPhone, iPad und Android.',
    'Update-, Offline- und Online-Status sind innerhalb der App sichtbar.',
    'Diagnose zeigt Installation, App-Version, Cloud-Sync, Push und lokalen Speicher.'
  ]},
  {date:'18.08.2026',version:'Build 3.4',title:'Fortschritt 2.0',changes:[
    'Gewicht, Training, RPE, absolvierte Sätze und Übungsentwicklung werden in einem Fortschritts-Dashboard gebündelt.',
    'Persönliche Fortschrittsdaten können als CSV exportiert werden.',
    'Gewichtseinträge werden lokal gespeichert und bei Login geschützt mit Supabase synchronisiert.'
  ]},
  {date:'18.08.2026',version:'Build 3.3',title:'Geführter Trainingsmodus',changes:[
    'Training läuft als geführter Vollbildmodus Satz für Satz ab.',
    'Wiederholungen oder Sekunden, RPE und Pausen lassen sich direkt im Ablauf erfassen.',
    'Training kann pausiert, später fortgesetzt sowie mit Schwierigkeit und Energie bewertet werden.'
  ]},
  {date:'18.08.2026',version:'Build 3.2',title:'Rezept- und Kochmodus',changes:[
    'Geplante Mahlzeiten enthalten vollständige Zutatenlisten und Zubereitungsschritte.',
    'Portionen, Zutatenmengen und Nährwerte lassen sich automatisch skalieren.',
    'Ein geführter Kochmodus mit Checkliste, Timern, Favoriten und sicherem Mahlzeitentausch wurde ergänzt.'
  ]},
  {date:'18.08.2026',version:'Build 3.1',title:'Einkaufsliste 2.0',changes:[
    'Zutaten aus dem bestätigten KI-Ernährungsplan werden automatisch kategorisiert und zusammengeführt.',
    'Wochenbudget, Gesamtschätzung und verbleibender Betrag sind direkt sichtbar.',
    'Manuelle Artikel und bereits erledigte Einträge bleiben bei einer neuen Planübernahme erhalten.'
  ]},
  {date:'18.08.2026',version:'Build 3.0',title:'Adaptive Essenswoche',changes:[
    'Fitnest erstellt eine vollständige KI-Vorschau für die nächste Essenswoche.',
    'Kalorien, Protein, Ernährungsform, Allergien, Zöliakie und Budgetrahmen bleiben als feste Vorgaben erhalten.',
    'Die nächste Woche wird erst nach ausdrücklicher Bestätigung übernommen.'
  ]},
  {date:'18.08.2026',version:'Build 2.9',title:'Adaptive KI-Wochenplanung',changes:[
    'Die vergangene Woche wird anhand von Umsetzung, Trainingsschwierigkeit, Energie und Gewichtsverlauf analysiert.',
    'Fitnest schlägt stabile Planung, kleine Progression oder kontrollierte Entlastung vor.',
    'Eine Änderung wird erst nach ausdrücklicher Übernahme für die nächste Planwoche aktiv.'
  ]},
  {date:'18.08.2026',version:'Build 2.8',title:'Tagesplan und Adherence Tracking',changes:[
    'Heute zeigt Training und geplante Mahlzeiten mit einem gemeinsamen Tagesfortschritt.',
    'Mahlzeiten können als gegessen, ersetzt oder ausgelassen markiert werden.',
    'Trainingsabschluss speichert Schwierigkeit und Energie als Feedback für spätere Auswertungen.'
  ]},
  {date:'17.08.2026',version:'Build 2.7.4',title:'Plan-Zusammenfassung und vollständige Übungsbilder',changes:[
    'Nach der KI-Planerstellung fasst ein Popup Ziel, Training, Ernährung und Planungsrahmen zusammen.',
    'Alle 25 aktiven Übungen erhalten eindeutig zugeordnete, unverzerrte Bilder.'
  ]},
  {date:'17.08.2026',version:'Build 2.7.3',title:'Aggressiver Zieltermin nur noch als Hinweis',changes:[
    'Ein sehr ambitioniertes Wunschdatum bleibt erhalten und blockiert die KI-Planerstellung nicht mehr.',
    'Die tatsächliche Planung bleibt trotzdem innerhalb des hinterlegten Sicherheitsrahmens.'
  ]},
  {date:'17.08.2026',version:'Build 2.7.2',title:'Stabiler Auth- und KI-Start',changes:[
    'Account, Onboarding und Cloud-Sync nutzen einen gemeinsamen Supabase-Client.',
    'Sitzungsprüfung und KI-Start zeigen ihren Status sichtbar an und blockieren nicht mehr still.'
  ]},
  {date:'17.08.2026',version:'Build 2.7.1',title:'Google-Login im Onboarding korrigiert',changes:[
    'Eine gültige Supabase-Sitzung wird nach Google OAuth direkt verwendet.',
    'Der finale KI-Button wird nicht mehr durch einen veralteten Session-Spiegel blockiert.'
  ]},
  {date:'17.08.2026',version:'Build 2.7',title:'Accounts und Cloud-Sync',changes:[
    'E-Mail-Registrierung, Login, Google-Anmeldung, Anzeigename, Abmelden und Passwort-Reset sind im Profil integriert.',
    'Profil, Ziele, Gewicht, Training, Ernährung, Reviews und Favoriten werden geräteübergreifend wiederhergestellt.',
    'Persönliche Tabellen bleiben über nutzergebundene RLS-Regeln geschützt.'
  ]},
  {date:'17.08.2026',version:'Build 2.6.1',title:'Onboarding-Hotfix',changes:[
    'Der Weiter-Button im ersten Onboarding-Schritt funktioniert wieder zuverlässig.',
    'Validierungsfehler werden direkt im sichtbaren Onboarding angezeigt und ungültige Felder fokussiert.'
  ]},
  {date:'17.08.2026',version:'Build 2.6',title:'Neues Onboarding und KI-Pläne',changes:[
    'Erststart erfasst Ziel, Körperdaten, Training, Ernährung, Zöliakie, Budget und Essenszeiten vollständig.',
    'Nach Einwilligung werden Trainings- und 7-Tage-Essensplan serverseitig mit OpenAI erzeugt.',
    'Die KI-Planung benötigt einen Fitnest-Login und hält den OpenAI-Schlüssel ausschließlich serverseitig.'
  ]},
  {date:'17.08.2026',version:'Build 2.5.1',title:'Stabilität und natives PWA-Verhalten',changes:[
    'Das Übungswiki nutzt einen stabilen Renderer ohne wiederholte Render-Schleifen.',
    'Doppeltap-Zoom, iOS-Tap-Highlight, Browser-Callout und horizontales Overscroll-Verhalten wurden gehärtet.',
    'Der Übungskatalog bleibt bei Netzproblemen aus dem letzten lokalen Stand nutzbar.'
  ]},
  {date:'17.08.2026',version:'Build 2.5',title:'Übungswiki 2.0',changes:[
    '25 aktive Home-Workout-Übungen mit Suche und Filtern nach Bereich, Level und Equipment.',
    'Favoriten sowie leichtere, schwerere und alternative Varianten wurden ergänzt.',
    'Ausführung, Fehler, Muskelgruppen, Equipment und Low-Impact-Status sind pro Übung sichtbar.'
  ]},
  {date:'17.08.2026',version:'Build 2.4.4',title:'Zielgesteuerte Neuplanung',changes:[
    'Das Abnehmziel kann direkt aus Fortschritt oder Profil geändert werden.',
    'Ein neues Ziel löst einen kontrollierten Replan-Vorschlag für Ernährung und Aktivität aus, ohne bestehende Logs zu löschen.'
  ]},
  {date:'17.08.2026',version:'Build 2.4.3',title:'Flexible Essenszeiten',changes:[
    'Essenszeiten können einzeln hinzugefügt, entfernt und frei benannt werden.',
    'Zwischen einer und sechs Essenszeiten werden automatisch mit dem Ernährungsprofil synchronisiert.'
  ]},
  {date:'17.08.2026',version:'Build 2.4.2',title:'Zöliakie-Profil und ChatGPT-Essensplanung',changes:[
    'Eine explizite Option für strikt glutenfreie Planung bei Zöliakie wurde ergänzt.',
    'Der serverseitige Rezeptplaner berücksichtigt Ernährungsform, Allergien, Abneigungen, Ziele, Essenszeiten und Budget.',
    'Ein zusätzlicher Zöliakie-Guard verwirft Pläne mit offensichtlichen Glutenquellen.'
  ]},
  {date:'17.08.2026',version:'Build 2.4.1',title:'Ernährungsprofile sichtbar und KI-Rezeptplaner',changes:[
    'Ernährungsprofile und Budget sind direkt aus den Einstellungen erreichbar.',
    'Der OpenAI-Rezeptplaner erzeugt Tages- oder 7-Tage-Pläne mit konkreten Zutaten und Zubereitungsschritten.',
    'Die erste Datenübertragung an OpenAI benötigt eine ausdrückliche Einwilligung.'
  ]},
  {date:'17.08.2026',version:'Build 2.4',title:'Coach, Ernährungsprofile und Essensbudget',changes:[
    'Ein persönlicher Coach bewertet Training, RPE, Schritte, Gewichtstrend und Ernährungslogging.',
    'Mehrere Ernährungsprofile mit Mischkost, vegetarisch, vegan, Allergien, Abneigungen und individuellen Zielwerten sind möglich.',
    'Essensbudgets können pro Tag, Woche oder Monat geplant und mit Kostenschätzungen verglichen werden.'
  ]},
  {date:'17.08.2026',version:'Build 2.3',title:'Echte Web-Push-Erinnerungen',changes:[
    'Push-Benachrichtigungen funktionieren serverseitig auch bei geschlossener App auf unterstützten Geräten.',
    'Training, Wiegen, Wasser, Schritte und Tagescheck besitzen eigene Tage, Uhrzeiten und Ruhezeiten.',
    'Test-Push, Geräte-Registrierung und serverseitige Deduplizierung wurden ergänzt.'
  ]},
  {date:'17.08.2026',version:'Build 2.2',title:'Adaptive Fortschrittsanalyse',changes:[
    '7- und 30-Tage-Gewichtstrends, 7-Tage-Durchschnitt und Zielprognose wurden ergänzt.',
    'Ein Wochen-Score verbindet Training, Schritte und Ernährungslogging.',
    'Plateau-, Belastungs- und Progressionshinweise ändern den Plan erst nach Bestätigung.'
  ]},
  {date:'17.08.2026',version:'Build 2.1',title:'Persönliche Ernährung und Meal Logging',changes:[
    'Kalorien- und Proteinorientierung, Ernährungsform, Allergien und Abneigungen steuern den Tagesplan.',
    'Mahlzeiten können getauscht, skaliert, protokolliert und als eigene Mahlzeiten gespeichert werden.',
    'Eine 7-Tage-Einkaufsliste wird aus den geplanten Mahlzeiten erzeugt.'
  ]},
  {date:'17.08.2026',version:'Build 2.0',title:'Workout Logging und Übungsdarstellungen',changes:[
    'Workouts können gestartet, pausiert, fortgesetzt und beendet werden.',
    'Wiederholungen beziehungsweise Sekunden sowie RPE werden pro Satz protokolliert.',
    'Workout-Historie und erste deterministische Progressionshinweise wurden ergänzt.'
  ]},
  {date:'17.08.2026',version:'Build 1',title:'Fitnest Grundlage',changes:[
    'Eigenständige Mobile-First-PWA mit Onboarding, Heute-Dashboard, Trainingsplan, Übungswiki und Fortschritt.',
    'Gewicht, Schritte, Wasser und Ernährungsgrundlagen werden lokal und bei Login mit Supabase synchronisiert.',
    'Supabase Auth, RLS, Edge Functions, PWA-Service-Worker und Cloudflare-Deployment bilden die technische Basis.'
  ]}
];

function escapeHtml(value=''){
  return String(value).replace(/[&<>\"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[char]));
}

function entryHtml(entry,index){
  return `<article class="v383-entry ${index===0?'current':''}">
    <header><div><span>${escapeHtml(entry.date)}</span><h3>${escapeHtml(entry.title)}</h3></div><strong>${escapeHtml(entry.version)}</strong></header>
    <ul>${entry.changes.map(change=>`<li>${escapeHtml(change)}</li>`).join('')}</ul>
  </article>`;
}

function openChangelog(){
  const sheet=document.getElementById('sheet'),content=document.getElementById('sheetContent');
  if(!sheet||!content)return;
  content.innerHTML=`<div class="sheet-inner v383-changelog-sheet">
    <div class="sheet-handle"></div>
    <div class="sheet-head v383-changelog-head"><div><p class="eyebrow">Fitnest · Build ${BUILD}</p><h2>Changelog</h2></div><button type="button" data-v383-close aria-label="Changelog schließen">×</button></div>
    <p class="v383-intro">Alle umgesetzten Änderungen mit Datum und Build-Stand.</p>
    <div class="v383-current-card"><div><small>Aktueller Stand</small><strong>Build ${BUILD}</strong></div><span>${CHANGELOG.length} Einträge</span></div>
    <div class="v383-list">${CHANGELOG.map(entryHtml).join('')}</div>
    <button class="secondary v383-back" type="button" data-v383-back>Zurück zu den Einstellungen</button>
  </div>`;
  content.querySelector('[data-v383-close]')?.addEventListener('click',()=>sheet.close());
  content.querySelector('[data-v383-back]')?.addEventListener('click',()=>{
    sheet.close();
    setTimeout(()=>document.getElementById('profileButton')?.click(),0);
  });
  if(!sheet.open)sheet.showModal();
}

function injectSettings(){
  const content=document.getElementById('sheetContent');
  if(!content||content.querySelector('.sheet-head h2')?.textContent!=='Einstellungen')return;
  const eyebrow=content.querySelector('.sheet-head .eyebrow');
  if(eyebrow&&eyebrow.textContent.startsWith('Fitnest · Build'))eyebrow.textContent=`Fitnest · Build ${BUILD}`;
  if(content.querySelector('[data-v383-changelog]'))return;
  const grid=content.querySelector('.form-grid');
  if(!grid)return;
  const button=document.createElement('button');
  button.type='button';
  button.className='secondary v383-settings-button';
  button.dataset.v383Changelog='1';
  button.innerHTML=`<span>Changelog</span><strong>Build ${BUILD}</strong>`;
  const legal=grid.querySelector('[data-sheet-action="legal-imprint"]');
  grid.insertBefore(button,legal||null);
}

const content=document.getElementById('sheetContent');
if(content){
  let queued=false;
  new MutationObserver(()=>{
    if(queued)return;
    queued=true;
    queueMicrotask(()=>{queued=false;injectSettings()});
  }).observe(content,{childList:true,subtree:true});
}

document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-v383-changelog]');
  if(!button)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openChangelog();
},true);

document.getElementById('profileButton')?.addEventListener('click',()=>setTimeout(injectSettings,0));
injectSettings();
