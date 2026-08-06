#!/bin/bash
# Remove a quarentena do Gatekeeper e abre o TurboSpace.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
APP=""

if [ -d "/Applications/TurboSpace.app" ]; then
  APP="/Applications/TurboSpace.app"
elif [ -d "$DIR/TurboSpace.app" ]; then
  APP="$DIR/TurboSpace.app"
else
  osascript -e 'display dialog "Não encontrei o TurboSpace.app.\n\nArraste TurboSpace para a pasta Aplicativos e tente de novo." buttons {"OK"} default button 1 with icon caution with title "TurboSpace"'
  exit 1
fi

xattr -cr "$APP" 2>/dev/null || true
open "$APP"
