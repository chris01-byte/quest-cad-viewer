# Tests

Headless-Tests mit [Playwright](https://playwright.dev/) gegen den Viewer (`viewer/`), ohne Framework: jedes Skript gibt `ok`/`FAIL` je Prüfpunkt aus und setzt den Exit-Code.

```bash
cd tests
npm install            # einmalig: installiert playwright, danach: npx playwright install chromium
npm test               # alle *.test.mjs nacheinander
node loaders.test.mjs  # oder ein einzelnes Skript
```

Die Skripte starten selbst einen kleinen lokalen Server für `viewer/` und einen Headless-Chromium mit Software-WebGL (SwiftShader). Die XR-Funktionen lassen sich hier nicht prüfen: Headless-Chromium hat kein WebXR, dafür bleibt der Immersive Web Emulator bzw. die Quest.

| Skript | Prüft |
|---|---|
| `viewer-shell.test.mjs` | Seite lädt ohne Konsolenfehler, Hinweis „Datei öffnen“, Raster wird gezeichnet, ungültige Datei (V1-01, V1-09) |
| `loaders.test.mjs` | STL (binär, ASCII), OBJ, GLB, mehrere Dateien, Einheiten und Maße, Fehlerfälle, Lasttest mit `last_2mio.stl` (V1-02, V1-03, V1-04, V1-09) |
| `parts.test.mjs` | Teileliste: ein-/ausblenden, Maße und Dreiecke passen sich an, „Alle ein/aus“, Filter (V1-05) |
| `bvh.test.mjs` | BVH liefert dieselben Treffer wie three's Raycaster, Leistung auf 2 Mio. Dreiecken |
| `measure.test.mjs` | Messen mit echten Mausklicks: Eckpunkt-Fang, 100,0 / 50,0 / 20,0 mm, Bohrung Ø 10, mehrere Messungen, Löschen, freier Flächenpunkt, „Nur Eckpunkte“, Orbit-Drag, Skalierung (V1-06, V1-07, V1-08, V1-20, V1-21) |
| `measure-large.test.mjs` | Messen am 2-Mio-Lasttest, Reaktionszeit (V1-22) |
