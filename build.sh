#!/usr/bin/env bash
set -e

echo "========================================="
echo "  Ray - Build Script"
echo "========================================="
echo ""

# Clean previous build artifacts
echo "[1/3] Cleaning previous builds..."
rm -rf out dist

# Build renderer + main + preload via electron-vite
echo "[2/3] Building with electron-vite..."
npx electron-vite build

# Package with electron-builder
echo "[3/3] Packaging with electron-builder..."

case "$1" in
  mac)
    echo "  Target: macOS (arm64)"
    npx electron-builder --mac --arm64
    ;;
  win)
    echo "  Target: Windows (x64)"
    npx electron-builder --win --x64
    ;;
  all)
    echo "  Target: macOS (arm64) + Windows (x64)"
    npx electron-builder --mac --arm64
    npx electron-builder --win --x64
    ;;
  *)
    echo "  Target: current platform"
    echo "  (Use './build.sh mac', './build.sh win', or './build.sh all' to specify)"
    npx electron-builder
    ;;
esac

echo ""
echo "Done! Output is in the dist/ directory:"
ls -lh dist/ 2>/dev/null || true
