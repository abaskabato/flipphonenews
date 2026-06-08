// FLIPCAST Newsletter signup — Vercel serverless function.
// Collects emails and forwards to your newsletter service.
//
// To activate: paste your Buttondown / ConvertKit / Mailchimp API key below
// and uncomment the appropriate fetch. Currently just logs to stdout.

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { email } = req.body || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email' });
    }

    console.log('[newsletter]', email);

    // --- Example: Buttondown ---
    // Replace BUTTONDOWN_API_KEY with your key from https://buttondown.com/settings
    // const key = process.env.BUTTONDOWN_API_KEY;
    // if (key) {
    //     await fetch('https://api.buttondown.com/v1/subscribers', {
    //         method: 'POST',
    //         headers: {
    //             Authorization: `Token ${key}`,
    //             'Content-Type': 'application/json',
    //         },
    //         body: JSON.stringify({ email, notes: 'FLIPCAST signup' }),
    //     });
    // }

    // --- Example: ConvertKit ---
    // Replace with your ConvertKit API key + form ID from
    // https://app.convertkit.com/account_settings/advanced_settings
    // const CK_KEY = process.env.CONVERTKIT_API_KEY;
    // const FORM_ID = process.env.CONVERTKIT_FORM_ID;
    // if (CK_KEY && FORM_ID) {
    //     await fetch(`https://api.convertkit.com/v3/forms/${FORM_ID}/subscribe`, {
    //         method: 'POST',
    //         headers: { 'Content-Type': 'application/json' },
    //         body: JSON.stringify({ api_key: CK_KEY, email }),
    //     });
    // }

    return res.status(200).json({ ok: true });
}
