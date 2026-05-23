// GET /api/search-products?q=flip+phone
// Searches eBay Browse API, returns products with affiliate links.
// Results cached in KV for 1 hour. Falls back to data/products.json on error.

import { createHash } from 'crypto';

const EBAY_APP_ID = process.env.EBAY_APP_ID;
const EBAY_CERT_ID = process.env.EBAY_CERT_ID;
const EBAY_CAMPAIGN_ID = process.env.EBAY_CAMPAIGN_ID || '';
const CACHE_TTL = 3600;

const hasKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
let _kv = null;
async function getKV() {
    if (!hasKV) return null;
    if (!_kv) ({ kv: _kv } = await import('@vercel/kv'));
    return _kv;
}

function cacheKey(q) {
    return 'fpn:ebay:search:' + createHash('md5').update(q.toLowerCase()).digest('hex');
}

// OAuth token cache (in-memory for the function instance lifetime)
let _token = null;
let _tokenExpires = 0;

async function getEbayToken() {
    if (_token && Date.now() < _tokenExpires) return _token;
    if (!EBAY_APP_ID || !EBAY_CERT_ID) throw new Error('eBay API not configured');
    const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(`${EBAY_APP_ID}:${EBAY_CERT_ID}`).toString('base64'),
        },
        body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope/buy.browse',
    });
    if (!res.ok) throw new Error(`eBay token error: ${res.status}`);
    const data = await res.json();
    _token = data.access_token;
    _tokenExpires = Date.now() + (data.expires_in - 120) * 1000; // 2min safety margin
    return _token;
}

function ebayAffiliateUrl(url, itemId) {
    if (!url) return '';
    if (EBAY_CAMPAIGN_ID && itemId) {
        return `https://www.ebay.com/itm/${itemId}?mkcid=1&mkrid=711-53200-19255-0&campid=${EBAY_CAMPAIGN_ID}&customid=flipphonenews`;
    }
    if (EBAY_CAMPAIGN_ID) {
        const sep = url.includes('?') ? '&' : '?';
        return `${url}${sep}mkcid=1&mkrid=711-53200-19255-0&campid=${EBAY_CAMPAIGN_ID}&customid=flipphonenews`;
    }
    return url;
}

async function searchEbay(q) {
    const token = await getEbayToken();
    const url = `https://api.ebay.com/buy/browse/v1/item_search?q=${encodeURIComponent(q)}&limit=24`;
    const res = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        },
    });
    if (!res.ok) throw new Error(`eBay search error: ${res.status}`);
    const data = await res.json();
    return (data.itemSummaries || []).filter(i => i.price && i.price.value).map(item => ({
        name: item.title || '',
        price: `$${parseFloat(item.price.value).toFixed(2)}`,
        image: item.image?.imageUrl || '',
        condition: item.condition || '',
        buyLink: ebayAffiliateUrl(item.itemWebUrl, item.itemId),
    }));
}

async function loadFallback() {
    const { readFileSync } = await import('fs');
    const raw = readFileSync('./data/products.json', 'utf8');
    return JSON.parse(raw).products || [];
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const q = (req.query?.q || 'flip phone').trim().slice(0, 100);

    // try KV cache first
    const kv = await getKV();
    if (kv) {
        try {
            const cached = await kv.get(cacheKey(q));
            if (cached) return res.status(200).json({ products: cached, source: 'cache' });
        } catch (_) { /* ignore */ }
    }

    // search eBay
    if (EBAY_APP_ID && EBAY_CERT_ID) {
        try {
            const products = await searchEbay(q);
            if (kv && products.length) {
                await kv.set(cacheKey(q), products, { ex: CACHE_TTL }).catch(() => {});
            }
            return res.status(200).json({ products, source: 'ebay' });
        } catch (err) {
            console.error('[search-products] eBay error:', err.message);
        }
    }

    // fallback to static data
    try {
        const products = await loadFallback();
        return res.status(200).json({ products, source: 'fallback' });
    } catch (err) {
        return res.status(200).json({ products: [], source: 'fallback' });
    }
}
