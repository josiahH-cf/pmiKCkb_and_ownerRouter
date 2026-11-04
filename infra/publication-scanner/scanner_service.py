"""Bounded ClamAV transport. Cloud Run IAM, not this HTTP server, authenticates callers.

No request body, path, detection name or subprocess output is logged. A clean result
requires a real INSTREAM reply and matching, verified disk/loaded daily databases.
"""
import hashlib
import json
import os
import pathlib
import re
import selectors
import signal
import socket
import struct
import subprocess
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PROTOCOL = "pmi-publication-scan/v1"
ENGINE_VERSION = "1.4.6"
MAX_BYTES = 2 * 1024 * 1024
MAX_AGE_SECONDS = 24 * 60 * 60
UPDATE_INTERVAL_SECONDS = 60 * 60
SOCKET_PATH = "/tmp/pmi-clamav/clamd.sock"
DATABASE_PATH = pathlib.Path("/var/lib/clamav")
CLAMD_CONFIG = "/etc/clamav/pmi-clamd.conf"
FRESHCLAM_CONFIG = "/etc/clamav/pmi-freshclam.conf"


class Unavailable(Exception):
    """All callers receive the same bodyless diagnostic."""


@dataclass(frozen=True)
class DailyDatabase:
    version: int
    timestamp: int


def parse_daily_header(header):
    try:
        fields = header[:512].decode("ascii").rstrip("\0 \r\n").split(":")
        if len(fields) != 9 or fields[0] != "ClamAV-VDB" or int(fields[3]) <= 0:
            raise ValueError()
        value = DailyDatabase(int(fields[2]), int(fields[8]))
        if value.version <= 0 or value.timestamp <= 0:
            raise ValueError()
        return value
    except (ValueError, UnicodeError, OverflowError) as error:
        raise Unavailable() from error


def parse_version(text):
    match = re.fullmatch(r"ClamAV ([0-9]+\.[0-9]+\.[0-9]+)/([0-9]+)/(.+)", text)
    if not match:
        raise Unavailable()
    try:
        stamp = datetime.strptime(match[3], "%a %b %d %H:%M:%S %Y").replace(tzinfo=timezone.utc)
        return match[1], DailyDatabase(int(match[2]), int(stamp.timestamp()))
    except (ValueError, OverflowError) as error:
        raise Unavailable() from error


def assert_current(loaded, disk, now):
    if (loaded[0] != ENGINE_VERSION or loaded[1] != disk or disk.version <= 0
            or disk.timestamp > now or now - disk.timestamp > MAX_AGE_SECONDS):
        raise Unavailable()


def instream_parts(body):
    if not 0 < len(body) <= MAX_BYTES:
        raise Unavailable()
    result = [b"zINSTREAM\0"]
    for offset in range(0, len(body), 65536):
        chunk = body[offset:offset + 65536]
        result.extend((struct.pack("!I", len(chunk)), chunk))
    result.append(b"\0\0\0\0")
    return result


def scan_result(reply):
    if reply == "stream: OK":
        return "clean"
    if re.fullmatch(r"stream: [^\r\n\0]+ FOUND", reply) and "Heuristics.Limits.Exceeded" not in reply:
        return "malware_detected"
    raise Unavailable()


def response_for(body, malware, loaded):
    return {
        "protocol": PROTOCOL,
        "contentHash": hashlib.sha256(body).hexdigest(),
        "scannedBytes": len(body),
        "malware": malware,
        "engineVersion": loaded[0],
        "dailyVersion": loaded[1].version,
        "dailyTimestamp": datetime.fromtimestamp(loaded[1].timestamp, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def remaining(deadline, maximum):
    value = min(deadline - time.monotonic(), maximum)
    if value <= 0:
        raise Unavailable()
    return value


def bounded_command(argv, deadline, maximum, output_limit=16384):
    """Fixed executable arguments only; cap runtime and captured public tool output."""
    end = time.monotonic() + remaining(deadline, maximum)
    process = None
    try:
        process = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, env={**os.environ, "TZ": "Etc/UTC", "LC_ALL": "C"})
        output = bytearray()
        with selectors.DefaultSelector() as selector:
            os.set_blocking(process.stdout.fileno(), False)
            selector.register(process.stdout, selectors.EVENT_READ)
            while selector.get_map():
                for key, _ in selector.select(remaining(end, 1)):
                    chunk = os.read(key.fd, 4096)
                    if chunk:
                        output.extend(chunk)
                        if len(output) > output_limit:
                            raise Unavailable()
                    else:
                        selector.unregister(key.fileobj)
            if process.wait(timeout=remaining(end, 1)) != 0:
                raise Unavailable()
        return bytes(output).decode("utf-8", errors="strict")
    except (OSError, ValueError, UnicodeError, subprocess.SubprocessError) as error:
        raise Unavailable() from error
    finally:
        if process is not None:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=2)
            if process.stdout:
                process.stdout.close()


class EngineController:
    def __init__(self, clock=time.time):
        self.clock = clock
        self.lock = threading.Lock()
        self.process = None
        self.last_update_attempt = None
        self.update_ok = False

    def _command(self, parts, deadline, maximum=15):
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
                connection.settimeout(remaining(deadline, maximum))
                connection.connect(SOCKET_PATH)
                for part in parts:
                    connection.settimeout(remaining(deadline, maximum))
                    connection.sendall(part)
                reply = bytearray()
                while b"\0" not in reply:
                    connection.settimeout(remaining(deadline, maximum))
                    chunk = connection.recv(4096)
                    if not chunk:
                        raise Unavailable()
                    reply.extend(chunk)
                    if len(reply) > 4096:
                        raise Unavailable()
                if reply[-1:] != b"\0" or reply.count(b"\0") != 1:
                    raise Unavailable()
                return bytes(reply[:-1]).decode("ascii").rstrip("\r\n")
        except (OSError, UnicodeError) as error:
            raise Unavailable() from error

    def _verified_disk(self, deadline):
        files = [path for path in (DATABASE_PATH / "daily.cvd", DATABASE_PATH / "daily.cld") if path.exists()]
        if len(files) != 1 or files[0].is_symlink() or not files[0].is_file():
            raise Unavailable()
        path = files[0]
        def identity():
            value = path.stat()
            return value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns, value.st_ctime_ns
        stat_before = identity()
        with path.open("rb") as handle:
            disk = parse_daily_header(handle.read(512))
        output = bounded_command(["sigtool", "--info", str(path)], deadline, 8)
        if ("Verification OK." not in output
                or not re.search(rf"(?m)^Version:\s*{disk.version}\s*$", output)
                or stat_before != identity()):
            raise Unavailable()
        return disk

    def _loaded(self, deadline):
        return parse_version(self._command([b"zVERSION\0"], deadline, 3))

    def _ready(self, deadline):
        disk = self._verified_disk(deadline)
        loaded = self._loaded(deadline)
        assert_current(loaded, disk, self.clock())
        return loaded

    def ready(self):
        # Readiness is a genuine read: no update, daemon start or reload. The verified disk and
        # loaded daily databases decide; a failed hourly refresh alone does not refuse readiness.
        if not self.lock.acquire(blocking=False):
            raise Unavailable()
        try:
            return self._ready(time.monotonic() + 12)
        finally:
            self.lock.release()

    def _update(self, deadline):
        self.last_update_attempt = time.monotonic()
        self.update_ok = False
        bounded_command(["freshclam", "--config-file=" + FRESHCLAM_CONFIG], deadline, 30, 65536)
        disk = self._verified_disk(deadline)
        if disk.timestamp > self.clock() or self.clock() - disk.timestamp > MAX_AGE_SECONDS:
            raise Unavailable()
        if self.process is not None:
            if self._command([b"zRELOAD\0"], deadline, 3) != "RELOADING":
                raise Unavailable()
            while True:
                try:
                    assert_current(self._loaded(deadline), disk, self.clock())
                    break
                except Unavailable:
                    time.sleep(min(0.2, remaining(deadline, 0.2)))
        self.update_ok = True

    def start(self):
        deadline = time.monotonic() + 180
        self._update(min(deadline, time.monotonic() + 50))
        try:
            self.process = subprocess.Popen(["clamd", "--config-file=" + CLAMD_CONFIG],
                                            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                            stderr=subprocess.DEVNULL)
            while True:
                if self.process.poll() is not None:
                    raise Unavailable()
                try:
                    self._ready(deadline)
                    return
                except Unavailable:
                    time.sleep(min(0.25, remaining(deadline, 0.25)))
        except (OSError, Unavailable) as error:
            self.close()
            raise Unavailable() from error

    def scan(self, body):
        if not self.lock.acquire(blocking=False):
            raise Unavailable()
        try:
            deadline = time.monotonic() + 55
            if self.process is None or self.process.poll() is not None:
                raise Unavailable()
            if self.last_update_attempt is None or time.monotonic() - self.last_update_attempt >= UPDATE_INTERVAL_SECONDS:
                try:
                    self._update(deadline)
                except Unavailable:
                    # A failed refresh is not fatal by itself: the readiness check below still
                    # requires the verified disk and loaded daily databases to agree and to be
                    # under 24 hours old. The next refresh waits for the usual interval.
                    pass
            before = self._ready(deadline)
            malware = scan_result(self._command(instream_parts(body), deadline))
            after = self._ready(deadline)
            if before != after:
                raise Unavailable()
            return response_for(body, malware, after)
        finally:
            self.lock.release()

    def close(self):
        if self.process is not None and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=2)


def strict_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise Unavailable()
        value[key] = item
    return value


class ScannerHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def setup(self):
        super().setup()
        self.connection.settimeout(5)

    def log_message(self, *_args):
        pass

    def _reply(self, status, payload):
        body = json.dumps(payload, separators=(",", ":")).encode("ascii")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)
        self.close_connection = True

    def _unavailable(self):
        self._reply(503, {"error": "scanner_unavailable"})

    def do_GET(self):
        try:
            if self.path != "/ready":
                raise Unavailable()
            loaded = self.server.controller.ready()
            self._reply(200, {"protocol": PROTOCOL, "ready": True, "engineVersion": loaded[0],
                              "dailyVersion": loaded[1].version,
                              "dailyTimestamp": datetime.fromtimestamp(loaded[1].timestamp, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")})
        except Exception:
            self._unavailable()

    def do_POST(self):
        try:
            content_type = {"/v1/scan": "application/json",
                            "/v1/scan-renewal-original": "application/pdf"}.get(self.path)
            lengths = self.headers.get_all("Content-Length", [])
            if (content_type is None or self.headers.get("Transfer-Encoding") is not None
                    or len(lengths) != 1 or not re.fullmatch(r"[0-9]+", lengths[0])
                    or self.headers.get_all("Content-Type", []) != [content_type]):
                raise Unavailable()
            length = int(lengths[0])
            if not 0 < length <= MAX_BYTES:
                raise Unavailable()
            body = self.rfile.read(length)
            if len(body) != length:
                raise Unavailable()
            if content_type == "application/json":
                parsed = json.loads(body.decode("utf-8"), object_pairs_hook=strict_object,
                                    parse_constant=lambda _value: (_ for _ in ()).throw(Unavailable()))
                if not isinstance(parsed, dict):
                    raise Unavailable()
            elif not body.startswith(b"%PDF-") or b"%%EOF" not in body[-2048:]:
                # Shallow transport admission only. The application owns full
                # safe-PDF and bounded text/hidden-field inspection.
                raise Unavailable()
            if not self.server.admit_scan():
                raise Unavailable()
            self._reply(200, self.server.controller.scan(body))
        except Exception:
            self._unavailable()

    def do_unsupported(self):
        self._unavailable()

    do_PUT = do_unsupported
    do_DELETE = do_unsupported
    do_PATCH = do_unsupported
    do_OPTIONS = do_unsupported

    def send_error(self, *_args, **_kwargs):
        self._unavailable()


class ScannerServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 2
    allow_reuse_address = True

    def __init__(self, address, controller, minimum_interval=1):
        self.controller = controller
        self.minimum_interval = minimum_interval
        self.last_scan = float("-inf")
        self.rate_lock = threading.Lock()
        self.workers = threading.BoundedSemaphore(3)
        super().__init__(address, ScannerHandler)

    def admit_scan(self):
        with self.rate_lock:
            now = time.monotonic()
            if now - self.last_scan < self.minimum_interval:
                return False
            self.last_scan = now
            return True

    def process_request(self, request, client_address):
        if not self.workers.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.workers.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.workers.release()

    def handle_error(self, *_args):
        # The stdlib default prints exception/request details; never do that here.
        pass


def main():
    controller = EngineController()
    try:
        controller.start()
        server = ScannerServer(("0.0.0.0", int(os.environ.get("PORT", "8080"))), controller)
        def terminate(_signum, _frame):
            threading.Thread(target=server.shutdown, daemon=True).start()
        signal.signal(signal.SIGTERM, terminate)
        signal.signal(signal.SIGINT, terminate)
        try:
            server.serve_forever(poll_interval=0.2)
        finally:
            server.server_close()
    except Exception:
        # Generic startup failure only. No subprocess output or host paths.
        print("publication_scanner_unavailable", flush=True)
        return 1
    finally:
        controller.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
