#!/bin/bash
cd "$(dirname "$0")"
echo "TurboSpace — iniciando (macOS)..."
if [ ! -d node_modules ]; then
  echo "Instalando dependências (npm install)..."
  npm install
fi
npm start
