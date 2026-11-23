#!/usr/bin/env python3
"""Go-Usage-Widget: dunkle Pille mit den drei OpenCode-Go-Limits.

Datenquelle: GET https://opencode.ai/inference/go/v1/usage
Key aus ~\\.config\\opencode\\go-usage.key, Env OPENCODE_GO_KEY oder OpenCode-DB.

Aufruf:
    python go_usage.py            # Pille (ohne Titelleiste)
    python go_usage.py --print    # Werte in der Konsole
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
USER_AGENT = "go-usage-widget/1.1"
DB_PATH = Path(os.path.expanduser(r"~\.local\share\opencode\opencode.db"))

BG = "#2e2e2e"
BORDER = "#454545"
FG = "#f2f2f2"
MUTED = "#c8c8c8"
GREEN, YELLOW, RED = "#3fbf5f", "#e0b84c", "#e05252"

ROWS = (("rolling", "5 h"), ("weekly", "Woche"), ("monthly", "Monat"))


# ---------------------------------------------------------------- Key

def read_key() -> str | None:
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
            raise RuntimeError("Key abgelehnt (401)") from exc
        raise
    return data.get("usage") or data


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
        return f"{days}d {hours}h"
    if hours:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


def color_for(pct: float, limited: bool) -> str:
    if limited or pct >= 90:
        return RED
    if pct >= 70:
        return YELLOW
    return GREEN


# ---------------------------------------------------------------- GUI

def run_gui() -> None:
    import tkinter as tk

    W, H = 200, 112
    PAD = 8
    ROW_H = (H - 2 * PAD) / 3

    root = tk.Tk()
    root.overrideredirect(True)
    root.configure(bg=BG)
    root.geometry(f"{W}x{H}+80+80")
    try:
        root.attributes("-alpha", 0.96)
    except tk.TclError:
        pass

    canvas = tk.Canvas(root, width=W, height=H, bg=BG, highlightthickness=0, bd=0)
    canvas.pack(fill="both", expand=True)

    def rounded(x1, y1, x2, y2, r, **kw):
        pts = [
            x1 + r, y1, x2 - r, y1, x2, y1, x2, y1 + r,
            x2, y2 - r, x2, y2, x2 - r, y2, x1 + r, y2,
            x1, y2, x1, y2 - r, x1, y1 + r, x1, y1,
        ]
        return canvas.create_polygon(pts, smooth=True, **kw)

    rounded(1, 1, W - 1, H - 1, 12, fill=BG, outline=BORDER, width=1)

    dots = []
    texts = []
    for index, (_, label) in enumerate(ROWS):
        cy = PAD + ROW_H * index + ROW_H / 2
        dots.append(canvas.create_oval(11, cy - 4, 19, cy + 4,
                                       fill=GREEN, outline=""))
        texts.append(
            canvas.create_text(
                25, cy, anchor="w", fill=FG, font=("Segoe UI", 9),
                text=f"{label}  …",
            )
        )

    status = canvas.create_text(W - 8, H - 6, anchor="e", fill=MUTED, font=("Segoe UI", 6), text="")

    def apply(usage: dict) -> None:
        for index, (key, label) in enumerate(ROWS):
            item = usage.get(key) or {}
            pct = float(item.get("percent") or 0)
            limited = item.get("status") == "rate-limited"
            canvas.itemconfigure(dots[index], fill=color_for(pct, limited))
            canvas.itemconfigure(
                texts[index],
                text=f"{label}  {pct:.0f} %  ·  {remaining(item.get('resetsAt'))}",
            )

    def refresh() -> None:
        try:
            usage = fetch_usage()
        except Exception as exc:  # noqa: BLE001 - Anzeige soll den Grund zeigen
            canvas.itemconfigure(status, text=f"Fehler: {exc}", fill=RED)
            root.after(REFRESH_SECONDS * 1000, lambda: threading.Thread(
                target=refresh, daemon=True).start())
            return
        apply(usage)
        canvas.itemconfigure(status,
                             text=f"Stand {time.strftime('%H:%M')}", fill=MUTED)
        root.after(REFRESH_SECONDS * 1000, lambda: threading.Thread(
            target=refresh, daemon=True).start())

    # Ziehen mit der Maus
    offset = {"x": 0, "y": 0}

    def press(event):
        offset["x"], offset["y"] = event.x, event.y

    def drag(event):
        root.geometry(f"+{event.x_root - offset['x']}+{event.y_root - offset['y']}")

    for widget in (root, canvas):
        widget.bind("<Button-1>", press)
        widget.bind("<B1-Motion>", drag)

    # Rechtsklick: aktualisieren / beenden
    menu = tk.Menu(root, tearoff=0)
    menu.add_command(label="Aktualisieren",
                     command=lambda: threading.Thread(
                         target=refresh, daemon=True).start())
    menu.add_command(label="Beenden", command=root.destroy)

    def popup(event):
        try:
            menu.tk_popup(event.x_root, event.y_root)
        finally:
            menu.grab_release()

    for widget in (root, canvas):
        widget.bind("<Button-3>", popup)

    threading.Thread(target=refresh, daemon=True).start()
    root.mainloop()


# ---------------------------------------------------------------- CLI

def run_print() -> int:
    try:
        usage = fetch_usage()
    except Exception as exc:  # noqa: BLE001
        print(f"FEHLER: {exc}")
        return 1
    for key, label in ROWS:
        item = usage.get(key) or {}
        print(f"{label:10} {item.get('percent', 0):>3}%  {item.get('status', '')}"
              f"  {remaining(item.get('resetsAt'))}")
    return 0


if __name__ == "__main__":
    sys.exit(run_print() if "--print" in sys.argv else run_gui())



