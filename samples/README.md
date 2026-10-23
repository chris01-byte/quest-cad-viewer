# Testmodelle

Prüfkörper mit bekannten Maßen für die Abnahme – siehe [ABNAHME.md](../ABNAHME.md#prüfkörper).

Achtung: Dieses Repo ist öffentlich. Hier nur Testmodelle ablegen.

| Datei | Inhalt | Einheit | im Repo |
|---|---|---|---|
| `pruefquader.stl` / `.obj` | Quader 100 × 50 × 20 mm, Ecke im Ursprung | mm | ja |
| `pruefwinkel.glb` | L-Winkel 80 × 60 × 40 mm aus zwei Bauteilen (`Grundplatte`, `Schenkel_mit_Bohrung`), Bohrung Ø 10 mm (64 Segmente, Bohrungsachse in Z) | m (glTF) | ja |
| `last_2mio.stl` | Kugel Ø 200 mm, 2 002 224 Dreiecke, ≈ 100 MB | mm | **nein**, per Skript |

## Neu erzeugen

```bash
python3 samples/generate.py              # alle Dateien (braucht numpy)
python3 samples/generate.py --ohne-last  # ohne den 100-MB-Lasttest
```

Das Skript prüft jedes Netz auf Wasserdichtheit, einheitliche Orientierung und das erwartete Volumen.
`last_2mio.stl` steht in der `.gitignore`: Die Datei ist zu groß für ein öffentliches Repo und lässt sich in ca. 10 Sekunden erzeugen.
