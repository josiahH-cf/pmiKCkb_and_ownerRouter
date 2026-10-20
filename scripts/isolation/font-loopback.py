"""Serve only provenance-checked public font bytes inside one isolated network namespace.

Turbopack's Google mock hook replaces CSS, not its HTTP font-file fetcher. The parent entry
starts this credential-free child in the chroot, materializes a data-only loopback CSS map,
then binds that map read-only before dropping fixture capabilities and running the controls.
No directory, general file route, proxy, shutdown endpoint or external destination is exposed.
"""
import argparse
import datetime
import errno
import hashlib
import http.client
import http.server
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import signal
import socket
import time
import urllib.parse

CACHE = Path('/opt/public-fonts')
RUNTIME = Path('/opt/public-font-runtime')
READY = Path('/evidence/font-server-ready.json')
RESULT = Path('/evidence/font-server-result.json')
SCHEMA = 'pmikc-public-font-loopback/v1'
MAX_REQUESTS = 256


def public_fonts():
    spec = importlib.util.spec_from_file_location('loopback_public_fonts', Path(__file__).with_name('public-fonts.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write_new(path, value):
    with path.open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


def loopback_base(value):
    if not isinstance(value, str):
        raise ValueError('Font runtime URL must be text')
    parsed = urllib.parse.urlsplit(value)
    if (not re.fullmatch(r'http://127\.0\.0\.1:[0-9]{1,5}/[0-9a-f]{32}/', value)
            or parsed.scheme != 'http' or parsed.hostname != '127.0.0.1'
            or not 1024 < parsed.port <= 65535 or parsed.query or parsed.fragment):
        raise ValueError('Font runtime requires an exact nonce-bound isolated loopback URL')
    return value


def css_for_loopback(css, fonts, base):
    module = public_fonts()
    loopback_base(base)
    urls = module.validate_css(css)
    if not isinstance(fonts, list) or sorted(row['url'] for row in fonts) != urls:
        raise ValueError('Font runtime does not match every original public CSS URL')
    rewritten = css
    for font in fonts:
        if (not re.fullmatch(r'[0-9a-f]{64}', font['sha256'])
                or font['file'] != font['sha256'] + '.woff2'):
            raise ValueError('Font runtime contains an unreviewed asset name')
        module.font_url(font['url'])
        rewritten = rewritten.replace(font['url'], base + font['file'])
    return rewritten


def process_identity(pid):
    fields = Path(f'/proc/{pid}/stat').read_text().split(') ', 1)[1].split()
    status = Path(f'/proc/{pid}/status').read_text().splitlines()
    uids = next(row.split()[1:] for row in status if row.startswith('Uid:'))
    if len(set(uids)) != 1:
        raise ValueError('Font child has inconsistent real/effective/saved filesystem UIDs')
    return {'parentPid': int(fields[1]), 'startTimeTicks': int(fields[19]),
            'uid': int(uids[0]), 'userNamespace': os.readlink(f'/proc/{pid}/ns/user'),
            'pidNamespace': os.readlink(f'/proc/{pid}/ns/pid'),
            'netNamespace': os.readlink(f'/proc/{pid}/ns/net')}


def read_ready():
    if READY.is_symlink() or not READY.is_file() or READY.stat().st_size > 8192:
        raise ValueError('Font server readiness is missing or unbounded')
    ready = json.loads(READY.read_text())
    if (ready.get('schemaVersion') != SCHEMA or ready.get('state') != 'ready'
            or not isinstance(ready.get('pid'), int) or ready['pid'] <= 1
            or ready.get('uid') != int(os.environ['PMI_FIXTURE_UID'])
            or ready.get('parentPid') != 1
            or ready.get('userNamespace') != os.readlink('/proc/self/ns/user')
            or ready.get('pidNamespace') != os.readlink('/proc/self/ns/pid')
            or ready.get('netNamespace') != os.readlink('/proc/self/ns/net')
            or ready.get('sourceManifestSha256') != os.environ['PMI_SOURCE_MANIFEST_SHA256']
            or ready.get('cacheManifestSha256') != sha((CACHE / 'font-manifest.json').read_bytes())):
        raise ValueError('Font server identity differs from this isolated fixture')
    loopback_base(ready['baseUrl'])
    if process_identity(ready['pid']) != {key: ready[key] for key in
            ['parentPid', 'startTimeTicks', 'uid', 'userNamespace', 'pidNamespace', 'netNamespace']}:
        raise ValueError('Font server process identity changed')
    if ready['uid'] != 0:
        status = Path(f"/proc/{ready['pid']}/status").read_text().splitlines()
        if any(int(row.split()[1], 16) != 0 for row in status if row.startswith(('CapEff:', 'CapPrm:', 'CapBnd:'))):
            raise ValueError('CI font child retained a host capability')
    expected = [b'/usr/bin/python3', b'/probe/font-loopback.py', b'--serve']
    if Path(f"/proc/{ready['pid']}/cmdline").read_bytes().split(b'\0')[:-1] != expected:
        raise ValueError('Font server is not the owned fixed command')
    return ready


def materialize():
    module = public_fonts()
    fonts = module.validate_cache(CACHE)
    if fonts['request']['sourceManifestSha256'] != os.environ['PMI_SOURCE_MANIFEST_SHA256']:
        raise ValueError('Font materialization belongs to a different source')
    ready = read_ready()
    css = css_for_loopback((CACHE / 'original.css').read_text(), fonts['fonts'], ready['baseUrl'])
    response = module.response_map(module.CSS_URL, css)
    if RUNTIME.is_symlink() or not RUNTIME.is_dir() or any(RUNTIME.iterdir()):
        raise ValueError('Font runtime requires a fresh empty owned directory')
    target = RUNTIME / 'responses.cjs'
    with target.open('x') as stream:
        stream.write(response)
    # Owner-writable mode makes the later EROFS probe prove the mount, not a mode-bit refusal.
    target.chmod(0o644)
    record = {**ready, 'responseMapSha256': sha(response.encode()), 'rewrittenCssSha256': sha(css.encode())}
    write_new(RUNTIME / 'runtime-map.json', record)
    (RUNTIME / 'runtime-map.json').chmod(0o644)


def validate_runtime(fonts):
    module = public_fonts()
    ready = read_ready()
    if RUNTIME.is_symlink() or {p.name for p in RUNTIME.iterdir()} != {'responses.cjs', 'runtime-map.json'}:
        raise ValueError('Font runtime contains an unexpected file')
    for name, maximum in [('responses.cjs', 2 * 1024 * 1024), ('runtime-map.json', 8192)]:
        path = RUNTIME / name
        if path.is_symlink() or not path.is_file() or path.stat().st_size > maximum:
            raise ValueError('Font runtime file is not bounded regular data')
        try:
            with path.open('a') as stream:
                stream.write('')
        except OSError as error:
            if error.errno != errno.EROFS:
                raise
        else:
            raise ValueError('Font runtime map is not mounted read-only')
    css = css_for_loopback((CACHE / 'original.css').read_text(), fonts['fonts'], ready['baseUrl'])
    response = module.response_map(module.CSS_URL, css)
    expected = {**ready, 'responseMapSha256': sha(response.encode()), 'rewrittenCssSha256': sha(css.encode())}
    if ((RUNTIME / 'responses.cjs').read_text() != response
            or json.loads((RUNTIME / 'runtime-map.json').read_text()) != expected):
        raise ValueError('Font runtime changed more than its exact loopback asset URLs')
    parsed = urllib.parse.urlsplit(ready['baseUrl'])
    first = fonts['fonts'][0]
    path = parsed.path + first['file']
    client = http.client.HTTPConnection('127.0.0.1', parsed.port, timeout=2)
    try:
        client.request('GET', path)
        reply = client.getresponse()
        body = reply.read(module.MAX_FONT_BYTES + 1)
        if (reply.status != 200 or reply.getheader('Content-Type') != 'font/woff2'
                or sha(body) != first['sha256'] or len(body) != first['bytes']):
            raise ValueError('Loopback font response does not match the original public bytes')
        module.validate_woff2(body)
    finally:
        client.close()
    refusals = [('/', 'GET', None),
        (parsed.path + '0' * 64 + '.woff2', 'GET', None),
        (parsed.path + '../' + first['file'], 'GET', None),
        (path + '?unreviewed=1', 'GET', None), (path, 'POST', None),
        (path, 'GET', {'Host': 'unreviewed.invalid'})]
    for request_path, method, headers in refusals:
        client = http.client.HTTPConnection('127.0.0.1', parsed.port, timeout=2)
        try:
            client.request(method, request_path, headers=headers or {})
            reply = client.getresponse()
            if reply.status != (405 if method == 'POST' else 404) or reply.read(1):
                raise ValueError('Font server admitted an unsupported route, host or method')
        finally:
            client.close()
    return {'passed': True, 'pid': ready['pid'], 'startTimeTicks': ready['startTimeTicks'],
            'pidNamespace': ready['pidNamespace'], 'netNamespace': ready['netNamespace'],
            'responseMapPath': str(RUNTIME / 'responses.cjs'),
            'port': parsed.port, 'responseMapSha256': expected['responseMapSha256'],
            'positiveFontSha256': first['sha256'], 'negativeHttpCasesPassed': len(refusals)}


def pin_server():
    ready = read_ready()
    if os.getpid() != 1 or process_identity(ready['pid'])['parentPid'] != os.getpid():
        raise ValueError('Font server must be the namespace init direct child')
    fd = os.pidfd_open(ready['pid'])
    if read_ready() != ready:
        os.close(fd)
        raise ValueError('Font server identity changed while pinning its pidfd')
    return ready, fd


def stop_server(ready, fd):
    signals = []
    code = None
    try:
        for sig, seconds in [(signal.SIGTERM, 3), (signal.SIGKILL, 1)]:
            try:
                signal.pidfd_send_signal(fd, sig)
                signals.append(sig.name)
            except ProcessLookupError:
                pass
            deadline = time.monotonic() + seconds
            while time.monotonic() < deadline:
                waited, status = os.waitpid(ready['pid'], os.WNOHANG)
                if waited:
                    code = os.waitstatus_to_exitcode(status)
                    break
                time.sleep(0.025)
            if code is not None:
                break
    finally:
        os.close(fd)
    saved = json.loads(RESULT.read_text()) if RESULT.is_file() and RESULT.stat().st_size <= 8192 else {}
    port = urllib.parse.urlsplit(ready['baseUrl']).port
    with socket.socket() as client:
        client.settimeout(0.3)
        connection_error = client.connect_ex(('127.0.0.1', port))
    port_closed = connection_error == errno.ECONNREFUSED
    terminal_matches = (code == 0 and saved.get('state') == 'complete'
        and all(saved.get(key) == ready[key] for key in ready if key != 'state')
        and saved.get('unexpectedErrors') == 0)
    passed = terminal_matches and port_closed
    record = {'checkedUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'pidfdBoundPid': ready['pid'], 'startTimeTicks': ready['startTimeTicks'],
              'childExitCode': code, 'signalsSent': signals, 'terminalReceiptMatches': terminal_matches,
              'port': port, 'namespacePortClosed': port_closed, 'connectionError': connection_error,
              'passed': passed, 'scope': 'Only the pre-application pinned direct font-server child'}
    write_new(Path('/evidence/font-server-cleanup.json'), record)
    return record


def serve():
    module = public_fonts()
    fonts = module.validate_cache(CACHE)
    if fonts['request']['sourceManifestSha256'] != os.environ['PMI_SOURCE_MANIFEST_SHA256']:
        raise ValueError('Font serving belongs to a different source')
    assets = {font['file']: (CACHE / font['file']).read_bytes() for font in fonts['fonts']}
    nonce = secrets.token_hex(16)
    counters = {'requests': 0, 'served': 0, 'refused': 0, 'unexpectedErrors': 0}

    class Server(http.server.HTTPServer):
        allow_reuse_address = False
        request_queue_size = 16

        def handle_error(self, *_unused):
            counters['unexpectedErrors'] += 1

    class Handler(http.server.BaseHTTPRequestHandler):
        def setup(self):
            self.request.settimeout(2)
            super().setup()

        def answer(self, method_allowed=True, head=False):
            counters['requests'] += 1
            prefix = '/' + nonce + '/'
            name = self.path[len(prefix):] if self.path.startswith(prefix) else ''
            allowed = (method_allowed and counters['requests'] <= MAX_REQUESTS
                and self.headers.get_all('Host') == [f'127.0.0.1:{self.server.server_port}']
                and name in assets and self.path == prefix + name)
            status = 200 if allowed else (404 if method_allowed else 405)
            body = assets[name] if allowed else b''
            counters['served' if allowed else 'refused'] += 1
            self.send_response(status)
            self.send_header('Content-Type', 'font/woff2' if allowed else 'application/octet-stream')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Connection', 'close')
            if not method_allowed:
                self.send_header('Allow', 'GET, HEAD')
            self.end_headers()
            if not head:
                try:
                    self.wfile.write(body)
                except (BrokenPipeError, ConnectionResetError):
                    pass

        def do_GET(self): self.answer()
        def do_HEAD(self): self.answer(head=True)
        def do_POST(self): self.answer(False)
        do_PUT = do_DELETE = do_PATCH = do_CONNECT = do_OPTIONS = do_TRACE = do_POST

        def log_message(self, *_unused):
            pass

    # The separate positive/negative OS loopback control reserves this same number inside
    # the namespace. Do not consume it before probe() establishes its independent control.
    reserved = int(os.environ['PMI_HOST_CONTROL_PORT'])
    for _ in range(8):
        server = Server(('127.0.0.1', 0), Handler)
        if server.server_port != reserved:
            break
        server.server_close()
    else:
        raise RuntimeError('No distinct ephemeral font/control port was allocated')
    server.timeout = 0.25
    ready = {'schemaVersion': SCHEMA, 'state': 'ready', 'pid': os.getpid(), 'uid': os.getuid(),
             **process_identity(os.getpid()),
             'baseUrl': f'http://127.0.0.1:{server.server_port}/{nonce}/',
             'sourceManifestSha256': os.environ['PMI_SOURCE_MANIFEST_SHA256'],
             'cacheManifestSha256': sha((CACHE / 'font-manifest.json').read_bytes())}
    def terminate(_signal, _frame):
        raise SystemExit(0)
    signal.signal(signal.SIGTERM, terminate)
    write_new(READY, ready)
    try:
        while counters['requests'] < MAX_REQUESTS:
            server.handle_request()
    finally:
        server.server_close()
        write_new(RESULT, {**ready, **counters,
            'state': 'complete' if counters['unexpectedErrors'] == 0 and counters['requests'] < MAX_REQUESTS else 'failed'})


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--serve', action='store_true')
    mode.add_argument('--materialize', action='store_true')
    args = parser.parse_args()
    serve() if args.serve else materialize()
