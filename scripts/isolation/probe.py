"""Actual OS controls before any application code, not a monkeypatch of its transport."""
import datetime
import errno
import http.client
import http.server
import importlib.util
import json
import os
import socket
import subprocess
import threading
from pathlib import Path


def probe():
    port = int(os.environ['PMI_HOST_CONTROL_PORT'])
    sentinel = os.environ['PMI_HOST_SENTINEL_PATH']
    host_home = os.environ['PMI_HOST_HOME']
    checks = {}
    forbidden_env = ['GOOGLE_APPLICATION_CREDENTIALS', 'CLOUDSDK_CONFIG', 'GH_TOKEN',
                     'GITHUB_TOKEN', 'RENTVINE_API_KEY', 'RENTVINE_API_SECRET',
                     'DOTLOOP_ACCESS_TOKEN', 'PMI_CREDENTIAL_VISIBILITY_SENTINEL']
    checks['credentialEnvironmentAbsent'] = all(key not in os.environ for key in forbidden_env)
    forbidden_paths = [host_home + '/.config', host_home + '/.codex',
                       host_home + '/pmi-assurance/owner-admin', '/root/.config',
                       '/app/.env', '/app/.env.local', '/app/.env.production',
                       '/app/.env.production.local', '/app/.env.test.local',
                       sentinel, '/proc/1/root' + sentinel, '/proc/self/root' + sentinel]
    checks['credentialAndHostPathsInaccessible'] = all(not Path(p).exists() for p in forbidden_paths)
    checks['cleanHome'] = Path.home() == Path('/home/fixture') and not list(Path.home().iterdir())
    checks['distinctNetworkNamespace'] = os.readlink('/proc/self/ns/net') != os.environ['PMI_HOST_NETNS']
    checks['noDefaultNetworkRoute'] = not any(row.split()[1] == '00000000' for row in Path('/proc/net/route').read_text().splitlines()[1:])
    checks['onlyLoopbackInterface'] = [name for _, name in socket.if_nameindex()] == ['lo']
    try:
        with socket.create_connection(('127.0.0.1', port), timeout=0.3):
            checks['hostLoopbackInaccessible'] = False
    except OSError:
        checks['hostLoopbackInaccessible'] = True
    for label, address in [('externalNativeSocketRefused', '192.0.2.1'),
                           ('metadataNativeSocketRefused', '169.254.169.254')]:
        try:
            with socket.create_connection((address, 443), timeout=0.3):
                checks[label] = False
        except OSError as error:
            checks[label] = error.errno == errno.ENETUNREACH

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'ISOLATED_LOOPBACK_CONTROL')

        def log_message(self, *args):
            pass

    server = http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        client = http.client.HTTPConnection('127.0.0.1', port, timeout=2)
        client.request('GET', '/')
        response = client.getresponse()
        checks['isolatedLoopbackHttpPositive'] = response.status == 200 and response.read() == b'ISOLATED_LOOPBACK_CONTROL'
        client.close()
    finally:
        server.shutdown()
        server.server_close()
    try:
        with Path('/probe/probe.py').open('a') as stream:
            stream.write('')
        checks['sourceMountReadOnly'] = False
    except OSError as error:
        checks['sourceMountReadOnly'] = error.errno == errno.EROFS
    node = subprocess.run(['/opt/node/bin/node', '-e', "const n=require('node:net');const s=n.connect({host:'192.0.2.1',port:443});s.on('connect',()=>process.exit(1));s.on('error',e=>{console.log(e.code);process.exit(e.code==='ENETUNREACH'?0:2)})"], capture_output=True, text=True, timeout=3)
    checks['nodeExternalConnectionRefused'] = node.returncode == 0 and node.stdout.strip() == 'ENETUNREACH'
    checks['expectedFixtureUid'] = os.getuid() == int(os.environ['PMI_FIXTURE_UID'])
    font_runtime_readback = None
    if os.environ.get('NEXT_FONT_GOOGLE_MOCKED_RESPONSES'):
        cache = Path('/opt/public-fonts')
        specification = importlib.util.spec_from_file_location('pmi_public_fonts', '/probe/public-fonts.py')
        public_fonts = importlib.util.module_from_spec(specification)
        specification.loader.exec_module(public_fonts)
        fonts = public_fonts.validate_cache(cache)
        checks['publicFontBytesMatchProvenance'] = (
            fonts['request']['sourceManifestSha256'] == os.environ.get('PMI_SOURCE_MANIFEST_SHA256'))
        runtime_spec = importlib.util.spec_from_file_location('pmi_font_runtime', '/probe/font-loopback.py')
        font_runtime = importlib.util.module_from_spec(runtime_spec)
        runtime_spec.loader.exec_module(font_runtime)
        font_runtime_readback = font_runtime.validate_runtime(fonts)
        checks['publicFontHookUsesOnlyReadOnlyAssets'] = (
            os.environ['NEXT_FONT_GOOGLE_MOCKED_RESPONSES'] == '/opt/public-font-runtime/responses.cjs'
            and 'PMI_PUBLIC_FONT_CACHE' not in os.environ and font_runtime_readback['passed'])
        try:
            with (cache / 'font-manifest.json').open('a') as stream:
                stream.write('')
            checks['publicFontCacheReadOnly'] = False
        except OSError as error:
            checks['publicFontCacheReadOnly'] = error.errno == errno.EROFS
    if os.getuid() == 0:
        mappings = [row.split() for row in Path('/proc/self/uid_map').read_text().splitlines()]
        host_uid = int(os.environ['PMI_EXPECTED_HOST_UID'])
        checks['localRootMapsOnlyUnprivilegedOwner'] = host_uid > 0 and mappings == [['0', str(host_uid), '1']]
    if os.getuid() != 0:
        status = Path('/proc/self/status').read_text().splitlines()
        checks['ciCapabilitiesDropped'] = all(int(row.split()[1], 16) == 0 for row in status if row.startswith(('CapEff:', 'CapPrm:', 'CapBnd:')))
    result = {'checkedUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'checks': checks, 'allPassed': all(checks.values()), 'uid': os.getuid(),
              'pidNamespace': os.readlink('/proc/self/ns/pid'),
              'environmentNames': sorted(os.environ),
              'fontRuntimeReadback': font_runtime_readback,
              'node': subprocess.check_output(['/opt/node/bin/node', '--version'], text=True).strip()}
    Path('/evidence/controls.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result), flush=True)
    if not result['allPassed']:
        raise RuntimeError('OS isolation controls failed; application code was not started')
