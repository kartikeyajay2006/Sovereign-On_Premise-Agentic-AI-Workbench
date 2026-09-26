"""Build the SIMULATED process historian the demonstration reads.

    python scripts/seed_historian.py            write it to connectors.historian.path
    python scripts/seed_historian.py --out X    write it somewhere else

Two weeks of hourly samples for the instruments on V-2104 and V-2107
(pressure, temperature, level), generated from a fixed seed so every build is
identical. V-2107's instruments go out of service when it was withdrawn on
2026-05-18, and PT-2104 has a six-hour communications outage, so bad-quality
samples -- which carry no value -- are part of the data. Nothing here is a
measurement of real equipment; the database says so in its meta table and the
connectors mark every value they serve from it as simulated.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, help="database path (default: connectors.historian.path)")
    arguments = parser.parse_args()

    from backend.connectors import historian_path
    from backend.connectors.historian import SIMULATED_TAGS, build_simulated_historian, simulated_samples

    path = build_simulated_historian(arguments.out or historian_path())
    print(f"  historian  {path} (SIMULATED): {len(SIMULATED_TAGS)} tags, {len(simulated_samples())} samples")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
