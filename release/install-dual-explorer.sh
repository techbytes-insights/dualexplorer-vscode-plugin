#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VSIX="$SCRIPT_DIR/dual-explorer-1.5.2.vsix"

if [[ ! -f "$VSIX" ]]; then
  echo "Error: VSIX not found: $VSIX" >&2
  exit 1
fi

if ! command -v code &>/dev/null; then
  echo "Error: VS Code CLI ('code') not found in PATH." >&2
  echo "In VS Code, open the Command Palette (Ctrl+Shift+P) and run:" >&2
  echo "  Shell Command: Install 'code' command in PATH" >&2
  echo "Then run this script again." >&2
  exit 1
fi

echo "Installing Dual Explorer from: $VSIX"
code --install-extension "$VSIX" --force

echo "Installation complete. Reload VS Code to activate the extension."
