import tempfile
import threading
import unittest
import urllib.request
from datetime import date
from pathlib import Path
from unittest.mock import patch

from filing_viewer import server


class FilingViewerTests(unittest.TestCase):
    def test_sec_master_index_builds_recent_13f_manager_directory(self):
        newer = (b"CIK|Company Name|Form Type|Date Filed|Filename\n"
                 b"1423053|CITADEL ADVISORS LLC|13F-HR|2026-08-14|edgar/data/1423053/new.txt\n"
                 b"1656456|Appaloosa LP|13F-NT|2026-08-14|edgar/data/1656456/new.txt\n"
                 b"320187|NIKE INC|10-K|2026-08-14|edgar/data/320187/new.txt\n")
        older = b"1423053|OLD CITADEL NAME|13F-HR|2026-05-15|edgar/data/1423053/old.txt\n"
        with tempfile.TemporaryDirectory() as temp, \
             patch.object(server, "CACHE", Path(temp)), \
             patch.object(server, "_manager_directory_rows", None), \
             patch.object(server, "recent_index_quarters", return_value=[(2026, 2), (2026, 1)]), \
             patch.object(server, "sec_get", side_effect=[newer, older]):
            rows = server.manager_directory()
            self.assertEqual({row["title"] for row in rows}, {"CITADEL ADVISORS LLC", "Appaloosa LP"})
            self.assertEqual(len(rows), 2)
        self.assertEqual(server.recent_index_quarters(date(2026, 1, 1), 2), [(2026, 0), (2025, 3)])

    def test_company_search_finds_uncurated_13f_manager(self):
        manager = {"cik_str": 1987654, "ticker": "", "title": "Unmapped Capital LP",
                   "filing_date": "2026-08-14", "latest_form": "13F-HR"}
        with patch.object(server, "tickers", return_value=[]), \
             patch.object(server, "manager_directory", return_value=[manager]):
            result = server.company_search("unmapped")
        self.assertEqual(result[0]["cik_str"], 1987654)
        self.assertEqual(result[0]["preferred_form"], "13F-HR")

    def test_exact_ticker_search_does_not_wait_for_manager_directory(self):
        with patch.object(server, "tickers", return_value=[{"cik_str": 320187, "ticker": "NKE", "title": "NIKE, Inc."}]), \
             patch.object(server, "manager_directory", side_effect=AssertionError("should not fetch managers")):
            self.assertEqual(server.company_search("NKE")[0]["cik_str"], 320187)

    def test_empty_search_does_not_select_a_default_filer(self):
        with patch.object(server, "tickers", side_effect=AssertionError("ticker lookup should not be needed")):
            self.assertEqual(server.company_search("  "), [])

    def test_investor_name_search_resolves_to_13f_manager_without_ticker_data(self):
        with patch.object(server, "tickers", side_effect=AssertionError("ticker lookup should not be needed")):
            for query in ("Ackman, Bill", "Bill Ackman", "Ackman"):
                with self.subTest(query=query):
                    result = server.company_search(query)
                    self.assertEqual([row["cik_str"] for row in result], [2026053, 1336528])
                    self.assertEqual(result[0]["preferred_form"], "13F-HR")
            for query, cik in (("Griffin, Ken", 1423053), ("Kenneth Griffin", 1423053),
                               ("Loeb, Dan", 1040273), ("Tepper, David", 1656456),
                               ("Klarman, Seth", 1061768), ("Buffett, Warren", 1067983),
                               ("Soros, George", 1029160)):
                with self.subTest(query=query):
                    self.assertEqual(server.company_search(query)[0]["cik_str"], cik)

    def test_html_detection_keeps_real_xml_as_xml(self):
        self.assertTrue(server.is_html_document(b'<!DOCTYPE html><html><head><meta charset="utf-8">'))
        self.assertFalse(server.is_html_document(b'<?xml version="1.0"?><informationTable/>'))

    def test_nike_fiscal_calendar_and_annual_q4(self):
        self.assertEqual(server.fiscal_period("2026-08-31", "0531"), (2027, 1))
        self.assertEqual(server.fiscal_period("2025-11-30", "0531"), (2026, 2))
        self.assertEqual(server.fiscal_period("2026-02-28", "0531"), (2026, 3))
        self.assertEqual(server.fiscal_period("2026-05-31", "0531"), (2026, 4))

    def test_full_history_joins_older_submission_files(self):
        recent = {"accessionNumber": ["0000320187-26-000001"], "form": ["10-Q"],
                  "filingDate": ["2026-10-01"], "reportDate": ["2026-08-31"],
                  "primaryDocument": ["recent.htm"]}
        older = {"accessionNumber": ["0000320187-95-000001"], "form": ["10-Q"],
                 "filingDate": ["1995-10-01"], "reportDate": ["1995-08-31"],
                 "primaryDocument": ["older.htm"]}
        base = {"name": "NIKE, Inc.", "tickers": ["NKE"], "fiscalYearEnd": "0531",
                "filings": {"recent": recent, "files": [{"name": "CIK0000320187-submissions-001.json"}]}}
        with patch.object(server, "sec_json", side_effect=[base, older]):
            result = server.submissions("320187")
        self.assertEqual(len(result["filings"]), 2)
        self.assertEqual((result["filings"][1]["fiscalYear"], result["filings"][1]["fiscalQuarter"]), (1996, 1))

    def test_archive_is_localized_and_available_offline(self):
        accession = "0000320187-26-000001"
        html = b'<html><img src="chart.png"><a href="https://www.sec.gov/Archives/edgar/data/320187/000032018726000001/note.htm">Notes</a><table><tr><td>$123</td></tr></table></html>'
        with tempfile.TemporaryDirectory() as temp, patch.object(server, "CACHE", Path(temp)), patch.dict("os.environ", {"SEC_USER_AGENT": ""}):
            doc = Path(temp) / "archives" / "320187" / "000032018726000001" / "filing.htm"
            doc.parent.mkdir(parents=True)
            doc.write_bytes(html)
            disguised_html = doc.parent / "primary_doc.xml"
            disguised_html.write_bytes(b'<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>13F</body></html>')
            httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
            thread = threading.Thread(target=httpd.serve_forever, daemon=True)
            thread.start()
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{httpd.server_port}/") as response:
                    self.assertIn(b"Stock Topics", response.read())
                with urllib.request.urlopen(f"http://127.0.0.1:{httpd.server_port}/static/config.js") as response:
                    self.assertIn(b"FILINGS_API_BASE", response.read())
                with urllib.request.urlopen(f"http://127.0.0.1:{httpd.server_port}/app.js") as response:
                    self.assertIn(b"API_BASE", response.read())
                with urllib.request.urlopen(f"http://127.0.0.1:{httpd.server_port}/archive/320187/{accession}/filing.htm") as response:
                    body = response.read()
                    self.assertIn(b"$123", body)
                    self.assertIn(b'/archive/320187/0000320187-26-000001/note.htm', body)
                    self.assertIn(b'img src="chart.png"', body)
                    self.assertIn("script-src 'none'", response.headers["Content-Security-Policy"])
                with urllib.request.urlopen(f"http://127.0.0.1:{httpd.server_port}/archive/320187/{accession}/primary_doc.xml") as response:
                    self.assertEqual(response.headers.get_content_type(), "text/html")
                    self.assertIn(b"13F", response.read())
            finally:
                httpd.shutdown()
                thread.join()
                httpd.server_close()

    def test_archive_rejects_traversal(self):
        with self.assertRaises(server.SecError):
            server.archive_url("320187", "0000320187-26-000001", "../secret.txt")

    def test_url_localization_does_not_change_filing_text(self):
        source = b'<a href="https://www.sec.gov/Archives/edgar/data/320187/000032018726000001/note.htm">https://www.sec.gov/Archives/edgar/data/320187/000032018726000001/note.htm</a>'
        result = server.localize_html(source)
        self.assertIn(b'href="/archive/320187/0000320187-26-000001/note.htm"', result)
        self.assertIn(b'>https://www.sec.gov/Archives/edgar/data/320187/000032018726000001/note.htm</a>', result)

    def test_plain_text_filing_has_dark_text_and_preserves_spacing(self):
        source = b"REVENUE  $123\n  Notes <as filed> & more\n"
        page = server.plain_text_page(source)
        self.assertIn(b"background:#fff;color:#111", page)
        self.assertIn(b"REVENUE  $123\n  Notes &lt;as filed&gt; &amp; more\n", page)
        self.assertEqual(source, b"REVENUE  $123\n  Notes <as filed> & more\n")


if __name__ == "__main__":
    unittest.main()
