// Geohash encoding + a deterministic, human-readable "place codename".
// DEAD DROP pins messages to a geohash cell (precision 6 ≈ ~1.2km × 0.6km),
// so a "spot" is a neighbourhood-sized place, not an exact address.

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export const PRECISION = 6;

export function geohash(lat, lon, precision = PRECISION) {
    let latR = [-90, 90], lonR = [-180, 180];
    let hash = '', even = true, bit = 0, idx = 0;
    while (hash.length < precision) {
        const r = even ? lonR : latR;
        const mid = (r[0] + r[1]) / 2;
        if ((even ? lon : lat) > mid) { idx = (idx << 1) | 1; r[0] = mid; }
        else { idx <<= 1; r[1] = mid; }
        even = !even;
        if (++bit === 5) { hash += BASE32[idx]; bit = 0; idx = 0; }
    }
    return hash;
}

// Ask the browser for a fix. Resolves to { gh, lat, lon } or rejects.
export function locate(precision = PRECISION) {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('no geolocation'));
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({
                gh: geohash(pos.coords.latitude, pos.coords.longitude, precision),
                lat: pos.coords.latitude,
                lon: pos.coords.longitude,
            }),
            (err) => reject(err),
            { timeout: 9000, maximumAge: 60000 },
        );
    });
}

// A geohash is cryptic; turn it into a memorable two-word codename so a place
// feels named ("OAK-HOLLOW") rather than machine-coded. Deterministic per cell.
const ADJ = ['ASH', 'OAK', 'IRON', 'PALE', 'DUSK', 'NORTH', 'OLD', 'LOW', 'RED', 'GREY',
    'SALT', 'COLD', 'FAR', 'HUSH', 'DIM', 'TIN', 'BLUE', 'LONE', 'STILL', 'WIRE',
    'GLASS', 'STONE', 'RUST', 'MOSS', 'BONE', 'EMBER', 'FROST', 'DRIFT', 'HAZE', 'CINDER'];
const NOUN = ['HOLLOW', 'ROW', 'GATE', 'BEND', 'MILE', 'YARD', 'COVE', 'FORK', 'REACH', 'END',
    'CROSS', 'WELL', 'MARSH', 'RIDGE', 'LOT', 'DOCK', 'LANE', 'FIELD', 'HILL', 'POINT',
    'BANK', 'SPUR', 'NOOK', 'FLAT', 'CREST', 'HARBOR', 'GROVE', 'STEP', 'GAP', 'PASS'];

export function codename(gh) {
    if (!gh) return 'NOWHERE';
    let h = 2166136261;
    for (let i = 0; i < gh.length; i++) { h ^= gh.charCodeAt(i); h = Math.imul(h, 16777619); }
    h >>>= 0;
    return `${ADJ[h % ADJ.length]}-${NOUN[(h >> 8) % NOUN.length]}`;
}
