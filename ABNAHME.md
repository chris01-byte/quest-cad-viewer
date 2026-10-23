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
| `last_2mio.stl` | Lasttest, fein tesselierte Kugel | Ø 200 mm, ≈ 2 Mio. Dreiecke |

Zusätzlich: ein eigener Export aus Fusion (z. B. ein Glied des 6-Achs-Roboterarms).

---

## V1 – MVP

### Viewer

| Nr. | Schritt | Erwartetes Ergebnis | Ort | Status |
|---|---|---|---|---|
| V1-01 | Viewer-URL im Browser öffnen | Seite lädt ohne Fehler, Hinweis „Datei öffnen“ sichtbar | Desktop | ⏳ |
| V1-02 | `pruefquader.stl` öffnen | Quader erscheint, Bounding-Box zeigt **100,0 × 50,0 × 20,0 mm** (± 0,1) | Desktop | ⏳ |
| V1-03 | `pruefquader.obj` öffnen | gleiche Maße wie V1-02 | Desktop | ⏳ |
| V1-04 | `pruefwinkel.glb` öffnen | zwei Bauteile in Teileliste, Maße 80 × 60 × 40 mm | Desktop | ⏳ |
| V1-05 | Bauteil in Teileliste ausblenden und wieder einblenden | Teil verschwindet / erscheint, Maße der Gesamt-Bounding-Box passen sich an | Desktop | ⏳ |
| V1-06 | Messen: zwei gegenüberliegende Ecken der Quader-Längsseite wählen | Anzeige **100,0 mm** (± 0,1), Eckpunkt rastet sichtbar ein | Desktop | ⏳ |
| V1-07 | Messen: Bohrungsdurchmesser im Prüfwinkel (gegenüberliegende Kanten) | Anzeige ≈ 10 mm (Abweichung durch Tesselierung, im Protokoll notieren) | Desktop | ⏳ |
| V1-08 | Mehrere Messungen setzen, einzeln und alle löschen | Messungen bleiben sichtbar bis zum Löschen | Desktop | ⏳ |
| V1-09 | Ungültige Datei (z. B. .txt) öffnen | verständliche Fehlermeldung, App bleibt bedienbar | Desktop | ⏳ |
| V1-10 | Viewer als App installieren (PWA) | Icon erscheint, App startet auch ohne Internet | Desktop | ⏳ |
| V1-11 | Viewer im Quest-Browser öffnen, „AR starten“ | Passthrough aktiv, Modell schwebt vor dem Nutzer | Quest | ⏳ |
| V1-12 | Modell auf den Tisch stellen | Modell liegt auf der erkannten Fläche bzw. dort, wo es abgelegt wird | Quest | ⏳ |
| V1-13 | Mit Controller greifen, verschieben, drehen | Modell folgt flüssig der Hand | Quest | ⏳ |
| V1-14 | Mit beiden Controllern skalieren, dann „1:1“ drücken | Größe ändert sich; „1:1“ setzt exakt auf Originalgröße zurück | Quest | ⏳ |
| V1-15 | Maßstabsprobe: `pruefquader.stl` in 1:1 neben ein echtes Lineal halten | 100 mm virtuell ≈ 100 mm real (Abweichung notieren) | Quest | ⏳ |
| V1-16 | Messen mit Controller-Strahl wie V1-06 | Anzeige 100,0 mm (± 0,1) | Quest | ⏳ |
| V1-17 | Eigener Fusion-Export (Roboterarm-Glied) laden | Maße stimmen mit Fusion überein | Quest | ⏳ |
| V1-18 | Bildrate prüfen mit optimierter Roboterarm-Baugruppe | flüssig, kein sichtbares Ruckeln beim Kopfdrehen | Quest | ⏳ |
| V1-19 | App auf der Quest installieren (PWA) | Icon in der App-Bibliothek, Start ohne Browser-Leiste | Quest | ⏳ |
| V1-20 | Messen: mitten auf eine Fläche klicken, weit weg von jeder Ecke | Punkt wird orange gesetzt (freier Flächenpunkt, nicht eingerastet), in der Messliste als Flächenpunkt gekennzeichnet | Desktop | ⏳ |
| V1-21 | Messen: „Nur Eckpunkte“ einschalten, mitten auf eine Fläche klicken | kein Punkt wird gesetzt, Hinweis erscheint; nahe an einer Ecke funktioniert es | Desktop | ⏳ |
| V1-22 | `last_2mio.stl` öffnen (per `samples/generate.py` erzeugt) | Dreiecksanzahl 2.002.224 und Warnung sichtbar, Drehen und Messen bleiben bedienbar | Desktop | ⏳ |
| V1-23 | Desktop: „1:1 (ca.)“ drücken, Lineal an den Bildschirm halten | 100 mm am Modell erscheinen ungefähr 100 mm groß (Näherung über 96 dpi, Abweichung notieren); „Ansicht zurücksetzen“ stellt die Ausgangsansicht wieder her | Desktop | ⏳ |
| V1-24 | Im Headset am Panel: Teile aus-/einblenden, „Messen“ an/aus, Messung mit ✕ löschen, „Nur Ecken“, „XR beenden“ | alle Funktionen des Desktop-Menüs sind im Panel erreichbar und wirken sofort | Quest | ⏳ |
| V1-25 | Im Headset: Grip-Taste auf das Panel gerichtet drücken und bewegen | Panel folgt der Hand und bleibt dort stehen, das Modell bleibt unberührt | Quest | ⏳ |
| V1-26 | Im Headset: „Zentrieren“ drücken, nachdem das Modell weggeschoben oder gekippt wurde | Modell steht wieder aufrecht, 0,7 m vor dem Gesicht, auf Tisch- bzw. Bodenhöhe | Quest | ⏳ |

### Konverter

| Nr. | Schritt | Erwartetes Ergebnis | Ort | Status |
|---|---|---|---|---|
| K1-01 | Installation nach Anleitung in `converter/README.md` | läuft auf dem Mac ohne Fehler | Mac | ⏳ |
| K1-02 | `pruefquader.stl` konvertieren | GLB entsteht, Maße im Viewer unverändert 100 × 50 × 20 mm | Mac | ⏳ |
| K1-03 | `last_2mio.stl` mit Zielwert 200 000 Dreiecke konvertieren | Ausgabe ≤ 200 000 Dreiecke, Form bleibt erkennbar, Statistik wird angezeigt | Mac | ⏳ |
| K1-04 | Baugruppe aus Fusion (OBJ) konvertieren | Bauteile bleiben im Viewer einzeln ein-/ausblendbar | Mac | ⏳ |
| K1-05 | Option „unvereinfacht“ | Dreiecksanzahl identisch zur Eingabe | Mac | ⏳ |
| K1-06 | Baugruppe mit vielen gleichen Schrauben | Dateigröße deutlich kleiner als ohne Instanzen (Wert notieren) | Mac | ⏳ |

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
