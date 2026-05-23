// Live Hacker News ticker rendered onto a CanvasTexture used as the LCD.

const HN_TOP = 'https://hacker-news.firebaseio.com/v0/topstories.json';
const HN_ITEM = (id) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;

const FALLBACK = [
    'Show HN: I rebuilt my phone in WebGL',
    'The lost art of the clamshell hinge',
    'Why retro LCD green is the perfect UI color',
    'Ask HN: what did you carry in 2003?',
    'A serverless news ticker in 100 lines',
    'Stripe webhooks, explained simply',
    'Three.js tips for buttery 60fps',
    'The economics of tiny ad billboards',
];

const NEON = '#39ff14';
const NEON_DIM = 'rgba(57,255,20,0.30)';

export class NewsTicker {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.headlines = FALLBACK.slice();
        this.scroll = 0;
        this.speed = 26;          // px per second
        this.lineGap = 10;
        this.updatedAt = new Date();
        this._lines = [];
        this._relayout();
    }

    setHeadlines(list) {
        if (Array.isArray(list) && list.length) {
            this.headlines = list;
            this.updatedAt = new Date();
            this.scroll = 0;
            this._relayout();
        }
    }

    // pre-wrap each headline into 1–2 lines that fit the screen width
    _relayout() {
        const ctx = this.ctx;
        ctx.font = "bold 26px 'Courier New', monospace";
        const maxW = this.canvas.width - 56;
        this._lines = [];
        this.headlines.forEach((title, i) => {
            const wrapped = wrap(ctx, `▶ ${title}`, maxW, 2);
            wrapped.forEach((t, j) => this._lines.push({ text: t, head: j === 0, idx: i }));
            this._lines.push({ text: '', head: false, idx: -1 }); // spacer
        });
    }

    update(dt) {
        this.scroll += this.speed * dt;
        this.draw();
    }

    draw() {
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;

        // ---- LCD background ----
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#0b2a12');
        bg.addColorStop(1, '#05140a');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        const headerH = 64;
        const footerH = 52;

        // ---- header ----
        ctx.fillStyle = NEON;
        ctx.shadowColor = 'rgba(57,255,20,0.8)';
        ctx.shadowBlur = 8;
        ctx.font = "bold 30px 'Courier New', monospace";
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText('FLIPNEWS', 24, headerH / 2);
        ctx.textAlign = 'right';
        ctx.font = "bold 22px 'Courier New', monospace";
        ctx.fillText(clock(this.updatedAt) + '  ☰', W - 22, headerH / 2);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = NEON_DIM;
        ctx.lineWidth = 2;
        line(ctx, 18, headerH, W - 18, headerH);

        // ---- scrolling body (clipped) ----
        const top = headerH + 12;
        const bottom = H - footerH - 8;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, top, W, bottom - top);
        ctx.clip();

        const lineH = 30 + this.lineGap;
        const total = this._lines.length * lineH;
        ctx.shadowColor = 'rgba(57,255,20,0.6)';
        ctx.shadowBlur = 6;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        for (let pass = 0; pass < 2; pass++) {
            const base = top - (this.scroll % total) + pass * total;
            this._lines.forEach((ln, i) => {
                const y = base + i * lineH;
                if (y < top - lineH || y > bottom) return;
                if (!ln.text) return;
                ctx.font = ln.head
                    ? "bold 26px 'Courier New', monospace"
                    : "26px 'Courier New', monospace";
                ctx.fillStyle = NEON;
                ctx.fillText(ln.text, ln.head ? 22 : 44, y);
            });
        }
        ctx.restore();
        ctx.shadowBlur = 0;

        // ---- footer soft keys ----
        ctx.strokeStyle = NEON_DIM;
        line(ctx, 18, H - footerH, W - 18, H - footerH);
        ctx.fillStyle = NEON;
        ctx.font = "bold 20px 'Courier New', monospace";
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText('‹ MENU', 24, H - footerH / 2);
        ctx.textAlign = 'right';
        ctx.fillText('LIVE · HN ›', W - 22, H - footerH / 2);

        // ---- CRT scanlines + vignette ----
        ctx.globalAlpha = 0.10;
        ctx.fillStyle = '#000';
        for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);
        ctx.globalAlpha = 1;
        const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.75);
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(1, 'rgba(0,0,0,0.45)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, W, H);
    }
}

// fetch the current top HN headlines (CORS-friendly public API)
export async function fetchHeadlines(count = 12) {
    const ids = await fetchJSON(HN_TOP);
    if (!Array.isArray(ids)) throw new Error('bad topstories');
    const items = await Promise.all(
        ids.slice(0, count).map((id) => fetchJSON(HN_ITEM(id)).catch(() => null))
    );
    const titles = items
        .filter((it) => it && it.title)
        .map((it) => clean(it.title));
    if (!titles.length) throw new Error('no titles');
    return titles;
}

async function fetchJSON(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    return res.json();
}

// trim overly long headlines so they read well on a tiny screen
function clean(t) {
    t = t.replace(/\s+/g, ' ').trim();
    return t.length > 64 ? t.slice(0, 61).trimEnd() + '…' : t;
}

function wrap(ctx, text, maxW, maxLines) {
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
        const test = cur ? cur + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && cur) {
            lines.push(cur);
            cur = w;
            if (lines.length === maxLines - 1) break;
        } else {
            cur = test;
        }
    }
    if (cur && lines.length < maxLines) lines.push(cur);
    // if text remained, ellipsize the last line
    return lines;
}

function line(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
}

function clock(d) {
    return d.toTimeString().slice(0, 5);
}
