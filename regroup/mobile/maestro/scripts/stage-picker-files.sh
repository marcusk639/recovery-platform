#!/usr/bin/env bash
#
# stage-picker-files.sh — puts the picker test files where the system pickers
# can see them: a small PDF for maestro/flows/device-document-upload.yaml
# (device pass row 4), maestro/fixtures/guests.csv (fictional residents) for
# maestro/flows/operator-guest-import.yaml, and a small photo for
# maestro/flows/guest-chore-photo.yaml (S5):
#   iOS simulator:    Files → On My iPhone → e2e-upload.pdf, e2e-guests.csv;
#                     Photos (xcrun simctl addmedia) → e2e-photo.png
#   Android emulator: Downloads → e2e-upload.pdf, e2e-guests.csv;
#                     Pictures → e2e-photo.png
# None of the files holds personal data.
#
# Usage:
#   maestro/scripts/stage-picker-files.sh --platform ios --device <simulator udid>
#   maestro/scripts/stage-picker-files.sh --platform android --device <adb serial>
set -euo pipefail

PLATFORM=""
DEVICE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform) PLATFORM="$2"; shift 2 ;;
    --device) DEVICE="$2"; shift 2 ;;
    -h|--help) sed -n 2,16p "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[[ -n "$PLATFORM" && -n "$DEVICE" ]] || { echo "usage: $0 --platform ios|android --device <id>" >&2; exit 2; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
PDF="$TMP/e2e-upload.pdf"
CSV="$(cd "$(dirname "$0")/../fixtures" && pwd)/guests.csv"
# A minimal one-page PDF.
cat > "$PDF" <<'EOF'
%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 44 >> stream
BT /F1 18 Tf 20 100 Td (E2E upload) Tj ET
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
trailer << /Root 1 0 R >>
%%EOF
EOF

# A small solid-colour PNG for the photo picker.
PNG="$TMP/e2e-photo.png"
python3 - "$PNG" <<'PY'
import struct, sys, zlib
w = h = 64
raw = b''.join(b'\x00' + b'\x3c\x8d\xbc' * w for _ in range(h))
def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) \
    + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
open(sys.argv[1], 'wb').write(png)
PY

case "$PLATFORM" in
  ios)
    xcrun simctl addmedia "$DEVICE" "$PNG"
    echo "✓ added e2e-photo.png to Photos ($DEVICE)"
    GROUPS_DIR="$HOME/Library/Developer/CoreSimulator/Devices/$DEVICE/data/Containers/Shared/AppGroup"
    [[ -d "$GROUPS_DIR" ]] || { echo "✗ no simulator $DEVICE" >&2; exit 1; }
    dest=""
    for g in "$GROUPS_DIR"/*; do
      meta="$g/.com.apple.mobile_container_manager.metadata.plist"
      [[ -f "$meta" ]] || continue
      if [[ "$(plutil -extract MCMMetadataIdentifier raw "$meta" 2>/dev/null)" == "group.com.apple.FileProvider.LocalStorage" ]]; then
        dest="$g/File Provider Storage"
        break
      fi
    done
    [[ -n "$dest" ]] || { echo "✗ On My iPhone storage not found; open the Files app once on $DEVICE" >&2; exit 1; }
    mkdir -p "$dest"
    cp "$PDF" "$dest/e2e-upload.pdf"
    cp "$CSV" "$dest/e2e-guests.csv"
    echo "✓ staged e2e-upload.pdf and e2e-guests.csv in On My iPhone ($DEVICE)"
    ;;
  android)
    adb -s "$DEVICE" push "$PDF" /sdcard/Download/e2e-upload.pdf >/dev/null
    adb -s "$DEVICE" shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
      -d file:///sdcard/Download/e2e-upload.pdf >/dev/null
    adb -s "$DEVICE" push "$CSV" /sdcard/Download/e2e-guests.csv >/dev/null
    adb -s "$DEVICE" shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
      -d file:///sdcard/Download/e2e-guests.csv >/dev/null
    echo "✓ staged e2e-upload.pdf and e2e-guests.csv in Downloads ($DEVICE)"
    adb -s "$DEVICE" push "$PNG" /sdcard/Pictures/e2e-photo.png >/dev/null
    adb -s "$DEVICE" shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
      -d file:///sdcard/Pictures/e2e-photo.png >/dev/null
    echo "✓ staged e2e-photo.png in Pictures ($DEVICE)"
    ;;
  *) echo "✗ --platform must be ios or android" >&2; exit 2 ;;
esac
