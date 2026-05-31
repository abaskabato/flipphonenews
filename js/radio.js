// WORLD RADIO — tune across thousands of live internet stations on the phone's
// LCD. Stations come from the free, public Radio-Browser API (no key, no
// backend). A curated fallback list keeps the radio playing even if the API is
// unreachable, so the experience is never empty.
import {
    NEON, NEON_DIM, lcdBackground, headerBar, footerBar, crt, roundRect, glow, mulberry32,
} from './lcd.js';

const API_HOSTS = [
    'https://de1.api.radio-browser.info',
    'https://nl1.api.radio-browser.info',
    'https://at1.api.radio-browser.info',
];

// UI genre -> Radio-Browser tag ('top' uses the global top-clicked endpoint)
const GENRES = ['top', 'lofi', 'jazz', 'rock', 'pop', 'electronic', 'classical', 'ambient', 'hiphop', 'news', 'reggae', 'metal'];

// Always-available fallback (SomaFM, listener-supported, https streams).
const FALLBACK = [
    { name: 'SomaFM: Groove Salad', url: 'https://ice1.somafm.com/groovesalad-128-mp3', country: 'US', tags: 'ambient,downtempo', bitrate: 128 },
    { name: 'SomaFM: Drone Zone', url: 'https://ice1.somafm.com/dronezone-128-mp3', country: 'US', tags: 'ambient', bitrate: 128 },
    { name: 'SomaFM: Indie Pop Rocks', url: 'https://ice1.somafm.com/indiepop-128-mp3', country: 'US', tags: 'indie,pop', bitrate: 128 },
    { name: 'SomaFM: Underground 80s', url: 'https://ice1.somafm.com/u80s-128-mp3', country: 'US', tags: '80s,synth', bitrate: 128 },
    { name: 'SomaFM: Lush', url: 'https://ice1.somafm.com/lush-128-mp3', country: 'US', tags: 'vocal,chill', bitrate: 128 },
    { name: 'SomaFM: DEF CON Radio', url: 'https://ice1.somafm.com/defcon-128-mp3', country: 'US', tags: 'electronic', bitrate: 128 },
    { name: 'SomaFM: Fluid', url: 'https://ice1.somafm.com/fluid-128-mp3', country: 'US', tags: 'hiphop,instrumental', bitrate: 128 },
];

export class Radio {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.audio = null;
        this.genreIdx = 0;
        this.stations = [];
        this.sel = 0;
        this.status = 'idle';       // 'loading' | 'idle' | 'tuning' | 'live' | 'error'
        this.statusMsg = 'BOOTING';
        this._t = 0;
        this._eqSeed = mulberry32(7);
        this._marquee = 0;
    }

    setAudio(el) {
        this.audio = el;
        el.addEventListener('playing', () => { this.status = 'live'; this.draw(); });
        el.addEventListener('waiting', () => { this.status = 'tuning'; this.draw(); });
        el.addEventListener('stalled', () => { this.status = 'tuning'; this.draw(); });
        el.addEventListener('error', () => { if (this.audio.src) { this.status = 'error'; this.statusMsg = 'STREAM OFFLINE'; this.draw(); } });
        el.addEventListener('pause', () => { if (this.status === 'live') { this.status = 'idle'; this.draw(); } });
    }

    get genre() { return GENRES[this.genreIdx]; }
    get current() { return this.stations[this.sel]; }

    // ---------- lifecycle ----------
    async enter() {
        if (this.stations.length) { this.draw(); return; }
        await this.loadGenre(this.genreIdx);
    }
    exit() { this.stop(); }
    update(dt) {
        this._t += dt;
        if (this.status === 'live') this._marquee += dt * 60;
        this.draw();
    }

    async loadGenre(idx) {
        this.genreIdx = (idx + GENRES.length) % GENRES.length;
        this.status = 'loading';
        this.statusMsg = 'SCANNING ' + this.genre.toUpperCase();
        this.draw();
        const list = await fetchStations(this.genre);
        this.stations = list.length ? list : FALLBACK;
        this.sel = 0;
        this._marquee = 0;
        this.status = 'idle';
        this.draw();
    }

    // ---------- controls ----------
    nav(dir) {
        if (dir === 'left') { this.stop(); this.loadGenre(this.genreIdx - 1); return; }
        if (dir === 'right') { this.stop(); this.loadGenre(this.genreIdx + 1); return; }
        if (!this.stations.length) return;
        if (dir === 'up') this.sel = (this.sel - 1 + this.stations.length) % this.stations.length;
        if (dir === 'down') this.sel = (this.sel + 1) % this.stations.length;
        this._marquee = 0;
        if (this.status === 'live' || this.status === 'tuning') this.tune(this.current); // live retune
        this.draw();
    }

    // OK / play-pause
    primary() {
        if (!this.current) return;
        if (this.status === 'live' || this.status === 'tuning') this.stop();
        else this.tune(this.current);
        this.draw();
    }

    back() { this.stop(); this.draw(); }

    tune(station) {
        if (!this.audio || !station) return;
        this.status = 'tuning';
        this.statusMsg = 'TUNING';
        try {
            this.audio.src = station.url;
            this.audio.load();
            const p = this.audio.play();
            if (p && p.catch) p.catch(() => { this.status = 'error'; this.statusMsg = 'TAP OK TO PLAY'; this.draw(); });
        } catch {
            this.status = 'error'; this.statusMsg = 'STREAM OFFLINE';
        }
    }
    stop() {
        if (this.audio) { try { this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); } catch { /* noop */ } }
        if (this.status !== 'loading') this.status = 'idle';
    }

    handleKey(e) {
        const k = e.key;
        if (k === 'ArrowUp') { this.nav('up'); e.preventDefault(); }
        else if (k === 'ArrowDown') { this.nav('down'); e.preventDefault(); }
        else if (k === 'ArrowLeft') { this.nav('left'); e.preventDefault(); }
        else if (k === 'ArrowRight') { this.nav('right'); e.preventDefault(); }
        else if (k === 'Enter' || k === ' ') { this.primary(); e.preventDefault(); }
        else if (k === 'Escape') { this.back(); e.preventDefault(); }
    }

    // ---------- rendering ----------
    draw() {
        const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
        lcdBackground(ctx, W, H);
        const live = this.status === 'live';
        headerBar(ctx, W, 'WORLD RADIO', signalBars(live ? 4 : (this.status === 'tuning' ? 2 : 1)));

        // genre tab
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = NEON_DIM; ctx.font = "16px 'Courier New', monospace";
        ctx.fillText('◄  ' + this.genre.toUpperCase() + '  ►', W / 2, 84);

        const st = this.current;
        if (this.status === 'loading' || !st) {
            ctx.fillStyle = NEON; ctx.font = "bold 22px 'Courier New', monospace";
            const dots = '.'.repeat(1 + (Math.floor(this._t * 2) % 3));
            ctx.fillText(this.statusMsg + dots, W / 2, H * 0.5);
            crt(ctx, W, H);
            return;
        }

        // station name (marquee if long)
        glow(ctx, live);
        ctx.fillStyle = NEON; ctx.font = "bold 28px 'Courier New', monospace";
        ctx.textAlign = 'left';
        marquee(ctx, st.name, 20, 130, W - 40, live ? this._marquee : 0);
        glow(ctx, false);
        // meta line
        ctx.textAlign = 'center';
        ctx.fillStyle = NEON_DIM; ctx.font = "15px 'Courier New', monospace";
        const meta = [st.country, (st.tags || '').split(',')[0], st.bitrate ? st.bitrate + 'k' : '']
            .filter(Boolean).join('  ·  ');
        ctx.fillText(meta || 'live stream', W / 2, 162);

        // equalizer
        drawEQ(ctx, W, 188, 300, live, this._t, this._eqSeed);

        // status pill
        ctx.textAlign = 'center';
        if (live) { glow(ctx, true); ctx.fillStyle = NEON; }
        else ctx.fillStyle = NEON_DIM;
        ctx.font = "bold 18px 'Courier New', monospace";
        const label = live ? '● ON AIR' : this.status === 'tuning' ? 'TUNING' + '.'.repeat(1 + (Math.floor(this._t * 2) % 3))
            : this.status === 'error' ? this.statusMsg : '⏸ PRESS OK TO TUNE IN';
        ctx.fillText(label, W / 2, 322);
        glow(ctx, false);

        // station list
        const top = 352, rowH = 36, bottom = H - 52;
        const rows = Math.floor((bottom - top) / rowH);
        const n = this.stations.length;
        const start = Math.max(0, Math.min(this.sel - (rows >> 1), n - rows));
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        for (let i = 0; i < rows && start + i < n; i++) {
            const s = this.stations[start + i];
            const y = top + i * rowH;
            const on = (start + i) === this.sel;
            if (on) {
                ctx.fillStyle = 'rgba(57,255,20,0.14)'; ctx.strokeStyle = NEON_DIM; ctx.lineWidth = 1.5;
                roundRect(ctx, 14, y - rowH / 2 + 3, W - 28, rowH - 6, 7); ctx.fill(); ctx.stroke();
            }
            ctx.fillStyle = on ? NEON : NEON_DIM;
            ctx.font = (on ? 'bold ' : '') + "16px 'Courier New', monospace";
            ctx.fillText((on ? '▸ ' : '  ') + clip(s.name, 30), 22, y);
        }

        footerBar(ctx, W, H, '◄ genre ►', '▲▼ station');
        crt(ctx, W, H);
    }
}

// ---------- data ----------
async function fetchStations(genre) {
    for (const host of API_HOSTS) {
        try {
            const path = genre === 'top'
                ? '/json/stations/topclick/50'
                : `/json/stations/bytagexact/${encodeURIComponent(genre)}?order=clickcount&reverse=true&hidebroken=true&limit=50`;
            const r = await fetch(host + path, { headers: { Accept: 'application/json' } });
            if (!r.ok) continue;
            const raw = await r.json();
            const mapped = raw
                .map((s) => ({
                    name: (s.name || 'Unknown').trim(),
                    url: s.url_resolved || s.url,
                    country: s.countrycode || s.country || '',
                    tags: s.tags || '',
                    bitrate: s.bitrate || 0,
                }))
                .filter((s) => s.url);
            // prefer https streams first (http streams are blocked on https pages)
            mapped.sort((a, b) => (b.url.startsWith('https') ? 1 : 0) - (a.url.startsWith('https') ? 1 : 0));
            const seen = new Set();
            const dedup = mapped.filter((s) => (seen.has(s.name) ? false : (seen.add(s.name), true)));
            if (dedup.length) return dedup.slice(0, 50);
        } catch { /* try next host */ }
    }
    return []; // caller substitutes FALLBACK
}

// ---------- draw helpers ----------
function drawEQ(ctx, W, top, bottom, live, t, rng) {
    const bars = 24, gap = 4, pad = 24;
    const bw = (W - pad * 2 - gap * (bars - 1)) / bars;
    const maxH = bottom - top;
    glow(ctx, live);
    for (let i = 0; i < bars; i++) {
        let h;
        if (live) {
            const base = 0.35 + 0.65 * Math.abs(Math.sin(t * (2 + (i % 5) * 0.7) + i));
            h = base * maxH * (0.5 + 0.5 * rng());
        } else {
            h = maxH * 0.06;
        }
        const x = pad + i * (bw + gap);
        ctx.fillStyle = live ? NEON : NEON_DIM;
        ctx.fillRect(x, bottom - h, bw, h);
    }
    glow(ctx, false);
    ctx.strokeStyle = NEON_DIM; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, bottom + 1); ctx.lineTo(W - pad, bottom + 1); ctx.stroke();
}

function marquee(ctx, text, x, y, maxW, offset) {
    const w = ctx.measureText(text).width;
    if (w <= maxW) { ctx.textAlign = 'left'; ctx.fillText(text, x, y); return; }
    const gap = 60;
    const span = w + gap;
    const o = offset % span;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y - 24, maxW, 48); ctx.clip();
    ctx.textAlign = 'left';
    ctx.fillText(text, x - o, y);
    ctx.fillText(text, x - o + span, y);
    ctx.restore();
}

function signalBars(level) {
    const full = '▮'.repeat(level);
    const empty = '▯'.repeat(4 - level);
    return full + empty;
}
function clip(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
