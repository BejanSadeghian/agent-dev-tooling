"""Edge-case inputs.

The catalogue is the point: edge cases you have to think of are edge cases you
forget. Iterate over these and every generated test covers the same floor.
"""

from __future__ import annotations

import copy
from typing import Any, Callable, Iterator, Mapping, Sequence

__all__ = ["EDGE_STRINGS", "EDGE_NUMBERS", "empty_variants", "column_variants", "each_edge_case"]

EDGE_STRINGS: tuple[str, ...] = (
    "",
    " ",
    "   leading and trailing   ",
    "o'brien",
    'quote"inside',
    "comma,inside",
    "line\nbreak",
    "tab\tinside",
    "ünïcødé ✅",
    "🙂",
    "a" * 1024,
    "<script>alert(1)</script>",
    "NULL",
    "-",
)

EDGE_NUMBERS: tuple[float, ...] = (
    0,
    -0.0,
    1,
    -1,
    0.1 + 0.2,          # classic float representation trap
    1e-12,
    1e12,
    2**53,              # beyond exact float integers
    -(2**53),
)


def empty_variants(rows: Sequence[Mapping[str, Any]]) -> Iterator[tuple[str, list]]:
    """The shapes every row-consuming function must survive."""
    yield "empty input", []
    if rows:
        yield "single row", [copy.deepcopy(rows[0])]
        yield "duplicate rows", [copy.deepcopy(rows[0]), copy.deepcopy(rows[0])]


def column_variants(
    rows: Sequence[Mapping[str, Any]], column: str
) -> Iterator[tuple[str, list]]:
    """Mutations of one column: nulls, missing key, wrong type, and the edge values."""
    if not rows:
        return

    def mutated(label: str, fn: Callable[[dict], dict]) -> tuple[str, list]:
        copies = [dict(copy.deepcopy(r)) for r in rows]
        copies[0] = fn(copies[0])
        return label, copies

    yield mutated(f"{column} is null", lambda r: {**r, column: None})
    yield mutated(f"{column} missing", lambda r: {k: v for k, v in r.items() if k != column})
    yield mutated(f"{column} is a string", lambda r: {**r, column: "not a number"})

    sample = rows[0].get(column)
    values = EDGE_NUMBERS if isinstance(sample, (int, float)) and not isinstance(sample, bool) else EDGE_STRINGS
    for value in values:
        yield mutated(f"{column} = {value!r}", lambda r, v=value: {**r, column: v})


def each_edge_case(
    rows: Sequence[Mapping[str, Any]], columns: Sequence[str] = ()
) -> Iterator[tuple[str, list]]:
    """Every edge variant for a row set: shapes first, then per-column mutations."""
    yield from empty_variants(rows)
    for column in columns:
        yield from column_variants(rows, column)
