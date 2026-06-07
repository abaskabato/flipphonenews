// Shared retro-LCD drawing helpers used by the screen "apps".

export const NEON = '#5dff3c';
// secondary text / borders — kept readable (the old 0.30 alpha was nearly
// invisible on the small phone-sized screen)
export const NEON_DIM = 'rgba(90,255,60,0.62)';

export function lcdBackground(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b2a12');
    g.addColorStop(1, '#05140a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
}

export function glow(ctx, on) {
    ctx.shadowColor = on ? 'rgba(57,255,20,0.7)' : 'transparent';
    ctx.shadowBlur = on ? 6 : 0;
}

export function headerBar(ctx, W, left, right, h = 56) {
    glow(ctx, true);
    ctx.fillStyle = NEON;
    ctx.textBaseline = 'middle';
    ctx.font = "bold 32px 'Courier New', monospace";
    ctx.textAlign = 'left';
    ctx.fillText(left, 22, h / 2);
    ctx.font = "bold 22px 'Courier New', monospace";
    ctx.textAlign = 'right';
    ctx.fillText(right, W - 20, h / 2);
    glow(ctx, false);
    ctx.strokeStyle = NEON_DIM;
    ctx.lineWidth = 2;
    hline(ctx, 16, h, W - 16);
    return h;
}

export function footerBar(ctx, W, H, left, right, h = 44) {
    ctx.strokeStyle = NEON_DIM;
    ctx.lineWidth = 2;
    hline(ctx, 16, H - h, W - 16);
    ctx.fillStyle = NEON;
    ctx.font = "bold 22px 'Courier New', monospace";
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(left, 22, H - h / 2);
    ctx.textAlign = 'right';
    ctx.fillText(right, W - 20, H - h / 2);
}

export function crt(ctx, W, H) {
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#000';
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);
    ctx.globalAlpha = 1;
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.78);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.26)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
}

export function hline(ctx, x1, y, x2) {
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
}

export function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// wrap `text` to fit `maxW`, returning an array of lines
export function wrapText(ctx, text, maxW) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
        const test = cur ? cur + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && cur) {
            lines.push(cur);
            cur = w;
        } else {
            cur = test;
        }
    }
    if (cur) lines.push(cur);
    return lines;
}

// draw `text` at (x,y); if it's wider than maxW, scroll it horizontally by
// `offset` pixels (used for long station / episode names while playing).
export function marquee(ctx, text, x, y, maxW, offset) {
    const w = ctx.measureText(text).width;
    if (w <= maxW) { ctx.textAlign = 'left'; ctx.fillText(text, x, y); return; }
    const span = w + 60;
    const o = offset % span;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y - 24, maxW, 48); ctx.clip();
    ctx.textAlign = 'left';
    ctx.fillText(text, x - o, y);
    ctx.fillText(text, x - o + span, y);
    ctx.restore();
}

// 4-segment signal meter string, e.g. ▮▮▯▯
export function signalBars(level) { return '▮'.repeat(level) + '▯'.repeat(4 - level); }

// collapse whitespace and ellipsize `s` to at most `n` chars
export function clip(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

// small seeded PRNG so two players get the same food sequence
export function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
