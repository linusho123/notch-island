#!/bin/sh
# scripts/when-idle.sh <command...>: run a UI command only in an idle window
# and under the input guard (BUILD-PLAN, Sharing the Mac). Waits until there
# has been no keyboard or trackpad input for 3 minutes, on AC power, lid
# open, display awake and screen unlocked; runs the command; a run stopped by
# the visionary's input is void and runs again at the next idle window.
# Exits with the command's own exit code.
exec node "$(dirname "$0")/when-idle.js" "$@"
