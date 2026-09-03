"""Assertions about the artifacts a skill produces.

A skill's artifacts are its real output, so they are what the tests assert on:
the file exists, has the promised shape, and is produced deterministically.
"""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path
from typing import Any, Callable, Iterable, Sequence

__all__ = [
    "assert_artifact_exists",
    "assert_csv_columns",
    "assert_json_keys",
    "assert_markdown_sections",
    "assert_deterministic",
    "read_artifact",
]


def assert_artifact_exists(path: str | Path, *, min_bytes: int = 1) -> Path:
    target = Path(path)
    if not target.exists():
        raise AssertionError(f"artifact {target} was not produced")
    size = target.stat().st_size
    if size < min_bytes:
        raise AssertionError(f"artifact {target} is {size} bytes, expected at least {min_bytes}")
    return target


def read_artifact(path: str | Path) -> Any:
    """Load an artifact by extension: .json, .ndjson, .csv, or text."""
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    if target.suffix == ".json":
        return json.loads(text)
    if target.suffix == ".ndjson":
        return [json.loads(line) for line in text.splitlines() if line.strip()]
    if target.suffix in {".csv", ".tsv"}:
        delimiter = "\t" if target.suffix == ".tsv" else ","
        return list(csv.DictReader(text.splitlines(), delimiter=delimiter))
    return text


def assert_csv_columns(path: str | Path, columns: Sequence[str], *, exact: bool = True) -> None:
    rows = read_artifact(path)
    if not isinstance(rows, list):
        raise AssertionError(f"{path} is not a CSV artifact")
    header = list(rows[0].keys()) if rows else []
    if exact and header != list(columns):
        raise AssertionError(f"{path}: expected columns {list(columns)}, got {header}")
    if not exact:
        missing = [c for c in columns if c not in header]
        if missing:
            raise AssertionError(f"{path}: missing columns {missing}")


def assert_json_keys(path: str | Path, keys: Iterable[str]) -> None:
    """Every dotted key path must be present in the JSON artifact."""
    data = read_artifact(path)
    for dotted in keys:
        cursor: Any = data
        for part in dotted.split("."):
            if isinstance(cursor, list):
                cursor = cursor[0] if cursor else None
            if not isinstance(cursor, dict) or part not in cursor:
                raise AssertionError(f"{path}: missing key path {dotted!r}")
            cursor = cursor[part]


def assert_markdown_sections(path: str | Path, headings: Iterable[str]) -> None:
    text = read_artifact(path)
    for heading in headings:
        if not re.search(rf"^{re.escape(heading)}\s*$", text, re.MULTILINE):
            raise AssertionError(f"{path}: missing section {heading!r}")


def assert_deterministic(produce: Callable[[], Any], *, runs: int = 3, label: str = "output") -> Any:
    """Run a producer several times; every run must return an identical value.

    This is the assertion that makes an artifact testable at all -- if it differs
    between runs, no other assertion about it means anything.
    """
    first = produce()
    reference = json.dumps(first, sort_keys=True, default=str)
    for attempt in range(2, max(2, runs) + 1):
        again = json.dumps(produce(), sort_keys=True, default=str)
        if again != reference:
            raise AssertionError(f"{label} is not deterministic: run 1 and run {attempt} differ")
    return first
