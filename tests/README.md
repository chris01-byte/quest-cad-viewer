# Tests

Headless-Tests mit [Playwright](https://playwright.dev/) gegen den Viewer (`viewer/`), ohne Framework: jedes Skript gibt `ok`/`FAIL` je Prüfpunkt aus und setzt den Exit-Code.

```bash
cd tests
npm install            # einmalig: installiert playwright, danach: npx playwright install chromium
node viewer-shell.test.mjs
```

Die Skripte starten selbst einen kleinen lokalen Server für `viewer/` und einen Headless-Chromium mit Software-WebGL (SwiftShader). Die XR-Funktionen lassen sich hier nicht prüfen: Headless-Chromium hat kein WebXR, dafür bleibt der Immersive Web Emulator bzw. die Quest.

| Skript | Prüft |
|---|---|
| `viewer-shell.test.mjs` | Seite lädt ohne Konsolenfehler, Hinweis „Datei öffnen“, Raster wird gezeichnet, ungültige Datei (V1-01, V1-09) |
