# Visual Check (Entwickler-Werkzeug)

Vergleicht zwei Stände der App (z. B. `main` und einen Branch) **ohne die echte Datenbank**.
Die Supabase-Bibliothek wird durch `mock-supabase.js` ersetzt: feste Beispieldaten,
keine Netzwerkzugriffe, Schreibaufrufe werden abgewiesen. Die App selbst benutzt
diesen Ordner nicht (er ist per `.vercelignore` vom Deployment ausgeschlossen).

## Einrichten

```bash
cd tools/visual-check
npm install            # Playwright; Browser: vorhandenes Chromium per CHROMIUM_PATH
mkdir -p shots
git worktree add /tmp/hv-before origin/main   # Vergleichsstand
```

## Skripte

| Befehl | Prüft |
|---|---|
| `node compare.js /tmp/hv-before ../.. shots` | Alle 6 Seiten in 390 px und 1280 px: Pixel, berechnete Styles jedes Elements, Menge der Datenabfragen. Screenshots landen in `shots/` (`-A` = vorher, `-B` = nachher). |
| `node scenarios.js /tmp/hv-before ../..` | Weiterleitungen von `guard()`: nicht eingeloggt, kein Profil, nicht freigegeben, Spieler auf Admin-Seite, offene Ratings. |
| `node timing.js /tmp/hv-before ../..` | Datenladezeit je Seite mit 100 ms simulierter Verzögerung pro Anfrage. |

Beide Stände werden nacheinander über `http://localhost:8100` ausgeliefert (gleiche Adresse,
sonst unterscheidet sich z. B. der Einladungslink). Uhr ist auf den 5.10.2026 12:00 UTC fixiert.

## Hinweise

- «no auth» als Konsolenfehler erscheint zufällig (vorher wie nachher): Es ist der beabsichtigte
  Abbruch in `guard()`, kurz bevor die Seite weiterleitet.
- Bei bewussten Design-Änderungen sind Pixel-Unterschiede erwartet. Dann die Screenshots in
  `shots/` ansehen statt auf «GLEICH» zu warten.
- Beispieldaten anpassen: `mock-supabase.js` (`players`, `rpcs`, `tables`); Szenario per
  `window.__scenario`, Verzögerung per `window.__mockDelay`.
