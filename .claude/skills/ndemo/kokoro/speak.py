"""Reads narration text on stdin and writes a WAV with Kokoro-82M (Apache 2.0) through kokoro-onnx (MIT)."""

import argparse
import pathlib
import sys

import soundfile as sf
from kokoro_onnx import Kokoro

MODELS = pathlib.Path(__file__).resolve().parent / "models"

parser = argparse.ArgumentParser()
parser.add_argument("--voice", default="am_michael")
parser.add_argument("--speed", type=float, default=1.0)
parser.add_argument("--lang", default="en-us")
parser.add_argument("--out", required=True)
args = parser.parse_args()

text = sys.stdin.read().strip()
if not text:
    sys.exit("speak.py: no narration text on stdin")

kokoro = Kokoro(str(MODELS / "kokoro-v1.0.onnx"), str(MODELS / "voices-v1.0.bin"))
samples, sample_rate = kokoro.create(text, voice=args.voice, speed=args.speed, lang=args.lang)
sf.write(args.out, samples, sample_rate)
