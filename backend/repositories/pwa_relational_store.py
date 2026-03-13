from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from models_sql import PwaDeviceTokenRecord
from models_sql.core_documents import CoreDocument
from repositories.core_store import (
    CoreStore,
    DeleteResult,
    InsertOneResult,
    UpdateResult,
    _apply_update_ops,
    _matches_query,
    _normalize_for_storage,
    _to_comparable,
)


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _is_object_id_str(value: str) -> bool:
    try:
        ObjectId(value)
        return True
    except Exception:
        return False


def _restore_id(value: Any) -> Any:
    if isinstance(value, str) and _is_object_id_str(value):
        return ObjectId(value)
    return value


def _as_datetime(value: Any, default_now: bool = False) -> Optional[datetime]:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    if isinstance(value, str):
        raw = value.strip()
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(raw)
            if parsed.tzinfo is None:
                return parsed.replace(tzinfo=timezone.utc)
            return parsed
        except ValueError:
            return _now_utc() if default_now else None
    if default_now:
        return _now_utc()
    return None


_PWA_TOKEN_KNOWN_FIELDS = {
    "_id",
    "user_id",
    "fcm_token",
    "device_type",
    "device_name",
    "created_at",
    "updated_at",
}


def _token_doc_to_row_values(normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
    extra_data = {k: v for k, v in normalized_doc.items() if k not in _PWA_TOKEN_KNOWN_FIELDS}
    raw_id = normalized_doc.get("_id")
    doc_id = str(raw_id) if raw_id is not None else str(ObjectId())

    user_id = normalized_doc.get("user_id")

    return {
        "id": doc_id,
        "user_id": str(user_id) if user_id is not None else None,
        "fcm_token": str(normalized_doc.get("fcm_token") or ""),
        "device_type": (
            str(normalized_doc.get("device_type"))
            if normalized_doc.get("device_type") is not None
            else None
        ),
        "device_name": (
            str(normalized_doc.get("device_name"))
            if normalized_doc.get("device_name") is not None
            else None
        ),
        "created_at": _as_datetime(normalized_doc.get("created_at"), default_now=True),
        "updated_at": _as_datetime(normalized_doc.get("updated_at"), default_now=True),
        "extra_data": extra_data,
    }


class _SqlCursor:
    def __init__(self, collection: "_BaseSqlCollection", query: Optional[Dict[str, Any]] = None):
        self._collection = collection
        self._query = query or {}
        self._sort_spec: List[Tuple[str, int]] = []
        self._skip = 0
        self._limit: Optional[int] = None

    def sort(self, field: Any, direction: Optional[int] = None):
        if isinstance(field, list):
            self._sort_spec = [(str(k), int(v)) for k, v in field]
        elif isinstance(field, tuple):
            self._sort_spec = [(str(field[0]), int(field[1]))]
        else:
            self._sort_spec = [(str(field), int(direction or 1))]
        return self

    def skip(self, n: int):
        self._skip = max(0, int(n))
        return self

    def limit(self, n: int):
        self._limit = max(0, int(n))
        return self

    async def to_list(self, n: int):
        docs = await self._collection._find_docs(self._query)
        if self._sort_spec:
            for field, direction in reversed(self._sort_spec):
                docs.sort(
                    key=lambda d: _to_comparable(d.get(field)),
                    reverse=(int(direction) == -1),
                )
        if self._skip:
            docs = docs[self._skip :]
        max_n = self._limit if self._limit is not None else int(n)
        docs = docs[: max_n if max_n is not None else len(docs)]
        return docs


class _BaseSqlCollection:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]):
        self._session_factory = session_factory

    async def _find_docs(self, query: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        raise NotImplementedError

    def find(self, query: Optional[Dict[str, Any]] = None):
        return _SqlCursor(self, query=query)

    async def find_one(
        self,
        query: Optional[Dict[str, Any]] = None,
        projection: Optional[Dict[str, Any]] = None,
        sort: Optional[List[Tuple[str, int]]] = None,
    ):
        docs = await self._find_docs(query)
        if sort:
            for field, direction in reversed(sort):
                docs.sort(
                    key=lambda d: _to_comparable(d.get(field)),
                    reverse=(int(direction) == -1),
                )
        if not docs:
            return None
        doc = docs[0]
        if projection:
            include_fields = {k for k, v in projection.items() if v}
            if include_fields:
                return {k: v for k, v in doc.items() if k in include_fields or k == "_id"}
        return doc

    async def count_documents(self, query: Optional[Dict[str, Any]] = None) -> int:
        docs = await self._find_docs(query)
        return len(docs)

    async def distinct(self, field: str):
        docs = await self._find_docs({})
        values = []
        seen = set()
        for d in docs:
            v = d.get(field)
            key = _to_comparable(v)
            if key not in seen:
                seen.add(key)
                values.append(v)
        return values


class RelationalPwaDeviceTokenCollection(_BaseSqlCollection):
    _KNOWN_FIELDS = _PWA_TOKEN_KNOWN_FIELDS

    def __init__(self, core_store: CoreStore):
        session_factory = core_store.get_session_factory()
        if session_factory is None:
            raise ValueError("RelationalPwaDeviceTokenCollection requires PostgreSQL session factory")
        super().__init__(session_factory)
        self._mirror_collection = core_store.pwa_device_tokens

    def _row_to_doc(self, row: PwaDeviceTokenRecord) -> Dict[str, Any]:
        doc: Dict[str, Any] = dict(row.extra_data or {})
        doc["_id"] = _restore_id(row.id)
        doc["user_id"] = _restore_id(row.user_id) if row.user_id else None
        doc["fcm_token"] = row.fcm_token
        if row.device_type is not None:
            doc["device_type"] = row.device_type
        if row.device_name is not None:
            doc["device_name"] = row.device_name
        doc["created_at"] = row.created_at
        doc["updated_at"] = row.updated_at
        return doc

    def _doc_to_row_values(self, normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
        return _token_doc_to_row_values(normalized_doc)

    async def _find_rows(self) -> List[PwaDeviceTokenRecord]:
        async with self._session_factory() as session:
            rows = await session.scalars(select(PwaDeviceTokenRecord))
            return list(rows.all())

    async def _find_docs(self, query: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        rows = await self._find_rows()
        docs: List[Dict[str, Any]] = []
        for row in rows:
            doc = self._row_to_doc(row)
            if _matches_query(doc, query):
                docs.append(doc)
        return docs

    async def _mirror_upsert(self, doc: Dict[str, Any]) -> None:
        if self._mirror_collection is None:
            return
        mirror_query = {"_id": _restore_id(str(doc.get("_id")))}
        mirror_payload = dict(doc)
        mirror_payload.pop("_id", None)
        try:
            await self._mirror_collection.update_one(mirror_query, {"$set": mirror_payload}, upsert=True)
        except Exception:
            pass

    async def _mirror_delete(self, doc_id: str) -> None:
        if self._mirror_collection is None:
            return
        try:
            await self._mirror_collection.delete_one({"_id": _restore_id(doc_id)})
        except Exception:
            pass

    async def insert_one(self, doc: Dict[str, Any]) -> InsertOneResult:
        raw_doc = dict(doc)
        raw_id = raw_doc.get("_id")
        doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
        raw_doc["_id"] = doc_id
        normalized = _normalize_for_storage(raw_doc)
        row_values = self._doc_to_row_values(normalized)

        async with self._session_factory() as session:
            exists = await session.get(PwaDeviceTokenRecord, doc_id)
            if exists is not None:
                raise ValueError(f"Duplicate key for pwa_device_tokens._id={doc_id}")
            session.add(PwaDeviceTokenRecord(**row_values))
            await session.commit()

        await self._mirror_upsert(normalized)
        return InsertOneResult(inserted_id=_restore_id(doc_id))

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False) -> UpdateResult:
        docs = await self._find_docs(query)
        if not docs:
            if not upsert:
                return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)
            base_doc = {}
            for k, v in (query or {}).items():
                if not k.startswith("$") and not isinstance(v, dict):
                    base_doc[k] = v
            new_doc = _apply_update_ops(base_doc, update)
            raw_id = new_doc.get("_id")
            doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
            new_doc["_id"] = doc_id
            normalized = _normalize_for_storage(new_doc)
            row_values = self._doc_to_row_values(normalized)
            async with self._session_factory() as session:
                session.add(PwaDeviceTokenRecord(**row_values))
                await session.commit()
            await self._mirror_upsert(normalized)
            return UpdateResult(matched_count=0, modified_count=1, upserted_id=_restore_id(doc_id))

        target_doc = docs[0]
        updated_doc = _apply_update_ops(target_doc, update)
        normalized = _normalize_for_storage(updated_doc)
        row_values = self._doc_to_row_values(normalized)
        doc_id = row_values["id"]

        async with self._session_factory() as session:
            row = await session.get(PwaDeviceTokenRecord, doc_id)
            if row is None:
                session.add(PwaDeviceTokenRecord(**row_values))
            else:
                for key, value in row_values.items():
                    setattr(row, key, value)
            await session.commit()

        await self._mirror_upsert(normalized)
        return UpdateResult(matched_count=1, modified_count=1, upserted_id=None)

    async def delete_one(self, query: Dict[str, Any]) -> DeleteResult:
        docs = await self._find_docs(query)
        if not docs:
            return DeleteResult(deleted_count=0)
        target_id = str(docs[0].get("_id"))

        async with self._session_factory() as session:
            await session.execute(delete(PwaDeviceTokenRecord).where(PwaDeviceTokenRecord.id == target_id))
            await session.commit()

        await self._mirror_delete(target_id)
        return DeleteResult(deleted_count=1)


def _extract_core_store(db) -> Optional[CoreStore]:
    if isinstance(db, CoreStore):
        return db
    raw_getter = getattr(db, "get_raw_db", None)
    if callable(raw_getter):
        try:
            raw_db = raw_getter()
            if isinstance(raw_db, CoreStore):
                return raw_db
        except Exception:
            return None
    return None


class PwaRelationalDbAdapter:
    """
    Adapter for pwa related collections:
    - pwa_device_tokens -> typed relational table (with compatibility mirror)
    - other collections -> delegated to wrapped db object
    """

    def __init__(self, db):
        self._db = db
        self._core_store = _extract_core_store(db)
        self._tokens_collection = None

        if self._core_store is not None:
            session_factory = self._core_store.get_session_factory()
            if session_factory is not None and self._core_store.uses_postgres("pwa_device_tokens"):
                self._tokens_collection = RelationalPwaDeviceTokenCollection(self._core_store)

    def __getattr__(self, name: str):
        if name == "pwa_device_tokens" and self._tokens_collection is not None:
            return self._tokens_collection
        return getattr(self._db, name)

    def __getitem__(self, name: str):
        return self.__getattr__(name)

    def get_raw_db(self):
        if self._core_store is not None:
            return self._core_store
        raw_getter = getattr(self._db, "get_raw_db", None)
        if callable(raw_getter):
            try:
                return raw_getter()
            except Exception:
                pass
        return self._db


def adapt_pwa_read_db(db):
    core_store = _extract_core_store(db)
    if core_store is None:
        return db
    session_factory = core_store.get_session_factory()
    if session_factory is None:
        return db
    return PwaRelationalDbAdapter(db)


async def bootstrap_relational_pwa_tables(
    session_factory: Optional[async_sessionmaker[AsyncSession]],
) -> None:
    """
    One-way bootstrap from core_documents -> relational pwa table.
    Safe to run repeatedly: existing IDs are skipped.
    """
    if session_factory is None:
        return

    async with session_factory() as session:
        token_count = await session.scalar(select(func.count()).select_from(PwaDeviceTokenRecord))

        if (token_count or 0) == 0:
            token_rows = await session.scalars(
                select(CoreDocument).where(CoreDocument.collection_name == "pwa_device_tokens")
            )
            for row in token_rows.all():
                doc = dict(row.document or {})
                doc["_id"] = row.document_id
                normalized = _normalize_for_storage(doc)
                row_values = _token_doc_to_row_values(normalized)
                if await session.get(PwaDeviceTokenRecord, row_values["id"]) is None:
                    session.add(PwaDeviceTokenRecord(**row_values))

        await session.commit()
