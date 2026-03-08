from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from models_sql import TabungCampaignRecord, TabungDonationRecord
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


def _as_int(value: Any, default: Optional[int] = None) -> Optional[int]:
    if value is None:
        return default
    try:
        return int(value)
    except Exception:
        return default


def _as_float(value: Any, default: Optional[float] = None) -> Optional[float]:
    if value is None:
        return default
    try:
        return float(value)
    except Exception:
        return default


def _as_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "y", "on"}:
            return True
        if lowered in {"0", "false", "no", "n", "off"}:
            return False
    return bool(value)


_TABUNG_CAMPAIGN_KNOWN_FIELDS = {
    "_id",
    "title",
    "description",
    "full_description",
    "image_url",
    "images",
    "campaign_type",
    "status",
    "donor_count",
    "is_public",
    "allow_anonymous",
    "is_featured",
    "is_permanent",
    "start_date",
    "end_date",
    "created_by",
    "created_at",
    "updated_at",
    "total_slots",
    "slots_sold",
    "price_per_slot",
    "min_slots",
    "max_slots",
    "target_amount",
    "collected_amount",
    "min_amount",
    "max_amount",
    "qr_code_base64",
    "qr_code_url",
}


_TABUNG_DONATION_KNOWN_FIELDS = {
    "_id",
    "campaign_id",
    "campaign_title",
    "campaign_type",
    "user_id",
    "donor_name",
    "donor_email",
    "is_anonymous",
    "amount",
    "payment_method",
    "payment_status",
    "message",
    "receipt_number",
    "created_at",
    "slots",
    "price_per_slot",
}


def _campaign_doc_to_row_values(normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
    extra_data = {k: v for k, v in normalized_doc.items() if k not in _TABUNG_CAMPAIGN_KNOWN_FIELDS}
    raw_id = normalized_doc.get("_id")
    doc_id = str(raw_id) if raw_id is not None else str(ObjectId())

    return {
        "id": doc_id,
        "title": str(normalized_doc.get("title") or ""),
        "description": normalized_doc.get("description"),
        "full_description": normalized_doc.get("full_description"),
        "image_url": normalized_doc.get("image_url"),
        "images": normalized_doc.get("images") or [],
        "campaign_type": str(normalized_doc.get("campaign_type") or "amount"),
        "status": str(normalized_doc.get("status") or "active"),
        "donor_count": _as_int(normalized_doc.get("donor_count"), default=0) or 0,
        "is_public": _as_bool(normalized_doc.get("is_public"), default=True),
        "allow_anonymous": _as_bool(normalized_doc.get("allow_anonymous"), default=True),
        "is_featured": _as_bool(normalized_doc.get("is_featured"), default=False),
        "is_permanent": _as_bool(normalized_doc.get("is_permanent"), default=False),
        "start_date": (
            str(normalized_doc.get("start_date"))
            if normalized_doc.get("start_date") is not None
            else None
        ),
        "end_date": (
            str(normalized_doc.get("end_date"))
            if normalized_doc.get("end_date") is not None
            else None
        ),
        "created_by": (
            str(normalized_doc.get("created_by"))
            if normalized_doc.get("created_by") is not None
            else None
        ),
        "created_at": _as_datetime(normalized_doc.get("created_at"), default_now=True),
        "updated_at": _as_datetime(normalized_doc.get("updated_at")),
        "total_slots": _as_int(normalized_doc.get("total_slots")),
        "slots_sold": _as_int(normalized_doc.get("slots_sold")),
        "price_per_slot": _as_float(normalized_doc.get("price_per_slot")),
        "min_slots": _as_int(normalized_doc.get("min_slots")),
        "max_slots": _as_int(normalized_doc.get("max_slots")),
        "target_amount": _as_float(normalized_doc.get("target_amount")),
        "collected_amount": _as_float(normalized_doc.get("collected_amount")),
        "min_amount": _as_float(normalized_doc.get("min_amount")),
        "max_amount": _as_float(normalized_doc.get("max_amount")),
        "qr_code_base64": normalized_doc.get("qr_code_base64"),
        "qr_code_url": normalized_doc.get("qr_code_url"),
        "extra_data": extra_data,
    }


def _donation_doc_to_row_values(normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
    extra_data = {k: v for k, v in normalized_doc.items() if k not in _TABUNG_DONATION_KNOWN_FIELDS}
    raw_id = normalized_doc.get("_id")
    doc_id = str(raw_id) if raw_id is not None else str(ObjectId())

    campaign_id = normalized_doc.get("campaign_id")

    return {
        "id": doc_id,
        "campaign_id": str(campaign_id) if campaign_id is not None else None,
        "campaign_title": normalized_doc.get("campaign_title"),
        "campaign_type": normalized_doc.get("campaign_type"),
        "user_id": (
            str(normalized_doc.get("user_id"))
            if normalized_doc.get("user_id") is not None
            else None
        ),
        "donor_name": normalized_doc.get("donor_name"),
        "donor_email": normalized_doc.get("donor_email"),
        "is_anonymous": _as_bool(normalized_doc.get("is_anonymous"), default=False),
        "amount": _as_float(normalized_doc.get("amount"), default=0.0) or 0.0,
        "payment_method": normalized_doc.get("payment_method"),
        "payment_status": normalized_doc.get("payment_status"),
        "message": normalized_doc.get("message"),
        "receipt_number": normalized_doc.get("receipt_number"),
        "created_at": _as_datetime(normalized_doc.get("created_at"), default_now=True),
        "slots": _as_int(normalized_doc.get("slots")),
        "price_per_slot": _as_float(normalized_doc.get("price_per_slot")),
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


class RelationalTabungCampaignCollection(_BaseSqlCollection):
    _KNOWN_FIELDS = _TABUNG_CAMPAIGN_KNOWN_FIELDS

    def __init__(self, core_store: CoreStore):
        session_factory = core_store.get_session_factory()
        if session_factory is None:
            raise ValueError("RelationalTabungCampaignCollection requires PostgreSQL session factory")
        super().__init__(session_factory)
        self._mirror_collection = core_store.tabung_campaigns

    def _row_to_doc(self, row: TabungCampaignRecord) -> Dict[str, Any]:
        doc: Dict[str, Any] = dict(row.extra_data or {})
        doc["_id"] = _restore_id(row.id)
        doc["title"] = row.title
        doc["description"] = row.description
        doc["full_description"] = row.full_description
        doc["image_url"] = row.image_url
        doc["images"] = row.images or []
        doc["campaign_type"] = row.campaign_type
        doc["status"] = row.status
        doc["donor_count"] = row.donor_count
        doc["is_public"] = row.is_public
        doc["allow_anonymous"] = row.allow_anonymous
        doc["is_featured"] = row.is_featured
        doc["is_permanent"] = row.is_permanent
        doc["start_date"] = row.start_date
        doc["end_date"] = row.end_date
        doc["created_by"] = row.created_by
        doc["created_at"] = row.created_at
        if row.updated_at is not None:
            doc["updated_at"] = row.updated_at
        if row.total_slots is not None:
            doc["total_slots"] = row.total_slots
        if row.slots_sold is not None:
            doc["slots_sold"] = row.slots_sold
        if row.price_per_slot is not None:
            doc["price_per_slot"] = row.price_per_slot
        if row.min_slots is not None:
            doc["min_slots"] = row.min_slots
        if row.max_slots is not None:
            doc["max_slots"] = row.max_slots
        if row.target_amount is not None:
            doc["target_amount"] = row.target_amount
        if row.collected_amount is not None:
            doc["collected_amount"] = row.collected_amount
        if row.min_amount is not None:
            doc["min_amount"] = row.min_amount
        if row.max_amount is not None:
            doc["max_amount"] = row.max_amount
        if row.qr_code_base64 is not None:
            doc["qr_code_base64"] = row.qr_code_base64
        if row.qr_code_url is not None:
            doc["qr_code_url"] = row.qr_code_url
        return doc

    def _doc_to_row_values(self, normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
        return _campaign_doc_to_row_values(normalized_doc)

    async def _find_rows(self) -> List[TabungCampaignRecord]:
        async with self._session_factory() as session:
            rows = await session.scalars(select(TabungCampaignRecord))
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
            exists = await session.get(TabungCampaignRecord, doc_id)
            if exists is not None:
                raise ValueError(f"Duplicate key for tabung_campaigns._id={doc_id}")
            session.add(TabungCampaignRecord(**row_values))
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
                session.add(TabungCampaignRecord(**row_values))
                await session.commit()
            await self._mirror_upsert(normalized)
            return UpdateResult(matched_count=0, modified_count=1, upserted_id=_restore_id(doc_id))

        target_doc = docs[0]
        updated_doc = _apply_update_ops(target_doc, update)
        normalized = _normalize_for_storage(updated_doc)
        row_values = self._doc_to_row_values(normalized)
        doc_id = row_values["id"]

        async with self._session_factory() as session:
            row = await session.get(TabungCampaignRecord, doc_id)
            if row is None:
                session.add(TabungCampaignRecord(**row_values))
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
            await session.execute(delete(TabungCampaignRecord).where(TabungCampaignRecord.id == target_id))
            await session.commit()

        await self._mirror_delete(target_id)
        return DeleteResult(deleted_count=1)


class RelationalTabungDonationCollection(_BaseSqlCollection):
    _KNOWN_FIELDS = _TABUNG_DONATION_KNOWN_FIELDS

    def __init__(self, core_store: CoreStore):
        session_factory = core_store.get_session_factory()
        if session_factory is None:
            raise ValueError("RelationalTabungDonationCollection requires PostgreSQL session factory")
        super().__init__(session_factory)
        self._mirror_collection = core_store.tabung_donations

    def _row_to_doc(self, row: TabungDonationRecord) -> Dict[str, Any]:
        doc: Dict[str, Any] = dict(row.extra_data or {})
        doc["_id"] = _restore_id(row.id)
        doc["campaign_id"] = _restore_id(row.campaign_id) if row.campaign_id else None
        doc["campaign_title"] = row.campaign_title
        doc["campaign_type"] = row.campaign_type
        doc["user_id"] = row.user_id
        doc["donor_name"] = row.donor_name
        doc["donor_email"] = row.donor_email
        doc["is_anonymous"] = row.is_anonymous
        doc["amount"] = row.amount
        doc["payment_method"] = row.payment_method
        doc["payment_status"] = row.payment_status
        doc["message"] = row.message
        doc["receipt_number"] = row.receipt_number
        doc["created_at"] = row.created_at
        if row.slots is not None:
            doc["slots"] = row.slots
        if row.price_per_slot is not None:
            doc["price_per_slot"] = row.price_per_slot
        return doc

    def _doc_to_row_values(self, normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
        return _donation_doc_to_row_values(normalized_doc)

    async def _find_rows(self) -> List[TabungDonationRecord]:
        async with self._session_factory() as session:
            rows = await session.scalars(select(TabungDonationRecord))
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
            exists = await session.get(TabungDonationRecord, doc_id)
            if exists is not None:
                raise ValueError(f"Duplicate key for tabung_donations._id={doc_id}")
            session.add(TabungDonationRecord(**row_values))
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
                session.add(TabungDonationRecord(**row_values))
                await session.commit()
            await self._mirror_upsert(normalized)
            return UpdateResult(matched_count=0, modified_count=1, upserted_id=_restore_id(doc_id))

        target_doc = docs[0]
        updated_doc = _apply_update_ops(target_doc, update)
        normalized = _normalize_for_storage(updated_doc)
        row_values = self._doc_to_row_values(normalized)
        doc_id = row_values["id"]

        async with self._session_factory() as session:
            row = await session.get(TabungDonationRecord, doc_id)
            if row is None:
                session.add(TabungDonationRecord(**row_values))
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
            await session.execute(delete(TabungDonationRecord).where(TabungDonationRecord.id == target_id))
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


class TabungRelationalDbAdapter:
    """
    Adapter for tabung-related collections:
    - tabung_campaigns -> typed relational table (with compatibility mirror)
    - tabung_donations -> typed relational table (with compatibility mirror)
    - other collections -> delegated to wrapped db object
    """

    def __init__(self, db):
        self._db = db
        self._core_store = _extract_core_store(db)
        self._campaigns_collection = None
        self._donations_collection = None

        if self._core_store is not None:
            session_factory = self._core_store.get_session_factory()
            if session_factory is not None and self._core_store.uses_postgres("tabung_campaigns"):
                self._campaigns_collection = RelationalTabungCampaignCollection(self._core_store)
            if session_factory is not None and self._core_store.uses_postgres("tabung_donations"):
                self._donations_collection = RelationalTabungDonationCollection(self._core_store)

    def __getattr__(self, name: str):
        if name == "tabung_campaigns" and self._campaigns_collection is not None:
            return self._campaigns_collection
        if name == "tabung_donations" and self._donations_collection is not None:
            return self._donations_collection
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


def adapt_tabung_read_db(db):
    core_store = _extract_core_store(db)
    if core_store is None:
        return db
    session_factory = core_store.get_session_factory()
    if session_factory is None:
        return db
    return TabungRelationalDbAdapter(db)


async def bootstrap_relational_tabung_tables(
    session_factory: Optional[async_sessionmaker[AsyncSession]],
) -> None:
    """
    One-way bootstrap from core_documents -> relational tabung tables.
    Safe to run repeatedly: existing IDs are skipped.
    """
    if session_factory is None:
        return

    async with session_factory() as session:
        campaign_count = await session.scalar(select(func.count()).select_from(TabungCampaignRecord))
        donation_count = await session.scalar(select(func.count()).select_from(TabungDonationRecord))

        if (campaign_count or 0) == 0:
            campaign_rows = await session.scalars(
                select(CoreDocument).where(CoreDocument.collection_name == "tabung_campaigns")
            )
            for row in campaign_rows.all():
                doc = dict(row.document or {})
                doc["_id"] = row.document_id
                normalized = _normalize_for_storage(doc)
                row_values = _campaign_doc_to_row_values(normalized)
                if await session.get(TabungCampaignRecord, row_values["id"]) is None:
                    session.add(TabungCampaignRecord(**row_values))

        if (donation_count or 0) == 0:
            donation_rows = await session.scalars(
                select(CoreDocument).where(CoreDocument.collection_name == "tabung_donations")
            )
            for row in donation_rows.all():
                doc = dict(row.document or {})
                doc["_id"] = row.document_id
                normalized = _normalize_for_storage(doc)
                row_values = _donation_doc_to_row_values(normalized)
                if await session.get(TabungDonationRecord, row_values["id"]) is None:
                    session.add(TabungDonationRecord(**row_values))

        await session.commit()
