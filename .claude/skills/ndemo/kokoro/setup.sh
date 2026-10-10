#!/bin/sh
# One-time setup for the kokoro TTS provider: a Python 3.12 venv with kokoro-onnx, plus the model files.
set -eu
cd "$(dirname "$0")"

if command -v uv >/dev/null 2>&1; then
  uv venv --python 3.12 .venv
  uv pip install --python .venv/bin/python kokoro-onnx soundfile
else
  python3 -m venv .venv # needs Python 3.10 or newer
  .venv/bin/pip install kokoro-onnx soundfile
fi

mkdir -p models
base=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
[ -f models/kokoro-v1.0.onnx ] || curl -fL -o models/kokoro-v1.0.onnx "$base/kokoro-v1.0.onnx"
[ -f models/voices-v1.0.bin ] || curl -fL -o models/voices-v1.0.bin "$base/voices-v1.0.bin"

# The files this setup was tested with.
cat > models/SHA256SUMS <<'SUMS'
7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5  kokoro-v1.0.onnx
bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d  voices-v1.0.bin
SUMS
(cd models && shasum -a 256 -c SHA256SUMS)
echo "kokoro ready"
