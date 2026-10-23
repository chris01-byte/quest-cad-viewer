# CLAUDE.md – quest-cad-viewer

Diese Datei gibt jedem Agenten, der in diesem Repo arbeitet, den nötigen Kontext. Zuerst lesen, dann [README.md](README.md), [ABNAHME.md](ABNAHME.md) und [FORTSCHRITT.md](FORTSCHRITT.md).

## Sprache und Kommunikation

- Mit Chris **auf Deutsch** kommunizieren. Code-Bezeichner und Kommentare im Code auf Englisch, Doku und Commit-Messages auf Deutsch.
- Chris nutzt oft Spracheingabe: Tippfehler und Transkriptionsfehler sinngemäß lesen und bei echter Mehrdeutigkeit kurz nachfragen.
- Antworten direkt, strukturiert und technisch fundiert, ohne Füllsätze.
- Vor größeren Schritten kurz sagen, was als Nächstes passiert. Grundsätzliche Richtungsentscheidungen (Architektur, neue Abhängigkeiten, Umfangsänderungen) erst mit Chris abstimmen.

## Was das Projekt ist

Eine **Web-App (PWA mit WebXR)**, mit der Chris seine **Fusion-Modelle auf der Meta Quest 3 im Maßstab 1:1** im eigenen Raum ansehen, greifen und **vermessen** kann. Die Modelle reichen von kleinen Baugruppen bis zu großen wie einem **6-Achs-Roboterarm**.

Dazu kommt ein **Konverter** (Python, läuft auf Chris' Mac), der große Baugruppen für die Quest verkleinert.

### Ziel

Ein Bauteil in echter Größe vor sich sehen, um Proportionen, Bauräume und Reichweiten zu beurteilen und Abstände direkt nachzumessen, ohne Sideloading und ohne Entwicklermodus.

### Kontext

- **Chris:** Mechatroniker, Industriemeister Elektrotechnik, konstruiert in **Fusion auf dem Mac**, betreibt eine Einzelunternehmung für Konstruktion und Prototypenbau.
- **Hardware:** Mac mit Fusion, Gaming-PC vorhanden. **Die Quest 3 ist noch nicht gekauft.** Bis dahin wird alles im Desktop-Browser entwickelt und getestet.
- **Repo:** öffentlich, gehostet über **GitHub Pages**. Es gibt keine vertraulichen Modelle, eigene Modelle trotzdem nicht ins Repo committen (siehe `.gitignore`).

## Getroffene Entscheidungen (nicht ohne Rücksprache ändern)

| Entscheidung | Begründung |
|---|---|
| Web-App (PWA, WebXR) statt native APK | schnelle Entwicklung, automatische Updates, läuft auch auf Mac/iPad; die Performance fängt der Konverter ab |
| three.js als 3D-Engine | WebXR-Unterstützung, fertige Loader für STL/OBJ/glTF |
| Messen gehört zu V1 | Kernanforderung von Chris |
| Hosting über GitHub Pages | HTTPS automatisch (Pflicht für WebXR), kostenlos |
| Modelle in V1 per Datei-Auswahl in der App | ein Mac-Server braucht ein lokales HTTPS-Zertifikat und gehört zu V2 |
| Native APK, Modellieren in VR und ein Fusion-Plugin sind **nicht** im Umfang | bewusst ausgeschlossen |

## Architektur

```
viewer/      Web-App: index.html, JS-Module, PWA-Manifest, Service Worker, Icons
converter/   Python-Skript: STL/OBJ → optimierte GLB
samples/     Prüfkörper mit bekannten Maßen (öffentlich)
```

### Viewer – Leitlinien

- **Kein Build-Schritt** (kein Bundler), wenn es sich vermeiden lässt: ES-Module mit Import-Map, damit Chris den Code direkt lesen und ändern kann.
- **three.js lokal einbinden** (`viewer/vendor/`, feste Version), nicht vom CDN, damit die PWA offline funktioniert und der Service Worker alles cachen kann.
- Zwei Betriebsarten: **Desktop-Modus** (Maus, OrbitControls) und **XR-Modus** (`immersive-ar` mit Passthrough, Fallback `immersive-vr`).
- Die Bedienung muss in beiden Modi dieselben Funktionen bieten: laden, Teile ein- und ausblenden, messen, 1:1.

### Konverter – Leitlinien

- Python 3, läuft auf macOS. Abhängigkeiten in `converter/requirements.txt` und Installation in einer venv.
- Eingabe STL/OBJ, Ausgabe GLB. Bauteile bleiben getrennte Knoten (wichtig für die Teileliste), gleiche Geometrie wird instanziiert.
- Ein Zielwert für die Dreiecke ist einstellbar, ebenso eine Option „unvereinfacht“. Nach jedem Lauf wird eine Statistik ausgegeben (Dreiecke vorher/nachher, Dateigröße, Bounding-Box in mm).

## Einheiten – kritisch fürs Messen

- Fusion exportiert in **mm** (Chris wählt beim Export Millimeter). STL und OBJ haben keine Einheit, deshalb werden sie als mm interpretiert.
- glTF/GLB ist per Definition in **Metern**. Der Konverter rechnet von mm in m um. Der Viewer rechnet intern in Metern (WebXR-Welt = Meter) und zeigt **immer mm** an.
- Bei GLB-Dateien, die nicht vom Konverter stammen, wird angenommen, dass sie in Metern vorliegen.
- Jeder Loader-Pfad muss am Prüfquader 100 × 50 × 20 mm geprüft werden.

## Messgenauigkeit

Gemessen wird am Dreiecksnetz, nicht am CAD-Modell. Rundungen sind angenähert, und die Vereinfachung verändert die Geometrie zusätzlich. In der App und der Doku muss klar sein, dass **Fusion die Referenz für exakte Maße** bleibt. Messpunkte rasten auf Eckpunkte ein. Kreismitten und Bohrungen kommen frühestens in einer späteren Stufe.

## Performance

- Die Quest rendert mit einem Smartphone-Chip für zwei Augen bei 72–90 fps. Schwankende Bildraten in VR verursachen Übelkeit.
- Arbeitshypothese: **< 1 Mio. Dreiecke pro Szene**, ca. 100–150k pro Glied beim Roboterarm. Das ist ungemessen und wird auf dem Gerät verifiziert.
- Faustregel binäre STL: ≈ 50 Byte pro Dreieck.
- Der Viewer zeigt die Dreiecksanzahl des geladenen Modells an und warnt oberhalb des Zielwerts.

## Aufgaben V1 – in dieser Reihenfolge

1. **Prüfkörper** in `samples/` erzeugen (per Skript, reproduzierbar): `pruefquader.stl` und `.obj` (100 × 50 × 20 mm), `pruefwinkel.glb` (zwei Bauteile, Bohrung Ø 10 mm), `last_2mio.stl` (Kugel Ø 200 mm, ≈ 2 Mio. Dreiecke). Bei großen Dateien prüfen, ob sie ins Repo sollen oder per Skript erzeugt werden.
2. **Viewer-Grundgerüst** im Desktop-Modus: Szene, Licht, Raster, Datei öffnen.
3. **Loader** STL, OBJ, GLB mit korrekten Einheiten, dazu die Bounding-Box-Anzeige in mm.
4. **Teileliste** mit Ein- und Ausblenden.
5. **Messen** Punkt–Punkt mit Eckpunkt-Fang, mehrere Messungen, einzeln und gesamt löschen.
6. **WebXR:** Passthrough, Greifen, Drehen, beidhändig Skalieren, 1:1-Taste, Ablegen auf dem Tisch, Messen per Controller-Strahl.
7. **PWA:** Manifest, Service Worker, Icon.
8. **GitHub Pages** einrichten (Deployment des Ordners `viewer/`, z. B. per GitHub-Actions-Workflow).
9. **Konverter** mit allen Funktionen aus „Konverter – Leitlinien“ und einer Anleitung in `converter/README.md`.
10. **Abnahme Desktop** vorbereiten: Schritte V1-01 bis V1-10 und K1-01 bis K1-06 selbst durchspielen, dann an Chris übergeben.

Die Quest-Schritte V1-11 bis V1-19 sind erst möglich, wenn Chris das Gerät hat.

## Arbeitsweise

- **Nach jeder abgeschlossenen Aufgabe** `FORTSCHRITT.md` aktualisieren: Status, offene Punkte, neue Entscheidungen, Eintrag im Änderungsprotokoll mit Datum.
- **ABNAHME.md:** Das ✅ setzt **nur Chris**. Der Agent darf eigene Testergebnisse in der Bemerkung notieren (z. B. „Agent-Test: 100,0 mm“), aber den Status nicht auf bestanden setzen.
- Neue Funktionen bekommen vor der Umsetzung einen Abnahmeschritt in `ABNAHME.md`.
- Umfangsänderungen und neue Ideen kommen unter „Offene Punkte“ in `FORTSCHRITT.md` und werden nicht einfach umgesetzt.
- Kleine, thematisch saubere Commits mit deutscher Commit-Message, Push auf `main`, sofern Chris nichts anderes sagt.
- Keine eigenen Modelle von Chris committen, nur Prüfkörper in `samples/`.

## Testen

- **Desktop:** lokalen Server starten (z. B. `python3 -m http.server` im Ordner `viewer/`) und die Seite im Browser öffnen. WebXR braucht HTTPS **oder** `localhost`.
- **XR ohne Brille:** Metas *Immersive Web Emulator* (Chrome-Erweiterung) simuliert die Quest.
- **Automatisiert:** Wo sinnvoll, Headless-Tests (z. B. Playwright) für Laden, Maße und Fehlerfreiheit der Konsole.
- **Quest:** Erst mit Gerät. Bis dahin klar kennzeichnen, was nur im Emulator geprüft wurde.

## Offene Punkte (Stand Projektstart)

- Prüfen, ob der OBJ-Export aus Fusion Bauteile als getrennte Gruppen behält.
- Die PWA-Installation im Quest-Browser auf dem Gerät bestätigen.
- Den Zielwert für Dreiecke auf der Quest messen.
- Lizenz: noch keine gewählt, Chris entscheidet.

## Spätere Stufen (nicht jetzt umsetzen)

- **V2:** Schnittebene, Explosionsansicht, automatischer Abgleich vom Mac (lokaler HTTPS-Server mit Zertifikat).
- **V3:** Gelenke des Roboterarms beweglich (URDF oder einfache Konfiguration), Versionsvergleich als Geisterbild.
