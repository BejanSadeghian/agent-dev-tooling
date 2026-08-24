"""Performance measurement for deterministic skill code.

Every generated performance test measures the same three things, at several input
sizes, and records them so a run can be compared with the last one:

  * wall-clock seconds (best of N repeats -- best, not mean, because the machine's
    noise is one-sided);
  * peak memory in KiB (tracemalloc, so it measures the code, not the interpreter);
  * how those two scale with input size (log-log slope), which is the number that
    actually predicts what happens on 100x the data.

Pure stdlib: no pytest, no numpy, nothing to install.
"""

from __future__ import annotations

import json
import math
import os
import time
import tracemalloc
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable, Sequence

__all__ = ["Measurement", "SizePoint", "measure", "fit_exponent", "classify", "record"]

# Slope of the log-log fit -> the complexity class a reader recognises.
_CLASSES: list[tuple[float, str]] = [
    (0.20, "constant"),
    (0.60, "sublinear"),
    (1.15, "linear"),
    (1.45, "linearithmic"),
    (2.30, "quadratic"),
    (3.30, "cubic"),
]


@dataclass
class SizePoint:
    """One input size, measured."""

    n: int
    seconds: float
    peak_kib: float
    items_per_second: float
    repeats: int

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Measurement:
    """The result of measuring one callable across several input sizes."""

    target: str
    points: list[SizePoint] = field(default_factory=list)
    exponent: float = 0.0
    r_squared: float = 0.0
    complexity: str = "unknown"
    memory_exponent: float = 0.0
    skill: str = ""

    # --- reporting --------------------------------------------------------
    def as_dict(self) -> dict[str, Any]:
        return {
            "skill": self.skill,
            "target": self.target,
            "points": [p.as_dict() for p in self.points],
            "scaling": {
                "exponent": round(self.exponent, 3),
                "rSquared": round(self.r_squared, 4),
                "class": self.complexity,
                "memoryExponent": round(self.memory_exponent, 3),
            },
        }

    def table(self) -> str:
        """Markdown table: compute time and memory against input size."""
        head = "| rows | seconds | items/s | peak KiB |\n|---:|---:|---:|---:|"
        rows = [
            f"| {p.n:,} | {p.seconds:.4f} | {p.items_per_second:,.0f} | {p.peak_kib:,.0f} |"
            for p in self.points
        ]
        return "\n".join([head, *rows])

    def summary(self) -> str:
        return (
            f"{self.target}: {self.complexity} (exponent {self.exponent:.2f}, "
            f"R^2 {self.r_squared:.3f}) over n={self.points[0].n:,}..{self.points[-1].n:,}"
        )

    def record(self, path: str | os.PathLike[str] | None = None) -> Path:
        """Append this measurement to the NDJSON perf log the runner aggregates."""
        return record(self, path)

    # --- budget assertions -------------------------------------------------
    def point(self, n: int) -> SizePoint:
        for p in self.points:
            if p.n == n:
                return p
        raise AssertionError(f"{self.target}: no measurement at n={n}")

    def assert_scaling(self, max_exponent: float) -> None:
        """Fail when growth is worse than the declared budget (the regression that matters)."""
        if self.exponent > max_exponent:
            raise AssertionError(
                f"{self.target} scales as n^{self.exponent:.2f} ({self.complexity}), "
                f"budget is n^{max_exponent:.2f}\n{self.table()}"
            )

    def assert_time(self, n: int, max_seconds: float) -> None:
        p = self.point(n)
        if p.seconds > max_seconds:
            raise AssertionError(
                f"{self.target} took {p.seconds:.4f}s at n={n:,}, budget {max_seconds:.4f}s"
            )

    def assert_peak_kib(self, n: int, max_kib: float) -> None:
        p = self.point(n)
        if p.peak_kib > max_kib:
            raise AssertionError(
                f"{self.target} peaked at {p.peak_kib:,.0f} KiB at n={n:,}, budget {max_kib:,.0f} KiB"
            )

    def assert_memory_scaling(self, max_exponent: float) -> None:
        if self.memory_exponent > max_exponent:
            raise AssertionError(
                f"{self.target} memory grows as n^{self.memory_exponent:.2f}, "
                f"budget n^{max_exponent:.2f} -- it is probably materialising the whole input\n{self.table()}"
            )


def measure(
    func: Callable[[Any], Any],
    sizes: Sequence[int],
    make_input: Callable[[int], Any],
    *,
    target: str | None = None,
    repeats: int = 3,
    warmup: bool = True,
    skill: str | None = None,
) -> Measurement:
    """Measure ``func`` at each size in ``sizes``.

    ``make_input(n)`` must be deterministic and is called outside the timed region,
    so fixture construction never lands in the measurement.
    """
    if len(sizes) < 2:
        raise ValueError("measure() needs at least two sizes -- scaling is the point")

    name = target or getattr(func, "__name__", "callable")
    points: list[SizePoint] = []

    for n in sorted(sizes):
        payload = make_input(n)
        if warmup:
            func(payload)

        best = math.inf
        for _ in range(max(1, repeats)):
            start = time.perf_counter()
            func(payload)
            best = min(best, time.perf_counter() - start)

        tracemalloc.start()
        try:
            func(payload)
            _, peak = tracemalloc.get_traced_memory()
        finally:
            tracemalloc.stop()

        points.append(
            SizePoint(
                n=n,
                seconds=best,
                peak_kib=peak / 1024,
                items_per_second=(n / best) if best > 0 else float("inf"),
                repeats=max(1, repeats),
            )
        )

    exponent, r_squared = fit_exponent([(p.n, p.seconds) for p in points])
    memory_exponent, _ = fit_exponent([(p.n, p.peak_kib) for p in points])

    return Measurement(
        target=name,
        points=points,
        exponent=exponent,
        r_squared=r_squared,
        complexity=classify(exponent),
        memory_exponent=memory_exponent,
        skill=skill or os.environ.get("SKILL_NAME", ""),
    )


def fit_exponent(points: Iterable[tuple[float, float]]) -> tuple[float, float]:
    """Least-squares slope of log(y) against log(n), plus its R^2.

    The slope is the exponent in y ~ n^slope; R^2 says how much to trust it.
    """
    usable = [(n, y) for n, y in points if n > 0 and y > 0]
    if len(usable) < 2:
        return 0.0, 0.0

    xs = [math.log(n) for n, _ in usable]
    ys = [math.log(y) for _, y in usable]
    mean_x = sum(xs) / len(xs)
    mean_y = sum(ys) / len(ys)
    var_x = sum((x - mean_x) ** 2 for x in xs)
    if var_x == 0:
        return 0.0, 0.0

    slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / var_x
    intercept = mean_y - slope * mean_x
    ss_res = sum((y - (slope * x + intercept)) ** 2 for x, y in zip(xs, ys))
    ss_tot = sum((y - mean_y) ** 2 for y in ys)
    r_squared = 1.0 if ss_tot == 0 else max(0.0, 1 - ss_res / ss_tot)
    return slope, r_squared


def classify(exponent: float) -> str:
    for bound, name in _CLASSES:
        if exponent <= bound:
            return name
    return "worse than cubic"


def record(measurement: Measurement, path: str | os.PathLike[str] | None = None) -> Path:
    """Append a measurement to the NDJSON log (SKILL_PERF_OUT, or a local default)."""
    target = Path(path or os.environ.get("SKILL_PERF_OUT") or "perf-measurements.ndjson")
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(measurement.as_dict(), sort_keys=True) + "\n")
    return target
