"""Verify local HistData ZIPs, including decompression CRC, and write a SHA256 manifest."""

import csv
import hashlib
import re
import sys
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


def inspect(path: Path) -> dict[str, object]:
    symbol = path.parent.name
    if not re.fullmatch(rf"HISTDATA_COM_ASCII_{symbol}_M1_\d{{4,6}}\.zip", path.name):
        raise ValueError(f"Unexpected archive name: {path}")
    with zipfile.ZipFile(path) as archive:
        csv_entries = [entry for entry in archive.infolist() if re.fullmatch(
            rf"DAT_ASCII_{symbol}_M1_\d{{4,6}}\.csv", entry.filename
        ) and entry.file_size > 0]
        if len(csv_entries) != 1:
            raise ValueError(f"Expected one nonempty M1 CSV: {path}")
        bad_entry = archive.testzip()
        if bad_entry:
            raise ValueError(f"CRC failed for {bad_entry}: {path}")
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return {
        "Symbol": symbol,
        "Archive": path.name,
        "Bytes": path.stat().st_size,
        "SHA256": digest.hexdigest().upper(),
    }


def main() -> None:
    root = Path(sys.argv[1]).resolve()
    files = sorted(root.glob("*/*.zip"))
    if not files:
        raise SystemExit(f"No ZIP archives found under {root}")
    with ThreadPoolExecutor(max_workers=4) as pool:
        rows = list(pool.map(inspect, files))
    manifest = root / "downloads_verified.csv"
    with manifest.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=["Symbol", "Archive", "Bytes", "SHA256"])
        writer.writeheader()
        writer.writerows(rows)
    print(f"Verified {len(rows)} ZIPs, {sum(int(row['Bytes']) for row in rows):,} bytes; manifest: {manifest}")


if __name__ == "__main__":
    main()
