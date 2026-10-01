# Chrome Site Summary

Chrome-Extension, die den Hauptinhalt der aktuellen Webseite auf Deutsch über OpenRouter zusammenfasst. Die Ausgabe erscheint in der Chrome-Seitenleiste: kurzer Überblick und 5–10 zentrale Punkte, sofern die Quelle genügend Inhalt bietet.

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

1. Eine normale Webseite öffnen und vollständig laden lassen.
2. Auf das Extension-Icon klicken, um die Seitenleiste zu öffnen und den Zugriff auf diesen Tab zu erlauben.
3. **Seite zusammenfassen** drücken.
4. Die Zusammenfassung lesen, **Kopieren** oder **Erneut zusammenfassen** wählen.

Erfasst wird der Hauptinhalt der gesamten bereits geladenen Seite, einschließlich Text unterhalb des sichtbaren Bildschirmbereichs. Navigation, Werbung, Formulare und bekannte Cookie-Banner werden möglichst herausgefiltert. Versteckte Texte und bearbeitbare Eingabebereiche werden übersprungen. Es wird nichts automatisch gescrollt oder nachgeladen.

Die Ausgabe ist immer auf Deutsch. Es gibt keine Rückfragen und keinen Chat. Das Ergebnis bleibt für den jeweiligen Tab während der Browser-Sitzung zwischengespeichert. Beim Neuladen oder Navigieren wird es verworfen. Ein Tabwechsel bricht eine laufende Verarbeitung ab und zeigt das Ergebnis des neu ausgewählten Tabs, sofern vorhanden. Nach Änderungen einer dynamischen Seite ohne Navigation kann eine vorhandene Zusammenfassung veraltet sein; dann **Erneut zusammenfassen** wählen.

Falls nach einem Tabwechsel kein Zugriff besteht, auf der gewünschten Webseite erneut das Extension-Icon anklicken und die Seitenleiste gegebenenfalls wieder öffnen.

## OpenRouter-Setup

- **API-Key:** Eigenen Key unter [OpenRouter API Keys](https://openrouter.ai/settings/keys) erstellen.
- **Modell-ID:** Exakte ID aus dem [OpenRouter-Modellkatalog](https://openrouter.ai/models) eingeben. Als Ausgangswert wird wie im YouTube Summarizer `anthropic/claude-sonnet-4.5` verwendet. Die Verfügbarkeit und Kosten des Modells bestimmt OpenRouter.
- **Verbindung testen:** Prüft die aktuell eingegebenen Werte mit einer kurzen echten Modellanfrage. Dabei können API-Kosten entstehen. Der Test speichert Änderungen nicht automatisch.

Ein leer gespeicherter API-Key entfernt den bisherigen Key. Eine leere Modell-ID setzt den Ausgangswert ein.

## Lange Seiten und Grenzen

- Texte bis 12.000 Zeichen werden direkt zusammengefasst.
- Längere Texte werden in Abschnitte aufgeteilt, einzeln verdichtet und zu einer Gesamtsynthese verbunden. Bei sehr langen Zwischenergebnissen folgt eine weitere Verdichtungsrunde. Dafür werden mehrere kostenpflichtige API-Anfragen benötigt.
- Über 120.000 Zeichen wird keine Anfrage gesendet. Die Extension bittet um eine kürzere Seite, statt den Hauptinhalt still abzuschneiden.
- PDF-, Bild-, Audio- und Videoauswertung, Inhalte in eingebetteten Frames und geschlossenen Shadow Roots sind nicht enthalten. Bei YouTube wird kein Transkript automatisch geöffnet; dafür bleibt der separate YouTube Summarizer zuständig.
- Chrome-interne Seiten und der Chrome Web Store erlauben keine normale Textextraktion durch diese Extension.
- Bei Layouts ohne eindeutig erkennbaren Artikel wird auf den bereinigten Seiteninhalt zurückgegriffen. Die Erkennung ist heuristisch und kann je nach Webseite Navigation oder andere Nebeninhalte enthalten.
- Paywalls werden nicht umgangen; nur zugänglicher, bereits geladener Text kann verarbeitet werden.

## Daten und Berechtigungen

Erst durch **Seite zusammenfassen** werden Seitentitel und extrahierter Hauptinhalt an OpenRouter und den gewählten Modellanbieter übertragen. Es gibt keinen eigenen Backend-Server und keine Analyse-Telemetrie.

Der API-Key liegt lokal in `chrome.storage.local`, wird nicht per Chrome-Sync synchronisiert und ist nur für vertrauenswürdige Extension-Komponenten zugänglich. Der Key wird nicht an die Webseite oder das Extraktionsskript übergeben. Lokale Chrome-Speicherung ist kein verschlüsselter Passworttresor. Der Rohtext wird nicht dauerhaft gespeichert; fertige Zusammenfassungen werden nur in `chrome.storage.session` gehalten und beim Browser-Neustart gelöscht.

Die Extension verwendet `activeTab`, `scripting`, `storage` und `sidePanel`. Der einzige dauerhaft erlaubte externe Host ist `https://openrouter.ai/*`. Für beliebige Webseiten gibt es keine pauschale dauerhafte Host-Berechtigung.

Seiteninhalte werden im Prompt als Quellenmaterial behandelt. Die Modellantwort wird mit DOM-Textknoten dargestellt; HTML und Skripte aus Antworten werden nicht ausgeführt. Zusammenfassungen können dennoch Fehler enthalten und ersetzen bei wichtigen Entscheidungen nicht die Originalquelle.

## Entwicklung und Prüfung

Node.js 22 ab Version 22.13 oder eine Version ab 24:

```sh
npm ci
npm test
npm run check
```

Die Tests prüfen Textextraktion einschließlich versteckter Inhalte und Text außerhalb des sichtbaren Bereichs, Streaming, lange Seiten, API-Fehler, Abbruch bei Tabwechsel, Ergebnis-Zwischenspeicherung und sichere Markdown-Darstellung. Sie verwenden ausschließlich Testantworten und benötigen keinen API-Key. `npm run check` prüft Manifest, benötigte Dateien und JavaScript-Syntax.

Für eine ZIP-Datei mit ausschließlich den installierbaren Extension-Dateien unter Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package.ps1
```

Ergebnis: `dist/chrome-site-summary.zip`. Zum Laden in Chrome zuerst entpacken.

## Aufbau

- `background.js`: Seitenleiste konfigurieren, Zugriff auf den Key beschränken und veraltete Tab-Ergebnisse entfernen.
- `sidepanel.html` / `sidepanel.js`: Manueller Ablauf, Status, Abbrechen, Kopieren und Tab-Zuordnung.
- `extract.js`: Hauptinhalt im isolierten Kontext der aktuellen Seite auslesen.
- `openrouter.js`: Streaming-Client und mehrstufige Verarbeitung langer Texte.
- `options.html` / `options.js` / `settings.js`: Setup und lokales Speichern.
- `render.js`: Sichere Darstellung eines kleinen Markdown-Umfangs.

Die API-Anfragen laufen direkt in der vertrauenswürdigen Seitenleiste. Damit hängen lange Zusammenfassungen nicht von der Laufzeit des Background-Service-Workers ab. Beim Schließen der Seitenleiste werden laufende Anfragen beendet; bereits verarbeitete Anfragen können weiterhin berechnet werden.

Die erste Version wurde automatisiert und mit lokalen Testantworten in einer Browser-Vorschau geprüft. Ein vollständiger Praxistest als installierte Chrome-Extension mit einem echten OpenRouter API-Key steht noch aus.
