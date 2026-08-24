"""Tests for the test harness itself. Run: npm run python:harness"""

import math
import tempfile
import unittest
from pathlib import Path

from skillharness import accuracy, artifacts, edge
from skillharness.perf import classify, fit_exponent, measure


class TestPerf(unittest.TestCase):
    def test_fit_exponent_recovers_a_known_power(self):
        for power in (1.0, 1.5, 2.0):
            with self.subTest(power=power):
                points = [(n, n**power) for n in (100, 1000, 10000)]
                slope, r_squared = fit_exponent(points)
                self.assertAlmostEqual(slope, power, places=6)
                self.assertGreater(r_squared, 0.99)

    def test_fit_exponent_ignores_unusable_points(self):
        self.assertEqual(fit_exponent([(0, 0), (1, 0)]), (0.0, 0.0))

    def test_classify_names_the_complexity(self):
        self.assertEqual(classify(0.01), "constant")
        self.assertEqual(classify(1.0), "linear")
        self.assertEqual(classify(2.0), "quadratic")
        self.assertEqual(classify(4.0), "worse than cubic")

    def test_measure_reports_every_size_and_records_memory(self):
        result = measure(lambda rows: [r * 2 for r in rows], [500, 2000], lambda n: list(range(n)), target="double")
        self.assertEqual([p.n for p in result.points], [500, 2000])
        self.assertTrue(all(p.seconds > 0 for p in result.points))
        self.assertTrue(all(p.peak_kib > 0 for p in result.points))
        self.assertEqual(result.target, "double")

    def test_measure_needs_at_least_two_sizes(self):
        with self.assertRaises(ValueError):
            measure(lambda rows: rows, [10], lambda n: list(range(n)))

    def test_quadratic_code_fails_a_linear_budget(self):
        def quadratic(rows):
            return sum(1 for _ in rows for _ in rows)

        result = measure(quadratic, [200, 400, 800], lambda n: list(range(n)), target="quadratic", repeats=1)
        self.assertGreater(result.exponent, 1.6)
        with self.assertRaises(AssertionError) as caught:
            result.assert_scaling(1.35)
        self.assertIn("quadratic", str(caught.exception))

    def test_budgets_report_the_measured_number(self):
        result = measure(lambda rows: list(rows), [500, 2000], lambda n: list(range(n)), target="copy")
        with self.assertRaises(AssertionError):
            result.assert_time(2000, 0.0)
        with self.assertRaises(AssertionError):
            result.assert_peak_kib(2000, 0.0)
        with self.assertRaises(AssertionError):
            result.point(999)

    def test_record_appends_ndjson(self):
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "perf.ndjson"
            result = measure(lambda rows: rows, [100, 400], lambda n: list(range(n)), target="noop")
            result.record(log)
            result.record(log)
            self.assertEqual(len(log.read_text(encoding="utf-8").strip().splitlines()), 2)


class TestAccuracy(unittest.TestCase):
    def test_assert_close_uses_a_tolerance(self):
        accuracy.assert_close(0.1 + 0.2, 0.3)
        with self.assertRaises(AssertionError):
            accuracy.assert_close(1.0, 1.1)

    def test_assert_close_refuses_booleans(self):
        with self.assertRaises(AssertionError):
            accuracy.assert_close(True, 1)

    def test_assert_rows_equal_names_the_row_and_column(self):
        with self.assertRaises(AssertionError) as caught:
            accuracy.assert_rows_equal([{"a": 1, "b": 2}], [{"a": 1, "b": 3}])
        self.assertIn("row 0 column 'b'", str(caught.exception))

    def test_assert_rows_equal_can_ignore_order(self):
        accuracy.assert_rows_equal([{"k": "b"}, {"k": "a"}], [{"k": "a"}, {"k": "b"}], key="k")

    def test_assert_rows_equal_reports_shape_differences(self):
        with self.assertRaises(AssertionError):
            accuracy.assert_rows_equal([{"a": 1}], [{"a": 1}, {"a": 2}])
        with self.assertRaises(AssertionError):
            accuracy.assert_rows_equal([{"a": 1}], [{"a": 1, "b": 2}])

    def test_assert_sums_to_checks_reconciliation(self):
        accuracy.assert_sums_to([{"v": 1.0}, {"v": 2.0}], "v", 3.0)
        with self.assertRaises(AssertionError):
            accuracy.assert_sums_to([{"v": 1.0}], "v", 2.0)

    def test_golden_file_is_written_once_then_compared(self):
        with tempfile.TemporaryDirectory() as tmp:
            golden = Path(tmp) / "golden.json"
            with self.assertRaises(AssertionError):
                accuracy.assert_matches_golden([{"a": 1}], golden)
            accuracy.assert_matches_golden([{"a": 1}], golden)
            with self.assertRaises(AssertionError):
                accuracy.assert_matches_golden([{"a": 2}], golden)


class TestEdgeCatalogue(unittest.TestCase):
    def test_shape_variants_come_first(self):
        labels = [label for label, _ in edge.each_edge_case([{"a": 1}])]
        self.assertEqual(labels[:3], ["empty input", "single row", "duplicate rows"])

    def test_column_variants_cover_null_missing_and_wrong_type(self):
        labels = [label for label, _ in edge.column_variants([{"a": 1}], "a")]
        self.assertIn("a is null", labels)
        self.assertIn("a missing", labels)
        self.assertIn("a is a string", labels)

    def test_string_columns_get_the_nasty_strings(self):
        payloads = [rows for _, rows in edge.column_variants([{"a": "x"}], "a")]
        values = [rows[0].get("a") for rows in payloads]
        self.assertIn("<script>alert(1)</script>", values)
        self.assertIn("ünïcødé ✅", values)

    def test_mutations_do_not_touch_the_original_rows(self):
        rows = [{"a": 1}]
        list(edge.each_edge_case(rows, ["a"]))
        self.assertEqual(rows, [{"a": 1}])


class TestArtifacts(unittest.TestCase):
    def test_missing_artifact_is_reported(self):
        with self.assertRaises(AssertionError):
            artifacts.assert_artifact_exists("does-not-exist.csv")

    def test_csv_and_json_shapes_are_checked(self):
        with tempfile.TemporaryDirectory() as tmp:
            csv_path = Path(tmp) / "a.csv"
            csv_path.write_text("a,b\n1,2\n", encoding="utf-8")
            artifacts.assert_csv_columns(csv_path, ["a", "b"])
            with self.assertRaises(AssertionError):
                artifacts.assert_csv_columns(csv_path, ["a"])

            json_path = Path(tmp) / "a.json"
            json_path.write_text('{"outer": {"inner": 1}}', encoding="utf-8")
            artifacts.assert_json_keys(json_path, ["outer.inner"])
            with self.assertRaises(AssertionError):
                artifacts.assert_json_keys(json_path, ["outer.missing"])

    def test_markdown_sections_are_checked(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "a.md"
            path.write_text("# Title\n\n## Section\n", encoding="utf-8")
            artifacts.assert_markdown_sections(path, ["## Section"])
            with self.assertRaises(AssertionError):
                artifacts.assert_markdown_sections(path, ["## Missing"])

    def test_non_deterministic_output_is_caught(self):
        counter = {"n": 0}

        def unstable():
            counter["n"] += 1
            return {"value": counter["n"]}

        with self.assertRaises(AssertionError) as caught:
            artifacts.assert_deterministic(unstable, label="unstable output")
        self.assertIn("not deterministic", str(caught.exception))

    def test_deterministic_output_passes(self):
        self.assertEqual(artifacts.assert_deterministic(lambda: {"value": 1}), {"value": 1})


if __name__ == "__main__":
    unittest.main()
