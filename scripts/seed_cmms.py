"""Build the SIMULATED maintenance system (CMMS) the demonstration reads.

    python scripts/seed_cmms.py            write it to connectors.cmms.path
    python scripts/seed_cmms.py --out X    write it somewhere else

A fixed set of fictional work orders and notifications, consistent with the
demonstration scenario: an open CUI repair notification and work order on
V-2104 (from INS-2026-0417), a closed bench-test order on PSV-2104A, an open
assessment on the withdrawn V-2107. Nothing here is a record from a real
maintenance system; the database says so in its meta table and the connector
marks every item it serves from it as simulated.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, help="database path (default: connectors.cmms.path)")
    arguments = parser.parse_args()

    from backend.connectors import cmms_path
    from backend.connectors.cmms import SIMULATED_ITEMS, SIMULATED_OBJECTS, build_simulated_cmms

    path = build_simulated_cmms(arguments.out or cmms_path())
    print(f"  cmms       {path} (SIMULATED): {len(SIMULATED_OBJECTS)} tags, {len(SIMULATED_ITEMS)} items")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
