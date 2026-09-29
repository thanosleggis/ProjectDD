import csv
from pathlib import Path
from typing import Dict, Optional

import mysql.connector
import traceback
from langdetect import detect

DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "123456",
    "database": "CourseAggregatorDB",
}

DATA_DIR = Path(__file__).resolve().parent / "data"

LANGUAGE_CODES = [
    ("en", "English"),
    ("es", "Spanish"),
    ("ru", "Russian"),
    ("el", "Greek"),
    ("zh", "Chinese"),
]

LEVEL_NORMALIZATION = {
    "beginner": "beginner",
    "introductory": "beginner",
    "beginner level": "beginner",
    "all levels": "beginner",
    "intermediate": "intermediate",
    "intermediate level": "intermediate",
    "mixed": "intermediate",
    "advanced": "advanced",
    "expert": "advanced",
    "expert level": "advanced",
}

DEFAULT_LEVEL_CODE = "beginner"

SEED_LEVELS = [
    ("beginner", "Beginner"),
    ("intermediate", "Intermediate"),
    ("advanced", "Advanced"),
]

MAX_COURSES_PER_SOURCE = 50


def get_db_connection():
    return mysql.connector.connect(**DB_CONFIG)


def detect_language_code(text: str) -> str:
    try:
        code = detect(text).lower()
        if code.startswith("zh"):
            return "zh"
        return code
    except Exception:
        return "en"


def ensure_levels(cursor):
    cursor.execute("SELECT COUNT(*) FROM levels")
    (count,) = cursor.fetchone()
    if count == 0:
        cursor.executemany(
            "INSERT INTO levels (code, display_name) VALUES (%s, %s)",
            SEED_LEVELS,
        )


def load_levels(cursor) -> Dict[str, int]:
    ensure_levels(cursor)
    cursor.execute("SELECT id, code, display_name FROM levels")
    rows = cursor.fetchall()
    lookup: Dict[str, int] = {}
    for row in rows:
        level_id, code, display_name = row
        lookup[code.lower()] = level_id
        lookup[display_name.lower()] = level_id
    if not lookup:
        raise RuntimeError("No levels found in database; seed the levels table first")
    return lookup


def ensure_languages(cursor):
    cursor.execute("SELECT COUNT(*) FROM languages")
    (count,) = cursor.fetchone()
    if count == 0:
        cursor.executemany(
            "INSERT INTO languages (code, name) VALUES (%s, %s)",
            LANGUAGE_CODES,
        )


def load_languages(cursor) -> Dict[str, int]:
    ensure_languages(cursor)
    cursor.execute("SELECT id, code, name FROM languages")
    rows = cursor.fetchall()
    lookup: Dict[str, int] = {}
    for row in rows:
        lang_id, code, name = row
        lookup[code.lower()] = lang_id
        lookup[name.lower()] = lang_id
    if not lookup:
        raise RuntimeError("No languages found in database; seed the languages table first")
    return lookup


def resolve_language_id(language_lookup: Dict[str, int], lang_code: str) -> int:
    return language_lookup.get(lang_code.lower(), language_lookup.get("en", next(iter(language_lookup.values()))))


def resolve_level_id(level_lookup: Dict[str, int], level_text: Optional[str]) -> int:
    key = (level_text or "").strip().lower()
    norm = LEVEL_NORMALIZATION.get(key, DEFAULT_LEVEL_CODE)
    return level_lookup.get(norm, next(iter(level_lookup.values())))


def resolve_source_id(cursor, cache: Dict[str, int], source_name: str) -> int:
    if source_name in cache:
        return cache[source_name]
    cursor.execute("SELECT id FROM sources WHERE name = %s", (source_name,))
    row = cursor.fetchone()
    if row:
        cache[source_name] = row[0]
        return row[0]
    # Insert if missing
    cursor.execute(
        "INSERT INTO sources (name, url) VALUES (%s, %s)",
        (source_name, f"https://{source_name.lower()}.com"),
    )
    return resolve_source_id(cursor, cache, source_name)


def course_exists(cursor, title: str, source_id: int) -> bool:
    cursor.execute(
        "SELECT id FROM courses WHERE title = %s AND source_id = %s LIMIT 1",
        (title, source_id),
    )
    return cursor.fetchone() is not None


def insert_course(cursor, *, title: str, short_description: str, language_id: int, level_id: int, source_id: int, access_url: Optional[str]):
    cursor.execute(
        """
        INSERT INTO courses (title, short_description, language_id, level_id, source_id, access_url)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (title, short_description[:255] if short_description else "", language_id, level_id, source_id, access_url or ""),
    )


def harvest_coursera(cursor, level_lookup, language_lookup, source_cache, limit=MAX_COURSES_PER_SOURCE):
    path = DATA_DIR / "coursea_data.csv"
    if not path.exists():
        print(f"Coursera CSV not found: {path}")
        return
    source_id = resolve_source_id(cursor, source_cache, "Coursera")
    inserted = 0
    with path.open(newline='', encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if inserted >= limit:
                break
            title = row.get("course_title") or ""
            if not title:
                continue
            if course_exists(cursor, title, source_id):
                continue
            desc = row.get("course_organization") or row.get("course_Certificate_type") or ""
            level_text = row.get("course_difficulty")
            level_id = resolve_level_id(level_lookup, level_text)
            lang_id = resolve_language_id(language_lookup, detect_language_code(title))
            insert_course(cursor, title=title, short_description=desc, language_id=lang_id, level_id=level_id, source_id=source_id, access_url="")
            inserted += 1
    print(f"Coursera CSV imported ({inserted} new courses)")


def harvest_edx(cursor, level_lookup, language_lookup, source_cache, limit=MAX_COURSES_PER_SOURCE):
    path = DATA_DIR / "edx_courses.csv"
    if not path.exists():
        print(f"edX CSV not found: {path}")
        return
    source_id = resolve_source_id(cursor, source_cache, "edX")
    inserted = 0
    with path.open(newline='', encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if inserted >= limit:
                break
            title = row.get("title") or ""
            if not title:
                continue
            if course_exists(cursor, title, source_id):
                continue
            desc = row.get("summary") or row.get("course_description") or ""
            level_text = row.get("Level")
            level_id = resolve_level_id(level_lookup, level_text)
            lang_id = resolve_language_id(language_lookup, detect_language_code(title))
            url = row.get("course_url") or ""
            insert_course(cursor, title=title, short_description=desc, language_id=lang_id, level_id=level_id, source_id=source_id, access_url=url)
            inserted += 1
    print(f"edX CSV imported ({inserted} new courses)")


def harvest_udemy(cursor, level_lookup, language_lookup, source_cache, limit=MAX_COURSES_PER_SOURCE):
    path = DATA_DIR / "udemy_courses.csv"
    if not path.exists():
        print(f"Udemy CSV not found: {path}")
        return
    source_id = resolve_source_id(cursor, source_cache, "Udemy")
    inserted = 0
    with path.open(newline='', encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if inserted >= limit:
                break
            title = row.get("course_title") or ""
            if not title:
                continue
            if course_exists(cursor, title, source_id):
                continue
            desc = row.get("subject") or ""
            level_text = row.get("level")
            level_id = resolve_level_id(level_lookup, level_text)
            lang_id = resolve_language_id(language_lookup, detect_language_code(title))
            url = row.get("url") or ""
            insert_course(cursor, title=title, short_description=desc, language_id=lang_id, level_id=level_id, source_id=source_id, access_url=url)
            inserted += 1
        print(f"Udemy CSV imported ({inserted} new courses)")


def main():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        level_lookup = load_levels(cursor)
        language_lookup = load_languages(cursor)
        source_cache: Dict[str, int] = {}
        harvest_coursera(cursor, level_lookup, language_lookup, source_cache)
        harvest_edx(cursor, level_lookup, language_lookup, source_cache)
        harvest_udemy(cursor, level_lookup, language_lookup, source_cache)
        conn.commit()
        print("CSV harvest completed")
    except Exception as exc:
        conn.rollback()
        print(f"Harvest failed: {exc}")
        traceback.print_exc()
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    main()
