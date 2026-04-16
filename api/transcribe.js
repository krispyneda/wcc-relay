// api/transcribe.js
// Receives audio blob from extension, sends to OpenAI Whisper, returns transcript
// Deploy to Vercel. Set OPENAI_API_KEY in Vercel environment variables.

export const config = {
  api: {
    bodyParser: false, // we handle raw binary ourselves
    maxDuration: 30,
  },
};

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'OPENAI_API_KEY not set in environment variables' });
    return;
  }

  try {
    // Read raw body
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const audioBuffer = Buffer.concat(chunks);

    if (audioBuffer.length < 1000) {
      // Too small to be meaningful audio — skip
      res.status(200).json({ text: '' });
      return;
    }

    // Build multipart form for Whisper API
    const boundary = '----WCCBoundary' + Date.now();
    const contentType = req.headers['x-audio-type'] || 'audio/webm';
    const ext = contentType.includes('mp4') ? 'mp4'
               : contentType.includes('ogg') ? 'ogg'
               : contentType.includes('wav') ? 'wav'
               : 'webm';

    // Whisper prompt — primes the model with football vocabulary
    const prompt = 'Football World Cup match commentary. Players: Mbappé, Vinicius Junior, Rodrygo, Casemiro, Haaland, De Bruyne, Bellingham, Salah, Kane, Lewandowski, Messi, Ronaldo, Pulisic, Saka, Foden. Terms: offside, VAR, penalty, free kick, corner, hat-trick, clean sheet, stoppage time, half-time, full-time, kick-off.';

    const formParts = [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="file"; filename="audio.${ext}"\r\n`,
      `Content-Type: ${contentType}\r\n\r\n`,
    ];

    const textParts = [
      `\r\n--${boundary}\r\n`,
      `Content-Disposition: form-data; name="model"\r\n\r\n`,
      `whisper-1`,
      `\r\n--${boundary}\r\n`,
      `Content-Disposition: form-data; name="language"\r\n\r\n`,
      `en`,
      `\r\n--${boundary}\r\n`,
      `Content-Disposition: form-data; name="prompt"\r\n\r\n`,
      prompt,
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
      const errText = await whisperRes.text();
      console.error('Whisper error:', errText);
      res.status(whisperRes.status).json({ error: errText });
      return;
    }

    const data = await whisperRes.json();
    res.status(200).json({ text: data.text || '' });

  } catch (err) {
    console.error('Transcription error:', err);
    res.status(500).json({ error: err.message });
  }
}
