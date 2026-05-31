// POST /api/webhook — Stripe webhook receiver.
// Verifies the signature and, on `checkout.session.completed` for a DEAD DROP
// purchase, persists the now-paid drop to KV so it surfaces at its location.
//
// Signature verification needs the *raw* request body, so body parsing is
// disabled and we buffer the stream ourselves.
import Stripe from 'stripe';
import { addDrop } from '../lib/store.js';

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end('Method not allowed');

    let event;
    try {
        const raw = await rawBody(req);
        const sig = req.headers['stripe-signature'];
        event = stripe.webhooks.constructEvent(raw, sig, WEBHOOK_SECRET);
    } catch (err) {
        console.error('[webhook] signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const m = (event.data.object || {}).metadata || {};
        if (m.dd === '1') {
            const record = {
                id: event.data.object.id,
                message: m.dd_message || '',
                gh: m.dd_gh || '',
                place: m.dd_place || '',
                author: m.dd_author || 'ANON',
                unlockAt: Number(m.dd_unlockAt) || Date.now(),
                createdAt: Date.now(),
            };
            try {
                const ok = await addDrop(record);
                console.log(`[webhook] drop ${ok ? 'buried' : 'NOT persisted'} at ${record.gh}`);
                if (!ok) return res.status(500).json({ error: 'persist failed' }); // makes Stripe retry
            } catch (err) {
                console.error('[webhook] failed to persist drop', err);
                return res.status(500).json({ error: 'persist failed' });
            }
        }
    }

    return res.status(200).json({ received: true });
}

async function rawBody(req) {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === 'string') return Buffer.from(req.body);
    const chunks = [];
    for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    return Buffer.concat(chunks);
}
