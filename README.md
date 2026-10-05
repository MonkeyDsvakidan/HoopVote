# HoopVote – produktive Version

HoopVote ist eine private Basketball-Team-App mit:
- Self-Registration über Team-Einladungslink
- Pflicht-Profilfoto und Admin-Freigabe
- manuell verwalteten Saisons
- 48-Stunden-Abstimmungen nach Training
- Anwesenheitssteuerung durch Admin
- Top-3-Ranking je Kategorie (3/2/1 Punkte)
- keine Selbstwahl
- anonymen Stimmen ohne Voter-ID
- automatischem Abschluss bei 100 % Teilnahme
- Veröffentlichung spätestens nach 48 Stunden
- Monats- und Saisonstatistiken

## Inbetriebnahme

1. Neues Supabase-Projekt anlegen.
2. `schema.sql` (im Hauptordner) im SQL Editor ausführen. **Nur in einem neuen, leeren Projekt – nie auf der Produktiv-Datenbank.** Spätere Änderungen liegen als Migrationen in `supabase/migrations/`.
3. In Supabase Authentication E-Mail/Passwort aktivieren. Für ein geschlossenes privates Team kann E-Mail-Bestätigung deaktiviert werden; andernfalls bestätigen Spieler zuerst ihre E-Mail.
4. Project URL und anon/public key in `config.js` eintragen.
5. App deployen.
6. Als erster Benutzer registrieren und danach `index.html?setup=1` öffnen. Teamname, Anzeigename und Profilfoto hinterlegen. Der erste Benutzer wird Admin.
7. In der Verwaltung den Einladungslink in den Gruppenchat kopieren.

## Anonymitätsmodell

`anonymous_votes` enthält nur Session, Kategorie, Kandidat, Rang und Punkte – keine Voter-ID. `ballot_receipts` speichert separat nur, dass ein Spieler für eine Session bereits abgestimmt hat. Die Client-App besitzt keine Leserechte auf beide Tabellen. Resultate werden ausschliesslich über SECURITY DEFINER RPCs ausgegeben und erst nach Session-Abschluss bzw. Fristablauf.

Hinweis: Als Supabase-Projektinhaber besitzt man technisch Datenbank-Administratorrechte. Die Anwendung selbst stellt jedoch keine Zuordnung von Stimmen zu Personen her und speichert diese Zuordnung nicht als Fachdatum.

## Saisonale Skill-Ratings
Die App enthält Pflicht-Ratings (1–10) für Werfen, Korbleger, Ballhandling, Passen, Defense, Rebounding, Kondition, Basketball-IQ und Teamplay. Jeder freigegebene Spieler bewertet alle anderen genau einmal pro Phase. Offene Ratings blockieren die übrige App. Beim Saisonabschluss startet zuerst eine zweite Rating-Runde; danach kann der Admin die Saison endgültig archivieren.
