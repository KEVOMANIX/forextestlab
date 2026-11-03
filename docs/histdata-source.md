# HistData replay source

HistData is an optional, per-replay source. The setup screen shows it only after the `histdata_market_data` R2 prefix contains at least one supported market with M1 data. Each session stores `histdata-r2` or the existing source in `dataSource`; resume, chart history, trade review, optimizer, AI level tests, duplicate, and branch use that source.

## Before import

Obtain HistData Generic ASCII M1 monthly archives and confirm permission to serve the data through ForexTestLab. Extract each archive locally. The importer takes the extracted CSV, not the ZIP. HistData tick files are a different format and are not accepted. The current replay engine uses M1 candles.

The free download page also offers a yearly ZIP for completed years and monthly ZIPs for the current year. To download the seven major FX pairs to local storage, with ZIP validation and resumable skips:

```powershell
./scripts/download-histdata-free.ps1 -Destination 'E:\desktop\histdata-market-data'
```

This downloads archives only. It does not publish them to R2.
Some HistData archive pages list a filename but supply no download token. The downloader logs these as unavailable and continues; inspect `download-<SYMBOL>.log` in the destination for the gaps.

After downloading, check every ZIP's contents and CRC and write `downloads_verified.csv` with SHA256 hashes:

```sh
python scripts/audit-histdata-downloads.py E:/desktop/histdata-market-data
```

## Dry run and upload

```sh
npm run data:import-histdata -- --symbol EURUSD --file path/to/DAT_ASCII_EURUSD_M1_202401.csv
npm run data:import-histdata -- --symbol EURUSD --file path/to/DAT_ASCII_EURUSD_M1_202401.csv --upload --rights-confirmed
```

Run the command for each extracted monthly CSV. Upload merges with any already stored UTC month because an EST source month spans two UTC months. `HISTDATA_R2_PREFIX` defaults to `histdata_market_data` and must differ from `R2_PREFIX`. The importer uses the existing `R2_ENDPOINT`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` environment variables.

The importer converts HistData's fixed EST timestamps to UTC by adding five hours year round. HistData M1 OHLC is bid data; the source volume column is omitted because it does not represent reliable trade volume. Keep the original ZIP files and an import log for provenance. Missing market months are not filled from Dukascopy.
