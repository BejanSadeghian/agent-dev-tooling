"""Test harness for deterministic skill code: accuracy, edge cases, performance, artifacts."""

from .accuracy import assert_close, assert_matches_golden, assert_rows_equal, assert_sums_to
from .artifacts import assert_artifact_exists, assert_deterministic, read_artifact
from .edge import each_edge_case
from .perf import Measurement, classify, fit_exponent, measure
from .testcase import SkillTestCase

__all__ = [
    "SkillTestCase",
    "Measurement",
    "assert_close",
    "assert_rows_equal",
    "assert_sums_to",
    "assert_matches_golden",
    "assert_artifact_exists",
    "assert_deterministic",
    "each_edge_case",
    "measure",
    "fit_exponent",
    "classify",
]

__version__ = "0.1.0"
