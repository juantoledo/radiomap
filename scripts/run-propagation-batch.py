#!/usr/bin/env python3
"""
Batch-invoke Signal-Server runsignal-hd-transparent.sh for each eligible row in
data/curated_stations.csv (ham repeaters / Echolink / DMR; excludes ATC via isAir).

Signal-Server root is required: set **SIGNAL_SERVER_ROOT** or pass **--signal-server-root**.

  export SIGNAL_SERVER_ROOT=/path/to/Signal-Server
  python scripts/run-propagation-batch.py --dry-run --limit 3
  python scripts/run-propagation-batch.py --only-signal CE3AA
  python scripts/run-propagation-batch.py --continue

Power: if both potencia and ganancia parse as numbers, passes -txp / -txg;
otherwise passes -erp 20 only.

Antenna: tx MHz < 300 -> generic_omni_2m, else generic_omni_70cm (paths under
SIGNAL_SERVER_ROOT/antenna/).

-rt default is -110 (matches existing Radiomap propagation READMEs); override
with --rt.
"""
from __future__ import annotations

import argparse
import csv
import os
import shlex
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CSV = REPO_ROOT / "data" / "curated_stations.csv"
DEFAULT_COPY_TO = REPO_ROOT / "data" / "propagation"

_SS_ROOT_ERR = (
    "Signal-Server root is not set. Export SIGNAL_SERVER_ROOT or pass --signal-server-root "
    "(path to the Signal-Server repository, e.g. the directory that contains scripts/runsignal-hd-transparent.sh)."
)


def _resolve_signal_server_root(cli_path: Path | None) -> Path | None:
    if cli_path is not None:
        return cli_path
    env = os.environ.get("SIGNAL_SERVER_ROOT", "").strip()
    if env:
        return Path(env)
    return None


def _truthy_air(v: str | None) -> bool:
    if not v or not isinstance(v, str):
        return False
    return v.strip().lower() in ("1", "true", "yes")


def _parse_float(s: str | None) -> float | None:
    if s is None:
        return None
    t = str(s).strip()
    if not t:
        return None
    try:
        return float(t)
    except ValueError:
        return None


def antenna_path(ss_root: Path, tx_mhz: float) -> Path:
    name = "generic_omni_2m" if tx_mhz < 300 else "generic_omni_70cm"
    return (ss_root / "antenna" / name).resolve()


def build_argv(
    *,
    wrapper: Path,
    copy_to: Path,
    signal: str,
    lat: float,
    lon: float,
    tx_mhz: float,
    ss_root: Path,
    rt: str,
    use_dbg: bool,
    potencia: float | None,
    ganancia: float | None,
    erp_fallback: float,
) -> list[str]:
    ant = str(antenna_path(ss_root, tx_mhz))
    lat_arg = f"{lat:g},"
    lon_arg = f"{lon:g}"

    tail: list[str] = [
        "-lid",
        "data/SRTMGL3.asc",
        "-resample",
        "2",
        "-lat",
        lat_arg,
        "-lon",
        lon_arg,
        "-txh",
        "25",
        "-f",
        f"{tx_mhz:g}",
        "-m",
        "-R",
        "200",
        "-pm",
        "1",
        "-dbm",
        "-ant",
        ant,
        "-rt",
        rt,
    ]
    if potencia is not None and ganancia is not None:
        tail.extend(["-txp", f"{potencia:g}", "-txg", f"{ganancia:g}"])
    else:
        tail.extend(["-erp", str(erp_fallback)])

    out: list[str] = [
        str(wrapper),
        "--copy-to",
        str(copy_to),
        signal,
    ]
    if use_dbg:
        out.append("-dbg")
    out.extend(tail)
    return out


def main() -> int:
    p = argparse.ArgumentParser(
        description="Run Signal-Server propagation wrapper for each CSV row (skips isAir)."
    )
    p.add_argument(
        "--csv",
        type=Path,
        default=DEFAULT_CSV,
        help=f"Path to curated_stations.csv (default: {DEFAULT_CSV})",
    )
    p.add_argument(
        "--signal-server-root",
        type=Path,
        default=None,
        help="Signal-Server repo root (required if SIGNAL_SERVER_ROOT is unset)",
    )
    p.add_argument(
        "--copy-to",
        type=Path,
        default=DEFAULT_COPY_TO,
        help=f"Directory passed to wrapper --copy-to (default: {DEFAULT_COPY_TO})",
    )
    p.add_argument(
        "--rt",
        default="-110",
        help='Tilt argument for -rt (default: -110, matches Radiomap propagation READMEs)',
    )
    p.add_argument(
        "--erp",
        type=float,
        default=20.0,
        help="ERP (dBm or engine units) when potencia/ganancia missing (default: 20)",
    )
    p.add_argument("--dry-run", action="store_true", help="Print commands only; do not execute")
    p.add_argument("--no-dbg", action="store_true", help="Omit -dbg from the wrapper invocation")
    p.add_argument("--limit", type=int, default=None, help="Max number of eligible rows to process")
    p.add_argument("--only-signal", type=str, default=None, help="Process only this signal (exact CSV value)")
    p.add_argument(
        "--continue",
        dest="cont",
        action="store_true",
        help="On wrapper failure, log and continue instead of exiting",
    )
    args = p.parse_args()

    csv_path = args.csv.resolve()
    ss_raw = _resolve_signal_server_root(args.signal_server_root)
    if ss_raw is None:
        print(_SS_ROOT_ERR, file=sys.stderr)
        return 1
    ss_root = ss_raw.resolve()
    copy_to = args.copy_to.resolve()
    wrapper = ss_root / "scripts" / "runsignal-hd-transparent.sh"

    if not csv_path.is_file():
        print(f"CSV not found: {csv_path}", file=sys.stderr)
        return 1
    if not args.dry_run:
        if not wrapper.is_file():
            print(f"Wrapper not found: {wrapper}", file=sys.stderr)
            return 1
        if not ss_root.is_dir():
            print(f"Signal-Server root not a directory: {ss_root}", file=sys.stderr)
            return 1

    use_dbg = not args.no_dbg
    processed = 0
    skipped = 0
    failures = 0

    with open(csv_path, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            print("CSV has no header", file=sys.stderr)
            return 1

        for row in reader:
            sig = (row.get("signal") or "").strip()
            if not sig:
                skipped += 1
                continue
            if args.only_signal is not None and sig != args.only_signal.strip():
                continue
            if _truthy_air(row.get("isAir")):
                skipped += 1
                continue

            lat = _parse_float(row.get("lat"))
            lon = _parse_float(row.get("lon"))
            tx_mhz = _parse_float(row.get("tx"))
            if lat is None or lon is None or tx_mhz is None:
                skipped += 1
                continue

            pot = _parse_float(row.get("potencia"))
            gan = _parse_float(row.get("ganancia"))
            pot_arg = pot
            gan_arg = gan
            if pot is None or gan is None:
                pot_arg = None
                gan_arg = None

            argv = build_argv(
                wrapper=wrapper,
                copy_to=copy_to,
                signal=sig,
                lat=lat,
                lon=lon,
                tx_mhz=tx_mhz,
                ss_root=ss_root,
                rt=str(args.rt),
                use_dbg=use_dbg,
                potencia=pot_arg,
                ganancia=gan_arg,
                erp_fallback=args.erp,
            )

            ant_label = "2m" if tx_mhz < 300 else "70cm"
            power_note = f"-txp/-txg" if pot_arg is not None else f"-erp {args.erp:g}"
            print(f"# {sig}  tx={tx_mhz:g} MHz  ant={ant_label}  {power_note}")

            cmdline = shlex.join(argv)
            if args.dry_run:
                print(cmdline)
                processed += 1
                if args.limit is not None and processed >= args.limit:
                    break
                continue

            try:
                r = subprocess.run(argv, cwd=str(ss_root), check=False)
                if r.returncode != 0:
                    failures += 1
                    print(
                        f"FAILED ({r.returncode}): {sig}",
                        file=sys.stderr,
                    )
                    if not args.cont:
                        return r.returncode or 1
            except OSError as e:
                failures += 1
                print(f"FAILED ({e}): {sig}", file=sys.stderr)
                if not args.cont:
                    return 1

            processed += 1
            if args.limit is not None and processed >= args.limit:
                break

    # stdout (not stderr) so buffered order matches row output in dry-run
    print(f"# done: ran={processed} skipped_or_filtered={skipped} failures={failures}")
    return 1 if failures and not args.dry_run else 0


if __name__ == "__main__":
    sys.exit(main())
