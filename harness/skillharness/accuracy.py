"""Accuracy assertions for deterministic skill code.

Analytical code is judged on numbers, so equality needs a tolerance and failures
need to name the row and column that drifted -- not just "dicts differ".
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

__all__ = [
    "assert_close",
    "assert_rows_equal",
    "assert_matches_golden",
    "assert_sums_to",
    "assert_no_nulls",
]

DEFAULT_TOLERANCE = 1e-9


def assert_close(actual: float, expected: float, tolerance: float = DEFAULT_TOLERANCE, label: str = "value") -> None:
    """Compare floats with an absolute+relative tolerance instead of ==."""
    if isinstance(actual, bool) or isinstance(expected, bool):
        raise AssertionError(f"{label}: refusing to compare booleans as numbers")
    if math.isnan(expected):
        if not math.isnan(actual):
            raise AssertionError(f"{label}: expected NaN, got {actual!r}")
        return
    if not math.isclose(actual, expected, rel_tol=tolerance, abs_tol=tolerance):
        raise AssertionError(f"{label}: expected {expected!r}, got {actual!r} (tolerance {tolerance})")


def assert_rows_equal(
    actual: Sequence[Mapping[str, Any]],
    expected: Sequence[Mapping[str, Any]],
    *,
    tolerance: float = DEFAULT_TOLERANCE,
    key: str | None = None,
    ignore: Iterable[str] = (),
) -> None:
    """Compare row-shaped results, reporting the first row and column that differ.

    ``key`` sorts both sides first, so row order is not accidentally asserted.
    """
    ignored = set(ignore)
    left = list(actual)
    right = list(expected)
    if key:
        left = sorted(left, key=lambda r: r[key])
        right = sorted(right, key=lambda r: r[key])

    if len(left) != len(right):
        raise AssertionError(f"row count: expected {len(right)}, got {len(left)}")

    for index, (got, want) in enumerate(zip(left, right)):
        got_keys = set(got) - ignored
        want_keys = set(want) - ignored
        if got_keys != want_keys:
            missing = sorted(want_keys - got_keys)
            extra = sorted(got_keys - want_keys)
            raise AssertionError(f"row {index}: missing columns {missing}, unexpected columns {extra}")
        for column in sorted(want_keys):
            a, b = got[column], want[column]
            if isinstance(b, (int, float)) and not isinstance(b, bool):
                assert_close(float(a), float(b), tolerance, label=f"row {index} column {column!r}")
            elif a != b:
                raise AssertionError(f"row {index} column {column!r}: expected {b!r}, got {a!r}")


def assert_matches_golden(actual: Any, golden_path: str | Path, *, tolerance: float = DEFAULT_TOLERANCE) -> None:
    """Compare against a committed golden artifact.

    Set ``SKILL_UPDATE_GOLDEN=1`` to rewrite it -- review the diff before committing;
    a golden file regenerated without being read is a test that asserts nothing.
    """
    import os

    path = Path(golden_path)
    if os.environ.get("SKILL_UPDATE_GOLDEN") == "1" or not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(actual, indent=2, sort_keys=True, default=str) + "\n", encoding="utf-8")
        if os.environ.get("SKILL_UPDATE_GOLDEN") != "1":
            raise AssertionError(f"golden file {path} did not exist; wrote it -- review and re-run")
        return

    expected = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(actual, list) and isinstance(expected, list) and actual and isinstance(actual[0], Mapping):
        assert_rows_equal(actual, expected, tolerance=tolerance)
        return
    if json.dumps(actual, sort_keys=True, default=str) != json.dumps(expected, sort_keys=True, default=str):
        raise AssertionError(f"output does not match golden artifact {path}")


def assert_sums_to(rows: Sequence[Mapping[str, Any]], column: str, expected_total: float, tolerance: float = 1e-6) -> None:
    """Reconciliation check: the parts must still add up to the whole."""
    total = sum(float(r[column]) for r in rows)
    assert_close(total, expected_total, tolerance, label=f"sum of {column!r}")


def assert_no_nulls(rows: Sequence[Mapping[str, Any]], columns: Iterable[str]) -> None:
    for index, row in enumerate(rows):
        for column in columns:
            if row.get(column) is None:
                raise AssertionError(f"row {index}: column {column!r} is null")
