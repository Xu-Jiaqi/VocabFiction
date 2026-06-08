#!/usr/bin/env python3
"""Build the bundled mobile WordSense SQLite database from ELBackend JSON."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "ELBackend" / "data" / "WordSenseDB.json"
DEST = ROOT / "assets" / "word_sense_mobile.db"


def main() -> None:
    with SOURCE.open(encoding="utf-8") as f:
        data = json.load(f)

    if DEST.exists():
        DEST.unlink()

    conn = sqlite3.connect(DEST)
    try:
        conn.execute("PRAGMA journal_mode = OFF;")
        conn.execute("PRAGMA synchronous = OFF;")
        conn.execute(
            """
            CREATE TABLE word_senses (
              word TEXT NOT NULL,
              sense_id TEXT NOT NULL,
              meaning TEXT NOT NULL,
              sense_order INTEGER NOT NULL,
              is_polysemous INTEGER NOT NULL,
              PRIMARY KEY (word, sense_id)
            );
            """,
        )

        rows: list[tuple[str, str, str, int, int]] = []
        for word, entry in data.items():
            normalized = word.strip().lower()
            if not normalized:
                continue
            is_polysemous = 1 if entry.get("is_polysemous") else 0
            for index, sense in enumerate(entry.get("senses") or []):
                sense_id = str(sense.get("id") or "").strip()
                meaning = str(sense.get("meaning") or "").strip()
                if not sense_id:
                    continue
                rows.append((normalized, sense_id, meaning, index, is_polysemous))

                if len(rows) >= 10_000:
                    conn.executemany(
                        "INSERT INTO word_senses VALUES (?, ?, ?, ?, ?)",
                        rows,
                    )
                    rows.clear()

        if rows:
            conn.executemany("INSERT INTO word_senses VALUES (?, ?, ?, ?, ?)", rows)

        conn.execute("CREATE INDEX idx_word_senses_word ON word_senses(word);")
        count = conn.execute("SELECT COUNT(*) FROM word_senses").fetchone()[0]
        word_count = conn.execute("SELECT COUNT(DISTINCT word) FROM word_senses").fetchone()[0]
        conn.execute(
            """
            CREATE TABLE metadata (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );
            """,
        )
        conn.executemany(
            "INSERT INTO metadata VALUES (?, ?)",
            [
                ("source", str(SOURCE.relative_to(ROOT))),
                ("word_count", str(word_count)),
                ("sense_count", str(count)),
            ],
        )
        conn.commit()
        conn.execute("VACUUM;")
    finally:
        conn.close()

    print(f"Wrote {DEST} ({DEST.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
