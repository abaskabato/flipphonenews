// Canvas painters for the printed faces: keypad and the external clock LCD.

const NEON = '#39ff14';

export function drawKeypad(ctx, W, H) {
    // brushed-silver base
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#e9e9ec');
    g.addColorStop(0.5, '#bdc0c5');
    g.addColorStop(1, '#d3d5d9');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2;

    // ----- D-pad -----
    const dY = 110, dR = 78;
    ringButton(ctx, cx, dY, dR, '#5a5d63', '#2c2e33');
    // OK center
    circle(ctx, cx, dY, 30, '#2f6fb0', '#1b3f70');
    ctx.fillStyle = '#dcebff';
    ctx.fillStyle = '#d9ecff';
    ctx.font = "bold 22px Arial"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('OK', cx, dY + 1);
    // arrows
    ctx.fillStyle = '#e7e9ec';
    arrow(ctx, cx, dY - dR + 18, 'up');
    arrow(ctx, cx, dY + dR - 18, 'down');
    arrow(ctx, cx - dR + 18, dY, 'left');
    arrow(ctx, cx + dR - 18, dY, 'right');

    // ----- soft keys -----
    softKey(ctx, 40, 60, 92, 40);
    softKey(ctx, W - 132, 60, 92, 40);

    // ----- SEND / END -----
    const callY = dY + dR + 28;
    pill(ctx, cx - 150, callY, 140, 46, '#3fb85b', '#1f8e38', 'SEND');
    pill(ctx, cx + 10, callY, 140, 46, '#ee5a5a', '#a82424', 'END');

    // ----- number grid -----
    const labels = [
        ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
        ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
        ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
        ['*', ''], ['0', '+'], ['#', ''],
    ];
    const cols = 3, gridTop = callY + 70;
    const gap = 18, bw = (W - 80 - gap * 2) / cols, bh = 76;
    labels.forEach((lab, i) => {
        const c = i % cols, r = (i / cols) | 0;
        const x = 40 + c * (bw + gap);
        const y = gridTop + r * (bh + gap);
        key(ctx, x, y, bw, bh, lab[0], lab[1]);
    });
}

// external display showing a short message (the brand + current place codename)
export function drawExtMessage(ctx, W, H, title, sub) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b2a12');
    g.addColorStop(1, '#05140a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = NEON;
    ctx.shadowColor = 'rgba(57,255,20,0.8)';
    ctx.shadowBlur = 10;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "bold 30px 'Courier New', monospace";
    ctx.fillText(title, W / 2, sub ? H * 0.38 : H * 0.5);
    if (sub) {
        ctx.font = "bold 36px 'Courier New', monospace";
        ctx.fillText(sub, W / 2, H * 0.66);
    }
    ctx.shadowBlur = 0;

    ctx.globalAlpha = 0.1; ctx.fillStyle = '#000';
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);
    ctx.globalAlpha = 1;
}

// ---------- primitives ----------
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function key(ctx, x, y, w, h, num, abc) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.55, '#dcdde0');
    g.addColorStop(1, '#bcbec3');
    roundRect(ctx, x, y, w, h, 14);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#23252b';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = "bold 34px Arial";
    ctx.fillText(num, x + w / 2, y + h * 0.4);
    if (abc) {
        ctx.fillStyle = '#7b7e85';
        ctx.font = "bold 14px Arial";
        ctx.fillText(abc, x + w / 2, y + h * 0.76);
    }
}

function pill(ctx, x, y, w, h, c1, c2, label) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = "bold 22px Arial"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
}

function softKey(ctx, x, y, w, h) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#cfd1d6'); g.addColorStop(1, '#9a9da3');
    roundRect(ctx, x, y, w, h, 12);
    ctx.fillStyle = g; ctx.fill();
}

function ringButton(ctx, cx, cy, r, c1, c2) {
    const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.2, cx, cy, r);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
}

function circle(ctx, cx, cy, r, c1, c2) {
    const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.2, cx, cy, r);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
}

function arrow(ctx, x, y, dir) {
    const s = 9;
    ctx.beginPath();
    if (dir === 'up') { ctx.moveTo(x, y - s); ctx.lineTo(x - s, y + s); ctx.lineTo(x + s, y + s); }
    if (dir === 'down') { ctx.moveTo(x, y + s); ctx.lineTo(x - s, y - s); ctx.lineTo(x + s, y - s); }
    if (dir === 'left') { ctx.moveTo(x - s, y); ctx.lineTo(x + s, y - s); ctx.lineTo(x + s, y + s); }
    if (dir === 'right') { ctx.moveTo(x + s, y); ctx.lineTo(x - s, y - s); ctx.lineTo(x - s, y + s); }
    ctx.closePath();
    ctx.fill();
}
