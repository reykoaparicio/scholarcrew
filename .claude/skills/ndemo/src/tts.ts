import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import OpenAI from "openai";
import type { Playbook, Segment } from "./schema.js";

interface TtsResult {
  audioPath: string;
  durationMs: number;
}

function ttsHash(narration: string, voice: string, speed: number): string {
  return crypto
    .createHash("sha256")
    .update(narration + voice + speed)
    .digest("hex")
    .slice(0, 8);
}

/**
 * Find existing audio file for a segment ID in the given directory.
 * Files are named `{id}-{hash}.mp3`.
 */
function findAudioFile(audioDir: string, segmentId: string): string | null {
  if (!fs.existsSync(audioDir)) return null;
  const prefix = `${segmentId}-`;
  const files = fs.readdirSync(audioDir);
  const match = files.find(f => f.startsWith(prefix) && f.endsWith(".mp3"));
  return match ? path.join(audioDir, match) : null;
}

/**
 * Delete any stale audio files for a segment ID that don't match the current hash.
 */
function cleanStaleAudio(audioDir: string, segmentId: string, currentHash: string): void {
  if (!fs.existsSync(audioDir)) return;
  const currentName = `${segmentId}-${currentHash}.mp3`;
  const prefix = `${segmentId}-`;
  for (const file of fs.readdirSync(audioDir)) {
    if (file.startsWith(prefix) && file.endsWith(".mp3") && file !== currentName) {
      fs.unlinkSync(path.join(audioDir, file));
    }
  }
}

/**
 * Ensure TTS audio exists for a segment, regenerating if narration/voice/speed changed.
 * Deletes stale audio files automatically.
 */
async function ensureAudio(
  segment: Segment,
  playbook: Playbook,
  outputDir: string
): Promise<TtsResult> {
  const audioDir = path.join(outputDir, "audio");
  fs.mkdirSync(audioDir, { recursive: true });

  const hash = ttsHash(segment.narration!, playbook.tts.voice, playbook.tts.speed);
  const audioPath = path.join(audioDir, `${segment.id}-${hash}.mp3`);

  // Clean up stale files for this segment
  cleanStaleAudio(audioDir, segment.id, hash);

  // If current file exists, just probe and return
  if (fs.existsSync(audioPath)) {
    const durationMs = await probeDuration(audioPath);
    return { audioPath, durationMs };
  }

  // Generate new audio
  if (playbook.tts.provider === "openai") {
    const openai = new OpenAI();
    const response = await openai.audio.speech.create({
      model: "tts-1-hd",
      voice: playbook.tts.voice as any,
      speed: playbook.tts.speed,
      input: segment.narration!,
      response_format: "mp3",
    });

    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(audioPath, new Uint8Array(arrayBuffer));
  } else if (playbook.tts.provider === "say") {
    // macOS built-in speech: offline and free. Renders AIFF, then ffmpeg encodes the mp3 the pipeline expects.
    const voice = playbook.tts.voice === "alloy" ? "Samantha" : playbook.tts.voice;
    const wordsPerMinute = String(Math.round(180 * playbook.tts.speed));
    const aiffPath = audioPath.replace(/\.mp3$/, ".aiff");
    await execa("say", ["-v", voice, "-r", wordsPerMinute, "-o", aiffPath, segment.narration!]);
    await execa("ffmpeg", ["-y", "-v", "error", "-i", aiffPath, "-af", LOUDNORM, "-ar", "44100", "-ac", "2", "-b:a", "192k", audioPath]);
    fs.unlinkSync(aiffPath);
  } else if (playbook.tts.provider === "kokoro") {
    // Kokoro-82M (Apache 2.0), run locally through kokoro-onnx: free, offline, no API key.
    const python = path.join(KOKORO_DIR, ".venv", "bin", "python");
    if (!fs.existsSync(python) || !fs.existsSync(path.join(KOKORO_DIR, "models", "kokoro-v1.0.onnx"))) {
      throw new Error(`Kokoro isn't set up. Run: ${path.join(KOKORO_DIR, "setup.sh")}`);
    }
    const voice = playbook.tts.voice === "alloy" ? "am_michael" : playbook.tts.voice;
    const wavPath = audioPath.replace(/\.mp3$/, ".wav");
    await execa(
      python,
      [path.join(KOKORO_DIR, "speak.py"), "--voice", voice, "--speed", String(playbook.tts.speed), "--out", wavPath],
      { input: segment.narration! },
    );
    await execa("ffmpeg", ["-y", "-v", "error", "-i", wavPath, "-af", LOUDNORM, "-ar", "44100", "-ac", "2", "-b:a", "192k", audioPath]);
    fs.unlinkSync(wavPath);
  } else {
    throw new Error(`TTS provider "${playbook.tts.provider}" not yet implemented`);
  }

  const durationMs = await probeDuration(audioPath);
  return { audioPath, durationMs };
}

async function probeDuration(audioPath: string): Promise<number> {
  const { stdout } = await execa("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    audioPath,
  ]);
  const seconds = parseFloat(stdout.trim());
  if (isNaN(seconds)) {
    throw new Error(`Could not probe duration of ${audioPath}`);
  }
  return Math.round(seconds * 1000);
}

/**
 * Local voices are normalized to -16 LUFS, the usual loudness for web video, and end with a short pause.
 * Kokoro stops about 0.1 s after the last word, so without the pause segments run together and the final line is
 * cut off at the end of the video.
 */
const LOUDNORM = "loudnorm=I=-16:TP=-1.5:LRA=11,apad=pad_dur=0.6";

/** The skill's kokoro/ directory: speak.py, its .venv, and the model files (see kokoro/setup.sh). */
const KOKORO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "kokoro");

// Keep generateTts as an alias for ensureAudio for backwards compat within renderer
const generateTts = ensureAudio;

export { generateTts, ensureAudio, probeDuration, ttsHash, findAudioFile };
