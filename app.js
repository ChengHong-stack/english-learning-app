/* THINK A1 — English pronunciation practice.
   Plain browser JS, no build step. Works on Chrome/Edge/Safari/Firefox,
   desktop and mobile. Speech-to-text runs on-device via Whisper (see asr.js):
   we record the clip, then transcribe it — so there's no live-mic conflict on
   iOS/Android. If the model can't load, scoring falls back to acoustic analysis
   (volume/timing) and the score is labelled "estimated". */

"use strict";

/* ================================ DATA ================================ */

const UNIT = {
  number: 8,
  theme: "Music",
  stages: [
    {
      id: "words",
      label: "Words",
      panelTitle: "WORDS TO LEARN",
      introEmoji: "📖",
      introText: "Learn 8 new words about music. Listen, then record yourself saying each word clearly.",
      items: [
        { word: "music",  pron: "MYOO-zik",  syllables: ["MYOO", "zik"], stress: 0, type: "word/phrase",
          meaning: "sounds made with instruments or voice", example: "I like music.", emoji: "🎵" },
        { word: "guitar", pron: "gih-TAR",   syllables: ["gih", "TAR"],  stress: 1, type: "word/phrase",
          meaning: "a musical instrument with six strings", example: "He plays the guitar.", emoji: "🎸" },
        { word: "piano",  pron: "pee-AN-oh", syllables: ["pee", "AN", "oh"], stress: 1, type: "word/phrase",
          meaning: "a big instrument with black and white keys", example: "She plays the piano.", emoji: "🎹" },
        { word: "drums",  pron: "DRUMZ",     syllables: ["DRUMZ"], stress: 0, type: "word/phrase",
          meaning: "instruments you hit to make a beat", example: "My brother plays the drums.", emoji: "🥁" },
        { word: "sing",   pron: "SING",      syllables: ["SING"], stress: 0, type: "verb",
          meaning: "to make music with your voice", example: "We sing songs at school.", emoji: "🎤" },
        { word: "dance",  pron: "DANS",      syllables: ["DANS"], stress: 0, type: "verb",
          meaning: "to move your body to music", example: "They dance to the music.", emoji: "💃" },
        { word: "song",   pron: "SAWNG",     syllables: ["SAWNG"], stress: 0, type: "word/phrase",
          meaning: "a short piece of music with words", example: "This is my favourite song.", emoji: "🎶" },
        { word: "band",   pron: "BAND",      syllables: ["BAND"], stress: 0, type: "word/phrase",
          meaning: "a group of people who play music together", example: "The band plays every Friday.", emoji: "🎺" }
      ]
    },
    {
      id: "sentences",
      label: "Sentences",
      panelTitle: "SENTENCES TO PRACTISE",
      introEmoji: "💬",
      introText: "Now say full sentences. Listen first, then record yourself. Speak slowly and clearly.",
      items: [
        { text: "I like music.", emoji: "🎵" },
        { text: "He plays the guitar.", emoji: "🎸" },
        { text: "She plays the piano very well.", emoji: "🎹" },
        { text: "We sing songs at school.", emoji: "🎤" },
        { text: "They dance to the music.", emoji: "💃" },
        { text: "This is my favourite song.", emoji: "🎶" }
      ]
    },
    {
      id: "conversation",
      label: "Conversation",
      panelTitle: "CONVERSATION PRACTICE",
      introEmoji: "🗣️",
      introText: "Your teacher asks a question. Listen to it, then record yourself saying the reply.",
      items: [
        { question: "Do you like music?",          answer: "Yes, I love music.", emoji: "🎵" },
        { question: "Can you play the guitar?",    answer: "No, but I can play the piano.", emoji: "🎸" },
        { question: "What songs do you like?",     answer: "I like pop songs.", emoji: "🎶" },
        { question: "Do you sing or dance?",       answer: "I sing and dance with my friends.", emoji: "💃" }
      ]
    }
  ]
};

/* ================================ STATE ================================ */

const state = {
  stageIdx: 0,
  itemIdx: 0,
  scores: UNIT.stages.map(s => s.items.map(() => null)), // best score per item
  lastRecordingURL: null,
  lastAnalysis: null,
  recording: false
};

/* ============================== DOM REFS =============================== */

const $ = id => document.getElementById(id);
const el = {
  backBtn: $("backBtn"), unitPill: $("unitPill"), stepper: $("stepper"),
  progressLabel: $("progressLabel"), progressPct: $("progressPct"), progressFill: $("progressFill"),
  lessonView: $("lessonView"), introView: $("introView"), summaryView: $("summaryView"),
  panelTitle: $("panelTitle"), itemCard: $("itemCard"), instruction: $("instruction"),
  listenBtn: $("listenBtn"), recordBtn: $("recordBtn"), playBtn: $("playBtn"),
  recStatus: $("recStatus"), recStatusText: $("recStatusText"), levelFill: $("levelFill"),
  asrStatus: $("asrStatus"), asrStatusText: $("asrStatusText"),
  micWarning: $("micWarning"),
  results: $("results"), stars: $("stars"), scorePct: $("scorePct"), scoreMsg: $("scoreMsg"),
  breakdown: $("breakdown"), estimateNote: $("estimateNote"),
  pitchCanvas: $("pitchCanvas"), waveCanvas: $("waveCanvas"),
  wordScoresBox: $("wordScoresBox"), wordScores: $("wordScores"),
  youSaid: $("youSaid"), tipsList: $("tipsList"),
  nextBtn: $("nextBtn"), skipBtn: $("skipBtn"),
  introEmoji: $("introEmoji"), introTitle: $("introTitle"), introText: $("introText"),
  introStartBtn: $("introStartBtn"),
  summaryOverall: $("summaryOverall"), summaryList: $("summaryList"), restartBtn: $("restartBtn"),
  playback: $("playback")
};

/* ============================ HELPERS ================================= */

function currentStage() { return UNIT.stages[state.stageIdx]; }
function currentItem()  { return currentStage().items[state.itemIdx]; }

/* The text the student must say for the current item. */
function targetText() {
  const item = currentItem();
  return item.word || item.text || item.answer;
}

function normalize(text) {
  return text.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
}

/* ========================= TEXT-TO-SPEECH ============================= */

let voices = [];
function loadVoices() { voices = window.speechSynthesis ? speechSynthesis.getVoices() : []; }
if (window.speechSynthesis) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

function pickVoice() {
  if (!voices.length) loadVoices();
  return voices.find(v => /en[-_]US/i.test(v.lang) && /Google|Samantha|Aria|Jenny/i.test(v.name))
      || voices.find(v => /en[-_]US/i.test(v.lang))
      || voices.find(v => /^en/i.test(v.lang))
      || null;
}

function speak(text, rate) {
  if (!window.speechSynthesis) {
    showMicWarning("Text-to-speech is not supported in this browser.");
    return;
  }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if (v) u.voice = v;
  u.lang = (v && v.lang) || "en-US";
  u.rate = rate || 0.85;
  u.pitch = 1;
  el.listenBtn.disabled = true;
  u.onend = u.onerror = () => { el.listenBtn.disabled = false; };
  speechSynthesis.speak(u);
}

/* ====================== RECORDING + SCORING ========================== */

let audioCtx = null;
let rec = null; // active recording session

function getAudioCtx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function pickMimeType() {
  if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

function showMicWarning(msg) {
  el.micWarning.textContent = msg;
  el.micWarning.hidden = false;
}

function maxRecordMs() {
  return currentStage().id === "words" ? 4000 : 9000;
}

async function startRecording() {
  el.micWarning.hidden = true;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showMicWarning("Microphone access is not available. Open this page over HTTPS (or http://localhost) in a modern browser.");
    return;
  }
  if (!window.MediaRecorder) {
    showMicWarning("Audio recording is not supported in this browser. Please update it or try Chrome / Safari / Edge.");
    return;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true }
    });
  } catch (err) {
    showMicWarning("Microphone permission was denied. Please allow microphone access in your browser settings and try again.");
    return;
  }

  const ctx = getAudioCtx();
  const mime = pickMimeType();
  const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  const chunks = [];

  // Live level meter while recording
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const levelBuf = new Uint8Array(analyser.fftSize);

  const session = {
    recorder, stream, chunks, analyser, source,
    rafId: 0,
    timerId: 0,
    startedAt: performance.now()
  };
  rec = session;

  recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  recorder.onstop = onRecorderStopped;
  recorder.start();

  state.recording = true;
  el.recordBtn.classList.add("recording");
  el.recordBtn.querySelector("span").textContent = "Stop";
  setPhase("recording");
  el.results.hidden = true;   // hide the previous (long) results while re-recording
  el.micWarning.hidden = true;
  el.playBtn.disabled = true;
  el.listenBtn.disabled = true;

  const meter = () => {
    if (!rec) return;
    analyser.getByteTimeDomainData(levelBuf);
    let sum = 0;
    for (let i = 0; i < levelBuf.length; i++) {
      const v = (levelBuf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / levelBuf.length);
    el.levelFill.style.width = Math.min(100, rms * 400) + "%";
    const remain = Math.max(0, maxRecordMs() - (performance.now() - rec.startedAt));
    el.recStatusText.textContent = "Recording… tap Stop when done (" + Math.ceil(remain / 1000) + "s)";
    rec.rafId = requestAnimationFrame(meter);
  };
  meter();

  rec.timerId = setTimeout(stopRecording, maxRecordMs());
}

function stopRecording() {
  if (!rec || !state.recording) return;
  state.recording = false;
  clearTimeout(rec.timerId);
  cancelAnimationFrame(rec.rafId);
  // Swap the recording bar for the processing bar immediately, so there's no
  // gap before the async `onstop` event fires.
  el.recordBtn.classList.remove("recording");
  el.recordBtn.querySelector("span").textContent = "Record";
  setPhase("processing");
  try { rec.recorder.stop(); } catch (e) { onRecorderStopped(); }
}

async function onRecorderStopped() {
  if (!rec) return;
  const session = rec;
  rec = null;

  session.stream.getTracks().forEach(t => t.stop());
  try { session.source.disconnect(); } catch (e) { /* noop */ }

  el.recordBtn.classList.remove("recording");
  el.recordBtn.querySelector("span").textContent = "Record";
  el.listenBtn.disabled = false;
  el.recStatusText.textContent = "Recording…";
  el.levelFill.style.width = "0";

  const blob = new Blob(session.chunks, { type: session.recorder.mimeType || "audio/webm" });
  if (!blob.size) {
    setPhase("idle");
    showMicWarning("Nothing was recorded — please try again and speak after pressing Record.");
    return;
  }

  if (state.lastRecordingURL) URL.revokeObjectURL(state.lastRecordingURL);
  state.lastRecordingURL = URL.createObjectURL(blob);
  el.playback.src = state.lastRecordingURL;
  el.playBtn.disabled = false;

  // We are now in the "processing" phase (set in stopRecording) — keep the
  // progress bar up while we decode and score the audio.
  el.recordBtn.disabled = true;
  let audioBuffer = null;
  try {
    const arrayBuf = await blob.arrayBuffer();
    audioBuffer = await decodeAudio(getAudioCtx(), arrayBuf);
  } catch (e) {
    audioBuffer = null;
  }

  // Score the recorded clip with Azure Pronunciation Assessment (server-side).
  // The phone only uploads a few seconds of audio, so it's fast and identical
  // on iOS/Android/PC. If it fails (offline / service down) we fall back to a
  // local acoustic estimate so the app still works.
  let azure = null;
  if (audioBuffer) {
    try {
      azure = await withTimeout(assessPronunciation(audioBuffer, targetText()), 20000);
    } catch (e) {
      showMicWarning("Couldn't reach the scoring service, so we scored your volume and timing instead. Check the connection and try again.");
    }
  }

  const analysis = analyzeAttempt(audioBuffer, azure);
  state.lastAnalysis = analysis;

  const prev = state.scores[state.stageIdx][state.itemIdx];
  if (prev === null || analysis.score > prev) {
    state.scores[state.stageIdx][state.itemIdx] = analysis.score;
  }

  setPhase("idle");            // processing done — hide the progress bar
  el.recordBtn.disabled = false;
  renderResults(analysis, audioBuffer);
  renderProgress();
}

function decodeAudio(ctx, arrayBuf) {
  return new Promise((resolve, reject) => {
    const p = ctx.decodeAudioData(arrayBuf, resolve, reject);
    if (p && typeof p.then === "function") p.then(resolve).catch(reject);
  });
}

/* Reject if a promise doesn't settle within `ms`, so the UI never hangs. */
function withTimeout(promise, ms) {
  let t;
  const timer = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error("timeout")), ms);
  });
  return Promise.race([promise, timer]).finally(() => clearTimeout(t));
}

/* Single source of truth for the two status bars. Exactly one (or neither)
   shows at a time:
   - "recording"  → red dot + level meter (only while the mic is capturing)
   - "processing" → spinner (only while we decode + score the audio)
   - "idle"       → neither (before recording, and once results are shown) */
function setPhase(phase, text) {
  el.recStatus.hidden = phase !== "recording";
  el.asrStatus.hidden = phase !== "processing";
  if (phase === "processing") el.asrStatusText.textContent = text || "Scoring your pronunciation…";
}

/* ---- Azure Pronunciation Assessment ---- */

/* Azure's short-audio endpoint wants mono PCM @16 kHz. OfflineAudioContext
   resamples; then we wrap the samples in a WAV header. */
async function resampleTo16kMono(audioBuffer) {
  const targetRate = 16000;
  const frames = Math.max(1, Math.ceil(audioBuffer.duration * targetRate));
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const offline = new OAC(1, frames, targetRate);
  const src = offline.createBufferSource();
  src.buffer = audioBuffer;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

function encodeWav16(samples, sampleRate) {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buf);
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + n * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);     // fmt chunk size
  view.setUint16(20, 1, true);      // PCM
  view.setUint16(22, 1, true);      // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);      // block align
  view.setUint16(34, 16, true);     // bits per sample
  writeStr(36, "data");
  view.setUint32(40, n * 2, true);
  let off = 44;
  for (let i = 0; i < n; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Uint8Array(buf);
}

function bytesToBase64(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function assessPronunciation(audioBuffer, referenceText) {
  const samples = await resampleTo16kMono(audioBuffer);
  const wav = encodeWav16(samples, 16000);
  const res = await fetch("/api/assess", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: referenceText, lang: "en-US", audio: bytesToBase64(wav) })
  });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).error || ""; } catch (e) { /* ignore */ }
    throw new Error("assess " + res.status + " " + detail);
  }
  return res.json();
}

/* ============================ ANALYSIS ================================ */

/* Autocorrelation pitch detector for one frame. Returns frequency in Hz or -1. */
function autoCorrelate(buf, sampleRate) {
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  if (rms < 0.012) return { freq: -1, rms };

  const MIN_HZ = 70, MAX_HZ = 400;
  const minLag = Math.floor(sampleRate / MAX_HZ);
  const maxLag = Math.min(Math.floor(sampleRate / MIN_HZ), buf.length - 1);
  let bestLag = -1, bestCorr = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < buf.length - lag; i++) corr += buf[i] * buf[i + lag];
    corr /= (buf.length - lag);
    if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
  }
  if (bestLag === -1 || bestCorr < rms * rms * 0.3) return { freq: -1, rms };
  return { freq: sampleRate / bestLag, rms };
}

/* Per-frame pitch + energy across the whole recording. */
function extractContour(audioBuffer) {
  const data = audioBuffer.getChannelData(0);
  const sr = audioBuffer.sampleRate;
  const frame = 2048, hop = 512;
  const frames = [];
  for (let i = 0; i + frame <= data.length; i += hop) {
    frames.push(autoCorrelate(data.subarray(i, i + frame), sr));
  }
  return { frames, hop, sampleRate: sr, duration: audioBuffer.duration };
}

function analyzeAttempt(audioBuffer, azure) {
  const target = targetText();
  const targetNorm = normalize(target);

  const a = {
    target,
    transcript: null,
    score: 0, estimated: false,
    tips: [],
    words: null,      // [{word, score, error, phonemes}] from Azure (reference words)
    breakdown: null,  // {accuracy, fluency, completeness, pron}
    contour: null,
    voiced: null      // {startFrac, endFrac, peakFrac, meanRms, voicedDur}
  };

  /* ---- acoustic metrics (for the pitch/voice charts + fallback) ---- */
  if (audioBuffer) {
    a.contour = extractContour(audioBuffer);
    const frames = a.contour.frames;
    const maxRms = frames.reduce((m, f) => Math.max(m, f.rms), 0);
    const thresh = Math.max(0.015, maxRms * 0.18);
    let first = -1, last = -1, peak = -1, peakRms = 0, sumRms = 0, voicedCount = 0;
    frames.forEach((f, i) => {
      if (f.rms >= thresh) {
        if (first === -1) first = i;
        last = i;
        voicedCount++;
        sumRms += f.rms;
        if (f.rms > peakRms) { peakRms = f.rms; peak = i; }
      }
    });
    if (first !== -1) {
      const span = Math.max(1, last - first);
      a.voiced = {
        startFrac: first / frames.length,
        endFrac: last / frames.length,
        peakFrac: (peak - first) / span,
        meanRms: sumRms / voicedCount,
        voicedDur: (voicedCount * a.contour.hop) / a.contour.sampleRate
      };
    }
  }

  const nbest = azure && azure.NBest && azure.NBest[0];
  const status = azure && azure.RecognitionStatus;
  // The short-audio REST API returns the assessment fields flat on each object;
  // the SDK nests them under `PronunciationAssessment`. Support both.
  const pa = nbest && (nbest.PronunciationAssessment || nbest);
  const hasScores = pa && typeof pa.PronScore === "number";

  if (hasScores) {
    /* ---- real pronunciation scores from Azure ---- */
    a.transcript = nbest.Display || nbest.Lexical || "";
    a.breakdown = {
      accuracy: r(pa.AccuracyScore),
      fluency: r(pa.FluencyScore),
      completeness: r(pa.CompletenessScore),
      pron: r(pa.PronScore)
    };
    a.score = clamp(r(pa.PronScore));
    a.words = (nbest.Words || []).map(w => {
      const wpa = w.PronunciationAssessment || w;
      return {
        word: w.Word,
        score: typeof wpa.AccuracyScore === "number" ? r(wpa.AccuracyScore) : null,
        error: wpa.ErrorType || "None",
        phonemes: (w.Phonemes || []).map(p => {
          const ppa = p.PronunciationAssessment || p;
          return { ph: p.Phoneme, score: typeof ppa.AccuracyScore === "number" ? r(ppa.AccuracyScore) : null };
        })
      };
    });
    buildPronTips(a);
  } else if (status && status !== "Success") {
    /* ---- Azure ran but heard nothing intelligible ---- */
    a.transcript = "";
    a.score = 0;
    a.tips.push("We couldn't make out your speech. Listen to the model, then say “" +
      target + "” clearly into the microphone.");
  } else {
    /* ---- Azure unavailable: acoustic-only estimate (labelled) ---- */
    a.estimated = true;
    if (!a.voiced) {
      a.score = 0;
      a.tips.push("We couldn't hear your voice. Move closer to the microphone and try again.");
    } else {
      let score = 55;
      const expectedDur = Math.max(0.4, targetNorm.length * 0.075);
      const ratio = a.voiced.voicedDur / expectedDur;
      if (ratio > 0.5 && ratio < 2.2) score += 15;
      if (a.voiced.meanRms > 0.04) score += 10;
      a.score = Math.min(80, score);
      if (a.voiced.meanRms < 0.025) a.tips.push("Your voice was quite soft — speak a little louder.");
    }
  }

  return a;
}

function r(n) { return Math.round(n || 0); }
function clamp(n) { return Math.max(0, Math.min(100, n)); }

/* Turn Azure's per-word / per-phoneme scores into kid-friendly advice. */
function buildPronTips(a) {
  const words = a.words || [];
  const omitted = words.filter(w => w.error === "Omission");
  const inserted = words.filter(w => w.error === "Insertion");
  const weak = words
    .filter(w => w.error !== "Omission" && w.error !== "Insertion" && w.score !== null && w.score < 80)
    .sort((x, y) => x.score - y.score);

  if (omitted.length) {
    a.tips.push("You missed: " + omitted.map(w => "“" + w.word + "”").join(", ") + " — say every word.");
  }
  if (weak.length) {
    const worst = weak[0];
    let tip = "Practise “" + worst.word + "” — say it slowly and clearly.";
    const ph = (worst.phonemes || []).filter(p => p.score !== null).sort((x, y) => x.score - y.score)[0];
    if (ph && ph.score < 60) tip = "In “" + worst.word + "”, the “" + ph.ph + "” sound needs work — listen and copy the model.";
    a.tips.push(tip);
  }
  if (inserted.length) {
    a.tips.push("You added extra words — say only: “" + a.target + "”.");
  }
  if (a.breakdown && a.breakdown.fluency < 70 && !weak.length) {
    a.tips.push("Try to say it more smoothly, without long pauses.");
  }
  if (a.score >= 90 && !a.tips.length) {
    a.tips.push("Excellent! Your pronunciation was clear and accurate. Keep it up! 🌟");
  } else if (!a.tips.length) {
    a.tips.push("Good effort! Listen to the model once more and try to match it.");
  }
}

/* ============================== DRAWING =============================== */

function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  // Cache the intended CSS height ONCE: assigning canvas.height below mutates
  // the "height" attribute, so re-reading it would inflate the canvas by `dpr`
  // on every redraw (the runaway-tall-graph bug on mobile).
  if (!canvas._cssHeight) canvas._cssHeight = parseInt(canvas.getAttribute("height"), 10) || 90;
  const cssHeight = canvas._cssHeight;
  const cssWidth = canvas.clientWidth || canvas.parentElement.clientWidth || 300;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  canvas.style.height = cssHeight + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  return { ctx, w: cssWidth, h: cssHeight };
}

/* Model pitch curve: a smooth bump centred on the stressed syllable
   (words) or a gentle falling statement contour (sentences). */
function modelCurve(x) {
  const item = currentItem();
  if (item.syllables && item.syllables.length > 1) {
    const c = (item.stress + 0.5) / item.syllables.length;
    return 0.3 + 0.55 * Math.exp(-Math.pow((x - c) / 0.22, 2));
  }
  if (item.syllables) { // single-syllable word: rise-fall
    return 0.3 + 0.55 * Math.exp(-Math.pow((x - 0.45) / 0.28, 2));
  }
  return 0.72 - 0.45 * x + 0.12 * Math.sin(x * Math.PI * 2); // sentence: falling
}

function drawPitch(analysis) {
  const { ctx, w, h } = setupCanvas(el.pitchCanvas);
  const pad = 8;

  // model (dashed grey)
  ctx.strokeStyle = "#9aa3b5";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  for (let px = 0; px <= w - 2 * pad; px++) {
    const x = px / (w - 2 * pad);
    const y = h - pad - modelCurve(x) * (h - 2 * pad);
    if (px === 0) ctx.moveTo(pad + px, y); else ctx.lineTo(pad + px, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // user pitch (solid blue)
  if (!analysis.contour) return;
  const frames = analysis.contour.frames;
  const voicedFreqs = frames.filter(f => f.freq > 0).map(f => f.freq);
  if (voicedFreqs.length < 3) return;
  const sorted = voicedFreqs.slice().sort((x, y) => x - y);
  const lo = sorted[Math.floor(sorted.length * 0.05)];
  const hi = sorted[Math.floor(sorted.length * 0.95)];
  const span = Math.max(20, hi - lo);

  ctx.strokeStyle = "#2f8fd8";
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.beginPath();
  let penDown = false;
  frames.forEach((f, i) => {
    const x = pad + (i / (frames.length - 1)) * (w - 2 * pad);
    if (f.freq > 0) {
      const norm = Math.max(0, Math.min(1, (f.freq - lo) / span));
      const y = h - pad - (0.15 + norm * 0.7) * (h - 2 * pad);
      if (!penDown) { ctx.moveTo(x, y); penDown = true; } else { ctx.lineTo(x, y); }
    } else {
      penDown = false;
    }
  });
  ctx.stroke();
}

function drawWave(audioBuffer) {
  const { ctx, w, h } = setupCanvas(el.waveCanvas);
  ctx.strokeStyle = "#cfe3f3";
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();

  if (!audioBuffer) {
    ctx.fillStyle = "#9aa3b5";
    ctx.font = "12px sans-serif";
    ctx.fillText("Waveform unavailable on this browser — playback still works.", 10, h / 2 - 8);
    return;
  }
  const data = audioBuffer.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / w));
  ctx.fillStyle = "#2f8fd8";
  for (let px = 0; px < w; px++) {
    let min = 1, max = -1;
    const start = px * step;
    for (let i = start; i < start + step && i < data.length; i++) {
      if (data[i] < min) min = data[i];
      if (data[i] > max) max = data[i];
    }
    const y1 = (1 - max) * 0.5 * (h - 8) + 4;
    const y2 = (1 - min) * 0.5 * (h - 8) + 4;
    ctx.fillRect(px, y1, 1, Math.max(1, y2 - y1));
  }
}

/* ============================== RENDER ================================ */

function renderStepper() {
  el.stepper.innerHTML = "";
  UNIT.stages.forEach((stage, i) => {
    if (i > 0) {
      const line = document.createElement("div");
      line.className = "step-line" + (i <= state.stageIdx ? " done" : "");
      el.stepper.appendChild(line);
    }
    const step = document.createElement("div");
    step.className = "step" + (i === state.stageIdx ? " active" : i < state.stageIdx ? " done" : "");
    step.innerHTML = '<div class="step-circle">' + (i < state.stageIdx ? "✓" : i + 1) +
      '</div><div class="step-label">' + stage.label + "</div>";
    el.stepper.appendChild(step);
  });
}

function renderProgress() {
  const stage = currentStage();
  const noun = stage.id === "words" ? "Word" : stage.id === "sentences" ? "Sentence" : "Exchange";
  el.progressLabel.textContent = noun + " " + (state.itemIdx + 1) + " of " + stage.items.length;
  const done = state.scores[state.stageIdx].filter(s => s !== null).length;
  const pct = Math.round((done / stage.items.length) * 100);
  el.progressPct.textContent = pct + "%";
  el.progressFill.style.width = pct + "%";
}

function renderCard() {
  const stage = currentStage();
  const item = currentItem();
  el.panelTitle.textContent = stage.panelTitle;

  if (stage.id === "words") {
    el.itemCard.innerHTML =
      '<div class="card-main">' +
        '<h2 class="card-word">' + item.word + ' <span class="type-badge">' + item.type + "</span></h2>" +
        '<p class="card-pron">' + item.pron + "</p>" +
        '<p class="card-line"><span class="lbl">Meaning:</span> ' + item.meaning + "</p>" +
        '<p class="card-line"><span class="lbl">Example sentence:</span> ' + item.example + "</p>" +
      "</div>" +
      '<div class="card-emoji">' + item.emoji + "</div>";
    el.instruction.innerHTML = "🎯 Say the word clearly. Match the stress shown: <b>" + item.pron + "</b>";
  } else if (stage.id === "sentences") {
    el.itemCard.innerHTML =
      '<div class="card-main">' +
        '<h2 class="card-word" style="text-transform:none;font-size:clamp(22px,5.5vw,30px)">' + item.text + "</h2>" +
        '<p class="card-line"><span class="lbl">Tip:</span> Say it slowly, then at normal speed.</p>' +
      "</div>" +
      '<div class="card-emoji">' + item.emoji + "</div>";
    el.instruction.innerHTML = "🎯 Listen first, then say the whole sentence: <b>" + item.text + "</b>";
  } else {
    el.itemCard.innerHTML =
      '<div class="card-main">' +
        '<div class="bubble teacher"><span class="who">👩‍🏫 TEACHER ASKS</span>' + item.question + "</div>" +
        '<div class="bubble student"><span class="who">🙋 YOU SAY</span>' + item.answer + "</div>" +
      "</div>" +
      '<div class="card-emoji">' + item.emoji + "</div>";
    el.instruction.innerHTML = "🎯 Press <b>Listen</b> to hear the question, then record your reply: <b>" + item.answer + "</b>";
  }
}

function scoreClass(v) { return v >= 80 ? "v-good" : v >= 60 ? "v-mid" : "v-low"; }

function wordClass(w) {
  if (w.error === "Omission") return "omitted";
  if (w.score === null) return "mid";
  return w.score >= 80 ? "good" : w.score >= 60 ? "mid" : "low";
}

function renderResults(a, audioBuffer) {
  el.results.hidden = false;

  const starsOn = Math.max(1, Math.round(a.score / 20));
  el.stars.innerHTML =
    '<span class="on">' + "★".repeat(starsOn) + "</span>" +
    '<span class="off">' + "★".repeat(5 - starsOn) + "</span>";

  const tier = a.score >= 80 ? "" : a.score >= 50 ? "mid" : "low";
  el.scorePct.textContent = a.score + "%";
  el.scorePct.className = "score-pct " + tier;
  el.scoreMsg.textContent = a.score >= 90 ? "Good Job!" : a.score >= 70 ? "Almost there!" : a.score >= 50 ? "Keep practising!" : "Try again!";
  el.scoreMsg.className = "score-msg " + tier;

  // Breakdown chips (Azure dimensions)
  if (a.breakdown) {
    const chip = (label, v) =>
      '<span class="chip">' + label + " <b class=\"" + scoreClass(v) + "\">" + v + "</b></span>";
    let html = chip("Accuracy", a.breakdown.accuracy) + chip("Fluency", a.breakdown.fluency);
    if (a.target.indexOf(" ") !== -1) html += chip("Completeness", a.breakdown.completeness);
    el.breakdown.innerHTML = html;
    el.breakdown.hidden = false;
  } else {
    el.breakdown.hidden = true;
  }

  el.estimateNote.hidden = !a.estimated;
  if (a.estimated) {
    el.estimateNote.textContent =
      "ℹ️ Estimated score — the scoring service couldn't be reached, so we scored your volume and timing only. Use the Play button to compare yourself with the model.";
  }

  // Per-word pronunciation chips
  if (a.words && a.words.length) {
    el.wordScores.innerHTML = "";
    a.words.forEach(w => {
      const btn = document.createElement("button");
      btn.className = "word-chip " + wordClass(w);
      btn.innerHTML = w.word + (w.error === "Omission"
        ? "<small>missed</small>"
        : (w.score !== null ? "<small>" + w.score + "%</small>" : ""));
      btn.addEventListener("click", () => speak(w.word, 0.7));
      el.wordScores.appendChild(btn);
    });
    el.wordScoresBox.hidden = false;
  } else {
    el.wordScoresBox.hidden = true;
  }

  drawPitch(a);
  drawWave(audioBuffer);

  if (a.transcript !== null && a.transcript !== undefined) {
    const said = a.transcript.replace(/[^a-zA-Z0-9'’ ]+/g, " ").replace(/\s+/g, " ").trim();
    el.youSaid.textContent = said ? said : "(no clear words detected)";
  } else {
    el.youSaid.textContent = "(scored from audio only)";
  }

  el.tipsList.innerHTML = "";
  a.tips.forEach(tip => {
    const li = document.createElement("li");
    if (a.score >= 90) li.className = "good";
    li.textContent = tip;
    el.tipsList.appendChild(li);
  });

  el.nextBtn.textContent = nextButtonLabel();
  el.results.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function nextButtonLabel() {
  const stage = currentStage();
  if (state.itemIdx < stage.items.length - 1) return "Next →";
  if (state.stageIdx < UNIT.stages.length - 1) {
    return "Start " + UNIT.stages[state.stageIdx + 1].label + " →";
  }
  return "Finish unit 🏁";
}

function resetItemUI() {
  el.results.hidden = true;
  el.micWarning.hidden = true;
  setPhase("idle");
  el.playBtn.disabled = true;
  el.playback.removeAttribute("src");
  if (state.lastRecordingURL) { URL.revokeObjectURL(state.lastRecordingURL); state.lastRecordingURL = null; }
  state.lastAnalysis = null;
  if (window.speechSynthesis) speechSynthesis.cancel();
}

function showView(view) {
  el.lessonView.hidden = view !== "lesson";
  el.introView.hidden = view !== "intro";
  el.summaryView.hidden = view !== "summary";
}

function renderAll() {
  renderStepper();
  renderProgress();
  renderCard();
  el.backBtn.disabled = state.stageIdx === 0 && state.itemIdx === 0;
}

/* ============================ NAVIGATION ============================== */

function goToItem(stageIdx, itemIdx) {
  if (state.recording) stopRecording();
  state.stageIdx = stageIdx;
  state.itemIdx = itemIdx;
  resetItemUI();
  showView("lesson");
  renderAll();
}

function advance() {
  const stage = currentStage();
  if (state.itemIdx < stage.items.length - 1) {
    goToItem(state.stageIdx, state.itemIdx + 1);
    return;
  }
  if (state.stageIdx < UNIT.stages.length - 1) {
    showStageIntro(state.stageIdx + 1);
    return;
  }
  showSummary();
}

function showStageIntro(stageIdx) {
  if (state.recording) stopRecording();
  resetItemUI();
  const stage = UNIT.stages[stageIdx];
  el.introEmoji.textContent = stage.introEmoji;
  el.introTitle.textContent = "Step " + (stageIdx + 1) + ": " + stage.label;
  el.introText.textContent = stage.introText;
  el.introStartBtn.onclick = () => goToItem(stageIdx, 0);
  state.stageIdx = stageIdx;
  state.itemIdx = 0;
  renderStepper();
  renderProgress();
  showView("intro");
}

function showSummary() {
  if (state.recording) stopRecording();
  resetItemUI();
  showView("summary");
  el.summaryList.innerHTML = "";
  let total = 0, count = 0;
  UNIT.stages.forEach((stage, i) => {
    const scores = state.scores[i].filter(s => s !== null);
    const avg = scores.length ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length) : 0;
    total += scores.reduce((x, y) => x + y, 0);
    count += scores.length;
    const li = document.createElement("li");
    li.innerHTML = "<span>" + stage.introEmoji + " " + stage.label + " (" + scores.length + "/" +
      stage.items.length + ' done)</span><span class="sc">' + avg + "%</span>";
    el.summaryList.appendChild(li);
  });
  const overall = count ? Math.round(total / count) : 0;
  el.summaryOverall.textContent = overall >= 80
    ? "Overall score: " + overall + "% — Amazing work! 🎉"
    : "Overall score: " + overall + "% — Good effort, keep practising!";
}

function restart() {
  state.scores = UNIT.stages.map(s => s.items.map(() => null));
  goToItem(0, 0);
}

/* ============================== EVENTS ================================ */

el.listenBtn.addEventListener("click", () => {
  getAudioCtx(); // unlock audio on iOS with a user gesture
  const stage = currentStage();
  const item = currentItem();
  if (stage.id === "conversation") {
    speak(item.question + ". ", 0.9);
  } else if (stage.id === "words") {
    speak(item.word, 0.75);
  } else {
    speak(item.text, 0.85);
  }
});

el.recordBtn.addEventListener("click", () => {
  if (state.recording) stopRecording();
  else startRecording();
});

el.playBtn.addEventListener("click", () => {
  el.playback.currentTime = 0;
  el.playback.play().catch(() => {
    showMicWarning("Couldn't play the recording — try recording again.");
  });
});

el.nextBtn.addEventListener("click", advance);
el.skipBtn.addEventListener("click", advance);

el.backBtn.addEventListener("click", () => {
  if (state.itemIdx > 0) {
    goToItem(state.stageIdx, state.itemIdx - 1);
  } else if (state.stageIdx > 0) {
    const prev = state.stageIdx - 1;
    goToItem(prev, UNIT.stages[prev].items.length - 1);
  }
});

el.restartBtn.addEventListener("click", restart);

window.addEventListener("resize", () => {
  if (!el.results.hidden && state.lastAnalysis) {
    drawPitch(state.lastAnalysis);
  }
});

/* ================================ INIT ================================ */

el.unitPill.textContent = "Unit " + UNIT.number;
goToItem(0, 0);
