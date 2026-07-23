#!/bin/bash
# specificity statusline indicator
# Shows [SPECIFICITY] in the Claude Code status bar when active

STATE_FILE="$HOME/.specificity/.specificity-active"
if [ -f "$STATE_FILE" ]; then
  echo "[SPECIFICITY]"
fi
