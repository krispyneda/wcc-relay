// api/gesture.js
// Receives gesture from phone PWA, broadcasts to extension via Pusher
// Set PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER in Vercel env vars

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const appId   = process.env.PUSHER_APP_ID;
  const key     = process.env.PUSHER_KEY;
  const secret  = process.env.PUSHER_SECRET;
  const cluster = process.env.PUSHER_CLUSTER;

  if (!appId || !key || !secret) {
    res.status(500).json({ error: 'Pusher env vars not set' });
    return;
  }

  try {
    const body = await new Promise((resolve) => {
      let data = '';
      req.on('data', c => data += c);
      req.on('end', () => resolve(JSON.parse(data)));
    });

    const { type, channel = 'wcc-gestures' } = body;

    // Trigger Pusher event using HTTP API
    const timestamp = Math.floor(Date.now() / 1000);
    const eventData = JSON.stringify({ type });
    const toSign    = `POST\n/apps/${appId}/events\n`;
    const params    = `auth_key=${key}&auth_timestamp=${timestamp}&auth_version=1.0&body_md5=${md5(eventData)}&channel=${channel}&name=gesture`;

    const crypto = await import('crypto');
    const sig = crypto.createHmac('sha256', secret)
      .update(toSign + params)
      .digest('hex');

    const pusherUrl = `https://api-${cluster}.pusher.com/apps/${appId}/events?${params}&auth_signature=${sig}`;

    const r = await fetch(pusherUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: eventData,
    });

    res.status(r.ok ? 200 : 500).json({ ok: r.ok });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}

function md5(str) {
  const crypto = require('crypto');
  return crypto.createHash('md5').update(str).digest('hex');
}
