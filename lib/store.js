// DEAD DROP persistence. Drops are pinned to a geohash cell and stored in
// Vercel KV (Upstash Redis) under one list per cell: `dd:geo:<gh>`.
//
// The serverless filesystem is ephemeral, so KV is the source of truth. If KV
// isn't configured the API degrades gracefully to "no drops" and the front-end
// runs in localStorage demo mode instead.

const PREFIX = 'dd:geo:';
const MAX_PER_CELL = 200;

const hasKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
let _kv = null;

async function getKV() {
    if (!hasKV) return null;
    if (!_kv) ({ kv: _kv } = await import('@vercel/kv'));
    return _kv;
}

export function kvConfigured() { return hasKV; }

// All drops in a cell that have unlocked, newest first.
export async function getDrops(gh) {
    const kv = await getKV();
    if (!kv) return [];
    try {
        const list = (await kv.get(PREFIX + gh)) || [];
        const now = Date.now();
        return list
            .filter((d) => (d.unlockAt || 0) <= now)
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch (err) {
        console.error('[store] getDrops failed', err);
        return [];
    }
}

// Append a paid drop to its cell.
export async function addDrop(record) {
    const kv = await getKV();
    if (!kv) { console.warn('[store] KV not configured — drop NOT persisted'); return false; }
    const key = PREFIX + record.gh;
    const list = (await kv.get(key)) || [];
    list.push(record);
    await kv.set(key, list.slice(-MAX_PER_CELL));
    return true;
}
