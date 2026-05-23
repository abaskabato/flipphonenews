// POST /api/subscribe — stores email in KV for the 7-Day Starter program
import { kv } from '@vercel/kv';

const KEY = 'fpn:subscribers';

const hasKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { email } = req.body || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Valid email is required' });
    }

    if (!hasKV) {
        console.warn('[subscribe] KV not configured — email NOT persisted');
        return res.status(200).json({ ok: true });
    }

    try {
        await kv.sadd(KEY, email.toLowerCase().trim());
        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error('[subscribe]', err);
        return res.status(500).json({ error: 'Could not save subscription' });
    }
}
