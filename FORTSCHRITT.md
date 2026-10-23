# Fortschritt

**Aktuelle Stufe:** V1 – MVP
**Stand:** Planung abgeschlossen, Umsetzung noch nicht begonnen
**Testgerät:** Quest 3 noch nicht vorhanden → Tests vorerst im Desktop-Browser

## Übersicht V1

| Bereich | Aufgabe | Status |
|---|---|---|
| Planung | Anforderungen, Architektur, Stufenplan | ✅ erledigt |
| Planung | Abnahmeschritte V1 | ✅ erledigt |
| Repo | Struktur, Dokumentation | ✅ erledigt |
| Viewer | Grundgerüst three.js, Desktop-Ansicht | ⏳ offen |
| Viewer | Loader STL / OBJ / GLB, Einheiten mm | ⏳ offen |
| Viewer | Bounding-Box-Maße, Teileliste ein-/ausblenden | ⏳ offen |
| Viewer | Messen Punkt–Punkt mit Eckpunkt-Fang | ⏳ offen |
| Viewer | WebXR: Passthrough, Greifen, Drehen, Skalieren, 1:1 | ⏳ offen |
| Viewer | PWA (Manifest, Service Worker, Icon) | ⏳ offen |
| Viewer | GitHub Pages einrichten | ⏳ offen |
| Konverter | STL/OBJ einlesen, Dreiecke reduzieren, GLB schreiben | ⏳ offen |
| Konverter | Instanzen für gleiche Teile, Option „unvereinfacht“ | ⏳ offen |
| Test | Prüfkörper in `samples/` erstellen | ⏳ offen |
| Test | Abnahme Desktop (V1-01 bis V1-10, K1-01 bis K1-06) | ⏳ offen |
| Test | Abnahme Quest (V1-11 bis V1-19) | ⏳ offen – Gerät fehlt |

Legende: ✅ erledigt · 🔄 in Arbeit · ⏳ offen · ❌ blockiert

## Offene Punkte

- Fusion-Export: prüfen, ob OBJ-Export Bauteile als getrennte Gruppen behält (wichtig für Teileliste).
- Zielwert Dreiecke pro Szene auf der Quest messen, sobald Gerät vorhanden.
- PWA-Installation im Quest-Browser auf dem Gerät bestätigen.

## Entscheidungen

| Datum | Entscheidung | Begründung |
|---|---|---|
| 2026-10-23 | Web-App (PWA, WebXR) statt native APK | schnellere Entwicklung, automatische Updates, läuft auch auf Mac/iPad; Performance durch Konverter abgefangen |
| 2026-10-23 | Messen gehört in V1 | Kernanforderung |
| 2026-10-23 | Hosting über GitHub Pages, Repo öffentlich | keine vertraulichen Modelle; HTTPS automatisch |
| 2026-10-23 | Modelle in V1 per Datei-Auswahl, Mac-Sync erst V2 | HTTPS-Verbindung Quest ↔ Mac braucht lokales Zertifikat |

## Änderungsprotokoll

| Datum | Änderung |
|---|---|
| 2026-10-23 | Repo angelegt: README, Abnahmeschritte, Fortschritt, Ordnerstruktur |
