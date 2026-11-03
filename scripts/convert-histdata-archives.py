"""Convert verified HistData Generic ASCII M1 ZIPs into UTC-month Parquet objects.

Usage: python scripts/convert-histdata-archives.py E:/desktop/histdata-market-data
The output is local. Upload it separately after checking coverage.
"""

import csv
import math
import re
import sys
import zipfile
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

UTC = timezone.utc
EST_TO_UTC = timedelta(hours=5)
SCHEMA = pa.schema([
    ("timestamp", pa.int64()),
    ("open", pa.float64()),
    ("high", pa.float64()),
    ("low", pa.float64()),
    ("close", pa.float64()),
    ("volume", pa.float64()),
], metadata={b"forextestlab.source": b"histdata", b"forextestlab.timeframe": b"1m"})


def archive_date(path: Path) -> int:
    suffix = re.search(r"_M1_(\d{4,6})\.zip$", path.name)
    if not suffix:
        raise ValueError(f"Unexpected archive name: {path}")
    return int(suffix.group(1).ljust(6, "0"))


def parse_row(raw: str, archive: Path) -> tuple[int, float, float, float, float]:
    parts = raw.strip().lstrip("\ufeff").split(";")
    if len(parts) != 6 or not re.fullmatch(r"\d{8} \d{6}", parts[0]):
        raise ValueError(f"Invalid M1 row in {archive.name}: {raw[:100]!r}")
    stamp = parts[0]
    local = datetime(
        int(stamp[:4]), int(stamp[4:6]), int(stamp[6:8]),
        int(stamp[9:11]), int(stamp[11:13]), int(stamp[13:15]), tzinfo=UTC,
    )
    if local.second != 0:
        raise ValueError(f"Non-minute timestamp in {archive.name}: {stamp}")
    timestamp = int((local + EST_TO_UTC).timestamp() * 1000)
    open_, high, low, close = map(float, parts[1:5])
    if any(not math.isfinite(price) or price <= 0 for price in (open_, high, low, close)) \
            or high < max(open_, low, close) or low > min(open_, high, close):
        raise ValueError(f"Invalid OHLC in {archive.name}: {raw[:100]!r}")
    return timestamp, open_, high, low, close


def convert_symbol(root: Path, symbol: str, archives: list[Path]) -> list[dict[str, object]]:
    output_root = root / "parquet" / "histdata_market_data" / symbol
    month_rows: dict[int, tuple[int, float, float, float, float]] = {}
    month_key: tuple[int, int] | None = None
    results: list[dict[str, object]] = []

    def flush() -> None:
        nonlocal month_rows, month_key
        if not month_rows or month_key is None:
            return
        year, month = month_key
        rows = [month_rows[key] for key in sorted(month_rows)]
        table = pa.Table.from_arrays([
            pa.array([row[0] for row in rows], type=pa.int64()),
            *[pa.array([row[index] for row in rows], type=pa.float64()) for index in range(1, 5)],
            pa.array([0.0] * len(rows), type=pa.float64()),
        ], schema=SCHEMA)
        folder = output_root / str(year)
        folder.mkdir(parents=True, exist_ok=True)
        target = folder / f"{month:02d}.parquet"
        temp = target.with_suffix(".parquet.partial")
        pq.write_table(table, temp, compression="zstd", compression_level=7, row_group_size=100_000)
        temp.replace(target)
        results.append({
            "Symbol": symbol,
            "Key": f"histdata_market_data/{symbol}/{year}/{month:02d}.parquet",
            "Candles": len(rows),
            "Bytes": target.stat().st_size,
            "FirstUtc": datetime.fromtimestamp(rows[0][0] / 1000, UTC).isoformat(),
            "LastUtc": datetime.fromtimestamp(rows[-1][0] / 1000, UTC).isoformat(),
        })
        month_rows = {}

    for archive_path in sorted(archives, key=archive_date):
        with zipfile.ZipFile(archive_path) as archive:
            csv_entries = [entry for entry in archive.infolist() if re.fullmatch(
                rf"DAT_ASCII_{symbol}_M1_\d{{4,6}}\.csv", entry.filename
            )]
            if len(csv_entries) != 1:
                raise ValueError(f"Expected one M1 CSV in {archive_path}")
            with archive.open(csv_entries[0]) as stream:
                for raw_bytes in stream:
                    raw = raw_bytes.decode("ascii").strip()
                    if not raw:
                        continue
                    row = parse_row(raw, archive_path)
                    date = datetime.fromtimestamp(row[0] / 1000, UTC)
                    new_month = (date.year, date.month)
                    if month_key is not None and new_month < month_key:
                        raise ValueError(f"Out-of-order archive row in {archive_path}: {raw[:30]}")
                    if month_key != new_month:
                        flush()
                        month_key = new_month
                    month_rows[row[0]] = row
    flush()
    return results


def main() -> None:
    root = Path(sys.argv[1]).resolve()
    verified = root / "downloads_verified.csv"
    with verified.open(newline="", encoding="utf-8") as stream:
        records = list(csv.DictReader(stream))
    grouped: dict[str, list[Path]] = {}
    for record in records:
        symbol = record["Symbol"]
        path = root / symbol / record["Archive"]
        if not path.is_file() or path.stat().st_size != int(record["Bytes"]):
            raise ValueError(f"Verified archive missing or changed: {path}")
        grouped.setdefault(symbol, []).append(path)
    results: list[dict[str, object]] = []
    with ProcessPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(convert_symbol, root, symbol, archives): symbol
                   for symbol, archives in grouped.items()}
        for future in as_completed(futures):
            symbol = futures[future]
            rows = future.result()
            results.extend(rows)
            print(f"{symbol}: {len(rows)} UTC months, {sum(int(row['Candles']) for row in rows):,} candles", flush=True)
    manifest = root / "parquet_manifest.csv"
    with manifest.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=["Symbol", "Key", "Candles", "Bytes", "FirstUtc", "LastUtc"])
        writer.writeheader()
        writer.writerows(sorted(results, key=lambda row: str(row["Key"])))
    print(f"Wrote {len(results)} Parquet objects, {sum(int(row['Bytes']) for row in results):,} bytes to {root / 'parquet'}", flush=True)


if __name__ == "__main__":
    main()
