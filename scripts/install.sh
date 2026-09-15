#!/usr/bin/env bash
set -e

# ANSI Color Codes
CYAN='\033[0;36m'
GREEN='\033[0;32m'
MAGENTA='\033[0;35m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

clear
echo -e "${MAGENTA}=====================================================${NC}"
echo -e "${MAGENTA}    DOWNPLAYGRAM - ONE-CLICK INSTALLER               ${NC}"
echo -e "${MAGENTA}    Zero-Telemetry Instagram Downloader & Viewer     ${NC}"
echo -e "${MAGENTA}=====================================================${NC}"

REPO="Michael-dvs/Downplaygram"
ZIP_URL="https://github.com/$REPO/releases/latest/download/downplaygram-chrome.zip"
TEMP_ZIP="/tmp/downplaygram-latest.zip"

# Tentukan direktori target berdasarkan OS
if [[ "$OSTYPE" == "darwin"* ]]; then
  TARGET_DIR="$HOME/Library/Application Support/Downplaygram"
else
  TARGET_DIR="$HOME/.local/share/Downplaygram"
fi

step() {
  echo -e "\n${CYAN}[$1/$2]${NC} $3"
}

# 1. Download
step 1 4 "Mengunduh paket ekstensi Downplaygram dari GitHub..."
if command -v curl >/dev/null 2>&1; then
  curl -fsSL -L -o "$TEMP_ZIP" "$ZIP_URL"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$TEMP_ZIP" "$ZIP_URL"
else
  echo -e "${RED}[ERROR] curl atau wget tidak ditemukan di sistem ini.${NC}"
  exit 1
fi
echo -e "${GREEN}  -> Unduhan selesai.${NC}"

# 2. Extract
step 2 4 "Mengekstrak berkas ke: $TARGET_DIR..."
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"
unzip -q -o "$TEMP_ZIP" -d "$TARGET_DIR"
rm -f "$TEMP_ZIP"
echo -e "${GREEN}  -> Berkas berhasil diekstrak.${NC}"

# 3. Open Extensions Page & Folder
step 3 4 "Membuka browser dan direktori target..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  open "$TARGET_DIR"
  open -a "Google Chrome" "chrome://extensions" 2>/dev/null || open "chrome://extensions" 2>/dev/null || true
else
  xdg-open "$TARGET_DIR" 2>/dev/null || true
  google-chrome "chrome://extensions" 2>/dev/null || xdg-open "chrome://extensions" 2>/dev/null || true
fi

# 4. Panduan Terakhir
step 4 4 "Instalasi berkas selesai!"
echo -e "${YELLOW}"
echo "-----------------------------------------------------"
echo "LANGKAH TERAKHIR (Cukup 10 Detik di Browser):"
echo "1. Di tab browser 'chrome://extensions', aktifkan toggle:"
echo "   [Developer mode] (Pojok kanan atas)"
echo "2. Klik tombol:"
echo "   [Load unpacked]"
echo "3. Pilih folder yang baru saja dibuka:"
echo "   $TARGET_DIR"
echo "-----------------------------------------------------"
echo -e "${NC}"
