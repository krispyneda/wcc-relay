// api/detect.js
import crypto from 'crypto';

export const config = {
  api: {
    bodyParser: false,
    maxDuration: 20,
  },
};

const SUPPORTED = {
  'en':0,'zh':1,'ms':2,'ta':3,'es':4,'fr':5,'pt':6,'de':7,'ar':8,'ja':9,'ko':10,'id':2,'yue':1,'cmn':1
};

const LANG_NAMES = {
  0:'English',1:'\u666e\u901a\u8bdd',2:'Bahasa Melayu',3:'\u0ba4\u0bae\u0bbf\u0bb4\u0bcd',
  4:'Espa\u00f1ol',5:'Fran\u00e7ais',6:'Portugu\u00eas',7:'Deutsch',
  8:'\u0639\u0631\u0628\u064a',9:'\u65e5\u672c\u8a9e',10:'\ud55c\uad6d\uc5b4'
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')   { res.status(405).end(); return; }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'OPENAI_API_KEY not set' }); return; }

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const audioBuffer = Buffer.concat(chunks);

    // Lower minimum — 500 bytes is enough for a short clip
    if (audioBuffer.length < 500) {
      res.status(200).json({ detected: false, reason: 'audio_too_short', size: audioBuffer.length });
      return;
    }

    const contentType = req.headers['x-audio-type'] || req.headers['content-type'] || 'audio/webm';
    const ext = contentType.includes('mp4') ? 'mp4'
               : contentType.includes('ogg') ? 'ogg'
               : contentType.includes('wav') ? 'wav'
               : 'webm';

    const boundary = '----WCCDetect' + Date.now();

    const header = Buffer.from([
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="clip.${ext}"`,
      `Content-Type: ${contentType}`,
      '',
      ''
    ].join('\r\n'));

    const footer = Buffer.from([
      '',
      `--${boundary}`,
      'Content-Disposition: form-data; name="model"',
      '',
      'whisper-1',
      `--${boundary}`,
      'Content-Disposition: form-data; name="response_format"',
      '',
      'verbose_json',
      `--${boundary}--`,
      ''
    ].join('\r\n'));

    const body = Buffer.concat([header, audioBuffer, footer]);

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    const rawText = await whisperRes.text();

    if (!whisperRes.ok) {
      res.status(200).json({ detected: false, reason: 'whisper_error', detail: rawText });
      return;
    }

    let data;
    try { data = JSON.parse(rawText); }
    catch(e) { res.status(200).json({ detected: false, reason: 'parse_error', raw: rawText.slice(0,200) }); return; }

    const detectedCode = data.language;

    if (!detectedCode) {
      res.status(200).json({ detected: false, reason: 'no_language_field', keys: Object.keys(data) });
      return;
    }

    const langIdx = SUPPORTED[detectedCode];

    if (langIdx === undefined) {
      res.status(200).json({ detected: true, supported: false, code: detectedCode });
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
    res.status(500).json({ error: e.message, stack: e.stack?.slice(0,300) });
  }
}
