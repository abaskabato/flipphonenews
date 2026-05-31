// GET /api/drops?gh=<geohash> — unlocked drops buried in that cell.
import { getDrops } from '../lib/store.js';

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const gh = String(req.query.gh || '').toLowerCase().replace(/[^0-9b-hjkmnp-z]/g, '').slice(0, 9);
    if (!gh) return res.status(400).json({ error: 'gh required', drops: [] });

    try {
        const drops = await getDrops(gh);
        // never leak precise unlock internals beyond what the UI needs
        return res.status(200).json({
            gh,
            drops: drops.map((d) => ({
                id: d.id,
                message: d.message,
                author: d.author || 'ANON',
                createdAt: d.createdAt,
            })),
        });
    } catch (err) {
        console.error('[api/drops]', err);
        return res.status(200).json({ gh, drops: [] });
    }
}
