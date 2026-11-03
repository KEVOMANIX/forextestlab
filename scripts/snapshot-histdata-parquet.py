"""Write a manifest for completed Parquet files while bulk conversion runs.

The final converter manifest supersedes this snapshot. The uploader is
resumable and will replace files whose final byte size changed.
"""
import csv
import sys
import time
from pathlib import Path

root = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
base = root / "parquet"
rows = []
for path in base.rglob("*.parquet"):
    stat = path.stat()
    if time.time() - stat.st_mtime < 60:
        continue
    key = path.relative_to(base).as_posix()
    if not key.startswith("histdata_market_data/"):
        continue
    rows.append({"Symbol": path.parts[-3], "Key": key, "Candles": 0, "Bytes": stat.st_size, "FirstUtc": "", "LastUtc": ""})
with output.open("w", newline="", encoding="utf-8") as stream:
    writer = csv.DictWriter(stream, fieldnames=["Symbol", "Key", "Candles", "Bytes", "FirstUtc", "LastUtc"])
    writer.writeheader()
    writer.writerows(sorted(rows, key=lambda row: row["Key"]))
print(f"Snapshot: {len(rows)} stable Parquet files, {sum(row['Bytes'] for row in rows):,} bytes")
