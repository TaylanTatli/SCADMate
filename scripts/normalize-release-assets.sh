#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 ASSET_DIRECTORY VERSION" >&2
  exit 2
fi

asset_dir="$(realpath "$1")"
version="$2"

if [[ ! -d "$asset_dir" ]]; then
  echo "Asset directory not found: $asset_dir" >&2
  exit 2
fi

rename_one() {
  local pattern="$1"
  local destination="$2"
  local matches=()

  mapfile -d '' matches < <(
    find "$asset_dir" -maxdepth 1 -type f -name "$pattern" -print0
  )
  if [[ ${#matches[@]} -ne 1 ]]; then
    echo "Expected one asset matching '$pattern', found ${#matches[@]}." >&2
    exit 1
  fi

  mv "${matches[0]}" "$asset_dir/$destination"
  echo "Release asset: $destination"
}

rename_one '*.deb' "SCADmate_${version}_linux_x86_64.deb"
rename_one '*.rpm' "SCADmate_${version}_linux_x86_64.rpm"
rename_one '*.AppImage' "SCADmate_${version}_linux_x86_64.AppImage"
rename_one '*.tar.gz' "SCADmate_${version}_linux_x86_64.tar.gz"
rename_one '*_aarch64.dmg' "SCADmate_${version}_macos_arm64.dmg"
rename_one '*_x64.dmg' "SCADmate_${version}_macos_x86_64.dmg"
rename_one '*-setup.exe' "SCADmate_${version}_windows_x86_64-setup.exe"
