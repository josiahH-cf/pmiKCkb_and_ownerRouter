"""Run one actual engineering command only after the OS controls pass."""
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from probe import probe
import importlib.util

def terminate(_signal, _frame):
    raise SystemExit(143)

signal.signal(signal.SIGTERM, terminate)

def main():
    font_runtime, ready, fd = None, None, None
    if os.environ.get('NEXT_FONT_GOOGLE_MOCKED_RESPONSES'):
        spec = importlib.util.spec_from_file_location('owned_font_runtime', '/probe/font-loopback.py')
        font_runtime = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(font_runtime)
        ready, fd = font_runtime.pin_server()
    try:
        return run_application()
    finally:
        if font_runtime is not None:
            cleanup = font_runtime.stop_server(ready, fd)
            if not cleanup['passed']:
                raise RuntimeError('Owned font child did not close with its exact terminal receipt')


def run_application():
    probe()
    # No app code starts until the outside watcher has observed this exact PID namespace,
    # retained ancestry/RSS across the bootstrap, and pinned the namespace identity with an FD.
    deadline = time.monotonic() + 12
    while not Path('/evidence/monitor-ready.json').exists():
        if time.monotonic() > deadline:
            raise RuntimeError('Owned namespace monitoring was not established; app code not started')
        time.sleep(0.05)
    # This cache contains downloaded public emulator binaries only. It is mounted read-only and
    # introduced after the empty-home control; no credential home or ADC path is mounted.
    cache = Path.home() / '.cache/firebase'
    cache.mkdir(parents=True)
    (cache / 'emulators').symlink_to('/opt/emulators', target_is_directory=True)
    os.chdir('/app')
    Path('/evidence/command.json').write_text(json.dumps({'argv': sys.argv[1:]}) + '\n')
    result = subprocess.run(sys.argv[1:])
    Path('/evidence/command-exit.json').write_text(json.dumps({'exitCode': result.returncode}) + '\n')
    return result.returncode


if __name__ == '__main__':
    raise SystemExit(main())
