import argparse
import json
from datetime import date, datetime, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from build_rothera_snapshot import ROOT, build_snapshot


PUBLIC_FILES = "https://publicfiles.rotheramarkets.com/clearing/outbound"
HISTORY_PATH = ROOT / "data" / "rothera_history.json"
SNAPSHOT_PATH = ROOT / "data" / "rothera_snapshot.json"


def load_history():
    if HISTORY_PATH.exists():
        days = json.loads(HISTORY_PATH.read_text(encoding="utf-8"))["days"]
    elif SNAPSHOT_PATH.exists():
        days = [json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))]
    else:
        days = []
    return {day["date"]: day for day in days}


def download_snapshot(trading_date):
    filename = f"mkt_eod_{trading_date:%Y%m%d}.csv"
    request = Request(f"{PUBLIC_FILES}/{filename}", headers={"User-Agent": "stock-topics/1.0"})
    try:
        with urlopen(request, timeout=60) as response:
            content = response.read()
    except HTTPError as error:
        if error.code == 404:
            return None
        raise

    with TemporaryDirectory() as directory:
        csv_path = Path(directory) / filename
        csv_path.write_bytes(content)
        snapshot = build_snapshot(csv_path)

    if snapshot["date"] != trading_date.isoformat():
        raise ValueError(f"Unexpected trading date in {filename}: {snapshot['date']}")
    return snapshot


def write_json_if_changed(path, value):
    contents = json.dumps(value, indent=2) + "\n"
    if not path.exists() or path.read_text(encoding="utf-8") != contents:
        path.write_text(contents, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Update Rothera daily history from public clearing files")
    parser.add_argument("--csv", type=Path, help="Use a downloaded CSV instead of fetching new files")
    parser.add_argument("--start-date", type=date.fromisoformat, help="Backfill from YYYY-MM-DD")
    arguments = parser.parse_args()
    history = load_history()

    if arguments.csv:
        snapshot = build_snapshot(arguments.csv)
        history[snapshot["date"]] = snapshot
    else:
        if not history and not arguments.start_date:
            parser.error("A snapshot or --start-date is required for the first run")
        latest_date = date.fromisoformat(max(history)) if history else arguments.start_date
        start_date = arguments.start_date or latest_date
        yesterday = datetime.now(ZoneInfo("America/New_York")).date() - timedelta(days=1)
        for ordinal in range(start_date.toordinal(), yesterday.toordinal() + 1):
            trading_date = date.fromordinal(ordinal)
            snapshot = download_snapshot(trading_date)
            if snapshot:
                history[snapshot["date"]] = snapshot
                print(f"Loaded {snapshot['date']}")

    if not history:
        parser.error("No Rothera clearing files were available")

    days = [history[trading_date] for trading_date in sorted(history)]
    write_json_if_changed(HISTORY_PATH, {"days": days})
    write_json_if_changed(SNAPSHOT_PATH, days[-1])
    print(f"Stored {len(days)} day(s); latest {days[-1]['date']}")


if __name__ == "__main__":
    main()
