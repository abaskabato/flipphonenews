// POST /api/webhook — Stripe webhook receiver.
// Verifies the signature, and on `checkout.session.completed` writes the new
// active sponsor to KV with a TTL equal to the purchased slot length.
//
// Signature verification needs the *raw* request body, so body parsing is
// disabled and we buffer the stream ourselves.
import Stripe from 'stripe';
import { setSponsor } from '../lib/store.js';

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).end('Method not allowed');
    }

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
        const s = event.data.object;
        const m = s.metadata || {};
        const days = Number(m.sponsor_days || 7);
        const ttl = days * 24 * 60 * 60;

        const record = {
            name: m.sponsor_name || null,
            link: m.sponsor_link || null,
            imageUrl: m.sponsor_image || null,
            purchasedAt: Date.now(),
            expiresAt: Date.now() + ttl * 1000,
            sessionId: s.id,
        };

        try {
            const ok = await setSponsor(record, ttl);
            console.log(`[webhook] sponsor ${ok ? 'activated' : 'NOT persisted'}: ${record.name}`);
        } catch (err) {
            console.error('[webhook] failed to persist sponsor', err);
            // 500 makes Stripe retry the delivery
            return res.status(500).json({ error: 'persist failed' });
        }
    }

    return res.status(200).json({ received: true });
}

async function rawBody(req) {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === 'string') return Buffer.from(req.body);
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}
