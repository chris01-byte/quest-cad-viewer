# Konverter

Python-Skript für den Mac: STL/OBJ aus Fusion → optimierte GLB für den Quest CAD Viewer.

Was es macht:

1. liest STL (binär und ASCII) oder OBJ in **Millimetern**
2. verschweißt doppelte Eckpunkte und entfernt entartete Dreiecke
3. erkennt **gleiche Teile** (z. B. 24 identische Schrauben, auch um 90° gedreht) und legt sie nur einmal ab, die Knoten verweisen darauf
4. reduziert die Dreiecke auf einen einstellbaren Zielwert (Quadric Edge Collapse)
5. schreibt eine GLB in **Metern** (glTF-Definition) und gibt eine Statistik aus

Die **Bauteile bleiben getrennte Knoten** (OBJ: je `o`/`g`-Gruppe ein Teil), damit der Viewer sie einzeln ein- und ausblenden kann.

## Installation (Mac)

Voraussetzung: Python 3 (`python3 --version`). Getestet mit Python 3.13; ab 3.9 sollte es laufen, das ist aber nicht geprüft. Im Hauptordner des Repos:

```bash
python3 -m venv converter/.venv
source converter/.venv/bin/activate
pip install -r converter/requirements.txt
```

Das installiert nur `numpy` und `fast-simplification` (fertige Pakete für Apple Silicon und Intel, es muss nichts kompiliert werden). Bei jedem neuen Terminal vor der Benutzung wieder `source converter/.venv/bin/activate` ausführen.

Funktioniert die Installation nicht, bitte die Fehlermeldung an Claude weitergeben, meist liegt es an einer sehr alten oder sehr neuen Python-Version.

## Benutzung

Fusion: Datei → Exportieren → **STL** oder **OBJ**, Einheit **Millimeter**.

```bash
# Standard: auf ca. 500 000 Dreiecke verkleinern, Ausgabe neben der Eingabe
python3 converter/convert.py roboterarm.stl

# Ausgabedatei und Zielwert wählen
python3 converter/convert.py roboterarm.stl -o roboterarm.glb --ziel 300000

# Teile, an denen gemessen werden soll: Geometrie nicht verändern
python3 converter/convert.py bauteil.stl --unvereinfacht

# Baugruppe als eine einzige STL: zusammenhängende Körper als getrennte Teile ablegen
python3 converter/convert.py baugruppe.stl --schalen-trennen
```

| Option | Wirkung |
|---|---|
| `-o`, `--ausgabe` | Ausgabedatei (Standard: Name der Eingabe mit `.glb`) |
| `--ziel N` | Zielwert für die Dreiecke **der ganzen Szene inkl. Instanzen** (Standard 500 000). Kleine Teile (bis 64 Dreiecke) bleiben unverändert, deshalb kann das Ergebnis darüber liegen, das meldet das Skript |
| `--unvereinfacht` | keine Reduktion: nur Verschweißen, Instanzen, mm → m. Die Dreiecksanzahl bleibt gleich |
| `--keine-instanzen` | gleiche Teile nicht zusammenfassen |
| `--schalen-trennen` | jeden zusammenhängenden Körper einer Datei als eigenes Teil ablegen (für STL-Baugruppen) |

Danach die GLB im Viewer über „Datei öffnen“ laden.

## Statistik

Nach jedem Lauf:

```
Ergebnis
  Dreiecke vorher:   2.002.224
  Dreiecke nachher:  200.000  (10,0 %, Instanzen mitgezählt)
  Teile / Geometrien: 1 Knoten, 1 Meshes
  Dateigröße:        100,1 MB -> 3,6 MB
  Bounding-Box (mm): 200,0 × 200,0 × 200,0   (X × Y × Z)
  Abweichung der Bounding-Box durch die Vereinfachung: 0,003 mm
```

Die Dateigrößen sind wie im Finder 1000-basiert (1 MB = 1000 kB).

## Wichtig zur Genauigkeit

Gemessen wird später am **Dreiecksnetz**. Die Vereinfachung verändert die Geometrie leicht (Rundungen werden gröber, Bohrungen verlieren Eckpunkte). **Fusion bleibt die Referenz für exakte Maße.** Für Teile, an denen Abstände gemessen werden sollen, `--unvereinfacht` verwenden.

Die Instanzerkennung vergleicht mit 0,01 mm Toleranz und findet Kopien, die verschoben oder um Vielfache von 90° gedreht sind. Gespiegelte Teile (z. B. linke und rechte Variante) sind eigene Teile. Der Konverter richtet die Achsen nicht um: Ist ein Fusion-Export Z-oben, steht das Modell im Viewer gekippt (siehe „Offene Punkte“ in `FORTSCHRITT.md`).

## Ressourcen

Rund 0,5 GB Arbeitsspeicher je 1 Mio. Dreiecke der Eingabe, 2 Mio. Dreiecke brauchen ca. 6 Sekunden (Desktop-CPU).

## Tests

```bash
python3 -m unittest discover -s converter/tests -v      # Konverter allein
cd tests && node converter.test.mjs                      # Konverter + Viewer (K1-02 bis K1-06), braucht Playwright
```

Der zweite Test nutzt `python3` aus dem aktuellen Terminal. Mit aktivierter venv passt das; sonst `CONVERTER_PYTHON=converter/.venv/bin/python node converter.test.mjs`.
