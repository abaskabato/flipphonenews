// POST /api/create-checkout-session
// Body: { name, link, imageUrl }
// Creates a Stripe Checkout Session for a fixed-length sponsorship slot and
// returns { url } for the browser to redirect to.
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_CENTS = Number(process.env.SPONSOR_PRICE_CENTS || 4900); // $49 default
const SLOT_DAYS = Number(process.env.SPONSOR_SLOT_DAYS || 7);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(500).json({ error: 'Stripe is not configured' });
    }

    try {
        const { name, link, imageUrl } = req.body || {};

        if (!name || !imageUrl) {
            return res.status(400).json({ error: 'name and imageUrl are required' });
        }
        if (!isHttpUrl(imageUrl) || (link && !isHttpUrl(link))) {
            return res.status(400).json({ error: 'imageUrl and link must be valid http(s) URLs' });
        }

        const origin = req.headers.origin || `https://${req.headers.host}`;

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            line_items: [{
                quantity: 1,
                price_data: {
                    currency: 'usd',
                    unit_amount: PRICE_CENTS,
                    product_data: {
                        name: `FlipPhoneNews billboard — ${SLOT_DAYS} days`,
                        description: `3D phone sponsorship for "${String(name).slice(0, 80)}"`,
                    },
                },
            }],
            metadata: {
                sponsor_name: String(name).slice(0, 80),
                sponsor_link: link ? String(link).slice(0, 300) : '',
                sponsor_image: String(imageUrl).slice(0, 500),
                sponsor_days: String(SLOT_DAYS),
            },
            success_url: `${origin}/sponsor.html?status=success`,
            cancel_url: `${origin}/sponsor.html?status=cancel`,
        });

        return res.status(200).json({ url: session.url });
    } catch (err) {
        console.error('[create-checkout-session]', err);
        return res.status(500).json({ error: 'Could not create checkout session' });
    }
}

function isHttpUrl(s) {
    try {
        const u = new URL(s);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}
