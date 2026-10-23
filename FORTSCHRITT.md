# Fortschritt

**Aktuelle Stufe:** V1 – MVP
**Stand:** Umsetzung V1 läuft – Aufgabe 1 (Prüfkörper) erledigt
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
| Test | Prüfkörper in `samples/` erstellen | ✅ erledigt (`samples/generate.py`) |
| Test | Abnahme Desktop (V1-01 bis V1-10, K1-01 bis K1-06) | ⏳ offen |
| Test | Abnahme Quest (V1-11 bis V1-19) | ⏳ offen – Gerät fehlt |

Legende: ✅ erledigt · 🔄 in Arbeit · ⏳ offen · ❌ blockiert

## Offene Punkte

- Fusion-Export: prüfen, ob OBJ-Export Bauteile als getrennte Gruppen behält (wichtig für Teileliste).
- Zielwert Dreiecke pro Szene auf der Quest messen, sobald Gerät vorhanden.
- PWA-Installation im Quest-Browser auf dem Gerät bestätigen.
- Fusion-Achsenrichtung: Fusion exportiert je nach Einstellung Y-oben oder Z-oben, der Viewer (three.js/WebXR) ist Y-oben. Bei Z-oben-Exporten läge das Modell gekippt. Vorschlag: Schalter „Z-oben → Y-oben“ im Viewer. Bitte mit Chris klären, bevor es umgesetzt wird.

## Entscheidungen

| Datum | Entscheidung | Begründung |
|---|---|---|
| 2026-10-23 | Web-App (PWA, WebXR) statt native APK | schnellere Entwicklung, automatische Updates, läuft auch auf Mac/iPad; Performance durch Konverter abgefangen |
| 2026-10-23 | Messen gehört in V1 | Kernanforderung |
| 2026-10-23 | Hosting über GitHub Pages, Repo öffentlich | keine vertraulichen Modelle; HTTPS automatisch |
| 2026-10-23 | Modelle in V1 per Datei-Auswahl, Mac-Sync erst V2 | HTTPS-Verbindung Quest ↔ Mac braucht lokales Zertifikat |
| 2026-10-23 | Entwicklung mit Claude Code lokal auf dem Mac | Konverter und Tests mit echten Fusion-Exporten, lokaler Server, später V2 |
| 2026-10-23 | `last_2mio.stl` (≈ 100 MB) liegt nicht im Repo, sondern wird per `samples/generate.py` erzeugt | öffentliches Repo, GitHub-Dateigrenze, Datei ist in Sekunden reproduzierbar |

## Änderungsprotokoll

| Datum | Änderung |
|---|---|
| 2026-10-23 | Repo angelegt: README, Abnahmeschritte, Fortschritt, Ordnerstruktur |
| 2026-10-23 | CLAUDE.md mit Projektkontext und Arbeitsregeln für Claude Code ergänzt; Weiterarbeit lokal auf dem Mac |
| 2026-10-23 | Aufgabe 1: Prüfkörper-Generator `samples/generate.py` (numpy), `pruefquader.stl/.obj` und `pruefwinkel.glb` erzeugt und unabhängig nachgemessen (100 × 50 × 20 mm, 80 × 60 × 40 mm, Bohrung r = 5,000 mm); `last_2mio.stl` per Skript (2 002 224 Dreiecke) |
