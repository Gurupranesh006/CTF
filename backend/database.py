import sqlite3
import os
from contextlib import contextmanager

DB_NAME = os.getenv("DB_PATH", "ctf.db")

def init_db():
    parent = os.path.dirname(DB_NAME)
    if parent:
        os.makedirs(parent, exist_ok=True)
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    
    # Contest state
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS contest (
        id INTEGER PRIMARY KEY,
        is_active BOOLEAN NOT NULL DEFAULT 0,
        end_time DATETIME
    )
    ''')
    
    # Initialize contest state if empty
    cursor.execute('SELECT COUNT(*) FROM contest')
    if cursor.fetchone()[0] == 0:
        cursor.execute('INSERT INTO contest (id, is_active) VALUES (1, 0)')
        
    # Users (Students)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS user (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
    )
    ''')
    
    # Challenges (Questions)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS challenge (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        points INTEGER NOT NULL,
        flag TEXT NOT NULL,
        trim_spaces BOOLEAN NOT NULL DEFAULT 0,
        ignore_case BOOLEAN NOT NULL DEFAULT 0,
        file_path TEXT,
        category TEXT NOT NULL DEFAULT 'web',
        difficulty TEXT NOT NULL DEFAULT 'hard',
        target_url TEXT,
        reference_url TEXT
    )
    ''')

    for column, definition in (
        ("category", "TEXT NOT NULL DEFAULT 'web'"),
        ("difficulty", "TEXT NOT NULL DEFAULT 'hard'"),
        ("target_url", "TEXT"),
        ("reference_url", "TEXT"),
    ):
        try:
            cursor.execute(f"ALTER TABLE challenge ADD COLUMN {column} {definition}")
        except sqlite3.OperationalError:
            pass
    
    # Submissions
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS submission (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        challenge_id INTEGER NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_correct BOOLEAN NOT NULL,
        submitted_flag TEXT DEFAULT '',
        FOREIGN KEY(user_id) REFERENCES user(id),
        FOREIGN KEY(challenge_id) REFERENCES challenge(id)
    )
    ''')
    
    # Migration: add submitted_flag column if missing (for existing DBs)
    try:
        cursor.execute("ALTER TABLE submission ADD COLUMN submitted_flag TEXT DEFAULT ''")
    except Exception:
        pass  # Column already exists
    
    conn.commit()
    conn.close()

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()
