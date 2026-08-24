"""Edge cases: empty, single, null, wrong type, unicode, and the boundary values."""

KIND = "edge"
COVERS = ["category-summary", "summary-brief", "summarize.summarize_sales", "summarize.write_artifacts"]

import tempfile

from skillharness import SkillTestCase

from summarize import render_brief, summarize_sales, write_artifacts

ROWS = [
    {"category": "Tools", "units": 2, "revenue": 50.0},
    {"category": "Parts", "units": 5, "revenue": 125.5},
]


class TestSummariseEdgeCases(SkillTestCase):
    skill = "sales-summary"

    def test_empty_input_produces_an_empty_summary(self):
        self.assertEqual(summarize_sales([]), [])

    def test_empty_input_still_produces_a_readable_brief(self):
        self.assertIn("No sales in this period.", render_brief([]))

    def test_zero_revenue_does_not_divide_by_zero(self):
        summary = summarize_sales([{"category": "Tools", "units": 0, "revenue": 0.0}])
        self.assertEqual(summary[0]["share"], 0.0)

    def test_negative_revenue_is_kept_not_silently_dropped(self):
        summary = summarize_sales([{"category": "Refunds", "units": -1, "revenue": -20.0}])
        self.assertEqual(summary[0]["revenue"], -20.0)

    def test_category_whitespace_is_normalised(self):
        summary = summarize_sales(
            [{"category": " Tools ", "units": 1, "revenue": 1.0}, {"category": "Tools", "units": 1, "revenue": 1.0}]
        )
        self.assertEqual(len(summary), 1)
        self.assertEqual(summary[0]["category"], "Tools")

    def test_unicode_categories_survive_the_round_trip(self):
        with tempfile.TemporaryDirectory() as tmp:
            written = write_artifacts([{"category": "Ünïcødé ✅", "units": 1, "revenue": 1.0}], tmp)
            self.assertIn("Ünïcødé", written["summary-brief"].read_text(encoding="utf-8"))

    def test_bad_data_raises_a_declared_error_naming_the_row(self):
        for label, rows, expected in [
            ("null category", [{"category": None, "units": 1, "revenue": 1.0}], ValueError),
            ("blank category", [{"category": "  ", "units": 1, "revenue": 1.0}], ValueError),
            ("missing column", [{"category": "Tools", "units": 1}], ValueError),
            ("null revenue", [{"category": "Tools", "units": 1, "revenue": None}], ValueError),
            ("text revenue", [{"category": "Tools", "units": 1, "revenue": "lots"}], ValueError),
            ("numeric category", [{"category": 7, "units": 1, "revenue": 1.0}], TypeError),
            ("boolean units", [{"category": "Tools", "units": True, "revenue": 1.0}], TypeError),
        ]:
            with self.subTest(case=label):
                with self.assertRaises(expected) as caught:
                    summarize_sales(rows)
                self.assertIn("row 0", str(caught.exception))

    def test_every_generated_edge_case_is_handled_or_declared(self):
        # The catalogue in skillharness.edge — anything it can throw at the
        # function must come back as a value or as one of the declared errors.
        rejected = self.assert_survives_edge_cases(
            summarize_sales, ROWS, ["units", "revenue", "category"]
        )
        self.assertTrue(rejected, "expected the bad-value edge cases to be rejected explicitly")
