# Fortschritt

**Aktuelle Stufe:** V1 – MVP
**Stand:** Umsetzung V1 läuft – Aufgaben 1 bis 5 erledigt (Prüfkörper, Grundgerüst, Loader, Teileliste, Messen)
**Testgerät:** Quest 3 noch nicht vorhanden → Tests vorerst im Desktop-Browser

## Übersicht V1

| Bereich | Aufgabe | Status |
|---|---|---|
| Planung | Anforderungen, Architektur, Stufenplan | ✅ erledigt |
| Planung | Abnahmeschritte V1 | ✅ erledigt |
| Repo | Struktur, Dokumentation | ✅ erledigt |
| Viewer | Grundgerüst three.js, Desktop-Ansicht | ✅ erledigt (Szene, Licht, Raster, OrbitControls, Datei öffnen per Dialog und Drag & Drop) |
| Viewer | Loader STL / OBJ / GLB, Einheiten mm | ✅ erledigt (STL binär + ASCII, OBJ, GLB; mehrere Dateien = mehrere Teile) |
| Viewer | Bounding-Box-Maße, Teileliste ein-/ausblenden | ✅ erledigt (Maße und Dreiecke passen sich an, Filter ab 12 Teilen) |
| Viewer | Messen Punkt–Punkt mit Eckpunkt-Fang | ✅ erledigt (Desktop; Strahl-API für XR vorbereitet) |
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
- Zielwert Dreiecke pro Szene auf der Quest messen, sobald Gerät vorhanden. Dabei auch den BVH-Aufbau beim Messen prüfen (3 s für 2 Mio. Dreiecke auf dem Desktop, auf der Quest langsamer).
- GLB mit Draco-/Meshopt-/KTX2-Kompression wird nicht gelesen (Meldung statt Absturz). Der Konverter schreibt unkomprimiert.
- Glatte Schattierung: STL/OBJ werden flach schattiert (Facetten sichtbar). Spätere Option: Glättung mit Kantenwinkel im Konverter.
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
| 2026-10-23 | three.js 0.186.1 unverändert in `viewer/vendor/three/` (inkl. OrbitControls, STL-/OBJ-/GLTF-Loader). Der `XRControllerModelFactory` fehlt bewusst: Er lädt Controller-Modelle von einem CDN und würde offline nicht funktionieren, die Controller werden in V1 mit eigenen Strahlen dargestellt | PWA muss offline laufen |
| 2026-10-23 | Datei-Auswahl ohne `accept`-Filter, Prüfung der Endung im Code | Der Android-Dateidialog (Quest-Browser) kann unbekannte Endungen wie `.stl`/`.glb` ausgrauen; so bleibt jede Datei wählbar und die Fehlermeldung kommt von der App |
| 2026-10-23 | Mehrere gleichzeitig geöffnete Dateien werden zu **einer** Szene, jede Datei ein Teil, Positionen bleiben absolut | Fusion exportiert Körper oft einzeln; so lassen sich Baugruppen aus Einzel-STL zusammenstellen |
| 2026-10-23 | Messpunkte rasten auf den nächsten Eckpunkt des getroffenen Dreiecks ein (Radius 14 px am Desktop). Ohne Eckpunkt in Reichweite entsteht ein **freier Flächenpunkt**, orange markiert und in der Liste als „nicht eingerastet“ gekennzeichnet; „Nur Eckpunkte“ unterbindet das | Messen auf Flächen ist oft sinnvoll, darf aber nicht mit exakten Eckpunkt-Maßen verwechselt werden |
| 2026-10-23 | Eigenes BVH (`viewer/js/bvh.js`, ca. 150 Zeilen) für das Picken statt `three-mesh-bvh` | three.js' Raycaster braucht bei 2 Mio. Dreiecken über 100 ms pro Strahl; keine zusätzliche Abhängigkeit. Gemessen: 6 µs pro Strahl, Aufbau 3 s für 2 Mio. Dreiecke |
| 2026-10-23 | `last_2mio.stl` (≈ 100 MB) liegt nicht im Repo, sondern wird per `samples/generate.py` erzeugt | öffentliches Repo, GitHub-Dateigrenze, Datei ist in Sekunden reproduzierbar |

## Änderungsprotokoll

| Datum | Änderung |
|---|---|
| 2026-10-23 | Repo angelegt: README, Abnahmeschritte, Fortschritt, Ordnerstruktur |
| 2026-10-23 | CLAUDE.md mit Projektkontext und Arbeitsregeln für Claude Code ergänzt; Weiterarbeit lokal auf dem Mac |
| 2026-10-23 | Aufgabe 1: Prüfkörper-Generator `samples/generate.py` (numpy), `pruefquader.stl/.obj` und `pruefwinkel.glb` erzeugt und unabhängig nachgemessen (100 × 50 × 20 mm, 80 × 60 × 40 mm, Bohrung r = 5,000 mm); `last_2mio.stl` per Skript (2 002 224 Dreiecke) |
| 2026-10-23 | Aufgabe 2: Viewer-Grundgerüst (`viewer/index.html`, `js/viewer.js`, `js/ui.js`), Rendern nur bei Änderung, adaptives Raster; Headless-Test `tests/viewer-shell.test.mjs` (Playwright). Ein Rasterfehler (12 statt 400 Linien) fiel erst im Screenshot auf, daraufhin Pixelprüfung im Test ergänzt |
| 2026-10-23 | Aufgabe 3: Loader STL/OBJ/GLB (`viewer/js/loaders.js`, `model.js`), mm → m beim Laden, Modell wird auf dem Raster zentriert, Bounding-Box exakt aus den Vertices der sichtbaren Teile, Dreiecksanzahl mit Warnung ab 1 Mio. Headless-Test `tests/loaders.test.mjs`: Prüfquader 100,0 × 50,0 × 20,0 mm über STL binär, STL ASCII und OBJ; Prüfwinkel 80,0 × 60,0 × 40,0 mm über GLB; `last_2mio.stl` lädt in 3,3 s (Software-WebGL), 2.002.224 Dreiecke, Warnung erscheint |
| 2026-10-23 | Aufgabe 4: Teileliste mit Checkbox je Teil, „Alle ein/aus“ (wirkt nur auf gefilterte Zeilen), Filterfeld ab 12 Teilen; Maße und Dreiecksanzahl folgen den sichtbaren Teilen. Test `tests/parts.test.mjs`: Schenkel aus → 80,0 × 10,0 × 40,0 mm, Renderer zeichnet 12 statt 540 Dreiecke |
| 2026-10-23 | Aufgabe 5: Messen (`viewer/js/measure.js`, `bvh.js`): Punkt–Punkt mit Eckpunkt-Fang, Gummiband mit Live-Abstand, mehrere Messungen, einzeln und alle löschen, M-Taste, Esc bricht ab. Punkte liegen im Modellraum, die Anzeige bleibt auch bei skaliertem Modell die echte Länge. Tests `measure.test.mjs`, `measure-large.test.mjs`, `bvh.test.mjs`: Quader-Kanten 100,0 / 50,0 / 20,0 mm, Bohrung 10,000 mm, Kugel-Sehne 141,42 mm auf 2 Mio. Dreiecken. Abnahmeschritte V1-20 bis V1-22 ergänzt |
