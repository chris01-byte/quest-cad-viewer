# Tests

Headless-Tests mit [Playwright](https://playwright.dev/) gegen den Viewer (`viewer/`), ohne Framework: jedes Skript gibt `ok`/`FAIL` je Prüfpunkt aus und setzt den Exit-Code.

```bash
cd tests
npm install            # einmalig: installiert playwright, danach: npx playwright install chromium
npm test               # alle *.test.mjs nacheinander
node loaders.test.mjs  # oder ein einzelnes Skript
```

Die Skripte starten selbst einen kleinen lokalen Server für `viewer/` und einen Headless-Chromium mit Software-WebGL (SwiftShader). Headless-Chromium hat kein WebXR. Für die XR-Tests emuliert [IWER](https://github.com/meta-quest/immersive-web-emulation-runtime) (npm `iwer`, von Meta) eine Meta Quest 3 im Browser; das prüft die Session-Strecke und die Bedienlogik, aber **nicht** echtes Tracking, Passthrough, Raumerkennung (Hit-Test) oder die Leistung auf der Quest.

| Skript | Prüft |
|---|---|
| `viewer-shell.test.mjs` | Seite lädt ohne Konsolenfehler, Hinweis „Datei öffnen“, Raster wird gezeichnet, ungültige Datei (V1-01, V1-09) |
| `loaders.test.mjs` | STL (binär, ASCII), OBJ, GLB, mehrere Dateien, Einheiten und Maße, Fehlerfälle, Lasttest mit `last_2mio.stl` (V1-02, V1-03, V1-04, V1-09) |
| `parts.test.mjs` | Teileliste: ein-/ausblenden, Maße und Dreiecke passen sich an, „Alle ein/aus“, Filter (V1-05) |
| `bvh.test.mjs` | BVH liefert dieselben Treffer wie three's Raycaster, Leistung auf 2 Mio. Dreiecken |
| `measure.test.mjs` | Messen mit echten Mausklicks: Eckpunkt-Fang, 100,0 / 50,0 / 20,0 mm, Bohrung Ø 10, mehrere Messungen, Löschen, freier Flächenpunkt, „Nur Eckpunkte“, Orbit-Drag, Skalierung (V1-06, V1-07, V1-08, V1-20, V1-21) |
| `measure-large.test.mjs` | Messen am 2-Mio-Lasttest, Reaktionszeit (V1-22) |
| `view.test.mjs` | Desktop-Ansicht: „Ansicht zurücksetzen“, „1:1 (ca.)“ (V1-23) |
| `xr.test.mjs` | XR-Bedienlogik mit simulierten Controllern: Greifen, Skalieren, 1:1, Ablegen, Panel-Hover und -Buttons, Strahl-Messen, Panel greifen |
| `xr-session.test.mjs` | Echte WebXR-Session im IWER-Emulator (Quest 3): AR/VR starten, Passthrough, Trigger/Grip-Events, Panel, Messen, Greifen, Beenden, erneuter Start (V1-11, V1-13, V1-14, V1-16 nur emuliert) |
| `pwa.test.mjs` | PWA: Manifest, Icons, Build-Skript, Service-Worker-Precache, Offline-Start, Update auf neue Version, Installieren-Button (V1-10) |
