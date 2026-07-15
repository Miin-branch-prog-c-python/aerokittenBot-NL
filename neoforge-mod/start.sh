#!/bin/bash
#
# AeroKitten Bot - Headless Minecraft client launcher
#
# Launches a headless NeoForge 1.21.1 client with:
#   - Create 1.21.1-6.0.0
#   - Create Aeronautics 1.2.1 (bundled)
#   - AeroKitten Bot mod
#
# Prerequisites:
#   - Java 21+
#   - Xvfb (apt install xvfb)
#   - Mods in run/mods/ (Create, Create Aeronautics, aerokitten_bot)
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# --- Configuration ---
XVFB_DISPLAY="${XVFB_DISPLAY:-:99}"
XVFB_RES="${XVFB_RES:-1280x720x24}"

# --- Color helpers ---
red() { echo -e "\033[31m$*\033[0m"; }
green() { echo -e "\033[32m$*\033[0m"; }
yellow() { echo -e "\033[33m$*\033[0m"; }

# --- Check prerequisites ---
check_prereqs() {
    if ! command -v java &>/dev/null; then
        red "Java not found. Please install Java 21+."
        exit 1
    fi

    java_version=$(java -version 2>&1 | head -1 | grep -oP '\d+' | head -1)
    if [ "$java_version" -lt 21 ]; then
        red "Java 21+ required (found version $java_version)"
        exit 1
    fi

    if ! command -v Xvfb &>/dev/null; then
        yellow "Xvfb not found. Install it: sudo apt install xvfb"
        yellow "Falling back to software rendering..."
    fi
}

# --- Start virtual display ---
start_display() {
    if command -v Xvfb &>/dev/null; then
        if ! pgrep -x Xvfb >/dev/null; then
            yellow "Starting Xvfb on $XVFB_DISPLAY..."
            Xvfb "$XVFB_DISPLAY" -screen 0 "$XVFB_RES" -ac &
            XVFB_PID=$!
            sleep 1
            export DISPLAY="$XVFB_DISPLAY"
            green "Xvfb started (PID: $XVFB_PID, Display: $DISPLAY)"
        else
            export DISPLAY="$XVFB_DISPLAY"
            green "Xvfb already running on $DISPLAY"
        fi
    else
        yellow "Running without virtual display (may fail if no X server)"
    fi
}

# --- Main ---
main() {
    echo "============================================"
    echo "  AeroKitten Bot - Headless Client Launcher"
    echo "  Mods: Create + Create Aeronautics + Bot"
    echo "============================================"

    check_prereqs
    start_display

    green "Launching via Gradle runClient (mods from run/mods/)..."
    echo "  Create: create-1.21.1-6.0.0.jar"
    echo "  Aeronautics: create-aeronautics-bundled-1.21.1-1.2.1.jar"
    echo "  Bot: aerokitten_bot.jar"

    exec ./gradlew runClient "$@"
}

main "$@"
