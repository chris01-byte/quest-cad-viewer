# Viewer

Web-App (three.js, WebXR, PWA) für die Quest 3 und den Desktop-Browser. Kein Build-Schritt: ES-Module mit Import-Map, three.js liegt lokal in `vendor/`.

## Lokal starten

```bash
cd viewer
python3 -m http.server 8000     # dann http://localhost:8000 öffnen (localhost zählt für WebXR als sicher)
```

Dateien per „Datei öffnen …“ oder Drag & Drop laden: STL und OBJ als mm, GLB als m. Prüfkörper liegen in [`../samples/`](../samples/).

## Aufbau

| Datei | Aufgabe |
|---|---|
| `index.html`, `css/style.css` | Oberfläche (Panel, Teileliste, Messen) |
| `js/main.js` | verdrahtet alles |
| `js/viewer.js` | Szene, Kamera, Raster, Rendern nur bei Änderung, Desktop-Ansicht |
| `js/loaders.js`, `js/model.js` | STL/OBJ/GLB laden, Einheiten, Teile, Bounding-Box |
| `js/measure.js`, `js/bvh.js` | Messen mit Eckpunkt-Fang, schnelles Picken |
| `js/xr/` | WebXR: `session.js` (Start/Ende), `interaction.js` (Controller), `gestures.js` (Greifen/Skalieren), `panel.js` (Bedienpanel im Raum) |
| `js/pwa.js`, `sw.js`, `manifest.webmanifest`, `icons/` | installierbar, offline lauffähig |
| `vendor/three/` | three.js 0.186.1, unverändert |

## Wichtig beim Ändern

- Intern wird in **Metern** gerechnet, angezeigt wird in **mm**. Messpunkte liegen im Modellraum, die Anzeige bleibt auch bei skaliertem Modell die echte Länge.
- Tests: `tests/` (siehe dort). Der Service Worker cached nur bei einem Deploy-Build (`tools/build-pages.mjs`), lokal nicht.
