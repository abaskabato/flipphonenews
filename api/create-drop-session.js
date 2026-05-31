// POST /api/create-drop-session
// Body: { message, gh, place, unlock: 'now'|'capsule', unlockAt, author }
// Creates a Stripe Checkout Session to pay for pinning one drop. The drop
// payload rides along in metadata and is persisted by the webhook once paid.
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE = {
    now: Number(process.env.DROP_PRICE_NOW_CENTS || 100),
    capsule: Number(process.env.DROP_PRICE_CAPSULE_CENTS || 300),
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Stripe is not configured' });

    try {
        const { message, gh, place, unlock, unlockAt, author } = req.body || {};

        const msg = String(message || '').trim().slice(0, 240);
        const cell = String(gh || '').toLowerCase().replace(/[^0-9b-hjkmnp-z]/g, '').slice(0, 9);
        const kind = unlock === 'capsule' ? 'capsule' : 'now';

        if (!msg) return res.status(400).json({ error: 'message required' });
        if (!cell) return res.status(400).json({ error: 'gh required' });

        const unlockTs = kind === 'capsule'
            ? Math.min(Number(unlockAt) || 0, Date.now() + 100 * 365 * 86400000)
            : Date.now();

        const origin = req.headers.origin || `https://${req.headers.host}`;

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            line_items: [{
                quantity: 1,
                price_data: {
                    currency: 'usd',
                    unit_amount: PRICE[kind],
                    product_data: {
                        name: kind === 'capsule' ? 'DEAD DROP — sealed capsule' : 'DEAD DROP — pinned message',
                        description: `Buried at ${String(place || cell).slice(0, 60)}`,
                    },
                },
            }],
            metadata: {
                dd: '1',
                dd_message: msg,
                dd_gh: cell,
                dd_place: String(place || '').slice(0, 60),
                dd_author: String(author || 'ANON').slice(0, 24),
                dd_unlockAt: String(unlockTs),
            },
            success_url: `${origin}/?drop=success`,
            cancel_url: `${origin}/?drop=cancel`,
        });

        return res.status(200).json({ url: session.url });
    } catch (err) {
        console.error('[create-drop-session]', err);
        return res.status(500).json({ error: 'Could not create checkout session' });
    }
}
