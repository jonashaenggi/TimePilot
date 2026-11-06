# TimePilot

Ein persönliches Lerncockpit für Wochenplanung, Aufgaben, Prüfungen und fokussiertes Lernen. Die neue Web-App entsteht unter `web/`; die vorhandenen Java-/Gradle-Dateien bleiben als ursprüngliche Projektbasis erhalten.

## Web-App

Die Oberfläche verwendet React, TypeScript und Vinext. Lernstände werden lokal im Browser gespeichert. Der Obsidian-Import liest ausgewählte Markdown-Dateien im Browser; persönliche Vault-Inhalte werden weder im Repository gespeichert noch an einen Server übertragen.

```sh
cd web
pnpm install
pnpm dev
```

Voraussetzungen: Node.js 24 und pnpm 11.25.0.

```sh
pnpm test
pnpm exec tsc --noEmit
pnpm build
```

## Daten und Gerätewechsel

- Beim ersten Öffnen werden deutlich markierte Beispieldaten gezeigt. Ein leerer persönlicher Lernraum enthält keine erfundenen Leistungen oder Lernfehler.
- Über das Wissensnetz kann ein Obsidian-Vault ausgewählt werden. Fachübersichten, persönliche Prüfungstermine und ausdrückliche Fehlertrainer-Register werden unterstützt. PDF-Inhalte werden nicht eingelesen.
- Aufgaben, Prüfungen und Lernblöcke sind editierbar. Geplante Blöcke, als erledigt markierte Blöcke und gemessene Fokuszeit sind getrennte Angaben.
- Browserdaten werden **nicht** über Git synchronisiert. Über Einstellungen ein JSON-Backup exportieren und auf dem anderen Gerät importieren. Ein Backup-Import ersetzt den aktuellen Stand nach Formatprüfung.
- Eine erneute Vault-Auswahl aktualisiert den eingelesenen Stand. Es gibt keine unbeaufsichtigte Dateiüberwachung, automatische Cloud-Synchronisierung oder Rückschreibfunktion nach Obsidian.
- Im privaten Browsermodus oder nach dem Löschen von Website-Daten können lokale Lernstände verloren gehen. Regelmäßig Backups exportieren.

## Prüfungen

Die Tests unter `web/lib` prüfen unter anderem echte Kalenderdaten, Wochenübergänge, Backup-Validierung, unbekannte Prüfungszeiten, Fachprioritäten, Dubletten und die Trennung zwischen persönlichen Lernfehlern und Korrekturen an Quellenmaterial.
