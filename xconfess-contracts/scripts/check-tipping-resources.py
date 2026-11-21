#!/usr/bin/env python3
"""Validate the anonymous-tipping resource budget recorded in gas-baseline.json."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


DEFAULT_BUDGETS = {
    "send_tip": {"cpu": 60_000, "mem": 7_000},
    "get_tips": {"cpu": 35_000, "mem": 5_000},
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--baseline",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "gas-baseline.json",
        help="path to gas-baseline.json",
    )
    args = parser.parse_args()

    baseline = json.loads(args.baseline.read_text(encoding="utf-8"))
    tipping = baseline.get("anonymous-tipping")
    if not isinstance(tipping, dict):
        raise SystemExit("anonymous-tipping baseline is missing")

    failures: list[str] = []
    for operation, limits in DEFAULT_BUDGETS.items():
        measured = tipping.get(operation)
        if not isinstance(measured, dict):
            failures.append(f"{operation}: baseline entry is missing")
            continue
        for resource, limit in limits.items():
            value = measured.get(resource)
            if not isinstance(value, int):
                failures.append(f"{operation}.{resource}: integer baseline is required")
            elif value > limit:
                failures.append(f"{operation}.{resource}: {value} exceeds budget {limit}")
            else:
                print(f"{operation}.{resource}: {value} / {limit}")

    if failures:
        for failure in failures:
            print(f"ERROR: {failure}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
