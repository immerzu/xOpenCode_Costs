# Go-Usage-Widget

Zeigt die drei OpenCode-Go-Limits als Balken: **5 Stunden**, **Woche**, **Monat** —
je Prozent und Restzeit. Aktualisiert jede Minute.

## Start

```powershell
C:\Python314\python.exe F:\001_Coding_Projekte\xOpenCode_Costs\widget\go_usage.py
```

Test ohne Fenster:

```powershell
C:\Python314\python.exe F:\001_Coding_Projekte\xOpenCode_Costs\widget\go_usage.py --print
```

## API-Key (einmalig)

Das Widget braucht einen **persönlichen API-Key** (`oc_sk_…`) aus der OpenCode-Console:

1. Console öffnen → Kontomenü → **Account** → **Personal API keys**
2. **Add API key** → Workspace wählen → Namen vergeben → **Create**
3. Den Key kopieren (er wird nur einmal angezeigt)
4. In diese Datei schreiben (eine Zeile, sonst nichts):

```
C:\Users\lolo\.config\opencode\go-usage.key
```

Alternativ die Umgebungsvariable `OPENCODE_GO_KEY` setzen. Der Key wird nie angezeigt
oder protokolliert.

## Quelle

`GET https://opencode.ai/inference/go/v1/usage` (Doku: `https://opencode.ai/docs/console/go/`).
Antwort: `rolling`, `weekly`, `monthly` mit `percent`, `status`, `resetsAt`.

## Hinweise

- Kein zusätzliches Paket nötig (nur Python-Standardbibliothek, tkinter).
- Ein falscher oder abgelaufener Key ergibt `401`; im Fenster erscheint dann ein roter Hinweis.
- Autostart: Verknüpfung auf `go_usage.py` in `shell:startup` legen (optional).
