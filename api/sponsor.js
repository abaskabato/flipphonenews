// GET /api/sponsor — the currently active sponsor (or an empty record).
import { getSponsor } from '../lib/store.js';

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');

    let active = null;
    try {
        active = await getSponsor();
    } catch (err) {
        console.error('[api/sponsor]', err);
    }

    if (active && active.imageUrl) {
        return res.status(200).json({
            name: active.name || null,
            imageUrl: active.imageUrl,
            link: active.link || null,
            expiresAt: active.expiresAt || null,
        });
    }
    return res.status(200).json({ name: null, imageUrl: null, link: null });
}
