# Abnahmeschritte

Jede Stufe gilt als abgenommen, wenn alle Schritte mit ✅ bestätigt sind. Schritte mit **[Desktop]** lassen sich ohne Brille im Browser prüfen, Schritte mit **[Quest]** nur im Headset.

Ergebnis je Schritt in der Spalte *Status* eintragen: ✅ bestanden · ❌ nicht bestanden (mit Bemerkung) · ⏳ offen.

## Prüfkörper

Im Ordner [`samples/`](samples/) liegen Testmodelle mit bekannten Maßen (werden mit V1 erstellt):

| Datei | Beschreibung | Sollmaße |
|---|---|---|
| `pruefquader.stl` | Quader | 100 × 50 × 20 mm |
| `pruefquader.obj` | derselbe Quader als OBJ | 100 × 50 × 20 mm |
| `pruefwinkel.glb` | L-Winkel mit Bohrung, zwei Bauteile | 80 × 60 × 40 mm, Bohrung Ø 10 mm |
| `baugruppe.obj` | Platte 200 × 10 × 100 mm + 24 identische Schrauben (6 gedreht), 25 Teile; für K1-04 und K1-06, solange kein Fusion-Export vorliegt | 204 × 34 × 120 mm |
| `last_2mio.stl` | Lasttest, fein tesselierte Kugel | Ø 200 mm, ≈ 2 Mio. Dreiecke |

Zusätzlich: ein eigener Export aus Fusion (z. B. ein Glied des 6-Achs-Roboterarms).

## Vorbereitung der Desktop-Abnahme (V1-01 bis V1-10, K1-01 bis K1-06)

1. **Viewer lokal starten** (im Repo-Ordner):
   ```bash
   cd viewer && python3 -m http.server 8000
   ```
   dann `http://localhost:8000` im Browser öffnen (Chrome oder Safari). Lokal speichert der Service Worker nichts, V1-10 (PWA, offline) lässt sich erst auf der veröffentlichten Seite prüfen.
2. **Prüfkörper:** `pruefquader.stl/.obj`, `pruefwinkel.glb` und `baugruppe.obj` liegen in `samples/`. Für V1-22 und K1-03 die große Datei erzeugen: `python3 samples/generate.py` (braucht `numpy`, siehe `samples/README.md`).
3. **Konverter** (K1-01): Installation nach [`converter/README.md`](converter/README.md).
4. **Veröffentlichte Seite** (V1-10): Pages einmalig aktivieren (siehe `FORTSCHRITT.md`, „Offene Punkte“), dann `https://chris01-byte.github.io/quest-cad-viewer/` öffnen.

Die Bemerkungen in der Tabelle zeigen, was der Agent selbst getestet hat. **Das ✅ setzt nur Chris.** Schritte mit „Nur Emulator“ sind noch nicht auf einer echten Quest geprüft.

---

## V1 – MVP

### Viewer

| Nr. | Schritt | Erwartetes Ergebnis | Ort | Status | Bemerkung |
|---|---|---|---|---|---|
| V1-01 | Viewer-URL im Browser öffnen | Seite lädt ohne Fehler, Hinweis „Datei öffnen“ sichtbar | Desktop | ⏳ | Agent-Test: Seite lädt ohne Konsolenfehler, Hinweis „Datei öffnen“ und Raster sichtbar. |
| V1-02 | `pruefquader.stl` öffnen | Quader erscheint, Bounding-Box zeigt **100,0 × 50,0 × 20,0 mm** (± 0,1) | Desktop | ⏳ | Agent-Test: Anzeige 100,0 × 50,0 × 20,0 mm; im Modell 100,0000 / 50,0000 / 20,0000 mm (Float32-Rundung unter 0,00001 mm). Auch ASCII-STL identisch. |
| V1-03 | `pruefquader.obj` öffnen | gleiche Maße wie V1-02 | Desktop | ⏳ | Agent-Test: 100,0 × 50,0 × 20,0 mm. |
| V1-04 | `pruefwinkel.glb` öffnen | zwei Bauteile in Teileliste, Maße 80 × 60 × 40 mm | Desktop | ⏳ | Agent-Test: Teile „Grundplatte“ und „Schenkel_mit_Bohrung“, 540 Dreiecke, 80,0 × 60,0 × 40,0 mm. |
| V1-05 | Bauteil in Teileliste ausblenden und wieder einblenden | Teil verschwindet / erscheint, Maße der Gesamt-Bounding-Box passen sich an | Desktop | ⏳ | Agent-Test: Schenkel aus → 80,0 × 10,0 × 40,0 mm, Renderer zeichnet 12 statt 540 Dreiecke; wieder an → 80,0 × 60,0 × 40,0 mm. |
| V1-06 | Messen: zwei gegenüberliegende Ecken der Quader-Längsseite wählen | Anzeige **100,0 mm** (± 0,1), Eckpunkt rastet sichtbar ein | Desktop | ⏳ | Agent-Test mit echten Mausklicks (3 px neben der Ecke): 100,0 mm, beide Punkte rasten ein (grüner Marker). Höhe 50,0 mm, Tiefe 20,0 mm. |
| V1-07 | Messen: Bohrungsdurchmesser im Prüfwinkel (gegenüberliegende Kanten) | Anzeige ≈ 10 mm (Abweichung durch Tesselierung, im Protokoll notieren) | Desktop | ⏳ | Agent-Test: 10,000 mm (Bohrung als 64-Eck, gegenüberliegende Eckpunkte liegen exakt auf r = 5 mm). Trifft man den Nachbar-Eckpunkt, wären es 9,988 mm. |
| V1-08 | Mehrere Messungen setzen, einzeln und alle löschen | Messungen bleiben sichtbar bis zum Löschen | Desktop | ⏳ | Agent-Test: 3 Messungen bleiben nach Moduswechsel sichtbar, ✕ löscht eine, „Alle löschen“ leert Liste und Szene. |
| V1-09 | Ungültige Datei (z. B. .txt) öffnen | verständliche Fehlermeldung, App bleibt bedienbar | Desktop | ⏳ | Agent-Test: „notizen.txt“: Dateityp „.txt“ wird nicht unterstützt. Bitte STL, OBJ oder GLB öffnen. Auch leere, kaputte und endungslose Dateien geprüft; danach lädt die App normal. |
| V1-10 | Viewer als App installieren (PWA) | Icon erscheint, App startet auch ohne Internet | Desktop | ⏳ | Agent-Test: Offline-Start mit abgeschaltetem Netz funktioniert (Service Worker, Precache), Modell laden und Messen offline möglich, Update auf neue Version getestet. **Offen:** die eigentliche Installation (Icon im Dock bzw. App-Fenster) lässt sich nicht automatisch prüfen. Das setzt voraus, dass Pages aktiviert ist (siehe FORTSCHRITT). |
| V1-11 | Viewer im Quest-Browser öffnen, „AR starten“ | Passthrough aktiv, Modell schwebt vor dem Nutzer | Quest | ⏳ | Nur Emulator (IWER, Quest 3): AR-Session startet, Passthrough-Modus alpha-blend, Modell 1:1 vor dem Nutzer. Echtes Passthrough nicht geprüft. |
| V1-12 | Modell auf den Tisch stellen | Modell liegt auf der erkannten Fläche bzw. dort, wo es abgelegt wird | Quest | ⏳ | Nur simuliert: Ablegen setzt die Unterseite exakt auf die Zielhöhe, richtet das Modell auf. Der Hit-Test der Quest (Raumerkennung) ist ungeprüft, Fallback ist die Controller-Höhe. |
| V1-13 | Mit Controller greifen, verschieben, drehen | Modell folgt flüssig der Hand | Quest | ⏳ | Nur Emulator: Grip hält das Modell, es folgt der Hand (+0,12 / +0,05 / 0 m exakt). Gefühl und Tracking nicht geprüft. |
| V1-14 | Mit beiden Controllern skalieren, dann „1:1“ drücken | Größe ändert sich; „1:1“ setzt exakt auf Originalgröße zurück | Quest | ⏳ | Nur Emulator: zwei Grips skalieren mit dem Handabstand (Einrasten auf 1:1 bei ±2 %), Panel „1:1“ setzt exakt auf 1. |
| V1-15 | Maßstabsprobe: `pruefquader.stl` in 1:1 neben ein echtes Lineal halten | 100 mm virtuell ≈ 100 mm real (Abweichung notieren) | Quest | ⏳ | Nicht geprüft (braucht echte Quest und Lineal). |
| V1-16 | Messen mit Controller-Strahl wie V1-06 | Anzeige 100,0 mm (± 0,1) | Quest | ⏳ | Nur Emulator: Trigger-Klicks messen 100,0 mm, beide Punkte rasten ein. |
| V1-17 | Eigener Fusion-Export (Roboterarm-Glied) laden | Maße stimmen mit Fusion überein | Quest | ⏳ | Nicht geprüft (braucht Gerät und Fusion-Export). |
| V1-18 | Bildrate prüfen mit optimierter Roboterarm-Baugruppe | flüssig, kein sichtbares Ruckeln beim Kopfdrehen | Quest | ⏳ | Nicht geprüft (braucht Gerät). Hinweis: Desktop-Picking auf 2 Mio. Dreiecken 6 µs pro Strahl, BVH-Aufbau 3 s. |
| V1-19 | App auf der Quest installieren (PWA) | Icon in der App-Bibliothek, Start ohne Browser-Leiste | Quest | ⏳ | Nicht geprüft (braucht Gerät). |
| V1-20 | Messen: mitten auf eine Fläche klicken, weit weg von jeder Ecke | Punkt wird orange gesetzt (freier Flächenpunkt, nicht eingerastet), in der Messliste als Flächenpunkt gekennzeichnet | Desktop | ⏳ | Agent-Test: orangefarbener Punkt, Liste zeigt „Flächenpunkt, nicht eingerastet“. |
| V1-21 | Messen: „Nur Eckpunkte“ einschalten, mitten auf eine Fläche klicken | kein Punkt wird gesetzt, Hinweis erscheint; nahe an einer Ecke funktioniert es | Desktop | ⏳ | Agent-Test: Klick auf die Fläche setzt nichts, Hinweis erscheint; nahe der Ecke funktioniert es. |
| V1-22 | `last_2mio.stl` öffnen (per `samples/generate.py` erzeugt) | Dreiecksanzahl 2.002.224 und Warnung sichtbar, Drehen und Messen bleiben bedienbar | Desktop | ⏳ | Agent-Test: 2.002.224 Dreiecke, Warnung sichtbar, Laden 3,3 s (Software-WebGL), Messen: Vorbereitung 3,1 s, Hover 45 ms, 141,42 mm an der Kugel. |
| V1-23 | Desktop: „1:1 (ca.)“ drücken, Lineal an den Bildschirm halten | 100 mm am Modell erscheinen ungefähr 100 mm groß (Näherung über 96 dpi, Abweichung notieren); „Ansicht zurücksetzen“ stellt die Ausgangsansicht wieder her | Desktop | ⏳ | Agent-Test: 100 mm erscheinen als 378,0 px (= 96 dpi). Ob das auf Chris' Bildschirm 100 mm sind, hängt von dessen Skalierung ab. |
| V1-24 | Im Headset am Panel: Teile aus-/einblenden, „Messen“ an/aus, Messung mit ✕ löschen, „Nur Ecken“, „XR beenden“ | alle Funktionen des Desktop-Menüs sind im Panel erreichbar und wirken sofort | Quest | ⏳ | Nur Emulator und Simulation: alle Panel-Funktionen wirken (Teile, Messen, ✕, Nur Ecken, Beenden). Lesbarkeit und Treffsicherheit im Headset ungeprüft. |
| V1-25 | Im Headset: Grip-Taste auf das Panel gerichtet drücken und bewegen | Panel folgt der Hand und bleibt dort stehen, das Modell bleibt unberührt | Quest | ⏳ | Nur Emulator und Simulation: Grip auf dem Panel bewegt das Panel, das Modell bleibt. |
| V1-26 | Im Headset: „Zentrieren“ drücken, nachdem das Modell weggeschoben oder gekippt wurde | Modell steht wieder aufrecht, 0,7 m vor dem Gesicht, auf Tisch- bzw. Bodenhöhe | Quest | ⏳ | Nur Emulator und Simulation: Modell steht aufrecht 0,7 m vor dem Kopf, auf 0,75 m (klein) bzw. Boden (> 0,7 m hoch). |

### Konverter

| Nr. | Schritt | Erwartetes Ergebnis | Ort | Status | Bemerkung |
|---|---|---|---|---|---|
| K1-01 | Installation nach Anleitung in `converter/README.md` | läuft auf dem Mac ohne Fehler | Mac | ⏳ | Agent-Test: frische venv, `pip install -r converter/requirements.txt`, Konvertierung läuft (Linux, Python 3.13). **Auf dem Mac noch offen.** |
| K1-02 | `pruefquader.stl` konvertieren | GLB entsteht, Maße im Viewer unverändert 100 × 50 × 20 mm | Mac | ⏳ | Agent-Test: GLB im Viewer 100,0 × 50,0 × 20,0 mm; Messen an der GLB 100,0 mm. |
| K1-03 | `last_2mio.stl` mit Zielwert 200 000 Dreiecke konvertieren | Ausgabe ≤ 200 000 Dreiecke, Form bleibt erkennbar, Statistik wird angezeigt | Mac | ⏳ | Agent-Test: 2.002.224 → 200.000 Dreiecke in 5,5 s, 100,1 MB → 3,6 MB, Kugel Ø 200,0 mm (±0,003 mm). „Form erkennbar“ bitte optisch prüfen. |
| K1-04 | Baugruppe aus Fusion (OBJ) konvertieren | Bauteile bleiben im Viewer einzeln ein-/ausblendbar | Mac | ⏳ | Agent-Test mit `samples/baugruppe.obj` (kein Fusion-Export): 25 Teile bleiben einzeln ein-/ausblendbar. **Fusion-OBJ steht noch aus** (Offener Punkt: behält Fusion die Gruppen?). |
| K1-05 | Option „unvereinfacht“ | Dreiecksanzahl identisch zur Eingabe | Mac | ⏳ | Agent-Test: 6.156 Dreiecke vor und nach „--unvereinfacht“. |
| K1-06 | Baugruppe mit vielen gleichen Schrauben | Dateigröße deutlich kleiner als ohne Instanzen (Wert notieren) | Mac | ⏳ | Agent-Test mit `samples/baugruppe.obj`: 24 gleiche Schrauben (6 gedreht): 9,3 kB mit Instanzen, 127,3 kB ohne (Faktor 13,7), OBJ 201,9 kB. |

**V1 abgenommen am:** ________ **durch:** ________

---

## V2 – Schnittebene, Explosion, Auto-Sync

Abnahmeschritte werden vor Beginn von V2 ausformuliert. Geplante Prüfpunkte:

- Schnittebene frei positionierbar, Innenleben sichtbar, Messen in der Schnittansicht möglich
- Explosionsansicht stufenlos, Rücksetzen auf Montagezustand
- Fusion-Export in überwachten Ordner → Modell erscheint ohne manuelles Kopieren auf der Quest
- Verbindung Quest ↔ Mac über HTTPS ohne Browser-Warnung

## V3 – Gelenke, Versionsvergleich

Abnahmeschritte werden vor Beginn von V3 ausformuliert. Geplante Prüfpunkte:

- Gelenke des 6-Achs-Arms einzeln bewegbar, Grenzen aus Konfiguration eingehalten
- Zwei Versionen eines Modells überlagert, Unterschiede erkennbar
