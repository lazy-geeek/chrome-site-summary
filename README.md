# Chrome Site Summary

Chrome-Extension, die den Hauptinhalt der aktuellen Webseite oder einer geöffneten PDF auf Deutsch über OpenRouter zusammenfasst. Die Ausgabe erscheint in der Chrome-Seitenleiste: kurzer Überblick und 5–10 zentrale Punkte, sofern die Quelle genügend Inhalt bietet.

## Installation in Chrome

Voraussetzung: Google Chrome ab Version 116 und ein eigener OpenRouter API-Key mit ausreichendem Guthaben beziehungsweise Zugriff auf das gewählte Modell.

1. Dieses Repository klonen oder über **Code → Download ZIP** herunterladen und entpacken.
2. In Chrome `chrome://extensions` öffnen.
3. Oben rechts den **Entwicklermodus** einschalten.
4. **Entpackte Erweiterung laden** wählen und den Ordner mit `manifest.json` auswählen.
5. Über das Puzzle-Symbol die Extension **Chrome Site Summary** an die Symbolleiste anheften.
6. Über **Details → Erweiterungsoptionen** oder das Zahnrad in der Seitenleiste die Einstellungen öffnen.
7. OpenRouter API-Key und Modell-ID eintragen, optional **Verbindung testen**, anschließend **Speichern**.

Ein Build oder `npm install` ist für die Installation der Extension nicht erforderlich. Die Extension ist noch nicht im Chrome Web Store veröffentlicht.

## Verwendung

1. Eine Webseite oder PDF öffnen und vollständig laden lassen.
2. Auf das Extension-Icon klicken, um die Seitenleiste zu öffnen und den Zugriff auf diesen Tab zu erlauben.
3. **Seite zusammenfassen** drücken.
4. Die Zusammenfassung lesen, **Kopieren** oder **Erneut zusammenfassen** wählen.

Erfasst wird der Hauptinhalt der gesamten bereits geladenen Seite, einschließlich Text unterhalb des sichtbaren Bildschirmbereichs. Navigation, Werbung, Formulare und bekannte Cookie-Banner werden möglichst herausgefiltert. Versteckte Texte und bearbeitbare Eingabebereiche werden übersprungen. Es wird nichts automatisch gescrollt oder nachgeladen.

Bei wissenschaftlichen Artikeln mit passenden Zitations-Metadaten werden zusätzlich Literaturverzeichnisse, Anhänge, Ergänzungsmaterial, Autorenbeiträge, Finanzierungshinweise und verwandte Artikel möglichst ausgeschlossen. Auf ScienceDirect werden gezielt Highlights, Abstract und der zugängliche Haupttext verwendet; Methoden, Ergebnisse, Diskussion, Schlussfolgerungen, Tabellen und Bildunterschriften bleiben erhalten. Tabellenzellen werden durch Trennzeichen getrennt, damit Zahlen nicht zusammenlaufen. Ist nur das Abstract zugänglich, zeigt die Quellenangabe dies ausdrücklich an. Die Erkennung bleibt abhängig vom Layout der jeweiligen Website. Eine bereits gespeicherte Zusammenfassung wird erst durch **Erneut zusammenfassen** mit der verbesserten Extraktion aktualisiert.

Die Ausgabe ist immer auf Deutsch. Es gibt keine Rückfragen und keinen Chat. Die Seitenleiste folgt automatisch dem aktiven Tab in ihrem Chrome-Fenster und reagiert auf Navigation, Neuladen und URL-Wechsel dynamischer Seiten. Beim Wechsel in einen anderen Tab läuft dessen Zusammenfassung weiter. Im neuen Tab kann eine weitere Zusammenfassung parallel gestartet werden. Beim Zurückwechseln erscheinen der aktuelle Fortschritt und bereits ausgegebener Text oder das fertige Ergebnis. Ein Hinweis zeigt, wie viele andere Tabs gerade verarbeitet werden. **Abbrechen** stoppt nur den Auftrag des angezeigten Tabs. Ein zweiter Start für denselben Tab ist während der Verarbeitung gesperrt. Lädt ein Tab eine andere Seite, wird neu geladen oder geschlossen, wird sein Auftrag abgebrochen; andere Tabs laufen weiter.

Fertige Ergebnisse werden lokal nach ihrer vollständigen Seitenadresse gespeichert, einschließlich Query-Parametern und URL-Fragmenten für dynamische Anwendungen. Beim erneuten Besuch derselben Adresse wird die vorhandene Zusammenfassung automatisch geladen, ohne neue API-Anfrage. Das funktioniert auch in einem anderen Tab und nach einem Browser-Neustart. Datum und ursprüngliches Modell bleiben sichtbar. Ein Ergebnis kann bei geänderten Inhalten derselben Adresse veraltet sein; dann **Erneut zusammenfassen** wählen. Es werden höchstens 100 Ergebnisse und maximal etwa 4 MiB gespeichert; ältere Ergebnisse werden bei Bedarf entfernt. In den Einstellungen lassen sich alle gespeicherten Zusammenfassungen löschen, ohne API-Key oder Modell zu entfernen. Inkognito-Seiten verwenden keinen dauerhaften Cache.

Falls nach einem Tabwechsel kein Zugriff besteht, auf der gewünschten Webseite erneut das Extension-Icon anklicken. Auch eine bereits offene Seitenleiste wird dabei aktualisiert. Fehlende Tab-Metadaten blockieren den Zusammenfassen-Button nicht; beim Start wird der tatsächliche Seitenzugriff geprüft.

Nach einem Update der lokal geladenen Extension in `chrome://extensions` auf **Neu laden** klicken, die bisherige Seitenleiste schließen und über das Extension-Icon erneut öffnen. API-Key und Modell bleiben gespeichert.

## OpenRouter-Setup

- **API-Key:** Eigenen Key unter [OpenRouter API Keys](https://openrouter.ai/settings/keys) erstellen.
- **Modell-ID:** Exakte ID aus dem [OpenRouter-Modellkatalog](https://openrouter.ai/models) eingeben. Als Ausgangswert wird wie im YouTube Summarizer `anthropic/claude-sonnet-4.5` verwendet. Die Verfügbarkeit und Kosten des Modells bestimmt OpenRouter.
- **Verbindung testen:** Prüft die aktuell eingegebenen Werte mit einer kurzen echten Modellanfrage. Dabei können API-Kosten entstehen. Der Test speichert Änderungen nicht automatisch.

Ein leer gespeicherter API-Key entfernt den bisherigen Key. Eine leere Modell-ID setzt den Ausgangswert ein.

## PDF-Dokumente

Eine im aktuellen Tab geöffnete PDF mit `.pdf` in der Adresse wird direkt erkannt. Beim Start fragt Chrome nach Zugriff auf die betreffende Website; danach lädt die Extension die Datei mit vorhandenen Browser-Anmeldedaten und liest alle Seiten lokal mit der mitgelieferten PDF.js-Bibliothek aus. An OpenRouter wird ausschließlich der extrahierte Text gesendet. Auch PDF-Ergebnisse werden nach vollständiger Adresse gespeichert und beim erneuten Besuch geladen.

Bei PDF-Adressen ohne `.pdf`-Endung kann Chrome den normalen Seitenzugriff verweigern. In diesem Fall bietet die Seitenleiste **Als PDF versuchen** an. Bei einer als PDF erkannten Quelle erscheint **PDF zusammenfassen**. Die zusätzliche Bestätigung ermöglicht die von Chrome vorgeschriebene Abfrage der Dateiberechtigung durch einen direkten Klick.

Für lokale Dateien (`file:///…/dokument.pdf`) unter `chrome://extensions` → **Chrome Site Summary** → **Details** zusätzlich **Zugriff auf Datei-URLs zulassen** aktivieren. Bei passwortgeschützten Dokumenten erscheint ein Passwortfeld; das Passwort wird weder gespeichert noch an OpenRouter gesendet.

Grenzen: maximal 25 MiB, 500 Seiten und 120.000 Zeichen. Reine Scans benötigen vorher OCR. Bei einzelnen Seiten ohne auslesbaren Text wird deren Anzahl als Quellenhinweis angezeigt; Bilder, Diagramme und gescannte Seiten werden nicht analysiert. Mehrspaltige PDFs können eine unvollkommene Textreihenfolge ergeben. Geschützte Download-Adressen können trotz geöffneter Vorschau eine erneute Anmeldung erfordern. Blob-Adressen und PDFs in fremden eingebetteten Viewern werden nicht unterstützt. PDF-Auswertung umfasst alle auslesbaren Seiten einschließlich Anhängen und Literaturverzeichnissen.

## Lange Seiten und Grenzen

- Texte bis 12.000 Zeichen werden direkt zusammengefasst.
- Längere Texte werden in Abschnitte aufgeteilt, einzeln verdichtet und zu einer Gesamtsynthese verbunden. Bei sehr langen Zwischenergebnissen folgt eine weitere Verdichtungsrunde. Dafür werden mehrere kostenpflichtige API-Anfragen benötigt.
- Über 120.000 Zeichen wird keine Anfrage gesendet. Die Extension bittet um eine kürzere Seite, statt den Hauptinhalt still abzuschneiden.
- Bild-, Audio- und Videoauswertung, Inhalte in eingebetteten Frames und geschlossenen Shadow Roots sind nicht enthalten. Bei YouTube wird kein Transkript automatisch geöffnet; dafür bleibt der separate YouTube Summarizer zuständig.
- Chrome-interne Seiten und der Chrome Web Store erlauben keine normale Textextraktion durch diese Extension.
- Bei Layouts ohne eindeutig erkennbaren Artikel wird auf den bereinigten Seiteninhalt zurückgegriffen. Die Erkennung ist heuristisch und kann je nach Webseite Navigation oder andere Nebeninhalte enthalten.
- Paywalls werden nicht umgangen; nur zugänglicher, bereits geladener Text kann verarbeitet werden.

## Daten und Berechtigungen

Erst durch **Seite zusammenfassen** werden Seitentitel und extrahierter Hauptinhalt an OpenRouter und den gewählten Modellanbieter übertragen. Es gibt keinen eigenen Backend-Server und keine Analyse-Telemetrie.

Der API-Key liegt lokal in `chrome.storage.local`, wird nicht per Chrome-Sync synchronisiert und ist nur für vertrauenswürdige Extension-Komponenten zugänglich. Der Key wird nicht an die Webseite oder das Extraktionsskript übergeben. Lokale Chrome-Speicherung ist kein verschlüsselter Passworttresor. Der Rohtext wird nicht dauerhaft gespeichert. Fertige Zusammenfassungen und zugehörige Seitenadresse, Titel, Modell und Datum bleiben ebenfalls lokal gespeichert, bis sie gelöscht oder durch die Cache-Begrenzung entfernt werden.

Die Extension verwendet `activeTab`, `tabs`, `scripting`, `storage` und `sidePanel`. Die Berechtigung `tabs` erlaubt das Erkennen von URL und Titel beim Seitenwechsel, damit passende gespeicherte Ergebnisse automatisch angezeigt werden. Sie erlaubt alleine kein Auslesen des Seiteninhalts. Zum Erstellen einer neuen Zusammenfassung kann deshalb weiterhin ein Klick auf das Extension-Icon auf der betreffenden Webseite notwendig sein. Bei der Installation ist der einzige dauerhaft erlaubte externe Host `https://openrouter.ai/*`. Optionaler Zugriff auf HTTP-/HTTPS-Hosts wird erst beim PDF-Start für die konkrete Website angefragt und von Chrome gespeichert. Für lokale PDFs wird optionaler Zugriff auf Datei-URLs benötigt. Erteilte Website-Berechtigungen lassen sich in den Chrome-Details der Extension wieder entfernen. PDF.js und alle Hilfsdateien werden lokal ausgeliefert; es wird kein externer Bibliothekscode geladen.

Seiteninhalte werden im Prompt als Quellenmaterial behandelt. Die Modellantwort wird mit DOM-Textknoten dargestellt; HTML und Skripte aus Antworten werden nicht ausgeführt. Zusammenfassungen können dennoch Fehler enthalten und ersetzen bei wichtigen Entscheidungen nicht die Originalquelle.

## Entwicklung und Prüfung

Node.js 22 ab Version 22.13 oder eine Version ab 24:

```sh
npm ci
npm test
npm run check
```

Nach einem gezielten Update von `pdfjs-dist` mit `npm run vendor:pdf` die mitgelieferten Parser-, Worker-, Schrift- und CMap-Dateien aktualisieren und die Tests erneut ausführen. Die Drittanbieter-Lizenzen befinden sich unter `vendor/pdfjs/`.

Die Tests prüfen HTML- und PDF-Textextraktion, PDF-Zugriffsfreigabe und Fehlerfälle, parallele Tab-Aufträge, Wiederherstellung laufender Streams, gezielten Abbruch, lange Quellen, API-Fehler, Ergebnis-Zwischenspeicherung und sichere Markdown-Darstellung. Sie verwenden ausschließlich Testantworten und benötigen keinen API-Key. `npm run check` prüft Manifest, benötigte Dateien und JavaScript-Syntax. Der lokale PDF-Worker wurde zusätzlich in einer Browser-Vorschau geprüft.

Für eine ZIP-Datei mit ausschließlich den installierbaren Extension-Dateien unter Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package.ps1
```

Ergebnis: `dist/chrome-site-summary.zip`. Zum Laden in Chrome zuerst entpacken.

## Aufbau

- `background.js`: Seitenleiste konfigurieren, Zugriff auf lokale Daten beschränken und erneute Freigaben des aktuellen Tabs melden.
- `cache.js`: Dauerhafte Zusammenfassungen nach URL speichern, wiederfinden, begrenzen und löschen.
- `sidepanel.html` / `sidepanel.js`: Manueller Ablauf, Status, Abbrechen, Kopieren und Tab-Zuordnung.
- `extract.js`: Hauptinhalt im isolierten Kontext der aktuellen Seite auslesen.
- `pdf.js` / `vendor/pdfjs/`: PDF-Dateien laden und deren Text lokal mit PDF.js auslesen.
- `openrouter.js`: Streaming-Client und mehrstufige Verarbeitung langer Texte.
- `options.html` / `options.js` / `settings.js`: Setup und lokales Speichern.
- `render.js`: Sichere Darstellung eines kleinen Markdown-Umfangs.

Die API-Anfragen laufen direkt in der vertrauenswürdigen Seitenleiste. Damit hängen lange Zusammenfassungen nicht von der Laufzeit des Background-Service-Workers ab. Beim Schließen der Seitenleiste werden laufende Anfragen beendet; bereits verarbeitete Anfragen können weiterhin berechnet werden.

Die erste Version wurde automatisiert und mit lokalen Testantworten in einer Browser-Vorschau geprüft. Ein vollständiger Praxistest als installierte Chrome-Extension mit einem echten OpenRouter API-Key steht noch aus.
