# Local changes to ndemo

This copy of [ndemo](https://github.com/splitbrain/ndemo) (MIT) is vendored into the ScholarCrew repo.

Changes from upstream:

- **`say` TTS provider** (`src/schema.ts`, `src/tts.ts`): `tts.provider: say` narrates with macOS's built-in
  speech, so demos render offline without an API key. `voice` is a macOS voice name (`say -v '?'` lists them;
  `alloy` falls back to `Samantha`), and `speed` scales a 180 words-per-minute base rate. ffmpeg converts the
  output to mp3. OpenAI stays the default provider.
- **`kokoro` TTS provider** (`src/schema.ts`, `src/tts.ts`, `kokoro/`): `tts.provider: kokoro` narrates with
  [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache 2.0) through
  [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) (MIT). It's free, runs offline, and sounds far more natural
  than `say`. Run `kokoro/setup.sh` once: it creates `kokoro/.venv` and downloads about 340 MB of model files into
  `kokoro/models/` (both ignored by git) and checks their SHA-256 hashes. `voice` is a Kokoro voice such as
  `am_michael`, `am_fenrir`, or `am_puck` (male, US), `bm_george` (male, UK), or `af_heart` (female, US).
- **Loudness and pacing**: `say` and `kokoro` narration is normalized to -16 LUFS (ffmpeg `loudnorm`) so it plays at
  a normal volume (Kokoro's raw output is about 7 dB quieter), and each clip ends with a 0.6 s pause so lines don't run
  together or end on the video's last frame.
- **`doctor`** (`src/cli.ts`): reports `say` and `kokoro` as narration options when `OPENAI_API_KEY` isn't set.
- **`SKILL.md`**: documents the `say` provider.

After editing `src/`, rebuild with `npm run build` in this directory.
