# THINK A1 — English Pronunciation Practice

A web app that helps new students learn English. Each unit has three steps:

1. **Words** — learn 8 words with pronunciation, meaning, an example sentence and a picture.
2. **Sentences** — say full sentences.
3. **Conversation** — listen to a teacher's question and record your reply.

For every item the student can:

- **Listen** 🔊 — hear the correct pronunciation (text-to-speech).
- **Record** 🎙 — record themselves; the app analyses the attempt.
- **Play** ▶️ — listen back to their own recording.

After recording, the app shows a score (stars + %), a pitch chart comparing the
student's intonation against the model stress pattern, a waveform of their
voice, what the app heard ("YOU SAID", with wrong/missing words highlighted),
and concrete tips on what to improve (volume, speed, word stress, specific words).

## Running it

The microphone API requires a **secure context**: `https://` or `http://localhost`.
Opening `index.html` directly from disk (`file://`) will load, but recording will be blocked.

Pick whichever server you have:

```sh
# Python
python -m http.server 8000

# Node
npx serve .
```

Then open `http://localhost:8000` (or the URL the server prints).

To test from a phone, host the folder on any HTTPS static host (GitHub Pages,
Netlify, Vercel, etc.) — HTTPS is required for the microphone on mobile.

## How scoring works

The browser's live speech-recognition API can't share the microphone with the
audio recorder on mobile (iOS especially), which made "no speech detected" the
common result on phones. Instead, the app now does speech-to-text **on the
recorded clip, after recording finishes**, using OpenAI's Whisper model running
fully in the browser via [transformers.js](https://github.com/xenova/transformers.js)
(WebAssembly). This removes the microphone conflict and behaves identically on
iOS, Android and PC.

- The model (`Xenova/whisper-tiny.en`, ~40 MB quantized) downloads once on first
  use and is cached by the browser. The download starts in the background as
  soon as the student taps Listen/Record, so the wait is hidden.
- No backend, no API key, no audio leaves the device — transcription is local.
- If the model can't load (offline / blocked CDN), the app falls back to
  acoustic-only scoring (volume + timing + syllable stress), labels the score
  *estimated*, and playback still works.

## Browser support

No build step. Plain HTML/CSS/JS plus the transformers.js library loaded from a CDN.

| Feature | Chrome / Edge (PC, Android) | Safari (iOS, macOS) | Firefox |
| --- | --- | --- | --- |
| Listen (speech synthesis) | ✅ | ✅ | ✅ |
| Record + playback (MediaRecorder) | ✅ | ✅ (iOS 14.3+) | ✅ |
| Pitch & waveform analysis (Web Audio) | ✅ | ✅ | ✅ |
| On-device transcription (Whisper / WASM) | ✅ | ✅ | ✅ |

## Files

- `index.html` — page structure
- `app.css` — styles (responsive, mobile-first)
- `app.js` — lesson data, recording, pitch analysis, scoring, UI
- `asr.js` — on-device Whisper speech-to-text (ES module, loads transformers.js)
