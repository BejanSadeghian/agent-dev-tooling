"""Accuracy: the numbers are right and they reconcile."""

KIND = "accuracy"
COVERS = ["category-summary", "summary-brief", "summarize.summarize_sales", "summarize.write_artifacts"]

import tempfile
from pathlib import Path

from skillharness import SkillTestCase
from skillharness.artifacts import assert_csv_columns, assert_markdown_sections, read_artifact

from summarize import render_brief, summarize_sales, write_artifacts

ROWS = [
    {"category": "Tools", "units": 2, "revenue": 50.0},
    {"category": "Parts", "units": 5, "revenue": 125.5},
    {"category": "Tools", "units": 1, "revenue": 25.0},
    {"category": "Paint", "units": 4, "revenue": 25.0},
]


class TestSummariseAccuracy(SkillTestCase):
    skill = "sales-summary"

    def test_aggregates_each_category_once(self):
        self.assert_rows_equal(
            summarize_sales(ROWS),
            [
                {"category": "Parts", "units": 5.0, "revenue": 125.5, "share": 125.5 / 225.5},
                {"category": "Tools", "units": 3.0, "revenue": 75.0, "share": 75.0 / 225.5},
                {"category": "Paint", "units": 4.0, "revenue": 25.0, "share": 25.0 / 225.5},
            ],
            tolerance=1e-9,
        )

    def test_shares_sum_to_one(self):
        self.assert_sums_to(summarize_sales(ROWS), "share", 1.0)

    def test_revenue_reconciles_with_the_input(self):
        self.assert_sums_to(summarize_sales(ROWS), "revenue", sum(r["revenue"] for r in ROWS))

    def test_order_is_revenue_desc_then_category_asc(self):
        tied = [
            {"category": "Zinc", "units": 1, "revenue": 10.0},
            {"category": "Alloy", "units": 1, "revenue": 10.0},
        ]
        self.assertEqual([r["category"] for r in summarize_sales(tied)], ["Alloy", "Zinc"])

    def test_input_order_does_not_change_the_result(self):
        self.assert_rows_equal(summarize_sales(ROWS), summarize_sales(list(reversed(ROWS))))

    def test_top_n_keeps_the_largest_categories(self):
        self.assertEqual([r["category"] for r in summarize_sales(ROWS, top_n=2)], ["Parts", "Tools"])

    def test_brief_states_the_totals_it_was_given(self):
        brief = render_brief(summarize_sales(ROWS), title="Q3")
        self.assertIn("225.50", brief)
        self.assertIn("Parts", brief)
        assert_markdown_sections
        self.assertIn("# Q3", brief)

    def test_artifacts_are_written_and_shaped_as_declared(self):
        with tempfile.TemporaryDirectory() as tmp:
            written = write_artifacts(ROWS, tmp)
            self.assertEqual(set(written), {"category-summary", "summary-brief"})
            assert_csv_columns(written["category-summary"], ["category", "units", "revenue", "share"])
            assert_markdown_sections(written["summary-brief"], ["## By category"])
            rows = read_artifact(written["category-summary"])
            self.assertEqual(rows[0]["category"], "Parts")

    def test_artifacts_are_byte_identical_across_runs(self):
        with tempfile.TemporaryDirectory() as tmp:
            def produce():
                written = write_artifacts(ROWS, Path(tmp) / "run")
                return {k: Path(v).read_text(encoding="utf-8") for k, v in written.items()}

            self.assert_deterministic(produce, label="sales-summary artifacts")

    def test_parts_can_be_left_out_without_a_second_code_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            written = write_artifacts(ROWS, tmp, parts=("category-summary",))
            self.assertEqual(set(written), {"category-summary"})
            self.assertFalse((Path(tmp) / "summary-brief.md").exists())
