"""Deterministic sales aggregation — the analytical core of the sales-summary skill.

Everything that must be reproducible lives here rather than in the prompt: same
input, same output, every run. One streaming pass over the rows, so memory grows
with the number of *categories*, not the number of rows.
"""

from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

__all__ = ["summarize_sales", "render_brief", "write_artifacts", "REQUIRED_COLUMNS"]

REQUIRED_COLUMNS = ("category", "units", "revenue")


def _number(value: Any, column: str, index: int) -> float:
    """Coerce a cell to a number, or say exactly which cell was wrong."""
    if value is None:
        raise ValueError(f"row {index}: {column} is null")
    if isinstance(value, bool):
        raise TypeError(f"row {index}: {column} is a boolean, not a number")
    try:
        return float(value)
    except (TypeError, ValueError) as err:
        raise ValueError(f"row {index}: {column} is not a number ({value!r})") from err


def summarize_sales(
    rows: Iterable[Mapping[str, Any]], *, top_n: int | None = None
) -> list[dict[str, Any]]:
    """Aggregate transaction rows into one row per category.

    Returns ``[{category, units, revenue, share}]`` sorted by revenue descending,
    then category ascending — a total order, so the output never depends on input
    order or dict iteration order.

    Raises ``ValueError`` for a missing/unparseable value and ``TypeError`` for a
    value of the wrong type: callers can distinguish "bad data" from "bad schema".
    """
    units: dict[str, float] = defaultdict(float)
    revenue: dict[str, float] = defaultdict(float)

    for index, row in enumerate(rows):
        for column in REQUIRED_COLUMNS:
            if column not in row:
                raise ValueError(f"row {index}: missing column {column!r}")
        category = row["category"]
        if category is None:
            raise ValueError(f"row {index}: category is null")
        if not isinstance(category, str):
            raise TypeError(f"row {index}: category must be a string, got {type(category).__name__}")
        key = category.strip()
        if not key:
            raise ValueError(f"row {index}: category is blank")

        units[key] += _number(row["units"], "units", index)
        revenue[key] += _number(row["revenue"], "revenue", index)

    total_revenue = sum(revenue.values())
    summary = [
        {
            "category": category,
            "units": units[category],
            "revenue": revenue[category],
            "share": (revenue[category] / total_revenue) if total_revenue else 0.0,
        }
        for category in revenue
    ]
    summary.sort(key=lambda r: (-r["revenue"], r["category"]))
    return summary[:top_n] if top_n is not None else summary


def render_brief(summary: Sequence[Mapping[str, Any]], *, title: str = "Sales summary") -> str:
    """Render the summary as a markdown brief. Pure function of its input."""
    lines = [f"# {title}", ""]
    if not summary:
        lines += ["No sales in this period.", ""]
        return "\n".join(lines)

    total_revenue = sum(float(r["revenue"]) for r in summary)
    total_units = sum(float(r["units"]) for r in summary)
    leader = summary[0]

    lines += [
        f"Total revenue **{total_revenue:,.2f}** across **{total_units:,.0f}** units "
        f"in **{len(summary)}** categories.",
        "",
        f"Largest category: **{leader['category']}** at {float(leader['share']) * 100:.1f}% of revenue.",
        "",
        "## By category",
        "",
        "| category | units | revenue | share |",
        "|---|---:|---:|---:|",
    ]
    for row in summary:
        lines.append(
            f"| {row['category']} | {float(row['units']):,.0f} | {float(row['revenue']):,.2f} "
            f"| {float(row['share']) * 100:.1f}% |"
        )
    lines.append("")
    return "\n".join(lines)


def write_artifacts(
    rows: Iterable[Mapping[str, Any]],
    out_dir: str | Path,
    *,
    title: str = "Sales summary",
    top_n: int | None = None,
    parts: Sequence[str] = ("category-summary", "summary-brief"),
) -> dict[str, Path]:
    """Produce the skill's artifacts on disk.

    ``parts`` selects which artifacts to write — the caller can leave one out
    without a second code path. Returns {artifact id: path} for what was written.
    """
    import csv

    summary = summarize_sales(rows, top_n=top_n)
    directory = Path(out_dir)
    directory.mkdir(parents=True, exist_ok=True)
    written: dict[str, Path] = {}

    if "category-summary" in parts:
        target = directory / "category-summary.csv"
        with target.open("w", encoding="utf-8", newline="") as fh:
            writer = csv.writer(fh, lineterminator="\n")
            writer.writerow(["category", "units", "revenue", "share"])
            for row in summary:
                writer.writerow(
                    [row["category"], f"{row['units']:.4f}", f"{row['revenue']:.4f}", f"{row['share']:.6f}"]
                )
        written["category-summary"] = target

    if "summary-brief" in parts:
        target = directory / "summary-brief.md"
        target.write_text(render_brief(summary, title=title), encoding="utf-8")
        written["summary-brief"] = target

    return written
