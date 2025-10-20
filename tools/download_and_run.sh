#!/usr/bin/env bash
set -euo pipefail

# Simple startup script for the inference service.
# If /app/models/best.pt is missing, download it from $MODEL_URL.

MODELPATH=/app/models/best.pt
mkdir -p /app/models

echo "Checking for model file at $MODELPATH..."
echo "Current directory: $(pwd)"
echo "Contents of /app:"
ls -la /app/
echo "Contents of /app/models:"
ls -la /app/models/ || echo "No models directory"

if [ -f "$MODELPATH" ]; then
  echo "Model already present at $MODELPATH"
  echo "Model file size: $(stat -c%s "$MODELPATH" 2>/dev/null || echo "unknown") bytes"
else
  echo "Model file not found at $MODELPATH"
  if [ -z "${MODEL_URL-}" ]; then
    echo "ERROR: MODEL_URL is not set and $MODELPATH is missing" >&2
    exit 1
  fi
  echo "Downloading model from $MODEL_URL to $MODELPATH..."
  # Use curl if available, otherwise try wget
  if command -v curl >/dev/null 2>&1; then
    curl -fSL "$MODEL_URL" -o "$MODELPATH"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$MODELPATH" "$MODEL_URL"
  else
    echo "ERROR: neither curl nor wget is available to download the model" >&2
    exit 1
  fi
  echo "Download completed"
fi

echo "Starting inference service..."
exec uvicorn tools.inference_service:app --host 0.0.0.0 --port ${PORT:-8001}
