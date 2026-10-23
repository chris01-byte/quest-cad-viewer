# Fortschritt

**Aktuelle Stufe:** V1 – MVP
**Stand:** Alle zehn V1-Aufgaben bearbeitet, Desktop-Abnahme liegt bei Chris. XR nur im Emulator geprüft, Pages noch nicht aktiviert, Quest fehlt
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
| Viewer | WebXR: Passthrough, Greifen, Drehen, Skalieren, 1:1 | ✅ umgesetzt, **nur im Emulator (IWER) und mit simulierten Controllern geprüft**, Quest-Abnahme V1-11 bis V1-19, V1-24 bis V1-26 offen |
| Viewer | PWA (Manifest, Service Worker, Icon) | ✅ erledigt (Offline-Start und Update im Headless-Test geprüft; Installation im Quest-Browser offen) |
| Viewer | GitHub Pages einrichten | 🔄 Workflow fertig (`.github/workflows/pages.yml`); **Chris muss einmalig in den Repo-Einstellungen Pages auf „GitHub Actions“ stellen** |
| Konverter | STL/OBJ einlesen, Dreiecke reduzieren, GLB schreiben | ✅ erledigt (`converter/convert.py`, Anleitung in `converter/README.md`) |
| Konverter | Instanzen für gleiche Teile, Option „unvereinfacht“ | ✅ erledigt (auch um 90° gedrehte Kopien) |
| Test | Prüfkörper in `samples/` erstellen | ✅ erledigt (`samples/generate.py`) |
| Test | Abnahme Desktop (V1-01 bis V1-10, K1-01 bis K1-06) | 🔄 Agent-Tests durchgespielt und in `ABNAHME.md` notiert, **Übergabe an Chris**; V1-10 und K1-01 brauchen aktivierte Pages bzw. den Mac |
| Test | Abnahme Quest (V1-11 bis V1-19) | ⏳ offen – Gerät fehlt |

Legende: ✅ erledigt · 🔄 in Arbeit · ⏳ offen · ❌ blockiert

## Offene Punkte

- **GitHub Pages aktivieren (Chris):** Repository → Settings → Pages → „Build and deployment“ → Source **GitHub Actions**. Danach den Workflow „Viewer veröffentlichen“ unter Actions einmal per „Run workflow“ starten (oder die nächste Änderung an `viewer/` pushen). Adresse: https://chris01-byte.github.io/quest-cad-viewer/
- Vorschlag (nicht umgesetzt): ein zweiter Workflow führt die Headless-Tests (`tests/`) bei jedem Push aus, damit kein defekter Stand veröffentlicht wird.
- **XR: Dateien laden im Headset** geht im Browser nicht (kein Datei-Dialog in einer immersiven Session). Heute: Dateien vor dem Start öffnen, das Panel weist darauf hin. Vorschlag: zuletzt geöffnete Modelle im Browser (IndexedDB) merken und im Panel zur Auswahl anbieten. Bitte mit Chris klären.
- **XR: Ablegen auf dem Tisch** nutzt den Hit-Test der Quest (Raumerkennung), sofern der Browser ihn freigibt; sonst die Controller-Höhe. Der Hit-Test ließ sich im Emulator nicht prüfen und ist auf der Quest zu bestätigen.
- XR: Hand-Tracking ist nicht eingebaut (nur Controller). Die Controller werden als einfache Zylinder gezeichnet, weil die Standard-Modelle von einem CDN geladen würden.
- Desktop „1:1 (ca.)“ ist nur eine Näherung über 96 dpi. Für echte Maße ist die Quest gedacht; falls Chris eine Bildschirm-Kalibrierung möchte, wäre das eine eigene Funktion.
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
| 2026-10-23 | XR-Bedienung: **Grip** = greifen (eine Hand bewegt und dreht, zwei Hände skalieren und drehen, Einrasten auf exakt 1:1 bei ±2 %, Bereich 1 % bis 10 000 %), **Trigger** = Panel-Taste drücken, Messpunkt setzen oder Modell ablegen. Grip auf das Panel zielend greift das Panel. In AR/VR steht das Modell beim Start 1:1, 0,7 m vor dem Gesicht, auf Tischhöhe (0,75 m) bzw. auf dem Boden, wenn es höher als 0,7 m ist | Entspricht ABNAHME V1-11 bis V1-16; Werte (Tischhöhe, Abstand) sind Startannahmen und auf der Quest zu bestätigen |
| 2026-10-23 | `iwer` (Meta, MIT) als reine **Test-Abhängigkeit** in `tests/package.json`, nicht im Viewer | Emuliert die WebXR-API und erlaubt, die echte Session-Strecke ohne Brille zu testen; wird nicht ausgeliefert |
| 2026-10-23 | Offline-Fähigkeit über einen Service Worker mit **versioniertem Precache**. `tools/build-pages.mjs` stempelt beim Deploy eine Build-ID in `sw.js` und schreibt `asset-manifest.json` mit allen Dateien. Lokal (`python3 -m http.server`) ist `sw.js` ungestempelt und cached nichts | Keine von Hand gepflegte Dateiliste (vergessene Datei = App startet offline nicht), keine Mischung zweier Versionen, Updates automatisch. Der Viewer-Code selbst bleibt ohne Bundler; nur der Deploy-Schritt kopiert und stempelt. Neuer Ordner `tools/` |
| 2026-10-23 | Deployment per GitHub-Actions-Workflow (Quelle „GitHub Actions“ statt Branch `gh-pages`), nur bei Änderungen an `viewer/`, `tools/build-pages.mjs` oder dem Workflow selbst | Kein zusätzlicher Branch, der Build-Schritt (Build-ID stempeln) läuft vor dem Veröffentlichen |
| 2026-10-23 | Konverter-Bibliotheken: **numpy** und **fast-simplification** (Quadric Edge Collapse, Wheels für macOS Intel/ARM). STL-/OBJ-Parser, Welding, Instanzerkennung und GLB-Schreiber sind eigener Code, kein trimesh/scipy | Kleine venv, keine Kompilierung auf dem Mac; die Vereinfachung steckt in einer Funktion (`simplify` in `convert.py`) und lässt sich bei Bedarf austauschen. **Mit Chris abzustimmen, falls er eine andere Bibliothek bevorzugt** |
| 2026-10-23 | Instanzen: gleiche Teile werden nur einmal abgelegt, erkannt per Toleranzvergleich (0,01 mm) der zentrierten Eckpunkte in allen 24 Achsendrehungen; Zielwert zählt Instanzen mit, Teile bis 64 Dreiecke bleiben unvereinfacht; Standard-Ziel 500 000 Dreiecke | Float32-Rauschen verhindert exakte Hashes; Schrauben liegen in Baugruppen oft gedreht; Zielwert ist eine ungemessene Arbeitshypothese |
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
| 2026-10-23 | Aufgabe 6: WebXR (`viewer/js/xr/`): Session-Start AR (Fallback VR), Passthrough, Greifen/Drehen/Skalieren, 1:1, Ablegen, Strahl-Messen, Panel mit allen Funktionen. Tests: `xr.test.mjs` (Logik mit simulierten Controllern) und `xr-session.test.mjs` (echte Session-Strecke im IWER-Emulator, Meta Quest 3). Der Emulator fand zwei Fehler, die die Simulation nicht zeigte: Panel/Modell wurden vor der ersten Kopfpose platziert (Panel unter dem Boden) und die UI-Ebenen hingen von der DOM-Reihenfolge ab. Abnahmeschritte V1-23 bis V1-26 ergänzt. **Nicht geprüft:** echtes Tracking, Passthrough-Qualität, Hit-Test, Leistung auf der Quest |
| 2026-10-23 | Aufgabe 7: PWA (`viewer/manifest.webmanifest`, `sw.js`, `js/pwa.js`, `icons/`, `tools/make-icons.mjs`, `tools/build-pages.mjs`). Icon: Würfel mit Messstrecke (192, 512, maskable, Apple-Touch). Test `pwa.test.mjs`: Manifest und Icon-Maße, Precache vollständig (35 Dateien, jedes importierte Modul enthalten), Offline-Start mit abgeschaltetem Netz inklusive Modell laden und Messen, Update auf neue Build-ID löscht den alten Cache, Entwicklungsmodus cached nichts, „App installieren“-Button. Zwei Testfehler (async `waitForFunction`) selbst gefunden und behoben |
| 2026-10-23 | Aufgabe 8: Pages-Workflow `.github/workflows/pages.yml` (Node 22, `tools/build-pages.mjs`, `configure-pages`/`upload-pages-artifact`/`deploy-pages`). Der PWA-Test serviert den Build jetzt unter `/quest-cad-viewer/` wie GitHub Pages: SW-Scope, Offline und Messen funktionieren im Unterpfad. Aktivierung von Pages und erster Lauf stehen noch aus (Repo-Einstellung, nicht per Code möglich) |
| 2026-10-23 | Aufgabe 9: Konverter (`converter/convert.py`, `readers.py`, `geometry.py`, `glb_writer.py`, `README.md`, `requirements.txt`). Prüfkörper `samples/baugruppe.obj` (25 Teile, 24 gleiche Schrauben, 6 gedreht) ergänzt. Tests: 23 Python-Unit-Tests und `tests/converter.test.mjs` (Konverter erzeugt GLB, Viewer lädt sie): Quader 100,0 × 50,0 × 20,0 mm bleibt exakt, Messen am konvertierten Quader 100,0 mm, `last_2mio.stl` → 200.000 Dreiecke in 5,5 s (100,1 MB → 3,6 MB, Bounding-Box ±0,003 mm), „unvereinfacht“ behält 6.156 Dreiecke, Instanzen 201,9 kB → 9,3 kB (Faktor 13,7 gegenüber ohne Instanzen), um 90° gedrehte Schrauben landen an der richtigen Stelle. Spitzen-RAM 950 MB bei 2 Mio. Dreiecken |
| 2026-10-23 | Aufgabe 10: Desktop-Abnahme vorbereitet. `ABNAHME.md` hat eine Spalte „Bemerkung“ mit den Agent-Testergebnissen aller Schritte und eine Vorbereitungsanleitung. Alle Status stehen weiter auf ⏳, das ✅ setzt Chris. Erster Pages-Lauf auf GitHub: Build-Schritt fehlerfrei, `configure-pages` bricht ab, weil Pages im Repo noch nicht aktiviert ist (Einstellung durch Chris nötig). K1-01 nach Anleitung in frischer venv geprüft (Linux) |
