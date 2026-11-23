#!/usr/bin/env python3
"""Go-Usage-Widget: zeigt die drei OpenCode-Go-Limits (5 h, Woche, Monat).

Datenquelle: GET https://opencode.ai/inference/go/v1/usage
Der API-Key wird aus der OpenCode-Datenbank gelesen (Integration "opencode-go")
oder aus der Umgebungsvariable OPENCODE_GO_KEY. Er wird nie ausgegeben.

Aufruf:
    python go_usage.py            # Fenster
    python go_usage.py --print    # Werte in der Konsole (Test)
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API_URL = "https://opencode.ai/inference/go/v1/usage"
REFRESH_SECONDS = 60
USER_AGENT = "go-usage-widget/1.0"
DB_PATH = Path(os.path.expanduser(r"~\.local\share\opencode\opencode.db"))


# ---------------------------------------------------------------- Key

def read_key() -> str | None:
    """Liest den Go-Key. Reihenfolge: Env, Datei, OpenCode-DB."""
    env = os.environ.get("OPENCODE_GO_KEY", "").strip()
    if env:
        return env

    key_file = Path(os.path.expanduser(r"~\.config\opencode\go-usage.key"))
    if key_file.is_file():
        text = key_file.read_text(encoding="utf-8").strip()
        if text:
            return text

    if not DB_PATH.is_file():
        return None

    try:
        con = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True, timeout=2)
        try:
            row = con.execute(
                "select value from credential "
                "where integration_id = 'opencode-go' and active = 1 "
                "order by time_updated desc limit 1"
            ).fetchone()
        finally:
            con.close()
    except sqlite3.Error:
        return None
    return row[0] if row and row[0] else None


# ---------------------------------------------------------------- API

def fetch_usage() -> dict:
    key = read_key()
    if not key:
        raise RuntimeError("Kein Go-Key gefunden")

    req = urllib.request.Request(
        API_URL,
        headers={
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            raise RuntimeError(
                "Key abgelehnt (401) — Go-API-Key in "
                r"~\.config\opencode\go-usage.key legen"
            ) from exc
        raise
    usage = data.get("usage") or data
    return usage


def remaining(iso: str | None) -> str:
    if not iso:
        return ""
    try:
        target = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return ""
    seconds = int((target - datetime.now(timezone.utc)).total_seconds())
    if seconds <= 0:
        return "jetzt"
    days, rest = divmod(seconds, 86400)
    hours, rest = divmod(rest, 3600)
    minutes = rest // 60
    if days:
        return f"in {days}d {hours}h"
    if hours:
        return f"in {hours}h {minutes}m"
    return f"in {minutes}m"


ROWS = (
    ("rolling", "5 Stunden"),
    ("weekly", "Woche"),
    ("monthly", "Monat"),
)


# ---------------------------------------------------------------- GUI

def run_gui() -> None:
    import tkinter as tk

    bg, fg, muted = "#121212", "#f2f2f2", "#8a8a8a"
    bar_bg = "#2a2a2a"

    root = tk.Tk()
    root.title("OpenCode Go")
    root.configure(bg=bg)
    root.geometry("330x150")
    root.minsize(300, 140)
    root.attributes("-topmost", False)

    status = tk.Label(root, text="lade …", bg=bg, fg=muted, anchor="w",
                      font=("Segoe UI", 8))
    status.pack(fill="x", padx=12, pady=(8, 0))

    widgets: dict[str, dict] = {}
    for key, label in ROWS:
        frame = tk.Frame(root, bg=bg)
        frame.pack(fill="x", padx=12, pady=(6, 0))

        caption = tk.Label(frame, text=label, bg=bg, fg=fg, anchor="w",
                           font=("Segoe UI", 9))
        caption.pack(fill="x")

        canvas = tk.Canvas(frame, height=8, bg=bar_bg, highlightthickness=0, bd=0)
        canvas.pack(fill="x", pady=(3, 0))

        detail = tk.Label(frame, text="", bg=bg, fg=muted, anchor="w",
                          font=("Segoe UI", 8))
        detail.pack(fill="x")

        bar = canvas.create_rectangle(0, 0, 0, 8, fill="#4caf50", width=0)
        widgets[key] = {"canvas": canvas, "bar": bar, "detail": detail, "pct": 0.0}

    def color_for(pct: float, limited: bool) -> str:
        if limited or pct >= 90:
            return "#e05252"
        if pct >= 70:
            return "#e0b84c"
        return "#4caf50"

    def apply(usage: dict) -> None:
        for key, _ in ROWS:
            entry = widgets[key]
            item = usage.get(key) or {}
            pct = float(item.get("percent") or 0)
            limited = item.get("status") == "rate-limited"
            entry["pct"] = pct
            entry["detail"].configure(
                text=f"{pct:.0f} % genutzt · frei {remaining(item.get('resetsAt'))}",
            )
            canvas = entry["canvas"]
            width = max(canvas.winfo_width(), 1)
            canvas.coords(entry["bar"], 0, 0, width * min(pct, 100) / 100.0, 8)
            canvas.itemconfigure(entry["bar"], fill=color_for(pct, limited))

    def refresh() -> None:
        try:
            usage = fetch_usage()
        except (urllib.error.URLError, TimeoutError, RuntimeError, ValueError) as exc:
            status.configure(text=f"Fehler: {exc}", fg="#e05252")
            root.after(REFRESH_SECONDS * 1000, refresh)
            return
        apply(usage)
        status.configure(text=f"Stand {time.strftime('%H:%M:%S')}", fg=muted)
        root.after(REFRESH_SECONDS * 1000, refresh)

    def start() -> None:
        threading.Thread(target=refresh, daemon=True).start()

    root.after(200, start)
    root.mainloop()


# ---------------------------------------------------------------- CLI

def run_print() -> int:
    try:
        usage = fetch_usage()
    except Exception as exc:  # noqa: BLE001 - CLI soll die Ursache zeigen
        print(f"FEHLER: {exc}")
        return 1
    for key, label in ROWS:
        item = usage.get(key) or {}
        print(f"{label:10} {item.get('percent', 0):>3}%  {item.get('status', '')}"
              f"  {remaining(item.get('resetsAt'))}")
    return 0


if __name__ == "__main__":
    sys.exit(run_print() if "--print" in sys.argv else run_gui())
