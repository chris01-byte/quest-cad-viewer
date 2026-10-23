# three.js (lokal eingebunden)

Version **0.186.1** (npm-Paket `three`, Lizenz MIT, siehe `LICENSE`). Unverändert kopiert, damit die PWA offline läuft.

| Quelle im npm-Paket | Ziel hier |
|---|---|
| `build/three.module.js`, `build/three.core.js` | `three.module.js`, `three.core.js` |
| `examples/jsm/controls/OrbitControls.js` | `addons/controls/` |
| `examples/jsm/loaders/{GLTFLoader,OBJLoader,STLLoader}.js` | `addons/loaders/` |
| `examples/jsm/utils/{BufferGeometryUtils,SkeletonUtils}.js` | `addons/utils/` |

Die Import-Map in `viewer/index.html` bildet `three` und `three/addons/` auf diese Dateien ab.

## Version aktualisieren

```bash
npm i three@<version> --prefix /tmp/three
# Dateien aus obiger Tabelle über die vorhandenen kopieren, Version hier und in sw.js (CACHE) anpassen
```
