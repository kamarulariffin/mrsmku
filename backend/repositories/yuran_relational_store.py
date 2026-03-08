from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId
from sqlalchemy import String, and_, cast, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from models_sql import SetYuranRecord, StudentYuranRecord, YuranPaymentRecord
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

logger = logging.getLogger(__name__)


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
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return _now_utc() if default_now else None
    if default_now:
        return _now_utc()
    return None


def _to_iso(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    return value.isoformat()


_REGEX_META_CHARS = set(".+*?[](){}|^$")


def _apply_projection(doc: Dict[str, Any], projection: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if projection:
        include_fields = {k for k, v in projection.items() if v}
        if include_fields:
            return {k: v for k, v in doc.items() if k in include_fields or k == "_id"}
    return doc


def _normalize_query_value(value: Any, value_type: str) -> Any:
    if value_type in {"id", "str"}:
        if value is None:
            return None
        if isinstance(value, ObjectId):
            return str(value)
        return str(value)
    if value_type == "int":
        try:
            return int(value)
        except Exception:
            return value
    if value_type == "float":
        try:
            return float(value)
        except Exception:
            return value
    if value_type == "bool":
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            lowered = value.strip().lower()
            if lowered in {"true", "1", "yes"}:
                return True
            if lowered in {"false", "0", "no"}:
                return False
        return bool(value)
    if value_type == "datetime":
        return _as_datetime(value)
    return value


def _regex_pattern_to_like_value(pattern: Any) -> Optional[str]:
    regex = str(pattern or "")
    anchored_start = regex.startswith("^")
    anchored_end = regex.endswith("$") and not regex.endswith("\\$")
    core = regex[1:] if anchored_start else regex
    if anchored_end:
        core = core[:-1]

    literal_parts: List[str] = []
    idx = 0
    while idx < len(core):
        ch = core[idx]
        if ch == "\\":
            if idx + 1 >= len(core):
                return None
            literal_parts.append(core[idx + 1])
            idx += 2
            continue
        if ch in _REGEX_META_CHARS:
            return None
        literal_parts.append(ch)
        idx += 1

    literal = "".join(literal_parts)
    if anchored_start and anchored_end:
        return literal
    if anchored_start:
        return f"{literal}%"
    if anchored_end:
        return f"%{literal}"
    return f"%{literal}%"


def _compile_field_clause(column: Any, raw_value: Any, value_type: str) -> Optional[Any]:
    if isinstance(raw_value, dict):
        clauses: List[Any] = []
        regex_pattern: Any = None
        regex_options = ""

        for op, value in raw_value.items():
            if op == "$options":
                regex_options = str(value or "")
                continue
            if op == "$regex":
                regex_pattern = value
                continue

            if op == "$in":
                if not isinstance(value, list):
                    return None
                normalized_values = [_normalize_query_value(v, value_type) for v in value]
                clauses.append(column.in_(normalized_values))
                continue
            if op == "$ne":
                normalized_value = _normalize_query_value(value, value_type)
                clauses.append(column != normalized_value)
                continue
            if op == "$exists":
                exists_flag = bool(value)
                clauses.append(column.is_not(None) if exists_flag else column.is_(None))
                continue

            normalized_value = _normalize_query_value(value, value_type)
            if value_type == "datetime" and normalized_value is None and value is not None:
                return None

            if op == "$gt":
                clauses.append(column > normalized_value)
            elif op == "$gte":
                clauses.append(column >= normalized_value)
            elif op == "$lt":
                clauses.append(column < normalized_value)
            elif op == "$lte":
                clauses.append(column <= normalized_value)
            else:
                return None

        if regex_pattern is not None:
            like_value = _regex_pattern_to_like_value(regex_pattern)
            if like_value is None:
                return None
            target_col = cast(column, String) if value_type == "datetime" else column
            if "i" in regex_options.lower():
                clauses.append(target_col.ilike(like_value))
            else:
                clauses.append(target_col.like(like_value))

        if not clauses:
            return None
        return and_(*clauses)

    normalized_value = _normalize_query_value(raw_value, value_type)
    if value_type == "datetime" and normalized_value is None and raw_value is not None:
        return None
    return column == normalized_value


def _compile_query_clause(
    query: Optional[Dict[str, Any]],
    field_map: Dict[str, Tuple[Any, str]],
) -> Tuple[bool, Optional[Any]]:
    if not query:
        return True, None
    if not isinstance(query, dict):
        return False, None

    clauses: List[Any] = []
    for key, value in query.items():
        if key == "$and":
            if not isinstance(value, list):
                return False, None
            nested_clauses: List[Any] = []
            for item in value:
                supported, clause = _compile_query_clause(item, field_map)
                if not supported:
                    return False, None
                if clause is not None:
                    nested_clauses.append(clause)
            if nested_clauses:
                clauses.append(and_(*nested_clauses))
            continue
        if key == "$or":
            if not isinstance(value, list):
                return False, None
            nested_clauses = []
            for item in value:
                supported, clause = _compile_query_clause(item, field_map)
                if not supported:
                    return False, None
                if clause is not None:
                    nested_clauses.append(clause)
            if nested_clauses:
                clauses.append(or_(*nested_clauses))
            continue
        if key.startswith("$"):
            return False, None

        field_def = field_map.get(str(key))
        if field_def is None:
            return False, None
        column, value_type = field_def
        field_clause = _compile_field_clause(column, value, value_type)
        if field_clause is None:
            return False, None
        clauses.append(field_clause)

    if not clauses:
        return True, None
    return True, and_(*clauses)


def _compile_sort_columns(
    sort: Optional[List[Tuple[str, int]]],
    field_map: Dict[str, Tuple[Any, str]],
) -> Optional[List[Any]]:
    if not sort:
        return []
    order_by: List[Any] = []
    for field, direction in sort:
        field_def = field_map.get(str(field))
        if field_def is None:
            return None
        column, _ = field_def
        order_by.append(column.desc() if int(direction) == -1 else column.asc())
    return order_by


def _billing_mode_sql_expr() -> Any:
    expr = StudentYuranRecord.extra_data["billing_mode"]
    as_string = getattr(expr, "as_string", None)
    if callable(as_string):
        try:
            return as_string()
        except Exception:
            pass
    astext = getattr(expr, "astext", None)
    if astext is not None:
        return astext
    return cast(expr, String)


_SET_YURAN_KNOWN_FIELDS = {
    "_id",
    "tahun",
    "tingkatan",
    "nama",
    "categories",
    "total_amount",
    "total_islam",
    "total_bukan_islam",
    "is_active",
    "created_at",
    "updated_at",
    "deleted_at",
    "created_by",
    "created_by_name",
    "copied_from",
}


_YURAN_PAYMENTS_KNOWN_FIELDS = {
    "_id",
    "student_yuran_id",
    "student_id",
    "parent_id",
    "amount",
    "payment_type",
    "payment_method",
    "receipt_number",
    "description",
    "category_paid",
    "status",
    "payment_number",
    "max_payments",
    "excess_to_dana_kecemerlangan",
    "created_at",
    "created_by",
}


_STUDENT_YURAN_KNOWN_FIELDS = {
    "_id",
    "student_id",
    "parent_id",
    "set_yuran_id",
    "student_name",
    "matric_number",
    "tahun",
    "tingkatan",
    "set_yuran_nama",
    "religion",
    "items",
    "payments",
    "total_amount",
    "paid_amount",
    "balance",
    "status",
    "due_date",
    "installment_plan",
    "two_payment_plan",
    "last_payment_date",
    "created_at",
    "updated_at",
}


def _set_yuran_doc_to_row_values(normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
    extra_data = {k: v for k, v in normalized_doc.items() if k not in _SET_YURAN_KNOWN_FIELDS}
    raw_id = normalized_doc.get("_id")
    doc_id = str(raw_id) if raw_id is not None else str(ObjectId())

    return {
        "id": doc_id,
        "tahun": int(normalized_doc.get("tahun") or 0),
        "tingkatan": int(normalized_doc.get("tingkatan") or 0),
        "nama": str(normalized_doc.get("nama") or ""),
        "categories": normalized_doc.get("categories") or [],
        "total_amount": float(normalized_doc.get("total_amount") or 0.0),
        "total_islam": float(normalized_doc.get("total_islam") or 0.0),
        "total_bukan_islam": float(normalized_doc.get("total_bukan_islam") or 0.0),
        "is_active": bool(normalized_doc.get("is_active", True)),
        "created_at": _as_datetime(normalized_doc.get("created_at"), default_now=True),
        "updated_at": _as_datetime(normalized_doc.get("updated_at")),
        "deleted_at": _as_datetime(normalized_doc.get("deleted_at")),
        "created_by": (
            str(normalized_doc.get("created_by"))
            if normalized_doc.get("created_by") is not None
            else None
        ),
        "created_by_name": normalized_doc.get("created_by_name"),
        "copied_from": normalized_doc.get("copied_from"),
        "extra_data": extra_data,
    }


def _yuran_payment_doc_to_row_values(normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
    extra_data = {k: v for k, v in normalized_doc.items() if k not in _YURAN_PAYMENTS_KNOWN_FIELDS}
    raw_id = normalized_doc.get("_id")
    doc_id = str(raw_id) if raw_id is not None else str(ObjectId())

    student_yuran_id = normalized_doc.get("student_yuran_id")
    student_id = normalized_doc.get("student_id")
    parent_id = normalized_doc.get("parent_id")
    created_by = normalized_doc.get("created_by")

    return {
        "id": doc_id,
        "student_yuran_id": str(student_yuran_id) if student_yuran_id is not None else None,
        "student_id": str(student_id) if student_id is not None else None,
        "parent_id": str(parent_id) if parent_id is not None else None,
        "amount": float(normalized_doc.get("amount") or 0.0),
        "payment_type": normalized_doc.get("payment_type"),
        "payment_method": normalized_doc.get("payment_method"),
        "receipt_number": normalized_doc.get("receipt_number"),
        "description": normalized_doc.get("description"),
        "category_paid": normalized_doc.get("category_paid"),
        "status": normalized_doc.get("status"),
        "payment_number": (
            int(normalized_doc["payment_number"])
            if normalized_doc.get("payment_number") is not None
            else None
        ),
        "max_payments": (
            int(normalized_doc["max_payments"])
            if normalized_doc.get("max_payments") is not None
            else None
        ),
        "excess_to_dana_kecemerlangan": (
            float(normalized_doc["excess_to_dana_kecemerlangan"])
            if normalized_doc.get("excess_to_dana_kecemerlangan") is not None
            else None
        ),
        "created_at": _as_datetime(normalized_doc.get("created_at"), default_now=True),
        "created_by": str(created_by) if created_by is not None else None,
        "extra_data": extra_data,
    }


def _student_yuran_doc_to_row_values(normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
    extra_data = {k: v for k, v in normalized_doc.items() if k not in _STUDENT_YURAN_KNOWN_FIELDS}
    raw_id = normalized_doc.get("_id")
    doc_id = str(raw_id) if raw_id is not None else str(ObjectId())

    student_id = normalized_doc.get("student_id")
    parent_id = normalized_doc.get("parent_id")
    set_yuran_id = normalized_doc.get("set_yuran_id")

    total_amount = float(normalized_doc.get("total_amount") or 0.0)
    paid_amount = float(normalized_doc.get("paid_amount") or 0.0)
    fallback_balance = total_amount - paid_amount

    return {
        "id": doc_id,
        "student_id": str(student_id) if student_id is not None else None,
        "parent_id": str(parent_id) if parent_id is not None else None,
        "set_yuran_id": str(set_yuran_id) if set_yuran_id is not None else None,
        "student_name": normalized_doc.get("student_name"),
        "matric_number": normalized_doc.get("matric_number"),
        "tahun": int(normalized_doc.get("tahun") or 0),
        "tingkatan": int(normalized_doc.get("tingkatan") or 0),
        "set_yuran_nama": normalized_doc.get("set_yuran_nama"),
        "religion": normalized_doc.get("religion"),
        "items": normalized_doc.get("items") or [],
        "payments": normalized_doc.get("payments") or [],
        "total_amount": total_amount,
        "paid_amount": paid_amount,
        "balance": float(normalized_doc.get("balance")) if normalized_doc.get("balance") is not None else fallback_balance,
        "status": normalized_doc.get("status") or "pending",
        "due_date": normalized_doc.get("due_date"),
        "installment_plan": normalized_doc.get("installment_plan"),
        "two_payment_plan": normalized_doc.get("two_payment_plan"),
        "last_payment_date": _as_datetime(normalized_doc.get("last_payment_date")),
        "created_at": _as_datetime(normalized_doc.get("created_at"), default_now=True),
        "updated_at": _as_datetime(normalized_doc.get("updated_at")),
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
        return _apply_projection(doc, projection)

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


class RelationalSetYuranCollection(_BaseSqlCollection):
    _KNOWN_FIELDS = _SET_YURAN_KNOWN_FIELDS
    _QUERY_FIELD_MAP: Dict[str, Tuple[Any, str]] = {
        "_id": (SetYuranRecord.id, "id"),
        "tahun": (SetYuranRecord.tahun, "int"),
        "tingkatan": (SetYuranRecord.tingkatan, "int"),
        "nama": (SetYuranRecord.nama, "str"),
        "is_active": (SetYuranRecord.is_active, "bool"),
        "total_amount": (SetYuranRecord.total_amount, "float"),
        "total_islam": (SetYuranRecord.total_islam, "float"),
        "total_bukan_islam": (SetYuranRecord.total_bukan_islam, "float"),
        "created_at": (SetYuranRecord.created_at, "datetime"),
        "updated_at": (SetYuranRecord.updated_at, "datetime"),
        "deleted_at": (SetYuranRecord.deleted_at, "datetime"),
        "created_by": (SetYuranRecord.created_by, "str"),
        "created_by_name": (SetYuranRecord.created_by_name, "str"),
    }

    def __init__(self, core_store: CoreStore):
        session_factory = core_store.get_session_factory()
        if session_factory is None:
            raise ValueError("RelationalSetYuranCollection requires PostgreSQL session factory")
        super().__init__(session_factory)
        self._core_store = core_store
        self._mirror_collection = core_store.set_yuran

    def _row_to_doc(self, row: SetYuranRecord) -> Dict[str, Any]:
        doc: Dict[str, Any] = dict(row.extra_data or {})
        doc["_id"] = _restore_id(row.id)
        doc["tahun"] = row.tahun
        doc["tingkatan"] = row.tingkatan
        doc["nama"] = row.nama
        doc["categories"] = row.categories or []
        doc["total_amount"] = row.total_amount
        doc["total_islam"] = row.total_islam
        doc["total_bukan_islam"] = row.total_bukan_islam
        doc["is_active"] = row.is_active
        doc["created_at"] = _to_iso(row.created_at)
        if row.updated_at is not None:
            doc["updated_at"] = _to_iso(row.updated_at)
        if row.deleted_at is not None:
            doc["deleted_at"] = _to_iso(row.deleted_at)
        if row.created_by is not None:
            doc["created_by"] = row.created_by
        if row.created_by_name is not None:
            doc["created_by_name"] = row.created_by_name
        if row.copied_from is not None:
            doc["copied_from"] = row.copied_from
        return doc

    def _doc_to_row_values(self, normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
        return _set_yuran_doc_to_row_values(normalized_doc)

    async def _find_rows(self) -> List[SetYuranRecord]:
        async with self._session_factory() as session:
            rows = await session.scalars(select(SetYuranRecord))
            return list(rows.all())

    async def _find_docs(self, query: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        supported, condition = _compile_query_clause(query, self._QUERY_FIELD_MAP)
        if supported:
            stmt = select(SetYuranRecord)
            if condition is not None:
                stmt = stmt.where(condition)
            async with self._session_factory() as session:
                rows = await session.scalars(stmt)
                return [self._row_to_doc(row) for row in rows.all()]

        rows = await self._find_rows()
        docs: List[Dict[str, Any]] = []
        for row in rows:
            doc = self._row_to_doc(row)
            if _matches_query(doc, query):
                docs.append(doc)
        return docs

    async def find_one(
        self,
        query: Optional[Dict[str, Any]] = None,
        projection: Optional[Dict[str, Any]] = None,
        sort: Optional[List[Tuple[str, int]]] = None,
    ):
        supported, condition = _compile_query_clause(query, self._QUERY_FIELD_MAP)
        sort_columns = _compile_sort_columns(sort, self._QUERY_FIELD_MAP)
        if supported and sort_columns is not None:
            stmt = select(SetYuranRecord)
            if condition is not None:
                stmt = stmt.where(condition)
            if sort_columns:
                stmt = stmt.order_by(*sort_columns)
            stmt = stmt.limit(1)
            async with self._session_factory() as session:
                row = await session.scalar(stmt)
            if row is None:
                return None
            return _apply_projection(self._row_to_doc(row), projection)
        return await super().find_one(query=query, projection=projection, sort=sort)

    async def count_documents(self, query: Optional[Dict[str, Any]] = None) -> int:
        supported, condition = _compile_query_clause(query, self._QUERY_FIELD_MAP)
        if supported:
            stmt = select(func.count()).select_from(SetYuranRecord)
            if condition is not None:
                stmt = stmt.where(condition)
            async with self._session_factory() as session:
                return int((await session.scalar(stmt)) or 0)
        return await super().count_documents(query)

    async def distinct(self, field: str):
        field_def = self._QUERY_FIELD_MAP.get(str(field))
        if field_def is None:
            return await super().distinct(field)
        column, value_type = field_def
        stmt = select(column).distinct()
        async with self._session_factory() as session:
            values = list((await session.scalars(stmt)).all())
        result: List[Any] = []
        for value in values:
            if value_type == "id" and value is not None:
                result.append(_restore_id(value))
            else:
                result.append(value)
        return result

    async def _mirror_upsert(self, doc: Dict[str, Any]) -> None:
        if self._mirror_collection is None:
            return
        mirror_query = {"_id": _restore_id(str(doc.get("_id")))}
        mirror_payload = dict(doc)
        mirror_payload.pop("_id", None)
        try:
            await self._mirror_collection.update_one(mirror_query, {"$set": mirror_payload}, upsert=True)
        except Exception as exc:
            logger.warning("set_yuran mirror upsert failed: %s", exc)

    async def _mirror_delete(self, doc_id: str) -> None:
        if self._mirror_collection is None:
            return
        try:
            await self._mirror_collection.delete_one({"_id": _restore_id(doc_id)})
        except Exception as exc:
            logger.warning("set_yuran mirror delete failed: %s", exc)

    async def insert_one(self, doc: Dict[str, Any]) -> InsertOneResult:
        raw_doc = dict(doc)
        raw_id = raw_doc.get("_id")
        doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
        raw_doc["_id"] = doc_id
        normalized = _normalize_for_storage(raw_doc)
        row_values = self._doc_to_row_values(normalized)

        async with self._session_factory() as session:
            exists = await session.get(SetYuranRecord, doc_id)
            if exists is not None:
                raise ValueError(f"Duplicate key for set_yuran._id={doc_id}")
            session.add(SetYuranRecord(**row_values))
            await session.commit()

        await self._mirror_upsert(normalized)
        return InsertOneResult(inserted_id=_restore_id(doc_id))

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False) -> UpdateResult:
        target_doc = await self.find_one(query)
        if not target_doc:
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
                session.add(SetYuranRecord(**row_values))
                await session.commit()
            await self._mirror_upsert(normalized)
            return UpdateResult(matched_count=0, modified_count=1, upserted_id=_restore_id(doc_id))

        updated_doc = _apply_update_ops(target_doc, update)
        normalized = _normalize_for_storage(updated_doc)
        row_values = self._doc_to_row_values(normalized)
        doc_id = row_values["id"]

        async with self._session_factory() as session:
            row = await session.get(SetYuranRecord, doc_id)
            if row is None:
                session.add(SetYuranRecord(**row_values))
            else:
                for key, value in row_values.items():
                    setattr(row, key, value)
            await session.commit()

        await self._mirror_upsert(normalized)
        return UpdateResult(matched_count=1, modified_count=1, upserted_id=None)

    async def delete_one(self, query: Dict[str, Any]) -> DeleteResult:
        target_doc = await self.find_one(query)
        if not target_doc:
            return DeleteResult(deleted_count=0)
        target_id = str(target_doc.get("_id"))

        async with self._session_factory() as session:
            await session.execute(delete(SetYuranRecord).where(SetYuranRecord.id == target_id))
            await session.commit()

        await self._mirror_delete(target_id)
        return DeleteResult(deleted_count=1)


class RelationalYuranPaymentsCollection(_BaseSqlCollection):
    _KNOWN_FIELDS = _YURAN_PAYMENTS_KNOWN_FIELDS
    _QUERY_FIELD_MAP: Dict[str, Tuple[Any, str]] = {
        "_id": (YuranPaymentRecord.id, "id"),
        "student_yuran_id": (YuranPaymentRecord.student_yuran_id, "id"),
        "student_id": (YuranPaymentRecord.student_id, "id"),
        "parent_id": (YuranPaymentRecord.parent_id, "id"),
        "amount": (YuranPaymentRecord.amount, "float"),
        "payment_type": (YuranPaymentRecord.payment_type, "str"),
        "payment_method": (YuranPaymentRecord.payment_method, "str"),
        "receipt_number": (YuranPaymentRecord.receipt_number, "str"),
        "description": (YuranPaymentRecord.description, "str"),
        "category_paid": (YuranPaymentRecord.category_paid, "str"),
        "status": (YuranPaymentRecord.status, "str"),
        "payment_number": (YuranPaymentRecord.payment_number, "int"),
        "max_payments": (YuranPaymentRecord.max_payments, "int"),
        "excess_to_dana_kecemerlangan": (YuranPaymentRecord.excess_to_dana_kecemerlangan, "float"),
        "created_at": (YuranPaymentRecord.created_at, "datetime"),
        "created_by": (YuranPaymentRecord.created_by, "id"),
    }

    def __init__(self, core_store: CoreStore):
        session_factory = core_store.get_session_factory()
        if session_factory is None:
            raise ValueError("RelationalYuranPaymentsCollection requires PostgreSQL session factory")
        super().__init__(session_factory)
        self._mirror_collection = core_store.yuran_payments

    def _row_to_doc(self, row: YuranPaymentRecord) -> Dict[str, Any]:
        doc: Dict[str, Any] = dict(row.extra_data or {})
        doc["_id"] = _restore_id(row.id)
        doc["student_yuran_id"] = _restore_id(row.student_yuran_id) if row.student_yuran_id else None
        doc["student_id"] = _restore_id(row.student_id) if row.student_id else None
        doc["parent_id"] = _restore_id(row.parent_id) if row.parent_id else None
        doc["amount"] = row.amount
        doc["payment_type"] = row.payment_type
        doc["payment_method"] = row.payment_method
        doc["receipt_number"] = row.receipt_number
        doc["description"] = row.description
        doc["category_paid"] = row.category_paid
        doc["status"] = row.status
        if row.payment_number is not None:
            doc["payment_number"] = row.payment_number
        if row.max_payments is not None:
            doc["max_payments"] = row.max_payments
        if row.excess_to_dana_kecemerlangan is not None:
            doc["excess_to_dana_kecemerlangan"] = row.excess_to_dana_kecemerlangan
        doc["created_at"] = _to_iso(row.created_at)
        if row.created_by is not None:
            doc["created_by"] = _restore_id(row.created_by)
        return doc

    def _doc_to_row_values(self, normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
        return _yuran_payment_doc_to_row_values(normalized_doc)

    async def _find_rows(self) -> List[YuranPaymentRecord]:
        async with self._session_factory() as session:
            rows = await session.scalars(select(YuranPaymentRecord))
            return list(rows.all())

    async def _find_docs(self, query: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        supported, condition = _compile_query_clause(query, self._QUERY_FIELD_MAP)
        if supported:
            stmt = select(YuranPaymentRecord)
            if condition is not None:
                stmt = stmt.where(condition)
            async with self._session_factory() as session:
                rows = await session.scalars(stmt)
                return [self._row_to_doc(row) for row in rows.all()]

        rows = await self._find_rows()
        docs: List[Dict[str, Any]] = []
        for row in rows:
            doc = self._row_to_doc(row)
            if _matches_query(doc, query):
                docs.append(doc)
        return docs

    async def find_one(
        self,
        query: Optional[Dict[str, Any]] = None,
        projection: Optional[Dict[str, Any]] = None,
        sort: Optional[List[Tuple[str, int]]] = None,
    ):
        supported, condition = _compile_query_clause(query, self._QUERY_FIELD_MAP)
        sort_columns = _compile_sort_columns(sort, self._QUERY_FIELD_MAP)
        if supported and sort_columns is not None:
            stmt = select(YuranPaymentRecord)
            if condition is not None:
                stmt = stmt.where(condition)
            if sort_columns:
                stmt = stmt.order_by(*sort_columns)
            stmt = stmt.limit(1)
            async with self._session_factory() as session:
                row = await session.scalar(stmt)
            if row is None:
                return None
            return _apply_projection(self._row_to_doc(row), projection)
        return await super().find_one(query=query, projection=projection, sort=sort)

    async def count_documents(self, query: Optional[Dict[str, Any]] = None) -> int:
        supported, condition = _compile_query_clause(query, self._QUERY_FIELD_MAP)
        if supported:
            stmt = select(func.count()).select_from(YuranPaymentRecord)
            if condition is not None:
                stmt = stmt.where(condition)
            async with self._session_factory() as session:
                return int((await session.scalar(stmt)) or 0)
        return await super().count_documents(query)

    async def _mirror_upsert(self, doc: Dict[str, Any]) -> None:
        if self._mirror_collection is None:
            return
        mirror_query = {"_id": _restore_id(str(doc.get("_id")))}
        mirror_payload = dict(doc)
        mirror_payload.pop("_id", None)
        try:
            await self._mirror_collection.update_one(mirror_query, {"$set": mirror_payload}, upsert=True)
        except Exception as exc:
            logger.warning("yuran_payments mirror upsert failed: %s", exc)

    async def insert_one(self, doc: Dict[str, Any]) -> InsertOneResult:
        raw_doc = dict(doc)
        raw_id = raw_doc.get("_id")
        doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
        raw_doc["_id"] = doc_id
        normalized = _normalize_for_storage(raw_doc)
        row_values = self._doc_to_row_values(normalized)

        async with self._session_factory() as session:
            exists = await session.get(YuranPaymentRecord, doc_id)
            if exists is not None:
                raise ValueError(f"Duplicate key for yuran_payments._id={doc_id}")
            session.add(YuranPaymentRecord(**row_values))
            await session.commit()

        await self._mirror_upsert(normalized)
        return InsertOneResult(inserted_id=_restore_id(doc_id))


class RelationalStudentYuranCollection(_BaseSqlCollection):
    _KNOWN_FIELDS = _STUDENT_YURAN_KNOWN_FIELDS
    _QUERY_FIELD_MAP: Dict[str, Tuple[Any, str]] = {
        "_id": (StudentYuranRecord.id, "id"),
        "student_id": (StudentYuranRecord.student_id, "id"),
        "parent_id": (StudentYuranRecord.parent_id, "id"),
        "set_yuran_id": (StudentYuranRecord.set_yuran_id, "id"),
        "student_name": (StudentYuranRecord.student_name, "str"),
        "matric_number": (StudentYuranRecord.matric_number, "str"),
        "tahun": (StudentYuranRecord.tahun, "int"),
        "tingkatan": (StudentYuranRecord.tingkatan, "int"),
        "set_yuran_nama": (StudentYuranRecord.set_yuran_nama, "str"),
        "religion": (StudentYuranRecord.religion, "str"),
        "total_amount": (StudentYuranRecord.total_amount, "float"),
        "paid_amount": (StudentYuranRecord.paid_amount, "float"),
        "balance": (StudentYuranRecord.balance, "float"),
        "status": (StudentYuranRecord.status, "str"),
        "due_date": (StudentYuranRecord.due_date, "str"),
        "billing_mode": (_billing_mode_sql_expr(), "str"),
        "created_at": (StudentYuranRecord.created_at, "datetime"),
        "updated_at": (StudentYuranRecord.updated_at, "datetime"),
        "last_payment_date": (StudentYuranRecord.last_payment_date, "datetime"),
    }

    def __init__(self, core_store: CoreStore):
        session_factory = core_store.get_session_factory()
        if session_factory is None:
            raise ValueError("RelationalStudentYuranCollection requires PostgreSQL session factory")
        super().__init__(session_factory)
        self._mirror_collection = core_store.student_yuran

    def _row_to_doc(self, row: StudentYuranRecord) -> Dict[str, Any]:
        doc: Dict[str, Any] = dict(row.extra_data or {})
        doc["_id"] = _restore_id(row.id)
        doc["student_id"] = _restore_id(row.student_id) if row.student_id else None
        doc["parent_id"] = _restore_id(row.parent_id) if row.parent_id else None
        doc["set_yuran_id"] = _restore_id(row.set_yuran_id) if row.set_yuran_id else None
        doc["student_name"] = row.student_name
        doc["matric_number"] = row.matric_number
        doc["tahun"] = row.tahun
        doc["tingkatan"] = row.tingkatan
        doc["set_yuran_nama"] = row.set_yuran_nama
        doc["religion"] = row.religion
        doc["items"] = row.items or []
        doc["payments"] = row.payments or []
        doc["total_amount"] = row.total_amount
        doc["paid_amount"] = row.paid_amount
        doc["balance"] = row.balance
        doc["status"] = row.status
        if row.due_date is not None:
            doc["due_date"] = row.due_date
        if row.installment_plan is not None:
            doc["installment_plan"] = row.installment_plan
        if row.two_payment_plan is not None:
            doc["two_payment_plan"] = row.two_payment_plan
        if row.last_payment_date is not None:
            doc["last_payment_date"] = _to_iso(row.last_payment_date)
        doc["created_at"] = _to_iso(row.created_at)
        if row.updated_at is not None:
            doc["updated_at"] = _to_iso(row.updated_at)
        return doc

    def _doc_to_row_values(self, normalized_doc: Dict[str, Any]) -> Dict[str, Any]:
        return _student_yuran_doc_to_row_values(normalized_doc)

    async def _find_rows(self) -> List[StudentYuranRecord]:
        async with self._session_factory() as session:
            rows = await session.scalars(select(StudentYuranRecord))
            return list(rows.all())

    async def _find_docs(self, query: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        supported, condition = _compile_query_clause(query, self._QUERY_FIELD_MAP)
        if supported:
            stmt = select(StudentYuranRecord)
            if condition is not None:
                stmt = stmt.where(condition)
            async with self._session_factory() as session:
                rows = await session.scalars(stmt)
                return [self._row_to_doc(row) for row in rows.all()]

        rows = await self._find_rows()
        docs: List[Dict[str, Any]] = []
        for row in rows:
            doc = self._row_to_doc(row)
            if _matches_query(doc, query):
                docs.append(doc)
        return docs

    async def find_one(
        self,
        query: Optional[Dict[str, Any]] = None,
        projection: Optional[Dict[str, Any]] = None,
        sort: Optional[List[Tuple[str, int]]] = None,
    ):
        supported, condition = _compile_query_clause(query, self._QUERY_FIELD_MAP)
        sort_columns = _compile_sort_columns(sort, self._QUERY_FIELD_MAP)
        if supported and sort_columns is not None:
            stmt = select(StudentYuranRecord)
            if condition is not None:
                stmt = stmt.where(condition)
            if sort_columns:
                stmt = stmt.order_by(*sort_columns)
            stmt = stmt.limit(1)
            async with self._session_factory() as session:
                row = await session.scalar(stmt)
            if row is None:
                return None
            return _apply_projection(self._row_to_doc(row), projection)
        return await super().find_one(query=query, projection=projection, sort=sort)

    async def count_documents(self, query: Optional[Dict[str, Any]] = None) -> int:
        supported, condition = _compile_query_clause(query, self._QUERY_FIELD_MAP)
        if supported:
            stmt = select(func.count()).select_from(StudentYuranRecord)
            if condition is not None:
                stmt = stmt.where(condition)
            async with self._session_factory() as session:
                return int((await session.scalar(stmt)) or 0)
        return await super().count_documents(query)

    async def find_admin_page(
        self,
        *,
        tahun: Optional[int] = None,
        tingkatan: Optional[int] = None,
        status: Optional[str] = None,
        billing_mode: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        Fast path for admin yuran listing on large datasets.
        Executes filtering, counting and pagination in SQL to avoid
        in-memory full table scan.
        """
        page = max(1, int(page))
        limit = max(1, int(limit))
        offset = (page - 1) * limit

        filters = []
        if tahun is not None:
            filters.append(StudentYuranRecord.tahun == int(tahun))
        if tingkatan is not None:
            filters.append(StudentYuranRecord.tingkatan == int(tingkatan))
        if status:
            filters.append(StudentYuranRecord.status == str(status))

        search_value = str(search or "").strip()
        if search_value:
            like_value = f"%{search_value}%"
            filters.append(
                or_(
                    StudentYuranRecord.student_name.ilike(like_value),
                    StudentYuranRecord.matric_number.ilike(like_value),
                )
            )

        normalized_billing_mode = str(billing_mode or "").strip().lower()
        if normalized_billing_mode:
            billing_mode_expr = _billing_mode_sql_expr()
            if normalized_billing_mode in {
                "prebill_next_year",
                "prebill",
                "prebill_next_year_from_current_students",
            }:
                filters.append(billing_mode_expr == "prebill_next_year_from_current_students")
            elif normalized_billing_mode in {"semasa", "current", "standard"}:
                filters.append(
                    or_(
                        billing_mode_expr.is_(None),
                        billing_mode_expr == "",
                        billing_mode_expr.in_(
                            [
                                "standard",
                                "promotion_auto_assign",
                                "direct_target_cohort",
                            ]
                        ),
                    )
                )
            else:
                filters.append(billing_mode_expr == str(billing_mode))

        async with self._session_factory() as session:
            count_stmt = select(func.count()).select_from(StudentYuranRecord)
            if filters:
                count_stmt = count_stmt.where(*filters)
            total = int((await session.scalar(count_stmt)) or 0)

            page_stmt = (
                select(
                    StudentYuranRecord.id,
                    StudentYuranRecord.student_id,
                    StudentYuranRecord.student_name,
                    StudentYuranRecord.matric_number,
                    StudentYuranRecord.tahun,
                    StudentYuranRecord.tingkatan,
                    StudentYuranRecord.set_yuran_id,
                    StudentYuranRecord.set_yuran_nama,
                    StudentYuranRecord.religion,
                    StudentYuranRecord.total_amount,
                    StudentYuranRecord.paid_amount,
                    StudentYuranRecord.balance,
                    StudentYuranRecord.due_date,
                    StudentYuranRecord.status,
                    StudentYuranRecord.created_at,
                    StudentYuranRecord.extra_data,
                )
                .order_by(
                    StudentYuranRecord.tahun.desc(),
                    StudentYuranRecord.tingkatan.asc(),
                    StudentYuranRecord.student_name.asc(),
                )
                .offset(offset)
                .limit(limit)
            )
            if filters:
                page_stmt = page_stmt.where(*filters)

            rows = (await session.execute(page_stmt)).all()

        docs: List[Dict[str, Any]] = []
        for row in rows:
            extra_data = dict(row.extra_data or {})
            doc: Dict[str, Any] = {
                "_id": _restore_id(row.id),
                "student_id": _restore_id(row.student_id) if row.student_id else None,
                "student_name": row.student_name,
                "matric_number": row.matric_number,
                "tahun": row.tahun,
                "tingkatan": row.tingkatan,
                "set_yuran_id": _restore_id(row.set_yuran_id) if row.set_yuran_id else None,
                "set_yuran_nama": row.set_yuran_nama,
                "religion": row.religion,
                "total_amount": row.total_amount,
                "paid_amount": row.paid_amount,
                "balance": row.balance,
                "due_date": row.due_date,
                "status": row.status,
                "created_at": _to_iso(row.created_at),
            }
            if "billing_mode" in extra_data:
                doc["billing_mode"] = extra_data.get("billing_mode")
            if "billing_target_cohort" in extra_data:
                doc["billing_target_cohort"] = extra_data.get("billing_target_cohort")
            if "billing_source_cohort" in extra_data:
                doc["billing_source_cohort"] = extra_data.get("billing_source_cohort")
            docs.append(doc)

        return docs, total

    async def _mirror_upsert(self, doc: Dict[str, Any]) -> None:
        if self._mirror_collection is None:
            return
        mirror_query = {"_id": _restore_id(str(doc.get("_id")))}
        mirror_payload = dict(doc)
        mirror_payload.pop("_id", None)
        try:
            await self._mirror_collection.update_one(mirror_query, {"$set": mirror_payload}, upsert=True)
        except Exception as exc:
            logger.warning("student_yuran mirror upsert failed: %s", exc)

    async def _mirror_delete(self, doc_id: str) -> None:
        if self._mirror_collection is None:
            return
        try:
            await self._mirror_collection.delete_one({"_id": _restore_id(doc_id)})
        except Exception as exc:
            logger.warning("student_yuran mirror delete failed: %s", exc)

    async def insert_one(self, doc: Dict[str, Any]) -> InsertOneResult:
        raw_doc = dict(doc)
        raw_id = raw_doc.get("_id")
        doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
        raw_doc["_id"] = doc_id
        normalized = _normalize_for_storage(raw_doc)
        row_values = self._doc_to_row_values(normalized)

        async with self._session_factory() as session:
            exists = await session.get(StudentYuranRecord, doc_id)
            if exists is not None:
                raise ValueError(f"Duplicate key for student_yuran._id={doc_id}")
            session.add(StudentYuranRecord(**row_values))
            await session.commit()

        await self._mirror_upsert(normalized)
        return InsertOneResult(inserted_id=_restore_id(doc_id))

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False) -> UpdateResult:
        target_doc = await self.find_one(query)
        if not target_doc:
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
                session.add(StudentYuranRecord(**row_values))
                await session.commit()
            await self._mirror_upsert(normalized)
            return UpdateResult(matched_count=0, modified_count=1, upserted_id=_restore_id(doc_id))

        updated_doc = _apply_update_ops(target_doc, update)
        normalized = _normalize_for_storage(updated_doc)
        row_values = self._doc_to_row_values(normalized)
        doc_id = row_values["id"]

        async with self._session_factory() as session:
            row = await session.get(StudentYuranRecord, doc_id)
            if row is None:
                session.add(StudentYuranRecord(**row_values))
            else:
                for key, value in row_values.items():
                    setattr(row, key, value)
            await session.commit()

        await self._mirror_upsert(normalized)
        return UpdateResult(matched_count=1, modified_count=1, upserted_id=None)

    async def delete_one(self, query: Dict[str, Any]) -> DeleteResult:
        target_doc = await self.find_one(query)
        if not target_doc:
            return DeleteResult(deleted_count=0)
        target_id = str(target_doc.get("_id"))

        async with self._session_factory() as session:
            await session.execute(delete(StudentYuranRecord).where(StudentYuranRecord.id == target_id))
            await session.commit()

        await self._mirror_delete(target_id)
        return DeleteResult(deleted_count=1)


class YuranRelationalDbAdapter:
    """
    Adapter for yuran routes:
    - set_yuran -> relational table (with compatibility mirror)
    - yuran_payments -> relational table (with compatibility mirror)
    - student_yuran -> relational table (with compatibility mirror)
    - other collections -> delegated to original CoreStore/Mongo DB object
    """

    def __init__(self, db):
        self._db = db
        self._set_yuran_collection = None
        self._yuran_payments_collection = None
        self._student_yuran_collection = None
        if isinstance(db, CoreStore):
            session_factory = db.get_session_factory()
            if session_factory is not None and db.uses_postgres("set_yuran"):
                self._set_yuran_collection = RelationalSetYuranCollection(db)
            if session_factory is not None and db.uses_postgres("yuran_payments"):
                self._yuran_payments_collection = RelationalYuranPaymentsCollection(db)
            if session_factory is not None and db.uses_postgres("student_yuran"):
                self._student_yuran_collection = RelationalStudentYuranCollection(db)

    def __getattr__(self, name: str):
        if name == "set_yuran" and self._set_yuran_collection is not None:
            return self._set_yuran_collection
        if name == "yuran_payments" and self._yuran_payments_collection is not None:
            return self._yuran_payments_collection
        if name == "student_yuran" and self._student_yuran_collection is not None:
            return self._student_yuran_collection
        return getattr(self._db, name)

    def __getitem__(self, name: str):
        return self.__getattr__(name)

    def get_raw_db(self):
        return self._db


def adapt_yuran_read_db(db):
    if isinstance(db, CoreStore):
        session_factory = db.get_session_factory()
        if session_factory is not None:
            return YuranRelationalDbAdapter(db)
    return db


async def bootstrap_relational_yuran_tables(
    session_factory: Optional[async_sessionmaker[AsyncSession]],
) -> None:
    """
    One-way bootstrap from core_documents -> relational yuran tables.
    Safe to run repeatedly: existing IDs are skipped.
    """
    if session_factory is None:
        return

    async with session_factory() as session:
        set_count = await session.scalar(select(func.count()).select_from(SetYuranRecord))
        payment_count = await session.scalar(select(func.count()).select_from(YuranPaymentRecord))
        student_yuran_count = await session.scalar(select(func.count()).select_from(StudentYuranRecord))

        if (set_count or 0) == 0:
            set_rows = await session.scalars(
                select(CoreDocument).where(CoreDocument.collection_name == "set_yuran")
            )
            for row in set_rows.all():
                doc = dict(row.document or {})
                doc["_id"] = row.document_id
                normalized = _normalize_for_storage(doc)
                row_values = _set_yuran_doc_to_row_values(normalized)
                if await session.get(SetYuranRecord, row_values["id"]) is None:
                    session.add(SetYuranRecord(**row_values))

        if (payment_count or 0) == 0:
            payment_rows = await session.scalars(
                select(CoreDocument).where(CoreDocument.collection_name == "yuran_payments")
            )
            for row in payment_rows.all():
                doc = dict(row.document or {})
                doc["_id"] = row.document_id
                normalized = _normalize_for_storage(doc)
                row_values = _yuran_payment_doc_to_row_values(normalized)
                if await session.get(YuranPaymentRecord, row_values["id"]) is None:
                    session.add(YuranPaymentRecord(**row_values))

        if (student_yuran_count or 0) == 0:
            student_yuran_rows = await session.scalars(
                select(CoreDocument).where(CoreDocument.collection_name == "student_yuran")
            )
            for row in student_yuran_rows.all():
                doc = dict(row.document or {})
                doc["_id"] = row.document_id
                normalized = _normalize_for_storage(doc)
                row_values = _student_yuran_doc_to_row_values(normalized)
                if await session.get(StudentYuranRecord, row_values["id"]) is None:
                    session.add(StudentYuranRecord(**row_values))

        await session.commit()
