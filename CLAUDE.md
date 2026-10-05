# HoopVote – Hinweise für Claude

Private Basketball-Team-App: Abstimmungen nach jedem Training (Top 3 pro Kategorie), Monats-/Saisonstatistiken und saisonale Skill-Ratings. Statische Webseite (HTML/CSS/JS ohne Build-Schritt) mit Supabase als Backend.

## ⚠️ Echte Daten – oberste Regel

Die App ist **produktiv im Einsatz**. In der Datenbank liegen Profile, Stimmen und Ratings der Mitspieler einer laufenden Saison. **Diese Daten dürfen unter keinen Umständen verloren gehen oder verändert werden.**

- **`schema.sql` NIE ausführen.** Die Datei ist nur für eine leere Datenbank gedacht.
- **Kein** `drop table`, `truncate`, `delete`, keine Änderung oder Entfernung bestehender Spalten.
- Datenbank-Änderungen **nur als neue Migration** in `supabase/migrations/` (Dateiname `YYYYMMDDHHMMSS_beschreibung.sql`), additiv, in `begin; … commit;`.
- Vor jeder Migration:
  1. Prüfen, dass **keine Abstimmung offen** ist (`sessions` mit `status='open' and ends_at>now()`).
  2. **Backup** aller Tabellen als JSON exportieren und dem Nutzer geben.
  3. Prüfen, dass alle bestehenden Zeilen eine neue Regel/Constraint erfüllen.
  4. Das komplette SQL dem Nutzer zeigen und auf sein **ausdrückliches OK** warten.
- Der Nutzer führt Migrationen ggf. selbst im Supabase SQL Editor aus. Danach **lesend verifizieren**: Zeilenzahlen unverändert, Änderung aktiv.
- `create or replace function` behält Rechte; neue Funktionen brauchen `revoke … from public, anon` und `grant execute … to authenticated`.

**Lokal testen:** `config.js` zeigt auf die **Produktiv-Datenbank**. Lokal nur lesend testen (Seiten ansehen, Statistiken). **Keine** Test-Stimmen, Ratings, Registrierungen oder Admin-Aktionen gegen Produktion. Für schreibende Tests zuerst ein separates Supabase-Testprojekt vorschlagen.

## Arbeitsweise

- Pro Schritt **ein eigener Branch und ein kleiner Pull Request**. Nicht mehrere Themen bündeln.
- Mergen nur nach OK des Nutzers. Ein Merge in `main` geht live.
- Der Nutzer spricht Deutsch (Schweiz, «ss» statt «ß»). Erklärungen einfach halten, er ist kein Entwickler.

## Technik

- **Supabase-Projekt:** `HoopVote`, ID `plwmedgjmuaquujmwpia`, Region eu-central-2, Postgres 17.
- **Client:** `config.js` (URL + Publishable Key, darf öffentlich sein), `app.js` (gemeinsame Helfer, `guard()`), Seitenlogik in `js/<seite>.js` (am Ende des `<body>`, ohne `defer`, damit die Reihenfolge wie früher beim Inline-Skript bleibt). Supabase-JS kommt per CDN (`cdn.jsdelivr.net`), im Claude-Container gesperrt: für Browser-Tests lokal per npm bereitstellen.
- **Sicherheitsmodell:** RLS auf allen Tabellen, Client liest nur über RLS-Policies, **alle Schreibzugriffe über `SECURITY DEFINER`-RPCs** mit eigener Rechteprüfung und `search_path=public`. `ballot_receipts`, `anonymous_votes`, `skill_ratings` sind für Clients komplett gesperrt. Die Supabase-Advisor-Warnungen «authenticated can execute SECURITY DEFINER» sind deshalb erwartet.
- **Profilbilder:** öffentlicher Bucket `avatars`, Pfad `<auth.uid()>/<uuid>.<jpg|jpeg|png|webp|heic|heif|gif>`, geprüft durch `is_valid_avatar_path()`. Bucket-Limit 10 MB, nur Bildformate. Im HTML immer `esc(avatarUrl(...))` verwenden.
- **`schema.sql`** entspricht exakt der Live-DB (Stand nach Migration 03, per Fingerabdruck verglichen). Nach jeder Migration nachführen.
- **MusicBattle** ist ein eigenes Git- und Supabase-Projekt. Nicht anfassen. Die zwei versehentlich hier angelegten `mb_*`-Funktionen wurden mit Migration 02 entfernt.
- **Migrationen über den Supabase-Zugang** (`apply_migration`) liefen in Claude-Sitzungen mehrfach in einen Timeout, ohne etwas zu ändern. Lesen funktioniert. Migrationen deshalb vom Nutzer im SQL Editor ausführen lassen und danach lesend prüfen.

## Stand (5. Oktober 2026)

- Daten: 1 Team, 8 Spieler, 1 aktive Saison (Rating-Phase `start`), 3 Sessions, 120 Einzelstimmen, 56 Skill-Ratings, 14 Bilddateien.
- ✅ Backup aller Tabellen erstellt (beim Nutzer gespeichert).
- ✅ Migration `20261005120000_avatar_security.sql` ausgeführt und verifiziert (XSS über `avatar_path` geschlossen, Bucket-Limits).
- ✅ Frontend-Fix (PR #1, gemerged): Bild-URLs werden kodiert und escaped.
- ✅ `schema.sql` mit Live-DB abgeglichen (Roadmap 1).
- ✅ Migration 03 `20261005140000_join_team_name_rules.sql` vom Nutzer ausgeführt und verifiziert: `join_team` prüft Namen wie `update_my_profile` (deutsche Meldungen), Zeilenzahlen unverändert. Backup davor beim Nutzer.
- ✅ Profilbilder werden vor dem Upload verkleinert (PR #5, gemerged).
- ✅ Migration `20261005130000_fix_rotate_invite_remove_mb.sql` vom Nutzer ausgeführt und verifiziert: «Einladungslink erneuern» repariert (`extensions.gen_random_bytes`), `mb_*`-Funktionen entfernt, Zeilenzahlen unverändert. Backup davor beim Nutzer.

## Roadmap (in dieser Reihenfolge)

1. ✅ **`schema.sql` mit der Live-DB abgleichen.** Schema aus der Live-Datenbank neu erzeugen, damit das Repo wieder stimmt. Die zwei MusicBattle-Funktionen entfernen (vorher mit dem Nutzer bestätigen). README-Pfad korrigieren (`schema.sql` liegt im Root, nicht unter `supabase/`).
1b. ✅ **`admin_rotate_invite` reparieren** und die zwei `mb_*`-Funktionen aus der Live-DB entfernen (Migration 02).
2. **Schutz vor geleakten Passwörtern** in Supabase Authentication einschalten. Macht der Nutzer selbst. Vom Nutzer vorerst zurückgestellt (nur in kostenpflichtigen Plänen).
3. ✅ **Registrierung vereinheitlichen.** `join_team` soll dieselben Regeln wie `update_my_profile` prüfen (Name 2–10 Zeichen, eindeutig im Team). Bestehende Namen nicht anfassen.
4. ✅ **Profilbilder beim Upload verkleinern.** `uploadAvatar()` in `app.js` skaliert vor dem Upload (kürzere Seite 400 px, JPEG 0.85, ca. 40–90 KB); kann der Browser das Bild nicht lesen (z. B. HEIC), wird wie bisher das Original hochgeladen. Bestehende Bilder unverändert.
5. **Code aufräumen und optimieren.** Inline-Skripte aus den HTML-Dateien in lesbare JS-Dateien pro Seite auslagern (`js/vote.js`, …), gemeinsame Helfer in `app.js` bündeln, Duplikate entfernen, Inline-Styles nach `styles.css`. **Kein geändertes Verhalten.** Parallele statt nacheinander laufende Datenabfragen, wo möglich. Jede Seite vorher/nachher lesend gegen Produktion prüfen.
6. **Modernes Design.** Erst nach Schritt 5. Vorher mit dem Nutzer Stil und Vorbilder klären. Sauberes Design-System in `styles.css` (Farb-, Abstands- und Schrift-Variablen), moderne Typografie, mobile-first (die App wird v. a. auf dem Handy genutzt), einheitliche Komponenten (Karten, Buttons, Tabs, Ranglisten), gute Lesbarkeit und Kontraste, sinnvolle Animationen. Abläufe und Texte bleiben gleich. Vorher/nachher-Screenshots zeigen.
7. **Spieler deaktivieren.** Klären, ob es nötig ist: Inaktive Spieler blockieren sonst den Saisonabschluss, weil alle Ratings vollständig sein müssen. Lösung als neuer Status (z. B. `inactive`) per additiver Migration.
8. **Anonymität verstärken (optional).** Zuordnung von Stimmen über Reihenfolge/Zeitstempel erschweren, nur für künftige Stimmen. Bestehende 120 Stimmen nicht anfassen.
