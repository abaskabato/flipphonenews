// "Text from 2003" — render a nostalgic SMS thread on the green LCD.
import { NEON, NEON_DIM, lcdBackground, headerBar, footerBar, crt, roundRect, wrapText, glow } from './lcd.js';

// themed canned threads (template "generation", no network needed)
export const PRESETS = {
    Crush: {
        contact: 'CRUSH ♥',
        messages: [
            { me: false, t: 'hey :) what r u up 2' },
            { me: true, t: 'nm just chillin u?' },
            { me: false, t: 'wanna come 2 the mall l8r?' },
            { me: true, t: 'omg yes!! brb asking my mom' },
            { me: false, t: 'k txt me back. ttyl ;)' },
        ],
    },
    Mom: {
        contact: 'MOM',
        messages: [
            { me: false, t: 'WHERE ARE YOU' },
            { me: true, t: 'at jakes house mom relax' },
            { me: false, t: 'dinner is at 6. DO NOT be late' },
            { me: true, t: 'ok ok omw' },
            { me: false, t: 'how do i turn off the caps. HELLO' },
        ],
    },
    Nokia: {
        contact: 'NOKIA 3310',
        messages: [
            { me: false, t: 'Battery: 4 bars (still). day 6.' },
            { me: true, t: 'unbreakable king 👑' },
            { me: false, t: 'New high score on Snake: 247' },
            { me: true, t: 'no way send proof' },
            { me: false, t: 'cant. no camera. its 2003' },
        ],
    },
    Y2K: {
        contact: 'DAD',
        messages: [
            { me: false, t: 'is the computer going to explode at midnight' },
            { me: true, t: 'dad its march. y2k was 3 yrs ago' },
            { me: false, t: 'cant be too careful. i bought 40 cans of beans' },
            { me: true, t: '...' },
        ],
    },
};

export class TextsApp {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.contact = 'CRUSH ♥';
        this.messages = PRESETS.Crush.messages.slice();
        this.sent = false;
        this._t = 0;
    }

    setPreset(name) {
        const p = PRESETS[name];
        if (!p) return;
        this.contact = p.contact;
        this.messages = p.messages.map((m) => ({ ...m }));
        this.sent = false;
    }
    setContact(name) { this.contact = (name || 'CONTACT').toUpperCase().slice(0, 16); }
    add(me, text) {
        const t = String(text || '').trim();
        if (t) this.messages.push({ me, t: t.slice(0, 80) });
        this.sent = false;
    }
    pop() { this.messages.pop(); }
    clear() { this.messages = []; this.sent = false; }
    markSent() { this.sent = true; }

    enter() { this.sent = false; }
    update(dt) { this._t += dt; this.draw(); }

    draw() {
        const ctx = this.ctx;
        const W = this.canvas.width, H = this.canvas.height;
        lcdBackground(ctx, W, H);
        const top = headerBar(ctx, W, this.contact, sigTime());

        // measure bubbles bottom-up so the newest is always visible
        ctx.font = "21px 'Courier New', monospace";
        const lh = 26, padX = 14, padY = 10, gap = 12, maxBubble = W - 130;
        const laid = this.messages.map((m) => {
            const lines = wrapText(ctx, m.t, maxBubble - padX * 2);
            const w = Math.min(maxBubble, Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2);
            const h = lines.length * lh + padY * 2;
            return { m, lines, w, h };
        });

        const bottom = H - 52;
        let y = bottom;
        glow(ctx, true);
        for (let i = laid.length - 1; i >= 0; i--) {
            const b = laid[i];
            y -= b.h;
            if (y < top - b.h) break;
            const x = b.m.me ? W - 16 - b.w : 16;
            // bubble
            ctx.fillStyle = b.m.me ? 'rgba(57,255,20,0.16)' : 'rgba(57,255,20,0.06)';
            ctx.strokeStyle = NEON_DIM;
            ctx.lineWidth = 1.5;
            roundRect(ctx, x, y, b.w, b.h, 10);
            ctx.fill(); ctx.stroke();
            // text
            ctx.fillStyle = NEON;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            b.lines.forEach((ln, j) => ctx.fillText(ln, x + padX, y + padY + j * lh));
            y -= gap;
        }
        glow(ctx, false);

        if (this.sent) sentOverlay(ctx, W, H, this._t);

        footerBar(ctx, W, H, '‹ Reply', this.sent ? 'Sent ✓' : 'Send ›');
        crt(ctx, W, H);
    }

    // ---- share encoding (thread -> URL-safe string and back) ----
    encode() {
        const payload = { c: this.contact, m: this.messages.map((x) => [x.me ? 1 : 0, x.t]) };
        return b64urlEncode(JSON.stringify(payload));
    }
    static decode(str) {
        try {
            const o = JSON.parse(b64urlDecode(str));
            return { contact: o.c, messages: (o.m || []).map((p) => ({ me: !!p[0], t: p[1] })) };
        } catch { return null; }
    }
    applyDecoded(d) {
        if (!d) return;
        this.contact = d.contact || 'CONTACT';
        this.messages = d.messages || [];
        this.sent = false;
    }
}

function sentOverlay(ctx, W, H, t) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H * 0.4, W, H * 0.2);
    glow(ctx, true);
    ctx.fillStyle = NEON;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "bold 34px 'Courier New', monospace";
    const dots = '.'.repeat(1 + (Math.floor(t * 2) % 3));
    ctx.fillText('MESSAGE SENT' + dots, W / 2, H / 2);
    ctx.restore();
}

function sigTime() {
    const d = new Date();
    return '▌▌▌ ' + d.toTimeString().slice(0, 5);
}

function b64urlEncode(s) {
    return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    return decodeURIComponent(escape(atob(s)));
}
