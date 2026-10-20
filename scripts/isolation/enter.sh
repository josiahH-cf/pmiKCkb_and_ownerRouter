#!/usr/bin/env bash
# Private mounts only. The caller creates a new mount/network/PID namespace first.
set -euo pipefail
rootfs=$1
app=$2
node_root=$3
java_root=$4
cache=$5
probe=$6
evidence=$7
fixture_uid=$8
fixture_gid=$9
shift 9

mount --make-rprivate /
mount -t tmpfs -o size=32m,nosuid,nodev tmpfs "$rootfs"
mkdir -p "$rootfs"/{usr,dev,proc,tmp,home/fixture,etc,opt/node,opt/java,opt/emulators,app,probe,evidence}
ln -s usr/bin "$rootfs/bin"
ln -s usr/sbin "$rootfs/sbin"
ln -s usr/lib "$rootfs/lib"
ln -s usr/lib64 "$rootfs/lib64"

readonly_tree() {
  local source=$1 target=$2 flags
  mount --rbind "$source" "$target"
  while IFS= read -r entry; do
    flags=$(findmnt -n -o VFS-OPTIONS -M "$entry")
    mount -o "remount,bind,$flags,ro,nosuid,nodev" "$entry"
  done < <(findmnt -rn -R -M "$target" -o TARGET)
}
readonly_tree /usr "$rootfs/usr"
readonly_tree "$node_root" "$rootfs/opt/node"
readonly_tree "$probe" "$rootfs/probe"
readonly_tree "$cache" "$rootfs/opt/emulators"
fonts_enabled=0
if [ -n "${PMI_PUBLIC_FONT_CACHE:-}" ]; then
  mkdir -p "$rootfs/opt/public-fonts"
  readonly_tree "$PMI_PUBLIC_FONT_CACHE" "$rootfs/opt/public-fonts"
  unset PMI_PUBLIC_FONT_CACHE
  fonts_enabled=1
fi
if [ "$java_root" != none ]; then
  readonly_tree "$java_root" "$rootfs/opt/java"
fi
mount --bind "$app" "$rootfs/app"
# The staged Git database contains only public source and a fresh, credential-free config.
readonly_tree "$app/.git" "$rootfs/app/.git"
mount --bind "$evidence" "$rootfs/evidence"
for name in null zero random urandom; do
  touch "$rootfs/dev/$name"
  mount --bind "/dev/$name" "$rootfs/dev/$name"
done
mount -t proc -o nosuid,nodev,noexec proc "$rootfs/proc"
mount -t tmpfs -o size=256m,nosuid,nodev tmpfs "$rootfs/tmp"
printf '127.0.0.1 localhost\n::1 localhost\n' > "$rootfs/etc/hosts"
printf 'fixture:x:%s:%s:fixture:/home/fixture:/bin/sh\n' "$fixture_uid" "$fixture_gid" > "$rootfs/etc/passwd"
chmod 1777 "$rootfs/tmp"
chown "$fixture_uid:$fixture_gid" "$rootfs/home/fixture"
ip link set lo up
cd /
fixture_command=(chroot "$rootfs")
if [ "$fixture_uid" != 0 ]; then
  # Ephemeral CI setup drops every capability before any fixture helper or app runs.
  fixture_command+=(/usr/bin/setpriv --reuid="$fixture_uid" --regid="$fixture_gid" --clear-groups
    --bounding-set=-all --inh-caps=-all --ambient-caps=-all --no-new-privs)
fi
if [ "$fonts_enabled" = 1 ]; then
  mkdir -p "$rootfs/opt/public-font-runtime"
  chown "$fixture_uid:$fixture_gid" "$rootfs/opt/public-font-runtime"
  "${fixture_command[@]}" /usr/bin/python3 /probe/font-loopback.py --serve \
    > "$evidence/font-server.stdout.log" 2> "$evidence/font-server.stderr.log" &
  font_pid=$!
  for _ in {1..100}; do
    kill -0 "$font_pid"
    [ ! -f "$evidence/font-server-ready.json" ] || break
    sleep 0.05
  done
  [ -f "$evidence/font-server-ready.json" ]
  "${fixture_command[@]}" /usr/bin/python3 /probe/font-loopback.py --materialize
  readonly_tree "$rootfs/opt/public-font-runtime" "$rootfs/opt/public-font-runtime"
  export NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/opt/public-font-runtime/responses.cjs
fi
# The exec preserves PID1 parentage of the already-chrooted font child. Local root remains
# mapped only to the original unprivileged owner; CI fixture code retains no host capability.
exec "${fixture_command[@]}" /usr/bin/python3 /probe/inside.py "$@"
