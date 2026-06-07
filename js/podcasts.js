// FLIPCAST · PODCASTS band. On-demand shows and episodes, tuned on the same
// flip-phone LCD as the live radio. Data comes from Apple's public iTunes
// Search/Lookup APIs (no key, no backend, CORS-enabled): browse top shows by
// category, search by name, then drill into a show's episodes and play them
// with a scrubbable progress bar — Spotify-style, retro-green.
import {
    NEON, NEON_DIM, lcdBackground, headerBar, footerBar, crt, roundRect, glow,
    marquee, signalBars, clip,
} from './lcd.js';

// UI category -> Apple podcast genre id (used by the toppodcasts chart feed).
const CATEGORIES = [
    { key: 'top', genre: 26 },
    { key: 'news', genre: 1489 },
    { key: 'comedy', genre: 1303 },
    { key: 'true crime', genre: 1488 },
    { key: 'business', genre: 1321 },
    { key: 'technology', genre: 1318 },
    { key: 'sports', genre: 1545 },
    { key: 'society', genre: 1324 },
    { key: 'health', genre: 1512 },
    { key: 'science', genre: 1533 },
    { key: 'history', genre: 1487 },
    { key: 'education', genre: 1304 },
];

// T9 multi-tap letter cycles for the numeric keypad (matches the radio band)
const T9 = {
    1: '1', 2: 'abc2', 3: 'def3', 4: 'ghi4', 5: 'jkl5',
    6: 'mno6', 7: 'pqrs7', 8: 'tuv8', 9: 'wxyz9', 0: ' 0', '*': '.', '#': '#',
};
const T9_WINDOW = 900;
const MAX_QUERY = 40;
const SKIP = 30; // seek step in seconds

export class Podcasts {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.audio = null;
        this.mode = 'browse';       // 'browse' | 'search'
        this.view = 'shows';        // 'shows' | 'episodes'
        this.catIdx = 0;
        this.shows = [];
        this.showSel = 0;
        this.show = null;           // the opened show (in episodes view)
        this.episodes = [];
        this.epSel = 0;
        this.playingEp = null;      // episode object currently loaded into <audio>
        this.query = '';
        this.searchLabel = '';
        this.status = 'idle';       // 'loading' | 'idle' | 'tuning' | 'live' | 'error'
        this.statusMsg = 'PODCASTS';
        this.cur = 0; this.dur = 0; // playback position / duration (seconds)
        this._t9 = null;
        this._t = 0;
        this._marquee = 0;
        this.active = true;
        this.onSearchOpen = null;
    }

    setAudio(el) {
        this.audio = el;
        el.addEventListener('playing', () => { if (!this.active) return; this.status = 'live'; });
        el.addEventListener('waiting', () => { if (!this.active) return; this.status = 'tuning'; });
        el.addEventListener('stalled', () => { if (!this.active) return; this.status = 'tuning'; });
        el.addEventListener('error', () => { if (this.active && this.audio.src) { this.status = 'error'; this.statusMsg = 'EPISODE OFFLINE'; } });
        el.addEventListener('pause', () => { if (this.active && this.status === 'live') this.status = 'idle'; });
        el.addEventListener('ended', () => { if (this.active) this.status = 'idle'; });
        el.addEventListener('loadedmetadata', () => { if (this.active) this.dur = el.duration || 0; });
        el.addEventListener('timeupdate', () => { if (this.active) { this.cur = el.currentTime || 0; this.dur = el.duration || this.dur; } });
    }

    get category() { return CATEGORIES[this.catIdx].key; }
    get genre() { return this.category; }           // external-display compatibility
    get current() { return this.view === 'shows' ? this.shows[this.showSel] : this.episodes[this.epSel]; }
    get list() { return this.view === 'shows' ? this.shows : this.episodes; }
    get sel() { return this.view === 'shows' ? this.showSel : this.epSel; }
    set sel(v) { if (this.view === 'shows') this.showSel = v; else this.epSel = v; }

    // ---------- lifecycle ----------
    async enter() {
        if (this.shows.length) { this.draw(); return; }
        await this.loadCategory(this.catIdx);
    }
    exit() { this.stop(); }
    update(dt) {
        this._t += dt;
        if (this._t9 && performance.now() - this._t9.time > T9_WINDOW) this._t9 = null;
        if (this.status === 'live') this._marquee += dt * 60;
        this.draw();
    }

    async loadCategory(idx) {
        this.mode = 'browse';
        this.view = 'shows';
        this.catIdx = (idx + CATEGORIES.length) % CATEGORIES.length;
        this.status = 'loading';
        this.statusMsg = 'LOADING ' + this.category.toUpperCase();
        this.draw();
        this.shows = await fetchTopShows(CATEGORIES[this.catIdx].genre);
        this.showSel = 0;
        this._marquee = 0;
        this.status = 'idle';
        this.draw();
    }

    // ---------- search ----------
    openSearch() {
        this.mode = 'search';
        this.view = 'shows';
        this.query = '';
        this._t9 = null;
        if (this.onSearchOpen) this.onSearchOpen();
        this.draw();
    }
    closeSearch() { this.mode = 'browse'; this._t9 = null; this.draw(); }
    typeChar(ch) {
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
        this.view = 'shows';
        this.status = 'loading';
        this.statusMsg = 'SEARCHING';
        this.draw();
        this.shows = await fetchShowsByName(q);
        this.searchLabel = q;
        this.showSel = 0;
        this._marquee = 0;
        this.status = 'idle';
        this.draw();
    }

    // ---------- shows -> episodes ----------
    async openShow(show) {
        if (!show) return;
        this.show = show;
        this.view = 'episodes';
        this.episodes = [];
        this.epSel = 0;
        this.status = 'loading';
        this.statusMsg = 'FETCHING EPISODES';
        this.draw();
        this.episodes = await fetchEpisodes(show.id);
        this.epSel = 0;
        this._marquee = 0;
        this.status = 'idle';
        this.draw();
    }
    backToShows() {
        this.stop();
        this.playingEp = null;
        this.view = 'shows';
        this._marquee = 0;
        this.draw();
    }

    // ---------- navigation / transport ----------
    nav(dir) {
        if (dir === 'left' || dir === 'right') {
            const step = dir === 'right' ? 1 : -1;
            if (this.view === 'episodes') {     // scrub the current episode
                this.seek(step * SKIP);
                return;
            }
            if (this.mode === 'search') return; // categories only when browsing
            this.stop();
            this.loadCategory(this.catIdx + step);
            return;
        }
        const list = this.list;
        if (!list.length) return;
        const n = list.length;
        if (dir === 'up') this.sel = (this.sel - 1 + n) % n;
        if (dir === 'down') this.sel = (this.sel + 1) % n;
        this._marquee = 0;
        this.draw();
    }

    primary() {                     // OK
        if (this.mode === 'search' && this.query && this.shows.length === 0) { this.submitSearch(); return; }
        if (this.view === 'shows') { this.openShow(this.current); return; }
        const ep = this.current;
        if (!ep) return;
        const isCurrent = this.playingEp === ep;
        if (isCurrent && (this.status === 'live' || this.status === 'tuning')) this.audio.pause();
        else if (isCurrent && this.audio && this.audio.src) { this._startPlay(); }   // resume
        else this.tune(ep);
        this.draw();
    }

    seek(delta) {
        if (!this.audio || !this.audio.src || !this.dur) return;
        this.audio.currentTime = Math.max(0, Math.min(this.dur, (this.audio.currentTime || 0) + delta));
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
            case 'END':
                if (this.mode === 'search') this.closeSearch();
                else if (this.view === 'episodes') this.backToShows();
                else this.stop();
                this.draw();
                break;
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
        if (k === 'ArrowUp') { this.nav('up'); e.preventDefault(); }
        else if (k === 'ArrowDown') { this.nav('down'); e.preventDefault(); }
        else if (k === 'ArrowLeft') { this.nav('left'); e.preventDefault(); }
        else if (k === 'ArrowRight') { this.nav('right'); e.preventDefault(); }
        else if (k === 'Enter' || k === ' ') { this.primary(); e.preventDefault(); }
        else if (k === 'Escape') { this.view === 'episodes' ? this.backToShows() : this.stop(); this.draw(); e.preventDefault(); }
        else if (k === '/') { this.openSearch(); e.preventDefault(); }
        else if (k.length === 1 && /[a-z0-9]/i.test(k) && !e.metaKey && !e.ctrlKey && !e.altKey) {
            this.openSearch(); this.typeChar(k); e.preventDefault();
        }
    }

    back() { this.view === 'episodes' ? this.backToShows() : this.stop(); this.draw(); }

    // Land on an episode carried in by a share link, optionally at a timestamp
    // ("share the moment"). Shown as a one-item list; autoplay may be blocked
    // until the visitor taps OK, at which point the seek still applies.
    playSharedEpisode(ep, showName, seekTo) {
        if (!ep || !ep.url) return;
        this.mode = 'browse';
        this.view = 'episodes';
        this.show = showName ? { name: showName } : null;
        this.episodes = [ep];
        this.epSel = 0;
        this._marquee = 0;
        this.status = 'idle';
        this._seekTo = seekTo || 0;
        this.draw();
        this.tune(ep);
    }

    tune(ep) {
        if (!this.audio || !ep || !ep.url) return;
        this.status = 'tuning';
        this.statusMsg = 'LOADING';
        this.playingEp = ep;
        this.cur = 0; this.dur = ep.duration || 0;
        // honour a pending share-link timestamp once the stream reports duration
        const seekTo = this._seekTo; this._seekTo = 0;
        if (seekTo > 0) {
            const onMeta = () => {
                try { this.audio.currentTime = seekTo; this.cur = seekTo; } catch { /* noop */ }
                this.audio.removeEventListener('loadedmetadata', onMeta);
            };
            this.audio.addEventListener('loadedmetadata', onMeta);
        }
        try {
            this.audio.src = ep.url;
            this.audio.load();
            this._startPlay();
        } catch { this.status = 'error'; this.statusMsg = 'EPISODE OFFLINE'; }
    }
    _startPlay() {
        const p = this.audio.play();
        if (p && p.catch) p.catch(() => { this.status = 'error'; this.statusMsg = 'TAP OK TO PLAY'; this.draw(); });
    }
    stop() {
        if (this.audio) { try { this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); } catch { /* noop */ } }
        if (this.status !== 'loading') this.status = 'idle';
        this.cur = 0;
    }

    // ---------- rendering ----------
    draw() {
        const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
        lcdBackground(ctx, W, H);
        const live = this.status === 'live';
        headerBar(ctx, W, 'PODCASTS', this.mode === 'search' ? 'SEARCH' : signalBars(live ? 4 : (this.status === 'tuning' ? 2 : 1)));

        // sub-bar: search box, episode-view show name, or category dial
        if (this.mode === 'search') {
            ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.strokeStyle = NEON_DIM; ctx.lineWidth = 1.5;
            roundRect(ctx, 16, 68, W - 32, 36, 8); ctx.stroke();
            glow(ctx, true);
            ctx.fillStyle = NEON; ctx.font = "18px 'Courier New', monospace";
            const cur = (Math.floor(this._t * 2) % 2) ? '▌' : ' ';
            ctx.fillText('search: ' + (this.query || '') + cur, 28, 87);
            glow(ctx, false);
        } else if (this.view === 'episodes') {
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = NEON_DIM; ctx.font = "bold 19px 'Courier New', monospace";
            ctx.fillText('↩ ' + clip(this.show ? this.show.name : '', 30), W / 2, 86);
        } else {
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = NEON_DIM; ctx.font = "bold 20px 'Courier New', monospace";
            ctx.fillText('◄  ' + this.category.toUpperCase() + '  ►', W / 2, 86);
        }

        if (this.status === 'loading') {
            ctx.fillStyle = NEON; ctx.textAlign = 'center'; ctx.font = "bold 22px 'Courier New', monospace";
            const dots = '.'.repeat(1 + (Math.floor(this._t * 2) % 3));
            ctx.fillText(this.statusMsg + dots, W / 2, H * 0.5);
            crt(ctx, W, H);
            return;
        }

        if (this.view === 'episodes') this._drawEpisodes(ctx, W, H, live);
        else this._drawShows(ctx, W, H);

        crt(ctx, W, H);
    }

    _drawShows(ctx, W, H) {
        const st = this.current;
        if (!st) {
            ctx.fillStyle = NEON_DIM; ctx.textAlign = 'center'; ctx.font = "18px 'Courier New', monospace";
            ctx.fillText(this.mode === 'search' ? 'type a name · SEND to search' : 'no shows', W / 2, H * 0.5);
            footerBar(ctx, W, H, this.mode === 'search' ? 'END cancel' : '', this.mode === 'search' ? 'SEND find' : '');
            return;
        }
        glow(ctx, false);
        ctx.fillStyle = NEON; ctx.font = "bold 32px 'Courier New', monospace"; ctx.textAlign = 'left';
        marquee(ctx, st.name, 20, 138, W - 40, this._marquee);
        ctx.textAlign = 'center';
        ctx.fillStyle = NEON_DIM; ctx.font = "bold 18px 'Courier New', monospace";
        ctx.fillText(clip(st.artist || 'podcast', 38), W / 2, 168);
        ctx.fillStyle = NEON; ctx.font = "bold 20px 'Courier New', monospace";
        ctx.fillText('▸ OK FOR EPISODES', W / 2, 208);

        this._drawList(ctx, W, H, this.shows, this.showSel, 248, (s) => s.name);
        footerBar(ctx, W, H,
            this.mode === 'search' ? 'END exit' : '◄ category ►',
            this.mode === 'search' ? 'SEND find' : '▲▼ show · OK open');
    }

    _drawEpisodes(ctx, W, H, live) {
        const ep = this.current;
        if (!ep) {
            ctx.fillStyle = NEON_DIM; ctx.textAlign = 'center'; ctx.font = "18px 'Courier New', monospace";
            ctx.fillText('no episodes', W / 2, H * 0.5);
            footerBar(ctx, W, H, 'END back', '');
            return;
        }
        const playingThis = this.playingEp === ep;
        glow(ctx, live && playingThis);
        ctx.fillStyle = NEON; ctx.font = "bold 29px 'Courier New', monospace"; ctx.textAlign = 'left';
        marquee(ctx, ep.name, 20, 134, W - 40, (live && playingThis) ? this._marquee : 0);
        glow(ctx, false);
        ctx.textAlign = 'center';
        ctx.fillStyle = NEON_DIM; ctx.font = "bold 17px 'Courier New', monospace";
        const meta = [ep.date, fmtDur(ep.duration)].filter(Boolean).join('  ·  ');
        ctx.fillText(meta || 'episode', W / 2, 162);

        // progress bar (only meaningful for the loaded episode)
        const shownCur = playingThis ? this.cur : 0;
        const shownDur = playingThis ? this.dur : (ep.duration || 0);
        drawProgress(ctx, W, 196, shownCur, shownDur, live && playingThis);

        ctx.textAlign = 'center';
        if (live && playingThis) { glow(ctx, true); ctx.fillStyle = NEON; } else ctx.fillStyle = NEON_DIM;
        ctx.font = "bold 22px 'Courier New', monospace";
        const label = (playingThis && live) ? '● PLAYING'
            : (playingThis && this.status === 'tuning') ? 'LOADING' + '.'.repeat(1 + (Math.floor(this._t * 2) % 3))
            : (playingThis && this.status === 'error') ? this.statusMsg
            : (playingThis && this.status === 'idle' && this.cur > 0) ? '⏸ PAUSED · OK TO RESUME'
            : '▸ PRESS OK TO PLAY';
        ctx.fillText(label, W / 2, 250);
        glow(ctx, false);

        this._drawList(ctx, W, H, this.episodes, this.epSel, 288, (e) => e.name);
        footerBar(ctx, W, H, 'END back', live ? '◄◄ 30s ►►' : '▲▼ episode · OK play');
    }

    // shared scrolling list (shows or episodes)
    _drawList(ctx, W, H, items, selIdx, top, labelOf) {
        const rowH = 38, bottom = H - 52;
        const rows = Math.floor((bottom - top) / rowH);
        const n = items.length;
        const start = Math.max(0, Math.min(selIdx - (rows >> 1), n - rows));
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        for (let i = 0; i < rows && start + i < n; i++) {
            const it = items[start + i];
            const y = top + i * rowH;
            const on = (start + i) === selIdx;
            if (on) {
                ctx.fillStyle = 'rgba(57,255,20,0.14)'; ctx.strokeStyle = NEON_DIM; ctx.lineWidth = 1.5;
                roundRect(ctx, 14, y - rowH / 2 + 3, W - 28, rowH - 6, 7); ctx.fill(); ctx.stroke();
            }
            ctx.fillStyle = on ? NEON : NEON_DIM;
            ctx.font = "bold " + (on ? '18' : '17') + "px 'Courier New', monospace";
            ctx.fillText((on ? '▸ ' : '  ') + clip(labelOf(it), 29), 22, y);
        }
    }
}

// ---------- draw helpers ----------
function drawProgress(ctx, W, y, cur, dur, live) {
    const pad = 24, h = 8, x = pad, w = W - pad * 2;
    const frac = dur > 0 ? Math.max(0, Math.min(1, cur / dur)) : 0;
    glow(ctx, false);
    ctx.fillStyle = NEON_DIM;
    roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
    glow(ctx, live);
    ctx.fillStyle = NEON;
    if (frac > 0) { roundRect(ctx, x, y, Math.max(h, w * frac), h, h / 2); ctx.fill(); }
    if (frac > 0) { ctx.beginPath(); ctx.arc(x + w * frac, y + h / 2, 6, 0, Math.PI * 2); ctx.fill(); }
    glow(ctx, false);
    ctx.fillStyle = NEON_DIM; ctx.font = "bold 16px 'Courier New', monospace"; ctx.textBaseline = 'top';
    ctx.textAlign = 'left'; ctx.fillText(fmtTime(cur), x, y + 15);
    ctx.textAlign = 'right'; ctx.fillText(dur > 0 ? fmtTime(dur) : '--:--', x + w, y + 15);
}

function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const mm = h ? String(m).padStart(2, '0') : String(m);
    return (h ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0');
}
function fmtDur(sec) { return sec ? fmtTime(sec) : ''; }

// ---------- data (Apple iTunes Search/Lookup — public, keyless, CORS-enabled) ----------
const SEARCH = 'https://itunes.apple.com';

function mapShow(r) {
    return {
        id: r.collectionId || r.id,
        name: (r.collectionName || r.trackName || 'Unknown').trim(),
        artist: (r.artistName || '').trim(),
    };
}

async function fetchTopShows(genreId) {
    // ranked chart of shows for a category, then enriched is unnecessary — the
    // chart entries already carry the collection id we need to fetch episodes.
    try {
        const r = await fetch(`${SEARCH}/us/rss/toppodcasts/limit=40/genre=${genreId}/json`);
        if (r.ok) {
            const data = await r.json();
            const entries = (data.feed && data.feed.entry) || [];
            const out = entries.map((e) => ({
                id: e.id && e.id.attributes && e.id.attributes['im:id'],
                name: (e['im:name'] && e['im:name'].label || 'Unknown').trim(),
                artist: (e['im:artist'] && e['im:artist'].label || '').trim(),
            })).filter((s) => s.id);
            if (out.length) return out;
        }
    } catch { /* fall through to search */ }
    // fallback: a plain podcast search still returns usable shows
    return fetchShowsByName('podcast');
}

async function fetchShowsByName(name) {
    try {
        const r = await fetch(`${SEARCH}/search?media=podcast&term=${encodeURIComponent(name)}&limit=40`);
        if (!r.ok) return [];
        const data = await r.json();
        const seen = new Set();
        return (data.results || [])
            .map(mapShow)
            .filter((s) => s.id && (seen.has(s.id) ? false : (seen.add(s.id), true)));
    } catch { return []; }
}

async function fetchEpisodes(collectionId) {
    if (!collectionId) return [];
    try {
        const r = await fetch(`${SEARCH}/lookup?id=${encodeURIComponent(collectionId)}&media=podcast&entity=podcastEpisode&limit=60`);
        if (!r.ok) return [];
        const data = await r.json();
        return (data.results || [])
            .filter((x) => x.wrapperType === 'podcastEpisode' && x.episodeUrl)
            .map((x) => ({
                name: (x.trackName || 'Episode').trim(),
                url: x.episodeUrl,
                duration: x.trackTimeMillis ? Math.round(x.trackTimeMillis / 1000) : 0,
                date: x.releaseDate ? x.releaseDate.slice(0, 10) : '',
            }));
    } catch { return []; }
}
