from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from models_sql import ChatboxFaqRecord
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


def _to_iso(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    return value.isoformat()


def _as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


_FAQ_KNOWN_FIELDS = {
    "_id",
    "question",
    "answer",
    "order",
    "attachments",
    "created_at",
    "updated_at",
    "created_by",
}


def _faq_doc_to_row_values(normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
    extra_data = {k: v for k, v in normalized_doc.items() if k not in _FAQ_KNOWN_FIELDS}
    raw_id = normalized_doc.get("_id")
    doc_id = str(raw_id) if raw_id is not None else str(ObjectId())

    created_by = normalized_doc.get("created_by")

    return {
        "id": doc_id,
        "question": str(normalized_doc.get("question") or ""),
        "answer": (
            str(normalized_doc.get("answer"))
            if normalized_doc.get("answer") is not None
            else None
        ),
        "order_value": _as_int(normalized_doc.get("order"), default=0),
        "attachments": normalized_doc.get("attachments") or [],
        "created_at": _as_datetime(normalized_doc.get("created_at"), default_now=True),
        "updated_at": _as_datetime(normalized_doc.get("updated_at"), default_now=True),
        "created_by": str(created_by) if created_by is not None else None,
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

    async def to_list(self, n: Optional[int] = None, length: Optional[int] = None):
        docs = await self._collection._find_docs(self._query)
        if self._sort_spec:
            for field, direction in reversed(self._sort_spec):
                docs.sort(
                    key=lambda d: _to_comparable(d.get(field)),
                    reverse=(int(direction) == -1),
                )
        if self._skip:
            docs = docs[self._skip :]
        requested_n: Optional[int] = None
        if length is not None:
            requested_n = max(0, int(length))
        elif n is not None:
            requested_n = max(0, int(n))
        max_n = self._limit if self._limit is not None else requested_n
        if max_n is not None:
            docs = docs[:max_n]
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


class RelationalChatboxFaqCollection(_BaseSqlCollection):
    _KNOWN_FIELDS = _FAQ_KNOWN_FIELDS

    def __init__(self, core_store: CoreStore):
        session_factory = core_store.get_session_factory()
        if session_factory is None:
            raise ValueError("RelationalChatboxFaqCollection requires PostgreSQL session factory")
        super().__init__(session_factory)
        self._mirror_collection = core_store.chatbox_faq

    def _row_to_doc(self, row: ChatboxFaqRecord) -> Dict[str, Any]:
        doc: Dict[str, Any] = dict(row.extra_data or {})
        doc["_id"] = _restore_id(row.id)
        doc["question"] = row.question
        doc["answer"] = row.answer
        doc["order"] = row.order_value
        doc["attachments"] = row.attachments or []
        doc["created_at"] = _to_iso(row.created_at)
        doc["updated_at"] = _to_iso(row.updated_at)
        if row.created_by is not None:
            doc["created_by"] = row.created_by
        return doc

    def _doc_to_row_values(self, normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
        return _faq_doc_to_row_values(normalized_doc)

    async def _find_rows(self) -> List[ChatboxFaqRecord]:
        async with self._session_factory() as session:
            rows = await session.scalars(select(ChatboxFaqRecord))
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
            exists = await session.get(ChatboxFaqRecord, doc_id)
            if exists is not None:
                raise ValueError(f"Duplicate key for chatbox_faq._id={doc_id}")
            session.add(ChatboxFaqRecord(**row_values))
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
                session.add(ChatboxFaqRecord(**row_values))
                await session.commit()
            await self._mirror_upsert(normalized)
            return UpdateResult(matched_count=0, modified_count=1, upserted_id=_restore_id(doc_id))

        target_doc = docs[0]
        updated_doc = _apply_update_ops(target_doc, update)
        normalized = _normalize_for_storage(updated_doc)
        row_values = self._doc_to_row_values(normalized)
        doc_id = row_values["id"]

        async with self._session_factory() as session:
            row = await session.get(ChatboxFaqRecord, doc_id)
            if row is None:
                session.add(ChatboxFaqRecord(**row_values))
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
            await session.execute(delete(ChatboxFaqRecord).where(ChatboxFaqRecord.id == target_id))
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


class ChatboxRelationalDbAdapter:
    """
    Adapter for chatbox related collections:
    - chatbox_faq -> typed relational table (with compatibility mirror)
    - other collections -> delegated to wrapped db object
    """

    def __init__(self, db):
        self._db = db
        self._core_store = _extract_core_store(db)
        self._faq_collection = None

        if self._core_store is not None:
            session_factory = self._core_store.get_session_factory()
            if session_factory is not None and self._core_store.uses_postgres("chatbox_faq"):
                self._faq_collection = RelationalChatboxFaqCollection(self._core_store)

    def __getattr__(self, name: str):
        if name == "chatbox_faq" and self._faq_collection is not None:
            return self._faq_collection
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


def adapt_chatbox_read_db(db):
    core_store = _extract_core_store(db)
    if core_store is None:
        return db
    session_factory = core_store.get_session_factory()
    if session_factory is None:
        return db
    return ChatboxRelationalDbAdapter(db)


async def bootstrap_relational_chatbox_tables(
    session_factory: Optional[async_sessionmaker[AsyncSession]],
) -> None:
    """
    One-way bootstrap from core_documents -> relational chatbox table.
    Safe to run repeatedly: existing IDs are skipped.
    """
    if session_factory is None:
        return

    async with session_factory() as session:
        faq_count = await session.scalar(select(func.count()).select_from(ChatboxFaqRecord))

        if (faq_count or 0) == 0:
            faq_rows = await session.scalars(
                select(CoreDocument).where(CoreDocument.collection_name == "chatbox_faq")
            )
            for row in faq_rows.all():
                doc = dict(row.document or {})
                doc["_id"] = row.document_id
                normalized = _normalize_for_storage(doc)
                row_values = _faq_doc_to_row_values(normalized)
                if await session.get(ChatboxFaqRecord, row_values["id"]) is None:
                    session.add(ChatboxFaqRecord(**row_values))

        await session.commit()
