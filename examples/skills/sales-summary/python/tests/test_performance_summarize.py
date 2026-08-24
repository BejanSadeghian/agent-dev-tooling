"""Performance: how compute time and memory grow with the number of rows."""

KIND = "performance"
COVERS = ["category-summary", "summary-brief", "summarize.summarize_sales", "summarize.write_artifacts"]

import tempfile

from skillharness import SkillTestCase

from summarize import summarize_sales, write_artifacts

CATEGORIES = ["Tools", "Parts", "Paint", "Timber", "Fixings"]


def make_rows(n: int) -> list[dict]:
    """Deterministic input of n rows — built outside the timed region."""
    return [
        {"category": CATEGORIES[i % len(CATEGORIES)], "units": (i % 7) + 1, "revenue": ((i * 37) % 900) / 3.0}
        for i in range(n)
    ]


class TestSummarisePerformance(SkillTestCase):
    skill = "sales-summary"
    sizes = (2_000, 8_000, 32_000)

    def test_summarize_sales_scales_linearly(self):
        result = self.measure(summarize_sales, make_rows, target="summarize_sales")
        result.assert_scaling(1.35)
        print("\n" + result.summary() + "\n" + result.table())

    def test_summarize_sales_memory_does_not_grow_with_row_count(self):
        # One streaming pass: memory should track the number of categories, not rows.
        result = self.measure(summarize_sales, make_rows, target="summarize_sales_memory")
        result.assert_memory_scaling(0.6)

    def test_writing_artifacts_stays_linear(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = self.measure(
                lambda rows: write_artifacts(rows, tmp),
                make_rows,
                sizes=(1_000, 4_000, 16_000),
                target="write_artifacts",
            )
            result.assert_scaling(1.35)
