// Active-sponsor persistence. The serverless filesystem is ephemeral, so the
// live sponsor record lives in Vercel KV (Upstash Redis). If KV isn't
// configured the API degrades gracefully to "no sponsor" (the front-end then
// falls back to the committed data/sponsor.json placeholder).

const KEY = 'fpn:sponsor:active';

const hasKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
let _kv = null;

async function getKV() {
    if (!hasKV) return null;
    if (!_kv) ({ kv: _kv } = await import('@vercel/kv'));
    return _kv;
}

export async function getSponsor() {
    const kv = await getKV();
    if (!kv) return null;
    try {
        const rec = await kv.get(KEY);
        if (!rec) return null;
        if (rec.expiresAt && Date.now() > rec.expiresAt) {
            await kv.del(KEY);
            return null;
        }
        return rec;
    } catch (err) {
        console.error('[store] kv.get failed', err);
        return null;
    }
}

export async function setSponsor(record, ttlSeconds) {
    const kv = await getKV();
    if (!kv) {
        console.warn('[store] KV not configured — sponsor was NOT persisted');
        return false;
    }
    await kv.set(KEY, record, { ex: ttlSeconds });
    return true;
}
