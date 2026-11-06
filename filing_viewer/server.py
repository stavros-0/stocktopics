#!/usr/bin/env python3
"""Small local EDGAR reader. No third-party packages or database required."""

import argparse
import html
from html.parser import HTMLParser
import json
import mimetypes
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / "cache"
STATIC = ROOT.parent / "filings"
SEC_DATA = "https://data.sec.gov"
SEC_WWW = "https://www.sec.gov"
MIN_REQUEST_INTERVAL = 0.25
_request_lock = threading.Lock()
_last_request = 0.0
_manager_directory_lock = threading.Lock()
_manager_directory_rows = None
_manager_directory_loaded_at = 0.0


class SecError(Exception):
    pass


def cache_read(path):
    return path.read_bytes() if path.is_file() else None


def cache_write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + f".{threading.get_ident()}.tmp")
    temporary.write_bytes(content)
    temporary.replace(path)


def sec_get(url, cache_path, max_age=None):
    global _last_request
    cached = cache_read(cache_path)
    if cached is not None and (max_age is None or time.time() - cache_path.stat().st_mtime < max_age):
        return cached
    agent = os.environ.get("SEC_USER_AGENT", "").strip()
    if not agent:
        if cached is not None:
            return cached
        raise SecError("Set SEC_USER_AGENT to your name and email before downloading from SEC EDGAR.")
    try:
        with _request_lock:
            delay = MIN_REQUEST_INTERVAL - (time.monotonic() - _last_request)
            if delay > 0:
                time.sleep(delay)
            _last_request = time.monotonic()
            request = urllib.request.Request(url, headers={"User-Agent": agent, "Accept": "*/*"})
            with urllib.request.urlopen(request, timeout=30) as response:
                if response.status != 200:
                    raise SecError(f"SEC returned HTTP {response.status}")
                content = response.read()
        cache_write(cache_path, content)
        return content
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        if cached is not None:
            return cached
        raise SecError(f"Could not retrieve SEC data: {exc}") from exc


def sec_json(url, path, max_age=None):
    try:
        return json.loads(sec_get(url, path, max_age))
    except (ValueError, UnicodeError) as exc:
        raise SecError(f"Invalid SEC JSON: {exc}") from exc


def tickers():
    data = sec_json(f"{SEC_WWW}/files/company_tickers.json", CACHE / "company_tickers.json", 7 * 86400)
    return list(data.values()) if isinstance(data, dict) else data


def parse_master_index(content):
    """Read 13F filers from the SEC's pipe-delimited quarterly master index."""
    rows = []
    for line in content.decode("latin-1").splitlines():
        fields = line.split("|")
        if len(fields) != 5:
            continue
        cik, name, form, filed, _ = (part.strip() for part in fields)
        if not cik.isdigit() or not name or not form.startswith("13F-") or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", filed):
            continue
        rows.append({"cik_str": int(cik), "ticker": "", "title": name, "filing_date": filed, "latest_form": form})
    return rows


def recent_index_quarters(today=None, count=5):
    today = today or date.today()
    current = today.year * 4 + (today.month - 1) // 3
    return [divmod(current - offset, 4) for offset in range(count)]


def manager_directory():
    """Cache all filers found in the current and previous four SEC filing quarters."""
    global _manager_directory_rows, _manager_directory_loaded_at
    with _manager_directory_lock:
        if _manager_directory_rows is not None and time.time() - _manager_directory_loaded_at < 86400:
            return _manager_directory_rows
        destination = CACHE / "13f_managers.json"
        cached = cache_read(destination)
        if cached and time.time() - destination.stat().st_mtime < 86400:
            _manager_directory_rows = json.loads(cached)
            _manager_directory_loaded_at = time.time()
            return _manager_directory_rows
        by_cik = {}
        downloaded = 0
        for index, (year, zero_based_quarter) in enumerate(recent_index_quarters()):
            quarter = zero_based_quarter + 1
            name = f"{year}-QTR{quarter}.idx"
            try:
                content = sec_get(f"{SEC_WWW}/Archives/edgar/full-index/{year}/QTR{quarter}/master.idx",
                                  CACHE / "indices" / name, 86400 if index == 0 else 7 * 86400)
            except SecError:
                continue
            downloaded += 1
            for row in parse_master_index(content):
                cik = row["cik_str"]
                if cik not in by_cik or row["filing_date"] >= by_cik[cik]["filing_date"]:
                    by_cik[cik] = row
        if downloaded:
            _manager_directory_rows = list(by_cik.values())
            cache_write(destination, json_bytes(_manager_directory_rows))
        elif cached:
            _manager_directory_rows = json.loads(cached)
        else:
            raise SecError("13F manager directory unavailable. Set SEC_USER_AGENT and try again.")
        _manager_directory_loaded_at = time.time()
        return _manager_directory_rows


# Person-to-manager links need to be explicit: the SEC ticker list has no
# relationship between an investor's name and the manager filing a 13F.
INVESTOR_MANAGERS = json.loads((ROOT / "investor_managers.json").read_text())


def company_search(query):
    query = query.strip().lower()
    if not query:
        return []
    if query.isdigit():
        return [{"cik_str": int(query), "ticker": "", "title": f"CIK {int(query)}"}]
    normalized = " ".join(re.findall(r"[a-z0-9]+", query))
    people = []
    for entry in INVESTOR_MANAGERS:
        names = [" ".join(re.findall(r"[a-z0-9]+", entry["manager"].lower()))]
        for person in (entry["person"], *entry.get("aliases", [])):
            words = re.findall(r"[a-z0-9]+", person.lower())
            names.extend((" ".join(words), " ".join(reversed(words)), words[-1]))
        if normalized and any(normalized in name for name in names):
            people.append({"cik_str": entry["cik"], "ticker": "", "title": entry["manager"],
                           "matched_person": entry["person"], "match_note": entry.get("note", "13F holdings"),
                           "preferred_form": "13F-HR"})
    if people:
        return people
    try:
        rows = tickers()
    except SecError:
        rows = []
    matches = [row for row in rows if query in row["ticker"].lower() or query in row["title"].lower() or query == str(row["cik_str"])]
    if any(row["ticker"].lower() == query for row in matches):
        return matches[:30]
    try:
        managers = manager_directory()
    except SecError:
        if matches:
            return matches[:30]
        raise
    for row in managers:
        if query in row["title"].lower():
            matches.append({**row, "is_13f_manager": True, "preferred_form": "13F-HR"})
    matches.sort(key=lambda row: (row["title"].lower() != query,
                                  not row["title"].lower().startswith(query),
                                  row.get("ticker", "").lower() != query,
                                  not row.get("is_13f_manager", False), row["title"].lower()))
    return matches[:30]


def fiscal_period(report_date, fiscal_year_end):
    if not report_date or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", report_date):
        return None, None
    try:
        period = date.fromisoformat(report_date)
        end_month = int(fiscal_year_end[:2])
        end_day = int(fiscal_year_end[2:])
        if not 1 <= end_month <= 12 or not 1 <= end_day <= 31:
            return None, None
    except (ValueError, TypeError):
        return None, None
    fiscal_year = period.year + (period.month > end_month or (period.month == end_month and period.day > end_day))
    # A fiscal quarter ends every three months relative to the fiscal year end.
    months_since_year_end = (period.month - end_month) % 12
    quarter = ((months_since_year_end - 1) // 3 + 1) if months_since_year_end else 4
    return fiscal_year, max(1, min(4, quarter))


def submissions(cik):
    cik10 = f"{int(cik):010d}"
    base = sec_json(f"{SEC_DATA}/submissions/CIK{cik10}.json", CACHE / "submissions" / f"CIK{cik10}.json", 86400)
    entries = [base.get("filings", {}).get("recent", {})]
    for item in base.get("filings", {}).get("files", []):
        name = item.get("name", "")
        if not re.fullmatch(r"CIK\d{10}-submissions-\d{3}\.json", name):
            continue
        entries.append(sec_json(f"{SEC_DATA}/submissions/{name}", CACHE / "submissions" / name, 30 * 86400))
    fye = base.get("fiscalYearEnd", "1231")
    result = []
    seen = set()
    for group in entries:
        for index, accession in enumerate(group.get("accessionNumber", [])):
            if accession in seen:
                continue
            seen.add(accession)
            def field(name):
                values = group.get(name, [])
                return values[index] if index < len(values) else ""
            report_date = field("reportDate")
            year, quarter = fiscal_period(report_date, fye)
            form = field("form")
            # Annual reports represent Q4 for period selection (no separate Q4 10-Q).
            if form in ("10-K", "10-K/A") and year:
                quarter = 4
            result.append({
                "accession": accession,
                "form": form,
                "filingDate": field("filingDate"),
                "reportDate": report_date,
                "primaryDocument": field("primaryDocument"),
                "fiscalYear": year,
                "fiscalQuarter": quarter,
            })
    result.sort(key=lambda row: (row["filingDate"], row["accession"]), reverse=True)
    return {"cik": int(cik), "name": base.get("name", ""), "tickers": base.get("tickers", []), "fiscalYearEnd": fye, "filings": result}


def archive_url(cik, accession, path):
    if not re.fullmatch(r"\d{1,10}", cik) or not re.fullmatch(r"\d{10}-\d{2}-\d{6}", accession):
        raise SecError("Invalid filing identifier")
    path = urllib.parse.unquote(path)
    parts = path.split("/")
    if not path or any(part in ("", ".", "..") for part in parts) or "\\" in path or "\x00" in path:
        raise SecError("Invalid archive path")
    if path == "__full_submission__.txt":
        return f"{SEC_WWW}/Archives/edgar/data/{int(cik)}/{accession}.txt"
    safe_path = "/".join(urllib.parse.quote(part, safe="-._~") for part in parts)
    acc_flat = accession.replace("-", "")
    return f"{SEC_WWW}/Archives/edgar/data/{int(cik)}/{acc_flat}/{safe_path}"


SEC_ARCHIVE_ABSOLUTE = re.compile(rb"(?i)(\b(?:href|src|data|poster)\s*=\s*['\"]?)(?:https?:)?//(?:www\.)?sec\.gov/Archives/edgar/data/(\d+)/(\d{18})/")
SEC_ARCHIVE_ROOT = re.compile(rb"(?i)(\b(?:href|src|data|poster)\s*=\s*['\"]?)/Archives/edgar/data/(\d+)/(\d{18})/")


def localize_html(content):
    # Byte-level URL replacement leaves the original filing encoding and body intact.
    def replace(match):
        acc = match[3]
        return match[1] + b"/archive/" + str(int(match[2])).encode() + b"/" + acc[:10] + b"-" + acc[10:12] + b"-" + acc[12:] + b"/"
    html = SEC_ARCHIVE_ABSOLUTE.sub(replace, content)
    html = SEC_ARCHIVE_ROOT.sub(replace, html)
    # Some filings contain a <base> pointing at sec.gov, which would bypass local assets.
    return re.sub(rb"(?is)<base\b[^>]*>", b"", html)


def is_html_document(content):
    return bool(re.match(rb"(?is)^\s*(?:<!doctype\s+html\b|<html\b)", content))


class AssetParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.assets = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ("img", "source", "embed") and attrs.get("src"):
            self.assets.append(attrs["src"])
        elif tag == "link" and "stylesheet" in attrs.get("rel", "").lower() and attrs.get("href"):
            self.assets.append(attrs["href"])
        elif tag == "object" and attrs.get("data"):
            self.assets.append(attrs["data"])


def prefetch_filing(cik, filing):
    accession = filing["accession"]
    document = filing["primaryDocument"] or "__full_submission__.txt"
    url = archive_url(str(cik), accession, document)
    acc_flat = accession.replace("-", "")
    base_path = CACHE / "archives" / str(int(cik)) / acc_flat
    content = sec_get(url, base_path / document)
    if not document.lower().endswith((".htm", ".html")):
        return 1
    parser = AssetParser()
    parser.feed(content.decode("utf-8", errors="replace"))
    downloaded = 1
    for asset in set(parser.assets):
        absolute = urllib.parse.urljoin(url, asset)
        prefix = f"{SEC_WWW}/Archives/edgar/data/{int(cik)}/{acc_flat}/"
        if not absolute.startswith(prefix):
            continue
        relative = urllib.parse.unquote(urllib.parse.urlsplit(absolute).path[len(urllib.parse.urlsplit(prefix).path):])
        try:
            asset_url = archive_url(str(cik), accession, relative)
            sec_get(asset_url, base_path / relative)
            downloaded += 1
        except SecError:
            pass  # Some legacy image references no longer exist on EDGAR.
    return downloaded


def json_bytes(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def plain_text_page(content):
    """Display an as-filed text document with stable, readable browser colors."""
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("windows-1252", errors="replace")
    return (
        '<!doctype html><html><head><meta charset="utf-8">'
        '<style>:root{color-scheme:light}html,body{background:#fff;color:#111}'
        'body{margin:10px}pre{margin:0;font:12px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre;tab-size:8}</style>'
        '</head><body><pre>' + html.escape(text) + '</pre></body></html>'
    ).encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    def send_data(self, content, content_type, status=200, document=False):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store" if not document else "private, max-age=3600")
        self.send_header("X-Content-Type-Options", "nosniff")
        if document:
            self.send_header("Content-Security-Policy", "default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; media-src 'self' data:; object-src 'none'; script-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'")
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):
        parsed = urllib.parse.urlsplit(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)
        try:
            if path == "/api/companies":
                return self.send_data(json_bytes(company_search(query.get("q", [""])[0])), "application/json; charset=utf-8")
            if path == "/api/filings":
                cik = query.get("cik", [""])[0]
                if not re.fullmatch(r"\d{1,10}", cik):
                    raise SecError("A valid CIK is required")
                return self.send_data(json_bytes(submissions(cik)), "application/json; charset=utf-8")
            match = re.fullmatch(r"/archive/(\d{1,10})/(\d{10}-\d{2}-\d{6})/(.+)", path)
            if match:
                cik, accession, name = match.groups()
                url = archive_url(cik, accession, name)
                relative = urllib.parse.unquote(name)
                destination = CACHE / "archives" / str(int(cik)) / accession.replace("-", "") / relative
                content = sec_get(url, destination)
                kind = mimetypes.guess_type(relative)[0] or "application/octet-stream"
                if kind in ("text/html", "application/xhtml+xml") or relative.lower().endswith((".htm", ".html")) or is_html_document(content):
                    return self.send_data(localize_html(content), "text/html", document=True)
                if kind == "text/plain" or relative.lower().endswith((".txt", ".sgml")):
                    return self.send_data(plain_text_page(content), "text/html; charset=utf-8", document=True)
                return self.send_data(content, kind, document=True)
            static_path = "index.html" if path == "/" else path.removeprefix("/static/") if path.startswith("/static/") else path.lstrip("/")
            if static_path and static_path in ("index.html", "app.js", "styles.css", "config.js"):
                content = (STATIC / static_path).read_bytes()
                kind = mimetypes.guess_type(static_path)[0] or "text/plain"
                return self.send_data(content, kind + "; charset=utf-8")
            return self.send_data(b"Not found", "text/plain; charset=utf-8", 404)
        except SecError as exc:
            status = 400 if str(exc).startswith(("Invalid", "A valid")) else 502
            return self.send_data(json_bytes({"error": str(exc)}), "application/json; charset=utf-8", status)
        except Exception as exc:
            return self.send_data(json_bytes({"error": f"Server error: {exc}"}), "application/json; charset=utf-8", 500)


def main():
    parser = argparse.ArgumentParser(description="Local SEC EDGAR filing viewer")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--download-nike", action="store_true", help="Cache Nike's full filing index and company ticker list")
    parser.add_argument("--download-managers", action="store_true", help="Cache the recent SEC 13F manager directory")
    parser.add_argument("--prefetch-cik", help="Download original primary filings and embedded images/styles for a CIK")
    parser.add_argument("--quarter", type=int, choices=(1, 2, 3, 4), help="Fiscal quarter to prefetch")
    parser.add_argument("--year", type=int, help="Fiscal year to prefetch; omit for all years")
    parser.add_argument("--form", help="SEC form to prefetch, e.g. 10-Q or 8-K")
    args = parser.parse_args()
    if args.download_nike:
        tickers()
        data = submissions("320187")
        print(f"Cached {len(data['filings'])} Nike filing records; {sum(row['fiscalQuarter'] == 1 and row['form'] == '10-Q' for row in data['filings'])} Q1 10-Q records")
        return
    if args.download_managers:
        print(f"Cached {len(manager_directory())} recent 13F managers")
        return
    if args.prefetch_cik:
        if not re.fullmatch(r"\d{1,10}", args.prefetch_cik):
            parser.error("--prefetch-cik must be a numeric CIK")
        data = submissions(args.prefetch_cik)
        selected = [row for row in data["filings"] if
                    (not args.quarter or row["fiscalQuarter"] == args.quarter) and
                    (not args.year or row["fiscalYear"] == args.year) and
                    (not args.form or row["form"] == args.form)]
        print(f"Downloading {len(selected)} primary filings for {data['name']}…", flush=True)
        for index, filing in enumerate(selected, 1):
            count = prefetch_filing(args.prefetch_cik, filing)
            print(f"{index}/{len(selected)} {filing['form']} {filing['accession']} ({count} files)", flush=True)
        return
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Filing viewer: http://{args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped")


if __name__ == "__main__":
    try:
        main()
    except SecError as exc:
        print(f"SEC download failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
