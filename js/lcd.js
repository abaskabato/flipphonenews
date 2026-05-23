// Shared retro-LCD drawing helpers used by the screen "apps".

export const NEON = '#39ff14';
export const NEON_DIM = 'rgba(57,255,20,0.30)';

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
    ctx.font = "bold 26px 'Courier New', monospace";
    ctx.textAlign = 'left';
    ctx.fillText(left, 22, h / 2);
    ctx.font = "bold 20px 'Courier New', monospace";
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
    ctx.font = "bold 19px 'Courier New', monospace";
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(left, 22, H - h / 2);
    ctx.textAlign = 'right';
    ctx.fillText(right, W - 20, H - h / 2);
}

export function crt(ctx, W, H) {
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = '#000';
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);
    ctx.globalAlpha = 1;
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.78);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.45)');
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
