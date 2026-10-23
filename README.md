# quest-cad-viewer

WebXR-Viewer, mit dem sich Fusion-Modelle auf der **Meta Quest 3** im Maßstab **1:1** im eigenen Raum ansehen, greifen und **vermessen** lassen – von kleinen Baugruppen bis zum 6-Achs-Roboterarm.

Die App läuft als installierbare Web-App (PWA) direkt im Quest-Browser: kein Sideloading, kein Entwicklermodus. Ohne Brille funktioniert sie auch am Mac, PC oder iPad im Browser (Maussteuerung, ohne VR).

> **Status:** Planung abgeschlossen, Umsetzung V1 noch nicht begonnen. Details: [FORTSCHRITT.md](FORTSCHRITT.md)

---

## Warum

Ein Bauteil auf dem Monitor sieht man nie in seiner echten Größe. In der Brille steht es 1:1 auf dem Tisch – man sieht Proportionen, Reichweiten und Bauräume sofort und kann Abstände direkt nachmessen.

## Aufbau

Das Projekt besteht aus zwei Bausteinen:

```
 Fusion (Mac)                 Konverter (Mac)                    Viewer (Quest 3)
 ────────────                 ───────────────                    ────────────────
 Export STL / OBJ   ──────▶   Python-Skript            ──────▶   Web-App (three.js, WebXR)
 Einheit: mm                  • Dreiecke reduzieren              • Laden GLB / STL / OBJ
                              • gleiche Teile instanziieren      • Passthrough, 1:1
                              • mm → m (glTF-Einheit)            • Greifen, Drehen, Skalieren
                              • Bauteile getrennt halten         • Teile ein-/ausblenden
                              → optimierte .glb                  • Messen in mm
```

| Baustein | Ordner | Läuft auf | Aufgabe |
|---|---|---|---|
| **Viewer** | [`viewer/`](viewer/) | Quest-Browser, Desktop-Browser | Modell anzeigen, bewegen, messen |
| **Konverter** | [`converter/`](converter/) | Mac (Python 3) | Große Baugruppen für die Quest verkleinern |

### Warum ein Konverter?

Die Quest rendert mit einem Smartphone-Chip für zwei Augen bei 72–90 Bildern pro Sekunde. Große Baugruppen (Schrauben, Getriebe, Zukaufteile) haben schnell mehrere Millionen Dreiecke und würden ruckeln. Der Konverter reduziert die Geometrie vorab auf ein Maß, das flüssig läuft.

Faustregel binäre STL: **≈ 50 Byte pro Dreieck** → 10 MB ≈ 200 000 Dreiecke, 100 MB ≈ 2 Mio. Dreiecke.
Zielwert (Schätzung, wird in V1 gemessen): **< 1 Mio. Dreiecke** pro Szene.

## Stufenplan

| Stufe | Viewer | Konverter |
|---|---|---|
| **V1 – MVP** | GLB/STL/OBJ laden · mm-Maßstab korrekt · Passthrough auf dem Tisch · Greifen/Drehen/Skalieren · Umschalter 1:1 · Bounding-Box-Maße · Teile ein-/ausblenden · **Messen Punkt–Punkt mit Eckpunkt-Fang** · PWA mit Icon · Desktop-Modus | Manuell: Datei rein → optimierte GLB raus, mit Dreiecks-Statistik und Option „unvereinfacht“ |
| **V2** | Schnittebene · Explosionsansicht | Ordner-Überwachung: Fusion-Export landet automatisch auf der Quest (lokaler HTTPS-Server mit Zertifikat) |
| **V3** | Gelenke beweglich (z. B. Roboterarm) · Versionsvergleich als Geisterbild | URDF bzw. einfache Gelenk-Konfiguration |

**Bewusst nicht enthalten:** Modellieren in VR, Fusion-Plugin, native Android-App (APK).

## Messgenauigkeit – wichtig

Gemessen wird am **Dreiecksnetz**, nicht am CAD-Volumenmodell:

- Rundungen und Bohrungen sind durch Dreiecke angenähert.
- Die Vereinfachung im Konverter verändert die Geometrie zusätzlich. Für Teile, an denen gemessen werden soll, gibt es die Option „unvereinfacht“.
- Referenz für exakte Maße bleibt **Fusion**. Der Viewer dient zum Prüfen von Größen, Abständen und Bauräumen.

## Benutzung (geplant für V1)

1. **Fusion:** Datei → Exportieren → STL oder OBJ, **Einheit: Millimeter**.
2. **Konverter (optional, für große Baugruppen):**
   ```bash
   python3 converter/convert.py roboterarm.stl -o roboterarm.glb
   ```
3. **Datei auf die Quest bringen:** per USB, Cloud-Download oder Download im Quest-Browser.
4. **Viewer öffnen:** `https://chris01-byte.github.io/quest-cad-viewer/` im Quest-Browser → Datei wählen → „AR starten“.

## Technik

- **Viewer:** [three.js](https://threejs.org/) (WebXR, Loader für STL/OBJ/glTF), PWA (Manifest + Service Worker), gehostet über **GitHub Pages** (HTTPS ist für WebXR Pflicht).
- **Konverter:** Python 3, Mesh-Bibliotheken (z. B. trimesh, Vereinfachung per Quadric-Decimation) – endgültige Auswahl bei der Umsetzung.
- **Test ohne Brille:** Desktop-Modus im Browser; zusätzlich Metas *Immersive Web Emulator* (Chrome-Erweiterung) zur Simulation der Quest.

## Dokumente

- [ABNAHME.md](ABNAHME.md) – Abnahmeschritte je Stufe
- [FORTSCHRITT.md](FORTSCHRITT.md) – aktueller Stand und Änderungsprotokoll

## Hinweis zu den Modelldateien

Das Repo ist öffentlich. Testmodelle im Ordner [`samples/`](samples/) sind für alle sichtbar – eigene Modelle werden in der App lokal geöffnet und **nicht** hochgeladen.
