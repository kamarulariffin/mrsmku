from __future__ import annotations

import copy
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence, Tuple

from bson import ObjectId
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from models_sql.core_documents import CoreDocument


_OBJECT_ID_RE = re.compile(r"^[a-fA-F0-9]{24}$")


def _is_object_id_string(value: str) -> bool:
    return bool(_OBJECT_ID_RE.match(value))


def _to_comparable(value: Any) -> Any:
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _to_sort_key(value: Any) -> Tuple[int, Any]:
    """Build a stable sort key that tolerates mixed/None values."""
    comparable = _to_comparable(value)
    if comparable is None:
        return (0, "")
    if isinstance(comparable, bool):
        return (1, int(comparable))
    if isinstance(comparable, (int, float)):
        return (2, float(comparable))
    if isinstance(comparable, str):
        return (3, comparable)
    return (4, str(comparable))


def _extract_path_values(value: Any, tokens: List[str]) -> List[Any]:
    if not tokens:
        return [value]

    token = tokens[0]
    rest = tokens[1:]
    results: List[Any] = []

    if isinstance(value, dict):
        if token in value:
            results.extend(_extract_path_values(value[token], rest))
        return results

    if isinstance(value, list):
        if token.isdigit():
            idx = int(token)
            if 0 <= idx < len(value):
                results.extend(_extract_path_values(value[idx], rest))
            return results
        # For array of objects (e.g. "items.vendor_id"), apply token to each element.
        for item in value:
            results.extend(_extract_path_values(item, tokens))
        return results

    return results


def _get_field_values(doc: Dict[str, Any], key: str) -> Tuple[List[Any], bool]:
    if "." not in key:
        if key in doc:
            return [doc.get(key)], True
        return [], False

    tokens = [token for token in key.split(".") if token]
    if not tokens:
        return [], False
    values = _extract_path_values(doc, tokens)
    return values, len(values) > 0


def _get_sort_value(doc: Dict[str, Any], field: str) -> Any:
    values, exists = _get_field_values(doc, field)
    if not exists or not values:
        return None
    return values[0]


def _normalize_for_storage(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _normalize_for_storage(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_normalize_for_storage(v) for v in value]
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _deserialize_from_storage(doc: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(doc)
    raw_id = out.get("_id")
    if isinstance(raw_id, str) and _is_object_id_string(raw_id):
        out["_id"] = ObjectId(raw_id)
    for key, value in list(out.items()):
        if not isinstance(value, str):
            continue
        if key.endswith("_at") or key in {"created_at", "updated_at", "expires_at"}:
            try:
                out[key] = datetime.fromisoformat(value)
            except ValueError:
                pass
    return out


def _regex_matches(value: Any, pattern: str, options: str = "") -> bool:
    if value is None:
        return False
    flags = re.IGNORECASE if "i" in options else 0
    try:
        return re.search(pattern, str(value), flags=flags) is not None
    except re.error:
        return False


def _match_field(doc_value: Any, condition: Any) -> bool:
    doc_value_cmp = _to_comparable(doc_value)
    if isinstance(condition, dict):
        regex = condition.get("$regex")
        options = condition.get("$options", "")
        if regex is not None:
            return _regex_matches(doc_value_cmp, str(regex), str(options))
        if "$in" in condition:
            values = [_to_comparable(v) for v in condition["$in"]]
            if isinstance(doc_value, list):
                return any(_to_comparable(v) in values for v in doc_value)
            return doc_value_cmp in values
        if "$nin" in condition:
            values = [_to_comparable(v) for v in condition["$nin"]]
            if isinstance(doc_value, list):
                return all(_to_comparable(v) not in values for v in doc_value)
            return doc_value_cmp not in values
        if "$size" in condition:
            try:
                expected_size = int(condition["$size"])
            except Exception:
                return False
            return isinstance(doc_value, list) and len(doc_value) == expected_size
        if "$ne" in condition:
            return doc_value_cmp != _to_comparable(condition["$ne"])
        if "$exists" in condition:
            exists = bool(condition["$exists"])
            return (doc_value is not None) if exists else (doc_value is None)
        if "$gt" in condition:
            return doc_value_cmp is not None and doc_value_cmp > _to_comparable(condition["$gt"])
        if "$gte" in condition:
            return doc_value_cmp is not None and doc_value_cmp >= _to_comparable(condition["$gte"])
        if "$lt" in condition:
            return doc_value_cmp is not None and doc_value_cmp < _to_comparable(condition["$lt"])
        if "$lte" in condition:
            return doc_value_cmp is not None and doc_value_cmp <= _to_comparable(condition["$lte"])
    return doc_value_cmp == _to_comparable(condition)


def _match_values(values: List[Any], condition: Any, exists: bool) -> bool:
    if isinstance(condition, dict) and "$exists" in condition:
        expected_exists = bool(condition["$exists"])
        if expected_exists != exists:
            return False
        condition = {k: v for k, v in condition.items() if k != "$exists"}
        if not condition:
            return True

    if not exists:
        # Mongo behavior: missing field matches $ne/$nin.
        if isinstance(condition, dict):
            if "$ne" in condition or "$nin" in condition:
                return True
        return False

    # For array paths, emulate Mongo matching:
    # - normal conditions: any element matches
    # - negative conditions ($ne/$nin): all elements must satisfy
    if isinstance(condition, dict) and ("$ne" in condition or "$nin" in condition):
        return all(_match_field(v, condition) for v in values)
    return any(_match_field(v, condition) for v in values)


def _matches_query(doc: Dict[str, Any], query: Optional[Dict[str, Any]]) -> bool:
    if not query:
        return True
    for key, value in query.items():
        if key == "$or":
            if not any(_matches_query(doc, subq) for subq in value):
                return False
            continue
        if key == "$and":
            if not all(_matches_query(doc, subq) for subq in value):
                return False
            continue
        values, exists = _get_field_values(doc, key)
        if not _match_values(values, value, exists):
            return False
    return True


def _get_scalar_value(doc: Dict[str, Any], path: str) -> Any:
    values, exists = _get_field_values(doc, path)
    if not exists or not values:
        return None
    return values[0]


def _set_scalar_value(doc: Dict[str, Any], path: str, value: Any) -> None:
    tokens = [token for token in str(path).split(".") if token]
    if not tokens:
        return

    current: Any = doc
    for token in tokens[:-1]:
        if not isinstance(current, dict):
            return
        if token not in current or not isinstance(current[token], dict):
            current[token] = {}
        current = current[token]
    if isinstance(current, dict):
        current[tokens[-1]] = value


def _to_datetime_value(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        text = value.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(text)
        except ValueError:
            return None
    return None


def _to_number_value(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, bool):
        return float(int(value))
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value)
    except Exception:
        return 0.0


def _eval_agg_expr(doc: Dict[str, Any], expr: Any) -> Any:
    if isinstance(expr, str):
        if expr.startswith("$"):
            return _get_scalar_value(doc, expr[1:])
        return expr

    if isinstance(expr, dict):
        if "$toObjectId" in expr:
            raw = _eval_agg_expr(doc, expr["$toObjectId"])
            if isinstance(raw, ObjectId):
                return raw
            if isinstance(raw, str) and _is_object_id_string(raw):
                try:
                    return ObjectId(raw)
                except Exception:
                    return raw
            return raw
        if "$year" in expr:
            dt = _to_datetime_value(_eval_agg_expr(doc, expr["$year"]))
            return dt.year if dt else None
        if "$month" in expr:
            dt = _to_datetime_value(_eval_agg_expr(doc, expr["$month"]))
            return dt.month if dt else None
        if "$dayOfMonth" in expr:
            dt = _to_datetime_value(_eval_agg_expr(doc, expr["$dayOfMonth"]))
            return dt.day if dt else None
        if "$ifNull" in expr:
            options = expr["$ifNull"]
            if isinstance(options, list):
                for option in options:
                    value = _eval_agg_expr(doc, option)
                    if value is not None:
                        return value
                return None
            return _eval_agg_expr(doc, options)
        if "$toString" in expr:
            value = _eval_agg_expr(doc, expr["$toString"])
            return None if value is None else str(value)
        if "$multiply" in expr:
            terms = expr["$multiply"]
            if not isinstance(terms, list):
                terms = [terms]
            result = 1.0
            for term in terms:
                result *= _to_number_value(_eval_agg_expr(doc, term))
            return result
        if "$lte" in expr:
            terms = expr["$lte"]
            if isinstance(terms, list) and len(terms) == 2:
                left = _to_comparable(_eval_agg_expr(doc, terms[0]))
                right = _to_comparable(_eval_agg_expr(doc, terms[1]))
                if left is None or right is None:
                    return False
                try:
                    return left <= right
                except Exception:
                    return False
            return False
        if "$arrayElemAt" in expr:
            terms = expr["$arrayElemAt"]
            if isinstance(terms, list) and len(terms) == 2:
                arr_expr, idx_expr = terms
                arr_val: Any = None
                if isinstance(arr_expr, str) and arr_expr.startswith("$"):
                    values, exists = _get_field_values(doc, arr_expr[1:])
                    if exists:
                        if len(values) == 1 and isinstance(values[0], list):
                            arr_val = values[0]
                        else:
                            arr_val = values
                if arr_val is None:
                    arr_val = _eval_agg_expr(doc, arr_expr)
                if not isinstance(arr_val, list):
                    return None
                try:
                    idx = int(_to_number_value(_eval_agg_expr(doc, idx_expr)))
                except Exception:
                    return None
                if idx < 0:
                    idx = len(arr_val) + idx
                if 0 <= idx < len(arr_val):
                    return arr_val[idx]
            return None
        if "$dateFromString" in expr:
            spec = expr["$dateFromString"]
            if isinstance(spec, dict):
                date_value = _eval_agg_expr(doc, spec.get("dateString"))
            else:
                date_value = _eval_agg_expr(doc, spec)
            return _to_datetime_value(date_value)
        if "$subtract" in expr:
            terms = expr["$subtract"]
            if isinstance(terms, list) and len(terms) == 2:
                left = _eval_agg_expr(doc, terms[0])
                right = _eval_agg_expr(doc, terms[1])
                left_dt = _to_datetime_value(left)
                right_dt = _to_datetime_value(right)
                if left_dt and right_dt:
                    return (left_dt - right_dt).total_seconds() * 1000.0
                return _to_number_value(left) - _to_number_value(right)
            return None
        if "$abs" in expr:
            return abs(_to_number_value(_eval_agg_expr(doc, expr["$abs"])))

        # Object expression (e.g. {"year": {"$year": ...}, "type": "$type"})
        return {k: _eval_agg_expr(doc, v) for k, v in expr.items()}

    return expr


def _freeze_group_key(value: Any) -> Any:
    if isinstance(value, dict):
        return tuple((k, _freeze_group_key(v)) for k, v in sorted(value.items(), key=lambda item: item[0]))
    if isinstance(value, list):
        return tuple(_freeze_group_key(v) for v in value)
    return _to_comparable(value)


def _resolve_lookup_operand(doc: Dict[str, Any], operand: Any, variables: Dict[str, Any]) -> Any:
    if isinstance(operand, str):
        if operand.startswith("$$"):
            return variables.get(operand[2:])
        if operand.startswith("$"):
            return _get_scalar_value(doc, operand[1:])
        return operand
    if isinstance(operand, dict) and "$toObjectId" in operand:
        raw = _resolve_lookup_operand(doc, operand["$toObjectId"], variables)
        if isinstance(raw, ObjectId):
            return raw
        if isinstance(raw, str) and _is_object_id_string(raw):
            try:
                return ObjectId(raw)
            except Exception:
                return raw
    return operand


def _eval_lookup_expr(doc: Dict[str, Any], expr: Any, variables: Dict[str, Any]) -> bool:
    if isinstance(expr, dict) and "$eq" in expr:
        terms = expr.get("$eq") or []
        if not isinstance(terms, list) or len(terms) != 2:
            return False
        left = _resolve_lookup_operand(doc, terms[0], variables)
        right = _resolve_lookup_operand(doc, terms[1], variables)
        return _to_comparable(left) == _to_comparable(right)
    return False


def _parse_array_filters(array_filters: Optional[List[Dict[str, Any]]]) -> Dict[str, List[Tuple[str, Any]]]:
    parsed: Dict[str, List[Tuple[str, Any]]] = {}
    for raw_filter in array_filters or []:
        if not isinstance(raw_filter, dict):
            continue
        for raw_key, cond in raw_filter.items():
            key_text = str(raw_key)
            token, _, path = key_text.partition(".")
            parsed.setdefault(token, []).append((path, cond))
    return parsed


def _expand_positional_update_tokens(
    update: Dict[str, Any],
    query: Optional[Dict[str, Any]],
    array_filters: Optional[List[Dict[str, Any]]],
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Convert Mongo positional token paths (e.g. "variants.$.stock") into
    array-filter token form understood by the in-memory updater
    (e.g. "variants.$[pos_variants].stock").
    """
    merged_filters: List[Dict[str, Any]] = list(array_filters or [])
    transformed: Dict[str, Any] = {}
    token_created: Dict[str, bool] = {}

    for op, op_payload in (update or {}).items():
        if not isinstance(op_payload, dict):
            transformed[op] = op_payload
            continue

        next_payload: Dict[str, Any] = {}
        for raw_key, raw_value in op_payload.items():
            key = str(raw_key)
            if ".$." not in key:
                next_payload[key] = raw_value
                continue

            prefix, suffix = key.split(".$.", 1)
            token = f"pos_{prefix.replace('.', '_')}"
            next_key = f"{prefix}.$[{token}].{suffix}"
            next_payload[next_key] = raw_value

            if token_created.get(token):
                continue
            token_created[token] = True

            if not query:
                continue

            prefix_with_dot = f"{prefix}."
            for qk, qv in query.items():
                if not isinstance(qk, str):
                    continue
                if not qk.startswith(prefix_with_dot):
                    continue
                child_path = qk[len(prefix_with_dot) :]
                if not child_path or child_path.startswith("$"):
                    continue
                merged_filters.append({f"{token}.{child_path}": qv})

        transformed[op] = next_payload

    return transformed, merged_filters


def _matches_array_filter_item(item: Any, rules: List[Tuple[str, Any]]) -> bool:
    if not rules:
        return True
    if not isinstance(item, dict):
        return False
    for path, cond in rules:
        values, exists = _get_field_values(item, path) if path else ([item], True)
        if not _match_values(values, cond, exists):
            return False
    return True


def _inc_value(current: Any, delta: Any) -> Any:
    if isinstance(current, bool):
        current = int(current)
    if isinstance(delta, bool):
        delta = int(delta)
    try:
        return current + delta
    except Exception:
        try:
            return float(current or 0) + float(delta or 0)
        except Exception:
            return current


def _matches_pull_condition(item: Any, condition: Any) -> bool:
    if isinstance(condition, dict):
        # Operator style condition for scalar array values, e.g. {"$in": [...]}
        if any(str(k).startswith("$") for k in condition.keys()):
            return _match_field(item, condition)
        # Document-style condition for array of objects, e.g. {"filename": "..."}
        if isinstance(item, dict):
            return _matches_query(item, condition)
        return False
    return _to_comparable(item) == _to_comparable(condition)


def _apply_path_op(
    target: Any,
    tokens: List[str],
    op: str,
    value: Any,
    array_filters: Dict[str, List[Tuple[str, Any]]],
) -> None:
    if not tokens:
        return

    token = tokens[0]
    rest = tokens[1:]
    is_last = len(tokens) == 1

    if isinstance(target, list):
        # Filtered positional token: $[elem]
        if token.startswith("$[") and token.endswith("]"):
            filter_token = token[2:-1]
            rules = array_filters.get(filter_token, [])
            for item in target:
                if _matches_array_filter_item(item, rules):
                    _apply_path_op(item, rest, op, value, array_filters)
            return

        # Numeric index
        if token.isdigit():
            idx = int(token)
            if 0 <= idx < len(target):
                if is_last:
                    if op == "set":
                        target[idx] = value
                    elif op == "inc":
                        target[idx] = _inc_value(target[idx], value)
                    elif op == "unset":
                        target[idx] = None
                    elif op == "push":
                        existing = target[idx]
                        if not isinstance(existing, list):
                            existing = [] if existing is None else [existing]
                        existing.append(value)
                        target[idx] = existing
                else:
                    _apply_path_op(target[idx], rest, op, value, array_filters)
            return

        # If token is field name but current value is list, recurse into each element.
        for item in target:
            _apply_path_op(item, tokens, op, value, array_filters)
        return

    if not isinstance(target, dict):
        return

    if is_last:
        if op == "set":
            target[token] = value
        elif op == "unset":
            target.pop(token, None)
        elif op == "inc":
            target[token] = _inc_value(target.get(token, 0), value)
        elif op == "push":
            existing = target.get(token)
            if not isinstance(existing, list):
                existing = [] if existing is None else [existing]
            existing.append(value)
            target[token] = existing
        return

    next_token = rest[0]
    child = target.get(token)
    if child is None:
        child = [] if (next_token.startswith("$[") and next_token.endswith("]")) else {}
        target[token] = child
    _apply_path_op(child, rest, op, value, array_filters)


def _apply_update_ops(
    doc: Dict[str, Any],
    update: Dict[str, Any],
    query: Optional[Dict[str, Any]] = None,
    array_filters: Optional[List[Dict[str, Any]]] = None,
    is_upsert_insert: bool = False,
) -> Dict[str, Any]:
    out = dict(doc)
    normalized_update, merged_array_filters = _expand_positional_update_tokens(update, query, array_filters)
    parsed_array_filters = _parse_array_filters(merged_array_filters)

    set_data = normalized_update.get("$set", {})
    for k, v in set_data.items():
        key = str(k)
        if "." in key or "$[" in key:
            _apply_path_op(out, [t for t in key.split(".") if t], "set", v, parsed_array_filters)
        else:
            out[key] = v

    if is_upsert_insert:
        set_on_insert_data = normalized_update.get("$setOnInsert", {})
        for k, v in set_on_insert_data.items():
            key = str(k)
            if "." in key or "$[" in key:
                _apply_path_op(out, [t for t in key.split(".") if t], "set", v, parsed_array_filters)
            else:
                out[key] = v

    unset_data = normalized_update.get("$unset", {})
    for k in unset_data.keys():
        key = str(k)
        if "." in key or "$[" in key:
            _apply_path_op(out, [t for t in key.split(".") if t], "unset", None, parsed_array_filters)
        else:
            out.pop(key, None)

    push_data = normalized_update.get("$push", {})
    for k, v in push_data.items():
        values_to_push: List[Any]
        if isinstance(v, dict) and isinstance(v.get("$each"), list):
            values_to_push = list(v.get("$each") or [])
        else:
            values_to_push = [v]

        key = str(k)
        if "." in key or "$[" in key:
            for push_value in values_to_push:
                _apply_path_op(
                    out,
                    [t for t in key.split(".") if t],
                    "push",
                    push_value,
                    parsed_array_filters,
                )
            continue
        existing = out.get(key)
        if not isinstance(existing, list):
            existing = [] if existing is None else [existing]
        existing.extend(values_to_push)
        out[key] = existing

    pull_data = normalized_update.get("$pull", {})
    for k, v in pull_data.items():
        key = str(k)
        # Keep implementation intentionally simple for current usage:
        # only top-level array fields are pulled in this migration phase.
        if "." in key or "$[" in key:
            continue
        existing = out.get(key)
        if not isinstance(existing, list):
            continue
        out[key] = [item for item in existing if not _matches_pull_condition(item, v)]

    inc_data = normalized_update.get("$inc", {})
    for k, v in inc_data.items():
        key = str(k)
        if "." in key or "$[" in key:
            _apply_path_op(out, [t for t in key.split(".") if t], "inc", v, parsed_array_filters)
            continue
        out[key] = _inc_value(out.get(key, 0), v)

    return out


@dataclass
class InsertOneResult:
    inserted_id: Any


@dataclass
class InsertManyResult:
    inserted_ids: List[Any]


@dataclass
class UpdateResult:
    matched_count: int
    modified_count: int
    upserted_id: Optional[Any] = None


@dataclass
class DeleteResult:
    deleted_count: int


class _CoreCursor:
    def __init__(
        self,
        collection: "CoreCollection",
        query: Optional[Dict[str, Any]] = None,
        projection: Optional[Dict[str, Any]] = None,
    ):
        self._collection = collection
        self._query = query or {}
        self._projection = projection
        self._sort_spec: List[Tuple[str, int]] = []
        self._skip = 0
        self._limit: Optional[int] = None
        self._iter_docs: Optional[List[Dict[str, Any]]] = None
        self._iter_index = 0

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

    def _apply_projection(self, docs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not isinstance(self._projection, dict) or not self._projection:
            return docs

        include_fields = {k for k, v in self._projection.items() if bool(v) and k != "_id"}
        exclude_fields = {k for k, v in self._projection.items() if (not bool(v)) and k != "_id"}
        include_id = self._projection.get("_id", 1) not in (0, False)

        projected: List[Dict[str, Any]] = []
        for d in docs:
            if include_fields:
                out = {k: v for k, v in d.items() if k in include_fields}
                if include_id and "_id" in d:
                    out["_id"] = d["_id"]
            elif exclude_fields:
                out = {k: v for k, v in d.items() if k not in exclude_fields}
                if not include_id:
                    out.pop("_id", None)
            else:
                out = dict(d)
                if not include_id:
                    out.pop("_id", None)
            projected.append(out)
        return projected

    async def _materialize_docs(self) -> List[Dict[str, Any]]:
        docs = await self._collection._find_docs(self._query)
        docs = self._apply_projection(docs)
        if self._sort_spec:
            for field, direction in reversed(self._sort_spec):
                docs.sort(
                    key=lambda d: _to_sort_key(_get_sort_value(d, field)),
                    reverse=(direction == -1),
                )
        if self._skip:
            docs = docs[self._skip :]
        return docs

    async def to_list(self, n: Optional[int] = None, **kwargs):
        docs = await self._materialize_docs()
        if n is None:
            n = kwargs.get("length")
        if n is None:
            n = len(docs)
        max_n = self._limit if self._limit is not None else int(n)
        docs = docs[: max_n if max_n is not None else len(docs)]
        return docs

    def __aiter__(self):
        self._iter_docs = None
        self._iter_index = 0
        return self

    async def __anext__(self):
        if self._iter_docs is None:
            self._iter_docs = await self.to_list()
        if self._iter_index >= len(self._iter_docs):
            raise StopAsyncIteration
        item = self._iter_docs[self._iter_index]
        self._iter_index += 1
        return item


class _AggregateCursor:
    def __init__(self, collection: "CoreCollection", pipeline: Sequence[Dict[str, Any]]):
        self._collection = collection
        self._pipeline = list(pipeline or [])
        self._iter_docs: Optional[List[Dict[str, Any]]] = None
        self._iter_index = 0

    async def _get_lookup_docs(self, collection_name: str) -> List[Dict[str, Any]]:
        # Prefer CoreStore lookup for Postgres-backed collections.
        store = getattr(self._collection, "_store", None)
        if store is not None:
            target = store[collection_name]
            if isinstance(target, CoreCollection):
                return await target._find_docs({})
            cursor = target.find({})
            return await cursor.to_list(500000)

        # Fallback to Mongo collection/database if available.
        mongo_collection = getattr(self._collection, "_mongo_collection", None)
        if mongo_collection is None:
            return []
        try:
            target = mongo_collection.database[collection_name]
            return await target.find({}).to_list(500000)
        except Exception:
            return []

    async def to_list(self, n: Optional[int] = None, **kwargs):
        docs = await self._collection._find_docs({})
        current = docs
        for stage in self._pipeline:
            if "$match" in stage:
                query = stage["$match"] or {}
                current = [d for d in current if _matches_query(d, query)]
                continue
            if "$project" in stage:
                spec = stage["$project"] or {}
                if not isinstance(spec, dict):
                    continue

                projected: List[Dict[str, Any]] = []
                include_id = not (("_id" in spec) and (spec.get("_id") in (0, False)))

                for row in current:
                    out: Dict[str, Any] = {}
                    for out_field, out_expr in spec.items():
                        if out_field == "_id" and out_expr in (0, False):
                            continue
                        if out_expr in (1, True):
                            out[out_field] = _get_scalar_value(row, str(out_field))
                            continue
                        if out_expr in (0, False):
                            continue
                        out[out_field] = _eval_agg_expr(row, out_expr)

                    if include_id and "_id" in row and "_id" not in out:
                        out["_id"] = row["_id"]
                    projected.append(out)

                current = projected
                continue
            if "$addFields" in stage or "$set" in stage:
                spec = stage.get("$addFields")
                if spec is None:
                    spec = stage.get("$set")
                if not isinstance(spec, dict):
                    continue
                updated: List[Dict[str, Any]] = []
                for row in current:
                    out = dict(row)
                    for out_field, out_expr in spec.items():
                        _set_scalar_value(out, str(out_field), _eval_agg_expr(out, out_expr))
                    updated.append(out)
                current = updated
                continue
            if "$lookup" in stage:
                spec = stage["$lookup"] or {}
                from_collection = spec.get("from")
                as_field = spec.get("as")
                if not (from_collection and as_field):
                    continue

                foreign_docs = await self._get_lookup_docs(str(from_collection))
                local_field = spec.get("localField")
                foreign_field = spec.get("foreignField")

                # Classic lookup form: localField + foreignField.
                if local_field and foreign_field:
                    index: Dict[Any, List[Dict[str, Any]]] = {}
                    for row in foreign_docs:
                        key = _to_comparable(_get_scalar_value(row, str(foreign_field)))
                        index.setdefault(key, []).append(dict(row))

                    joined: List[Dict[str, Any]] = []
                    for row in current:
                        local_key = _to_comparable(_get_scalar_value(row, str(local_field)))
                        doc = dict(row)
                        doc[str(as_field)] = index.get(local_key, [])
                        joined.append(doc)
                    current = joined
                    continue

                # Pipeline lookup form: let + pipeline + $expr ($eq) support.
                pipeline = spec.get("pipeline") or []
                let_bindings = spec.get("let") or {}
                joined: List[Dict[str, Any]] = []
                for row in current:
                    variables: Dict[str, Any] = {
                        str(var_name): _eval_agg_expr(row, var_expr)
                        for var_name, var_expr in let_bindings.items()
                    }

                    matched_docs = [dict(fd) for fd in foreign_docs]
                    for lookup_stage in pipeline:
                        if "$match" not in lookup_stage:
                            continue
                        match_spec = lookup_stage["$match"] or {}
                        expr = match_spec.get("$expr")
                        plain_match = {k: v for k, v in match_spec.items() if k != "$expr"}
                        if expr is not None:
                            matched_docs = [
                                fd for fd in matched_docs if _eval_lookup_expr(fd, expr, variables)
                            ]
                        if plain_match:
                            matched_docs = [fd for fd in matched_docs if _matches_query(fd, plain_match)]

                    doc = dict(row)
                    doc[str(as_field)] = matched_docs
                    joined.append(doc)
                current = joined
                continue
            if "$unwind" in stage:
                spec = stage["$unwind"]
                preserve = False
                if isinstance(spec, str):
                    path = spec
                elif isinstance(spec, dict):
                    path = spec.get("path")
                    preserve = bool(spec.get("preserveNullAndEmptyArrays"))
                else:
                    continue

                if not path:
                    continue
                path = str(path)
                if path.startswith("$"):
                    path = path[1:]

                expanded: List[Dict[str, Any]] = []
                for row in current:
                    value = _get_scalar_value(row, path)
                    if isinstance(value, list):
                        if value:
                            for item in value:
                                doc = copy.deepcopy(row)
                                _set_scalar_value(doc, path, item)
                                expanded.append(doc)
                        elif preserve:
                            doc = copy.deepcopy(row)
                            _set_scalar_value(doc, path, None)
                            expanded.append(doc)
                        continue

                    if value is None:
                        if preserve:
                            doc = copy.deepcopy(row)
                            _set_scalar_value(doc, path, None)
                            expanded.append(doc)
                        continue

                    # Scalar value behaves like a single unwind element.
                    expanded.append(dict(row))
                current = expanded
                continue
            if "$group" in stage:
                spec = stage["$group"]
                gid_expr = spec.get("_id")
                groups: Dict[Any, Dict[str, Any]] = {}
                avg_meta: Dict[Any, Dict[str, List[float]]] = {}
                for d in current:
                    gid = _eval_agg_expr(d, gid_expr)
                    gid_key = _freeze_group_key(gid)
                    if gid_key not in groups:
                        groups[gid_key] = {"_id": gid}
                        for out_field, out_expr in spec.items():
                            if out_field != "_id":
                                if isinstance(out_expr, dict) and "$first" in out_expr:
                                    groups[gid_key][out_field] = None
                                elif isinstance(out_expr, dict) and "$max" in out_expr:
                                    groups[gid_key][out_field] = None
                                elif isinstance(out_expr, dict) and "$push" in out_expr:
                                    groups[gid_key][out_field] = []
                                elif isinstance(out_expr, dict) and "$avg" in out_expr:
                                    groups[gid_key][out_field] = None
                                    avg_meta.setdefault(gid_key, {})[out_field] = [0.0, 0.0]
                                else:
                                    groups[gid_key][out_field] = 0
                    for out_field, expr in spec.items():
                        if out_field == "_id":
                            continue
                        if isinstance(expr, dict) and "$sum" in expr:
                            v = _to_number_value(_eval_agg_expr(d, expr["$sum"]))
                            groups[gid_key][out_field] += v
                        elif (
                            isinstance(expr, dict)
                            and "$first" in expr
                            and groups[gid_key].get(out_field) is None
                        ):
                            groups[gid_key][out_field] = _eval_agg_expr(d, expr["$first"])
                        elif isinstance(expr, dict) and "$max" in expr:
                            candidate = _eval_agg_expr(d, expr["$max"])
                            existing = groups[gid_key].get(out_field)
                            if existing is None:
                                groups[gid_key][out_field] = candidate
                            else:
                                try:
                                    if _to_comparable(candidate) > _to_comparable(existing):
                                        groups[gid_key][out_field] = candidate
                                except Exception:
                                    pass
                        elif isinstance(expr, dict) and "$push" in expr:
                            groups[gid_key].setdefault(out_field, [])
                            groups[gid_key][out_field].append(_eval_agg_expr(d, expr["$push"]))
                        elif isinstance(expr, dict) and "$avg" in expr:
                            value = _eval_agg_expr(d, expr["$avg"])
                            if value is None:
                                continue
                            try:
                                numeric = float(value)
                            except Exception:
                                continue
                            field_meta = avg_meta.setdefault(gid_key, {}).setdefault(out_field, [0.0, 0.0])
                            field_meta[0] += numeric
                            field_meta[1] += 1.0
                for gid_key, fields in avg_meta.items():
                    row = groups.get(gid_key)
                    if row is None:
                        continue
                    for out_field, (sum_value, count_value) in fields.items():
                        row[out_field] = (sum_value / count_value) if count_value > 0 else None
                current = list(groups.values())
                continue
            if "$sort" in stage:
                sort_spec = stage["$sort"]
                for field, direction in reversed(list(sort_spec.items())):
                    current.sort(
                        key=lambda d: _to_sort_key(_get_sort_value(d, str(field))),
                        reverse=(int(direction) == -1),
                    )
                continue
            if "$limit" in stage:
                try:
                    current = current[: max(0, int(stage["$limit"]))]
                except Exception:
                    pass
                continue
            if "$count" in stage:
                field_name = stage["$count"] or "count"
                field_name = str(field_name)
                current = [{field_name: len(current)}] if current else []
                continue
        if n is None:
            n = kwargs.get("length")
        if n is None:
            n = len(current)
        return current[: int(n)]

    def __aiter__(self):
        self._iter_docs = None
        self._iter_index = 0
        return self

    async def __anext__(self):
        if self._iter_docs is None:
            self._iter_docs = await self.to_list()
        if self._iter_index >= len(self._iter_docs):
            raise StopAsyncIteration
        item = self._iter_docs[self._iter_index]
        self._iter_index += 1
        return item


class CoreCollection:
    def __init__(
        self,
        collection_name: str,
        session_factory: async_sessionmaker[AsyncSession],
        mongo_collection=None,
        mirror_writes: bool = False,
        store: Optional["CoreStore"] = None,
    ):
        self.collection_name = collection_name
        self._session_factory = session_factory
        self._mongo_collection = mongo_collection
        self._mirror_writes = mirror_writes
        self._store = store

    async def _find_rows(self) -> List[CoreDocument]:
        async with self._session_factory() as session:
            rows = await session.scalars(
                select(CoreDocument).where(CoreDocument.collection_name == self.collection_name)
            )
            return list(rows.all())

    async def _find_docs(self, query: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        rows = await self._find_rows()
        docs: List[Dict[str, Any]] = []
        for row in rows:
            doc = dict(row.document or {})
            doc["_id"] = row.document_id
            if _matches_query(doc, query):
                docs.append(_deserialize_from_storage(doc))
        return docs

    def find(
        self,
        query: Optional[Dict[str, Any]] = None,
        projection: Optional[Dict[str, Any]] = None,
        **_kwargs,
    ):
        return _CoreCursor(self, query=query, projection=projection)

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
                    key=lambda d: _to_sort_key(_get_sort_value(d, str(field))),
                    reverse=(int(direction) == -1),
                )
        if not docs:
            return None
        doc = docs[0]
        if projection:
            include_fields = {k for k, v in projection.items() if v}
            if include_fields:
                filtered = {k: v for k, v in doc.items() if k in include_fields or k == "_id"}
                return filtered
        return doc

    async def count_documents(self, query: Optional[Dict[str, Any]] = None) -> int:
        docs = await self._find_docs(query)
        return len(docs)

    async def distinct(
        self,
        field: str,
        query: Optional[Dict[str, Any]] = None,
        **kwargs,
    ):
        # Motor/PyMongo compatibility: allow both positional filter arg and filter= kwarg.
        if query is None:
            query = kwargs.get("filter")
        docs = await self._find_docs(query or {})
        values = []
        seen = set()
        for d in docs:
            v = d.get(field)
            key = _to_comparable(v)
            if key not in seen:
                seen.add(key)
                values.append(v)
        return values

    async def insert_one(self, doc: Dict[str, Any]) -> InsertOneResult:
        raw_doc = dict(doc)
        raw_id = raw_doc.get("_id")
        doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
        raw_doc["_id"] = doc_id
        normalized = _normalize_for_storage(raw_doc)
        payload = dict(normalized)
        payload.pop("_id", None)

        async with self._session_factory() as session:
            exists = await session.get(CoreDocument, {"collection_name": self.collection_name, "document_id": doc_id})
            if exists is not None:
                raise ValueError(f"Duplicate key for {self.collection_name}._id={doc_id}")
            session.add(
                CoreDocument(
                    collection_name=self.collection_name,
                    document_id=doc_id,
                    document=payload,
                )
            )
            await session.commit()

        if self._mirror_writes and self._mongo_collection is not None:
            mirror_doc = _normalize_for_storage(doc)
            mirror_doc["_id"] = ObjectId(doc_id) if _is_object_id_string(doc_id) else doc_id
            try:
                await self._mongo_collection.insert_one(mirror_doc)
            except Exception:
                pass

        inserted_id = ObjectId(doc_id) if _is_object_id_string(doc_id) else doc_id
        return InsertOneResult(inserted_id=inserted_id)

    async def insert_many(self, docs: List[Dict[str, Any]], ordered: bool = True) -> InsertManyResult:
        inserted_ids: List[Any] = []
        for doc in docs:
            try:
                result = await self.insert_one(doc)
                inserted_ids.append(result.inserted_id)
            except Exception:
                if ordered:
                    raise
        return InsertManyResult(inserted_ids=inserted_ids)

    async def update_one(
        self,
        query: Dict[str, Any],
        update: Dict[str, Any],
        upsert: bool = False,
        array_filters: Optional[List[Dict[str, Any]]] = None,
        **_kwargs,
    ) -> UpdateResult:
        rows = await self._find_rows()
        target_row = None
        target_doc = None
        for row in rows:
            doc = dict(row.document or {})
            doc["_id"] = row.document_id
            if _matches_query(doc, query):
                target_row = row
                target_doc = doc
                break

        upserted_id = None
        matched_count = 1 if target_row is not None else 0
        modified_count = 0

        async with self._session_factory() as session:
            if target_row is None:
                if not upsert:
                    return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)
                base_doc = {}
                for k, v in (query or {}).items():
                    if not k.startswith("$") and not isinstance(v, dict):
                        base_doc[k] = v
                new_doc = _apply_update_ops(
                    base_doc,
                    update,
                    query=query,
                    array_filters=array_filters,
                    is_upsert_insert=True,
                )
                raw_id = new_doc.get("_id")
                doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
                new_doc["_id"] = doc_id
                payload = _normalize_for_storage(new_doc)
                payload.pop("_id", None)
                session.add(
                    CoreDocument(
                        collection_name=self.collection_name,
                        document_id=doc_id,
                        document=payload,
                    )
                )
                await session.commit()
                upserted_id = ObjectId(doc_id) if _is_object_id_string(doc_id) else doc_id
                if self._mirror_writes and self._mongo_collection is not None:
                    try:
                        await self._mongo_collection.update_one(query, update, upsert=True, array_filters=array_filters)
                    except Exception:
                        pass
                return UpdateResult(matched_count=0, modified_count=1, upserted_id=upserted_id)

            assert target_doc is not None
            updated_doc = _apply_update_ops(target_doc, update, query=query, array_filters=array_filters)
            doc_id = str(updated_doc.get("_id"))
            payload = _normalize_for_storage(updated_doc)
            payload.pop("_id", None)

            row_for_update = await session.get(
                CoreDocument, {"collection_name": self.collection_name, "document_id": str(target_row.document_id)}
            )
            if row_for_update is None:
                return UpdateResult(matched_count=matched_count, modified_count=0, upserted_id=None)
            row_for_update.document_id = doc_id
            row_for_update.document = payload
            await session.commit()
            modified_count = 1

        if self._mirror_writes and self._mongo_collection is not None:
            try:
                await self._mongo_collection.update_one(query, update, upsert=upsert, array_filters=array_filters)
            except Exception:
                pass
        return UpdateResult(matched_count=matched_count, modified_count=modified_count, upserted_id=upserted_id)

    async def update_many(
        self,
        query: Dict[str, Any],
        update: Dict[str, Any],
        upsert: bool = False,
        array_filters: Optional[List[Dict[str, Any]]] = None,
        **_kwargs,
    ) -> UpdateResult:
        rows = await self._find_rows()
        matched_rows: List[Tuple[str, Dict[str, Any]]] = []
        for row in rows:
            doc = dict(row.document or {})
            doc["_id"] = row.document_id
            if _matches_query(doc, query):
                matched_rows.append((str(row.document_id), doc))

        matched_count = len(matched_rows)
        modified_count = 0
        upserted_id = None

        if matched_count == 0 and upsert:
            base_doc = {}
            for k, v in (query or {}).items():
                if not k.startswith("$") and not isinstance(v, dict):
                    base_doc[k] = v
            new_doc = _apply_update_ops(
                base_doc,
                update,
                query=query,
                array_filters=array_filters,
                is_upsert_insert=True,
            )
            raw_id = new_doc.get("_id")
            doc_id = str(raw_id) if raw_id is not None else str(ObjectId())
            new_doc["_id"] = doc_id
            payload = _normalize_for_storage(new_doc)
            payload.pop("_id", None)
            async with self._session_factory() as session:
                session.add(
                    CoreDocument(
                        collection_name=self.collection_name,
                        document_id=doc_id,
                        document=payload,
                    )
                )
                await session.commit()
            modified_count = 1
            upserted_id = ObjectId(doc_id) if _is_object_id_string(doc_id) else doc_id
            if self._mirror_writes and self._mongo_collection is not None:
                try:
                    await self._mongo_collection.update_many(
                        query,
                        update,
                        upsert=True,
                        array_filters=array_filters,
                    )
                except Exception:
                    pass
            return UpdateResult(matched_count=0, modified_count=1, upserted_id=upserted_id)

        if matched_count == 0:
            return UpdateResult(matched_count=0, modified_count=0, upserted_id=None)

        async with self._session_factory() as session:
            for current_id, source_doc in matched_rows:
                updated_doc = _apply_update_ops(source_doc, update, query=query, array_filters=array_filters)
                doc_id = str(updated_doc.get("_id"))
                payload = _normalize_for_storage(updated_doc)
                payload.pop("_id", None)
                row_for_update = await session.get(
                    CoreDocument,
                    {"collection_name": self.collection_name, "document_id": current_id},
                )
                if row_for_update is None:
                    continue
                row_for_update.document_id = doc_id
                row_for_update.document = payload
                modified_count += 1
            await session.commit()

        if self._mirror_writes and self._mongo_collection is not None:
            try:
                await self._mongo_collection.update_many(
                    query,
                    update,
                    upsert=upsert,
                    array_filters=array_filters,
                )
            except Exception:
                pass

        return UpdateResult(matched_count=matched_count, modified_count=modified_count, upserted_id=upserted_id)

    async def delete_one(self, query: Dict[str, Any]) -> DeleteResult:
        rows = await self._find_rows()
        target_id = None
        for row in rows:
            doc = dict(row.document or {})
            doc["_id"] = row.document_id
            if _matches_query(doc, query):
                target_id = row.document_id
                break
        if target_id is None:
            return DeleteResult(deleted_count=0)

        async with self._session_factory() as session:
            await session.execute(
                delete(CoreDocument).where(
                    CoreDocument.collection_name == self.collection_name,
                    CoreDocument.document_id == str(target_id),
                )
            )
            await session.commit()

        if self._mirror_writes and self._mongo_collection is not None:
            try:
                await self._mongo_collection.delete_one(query)
            except Exception:
                pass
        return DeleteResult(deleted_count=1)

    async def delete_many(self, query: Dict[str, Any]) -> DeleteResult:
        rows = await self._find_rows()
        ids = []
        for row in rows:
            doc = dict(row.document or {})
            doc["_id"] = row.document_id
            if _matches_query(doc, query):
                ids.append(str(row.document_id))
        if not ids:
            return DeleteResult(deleted_count=0)

        async with self._session_factory() as session:
            await session.execute(
                delete(CoreDocument).where(
                    CoreDocument.collection_name == self.collection_name,
                    CoreDocument.document_id.in_(ids),
                )
            )
            await session.commit()

        if self._mirror_writes and self._mongo_collection is not None:
            try:
                await self._mongo_collection.delete_many(query)
            except Exception:
                pass
        return DeleteResult(deleted_count=len(ids))

    async def create_index(self, *_args, **_kwargs):
        # Indexes are managed by SQL schema/migrations in PostgreSQL.
        return None

    def aggregate(self, pipeline: Sequence[Dict[str, Any]]):
        return _AggregateCursor(self, pipeline)


class CoreStore:
    CORE_COLLECTIONS = {
        "users",
        "students",
        "student_yuran",
        "set_yuran",
        "yuran_payments",
        "payments",
        "notifications",
        "audit_logs",
        "password_reset_tokens",
        "settings",
        "accounting_categories",
        "accounting_transactions",
        "accounting_audit_logs",
        "accounting_period_locks",
        "accounting_journal_entries",
        "accounting_journal_lines",
        "tabung_campaigns",
        "tabung_donations",
        "financial_ledger",
        "payment_reminders",
        "payment_reminder_preferences",
        "yuran_charge_jobs",
        "institution_onboarding_requests",
        "tenants",
        "tenant_module_settings",
        "tenant_user_memberships",
        "tenant_onboarding_jobs",
    }

    def __init__(
        self,
        session_factory: Optional[async_sessionmaker[AsyncSession]],
        mongo_db=None,
        mirror_writes: bool = False,
        postgres_all_collections: bool = False,
    ):
        self._session_factory = session_factory
        self._mongo_db = mongo_db
        self._mirror_writes = mirror_writes
        self._postgres_all_collections = bool(postgres_all_collections)
        self._cache: Dict[str, Any] = {}

    def _get_mongo_collection(self, name: str):
        if self._mongo_db is None:
            return None
        return getattr(self._mongo_db, name)

    def __getattr__(self, name: str):
        if name in self._cache:
            return self._cache[name]
        should_use_postgres = (
            self._session_factory is not None
            and (self._postgres_all_collections or name in self.CORE_COLLECTIONS)
        )
        if should_use_postgres:
            coll = CoreCollection(
                collection_name=name,
                session_factory=self._session_factory,
                mongo_collection=self._get_mongo_collection(name),
                mirror_writes=self._mirror_writes,
                store=self,
            )
            self._cache[name] = coll
            return coll
        if self._mongo_db is None:
            raise AttributeError(name)
        coll = getattr(self._mongo_db, name)
        self._cache[name] = coll
        return coll

    def __getitem__(self, name: str):
        return self.__getattr__(name)

    def uses_postgres(self, collection_name: Optional[str] = None) -> bool:
        if self._session_factory is None:
            return False
        if collection_name is None:
            return True
        if self._postgres_all_collections:
            return True
        return collection_name in self.CORE_COLLECTIONS

    def get_session_factory(self) -> Optional[async_sessionmaker[AsyncSession]]:
        return self._session_factory

    def is_mirror_mode(self) -> bool:
        return self._mirror_writes and self._mongo_db is not None

    def get_mongo_db(self):
        return self._mongo_db

