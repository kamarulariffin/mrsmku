import os


DB_ENGINE = os.environ.get("DB_ENGINE", "postgres").strip().lower()
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+psycopg://kamarulariffin@localhost:5432/mrsm_portal",
).strip()


def is_postgres_mode() -> bool:
    return DB_ENGINE in {"postgres", "hybrid"}


def is_hybrid_mode() -> bool:
    return DB_ENGINE == "hybrid"


def is_mongo_mode() -> bool:
    return DB_ENGINE == "mongo"

