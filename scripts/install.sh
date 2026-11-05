#!/bin/sh

main() {
  set -eu
  APP=ai-usage
  BIN_DIR=${HOME}/.local/bin
  DESKTOP_DIR=${HOME}/.local/share/applications
  ICON_DIR=${HOME}/.local/share/icons/hicolor/128x128/apps
  if [ "${1-}" = --uninstall ]; then
    rm -f "$BIN_DIR/ai-usage.AppImage" "$DESKTOP_DIR/ai-usage.desktop" "$ICON_DIR/ai-usage.png"
    echo "Removed AI Usage AppImage files. Remove package installs with: sudo apt remove ai-usage (Debian/Ubuntu) or sudo dnf remove ai-usage (Fedora)."
    return 0
  fi
  FROM_DIR=
  if [ "${1-}" = --from-dir ]; then
    [ "$#" -eq 2 ] || { echo "Usage: $0 [--uninstall | --from-dir DIR]" >&2; return 2; }
    FROM_DIR=$2
  elif [ "$#" -ne 0 ]; then echo "Usage: $0 [--uninstall | --from-dir DIR]" >&2; return 2; fi

  ARCH=$(uname -m)
  [ "$ARCH" = x86_64 ] || { echo "AI Usage installer supports x86_64 only (found $ARCH)." >&2; return 1; }
  PYTHON_INSTALL='install python3 with your distribution package manager'
  if command -v apt-get >/dev/null 2>&1; then PYTHON_INSTALL='sudo apt install python3'
  elif command -v dnf >/dev/null 2>&1; then PYTHON_INSTALL='sudo dnf install python3'
  elif command -v pacman >/dev/null 2>&1; then PYTHON_INSTALL='sudo pacman -S python'
  elif command -v zypper >/dev/null 2>&1; then PYTHON_INSTALL='sudo zypper install python3'; fi
  if ! command -v python3 >/dev/null 2>&1; then
    echo "Warning: python3 3.10+ is required; $PYTHON_INSTALL." >&2
  elif ! python3 -c 'import sys; raise SystemExit(sys.version_info < (3, 10))' 2>/dev/null; then
    echo "Warning: Python 3.10+ is required; upgrade it with: $PYTHON_INSTALL." >&2
  fi

  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' 0 HUP INT TERM
  EXT=AppImage
  if command -v apt >/dev/null 2>&1; then EXT=deb
  elif command -v dnf >/dev/null 2>&1; then EXT=rpm; fi
  if [ -n "$FROM_DIR" ]; then
    PACKAGE=$(find "$FROM_DIR" -maxdepth 1 -type f -name "*.$EXT" -print -quit)
    if [ -z "$PACKAGE" ] && [ "$EXT" = deb ]; then EXT=rpm; PACKAGE=$(find "$FROM_DIR" -maxdepth 1 -type f -name '*.rpm' -print -quit); fi
    if [ -z "$PACKAGE" ]; then EXT=AppImage; PACKAGE=$(find "$FROM_DIR" -maxdepth 1 -type f -name '*.AppImage' -print -quit); fi
    SUMS="$FROM_DIR/SHA256SUMS.txt"
    [ -n "$PACKAGE" ] || { echo "No supported .$EXT installer asset found." >&2; return 1; }
    cp "$PACKAGE" "$TMP/"
    cp "$SUMS" "$TMP/SHA256SUMS.txt"
    PACKAGE="$TMP/${PACKAGE##*/}"
  else
    command -v curl >/dev/null 2>&1 || { echo "curl is required." >&2; return 1; }
    curl -fsSL https://api.github.com/repos/Berkayr/ai-usage-widget/releases/latest -o "$TMP/release.json"
    awk -F '"' '/"name":/ {name=$4} /"browser_download_url":/ {print name "\t" $4}' "$TMP/release.json" > "$TMP/assets"
    ASSET=$(awk -F '\t' -v suffix=".$EXT" '$1 ~ /^linux-x86_64-/ && length($1) >= length(suffix) && substr($1, length($1)-length(suffix)+1) == suffix {print $1; exit}' "$TMP/assets")
    URL=$(awk -F '\t' -v wanted="$ASSET" '$1 == wanted {print $2; exit}' "$TMP/assets")
    SUMS_URL=$(awk -F '\t' '$1 == "SHA256SUMS.txt" {print $2; exit}' "$TMP/assets")
    [ -n "$ASSET" ] || { echo "No supported .$EXT release asset found." >&2; return 1; }
    [ -n "$SUMS_URL" ] || { echo "Could not find SHA256SUMS.txt release asset." >&2; return 1; }
    curl -fsSL "$URL" -o "$TMP/$ASSET"
    curl -fsSL "$SUMS_URL" -o "$TMP/SHA256SUMS.txt"
    PACKAGE="$TMP/$ASSET"
  fi
  SUMS="$TMP/SHA256SUMS.txt"
  [ -f "$SUMS" ] || { echo "SHA256SUMS.txt is missing." >&2; return 1; }
  awk -v name="${PACKAGE##*/}" '$2 == name || $2 == "*" name {found=1} END {exit !found}' "$SUMS" || { echo "SHA256SUMS.txt has no checksum for ${PACKAGE##*/}." >&2; return 1; }
  (cd "$TMP" && sha256sum --ignore-missing -c SHA256SUMS.txt)

  case "$PACKAGE" in
    *.deb) echo "Using sudo for apt installation."; sudo apt install -y "$PACKAGE"; echo "AI Usage is installed. Open it from your app menu (AI Usage). Uninstall with: sudo apt remove ai-usage." ;;
    *.rpm) echo "Using sudo for dnf installation."; sudo dnf install -y "$PACKAGE"; echo "AI Usage is installed. Open it from your app menu (AI Usage). Uninstall with: sudo dnf remove ai-usage." ;;
    *.AppImage)
      mkdir -p "$BIN_DIR" "$DESKTOP_DIR"
      install -m 755 "$PACKAGE" "$BIN_DIR/ai-usage.AppImage"
      rm -f "$ICON_DIR/ai-usage.png"
      ICON=
      if (cd "$TMP" && "$BIN_DIR/ai-usage.AppImage" --appimage-extract >/dev/null 2>&1); then
        ICON="$TMP/squashfs-root/usr/share/icons/hicolor/128x128/apps/ai-usage.png"
        if [ ! -f "$ICON" ]; then ICON=$(find "$TMP/squashfs-root" -type f -name ai-usage.png -print -quit 2>/dev/null || true); fi
      fi
      if [ -n "$ICON" ]; then
        mkdir -p "$ICON_DIR"
        install -m 644 "$ICON" "$ICON_DIR/ai-usage.png"
        ICON_LINE="Icon=$ICON_DIR/ai-usage.png"
      else
        ICON_LINE=''
      fi
      EXEC_LINE="$BIN_DIR/ai-usage.AppImage"
      if ! ldconfig -p 2>/dev/null | grep -q 'libfuse.so.2'; then EXEC_LINE="sh -c 'APPIMAGE_EXTRACT_AND_RUN=1 $BIN_DIR/ai-usage.AppImage'"; fi
      { printf '%s\n' '[Desktop Entry]' 'Type=Application' 'Name=AI Usage' "Exec=$EXEC_LINE"; [ -z "$ICON_LINE" ] || printf '%s\n' "$ICON_LINE"; printf '%s\n' 'Categories=Utility;' 'Terminal=false'; } > "$DESKTOP_DIR/ai-usage.desktop"
      chmod 644 "$DESKTOP_DIR/ai-usage.desktop"
      echo "AI Usage is installed. Open it from your app menu (AI Usage) or run: $BIN_DIR/ai-usage.AppImage. Uninstall with: curl -fsSL https://raw.githubusercontent.com/Berkayr/ai-usage-widget/main/scripts/install.sh | sh -s -- --uninstall."
      ;;
  esac
}

main "$@"
