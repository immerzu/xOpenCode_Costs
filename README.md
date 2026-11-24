# xOpenCode Costs

DeepSeek-Guthaben und Tageskosten als Badge in der Titelzeile von OpenCode Desktop.
Portierung der Anzeige aus dem Userscript [`xDSH Costs`](../xDSH_Costs) auf OpenCode.

Aufbau: grüner Punkt · 💳 · `$20.30` · `heute $1.84` · 🔥 in Peak-Zeiten.

## Datenquelle

Zwei **private** Dashboard-Endpunkte der DeepSeek-Platform-Web-Session:

| Zweck | Aufruf |
|---|---|
| Guthaben | `GET https://platform.deepseek.com/api/v0/users/get_user_summary` → `normal_wallets` (topped-up), `bonus_wallets` (Gratis) |
| Tages-/Monatskosten | `GET https://platform.deepseek.com/api/v0/usage/cost?month=M&year=YYYY` |

Authentifizierung ist der **Login-Token der Platform-Web-Session** (`localStorage.userToken`), nicht der
API-Schlüssel: mit dem API-Schlüssel antworten beide Endpunkte `code 40003 "invalid token"`.

## Token und Schlüssel (seit 24.11.2026 automatisch)

Beide Gadgets holen ihre Zugangsdaten selbst; von Hand eintragen ist nur noch der Notfallweg.

| Datei | Inhalt | Quelle | Skript |
|---|---|---|---|
| `~\.config\opencode\secrets\deepseek-platform-token` | DeepSeek-Web-Session-Token | `localStorage.userToken` im Browser | `sync-token.ps1` |
| `~\.config\opencode\go-usage.key` | OpenCode-Go-API-Schlüssel | `opencode.db`, Tabelle `credential`, `integration_id='opencode-go'` | `sync-key.py` |

Beide Skripte laufen nur, wenn die Datei fehlt oder der Server den Wert ablehnt (`40002`/`40003` bzw. HTTP 403).
`sync-token.ps1` liest die Local-Storage-LevelDB der Browser-Profile mit `FileShare.ReadWrite`;
`sync-key.py` liest die SQLite-Datenbank read-only und prüft den Schlüssel gegen
`https://opencode.ai/inference/go/v1/usage` (dort ist ein **User-Agent** Pflicht, ohne ihn: 403).

Fallback von Hand: `platform.deepseek.com` öffnen, `localStorage.getItem('userToken')` ausführen und den Wert
in die Token-Datei schreiben. Läuft die Web-Session ab, hilft nur eine neue Anmeldung im Browser.

**Zugangsdaten gehören nie ins Repo.** Die Dateien liegen außerhalb des Projekts.

## Anzeige

- **Grüner Punkt** — Daten frisch · **rot** — Token fehlt/ungültig oder Fehler.
- **💳 $20.30 · heute $1.84** — topped-up und Tageskosten; `--` bedeutet unbekannt.
- **🔥** — gerade Peak-Zeit (Mo–Fr 01:00–04:00 und 06:00–10:00 UTC, ohne chinesische Feiertage).
- **Tooltip** — Guthaben gesamt, Gratisanteil, Monatskosten, Alter der Daten.
- **Klick** — öffnet `platform.deepseek.com/usage`.
- Aktualisierung alle 5 Minuten.

Die Kostenanzeige der Sitzung oben rechts bleibt unverändert; das Badge steht daneben.

## Gadgets (Windows Sidebar)

| Gadget | Anzeige | Dateien |
|---|---|---|
| `DeepSeekCosts.gadget` | Guthaben + Tageskosten DeepSeek | `xDSH_Costs\gadget\DeepSeekCosts.gadget` |
| `OpenCodeGo.gadget` | 5 h / Woche / Monat, Credits + Kosten, Stunden-Diagramm | `xOpenCode_Costs\gadget\OpenCodeGo.gadget` |

`OpenCodeGo.gadget` ist 130 × 136 px (Logikmaß) und besteht aus vier Blöcken: drei Auslastungszeilen,
einer Zeile **Credits** (links) und **Kosten** (rechts, Tageswert), dem Balkendiagramm der Stunden
06–20 Uhr und darunter der Achse. Fährt man über einen Balken, erscheinen unter der Achse Uhrzeit und
Betrag dieser Stunde; ohne Maus bleibt die Zeile leer.

- `index.html` — Anzeige (ES3-JavaScript der Sidebar-Engine)
- `chart.ps1` — holt die Stundenwerte und zeichnet `src\chartA.png` / `src\chartB.png` (abwechselnd,
  weil die Sidebar Bilder cached) sowie `src\chart.json` mit den Summen
- `sync-key.py` — holt den Go-Schlüssel aus `opencode.db` nach `~\.config\opencode\go-usage.key`
- `make-backgrounds.ps1` — erzeugt die drei Hintergründe (normal/warn/alert) in der benötigten Höhe

`src\chart*.png` und `src\chart.json` sind Laufzeit-Artefakte und werden nicht versioniert.

Installiert unter `%LOCALAPPDATA%\Microsoft\Windows Sidebar\Gadgets\`. Sicherungen liegen als ZIP in
`E:\Sicherheit\!Windows_11\Widget` (`DeepSeekCosts.gadget`, `OpenCodeGo.gadget`; ohne Datum, eine neue
Sicherung überschreibt die vorige).

Nach Änderungen an einer Gadget-Datei muss die Sidebar neu laden, sonst zeigt sie die alte Fassung aus
dem Internet-Cache:

```powershell
Stop-Process -Name sidebar -Force
RunDll32.exe InetCpl.cpl,ClearMyTracksByProcess 8
Start-Process 'C:\Program Files\Windows Sidebar\sidebar.exe'
```

## Bauen

```powershell
$env:Path = 'F:\001_Coding_Projekte\Zusatzprogramme\node-v24.22.2-win-x64;' + $env:Path
npm install
npm run build      # → dist/gui-experimental.cjs
npm test           # Parser- und Peak-Regeln
```

Eingetragen ist das Plugin in `~\.config\opencode\opencode.jsonc`:

```jsonc
"plugins": ["F:\\001_Coding_Projekte\\xOpenCode_Costs"],
```

Nach Änderungen am Code genügt ein Rebuild (`npm run build -- --watch`); die Fenster laden das GUI
neu. **Ein neu eingetragenes Plugin** erscheint erst nach einem Neustart der App.

## Aufbau

| Datei | Inhalt |
|---|---|
| `src/deepseek.mjs` | reine Funktionen (Parser, Peak-/Feiertagsregeln), von Tests und Bundle genutzt |
| `src/contract.ts` | IPC-Vertrag zwischen Fenster und Hauptprozess |
| `src/gui.tsx` | Badge in der Titelzeile (`setup`) und Abruf im Hauptprozess (`main`) |
| `test/parse.test.mjs` | 18 Prüfungen der reinen Funktionen |

## Status (19.11.2026)

**Die Anzeige erscheint derzeit nicht** — nicht wegen dieses Codes, sondern weil OpenCode Desktop 2.3.2 unter
Windows den Fenster-Teil eines Plugins nicht abruft.

- Belegt: Plugin `active`, `features.gui: true`, `/api/plugin/gui?id=xc-costs` liefert das Bundle — die App
  fragt es aber **nie** an (im Dienstverkehr nur `/api/event`, `/api/rpc/…`, `/api/fs/list`).
- Gemeldet: [anomalyco/opencode#64866](https://github.com/anomalyco/opencode/issues/64866); Sammelstellen
  #56037, #60976, #63990.
- Installation als Git-Paket scheiterte zunächst an #49704 (jedes Paket mit `build`-Skript). Deshalb heißen
  die Skripte hier `make` und `check` — **nicht** zurückbenennen.

Das Plugin ist installiert und bleibt eingetragen; sobald der Fehler behoben ist, sollte das Badge ohne
weitere Änderung erscheinen.

**Stillgelegt am 19.11.2026:** Der Eintrag in `opencode.jsonc` ist auskommentiert (`plugin list` meldet „No plugins
found"). Das Paket bleibt im Cache installiert. Wiedereinschalten: die kommentierte Zeile
`"plugins": ["git+https://github.com/immerzu/xOpenCode_Costs.git"],` einkommentieren und OpenCode neu starten.

## Bekannte Grenzen

- Die Endpunkte sind **privat** und können sich ohne Vorwarnung ändern (gleiches Risiko wie im Userscript).
- Peak-Zeiten sind lokal berechnet; der amtliche chinesische Feiertagsplan für 2026 steht in
  `src/deepseek.mjs` und muss für neue Jahre ergänzt werden.
- Nur DeepSeek. Andere Anbieter haben kein vergleichbares Guthaben-Modell.
