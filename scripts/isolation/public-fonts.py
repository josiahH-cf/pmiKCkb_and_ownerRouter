"""Acquire genuine public Poppins assets anonymously; validate the read-only runtime cache.

Only this preparation command has ordinary network access. It retains a data-only cache map;
the namespace entry materializes a separate read-only loopback map for Turbopack's HTTP fetcher.
The owned isolated server returns only these verified original bytes. No application module/build
is executed here and no prior compiled application output is copied.
"""
import argparse
import datetime
import hashlib
import json
import re
import struct
import urllib.parse
import urllib.request
from pathlib import Path

CSS_URL = 'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap'
WEIGHTS = {'300', '400', '600', '700'}
MAX_CSS_BYTES = 256 * 1024
MAX_FONT_BYTES = 256 * 1024
MAX_FONT_FILES = 32
MAX_TOTAL_FONT_BYTES = 8 * 1024 * 1024
RUNTIME_ROOT = '/opt/public-fonts'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def font_url(value):
    parsed = urllib.parse.urlsplit(value)
    if (parsed.scheme != 'https' or parsed.hostname != 'fonts.gstatic.com' or
            parsed.netloc != 'fonts.gstatic.com' or parsed.query or parsed.fragment or
            not re.fullmatch(r'/s/poppins/[A-Za-z0-9_./-]+\.woff2', parsed.path) or
            '..' in parsed.path.split('/')):
        raise ValueError('Unreviewed public font URL')
    return value


def validate_css(text):
    if len(text.encode('utf8')) > MAX_CSS_BYTES:
        raise ValueError('Public font CSS exceeds its bound')
    without_comments = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    blocks = re.findall(r'@font-face\s*\{([^{}]+)\}', without_comments)
    if not blocks or re.sub(r'@font-face\s*\{[^{}]+\}', '', without_comments).strip():
        raise ValueError('Public font CSS contains unsupported content')
    urls, weights = set(), set()
    for block in blocks:
        fields = {}
        for declaration in block.split(';'):
            if not declaration.strip(): continue
            key, separator, value = declaration.partition(':')
            key, value = key.strip(), value.strip()
            if not separator or key in fields or key not in {'font-family', 'font-style', 'font-weight', 'font-display', 'src', 'unicode-range'}:
                raise ValueError('Unsupported public font declaration')
            fields[key] = value
        if (fields.get('font-family', '').strip('"\'') != 'Poppins' or
                fields.get('font-style') != 'normal' or fields.get('font-display') != 'swap' or
                fields.get('font-weight') not in WEIGHTS):
            raise ValueError('Public font family/style/weight changed')
        source = re.fullmatch(r'url\(([^()\s]+)\)\s+format\(["\']woff2["\']\)', fields.get('src', ''))
        if not source:
            raise ValueError('Only a reviewed WOFF2 source is supported')
        if 'unicode-range' in fields and not re.fullmatch(r'[Uu+0-9A-Fa-f?,\s-]+', fields['unicode-range']):
            raise ValueError('Unsupported public font Unicode range')
        urls.add(font_url(source[1]))
        weights.add(fields['font-weight'])
    if weights != WEIGHTS or not 1 <= len(urls) <= MAX_FONT_FILES:
        raise ValueError('Public font weights or file count are incomplete')
    return sorted(urls)


def validate_woff2(data):
    if not 48 <= len(data) <= MAX_FONT_BYTES or data[:4] != b'wOF2':
        raise ValueError('Public font bytes are not bounded WOFF2 data')
    length, tables, reserved, sfnt_size = struct.unpack('>IHHI', data[8:20])
    if length != len(data) or not 1 <= tables <= 128 or reserved != 0 or not 1 <= sfnt_size <= 4 * 1024 * 1024:
        raise ValueError('Public WOFF2 header is inconsistent')


def response_map(css_url, rewritten_css):
    return 'module.exports = ' + json.dumps({css_url: rewritten_css}, ensure_ascii=True) + ';\n'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('Public font acquisition does not follow redirects')


def fetch_public(url, agent, maximum, expected_type):
    if url != CSS_URL: font_url(url)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    request = urllib.request.Request(url, headers={'User-Agent': agent, 'Accept-Encoding': 'identity'})
    with opener.open(request, timeout=20) as response:
        if response.status != 200 or response.geturl() != url:
            raise ValueError('Public font response was not the exact successful request')
        kind = response.headers.get_content_type()
        if expected_type == 'css' and kind != 'text/css':
            raise ValueError('Public font stylesheet has the wrong content type')
        if expected_type == 'font' and kind not in {'font/woff2', 'application/font-woff2', 'application/octet-stream'}:
            raise ValueError('Public font file has the wrong content type')
        data = response.read(maximum + 1)
        if len(data) > maximum:
            raise ValueError('Public font response exceeds its byte bound')
        headers = {key: response.headers[key] for key in ['Content-Type', 'Content-Length', 'Date', 'ETag', 'Last-Modified'] if key in response.headers}
        if any(len(value) > 1024 for value in headers.values()):
            raise ValueError('Public font response metadata exceeds its bound')
        return data, headers


def validate_request(spec):
    if not isinstance(spec, dict):
        raise ValueError('Public font request must be recorded data')
    weights = spec.get('weights')
    if (spec.get('schemaVersion') != 'pmikc-public-font-request/v1' or spec.get('family') != 'Poppins' or
            not isinstance(weights, list) or len(weights) != 4 or
            not all(isinstance(weight, str) for weight in weights) or set(weights) != WEIGHTS or spec.get('subsets') != ['latin'] or
            spec.get('display') != 'swap' or spec.get('cssUrl') != CSS_URL or
            not isinstance(spec.get('userAgent'), str) or not 1 <= len(spec['userAgent']) <= 1024 or
            re.search(r'[\r\n]', spec['userAgent']) or
            not re.fullmatch(r'[0-9a-f]{64}', spec.get('sourceManifestSha256', ''))):
        raise ValueError('The public font request no longer matches the reviewed declaration')


def prepare(request_path, cache):
    spec_bytes = request_path.read_bytes()
    if len(spec_bytes) > 64 * 1024:
        raise ValueError('Public font request exceeds its bound')
    spec = json.loads(spec_bytes)
    validate_request(spec)
    if cache.is_symlink() or not cache.is_dir() or any(cache.iterdir()):
        raise ValueError('Public fonts require a new empty owned cache')
    css_bytes, headers = fetch_public(spec['cssUrl'], spec['userAgent'], MAX_CSS_BYTES, 'css')
    css = css_bytes.decode('utf8')
    urls = validate_css(css)
    (cache / 'request.json').write_bytes(spec_bytes)
    (cache / 'original.css').write_bytes(css_bytes)
    manifest = {'schemaVersion': 'pmikc-public-font-assets/v1', 'state': 'preparing',
                'preparedUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'request': spec, 'requestSha256': sha(spec_bytes), 'cssUrl': spec['cssUrl'],
                'cssSha256': sha(css_bytes), 'cssBytes': len(css_bytes), 'cssResponseHeaders': headers,
                'fonts': [], 'runtimeRoot': RUNTIME_ROOT, 'originalFontBytesUnchanged': True,
                'network': 'Anonymous exact public HTTPS GETs, default certificate validation, no proxy/cookie/auth/redirect',
                'priorApplicationBuildResultsCopied': False}
    total = 0
    rewritten = css
    for url in urls:
        data, font_headers = fetch_public(url, spec['userAgent'], MAX_FONT_BYTES, 'font')
        validate_woff2(data)
        total += len(data)
        if total > MAX_TOTAL_FONT_BYTES:
            raise ValueError('Public font files exceed the total byte bound')
        digest = sha(data)
        name = digest + '.woff2'
        (cache / name).write_bytes(data)
        rewritten = rewritten.replace(url, RUNTIME_ROOT + '/' + name)
        manifest['fonts'].append({'url': url, 'file': name, 'sha256': digest, 'bytes': len(data),
                                  'responseHeaders': font_headers, 'httpStatus': 200})
        (cache / 'font-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    (cache / 'rewritten.css').write_text(rewritten)
    module = response_map(spec['cssUrl'], rewritten)
    (cache / 'responses.cjs').write_text(module)
    manifest.update(state='complete', finishedUtc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    totalFontBytes=total, rewrittenCssSha256=sha(rewritten.encode()), responseMapSha256=sha(module.encode()))
    (cache / 'font-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    validate_cache(cache)
    return manifest


def validate_cache(cache):
    if cache.is_symlink():
        raise ValueError('Public font cache cannot be a symlink')
    root = cache.resolve(strict=True)
    fixed = {'font-manifest.json', 'request.json', 'original.css', 'rewritten.css', 'responses.cjs'}
    limits = {'font-manifest.json': 512 * 1024, 'request.json': 64 * 1024,
              'original.css': MAX_CSS_BYTES, 'rewritten.css': 512 * 1024,
              'responses.cjs': 2 * 1024 * 1024}
    for name in fixed:
        if (root / name).is_symlink() or not (root / name).is_file() or (root / name).stat().st_size > limits[name]:
            raise ValueError('Public font cache contains an unsupported file')
    manifest = json.loads((root / 'font-manifest.json').read_text())
    if manifest.get('schemaVersion') != 'pmikc-public-font-assets/v1' or manifest.get('state') != 'complete' or manifest.get('cssUrl') != CSS_URL or manifest.get('runtimeRoot') != RUNTIME_ROOT:
        raise ValueError('Public font materialization is incomplete or unreviewed')
    request_bytes = (root / 'request.json').read_bytes()
    if len(request_bytes) > 64 * 1024 or sha(request_bytes) != manifest['requestSha256']:
        raise ValueError('Public font request differs from its provenance')
    request = json.loads(request_bytes)
    validate_request(request)
    if request != manifest['request']:
        raise ValueError('Public font request metadata changed')
    original = (root / 'original.css').read_bytes()
    if sha(original) != manifest['cssSha256'] or len(original) != manifest['cssBytes']:
        raise ValueError('Public font CSS differs from its provenance')
    expected_urls = validate_css(original.decode('utf8'))
    fonts = manifest['fonts']
    if sorted(f['url'] for f in fonts) != expected_urls or len(fonts) > MAX_FONT_FILES:
        raise ValueError('Public font cache does not match every stylesheet URL')
    if {p.name for p in root.iterdir()} != fixed | {f['file'] for f in fonts}:
        raise ValueError('Public font cache contains an unreviewed extra file')
    rewritten = original.decode('utf8')
    total = 0
    for font in fonts:
        if not re.fullmatch(r'[0-9a-f]{64}\.woff2', font['file']) or font['file'] != font['sha256'] + '.woff2':
            raise ValueError('Unsafe public font asset path')
        path = root / font['file']
        if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(root) or path.stat().st_size > MAX_FONT_BYTES:
            raise ValueError('Public font asset escapes its read-only cache')
        data = path.read_bytes()
        validate_woff2(data)
        if sha(data) != font['sha256'] or len(data) != font['bytes'] or font['httpStatus'] != 200:
            raise ValueError('Public font bytes differ from the successful acquisition')
        total += len(data)
        rewritten = rewritten.replace(font['url'], RUNTIME_ROOT + '/' + font['file'])
    if total > MAX_TOTAL_FONT_BYTES or total != manifest['totalFontBytes']:
        raise ValueError('Public font materialization exceeds its total bound')
    if ((root / 'rewritten.css').read_text() != rewritten or sha(rewritten.encode()) != manifest['rewrittenCssSha256'] or
            (root / 'responses.cjs').read_text() != response_map(CSS_URL, rewritten) or
            sha((root / 'responses.cjs').read_bytes()) != manifest['responseMapSha256']):
        raise ValueError('Public font map changed more than the recorded local asset URLs')
    return manifest


def emitted_readback(cache, app):
    manifest = validate_cache(cache)
    expected = {font['sha256'] for font in manifest['fonts']}
    emitted = []
    media = app / '.next/static/media'
    if media.is_symlink() or not media.is_dir() or not media.resolve().is_relative_to(app.resolve()):
        raise ValueError('Actual build did not emit an owned font directory')
    for path in media.glob('*.woff2'):
        if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(media.resolve()) or path.stat().st_size > MAX_FONT_BYTES:
            raise ValueError('Emitted font is not a bounded owned regular file')
        data = path.read_bytes()
        validate_woff2(data)
        emitted.append({'file': str(path.relative_to(app)), 'sha256': sha(data), 'bytes': len(data)})
    observed = {font['sha256'] for font in emitted}
    return {'checkedUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'expectedFontHashes': sorted(expected), 'emitted': emitted,
            'missingFontHashes': sorted(expected - observed), 'unrecognizedFontHashes': sorted(observed - expected),
            'passed': bool(emitted) and expected == observed,
            'scope': 'Actual fresh Next build output bytes; no copied app output, fake URL buffer or fallback-font success'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--request', type=Path, required=True)
    parser.add_argument('--cache', type=Path, required=True)
    arguments = parser.parse_args()
    prepared = prepare(arguments.request, arguments.cache)
    print(json.dumps({'publicFontPreparation': prepared['state'], 'fontFiles': len(prepared['fonts']),
                      'totalFontBytes': prepared['totalFontBytes'], 'cssSha256': prepared['cssSha256']}))
