#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: VERSION=1.2.3 $0 path/to/SCADmate.AppImage" >&2
  exit 2
fi

if [[ -z "${VERSION:-}" ]]; then
  echo "VERSION must contain the release version used to rebuild the AppImage." >&2
  exit 2
fi

appimage="$(realpath "$1")"
if [[ ! -f "$appimage" ]]; then
  echo "AppImage not found: $appimage" >&2
  exit 2
fi

cache_root="${XDG_CACHE_HOME:-$HOME/.cache}"
appimage_plugin="${TAURI_APPIMAGE_PLUGIN:-$cache_root/tauri/linuxdeploy-plugin-appimage.AppImage}"
if [[ ! -x "$appimage_plugin" ]]; then
  echo "Tauri AppImage packaging plugin not found: $appimage_plugin" >&2
  exit 2
fi

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

(
  cd "$work_dir"
  "$appimage" --appimage-extract >/dev/null
)

app_dir="$work_dir/squashfs-root"
mapfile -d '' bundled_wayland_libraries < <(
  find "$app_dir" \( -type f -o -type l \) \
    \( -name 'libwayland-client.so*' \
       -o -name 'libwayland-cursor.so*' \
       -o -name 'libwayland-egl.so*' \
       -o -name 'libwayland-server.so*' \) \
    -print0
)

if [[ ${#bundled_wayland_libraries[@]} -eq 0 ]]; then
  echo "No bundled Wayland libraries were found; refusing to replace the AppImage." >&2
  exit 1
fi

for library in "${bundled_wayland_libraries[@]}"; do
  echo "Removing host-incompatible library: ${library#"$app_dir"/}"
  unlink "$library"
done

output_dir="$work_dir/output"
mkdir "$output_dir"
(
  cd "$output_dir"
  LINUXDEPLOY_OUTPUT_VERSION="$VERSION" ARCH=x86_64 \
    "$appimage_plugin" --appimage-extract-and-run --appdir="$app_dir"
)

mapfile -d '' rebuilt_images < <(
  find "$output_dir" -maxdepth 1 -type f -name '*.AppImage' -print0
)
if [[ ${#rebuilt_images[@]} -ne 1 ]]; then
  echo "Expected one rebuilt AppImage, found ${#rebuilt_images[@]}." >&2
  exit 1
fi

chmod +x "${rebuilt_images[0]}"
mv "${rebuilt_images[0]}" "$appimage"
echo "Patched AppImage: $appimage"
