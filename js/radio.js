// FLIPCAST · RADIO band — tune across thousands of live internet stations on
// the phone's LCD. Stations come from the free, public Radio-Browser API (no key, no
// backend). A curated fallback list keeps the radio playing even if the API is
// unreachable, so the experience is never empty.
import {
    NEON, NEON_DIM, lcdBackground, headerBar, footerBar, crt, roundRect, glow, mulberry32,
    marquee, signalBars, clip,
} from './lcd.js';

const API_HOSTS = [
    'https://de1.api.radio-browser.info',
    'https://nl1.api.radio-browser.info',
    'https://at1.api.radio-browser.info',
];

// UI genre -> Radio-Browser tag ('top' uses the global top-clicked endpoint)
const GENRES = ['top', 'lofi', 'jazz', 'rock', 'pop', 'electronic', 'classical', 'ambient', 'hiphop', 'news', 'reggae', 'metal'];

// T9 multi-tap letter cycles for the numeric keypad
const T9 = {
    1: '1', 2: 'abc2', 3: 'def3', 4: 'ghi4', 5: 'jkl5',
    6: 'mno6', 7: 'pqrs7', 8: 'tuv8', 9: 'wxyz9', 0: ' 0', '*': '.', '#': '#',
};
const T9_WINDOW = 900; // ms to keep cycling the same key
const MAX_QUERY = 40;

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
        this.mode = 'browse';       // 'browse' | 'search'
        this.genreIdx = 0;
        this.stations = [];
        this.sel = 0;
        this.query = '';
        this.searchLabel = '';
        this.status = 'idle';       // 'loading' | 'idle' | 'tuning' | 'live' | 'error'
        this.statusMsg = 'BOOTING';
        this._t9 = null;
        this._t = 0;
        this._eqSeed = mulberry32(7);
        this._marquee = 0;
        this._hls = null;
        this.active = true;         // false while another band owns the shared audio
        this.onSearchOpen = null;   // hook so the shell can pop the mobile keyboard
    }

    setAudio(el) {
        this.audio = el;
        el.addEventListener('playing', () => { if (!this.active) return; this.status = 'live'; this.draw(); });
        el.addEventListener('waiting', () => { if (!this.active) return; this.status = 'tuning'; this.draw(); });
        el.addEventListener('stalled', () => { if (!this.active) return; this.status = 'tuning'; this.draw(); });
        el.addEventListener('error', () => { if (this.active && this.audio.src) { this.status = 'error'; this.statusMsg = 'STREAM OFFLINE'; this.draw(); } });
        el.addEventListener('pause', () => { if (this.active && this.status === 'live') { this.status = 'idle'; this.draw(); } });
    }

    get genre() { return GENRES[this.genreIdx]; }
    get current() { return this.stations[this.sel]; }
    get label() { return this.mode === 'search' ? ('“' + (this.searchLabel || this.query) + '”') : this.genre.toUpperCase(); }

    // ---------- lifecycle ----------
    async enter() {
        if (this.stations.length) { this.draw(); return; }
        await this.loadGenre(this.genreIdx);
    }
    exit() { this.stop(); }
    update(dt) {
        this._t += dt;
        if (this._t9 && performance.now() - this._t9.time > T9_WINDOW) this._t9 = null;
        if (this.status === 'live') this._marquee += dt * 60;
        this.draw();
    }

    async loadGenre(idx) {
        this.mode = 'browse';
        this.genreIdx = (idx + GENRES.length) % GENRES.length;
        this.status = 'loading';
        this.statusMsg = 'SCANNING ' + this.genre.toUpperCase();
        this.draw();
        const list = await fetchByGenre(this.genre);
        this.stations = list.length ? list : FALLBACK;
        this.sel = 0;
        this._marquee = 0;
        this.status = 'idle';
        this.draw();
    }

    // ---------- search ----------
    openSearch() {
        this.mode = 'search';
        this.query = '';
        this._t9 = null;
        if (this.onSearchOpen) this.onSearchOpen();
        this.draw();
    }
    closeSearch() {
        this.mode = 'browse';
        this._t9 = null;
        this.draw();
    }
    typeChar(ch) {                  // direct (physical / mobile keyboard)
        if (this.mode !== 'search') this.openSearch();
        this._t9 = null;
        this.query = (this.query + ch).slice(0, MAX_QUERY);
        this.draw();
    }
    typeString(s) { for (const ch of s) this.typeChar(ch); }
    backspace() {
        if (this.mode !== 'search') return;
        this._t9 = null;
        this.query = this.query.slice(0, -1);
        this.draw();
    }
    t9(digit) {
        if (this.mode !== 'search') this.openSearch();
        const letters = T9[digit];
        if (!letters) return;
        const now = performance.now();
        if (this._t9 && this._t9.digit === digit && now - this._t9.time < T9_WINDOW) {
            this._t9.idx = (this._t9.idx + 1) % letters.length;
            this.query = this.query.slice(0, -1) + letters[this._t9.idx];
        } else if (this.query.length < MAX_QUERY) {
            this.query += letters[0];
            this._t9 = { digit, idx: 0, time: now };
        }
        if (this._t9) this._t9.time = now;
        this.draw();
    }
    async submitSearch() {
        const q = this.query.trim();
        if (!q) return;
        this._t9 = null;
        this.status = 'loading';
        this.statusMsg = 'SEARCHING';
        this.draw();
        const list = await fetchByName(q);
        this.stations = list;
        this.searchLabel = q;
        this.sel = 0;
        this._marquee = 0;
        this.status = 'idle';
        this.draw();
    }

    // ---------- navigation / transport ----------
    nav(dir) {
        if (dir === 'left' || dir === 'right') {
            if (this.mode === 'search') return;          // genre switch only in browse
            this.stop();
            this.loadGenre(this.genreIdx + (dir === 'right' ? 1 : -1));
            return;
        }
        if (!this.stations.length) return;
        if (dir === 'up') this.sel = (this.sel - 1 + this.stations.length) % this.stations.length;
        if (dir === 'down') this.sel = (this.sel + 1) % this.stations.length;
        this._marquee = 0;
        if (this.status === 'live' || this.status === 'tuning') this.tune(this.current); // live retune
        this.draw();
    }

    primary() {                     // OK = play / pause
        if (this.mode === 'search' && this.query && this.stations.length === 0) { this.submitSearch(); return; }
        if (!this.current) return;
        if (this.status === 'live' || this.status === 'tuning') this.stop();
        else this.tune(this.current);
        this.draw();
    }

    // Routed from the clickable 3D keypad.
    keypadPress(key) {
        switch (key) {
            case 'OK': this.primary(); break;
            case 'UP': this.nav('up'); break;
            case 'DOWN': this.nav('down'); break;
            case 'LEFT': this.nav('left'); break;
            case 'RIGHT': this.nav('right'); break;
            case 'SEND': this.mode === 'search' ? this.submitSearch() : this.openSearch(); break;
            case 'END': this.mode === 'search' ? this.closeSearch() : this.stop(); this.draw(); break;
            default: if (T9[key] !== undefined) this.t9(key); break;
        }
    }

    handleKey(e) {
        const k = e.key;
        if (this.mode === 'search') {
            if (k === 'Enter') { this.submitSearch(); e.preventDefault(); return; }
            if (k === 'Escape') { this.closeSearch(); e.preventDefault(); return; }
            if (k === 'Backspace') { this.backspace(); e.preventDefault(); return; }
            if (k === 'ArrowUp') { this.nav('up'); e.preventDefault(); return; }
            if (k === 'ArrowDown') { this.nav('down'); e.preventDefault(); return; }
            if (k.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) { this.typeChar(k); e.preventDefault(); return; }
            return;
        }
        // browse mode
        if (k === 'ArrowUp') { this.nav('up'); e.preventDefault(); }
        else if (k === 'ArrowDown') { this.nav('down'); e.preventDefault(); }
        else if (k === 'ArrowLeft') { this.nav('left'); e.preventDefault(); }
        else if (k === 'ArrowRight') { this.nav('right'); e.preventDefault(); }
        else if (k === 'Enter' || k === ' ') { this.primary(); e.preventDefault(); }
        else if (k === 'Escape') { this.back(); e.preventDefault(); }
        else if (k === '/' ) { this.openSearch(); e.preventDefault(); }
        else if (k.length === 1 && /[a-z0-9]/i.test(k) && !e.metaKey && !e.ctrlKey && !e.altKey) {
            this.openSearch(); this.typeChar(k); e.preventDefault();
        }
    }

    back() { this.stop(); this.draw(); }

    tune(station) {
        if (!this.audio || !station) return;
        this.status = 'tuning';
        this.statusMsg = 'TUNING';
        this._teardownHls();
        const url = station.url;
        // HLS (.m3u8): prefer hls.js (Chrome/Firefox); fall back to native (Safari).
        if (isHls(url)) {
            loadHlsLib().then((Hls) => {
                if (this.current !== station) return; // user moved on while loading
                if (Hls && Hls.isSupported()) {
                    const hls = new Hls({ enableWorker: false });
                    this._hls = hls;
                    hls.on(Hls.Events.ERROR, (_e, data) => {
                        if (data && data.fatal) { this.status = 'error'; this.statusMsg = 'STREAM OFFLINE'; this.draw(); }
                    });
                    hls.loadSource(url);
                    hls.attachMedia(this.audio);
                    this._startPlay();
                } else if (this.audio.canPlayType('application/vnd.apple.mpegurl')) {
                    this._playNative(url); // Safari native HLS
                } else {
                    this.status = 'error'; this.statusMsg = 'HLS UNSUPPORTED'; this.draw();
                }
            });
            return;
        }
        this._playNative(url);
    }
    _playNative(url) {
        try {
            this.audio.src = url;
            this.audio.load();
            this._startPlay();
        } catch { this.status = 'error'; this.statusMsg = 'STREAM OFFLINE'; }
    }
    _startPlay() {
        const p = this.audio.play();
        if (p && p.catch) p.catch(() => { this.status = 'error'; this.statusMsg = 'TAP OK TO PLAY'; this.draw(); });
    }
    _teardownHls() {
        if (this._hls) { try { this._hls.destroy(); } catch { /* noop */ } this._hls = null; }
    }
    stop() {
        this._teardownHls();
        if (this.audio) { try { this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); } catch { /* noop */ } }
        if (this.status !== 'loading') this.status = 'idle';
    }

    // ---------- rendering ----------
    draw() {
        const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
        lcdBackground(ctx, W, H);
        const live = this.status === 'live';
        headerBar(ctx, W, 'RADIO', this.mode === 'search' ? 'SEARCH' : signalBars(live ? 4 : (this.status === 'tuning' ? 2 : 1)));

        // genre tab OR search bar
        if (this.mode === 'search') {
            ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.strokeStyle = NEON_DIM; ctx.lineWidth = 1.5;
            roundRect(ctx, 16, 68, W - 32, 36, 8); ctx.stroke();
            glow(ctx, true);
            ctx.fillStyle = NEON; ctx.font = "18px 'Courier New', monospace";
            const cur = (Math.floor(this._t * 2) % 2) ? '▌' : ' ';
            ctx.fillText('search: ' + (this.query || '') + cur, 28, 87);
            glow(ctx, false);
        } else {
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = NEON_DIM; ctx.font = "16px 'Courier New', monospace";
            ctx.fillText('◄  ' + this.genre.toUpperCase() + '  ►', W / 2, 86);
        }

        const st = this.current;
        if (this.status === 'loading') {
            ctx.fillStyle = NEON; ctx.textAlign = 'center'; ctx.font = "bold 22px 'Courier New', monospace";
            const dots = '.'.repeat(1 + (Math.floor(this._t * 2) % 3));
            ctx.fillText(this.statusMsg + dots, W / 2, H * 0.5);
            crt(ctx, W, H);
            return;
        }
        if (!st) {
            ctx.fillStyle = NEON_DIM; ctx.textAlign = 'center'; ctx.font = "18px 'Courier New', monospace";
            ctx.fillText(this.mode === 'search' ? 'type a name · SEND to search' : 'no stations', W / 2, H * 0.5);
            footerBar(ctx, W, H, this.mode === 'search' ? 'END cancel' : '', this.mode === 'search' ? 'SEND find' : '');
            crt(ctx, W, H);
            return;
        }

        // station name (marquee if long)
        glow(ctx, live);
        ctx.fillStyle = NEON; ctx.font = "bold 28px 'Courier New', monospace";
        ctx.textAlign = 'left';
        marquee(ctx, st.name, 20, 138, W - 40, live ? this._marquee : 0);
        glow(ctx, false);
        ctx.textAlign = 'center';
        ctx.fillStyle = NEON_DIM; ctx.font = "15px 'Courier New', monospace";
        const meta = [st.country, (st.tags || '').split(',')[0], st.bitrate ? st.bitrate + 'k' : '']
            .filter(Boolean).join('  ·  ');
        ctx.fillText(meta || 'live stream', W / 2, 166);

        drawEQ(ctx, W, 188, 296, live, this._t, this._eqSeed);

        ctx.textAlign = 'center';
        if (live) { glow(ctx, true); ctx.fillStyle = NEON; } else ctx.fillStyle = NEON_DIM;
        ctx.font = "bold 18px 'Courier New', monospace";
        const label = live ? '● ON AIR' : this.status === 'tuning' ? 'TUNING' + '.'.repeat(1 + (Math.floor(this._t * 2) % 3))
            : this.status === 'error' ? this.statusMsg : '⏸ PRESS OK TO TUNE IN';
        ctx.fillText(label, W / 2, 318);
        glow(ctx, false);

        // station list
        const top = 348, rowH = 36, bottom = H - 52;
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

        footerBar(ctx, W, H,
            this.mode === 'search' ? 'END exit' : '◄ genre ►',
            this.mode === 'search' ? 'SEND find' : '▲▼ station');
        crt(ctx, W, H);
    }
}

// ---------- HLS support (loaded lazily, only when an .m3u8 stream is tuned) ----------
function isHls(url) { return /\.m3u8(\?|$)/i.test(url || ''); }

let _hlsLib = null;
function loadHlsLib() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (_hlsLib) return _hlsLib;
    _hlsLib = new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = '/vendor/hls.light.min.js';
        s.async = true;
        s.onload = () => resolve(window.Hls || null);
        s.onerror = () => resolve(null); // fail soft: station just shows offline
        document.head.appendChild(s);
    });
    return _hlsLib;
}

// ---------- data ----------
function mapAndDedup(raw) {
    const mapped = raw
        .map((s) => ({
            name: (s.name || 'Unknown').trim(),
            url: s.url_resolved || s.url,
            country: s.countrycode || s.country || '',
            tags: s.tags || '',
            bitrate: s.bitrate || 0,
        }))
        .filter((s) => s.url);
    // prefer https streams (http streams are blocked on https pages)
    mapped.sort((a, b) => (b.url.startsWith('https') ? 1 : 0) - (a.url.startsWith('https') ? 1 : 0));
    const seen = new Set();
    return mapped.filter((s) => (seen.has(s.name) ? false : (seen.add(s.name), true))).slice(0, 50);
}

async function fetchByGenre(genre) {
    const path = genre === 'top'
        ? '/json/stations/topclick/50'
        : `/json/stations/bytagexact/${encodeURIComponent(genre)}?order=clickcount&reverse=true&hidebroken=true&limit=50`;
    return apiGet(path);
}
async function fetchByName(name) {
    return apiGet(`/json/stations/search?name=${encodeURIComponent(name)}&order=clickcount&reverse=true&hidebroken=true&limit=50`);
}
async function apiGet(path) {
    for (const host of API_HOSTS) {
        try {
            const r = await fetch(host + path, { headers: { Accept: 'application/json' } });
            if (!r.ok) continue;
            const out = mapAndDedup(await r.json());
            if (out.length) return out;
        } catch { /* try next host */ }
    }
    return [];
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

