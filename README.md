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
5. Offen: Google Provider und finale Redirect URLs nach dem ersten Cloudflare Deployment konfigurieren.

Keine `service_role` oder Secret Keys in `public/config.js` eintragen.

## Cloudflare

Das Projekt ist für Workers Static Assets vorbereitet. Nach vorhandenem Cloudflare Login:

```bash
npx wrangler deploy
```

Die aktuelle Cloudflare Dokumentation empfiehlt Workers Static Assets für neue statische bzw. Full-Stack Worker Anwendungen.

## Push

Build 1 enthält den PWA Client, Service Worker und die serverseitige `push-dispatch` Edge Function. Für echte Benachrichtigungen bei geschlossenem Browser fehlen noch:

- VAPID Schlüsselpaar
- sichere Registrierung der Push Subscription im Fitnest Supabase Projekt
- serverseitiger Web Push Versand
- Scheduler für Trainings-, Wiege- und Tageserinnerungen

Diese Punkte sind für Build 2 vorgesehen, sobald das eigene Supabase Projekt und der permanente Cloudflare Zielaccount verbunden sind.

## Rechtliches

Impressum und Datenschutzerklärung enthalten noch Platzhalter für ladungsfähige Anschrift und Kontakt. Nicht unverändert öffentlich launchen.
