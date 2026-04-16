// api/gesture.js
import crypto from 'crypto';

export const config = {
  api: { bodyParser: true }
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')   { res.status(405).end(); return; }

  const appId   = process.env.PUSHER_APP_ID;
  const key     = process.env.PUSHER_KEY;
  const secret  = process.env.PUSHER_SECRET;
  const cluster = process.env.PUSHER_CLUSTER || 'ap1';

  if (!appId || !key || !secret) {
    res.status(500).json({ error: 'Pusher env vars not set' });
    return;
  }

  try {
    const { type, channel = 'wcc-gestures' } = req.body;
    if (!type) { res.status(400).json({ error: 'missing type' }); return; }

    // Build Pusher HTTP API request with correct HMAC-SHA256 signature
    const eventBody = JSON.stringify({
      channel,
      name: 'gesture',
      data: JSON.stringify({ type })
    });

    const md5body   = crypto.createHash('md5').update(eventBody).digest('hex');
    const timestamp = Math.floor(Date.now() / 1000);
    const queryStr  = `auth_key=${key}&auth_timestamp=${timestamp}&auth_version=1.0&body_md5=${md5body}`;
    const sigStr    = `POST\n/apps/${appId}/events\n${queryStr}`;
    const signature = crypto.createHmac('sha256', secret).update(sigStr).digest('hex');

    const url = `https://api-${cluster}.pusher.com/apps/${appId}/events?${queryStr}&auth_signature=${signature}`;

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: eventBody,
    });

    const text = await r.text();
    res.status(r.ok ? 200 : 500).json({ ok: r.ok, pusherStatus: r.status, pusherBody: text });

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
