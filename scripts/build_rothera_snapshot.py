import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CATEGORY_ORDER = ("Sports", "Politics", "Economy & finance", "Crypto", "Other")
SPORTS_PREFIXES = ("NFL", "MLB", "NBA", "NHL", "NCAAF", "NCAAMB", "UCL", "EPL", "MARMAD", "WMARMAD")
POLITICS_PREFIXES = ("SENRACE", "GOVRACE", "CNTRL", "HOURACE", "USPRES", "VPPARTYNOM")
CRYPTO_PREFIXES = ("CRYPTO", "BTC", "ETH", "SOL")


def category_for_product(product):
    if product.startswith(SPORTS_PREFIXES):
        return "Sports"
    if product.startswith(POLITICS_PREFIXES):
        return "Politics"
    if product.startswith("EC"):
        return "Economy & finance"
    if product.startswith(CRYPTO_PREFIXES):
        return "Crypto"
    return "Other"


def build_snapshot(csv_path):
    products = defaultdict(int)
    dates = set()

    with csv_path.open(newline="", encoding="utf-8-sig") as source:
        for row in csv.DictReader(source):
            dates.add(row["date"])
            product = row["product"].split("-", 1)[0]
            products[product] += int(row["volume"])

    if len(dates) != 1:
        raise ValueError("Expected one trading date in the clearing file")

    product_rows = sorted(
        (
            {"code": code, "category": category_for_product(code), "volume": volume}
            for code, volume in products.items()
        ),
        key=lambda product: (-product["volume"], product["code"]),
    )
    categories = {category: 0 for category in CATEGORY_ORDER}
    for product in product_rows:
        categories[product["category"]] += product["volume"]

    return {
        "date": dates.pop(),
        "source": "Rothera clearing/outbound/mkt_eod",
        "totalVolume": sum(categories.values()),
        "categories": [{"name": name, "volume": categories[name]} for name in CATEGORY_ORDER],
        "products": product_rows,
    }


def main():
    parser = argparse.ArgumentParser(description="Build the Rothera daily volume snapshot")
    parser.add_argument("csv_path", type=Path)
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "rothera_snapshot.json")
    arguments = parser.parse_args()
    snapshot = build_snapshot(arguments.csv_path)
    arguments.output.write_text(json.dumps(snapshot, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {arguments.output} for {snapshot['date']}")


if __name__ == "__main__":
    main()
