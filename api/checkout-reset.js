// POST /api/checkout-reset — creates a Stripe Checkout Session for the 30-Day Reset ($19)
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_CENTS = 1900; // $19

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(500).json({ error: 'Stripe is not configured' });
    }

    try {
        const origin = req.headers.origin || `https://${req.headers.host}`;

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            line_items: [{
                quantity: 1,
                price_data: {
                    currency: 'usd',
                    unit_amount: PRICE_CENTS,
                    product_data: {
                        name: 'The 30-Day Reset',
                        description: 'A no-fluff, day-by-day program to break the scroll and rebuild a calmer relationship with your phone.',
                    },
                },
            }],
            metadata: {
                product: '30-day-reset',
            },
            success_url: `${origin}/?reset=success`,
            cancel_url: `${origin}/#program`,
        });

        return res.status(200).json({ url: session.url });
    } catch (err) {
        console.error('[checkout-reset]', err);
        return res.status(500).json({ error: 'Could not create checkout session' });
    }
}
