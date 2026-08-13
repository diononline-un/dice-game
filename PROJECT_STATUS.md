---
status: in-development
progress: 60
version: "0.1.0"
tags: [fastapi, timer, websocket, sqlite]
scope: "Zen Dice Timer: würfelbasierter Fokus-Timer mit Session-Tracking und Analytics, läuft als FastAPI-Webapp mit WebSocket-Live-Updates im Docker-Container (Port 2005)."
last_updated: "2026-08-13"
next_steps:
  - README.md mit Setup- und API-Dokumentation nachrüsten
  - Tests für API- und WebSocket-Endpunkte schreiben (pytest)
  - Datenbank-Schema um Migrationen/Seed-Daten erweitern
  - UI-Feedback bei Session-Abbruch und Time-up verbessern (Toast/Reset)
  - Analytics-Dashboard um Export (CSV) und Filter ergänzen
---

# Aktueller Stand
- Läuft als Container zen-dice-timer auf Port 2005, SQLite-Daten liegen im Volume dice_data
- Sessions mit Zufalls-Minuten, Progress- und Zufriedenheits-Rating funktionieren
- WebSocket pusht Countdown/Status live an alle verbundenen Clients
- Analytics-API (Summary, Weekly/Monthly, Heatmap, Streaks, Keywords) vorhanden
- Kein README, keine Tests, kein Logging; REST-API ohne Auth
