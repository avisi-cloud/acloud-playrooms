#!/usr/bin/env bash
# Sourced by packaging and verification; keep Python dependencies out of the
# system installation. Subsequent builds reuse the pinned tools without network.
dmg_repository="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dmg_python="$dmg_repository/bin/dmg-tools/bin/python"
if ! "$dmg_python" -c '
from importlib.metadata import version
assert version("ds-store") == "1.3.3" and version("mac-alias") == "2.2.3"
' >/dev/null 2>&1; then
  if ! python3 -c 'import sys; sys.exit(sys.version_info < (3, 10))'; then
    echo 'DMG packaging requires Python 3.10 or newer.' >&2
    exit 1
  fi
  python3 -m venv "$dmg_repository/bin/dmg-tools"
  "$dmg_python" -m pip install --disable-pip-version-check -r "$dmg_repository/scripts/dmg-requirements.txt"
fi
