# Fitnest

Persönliche Fitness PWA. Eigenständige App mit separater Datenhaltung und separatem Deployment.

## Build 1

Enthalten:

- iOS-artiges Mobile UI mit Dark Glass Design
- Onboarding mit Gewicht, Zielgewicht, Zieltermin, Aktivität, Trainingstagen und Tageszielen
- Sicherheitscheck: kein Crash-Plan bei mehr als 1 kg gewünschter Abnahme pro Woche
- automatischer regelbasierter Wochenplan für Training zu Hause mit Yogamatte
- Heute-Dashboard mit Training, Schritten, Wasser und Gewicht
- Übungswiki mit acht Übungen, Schritt-für-Schritt-Ausführung und häufigen Fehlern
- Gewichtstracking und einfache Fortschrittsdarstellung
- Ernährungsbereich mit grobem Energierahmen und Mahlzeitenstruktur
- PWA Manifest, Offline Shell und Service Worker
- Push Event Handling inklusive Notification Click Routing
- Google Login Adapter für Supabase Auth
- Impressum und Datenschutz Entwurf mit klar markierten Pflicht-Platzhaltern
- Supabase Initialschema mit RLS, expliziten Grants und Tabellen für Profile, Ziele, Workouts, Ernährung und Push Subscriptions
- Edge Function Scaffold für Planerzeugung und Push Dispatch
- Cloudflare Workers Static Assets Konfiguration

## Lokaler Start

Ohne Build Tool:

```bash
python3 -m http.server 8080 -d public
```

Dann `http://localhost:8080` öffnen.

## Supabase verbinden

1. Dediziertes Supabase Projekt: `Fitnest` (`jiehjixmeuwecjffkqdo`, `eu-central-1`).
2. Initialmigration `build_1_initial_schema` ist angewendet.
3. `public/config.js` nutzt Projekt URL und Publishable Key.
4. Edge Functions `generate-plan` und `push-dispatch` sind mit JWT Prüfung deployed.
5. Google Login und die finale Cloudflare Redirect URL sind produktiv konfiguriert.

Keine `service_role` oder Secret Keys in `public/config.js` eintragen.

## Cloudflare

Das Projekt ist für Workers Static Assets vorbereitet. Nach vorhandenem Cloudflare Login:

```bash
npx wrangler deploy
```

Die aktuelle Cloudflare Dokumentation empfiehlt Workers Static Assets für neue statische bzw. Full-Stack Worker Anwendungen.

## Push und Installation

Serverseitiger Web Push, VAPID, Geräteverwaltung und der Scheduler für Trainings-, Wiege- und Tageserinnerungen sind produktiv eingerichtet. Build 3.5 ergänzt Installation, Update Hinweise, Offline Status, App Shortcuts und eine Geräteübersicht. Auf iPhone und iPad muss Fitnest über Safari zum Home Bildschirm hinzugefügt werden, bevor Hintergrund Push aktiviert werden kann.

## Gesundheitsdaten

Build 3.6 ergänzt einen Gesundheitsdaten Hub im Fortschrittsbereich:

- Apple Health Import aus der entpackten `export.xml`
- Schutz vor doppelten Schritt- und Schlafwerten aus mehreren Apple Health Quellen
- universeller CSV Import mit Vorschau vor dem Speichern
- tägliche Erfassung von Gewicht, Schritten, Schlaf, Wasser und Energie
- lokale Verarbeitung der Importdatei
- Synchronisierung mit den bestehenden, RLS geschützten Tabellen `body_metrics` und `daily_checkins`
- Erhalt bestehender Felder bei Teilimporten

Eine direkte HealthKit oder Health Connect Verbindung benötigt eine native iOS beziehungsweise Android App. Die PWA kennzeichnet diese Grenze transparent und simuliert keine Gerätesynchronisierung.

## Nächste Builds

1. Build 3.7: Coach 2.0 mit Schlaf-, Schritt- und Erholungssignalen
2. Build 3.8: native App Grundlage für iOS und Android
3. Build 3.9: Apple HealthKit und Android Health Connect Synchronisierung
4. Build 4.0: Qualitäts-, Datenschutz- und Store Readiness
5. Build 4.1: TestFlight und Google Play Closed Beta

## Rechtliches

Impressum und Datenschutzerklärung enthalten noch Platzhalter für ladungsfähige Anschrift und Kontakt. Nicht unverändert öffentlich launchen.
