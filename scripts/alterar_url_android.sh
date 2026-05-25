#!/usr/bin/env bash
set -euo pipefail
read -r -p "Cole a URL pública do Render, sem barra final: " URL
[ -n "$URL" ] || { echo "URL vazia"; exit 1; }
for f in sistema/android-*/app/src/main/java/br/com/vitoriaregia/*/MainActivity.java; do
  case "$f" in
    *morador*) SUFFIX='/?app=morador#/morador' ;;
    *portaria*) SUFFIX='/?app=portaria#/portaria' ;;
    *sindico*) SUFFIX='/?app=sindico#/dashboard' ;;
    *) SUFFIX='/' ;;
  esac
  python3 - "$f" "$URL$SUFFIX" <<'PY'
from pathlib import Path
import sys, re
path=Path(sys.argv[1])
url=sys.argv[2]
text=path.read_text(encoding='utf-8')
text=re.sub(r'private static final String BASE_URL = "[^"]+";', f'private static final String BASE_URL = "{url}";', text)
path.write_text(text, encoding='utf-8')
PY
  echo "Atualizado: $f"
done
