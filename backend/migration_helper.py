"""
数据库迁移辅助脚本 - 第二阶段
运行方式：cd backend && python -X utf8 migration_helper.py
"""
import sqlite3
import shutil
import sys
from pathlib import Path


def get_db_path():
    candidates = [
        Path("siteoptimizer.db"),
        Path("../siteoptimizer.db"),
        Path("app/siteoptimizer.db"),
    ]
    for p in candidates:
        if p.exists():
            return str(p)
    env_file = Path(".env")
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.startswith("DATABASE_URL"):
                url = line.split("=", 1)[1].strip().strip('"')
                if "///" in url:
                    db_path = url.split("///", 1)[1].lstrip("./")
                    if Path(db_path).exists():
                        return db_path
    return None


def get_table_columns(cursor, table_name):
    cursor.execute(f"PRAGMA table_info({table_name})")
    return {row[1] for row in cursor.fetchall()}


def get_indexes(cursor, table_name):
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name=?",
        (table_name,)
    )
    return {row[0] for row in cursor.fetchall()}


def get_tables(cursor):
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    return {row[0] for row in cursor.fetchall()}


def run_migration():
    db_path = get_db_path()
    if not db_path:
        print("[ERROR] Cannot find database file. Run from backend/ directory.")
        sys.exit(1)

    print(f"[OK] Database: {db_path}")
    backup = db_path + ".bak"
    shutil.copy2(db_path, backup)
    print(f"[OK] Backed up to: {backup}")

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = OFF")
    cursor = conn.cursor()
    migrations = []
    tables = get_tables(cursor)

    # ── Migration 1: Add website_id to urlrecord if missing ────────────────
    print("\n[1] Check urlrecord.website_id column...")
    url_cols = get_table_columns(cursor, "urlrecord")
    print(f"    Existing columns: {sorted(url_cols)}")

    if "website_id" not in url_cols:
        cursor.execute("ALTER TABLE urlrecord ADD COLUMN website_id INTEGER REFERENCES website(id)")
        print("    [OK] Added website_id column")
        migrations.append("urlrecord: added website_id column")
    else:
        print("    [SKIP] website_id already exists")

    # ── Migration 2: Fix urlrecord.url unique constraint ───────────────────
    print("\n[2] Fix URLRecord.url unique constraint...")
    url_indexes = get_indexes(cursor, "urlrecord")
    print(f"    Existing indexes: {sorted(url_indexes)}")

    # Drop old global unique index
    for idx in ("ix_urlrecord_url",):
        if idx in url_indexes:
            cursor.execute(f"DROP INDEX IF EXISTS {idx}")
            print(f"    [OK] Dropped: {idx}")

    # Create new composite unique index
    if "uq_url_website" not in url_indexes:
        cursor.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS uq_url_website
            ON urlrecord (url, website_id)
        """)
        print("    [OK] Created: uq_url_website (url, website_id)")
        migrations.append("urlrecord: (url, website_id) composite unique index")
    else:
        print("    [SKIP] uq_url_website already exists")

    # Keep non-unique url index for search performance
    if "ix_urlrecord_url" not in url_indexes and "ix_urlrecord_url" not in get_indexes(cursor, "urlrecord"):
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_urlrecord_url ON urlrecord (url)")
        print("    [OK] Created plain index: ix_urlrecord_url")

    # ── Migration 3: Create keywordsnapshot table ──────────────────────────
    print("\n[3] Create keywordsnapshot table...")
    if "keywordsnapshot" not in tables:
        cursor.execute("""
            CREATE TABLE keywordsnapshot (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url_id INTEGER NOT NULL REFERENCES urlrecord(id) ON DELETE CASCADE,
                keyword VARCHAR(500) NOT NULL,
                snapshot_date DATE NOT NULL,
                clicks INTEGER DEFAULT 0,
                impressions INTEGER DEFAULT 0,
                ctr FLOAT DEFAULT 0.0,
                position FLOAT DEFAULT 0.0,
                created_at DATETIME,
                UNIQUE(url_id, keyword, snapshot_date)
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_kw_keyword ON keywordsnapshot (keyword)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_kw_date ON keywordsnapshot (snapshot_date)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_kw_url_id ON keywordsnapshot (url_id)")
        print("    [OK] Created keywordsnapshot table")
        migrations.append("Created keywordsnapshot table")
    else:
        print("    [SKIP] keywordsnapshot already exists")

    # ── Migration 4: Create alertlog table ────────────────────────────────
    print("\n[4] Create alertlog table...")
    if "alertlog" not in tables:
        cursor.execute("""
            CREATE TABLE alertlog (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                alert_type VARCHAR(100) NOT NULL,
                message TEXT NOT NULL,
                website_id INTEGER REFERENCES website(id) ON DELETE SET NULL,
                channel VARCHAR(50) DEFAULT 'webhook',
                sent_at DATETIME NOT NULL
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_alertlog_type ON alertlog (alert_type)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_alertlog_sent_at ON alertlog (sent_at)")
        print("    [OK] Created alertlog table")
        migrations.append("Created alertlog table")
    else:
        print("    [SKIP] alertlog already exists")

    # ── Migration 5: Add keyword_snapshots indexes if urlrecord existed ────
    print("\n[5] Verifying snapshot table indexes...")
    snap_indexes = get_indexes(cursor, "performancesnapshot")
    print(f"    Snapshot indexes: {sorted(snap_indexes)}")

    conn.commit()
    conn.execute("PRAGMA foreign_keys = ON")
    conn.close()

    print(f"\n[DONE] Migration complete. {len(migrations)} change(s) applied:")
    for m in migrations:
        print(f"  - {m}")
    print("\nPlease restart the backend service to load the updated model configuration.")


if __name__ == "__main__":
    run_migration()
