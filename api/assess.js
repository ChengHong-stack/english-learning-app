/* /api/assess — server-side proxy to Azure AI Speech "Pronunciation Assessment".
   The phone uploads a short WAV clip + the reference text; we forward it to
   Azure with the secret key (kept in env vars, never sent to the browser) and
   return the assessment JSON. Runs on Vercel's Node serverless runtime. */

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  // .trim() also strips a leading BOM (U+FEFF), which some tools prepend when
  // setting env vars and which is illegal inside an HTTP header value.
  const key = (process.env.AZURE_SPEECH_KEY || "").trim();
  const region = (process.env.AZURE_SPEECH_REGION || "eastasia").trim();
  if (!key) {
    res.status(500).json({ error: "Speech service not configured (missing AZURE_SPEECH_KEY)." });
    return;
  }

  // Vercel parses application/json bodies into req.body for us.
  const body = req.body || {};
  const referenceText = (body.text || "").toString().trim();
  const language = (body.lang || "en-US").toString();
  const audioB64 = body.audio;

  if (!referenceText) { res.status(400).json({ error: "Missing reference text." }); return; }
  if (!audioB64 || typeof audioB64 !== "string") { res.status(400).json({ error: "Missing audio." }); return; }

  let audio;
  try {
    audio = Buffer.from(audioB64, "base64");
  } catch (e) {
    res.status(400).json({ error: "Bad audio encoding." });
    return;
  }
  if (!audio.length) { res.status(400).json({ error: "Empty audio." }); return; }

  const paConfig = {
    ReferenceText: referenceText,
    GradingSystem: "HundredMark",
    Granularity: "Phoneme",
    Dimension: "Comprehensive",
    EnableMiscue: true
  };
  const paHeader = Buffer.from(JSON.stringify(paConfig)).toString("base64");

  const url = "https://" + region + ".stt.speech.microsoft.com" +
    "/speech/recognition/conversation/cognitiveservices/v1?language=" +
    encodeURIComponent(language);

  try {
    const azRes = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
        "Pronunciation-Assessment": paHeader,
        "Accept": "application/json"
      },
      body: audio
    });

    const text = await azRes.text();
    if (!azRes.ok) {
      res.status(502).json({
        error: "Azure rejected the request.",
        status: azRes.status,
        detail: text.slice(0, 600)
      });
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(text);
  } catch (e) {
    res.status(502).json({ error: "Could not reach the speech service.", detail: String(e) });
  }
};
