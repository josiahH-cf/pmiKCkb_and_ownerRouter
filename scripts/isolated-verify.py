#!/usr/bin/env python3
"""Credential-free Linux engineering lanes, with real kernel isolation before app code.

Dependency installation/audit use an anonymous, empty preparation home outside fixtures.
Every application command gets a separate mount/network/PID namespace and minimal root.
The verify lane runs the unchanged canonical verify.sh through an exact npm bridge; it does
not replace npm ci, audit, tests, typecheck or build with cached-success assertions.
"""
import argparse
import datetime
import hashlib
import http.server
import importlib.util
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
TASKS = json.loads((HERE / 'isolation/lanes.json').read_text())
FONT_SPEC = importlib.util.spec_from_file_location('pmi_public_fonts', HERE / 'isolation/public-fonts.py')
PUBLIC_FONTS = importlib.util.module_from_spec(FONT_SPEC)
FONT_SPEC.loader.exec_module(PUBLIC_FONTS)
ALLOWED = TASKS['quality'] + TASKS['unit'] + TASKS['firestore'] + TASKS['policy-build'] + TASKS['e2e'] + TASKS['e2e-core'] + [['run', 'check:budget-guard', '--', '--allow-multiple-spaces']]


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def clean_env(config):
    env = {
        'PATH': config['nodeRoot'] + '/bin:' + (config['javaRoot'] + '/bin:' if config['javaRoot'] != 'none' else '') + '/usr/sbin:/usr/bin:/sbin:/bin',
        'HOME': config['prepHome'], 'LC_ALL': 'C.UTF-8', 'CI': 'true',
        'PYTHONDONTWRITEBYTECODE': '1', 'GIT_TERMINAL_PROMPT': '0',
        'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null',
        'NPM_CONFIG_USERCONFIG': '/dev/null', 'NPM_CONFIG_CACHE': config['npmCache'],
        'NPM_CONFIG_REGISTRY': 'https://registry.npmjs.org/',
        'FIREBASE_CLI_DISABLE_UPDATE_CHECK': 'true', 'NEXT_TELEMETRY_DISABLED': '1',
        'NODE_OPTIONS': '--max-old-space-size=1536',
        'NO_COLOR': '1',
    }
    if config['javaRoot'] != 'none':
        env['JAVA_HOME'] = config['javaRoot']
    return env


def bounded(config, label, argv, env, cwd, monitor_handshake=None):
    evidence = Path(config['output']) / 'evidence' / label
    evidence.mkdir(parents=True, exist_ok=False)
    start = time.monotonic()
    record = {'startedUtc': now(), 'label': label, 'argv': argv,
              'timeoutSeconds': config['timeout'], 'rssLimitBytes': config['memoryMiB'] * 1024**2,
              'sourceManifestSha256': config.get('sourceManifestSha256'),
              'environmentNames': sorted(env)}
    peak = 0
    reason = None
    owned = {}
    process_peaks = {}
    peak_processes = []
    peak_sample_seconds = 0
    host_pid_ns = os.readlink('/proc/self/ns/pid')
    namespace_ids = set()
    namespace_fds = []
    namespace_unreadable = set()
    monitoring_established = monitor_handshake is None
    cpus = sorted(os.sched_getaffinity(0))[:2]
    record['cpuAffinity'] = cpus
    argv = ['/usr/bin/taskset', '--cpu-list', ','.join(map(str, cpus)), *argv]
    with (evidence / 'stdout.log').open('w') as stdout, (evidence / 'stderr.log').open('w') as stderr:
        child = subprocess.Popen(argv, cwd=cwd, env=env, stdout=stdout, stderr=stderr, start_new_session=True)
        record['processGroup'] = child.pid
        save(evidence / 'started.json', record)
        while child.poll() is None:
            processes = {}
            for proc in Path('/proc').iterdir():
                if not proc.name.isdigit():
                    continue
                try:
                    stat = (proc / 'stat').read_text().rsplit(')', 1)[1].split()
                    # Preserve ancestry/start time/RSS even when ptrace rules hide a root
                    # bootstrap's namespace link. Namespace visibility is a separate observation.
                    namespace = None
                    try:
                        namespace = os.readlink(proc / 'ns/pid')
                    except OSError:
                        namespace_unreadable.add(int(proc.name))
                    processes[int(proc.name)] = (int(stat[1]), int(stat[2]), int(stat[21]) * os.sysconf('SC_PAGE_SIZE'), namespace, int(stat[19]))
                except (OSError, ValueError, IndexError):
                    pass
            descendants = {child.pid}
            previous = None
            while previous != descendants:
                previous = set(descendants)
                descendants.update(pid for pid, row in processes.items() if row[0] in descendants)
            for pid in descendants:
                if pid in processes and processes[pid][3] and processes[pid][3] != host_pid_ns:
                    namespace_id = processes[pid][3]
                    if namespace_id not in namespace_ids:
                        try:
                            namespace_fds.append(os.open(f'/proc/{pid}/ns/pid', os.O_RDONLY))
                            namespace_ids.add(namespace_id)
                        except OSError:
                            pass
            owned.update({pid: processes[pid][4] for pid in descendants if pid in processes})
            current = {pid: row for pid, row in processes.items() if owned.get(pid) == row[4] or row[3] in namespace_ids}
            for pid, row in current.items():
                identity = (pid, row[4])
                if identity not in process_peaks:
                    namespace_pids = []
                    try:
                        status = Path(f'/proc/{pid}/status').read_text()
                        namespace_pids = next([int(value) for value in line.split()[1:]]
                                              for line in status.splitlines() if line.startswith('NSpid:'))
                        stat = Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()
                        if int(stat[19]) != row[4]:
                            namespace_pids = []
                    except (OSError, ValueError, IndexError, StopIteration):
                        pass
                    process_peaks[identity] = {'pid': pid, 'startTimeTicks': row[4],
                                               'namespacePids': namespace_pids, 'peakRssBytes': 0}
                sample = process_peaks[identity]
                sample['peakRssBytes'] = max(sample['peakRssBytes'], row[2])
                if row[3] is not None:
                    sample['pidNamespace'] = row[3]
            total_rss = sum(row[2] for row in current.values())
            if total_rss > peak:
                peak = total_rss
                peak_sample_seconds = round(time.monotonic() - start, 3)
                peak_processes = [{'pid': pid, 'startTimeTicks': row[4], 'rssBytes': row[2]}
                                  for pid, row in sorted(current.items())]
            if monitor_handshake is not None and not monitoring_established:
                try:
                    control = json.loads((monitor_handshake / 'controls.json').read_text())
                    expected_namespace = control['pidNamespace']
                    if control['allPassed'] and expected_namespace in namespace_ids and any(row[3] == expected_namespace for row in current.values()):
                        save(monitor_handshake / 'monitor-ready.json', {'atUtc': now(), 'pidNamespace': expected_namespace, 'ancestryAndRssObserved': True})
                        monitoring_established = True
                except (OSError, ValueError, KeyError):
                    pass
            monitor_failed = monitor_handshake is not None and not monitoring_established and time.monotonic() - start > 15
            if peak > record['rssLimitBytes'] or time.monotonic() - start > config['timeout'] or monitor_failed:
                reason = 'monitor_boundary_unverified' if monitor_failed else 'rss_limit' if peak > record['rssLimitBytes'] else 'timeout'
                for group in {row[1] for row in current.values()} | {child.pid}:
                    if group == os.getpgrp():
                        continue
                    try:
                        os.killpg(group, signal.SIGTERM)
                    except (ProcessLookupError, PermissionError):
                        pass
                try:
                    child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    for pid in current:
                        try:
                            os.kill(pid, signal.SIGKILL)
                        except (ProcessLookupError, PermissionError):
                            pass
                break
            time.sleep(0.25)
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            reason = 'owned_cleanup_unresolved'
    def owned_snapshot():
        result = {}
        for proc in Path('/proc').iterdir():
            if not proc.name.isdigit():
                continue
            try:
                stat = (proc / 'stat').read_text().rsplit(')', 1)[1].split()
                namespace = None
                try:
                    namespace = os.readlink(proc / 'ns/pid')
                except OSError:
                    pass
                pid, start_time = int(proc.name), int(stat[19])
                if int(stat[2]) == child.pid or owned.get(pid) == start_time or namespace in namespace_ids:
                    result[pid] = (stat[0], start_time)
            except (OSError, ValueError, IndexError):
                pass
        return result

    cleanup_signals = []
    remaining_rows = owned_snapshot()

    def wait_owned(seconds):
        deadline = time.monotonic() + seconds
        rows = owned_snapshot()
        while rows and time.monotonic() < deadline:
            time.sleep(0.05)
            rows = owned_snapshot()
        return rows

    def signal_owned(rows, signum):
        for pid, (state, start_time) in rows.items():
            if state == 'Z' or pid <= 1 or pid == os.getpid():
                continue
            descriptor = None
            try:
                # A pidfd binds the signal to this process, even if its numeric PID is reused.
                descriptor = os.pidfd_open(pid)
                stat = Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()
                if int(stat[19]) != start_time:
                    continue
                signal.pidfd_send_signal(descriptor, signum)
                cleanup_signals.append({'pid': pid, 'signal': signum, 'sent': True})
            except ProcessLookupError:
                pass
            except (OSError, AttributeError) as error:
                cleanup_signals.append({'pid': pid, 'signal': signum, 'sent': False,
                                        'errorClass': type(error).__name__})
            finally:
                if descriptor is not None:
                    os.close(descriptor)

    # A leader's exit is not descendant drain. Preserve namespace FDs throughout this grace and
    # owned-only escalation; the outside absolute-window supervisor reserves time for it.
    if remaining_rows:
        remaining_rows = wait_owned(1)
    if remaining_rows:
        reason = reason or 'owned_cleanup_required'
        signal_owned(remaining_rows, signal.SIGTERM)
        remaining_rows = wait_owned(2)
    if remaining_rows:
        signal_owned(remaining_rows, signal.SIGKILL)
        remaining_rows = wait_owned(2)
    remaining = [{'pid': pid, 'state': row[0]} for pid, row in remaining_rows.items()]
    rss_path = evidence / 'owned-process-rss.json'
    save(rss_path, {'scope': 'Sampled owned descendants and pinned PID namespaces only; no argv or environment reads',
                    'sampleIntervalSeconds': 0.25, 'aggregatePeakSampleSeconds': peak_sample_seconds,
                    'aggregatePeakSnapshot': peak_processes,
                    'processPeaks': [process_peaks[key] for key in sorted(process_peaks)]})
    record.update(finishedUtc=now(), elapsedSeconds=round(time.monotonic() - start, 3),
                  exitCode=child.returncode, peakGroupRssBytes=peak, terminated=reason,
                  remainingOwnedProcesses=remaining, namespaceMonitoringEstablished=monitoring_established,
                  heldOwnedPidNamespaces=sorted(namespace_ids), namespaceVisibilityDeniedPids=sorted(namespace_unreadable.intersection(owned)),
                  ownedCleanupSignals=cleanup_signals,
                  ownedProcessRssEvidenceSha256=hashlib.sha256(rss_path.read_bytes()).hexdigest())
    for descriptor in namespace_fds:
        os.close(descriptor)
    save(evidence / 'result.json', record)
    print(json.dumps(record), flush=True)
    print((evidence / 'stdout.log').read_text(errors='replace')[-5000:], flush=True)
    if child.returncode:
        print((evidence / 'stderr.log').read_text(errors='replace')[-5000:], flush=True)
    if reason or remaining or not monitoring_established:
        return 1
    return child.returncode if child.returncode >= 0 else 1


def public_dependencies(config):
    env = clean_env(config)
    app = Path(config['app'])
    if (app / 'node_modules').is_symlink():
        raise RuntimeError('Refusing npm ci through a shared dependency symlink')
    if bounded(config, 'dependency-install', [config['nodeRoot'] + '/bin/npm', 'ci'], env, app):
        return 1
    dependency_root = (app / 'node_modules').resolve()
    for entry in dependency_root.rglob('*'):
        if entry.is_symlink() and not entry.resolve().is_relative_to(dependency_root):
            raise RuntimeError('Dependency symlink escapes the owned physical installation')
    if config['needsFonts']:
        font_config = {**config, 'timeout': min(config['timeout'], 180)}
        request_path = Path(config['output']) / 'font-request.json'
        if bounded(font_config, 'public-font-request', [config['nodeRoot'] + '/bin/node',
                   config['controller'] + '/isolation/font-request.mjs', config['app'],
                   config['output'] + '/source-manifest.json', str(request_path)], env, app):
            return 1
        if bounded(font_config, 'public-font-assets', ['/usr/bin/python3',
                   config['controller'] + '/isolation/public-fonts.py', '--request', str(request_path),
                   '--cache', config['fontCache']], env, app):
            return 1
        fonts = PUBLIC_FONTS.validate_cache(Path(config['fontCache']))
        if fonts['request']['sourceManifestSha256'] != config['sourceManifestSha256']:
            raise RuntimeError('Public font setup belongs to a different staged source')
    if config['needsEmulator']:
        cache = Path(config['emulatorCache'])
        if config['emulatorJar']:
            jar = Path(config['emulatorJar']).resolve(strict=True)
            if not jar.name.startswith('cloud-firestore-emulator-') or jar.suffix != '.jar':
                raise RuntimeError('Expected the public Firestore emulator jar')
            shutil.copy2(jar, cache / jar.name)
        else:
            if bounded(config, 'public-emulator-download', [config['nodeRoot'] + '/bin/node', 'node_modules/firebase-tools/lib/bin/firebase.js', 'setup:emulators:firestore', '--non-interactive'], env, app):
                return 1
            downloaded = Path(config['prepHome']) / '.cache/firebase/emulators'
            for jar in downloaded.glob('cloud-firestore-emulator-*.jar'):
                shutil.copy2(jar, cache / jar.name)
        jars = list(cache.glob('cloud-firestore-emulator-*.jar'))
        if not jars:
            raise RuntimeError('Public emulator binary was not prepared before fixtures')
        pinned = json.loads((app / 'node_modules/firebase-tools/lib/emulator/downloadableEmulatorInfo.json').read_text())['firestore']
        expected_jar = cache / Path(pinned['downloadPathRelativeToCacheDir']).name
        if not expected_jar.is_file() or expected_jar.stat().st_size != pinned['expectedSize'] or hashlib.sha256(expected_jar.read_bytes()).hexdigest() != pinned['expectedChecksumSHA256']:
            raise RuntimeError('Emulator bytes do not match the exact installed CLI public integrity metadata')
        save(Path(config['output']) / 'emulator-binaries.json', [{'name': p.name, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in jars])
    return 0


def isolated(config, label, args):
    if args not in ALLOWED:
        raise RuntimeError('Unsupported engineering command')
    outputs = Path(config['output']) / 'runtime' / label
    outputs.mkdir(parents=True, exist_ok=False)
    rootfs = Path(config['output']) / 'roots' / label
    rootfs.mkdir(parents=True)
    sentinel = Path(config['output']) / ('HOST_ONLY_' + label)
    sentinel.write_text('Synthetic host visibility control; not a credential.\n')
    hits = []

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            hits.append(self.path)
            self.send_response(200)
            self.end_headers()

        def log_message(self, *args):
            pass

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    uid, gid = (config['uid'], config['gid']) if config['ciSudo'] else (0, 0)
    node_heap_mib = (config['typecheckHeapMiB'] if args == ['run', 'typecheck'] else
                     config.get('buildHeapMiB', 1536) if args == ['run', 'build'] else 1536)
    env = {
        'PATH': '/opt/node/bin:/opt/java/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        'HOME': '/home/fixture', 'JAVA_HOME': '/opt/java', 'LC_ALL': 'C.UTF-8',
        'PYTHONDONTWRITEBYTECODE': '1', 'CI': 'true', 'NEXT_TELEMETRY_DISABLED': '1',
        'FIREBASE_CLI_DISABLE_UPDATE_CHECK': 'true', 'PMIKC_TEST_SHADOW': '0',
        'NODE_OPTIONS': '--max-old-space-size=' + str(node_heap_mib),
        'JAVA_TOOL_OPTIONS': '-Xms128m -Xmx768m',
        'CIRCLE_NODE_TOTAL': '2', 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null',
        'UV_THREADPOOL_SIZE': '2', 'GOMAXPROCS': '2', 'RAYON_NUM_THREADS': '2',
        'NPM_CONFIG_USERCONFIG': '/dev/null', 'NO_COLOR': '1',
        'PMI_HOST_CONTROL_PORT': str(server.server_address[1]),
        'PMI_HOST_SENTINEL_PATH': str(sentinel), 'PMI_HOST_HOME': config['hostHome'],
        'PMI_HOST_NETNS': os.readlink('/proc/self/ns/net'), 'PMI_FIXTURE_UID': str(uid),
        'PMI_EXPECTED_HOST_UID': str(config['uid']),
    }
    if config['needsFonts']:
        fonts = PUBLIC_FONTS.validate_cache(Path(config['fontCache']))
        if fonts['request']['sourceManifestSha256'] != config['sourceManifestSha256']:
            raise RuntimeError('Public font setup belongs to a different staged source')
        env['PMI_PUBLIC_FONT_CACHE'] = config['fontCache']
        env['PMI_SOURCE_MANIFEST_SHA256'] = config['sourceManifestSha256']
        env['NEXT_FONT_GOOGLE_MOCKED_RESPONSES'] = '/opt/public-fonts/responses.cjs'
    unshare = ['/usr/bin/unshare', '--mount', '--net', '--pid', '--fork']
    if not config['ciSudo']:
        unshare[1:1] = ['--user', '--map-root-user']
    argv = ['/usr/bin/env', '-i', *[key + '=' + value for key, value in env.items()],
            *unshare, '/bin/bash', config['controller'] + '/isolation/enter.sh',
            str(rootfs), config['app'], config['nodeRoot'], config['javaRoot'],
            config['emulatorCache'], config['controller'] + '/isolation', str(outputs), str(uid), str(gid),
            '/opt/node/bin/npm', *args]
    if config['ciSudo']:
        argv = ['/usr/bin/sudo', '-n', *argv]
    try:
        result = bounded(config, label, argv, clean_env(config), config['app'], monitor_handshake=outputs)
    finally:
        server.shutdown()
        server.server_close()
    cleanup = {'checkedUtc': now(), 'hostControlHits': len(hits), 'hostControlClosed': True,
               'globalMountFound': str(rootfs) in Path('/proc/self/mountinfo').read_text()}
    save(outputs / 'host-cleanup.json', cleanup)
    if cleanup['hostControlHits'] or cleanup['globalMountFound']:
        return 1
    if not (outputs / 'controls.json').exists():
        return 1
    if result == 0 and args == ['run', 'build']:
        # The native npm/Next build has actually run. Check the bytes it emitted rather than
        # treating a response-map hook or a fallback font as successful font qualification.
        try:
            fonts = PUBLIC_FONTS.emitted_readback(Path(config['fontCache']), Path(config['app']))
        except (OSError, ValueError, KeyError) as error:
            fonts = {'passed': False, 'errorClass': type(error).__name__}
        save(outputs / 'font-emission-readback.json', fonts)
        print(json.dumps({'actualBuildFontReadback': fonts['passed']}), flush=True)
        if not fonts['passed']:
            return 1
    return result


def bridge(config, args):
    if args == ['--version']:
        return subprocess.run([config['nodeRoot'] + '/bin/npm', '--version'], env=clean_env(config)).returncode
    if args == ['ci']:
        return public_dependencies(config)
    label = 'npm-' + '-'.join(part.replace(':', '-') for part in args if part != '--')
    if args == ['run', 'verify:dependencies']:
        return bounded(config, label, [config['nodeRoot'] + '/bin/npm', *args], clean_env(config), config['app'])
    return isolated(config, label, args)


def stage(args):
    repo = HERE.parent
    output = Path(args.output).expanduser().resolve()
    if output.is_relative_to(repo) or output.exists():
        raise RuntimeError('Choose a new owned output directory outside the original checkout')
    output.mkdir(parents=True)
    for name in ['source', 'controller', 'evidence', 'runtime', 'roots', 'prep-home', 'npm-cache', 'emulators', 'java', 'public-fonts']:
        (output / name).mkdir()
    config = {'output': str(output), 'app': str(output / 'source'),
              'controller': str(output / 'controller'), 'prepHome': str(output / 'prep-home'),
              'npmCache': str(output / 'npm-cache'), 'emulatorCache': str(output / 'emulators'),
              'fontCache': str(output / 'public-fonts'),
              'nodeRoot': str(Path(args.node_root).resolve(strict=True)), 'javaRoot': 'none',
              'emulatorJar': args.emulator_jar, 'needsEmulator': args.task in ['verify', 'firestore', 'e2e'],
              'needsFonts': args.task in ['verify', 'policy-build', 'e2e', 'e2e-core'],
              'timeout': args.timeout_seconds, 'memoryMiB': args.memory_mib,
              'typecheckHeapMiB': args.typecheck_heap_mib,
              'buildHeapMiB': getattr(args, 'build_heap_mib', 1536),
              'ciSudo': args.ci_sudo, 'uid': os.getuid(), 'gid': os.getgid(), 'hostHome': str(Path.home())}
    if args.ci_sudo and os.environ.get('GITHUB_ACTIONS') != 'true':
        raise RuntimeError('sudo namespace setup is limited to an explicit ephemeral GitHub Actions job')
    if args.ci_sudo and os.geteuid() == 0:
        raise RuntimeError('CI must start as the ordinary runner, before its temporary sudo bootstrap')
    if not args.ci_sudo and os.geteuid() == 0:
        raise RuntimeError('Local fixture isolation requires the ordinary unprivileged owner')
    env = clean_env(config)
    def git(argv, cwd=repo):
        return subprocess.check_output(['git', '-c', 'core.hooksPath=/dev/null', *argv], cwd=cwd, env=env, text=True).strip()
    config['sourceHead'] = git(['rev-parse', 'HEAD'])
    bundle = output / 'source.bundle'
    git(['bundle', 'create', str(bundle), 'HEAD'])
    app = output / 'source'
    git(['init', '--quiet'], app)
    git(['fetch', '--quiet', str(bundle), 'HEAD'], app)
    git(['checkout', '--quiet', '--detach', config['sourceHead']], app)
    # Never copy the original .git/config, hooks, credential helper or authenticated remote.
    git(['remote', 'add', 'origin', 'https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter.git'], app)
    paths = git(['ls-files', '-z']).split('\0') + args.include_new
    manifest = []
    for name in sorted(set(paths)):
        if not name:
            continue
        relative = Path(name)
        if relative.is_absolute() or '..' in relative.parts or relative.parts[0] in ['.git', 'node_modules', 'secrets', 'output', 'temp'] or (name.startswith('.env') and name != '.env.example') or relative.name in ['.npmrc', '.netrc', 'credentials.db', 'application_default_credentials.json']:
            raise RuntimeError('Unsafe staged source path')
        source, target = repo / relative, app / relative
        if not source.exists():
            if target.is_file():
                target.unlink()
            continue
        if not source.is_file() or source.is_symlink():
            raise RuntimeError('Staging requires ordinary source files')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.read_bytes())
        target.chmod(source.stat().st_mode & 0o777)
        manifest.append({'path': name, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest()})
    save(output / 'source-manifest.json', manifest)
    config['sourceManifestSha256'] = hashlib.sha256((output / 'source-manifest.json').read_bytes()).hexdigest()
    if args.java_root:
        # Dereference public JDK configuration links; never mount a credential-bearing host home.
        shutil.copytree(Path(args.java_root).resolve(strict=True), output / 'java', symlinks=False, dirs_exist_ok=True)
        config['javaRoot'] = str(output / 'java')
    elif config['needsEmulator']:
        raise RuntimeError('The emulator lane requires a public Java21 installation')
    node_version = subprocess.check_output([config['nodeRoot'] + '/bin/node', '--version'], env=clean_env(config), text=True).strip()
    if not node_version.startswith('v24.'):
        raise RuntimeError('Canonical engineering qualification requires actual native Node24')
    toolchain = {'node': node_version, 'nodeBinarySha256': hashlib.sha256((Path(config['nodeRoot']) / 'bin/node').read_bytes()).hexdigest()}
    if config['javaRoot'] != 'none':
        java_version = subprocess.run([config['javaRoot'] + '/bin/java', '-version'], env=clean_env(config), capture_output=True, text=True, check=True).stderr
        if not re.search(r'version "21(?:\.|\")', java_version):
            raise RuntimeError('Backend qualification requires actual Java21')
        toolchain['javaVersion'] = java_version.splitlines()[0]
    save(output / 'toolchain.json', toolchain)
    shutil.copy2(__file__, output / 'controller/isolated-verify.py')
    shutil.copytree(HERE / 'isolation', output / 'controller/isolation')
    save(output / 'controller/config.json', config)
    return config


def main():
    # This known, non-secret host control must never appear inside an application runtime.
    os.environ['PMI_CREDENTIAL_VISIBILITY_SENTINEL'] = 'SYNTHETIC_HOST_CONTROL'
    if len(sys.argv) > 2 and sys.argv[1] == '--npm-bridge':
        return bridge(json.loads(Path(sys.argv[2]).read_text()), sys.argv[3:])
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--task', choices=[*TASKS, 'verify'], required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--node-root', default=str(Path(shutil.which('node') or '/missing/node').resolve().parent.parent))
    parser.add_argument('--java-root', default=os.environ.get('JAVA_HOME'))
    parser.add_argument('--emulator-jar')
    parser.add_argument('--include-new', action='append', default=[])
    parser.add_argument('--ci-sudo', action='store_true')
    parser.add_argument('--timeout-seconds', type=int, default=900)
    parser.add_argument('--memory-mib', type=int, default=4096)
    parser.add_argument('--typecheck-heap-mib', type=int, default=1536,
                        help='Only standalone tsc uses this heap; the aggregate RSS guard remains mandatory')
    parser.add_argument('--build-heap-mib', type=int, default=1536,
                        help='Only exact npm run build and its children use this heap; other Node commands retain1536MiB')
    args = parser.parse_args()
    if not sys.platform.startswith('linux') or not 60 <= args.timeout_seconds <= 1800 or not 512 <= args.memory_mib <= 8192:
        parser.error('Linux and bounded resource limits are required')
    if not 512 <= args.typecheck_heap_mib <= min(3072, args.memory_mib - 512):
        parser.error('Typecheck heap must leave at least512MiB below the aggregate RSS cap')
    if not 512 <= args.build_heap_mib <= min(3072, args.memory_mib - 512):
        parser.error('Build heap must leave at least512MiB below the aggregate RSS cap')
    os.sched_setaffinity(0, sorted(os.sched_getaffinity(0))[:2])
    config = stage(args)
    if args.task == 'verify':
        wrapper = Path(config['controller']) / 'npm-bridge'
        wrapper.write_text('#!/usr/bin/python3\nimport os,sys\nos.execv("/usr/bin/python3", ["/usr/bin/python3", ' + repr(config['controller'] + '/isolated-verify.py') + ', "--npm-bridge", ' + repr(config['controller'] + '/config.json') + ', *sys.argv[1:]])\n')
        wrapper.chmod(0o700)
        env = {**clean_env(config), 'NODE_CMD': config['nodeRoot'] + '/bin/node', 'NPM_CMD': str(wrapper)}
        # This is the actual canonical script. The bridge runs its real npm commands in their
        # proper preparation or isolated application context, with no successful-result substitution.
        total = {**config, 'timeout': 1800}
        result = bounded(total, 'canonical-verify', ['/bin/bash', 'scripts/verify.sh'], env, config['app'])
    else:
        result = public_dependencies(config)
        if not result:
            for command in TASKS[args.task]:
                result = bridge(config, command)
                if result:
                    break
    manifest = json.loads((Path(config['output']) / 'source-manifest.json').read_text())
    changed = [row['path'] for row in manifest if not (Path(config['app']) / row['path']).is_file() or hashlib.sha256((Path(config['app']) / row['path']).read_bytes()).hexdigest() != row['sha256']]
    save(Path(config['output']) / 'completion.json', {'finishedUtc': now(), 'sourceHead': config['sourceHead'], 'sourceManifestSha256': config['sourceManifestSha256'], 'exitCode': result, 'trackedSourceChangedByVerification': changed})
    return result or (1 if changed else 0)


if __name__ == '__main__':
    raise SystemExit(main())
