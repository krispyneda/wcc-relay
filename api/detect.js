// api/detect.js
// Receives a short audio clip, returns the detected language
// Uses Whisper's language detection mode — cheaper and faster than full transcription

export const config = {
  api: {
    bodyParser: false,
    maxDuration: 15,
  },
};

// Languages we support — maps Whisper language codes to our app language indices
const SUPPORTED_LANGUAGES = {
  'en': 0,  // English
  'zh': 1,  // Mandarin
  'ms': 2,  // Malay
  'ta': 3,  // Tamil
  'es': 4,  // Spanish
  'fr': 5,  // French
  'pt': 6,  // Portuguese
  'de': 7,  // German
  'ar': 8,  // Arabic
  'ja': 9,  // Japanese
  'ko': 10, // Korean
  // Indonesian close enough to Malay for our purposes
  'id': 2,
};

const LANG_NAMES = {
  0: 'English',
  1: '\u666e\u901a\u8bdd',
  2: 'Bahasa Melayu',
  3: '\u0ba4\u0bae\u0bbf\u0bb4\u0bcd',
  4: 'Espa\u00f1ol',
  5: 'Fran\u00e7ais',
  6: 'Portugu\u00eas',
  7: 'Deutsch',
  8: '\u0639\u0631\u0628\u064a',
  9: '\u65e5\u672c\u8a9e',
  10: '\ud55c\uad6d\uc5b4',
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'OPENAI_API_KEY not set' });
    return;
  }

  try {
    // Read raw audio body
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const audioBuffer = Buffer.concat(chunks);

    if (audioBuffer.length < 1000) {
      res.status(200).json({ detected: false, reason: 'audio too short' });
      return;
    }

    const contentType = req.headers['x-audio-type'] || 'audio/webm';
    const ext = contentType.includes('mp4') ? 'mp4'
               : contentType.includes('ogg') ? 'ogg'
               : contentType.includes('wav') ? 'wav'
               : 'webm';

    // Send to Whisper — we ask for transcription but only use the detected language
    // Whisper always detects language as part of transcription, we just ignore the text
    const boundary = '----WCCDetect' + Date.now();

    const formParts = [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="file"; filename="detect.${ext}"\r\n`,
      `Content-Type: ${contentType}\r\n\r\n`,
    ];

    const textParts = [
      `\r\n--${boundary}\r\n`,
      `Content-Disposition: form-data; name="model"\r\n\r\nwhisper-1`,
      `\r\n--${boundary}\r\n`,
      // response_format=verbose_json gives us language confidence
      `Content-Disposition: form-data; name="response_format"\r\n\r\nverbose_json`,
      `\r\n--${boundary}--\r\n`,
    ];

    const headerBuf = Buffer.from(formParts.join(''));
    const footerBuf = Buffer.from(textParts.join(''));
    const body = Buffer.concat([headerBuf, audioBuffer, footerBuf]);

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length.toString(),
      },
      body,
    });

    if (!whisperRes.ok) {
      const err = await whisperRes.text();
      res.status(500).json({ error: err });
      return;
    }

    const data = await whisperRes.json();
    const detectedCode = data.language; // e.g. 'en', 'zh', 'ta'

    if (!detectedCode) {
      res.status(200).json({ detected: false, reason: 'no language returned' });
      return;
    }

    const langIdx = SUPPORTED_LANGUAGES[detectedCode];

    if (langIdx === undefined) {
      // Detected a language we don't support — return detected code so client can decide
      res.status(200).json({
        detected: true,
        supported: false,
        code: detectedCode,
        langIdx: null,
        langName: detectedCode,
      });
      return;
    }

    res.status(200).json({
      detected: true,
      supported: true,
      code: detectedCode,
      langIdx,
      langName: LANG_NAMES[langIdx],
    });

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
