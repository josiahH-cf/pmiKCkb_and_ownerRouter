#!/usr/bin/env python3
"""Private, kernel-backed ownership of one managed browser profile.

The coordinator never touches Chromium's Singleton files or terminates browsers.
Its lock is released by the kernel on exit; stdin EOF handles a crashed caller.
"""
import fcntl
import json
import os
from pathlib import Path
import select
import stat
import sys
import time


def emit(value):
    print(json.dumps(value), flush=True)


def process_start(pid):
    try:
        return Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()[19]
    except (OSError, IndexError):
        return None


def main():
    profile = Path(sys.argv[1]).resolve(strict=True)
    wait_ms, caller, label = int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
    if not 0 <= wait_ms <= 600_000 or not profile.is_dir():
        raise ValueError("invalid_profile_lease_input")
    info = profile.stat()
    if info.st_uid != os.getuid():
        raise PermissionError("profile_owner_mismatch")
    os.chmod(profile, 0o700)
    path = profile.with_name(profile.name + ".pmi-session.lock")
    flags = os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_CLOEXEC
    fd = os.open(path, flags, 0o600)
    try:
        current = os.fstat(fd)
        if not stat.S_ISREG(current.st_mode) or current.st_uid != os.getuid():
            raise PermissionError("profile_coordinator_owner_mismatch")
        os.fchmod(fd, 0o600)
        deadline = time.monotonic() + wait_ms / 1000
        announced = False
        while True:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                os.lseek(fd, 0, os.SEEK_SET)
                try:
                    owner = json.loads(os.read(fd, 16_384))
                    owner = {k: owner.get(k) for k in ["pid", "caller_pid", "label", "started_at", "boot_id", "process_start"]}
                except (ValueError, OSError):
                    owner = None
                if not announced:
                    emit({"state": "waiting", "owner": owner})
                    announced = True
                if time.monotonic() >= deadline:
                    emit({"state": "busy", "owner": owner})
                    return 2
                readable, _, _ = select.select([sys.stdin], [], [], min(0.1, max(0, deadline - time.monotonic())))
                if readable and not sys.stdin.readline():
                    return 3
        owner = {"version": 1, "pid": os.getpid(), "caller_pid": caller,
                 "label": label, "started_at": time.time(),
                 "boot_id": Path("/proc/sys/kernel/random/boot_id").read_text().strip(),
                 "process_start": process_start(os.getpid())}
        payload = (json.dumps(owner) + "\n").encode()
        os.ftruncate(fd, 0)
        os.lseek(fd, 0, os.SEEK_SET)
        os.write(fd, payload)
        os.fsync(fd)
        emit({"state": "acquired", "owner": owner})
        # Release on an explicit request or the caller's pipe closing, including a crash.
        sys.stdin.readline()
        return 0
    finally:
        os.close(fd)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, IndexError) as error:
        emit({"state": "error", "code": "profile_coordinator_unavailable",
              "error_class": type(error).__name__})
        sys.exit(1)
