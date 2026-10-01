# Chrome Site Summary

Geplante Chrome-Extension, die den Hauptinhalt der aktuellen Webseite über OpenRouter auf Deutsch zusammenfasst.

## Projektstatus

Die Anforderungen sind abgestimmt. Die Extension ist noch nicht implementiert und kann noch nicht in Chrome installiert werden.

## Geplanter Funktionsumfang

- Chrome-Seitenleiste öffnen über das Extension-Icon.
- Zusammenfassung ausschließlich per Button „Seite zusammenfassen“ starten.
- Hauptinhalt der gesamten bereits geladenen Seite erfassen, auch außerhalb des sichtbaren Bildschirmbereichs.
- Navigation, Werbung und Cookie-Banner möglichst herausfiltern.
- Ausgabe immer auf Deutsch: kurzer Überblick und 5–10 zentrale Punkte, abhängig vom Inhalt.
- Ergebnis kopieren und bei Bedarf erneut zusammenfassen.
- OpenRouter API-Key und Modell-ID als Textfelder in den Einstellungen hinterlegen.
- API-Key lokal speichern und den Zugriff auf vertrauenswürdige Extension-Komponenten beschränken.
- Kein Chat und keine Rückfragen in der ersten Version.

Der erfasste Seiteninhalt wird nach dem manuellen Start an OpenRouter und den ausgewählten Modellanbieter gesendet. Es ist kein eigener Backend-Server vorgesehen.

## Umsetzungsplan

1. Manifest-V3-Grundgerüst, Seitenleiste und Einstellungsseite erstellen.
2. Hauptinhalt auslesen und verständliche Meldungen für fehlende oder nicht unterstützte Inhalte ergänzen.
3. OpenRouter anbinden, einschließlich Verbindungstest, Ladezustand und Fehlerbehandlung.
4. Deutsche Zusammenfassung formatiert darstellen sowie Kopieren und erneutes Erstellen ermöglichen.
5. Artikel, Blogs, Dokumentation, lange Texte und Tabwechsel prüfen.

Lange Seiten sollen bei Bedarf in Abschnitten zusammengefasst und anschließend zu einer Gesamtsynthese verbunden werden. Das kann mehrere kostenpflichtige API-Anfragen verursachen.

PDF-, Bild- und Videoauswertung sind zunächst nicht vorgesehen. Noch nicht geladene Inhalte werden nicht automatisch nachgeladen.

## Technische Richtung

- HTML, CSS und JavaScript mit Chrome Manifest V3.
- Chrome Side Panel für die Oberfläche.
- Zugriff auf die aktuelle Seite nach Nutzeraktion über `activeTab` und `scripting`.
- OpenRouter Chat Completions API für die Zusammenfassung.
- Lokale Speicherung des API-Keys; keine Zugangsdaten im Repository.

Die genaue technische Umsetzung wird während der Entwicklung geprüft.
