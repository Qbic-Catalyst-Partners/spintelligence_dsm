"""
db/postgres.py
==============
PostgreSQL persistence layer for HVI OCR records.

- Reads DATABASE_URL from environment (loaded from .env)
- Falls back to a clear error message if DB is unavailable
- Does NOT crash the app — OCR still works without a DB connection
"""

import json
import logging
import os
from typing import Dict, Optional

logger = logging.getLogger("db.postgres")


def _get_conn():
    """Return a psycopg2 connection using DATABASE_URL env var."""
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        raise RuntimeError(
            "DATABASE_URL environment variable not set. "
            "Add it to your .env file: DATABASE_URL=postgresql://user:pass@host:5432/dbname"
        )
    try:
        import psycopg2
        return psycopg2.connect(url)
    except ImportError:
        raise RuntimeError(
            "psycopg2 not installed. Run: pip install psycopg2-binary"
        )
    except Exception as e:
        raise RuntimeError(f"Cannot connect to PostgreSQL: {e}") from e


CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS hvi_records (
    id           SERIAL PRIMARY KEY,
    doc_type     TEXT DEFAULT 'hvi',
    filename     TEXT,
    ocr_json     JSONB,
    manual_json  JSONB,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);
"""


def init_db() -> None:
    """Create hvi_records table if it doesn't exist. Safe to call multiple times."""
    try:
        conn = _get_conn()
        with conn:
            with conn.cursor() as cur:
                cur.execute(CREATE_TABLE_SQL)
                try:
                    cur.execute("ALTER TABLE hvi_records ADD COLUMN IF NOT EXISTS doc_type TEXT DEFAULT 'hvi';")
                except Exception:
                    pass
        conn.close()
        logger.info("[DB] PostgreSQL table hvi_records is ready.")
    except Exception as e:
        logger.warning(f"[DB] Could not initialize PostgreSQL: {e}")


def save_record(
    filename: str,
    ocr_json: list,
    manual_json: list,
    doc_type: str = "hvi",
) -> int:
    """
    Insert a new HVI/AFIS record.

    Args:
        filename:    Uploaded filename
        ocr_json:    Auto-extracted field values (list of dicts)
        manual_json: Final user-confirmed/edited values (list of dicts)
        doc_type:    "hvi" or "afis"

    Returns:
        New record ID

    Raises:
        RuntimeError if DB is unavailable
    """
    conn = _get_conn()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO hvi_records (doc_type, filename, ocr_json, manual_json)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        doc_type,
                        filename,
                        json.dumps(ocr_json),
                        json.dumps(manual_json),
                    ),
                )
                record_id = cur.fetchone()[0]
        conn.close()
        logger.info(f"[DB] Saved {doc_type.upper()} record id={record_id} for '{filename}'.")
        return record_id
    except Exception as e:
        conn.close()
        raise RuntimeError(f"DB insert failed: {e}") from e


def get_recent(limit: int = 20) -> list:
    """Retrieve recent records for the history panel."""
    try:
        conn = _get_conn()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, filename, created_at, doc_type FROM hvi_records "
                "ORDER BY created_at DESC LIMIT %s",
                (limit,),
            )
            rows = cur.fetchall()
        conn.close()
        return [{"id": r[0], "filename": r[1], "created_at": str(r[2])} for r in rows]
    except Exception as e:
        logger.warning(f"[DB] get_recent failed: {e}")
        return []
