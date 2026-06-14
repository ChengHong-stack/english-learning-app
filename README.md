# THINK A1 — English Pronunciation Practice

A web app that helps new students learn English pronunciation. It works on
desktop and mobile (iOS, Android, PC). Each unit has three steps:

1. **Words** — learn 8 words, each with its pronunciation (stress shown like
   `MYOO-zik`), meaning, an example sentence, and an emoji illustration.
2. **Sentences** — say full sentences.
3. **Conversation** — listen to a teacher's question and record your reply.

For every item the student can:

- **Listen** 🔊 — hear the correct pronunciation (text-to-speech).
- **Record** 🎙 — record themselves; the app scores the attempt.
- **Play** ▶️ — listen back to their own recording.

After recording, the results panel shows:

- an overall **score** (stars + %),
- **Accuracy / Fluency / Completeness** breakdown chips,
- a **word-by-word** row where each word is coloured green / orange / red by how
  well it was pronounced (tap a word to hear it), with missed words flagged,
- a **pitch chart** comparing the student's intonation against the model stress
  pattern, and a **waveform** of their voice,
- **YOU SAID** — the text the scorer actually heard,
- concrete **tips** on what to improve (which word or sound to focus on, volume,
  missed/extra words, smoothness).

## How scoring works

Pronunciation is scored by **Azure AI Speech — Pronunciation Assessment**, a
service built for language learning that returns per-word and per-phoneme
accuracy plus fluency and completeness.

The flow avoids the browser limitations that block in-browser recognition on
phones (on iOS every browser is WebKit, and live speech recognition can't share
the microphone with the recorder):

1. The browser records the clip (`MediaRecorder`) and converts it to 16 kHz mono
   WAV using the Web Audio API.
2. It uploads the WAV to a small serverless function at **`/api/assess`**.
3. That function adds the secret Azure key (kept server-side) and forwards the
   audio to Azure, then returns the assessment JSON.
4. The browser renders the scores.

Because the device only records and uploads a few seconds of audio, this behaves
identically on iOS, Android and PC.

**Fallback:** if `/api/assess` can't be reached (offline, or running the static
files without the function), the app falls back to an acoustic-only estimate
(volume + timing), labels the score *estimated*, and playback still works.

> Note: audio **is** sent to Azure for scoring (it leaves the device). The
> "Listen" voice and "Play" playback are fully local; only scoring uses the cloud.

## Running it

The microphone needs a **secure context**: `https://` or `http://localhost`.
Opening `index.html` from disk (`file://`) will load but recording is blocked.

- **UI + acoustic fallback only** (no real scoring): any static server works, e.g.
  `python -m http.server 8000` then open `http://localhost:8000`. There's no
  `/api/assess` here, so scores will be *estimated*.
- **Full scoring locally:** use the Vercel CLI so the serverless function runs:
  ```sh
  vercel dev
  ```
  This requires the env vars below (locally via `vercel env pull` or a `.env`).

### Required environment variables (server-side only)

| Variable | Example | Purpose |
| --- | --- | --- |
| `AZURE_SPEECH_KEY` | (secret) | Azure Speech resource key — **never commit this** |
| `AZURE_SPEECH_REGION` | `eastasia` | Azure Speech resource region |

The key is stored as a Vercel environment variable, not in this repo.

## Deployment

Deployed as a static site + serverless function on **Vercel**. Push changes and
redeploy with `vercel --prod`, with `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`
set in the project's environment variables. Any host that supports static files
plus a Node serverless function works equally well.

## Browser support

No build step and no client-side dependencies — plain HTML/CSS/JS using
browser-native APIs. Scoring is done server-side by Azure.

| Feature | Chrome / Edge (PC, Android) | Safari (iOS, macOS) | Firefox |
| --- | --- | --- | --- |
| Listen (speech synthesis) | ✅ | ✅ | ✅ |
| Record + playback (MediaRecorder) | ✅ | ✅ (iOS 14.3+) | ✅ |
| Pitch & waveform analysis (Web Audio) | ✅ | ✅ | ✅ |
| Pronunciation scoring (Azure via `/api/assess`) | ✅ | ✅ | ✅ |

## Files

- `index.html` — page structure
- `app.css` — styles (responsive, mobile-first)
- `app.js` — lesson data, recording, WAV encoding, pitch/waveform analysis, scoring UI
- `api/assess.js` — serverless function proxying audio to Azure Pronunciation Assessment
- `vercel.json` — Vercel config (headers, clean URLs)
