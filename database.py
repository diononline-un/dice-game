import sqlite3
import os
import datetime as dt
from contextlib import asynccontextmanager

DB_DIR = os.environ.get("DB_DIR", os.path.join(os.path.dirname(__file__), "data"))
DB_PATH = os.path.join(DB_DIR, "dice.db")

os.makedirs(DB_DIR, exist_ok=True)


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_connection()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task TEXT,
            rolled_minutes INTEGER NOT NULL,
            total_seconds INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            progress_percent INTEGER,
            satisfaction_rating INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            completed_at TEXT,
            cancelled_at TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)
    conn.execute("""
        INSERT OR IGNORE INTO config (key, value)
        VALUES ('enabled_minutes', '[10,20,30,40,50,60]')
    """)
    conn.commit()
    conn.close()


def create_session(task, rolled_minutes, total_seconds):
    conn = get_connection()
    cur = conn.execute(
        "INSERT INTO sessions (task, rolled_minutes, total_seconds, status) VALUES (?, ?, ?, 'active')",
        (task, rolled_minutes, total_seconds),
    )
    session_id = cur.lastrowid
    row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
    conn.commit()
    conn.close()
    return dict(row)


def get_active_session():
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM sessions WHERE status = 'active' ORDER BY id DESC LIMIT 1"
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def complete_session(session_id, progress_percent, satisfaction_rating):
    conn = get_connection()
    conn.execute(
        "UPDATE sessions SET status = 'completed', progress_percent = ?, satisfaction_rating = ?, completed_at = datetime('now') WHERE id = ?",
        (progress_percent, satisfaction_rating, session_id),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
    conn.close()
    return dict(row)


def cancel_session(session_id):
    conn = get_connection()
    conn.execute(
        "UPDATE sessions SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ?",
        (session_id,),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
    conn.close()
    return dict(row)


def get_session_history(limit=50, offset=0):
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM sessions ORDER BY created_at DESC LIMIT ? OFFSET ?",
        (limit, offset),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_config(key):
    conn = get_connection()
    row = conn.execute("SELECT value FROM config WHERE key = ?", (key,)).fetchone()
    conn.close()
    return row["value"] if row else None


def set_config(key, value):
    conn = get_connection()
    conn.execute(
        "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", (key, value)
    )
    conn.commit()
    conn.close()
