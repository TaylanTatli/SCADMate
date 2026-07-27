#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 VERSION" >&2
  exit 2
fi

version="$1"
binary="src-tauri/target/release/scadmate"
output_dir="src-tauri/target/release/bundle/binary"

if [[ ! -x "$binary" ]]; then
  echo "Release binary not found: $binary" >&2
  exit 1
fi

stage_dir="$(mktemp -d)"
trap 'rm -rf "$stage_dir"' EXIT

root_name="SCADmate-${version}-linux-x86_64"
archive_root="$stage_dir/$root_name"
mkdir -p "$archive_root"

install -m 755 "$binary" "$archive_root/scadmate"
install -m 644 packaging/linux/SCADmate.desktop "$archive_root/SCADmate.desktop"
install -m 644 src-tauri/icons/128x128.png "$archive_root/SCADmate.png"
install -m 644 packaging/linux/README.md "$archive_root/README.md"
install -m 644 LICENSE "$archive_root/LICENSE"

mkdir -p "$output_dir"
archive="$output_dir/SCADmate_${version}_linux_x86_64.tar.gz"
tar -czf "$archive" -C "$stage_dir" "$root_name"
echo "Created Linux binary archive: $archive"
