// DEAD DROP — leave a message buried at a place (or sealed until a date).
// Reading what others left is free; leaving one of your own costs (Stripe).
// Rendered as a state machine on the phone's green LCD.
import {
    NEON, NEON_DIM, lcdBackground, headerBar, footerBar, crt, wrapText, roundRect, glow,
} from './lcd.js';
import { locate, codename } from './geo.js';

const MAX_LEN = 240;

// unlock options for a sealed "capsule" drop, in months from now
const CAPSULE_STEPS = [1, 3, 6, 12, 24, 60];

// price in cents — reading is free, leaving costs
const PRICE = { now: 100, capsule: 300 };

export class DeadDrop {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.state = 'scan';
        this.gh = '';
        this.place = '';
        this.drops = [];
        this.sel = 0;
        this.scroll = 0;
        this.draft = '';
        this.unlock = 'now';        // 'now' | 'capsule'
        this.capsuleIdx = 3;        // index into CAPSULE_STEPS
        this.status = '';
        this._t = 0;
        this.me = loadHandle();
    }

    // ---------- lifecycle ----------
    async enter() {
        if (this.gh) { this.draw(); return; }
        this.state = 'scan';
        this.status = 'TRIANGULATING';
        this.draw();
        try {
            const fix = await locate();
            this.gh = fix.gh;
        } catch {
            this.gh = 'nosignl';     // graceful: a shared "no-signal" cell
        }
        this.place = codename(this.gh);
        await this.refresh();
        this.state = 'list';
        this.draw();
    }

    exit() {}

    async refresh() {
        this.drops = await loadDrops(this.gh);
        if (this.sel >= this.drops.length) this.sel = Math.max(0, this.drops.length - 1);
    }

    update(dt) { this._t += dt; this.draw(); }

    // ---------- semantic actions (shared by keyboard + on-screen buttons) ----------
    nav(dir) {
        if (this.state === 'list') {
            if (dir === 'up') this.sel = Math.max(0, this.sel - 1);
            if (dir === 'down') this.sel = Math.min(this.drops.length - 1, this.sel + 1);
        } else if (this.state === 'read') {
            if (dir === 'up') this.scroll = Math.max(0, this.scroll - 1);
            if (dir === 'down') this.scroll++;
        } else if (this.state === 'unlock') {
            if (dir === 'up' || dir === 'down') this.unlock = this.unlock === 'now' ? 'capsule' : 'now';
            if (this.unlock === 'capsule') {
                if (dir === 'right') this.capsuleIdx = Math.min(CAPSULE_STEPS.length - 1, this.capsuleIdx + 1);
                if (dir === 'left') this.capsuleIdx = Math.max(0, this.capsuleIdx - 1);
            }
        }
        this.draw();
    }

    // right soft-key / "OK" — advance
    async primary() {
        switch (this.state) {
            case 'list':
                if (this.drops.length) { this.scroll = 0; this.state = 'read'; }
                else this.startCompose();
                break;
            case 'read': this.startCompose(); break;
            case 'compose':
                if (this.draft.trim()) this.state = 'unlock';
                break;
            case 'unlock': this.state = 'pay'; break;
            case 'pay': await this.pay(); break;
            case 'confirm': this.draft = ''; await this.refresh(); this.state = 'list'; break;
        }
        this.draw();
    }

    // left soft-key — go back / cancel
    back() {
        switch (this.state) {
            case 'read': this.state = 'list'; break;
            case 'compose': this.state = this.drops.length ? 'list' : 'list'; break;
            case 'unlock': this.state = 'compose'; break;
            case 'pay': this.state = 'unlock'; break;
            case 'confirm': this.draft = ''; this.state = 'list'; break;
        }
        this.draw();
    }

    startCompose() { this.draft = ''; this.state = 'compose'; this.draw(); }

    // ---------- text input ----------
    type(ch) {
        if (this.state !== 'compose') return;
        if (this.draft.length < MAX_LEN) this.draft += ch;
        this.draw();
    }
    appendText(s) {
        if (this.state !== 'compose') return;
        this.draft = (this.draft + s).slice(0, MAX_LEN);
        this.draw();
    }
    backspace() {
        if (this.state === 'compose') { this.draft = this.draft.slice(0, -1); this.draw(); }
    }

    handleKey(e) {
        const k = e.key;
        if (k === 'ArrowUp') { this.nav('up'); e.preventDefault(); }
        else if (k === 'ArrowDown') { this.nav('down'); e.preventDefault(); }
        else if (k === 'ArrowLeft') { this.nav('left'); e.preventDefault(); }
        else if (k === 'ArrowRight') { this.nav('right'); e.preventDefault(); }
        else if (k === 'Enter') { this.primary(); e.preventDefault(); }
        else if (k === 'Escape') { this.back(); e.preventDefault(); }
        else if (k === 'Backspace') { this.backspace(); e.preventDefault(); }
        else if (this.state === 'compose' && k.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
            this.type(k); e.preventDefault();
        }
    }

    // ---------- payment ----------
    unlockAt() {
        if (this.unlock === 'now') return Date.now();
        const months = CAPSULE_STEPS[this.capsuleIdx];
        return Date.now() + months * 30 * 24 * 3600 * 1000;
    }
    price() { return PRICE[this.unlock]; }

    async pay() {
        this.state = 'sending';
        this.status = 'OPENING LINE';
        this.draw();
        const drop = {
            message: this.draft.trim().slice(0, MAX_LEN),
            gh: this.gh,
            place: this.place,
            unlockAt: this.unlockAt(),
            author: this.me,
        };
        try {
            // Real path: Stripe Checkout. The drop is persisted by the webhook
            // after payment, then surfaces here on return.
            const r = await fetch('/api/create-drop-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...drop, unlock: this.unlock }),
            });
            if (r.ok) {
                const { url } = await r.json();
                if (url) { window.location.href = url; return; }
            }
            throw new Error('no checkout');
        } catch {
            // Demo path (no Stripe configured): save locally, skip payment.
            saveDemoDrop(drop);
            this.status = 'DEMO · payment skipped';
            this.state = 'confirm';
            this.draw();
        }
    }

    // ---------- rendering ----------
    draw() {
        const ctx = this.ctx;
        const W = this.canvas.width, H = this.canvas.height;
        lcdBackground(ctx, W, H);
        const dispatch = {
            scan: () => this.drawScan(ctx, W, H),
            list: () => this.drawList(ctx, W, H),
            read: () => this.drawRead(ctx, W, H),
            compose: () => this.drawCompose(ctx, W, H),
            unlock: () => this.drawUnlock(ctx, W, H),
            pay: () => this.drawPay(ctx, W, H),
            sending: () => this.drawSending(ctx, W, H),
            confirm: () => this.drawConfirm(ctx, W, H),
        };
        (dispatch[this.state] || dispatch.list)();
        crt(ctx, W, H);
    }

    drawScan(ctx, W, H) {
        headerBar(ctx, W, 'DEAD DROP', '◌ scan');
        const cx = W / 2, cy = H * 0.46;
        // radar sweep
        glow(ctx, true);
        ctx.strokeStyle = NEON_DIM; ctx.lineWidth = 2;
        for (const r of [60, 110, 160]) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); }
        const a = this._t * 2.2;
        ctx.strokeStyle = NEON; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * 160, cy + Math.sin(a) * 160); ctx.stroke();
        glow(ctx, false);
        ctx.fillStyle = NEON; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = "bold 22px 'Courier New', monospace";
        const dots = '.'.repeat(1 + (Math.floor(this._t * 2) % 3));
        ctx.fillText(this.status + dots, cx, H * 0.84);
    }

    drawList(ctx, W, H) {
        headerBar(ctx, W, 'DEAD DROP', this.gh === 'nosignl' ? 'no signal' : '◉ here');
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        // place codename + count
        glow(ctx, true);
        ctx.fillStyle = NEON; ctx.font = "bold 24px 'Courier New', monospace";
        ctx.fillText(this.place, 20, 86);
        glow(ctx, false);
        ctx.fillStyle = NEON_DIM; ctx.font = "15px 'Courier New', monospace";
        const n = this.drops.length;
        ctx.fillText(n ? `${n} drop${n > 1 ? 's' : ''} buried here` : 'nothing buried here yet', 20, 112);

        const top = 140, rowH = 64, bottom = H - 54;
        const rows = Math.floor((bottom - top) / rowH);
        if (!n) {
            ctx.fillStyle = NEON; ctx.font = "17px 'Courier New', monospace";
            wrapLines(ctx, 'Be the first to leave something for whoever stands here next.', W - 40, 20, top + 8, 24);
        } else {
            const start = Math.max(0, Math.min(this.sel - rows + 1, n - rows));
            for (let i = 0; i < rows && start + i < n; i++) {
                const d = this.drops[start + i];
                const y = top + i * rowH;
                const on = (start + i) === this.sel;
                if (on) {
                    ctx.fillStyle = 'rgba(57,255,20,0.14)';
                    ctx.strokeStyle = NEON_DIM; ctx.lineWidth = 1.5;
                    roundRect(ctx, 14, y, W - 28, rowH - 10, 8); ctx.fill(); ctx.stroke();
                }
                ctx.fillStyle = on ? NEON : NEON_DIM;
                ctx.font = on ? "bold 18px 'Courier New', monospace" : "18px 'Courier New', monospace";
                ctx.fillText(teaser(d.message, 26), 26, y + 20);
                ctx.fillStyle = NEON_DIM; ctx.font = "13px 'Courier New', monospace";
                ctx.fillText(`${d.author || 'ANON'} · ${ago(d.createdAt)}`, 26, y + 42);
            }
        }
        footerBar(ctx, W, H, n ? '↑↓ OK read' : '', '✚ leave a drop');
    }

    drawRead(ctx, W, H) {
        const d = this.drops[this.sel];
        if (!d) { this.state = 'list'; return this.drawList(ctx, W, H); }
        headerBar(ctx, W, this.place, ago(d.createdAt));
        ctx.fillStyle = NEON; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.font = "20px 'Courier New', monospace";
        const lines = wrapText(ctx, d.message, W - 40);
        const top = 78, lh = 28, bottom = H - 90;
        const rows = Math.floor((bottom - top) / lh);
        this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, lines.length - rows)));
        glow(ctx, true);
        lines.slice(this.scroll, this.scroll + rows).forEach((ln, i) => ctx.fillText(ln, 20, top + i * lh));
        glow(ctx, false);
        ctx.fillStyle = NEON_DIM; ctx.font = "14px 'Courier New', monospace";
        ctx.fillText(`— left by ${d.author || 'ANON'}`, 20, H - 78);
        if (lines.length > rows) ctx.fillText('↑↓ scroll', W - 110, H - 78);
        footerBar(ctx, W, H, '‹ back', '✚ leave one');
    }

    drawCompose(ctx, W, H) {
        headerBar(ctx, W, 'LEAVE A DROP', `${this.draft.length}/${MAX_LEN}`);
        ctx.fillStyle = NEON_DIM; ctx.font = "14px 'Courier New', monospace";
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(`buried at ${this.place}`, 20, 70);
        ctx.fillStyle = NEON; ctx.font = "20px 'Courier New', monospace";
        const shown = this.draft || 'type your message…';
        glow(ctx, !!this.draft);
        const lines = wrapText(ctx, shown + (this.draft && (Math.floor(this._t * 2) % 2) ? '▌' : ''), W - 40);
        lines.slice(0, 12).forEach((ln, i) => ctx.fillText(ln, 20, 104 + i * 28));
        glow(ctx, false);
        footerBar(ctx, W, H, '‹ cancel', this.draft.trim() ? 'next ›' : '…');
    }

    drawUnlock(ctx, W, H) {
        headerBar(ctx, W, 'WHEN IT OPENS', '');
        const opt = (y, key, title, body) => {
            const on = this.unlock === key;
            if (on) {
                ctx.fillStyle = 'rgba(57,255,20,0.14)'; ctx.strokeStyle = NEON_DIM; ctx.lineWidth = 1.5;
                roundRect(ctx, 14, y, W - 28, 116, 10); ctx.fill(); ctx.stroke();
            }
            ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            ctx.fillStyle = on ? NEON : NEON_DIM;
            ctx.font = "bold 22px 'Courier New', monospace";
            ctx.fillText((on ? '▸ ' : '  ') + title, 24, y + 14);
            ctx.fillStyle = NEON_DIM; ctx.font = "15px 'Courier New', monospace";
            wrapLines(ctx, body, W - 70, 44, y + 48, 22);
        };
        opt(80, 'now', 'OPEN NOW · $1',
            `Anyone who stands at ${this.place} can read it. A note for the next stranger.`);
        const months = CAPSULE_STEPS[this.capsuleIdx];
        opt(212, 'capsule', 'SEAL IT · $3',
            `Locked until ${fmtDate(Date.now() + months * 30 * 86400000)}. A message to the future.`);
        if (this.unlock === 'capsule') {
            ctx.fillStyle = NEON; ctx.font = "bold 18px 'Courier New', monospace";
            ctx.textAlign = 'center';
            ctx.fillText(`‹ ${labelMonths(months)} ›`, W / 2, 348);
        }
        footerBar(ctx, W, H, '‹ back', 'next ›');
    }

    drawPay(ctx, W, H) {
        headerBar(ctx, W, 'PIN IT', '');
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillStyle = NEON_DIM; ctx.font = "14px 'Courier New', monospace";
        ctx.fillText('YOUR DROP', 20, 72);
        ctx.fillStyle = NEON; ctx.font = "18px 'Courier New', monospace";
        glow(ctx, true);
        wrapText(ctx, '"' + this.draft.trim() + '"', W - 40).slice(0, 5)
            .forEach((ln, i) => ctx.fillText(ln, 20, 96 + i * 24));
        glow(ctx, false);
        ctx.strokeStyle = NEON_DIM; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(20, 250); ctx.lineTo(W - 20, 250); ctx.stroke();
        ctx.fillStyle = NEON_DIM; ctx.font = "15px 'Courier New', monospace";
        ctx.fillText('place', 20, 266); ctx.fillText('opens', 20, 296);
        ctx.fillStyle = NEON; ctx.textAlign = 'right';
        ctx.fillText(this.place, W - 20, 266);
        ctx.fillText(this.unlock === 'now' ? 'right now' : fmtDate(this.unlockAt()), W - 20, 296);
        // price
        glow(ctx, true);
        ctx.textAlign = 'center'; ctx.fillStyle = NEON;
        ctx.font = "bold 56px 'Courier New', monospace";
        ctx.fillText('$' + (this.price() / 100).toFixed(0), W / 2, 360);
        glow(ctx, false);
        ctx.fillStyle = NEON_DIM; ctx.font = "13px 'Courier New', monospace";
        ctx.fillText('reading is always free · leaving costs', W / 2, 432);
        footerBar(ctx, W, H, '‹ back', `pay $${(this.price() / 100).toFixed(0)} ›`);
    }

    drawSending(ctx, W, H) {
        headerBar(ctx, W, 'DEAD DROP', '');
        ctx.fillStyle = NEON; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = "bold 24px 'Courier New', monospace";
        const dots = '.'.repeat(1 + (Math.floor(this._t * 2) % 3));
        ctx.fillText(this.status + dots, W / 2, H / 2);
    }

    drawConfirm(ctx, W, H) {
        headerBar(ctx, W, 'DEAD DROP', '');
        glow(ctx, true);
        ctx.fillStyle = NEON; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = "bold 44px 'Courier New', monospace";
        ctx.fillText('PINNED ✓', W / 2, H * 0.34);
        glow(ctx, false);
        ctx.font = "18px 'Courier New', monospace";
        ctx.fillText('buried at ' + this.place, W / 2, H * 0.5);
        ctx.fillStyle = NEON_DIM; ctx.font = "15px 'Courier New', monospace";
        ctx.fillText(this.unlock === 'now' ? 'readable now by anyone here'
            : 'sealed until ' + fmtDate(this.unlockAt()), W / 2, H * 0.58);
        if (this.status) ctx.fillText(this.status, W / 2, H * 0.66);
        footerBar(ctx, W, H, '', 'done ›');
    }
}

// ---------- data layer: backend with localStorage demo fallback ----------
const DEMO_KEY = 'dd:demo:drops';

async function loadDrops(gh) {
    let backend = [];
    try {
        const r = await fetch(`/api/drops?gh=${encodeURIComponent(gh)}`);
        if (r.ok) backend = (await r.json()).drops || [];
    } catch { /* offline / no backend → demo only */ }
    const now = Date.now();
    const demo = readDemo().filter((d) => d.gh === gh && (d.unlockAt || 0) <= now);
    const all = [...backend, ...demo];
    const seen = new Set();
    return all
        .filter((d) => (d.id && seen.has(d.id) ? false : (seen.add(d.id), true)))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function readDemo() {
    try { return JSON.parse(localStorage.getItem(DEMO_KEY) || '[]'); } catch { return []; }
}
function saveDemoDrop(drop) {
    const list = readDemo();
    list.push({ ...drop, id: 'demo-' + Math.random().toString(36).slice(2), createdAt: Date.now() });
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(list.slice(-500))); } catch { /* full */ }
}

function loadHandle() {
    let h = localStorage.getItem('dd:me');
    if (!h) { h = 'ANON·' + Math.random().toString(36).slice(2, 6).toUpperCase(); localStorage.setItem('dd:me', h); }
    return h;
}

// ---------- small format helpers ----------
function teaser(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function ago(ts) {
    if (!ts) return 'now';
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return 'now';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    if (s < 86400 * 30) return Math.floor(s / 86400) + 'd';
    return Math.floor(s / 86400 / 30) + 'mo';
}
function fmtDate(ts) { return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
function labelMonths(m) { return m < 12 ? `${m} month${m > 1 ? 's' : ''}` : `${m / 12} year${m / 12 > 1 ? 's' : ''}`; }
function wrapLines(ctx, text, maxW, x, y, lh) {
    wrapText(ctx, text, maxW).forEach((ln, i) => ctx.fillText(ln, x, y + i * lh));
}
