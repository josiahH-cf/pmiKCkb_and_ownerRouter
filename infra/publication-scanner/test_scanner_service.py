"""Protocol/controller fixtures only; these tests do not prove a real ClamAV scan."""
import hashlib
import importlib.util
import json
import pathlib
import socket
import struct
import sys
import threading
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

MODULE_PATH = pathlib.Path(__file__).with_name("scanner_service.py")
SPEC = importlib.util.spec_from_file_location("scanner_service", MODULE_PATH)
scanner = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = scanner
SPEC.loader.exec_module(scanner)


class ScannerProtocolTests(unittest.TestCase):
    def test_daily_header_and_loaded_version_match_exact_utc_time(self):
        stamp = 1793707200
        header = f"ClamAV-VDB:03 Nov 2026 12-00 +0000:28000:100:90:md5:sig:builder:{stamp}".encode()
        disk = scanner.parse_daily_header(header)
        loaded = scanner.parse_version("ClamAV 1.4.6/28000/Tue Nov  3 12:00:00 2026")
        self.assertEqual(disk, loaded[1])
        scanner.assert_current(loaded, disk, stamp + 10)

    def test_missing_old_future_or_wrong_loaded_database_is_unavailable(self):
        disk = scanner.DailyDatabase(28000, 1793707200)
        for loaded, now in [
            (("1.4.6", disk), disk.timestamp - 1),
            (("1.4.6", disk), disk.timestamp + 86401),
            (("1.4.6", scanner.DailyDatabase(27999, disk.timestamp)), disk.timestamp),
            (("1.4.5", disk), disk.timestamp),
        ]:
            with self.assertRaises(scanner.Unavailable):
                scanner.assert_current(loaded, disk, now)
        for text in ["ClamAV 1.4.6", "ClamAV 1.4.6/1/invalid", "COMMAND UNAVAILABLE"]:
            with self.assertRaises(scanner.Unavailable):
                scanner.parse_version(text)

    def test_instream_uses_original_bytes_and_exact_bounded_framing(self):
        payload = b'{"text":"fixture"}'
        parts = scanner.instream_parts(payload)
        self.assertEqual(parts[0], b"zINSTREAM\0")
        self.assertEqual(parts[1], struct.pack("!I", len(payload)))
        self.assertEqual(parts[2], payload)
        self.assertEqual(parts[-1], b"\0\0\0\0")
        with self.assertRaises(scanner.Unavailable):
            scanner.instream_parts(b"x" * (scanner.MAX_BYTES + 1))

    def test_only_complete_exact_clean_or_detection_replies_are_accepted(self):
        self.assertEqual(scanner.scan_result("stream: OK"), "clean")
        self.assertEqual(scanner.scan_result("stream: Synthetic.Test FOUND"), "malware_detected")
        for text in ["OK", "stream: OK extra", "stream: Access denied ERROR", "INSTREAM size limit exceeded. ERROR", "stream: Heuristics.Limits.Exceeded.MaxFileSize FOUND"]:
            with self.assertRaises(scanner.Unavailable):
                scanner.scan_result(text)

    def test_readiness_never_calls_the_updater(self):
        class Controller(scanner.EngineController):
            def _verified_disk(self, deadline):
                return scanner.DailyDatabase(28000, 1793707200)
            def _loaded(self, deadline):
                return ("1.4.6", scanner.DailyDatabase(28000, 1793707200))
            def _update(self, deadline):
                raise AssertionError("A readiness read cannot update")
        controller = Controller(clock=lambda: 1793707210)
        controller.update_ok = True
        value = controller.ready()
        self.assertEqual(value[0], "1.4.6")

    def test_response_contains_only_bound_identity_and_engine_metadata(self):
        body = b'{"text":"fixture"}'
        result = scanner.response_for(body, "clean", ("1.4.6", scanner.DailyDatabase(28000, 1793707200)))
        self.assertEqual(set(result), {"protocol", "contentHash", "scannedBytes", "malware", "engineVersion", "dailyVersion", "dailyTimestamp"})
        self.assertEqual(result["contentHash"], hashlib.sha256(body).hexdigest())
        self.assertEqual(result["dailyTimestamp"], "2026-11-03T12:00:00Z")
        self.assertNotIn("fixture", json.dumps(result))


class HttpContractTests(unittest.TestCase):
    def setUp(self):
        import http.client
        self.http = http.client
        self.calls = []
        calls = self.calls
        class Controller:
            def ready(self):
                return ("1.4.6", scanner.DailyDatabase(28000, 1793707200))
            def scan(self, body):
                calls.append(body)
                return scanner.response_for(body, "clean", self.ready())
        self.server = scanner.ScannerServer(("127.0.0.1", 0), Controller(), minimum_interval=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
    def request(self, method, path, body=None, headers=None):
        connection = self.http.HTTPConnection("127.0.0.1", self.server.server_address[1], timeout=3)
        connection.request(method, path, body=body, headers=headers or {})
        result = connection.getresponse()
        status, payload = result.status, json.loads(result.read())
        connection.close()
        return status, payload
    def test_ready_is_read_only_and_scan_preserves_exact_json_bytes(self):
        self.assertEqual(self.request("GET", "/ready")[0], 200)
        self.assertEqual(self.calls, [])
        body = b'{ "text": "fixture", "escaped":"\\u0061" }'
        status, result = self.request("POST", "/v1/scan", body, {"Content-Type": "application/json"})
        self.assertEqual(status, 200)
        self.assertEqual(self.calls, [body])
        self.assertEqual(result["contentHash"], hashlib.sha256(body).hexdigest())
    def test_wrong_type_nonobject_invalid_json_and_oversize_never_reach_engine(self):
        for body, content_type in [(b"{}", "text/plain"), (b"[]", "application/json"), (b"bad", "application/json")]:
            status, result = self.request("POST", "/v1/scan", body, {"Content-Type": content_type})
            self.assertEqual(status, 503)
            self.assertEqual(result, {"error": "scanner_unavailable"})
        self.assertEqual(self.calls, [])
        # An over-limit declaration is refused before accepting the body. Sending
        # the whole oversized body can correctly encounter the early close.
        status, result = self.request("POST", "/v1/scan", b"{}", {
            "Content-Type": "application/json", "Content-Length": str(scanner.MAX_BYTES + 1)})
        self.assertEqual((status, result), (503, {"error": "scanner_unavailable"}))
        self.assertEqual(self.calls, [])

    def test_nonfinite_duplicate_keys_transfer_encoding_and_wrong_paths_are_refused(self):
        for body, headers, path in [
            (b'{"a":NaN}', {"Content-Type": "application/json"}, "/v1/scan"),
            (b'{"a":1,"a":2}', {"Content-Type": "application/json"}, "/v1/scan"),
            (b"{}", {"Content-Type": "application/json", "Transfer-Encoding": "chunked"}, "/v1/scan"),
            (b"{}", {"Content-Type": "application/json"}, "/v1/scan?other=1"),
        ]:
            self.assertEqual(self.request("POST", path, body, headers), (503, {"error": "scanner_unavailable"}))
        self.assertEqual(self.calls, [])
    def test_engine_failure_has_no_internal_details(self):
        def fail(_body):
            raise scanner.Unavailable("do not expose fixture path or signature")
        self.server.controller.scan = fail
        status, result = self.request("POST", "/v1/scan", b"{}", {"Content-Type": "application/json"})
        self.assertEqual(status, 503)
        self.assertEqual(result, {"error": "scanner_unavailable"})

    def test_unsupported_methods_do_not_scan_or_claim_readiness(self):
        self.assertEqual(self.request("PUT", "/v1/scan", b"{}", {"Content-Type": "application/json"}),
                         (503, {"error": "scanner_unavailable"}))
        self.assertEqual(self.request("DELETE", "/ready"),
                         (503, {"error": "scanner_unavailable"}))
        self.assertEqual(self.calls, [])

    def test_separate_pdf_endpoint_preserves_original_bytes_and_json_endpoint_stays_strict(self):
        body = b"%PDF-1.7\n% synthetic protocol fixture\n%%EOF\n"
        status, result = self.request("POST", "/v1/scan-renewal-original", body,
                                      {"Content-Type": "application/pdf"})
        self.assertEqual(status, 200)
        self.assertEqual(self.calls, [body])
        self.assertEqual(result["contentHash"], hashlib.sha256(body).hexdigest())
        self.assertEqual(result["scannedBytes"], len(body))
        self.assertEqual(self.request("POST", "/v1/scan", body,
                                     {"Content-Type": "application/pdf"})[0], 503)
        self.assertEqual(len(self.calls), 1)

    def test_pdf_endpoint_refuses_wrong_type_incomplete_or_non_pdf_bytes_before_engine(self):
        for body, content_type in [(b"{}", "application/json"),
                                   (b"not a pdf", "application/pdf"),
                                   (b"%PDF-1.7\nincomplete", "application/pdf")]:
            self.assertEqual(self.request("POST", "/v1/scan-renewal-original", body,
                                         {"Content-Type": content_type}),
                             (503, {"error": "scanner_unavailable"}))
        self.assertEqual(self.calls, [])

    def test_pdf_detection_response_binds_the_original_bytes(self):
        body = b"%PDF-1.7\n% synthetic detection fixture\n%%EOF\n"
        def detected(original):
            self.calls.append(original)
            return scanner.response_for(original, "malware_detected", self.server.controller.ready())
        self.server.controller.scan = detected
        status, result = self.request("POST", "/v1/scan-renewal-original", body,
                                      {"Content-Type": "application/pdf"})
        self.assertEqual(status, 200)
        self.assertEqual(self.calls, [body])
        self.assertEqual(result["malware"], "malware_detected")
        self.assertEqual(result["contentHash"], hashlib.sha256(body).hexdigest())
        self.assertEqual(result["scannedBytes"], len(body))
        self.assertEqual(result["protocol"], "pmi-publication-scan/v1")

    def test_pdf_outage_returns_only_the_generic_unavailable_response(self):
        def failed(_body):
            raise scanner.Unavailable("internal fixture path and detection name")
        self.server.controller.scan = failed
        self.assertEqual(self.request("POST", "/v1/scan-renewal-original",
                                     b"%PDF-1.7\n%%EOF\n", {"Content-Type": "application/pdf"}),
                         (503, {"error": "scanner_unavailable"}))

    def test_pdf_endpoint_refuses_size_late_eof_transfer_encoding_and_other_paths(self):
        for body, headers, path in [
            (b"%PDF-1.7\n%%EOF\n", {"Content-Type": "application/pdf", "Content-Length": str(scanner.MAX_BYTES + 1)}, "/v1/scan-renewal-original"),
            (b"%PDF-1.7\n%%EOF" + b"x" * 2048, {"Content-Type": "application/pdf"}, "/v1/scan-renewal-original"),
            (b"%PDF-1.7\n%%EOF\n", {"Content-Type": "application/pdf", "Transfer-Encoding": "chunked"}, "/v1/scan-renewal-original"),
            (b"%PDF-1.7\n%%EOF\n", {"Content-Type": "application/pdf"}, "/v1/scan-renewal-original?raw=1"),
            (b"%PDF-1.7\n%%EOF\n", {"Content-Type": "application/pdf"}, "/v1/scan-arbitrary"),
        ]:
            self.assertEqual(self.request("POST", path, body, headers),
                             (503, {"error": "scanner_unavailable"}))
        self.assertEqual(self.calls, [])


class ControllerBoundaryTests(unittest.TestCase):
    def controller(self, versions=None, stale=False):
        class Process:
            def poll(self):
                return None
        class Controller(scanner.EngineController):
            def _verified_disk(self, deadline):
                return scanner.DailyDatabase(28000, 1793707200)
            def _loaded(self, deadline):
                return ("1.4.6", self._verified_disk(deadline))
            def _command(self, parts, deadline, maximum=15):
                self.commands.append(parts)
                return "stream: OK"
        value = Controller(clock=lambda: 1793707200 + (86401 if stale else 10))
        value.commands = []
        value.process = Process()
        value.last_update_attempt = scanner.time.monotonic()
        value.update_ok = True
        if versions is not None:
            value._ready = lambda _deadline: versions.pop(0)
        return value

    def test_stale_loaded_database_never_scans(self):
        value = self.controller(stale=True)
        with self.assertRaises(scanner.Unavailable):
            value.scan(b"{}")
        self.assertEqual(value.commands, [])

    def test_failed_refresh_remains_unavailable_without_repeated_update(self):
        value = self.controller()
        with patch.object(scanner, "bounded_command", side_effect=scanner.Unavailable()) as run:
            with self.assertRaises(scanner.Unavailable):
                value._update(scanner.time.monotonic() + 1)
            with self.assertRaises(scanner.Unavailable):
                value.scan(b"{}")
            with self.assertRaises(scanner.Unavailable):
                value.ready()
            self.assertEqual(run.call_count, 1)
        self.assertFalse(value.update_ok)
        self.assertEqual(value.commands, [])

    def test_database_change_during_scan_does_not_return_clean(self):
        versions = [("1.4.6", scanner.DailyDatabase(28000, 1793707200)),
                    ("1.4.6", scanner.DailyDatabase(28001, 1793707200))]
        value = self.controller(versions=versions)
        with self.assertRaises(scanner.Unavailable):
            value.scan(b"{}")
        self.assertEqual(len(value.commands), 1)

    def test_fresh_matching_loaded_database_binds_actual_scanned_bytes(self):
        value = self.controller()
        result = value.scan(b'{"fixture":true}')
        self.assertEqual(result["malware"], "clean")
        self.assertEqual(result["contentHash"], hashlib.sha256(b'{"fixture":true}').hexdigest())
        self.assertEqual(value.commands[0], scanner.instream_parts(b'{"fixture":true}'))

    def test_busy_engine_refuses_without_waiting_or_starting_an_update(self):
        value = self.controller()
        value.lock.acquire()
        try:
            with self.assertRaises(scanner.Unavailable):
                value.scan(b"{}")
            with self.assertRaises(scanner.Unavailable):
                value.ready()
        finally:
            value.lock.release()
        self.assertEqual(value.commands, [])


if __name__ == "__main__":
    unittest.main()
