"""The base class generated Python tests inherit from.

One class, three kinds of assertion -- accuracy, edge cases, and performance --
so every generated suite covers the same floor, and performance measurements are
recorded for the report without the test author remembering to do it.

Runs under plain ``python3 -m unittest`` (nothing to install) and under pytest,
which collects unittest classes natively.
"""

from __future__ import annotations

import os
import unittest
from contextlib import contextmanager
from typing import Any, Callable, Iterator, Mapping, Sequence

from . import accuracy, artifacts, edge
from .perf import Measurement, measure

__all__ = ["SkillTestCase"]


class SkillTestCase(unittest.TestCase):
    """Base class with accuracy, edge-case, performance, and artifact helpers."""

    #: Set in the subclass so recorded measurements are attributed to the skill.
    skill: str = ""

    #: Default sizes for performance measurement; override for slower functions.
    sizes: Sequence[int] = (1_000, 4_000, 16_000)

    #: Repeats per size. Best-of, so more repeats only ever lowers noise.
    repeats: int = 3

    # --- performance -------------------------------------------------------
    def measure(
        self,
        func: Callable[[Any], Any],
        make_input: Callable[[int], Any],
        *,
        sizes: Sequence[int] | None = None,
        target: str | None = None,
        record: bool = True,
    ) -> Measurement:
        """Measure across input sizes and record the result for the perf report."""
        result = measure(
            func,
            list(sizes or self.sizes),
            make_input,
            target=target,
            repeats=self.repeats,
            skill=self.skill or os.environ.get("SKILL_NAME", ""),
        )
        if record:
            result.record()
        return result

    # --- accuracy ----------------------------------------------------------
    def assert_rows_equal(self, actual, expected, **kwargs) -> None:
        accuracy.assert_rows_equal(actual, expected, **kwargs)

    def assert_close(self, actual: float, expected: float, tolerance: float = accuracy.DEFAULT_TOLERANCE) -> None:
        accuracy.assert_close(actual, expected, tolerance)

    def assert_sums_to(self, rows, column: str, expected_total: float, tolerance: float = 1e-6) -> None:
        accuracy.assert_sums_to(rows, column, expected_total, tolerance)

    # --- artifacts ---------------------------------------------------------
    def assert_artifact_exists(self, path, **kwargs):
        return artifacts.assert_artifact_exists(path, **kwargs)

    def assert_deterministic(self, produce: Callable[[], Any], *, runs: int = 3, label: str = "output") -> Any:
        return artifacts.assert_deterministic(produce, runs=runs, label=label)

    # --- edge cases --------------------------------------------------------
    @contextmanager
    def edge_cases(
        self, rows: Sequence[Mapping[str, Any]], columns: Sequence[str] = ()
    ) -> Iterator[Callable[[], Iterator[tuple[str, list]]]]:
        """Yield a generator of (label, mutated rows) inside subTests.

        Usage::

            with self.edge_cases(rows, ["amount"]) as cases:
                for label, payload in cases():
                    with self.subTest(case=label):
                        summarise(payload)   # must not raise, must stay in contract
        """
        yield lambda: edge.each_edge_case(rows, columns)

    def assert_survives_edge_cases(
        self,
        func: Callable[[Any], Any],
        rows: Sequence[Mapping[str, Any]],
        columns: Sequence[str] = (),
        *,
        allowed_exceptions: tuple[type[BaseException], ...] = (ValueError, TypeError, KeyError),
    ) -> list[str]:
        """Every edge input either returns a value or raises a *declared* error type.

        An unexpected exception type is the bug this catches: silent ``AttributeError``
        and ``IndexError`` are what crash a pipeline three skills later.
        """
        rejected: list[str] = []
        for label, payload in edge.each_edge_case(rows, columns):
            with self.subTest(case=label):
                try:
                    func(payload)
                except allowed_exceptions:
                    rejected.append(label)
                except Exception as err:  # noqa: BLE001 -- reporting the type is the point
                    raise AssertionError(
                        f"edge case {label!r} raised {type(err).__name__}: {err}. "
                        f"Handle it, or raise one of {[e.__name__ for e in allowed_exceptions]}."
                    ) from err
        return rejected
