// Nostr chat — location-based channels inside the 3D flip phone.
// Dynamically imports nostr-tools so the 3D phone always boots even if the CDN fails.
import { NEON, NEON_DIM, lcdBackground, headerBar, footerBar, crt, wrapText } from './lcd.js';

const RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.nostr.band',
];

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
const STORAGE_KEY = 'fpn:nostr:key';

function geohash(lat, lon, precision = 5) {
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

let _nostr = null;
async function nostr() {
    if (!_nostr) {
        try {
            _nostr = await import('nostr-tools');
        } catch {
            return null;
        }
    }
    return _nostr;
}

export class NostrChat {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.messages = [];
        this.gh = '';
        this.status = 'idle';
        this.pool = null;
        this.sub = null;
        this.draft = '';
        this.name = '';
        this.sk = null;
        this.pk = null;
        this._nostrReady = false;
    }

    async _initKey() {
        const n = await nostr();
        if (!n) return false;
        let key = localStorage.getItem(STORAGE_KEY);
        if (!key) {
            key = n.generatePrivateKey();
            localStorage.setItem(STORAGE_KEY, key);
        }
        this.sk = key;
        this.pk = n.getPublicKey(key);
        return true;
    }

    shortId(pk) {
        return pk ? pk.slice(0, 8) : '????';
    }

    async enter() {
        if (!this._nostrReady) {
            this._nostrReady = await this._initKey();
        }
        if (this.messages.length === 0) {
            this.status = 'locating…';
            this.draw();
            await this._locate();
            this._connect();
        }
        this.draw();
    }

    async _locate() {
        try {
            const pos = await new Promise((ok, err) =>
                navigator.geolocation.getCurrentPosition(ok, err, { timeout: 8000 })
            );
            this.gh = geohash(pos.coords.latitude, pos.coords.longitude);
            this.status = `📍 #${this.gh}`;
        } catch {
            this.gh = 'anonymous';
            this.status = '📍 anonymous';
        }
    }

    async _connect() {
        if (this.pool) return;
        const n = await nostr();
        if (!n) { this.status = 'nostr unavailable'; this.draw(); return; }

        this.status = 'connecting…';
        this.draw();
        const { SimplePool } = n;
        this.pool = new SimplePool();
        try {
            await this.pool.ensureRelay(RELAYS[0]);
            this.status = `📍 #${this.gh}`;
        } catch {
            this.status = 'offline';
        }
        this._subscribe();
        this.draw();
    }

    _subscribe() {
        if (this.sub || !this.pool) return;
        const n = _nostr;
        if (!n) return;
        this.sub = this.pool.subscribeMany(
            RELAYS,
            [{ kinds: [1], '#t': [this.gh], limit: 50 }],
            {
                onevent: (ev) => {
                    if (this.messages.some(m => m.id === ev.id)) return;
                    this.messages.push({
                        id: ev.id,
                        pubkey: ev.pubkey,
                        content: ev.content,
                        created_at: ev.created_at,
                    });
                    if (this.messages.length > 200) this.messages = this.messages.slice(-200);
                    this.draw();
                },
                oneose: () => {},
            }
        );
    }

    async send(text) {
        if (!text.trim() || !this.pool) return;
        const n = _nostr;
        if (!n) return;
        const ev = n.finalizeEvent({
            kind: 1,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['t', this.gh]],
            content: text.trim().slice(0, 280),
        }, this.sk);
        this.messages.push({
            id: ev.id,
            pubkey: ev.pubkey,
            content: ev.content,
            created_at: ev.created_at,
        });
        if (this.messages.length > 200) this.messages = this.messages.slice(-200);
        this.draw();
        this.pool.publish(RELAYS, ev).catch(() => {});
    }

    exit() {
        if (this.sub) { this.sub.close(); this.sub = null; }
        if (this.pool) { this.pool.close(RELAYS); this.pool = null; }
        this.messages = [];
    }

    update() {}

    draw() {
        const { ctx, canvas, messages, status, draft, gh } = this;
        const W = canvas.width, H = canvas.height;
        lcdBackground(ctx, W, H);
        headerBar(ctx, W, 'CHAT', status);

        const topY = 62;
        const bottomY = H - 50;
        const lineH = 20;
        const maxLines = Math.floor((bottomY - topY) / lineH);

        const display = messages.slice(-maxLines);
        ctx.font = "13px 'Courier New', monospace";
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';

        display.forEach((m, i) => {
            const y = topY + (display.length - maxLines + i) * lineH;
            if (y < topY) return;
            const who = this.shortId(m.pubkey);
            const isMine = m.pubkey === this.pk;
            ctx.fillStyle = isMine ? '#80ff80' : NEON;
            ctx.fillText(`<${who}> `, 20, y);
            const nameW = ctx.measureText(`<${who}> `).width;
            ctx.fillStyle = isMine ? NEON : NEON_DIM;
            const line = m.content.length > 50 ? m.content.slice(0, 50) + '…' : m.content;
            ctx.fillText(line, 20 + nameW, y);
        });

        footerBar(ctx, W, H, '', `/msg #${gh}`);
        ctx.font = "15px 'Courier New', monospace";
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = NEON;
        const prefix = '> ';
        const input = draft || 'Type to chat…';
        ctx.fillText(prefix + input, 20, H - 24);

        crt(ctx, W, H);
    }
}
