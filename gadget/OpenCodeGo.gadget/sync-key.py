# sync-key.py - holt den OpenCode-Go-Schluessel aus dem OpenCode-Credential-Store
# und legt ihn in %USERPROFILE%\.config\opencode\go-usage.key ab.
#
# Quelle: %USERPROFILE%\.local\share\opencode\opencode.db, Tabelle credential,
#         integration_id = 'opencode-go' (Wert ist JSON mit dem Schluessel).
# Pruefung: GET https://opencode.ai/inference/go/v1/usage mit User-Agent.
#           Ohne User-Agent antwortet der Endpunkt mit 403.
#
# Aufruf: python sync-key.py   (Exit 0 = gueltiger Schluessel liegt in der Datei)
# Der Schluessel wird nie ausgegeben.

import os
import re
import sqlite3
import sys
import urllib.request
import urllib.error

DB = os.path.expanduser("~/.local/share/opencode/opencode.db")
OUT = os.path.expanduser("~/.config/opencode/go-usage.key")
URL = "https://opencode.ai/inference/go/v1/usage"
UA = "go-usage-gadget/1.2"


def read_key_from_store():
    if not os.path.exists(DB):
        return None
    uri = "file:%s?mode=ro" % DB.replace("\\", "/")
    con = sqlite3.connect(uri, uri=True)
    try:
        row = con.execute(
            "select value from credential where integration_id='opencode-go' order by active desc limit 1"
        ).fetchone()
    finally:
        con.close()
    if not row or not row[0]:
        return None
    val = row[0] if isinstance(row[0], str) else str(row[0])
    m = re.search(r'"?(?:key|token|apiKey|api_key|secret)"?\s*[:=]\s*"([^"]{16,})"', val)
    if m:
        return m.group(1)
    v = val.strip()
    return v if 20 < len(v) < 200 and "\n" not in v else None


def is_valid(key):
    req = urllib.request.Request(URL, headers={"Authorization": "Bearer " + key,
                                               "Accept": "application/json",
                                               "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status == 200
    except urllib.error.HTTPError:
        return False
    except Exception:
        return False


def current():
    if not os.path.exists(OUT):
        return None
    with open(OUT, "r", encoding="utf-8") as f:
        return f.read().strip()


def main():
    key = read_key_from_store()
    if not key:
        print("kein Schluessel im Credential-Store")
        return 1
    if not is_valid(key):
        print("Schluessel im Store wird abgelehnt")
        return 1
    if current() == key:
        print("Schluessel unveraendert")
        return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        f.write(key)
    print("Schluessel aktualisiert (%d Zeichen)" % len(key))
    return 0


if __name__ == "__main__":
    sys.exit(main())
