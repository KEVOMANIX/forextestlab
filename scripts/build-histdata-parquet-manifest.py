"""Audit completed monthly Parquet and write the R2 upload manifest."""
import csv
import sys
from datetime import datetime, timezone
from pathlib import Path

import pyarrow.parquet as pq

root = Path(sys.argv[1]).resolve()
base = root / "parquet"
rows = []
for path in sorted((base / "histdata_market_data").rglob("*.parquet")):
    key = path.relative_to(base).as_posix()
    parquet = pq.ParquetFile(path)
    metadata = parquet.metadata
    if not metadata.num_rows:
        raise ValueError(f"Empty Parquet file: {key}")
    first = metadata.row_group(0).column(0).statistics.min
    last = metadata.row_group(metadata.num_row_groups - 1).column(0).statistics.max
    if first is None or last is None or first > last:
        raise ValueError(f"Missing or invalid timestamp statistics: {key}")
    first_date = datetime.fromtimestamp(first / 1000, timezone.utc)
    last_date = datetime.fromtimestamp(last / 1000, timezone.utc)
    if (first_date.year, first_date.month) != (int(path.parent.name), int(path.stem)) or (last_date.year, last_date.month) != (int(path.parent.name), int(path.stem)):
        raise ValueError(f"Timestamp outside object month: {key}")
    rows.append({
        "Symbol": path.parts[-3], "Key": key, "Candles": metadata.num_rows,
        "Bytes": path.stat().st_size,
        "FirstUtc": first_date.isoformat(),
        "LastUtc": last_date.isoformat(),
    })

expected = {record["Symbol"] for record in csv.DictReader((root / "downloads_verified.csv").open(newline="", encoding="utf-8"))}
found = {row["Symbol"] for row in rows}
if found != expected:
    raise ValueError(f"Symbol coverage differs: missing={sorted(expected-found)}, unexpected={sorted(found-expected)}")
target = root / "parquet_manifest.csv"
with target.open("w", newline="", encoding="utf-8") as stream:
    writer = csv.DictWriter(stream, fieldnames=["Symbol", "Key", "Candles", "Bytes", "FirstUtc", "LastUtc"])
    writer.writeheader()
    writer.writerows(rows)
print(f"Manifest: {len(rows)} months, {len(found)} symbols, {sum(row['Candles'] for row in rows):,} candles, {sum(row['Bytes'] for row in rows):,} bytes")
