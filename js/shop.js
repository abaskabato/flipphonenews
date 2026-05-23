// Shop — browse eBay flip phones on the phone screen, buy with one key.
import { NEON, NEON_DIM, lcdBackground, headerBar, footerBar, crt, wrapText } from './lcd.js';

const API_URL = '/api/search-products?q=flip+phone';

export class ShopApp {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.products = [];
        this.idx = 0;
        this.loaded = false;
        this.source = '';
    }

    async enter() {
        if (!this.loaded) await this.fetchProducts();
        this.draw();
    }

    async fetchProducts() {
        try {
            const res = await fetch(API_URL);
            const json = await res.json();
            this.products = json.products || [];
            this.source = json.source || '';
        } catch (e) {
            this.products = [];
        }
        this.loaded = true;
        this.idx = 0;
    }

    refresh() {
        this.loaded = false;
        return this.enter();
    }

    get current() {
        return this.products[this.idx] || null;
    }

    get total() {
        return this.products.length;
    }

    prev() {
        if (!this.total) return;
        this.idx = (this.idx - 1 + this.total) % this.total;
        this.draw();
    }

    next() {
        if (!this.total) return;
        this.idx = (this.idx + 1) % this.total;
        this.draw();
    }

    buy() {
        const p = this.current;
        if (p && p.buyLink) {
            window.open(p.buyLink, '_blank', 'noopener');
        }
    }

    update() {}

    draw() {
        const { ctx, canvas, current, idx, total, source } = this;
        const W = canvas.width, H = canvas.height;

        lcdBackground(ctx, W, H);

        if (!total) {
            ctx.fillStyle = NEON;
            ctx.font = "bold 26px 'Courier New', monospace";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('No listings found', W / 2, H / 2 - 14);
            ctx.font = "18px 'Courier New', monospace";
            ctx.fillText(source === 'fallback' ? '(static data)' : '', W / 2, H / 2 + 20);
            crt(ctx, W, H);
            return;
        }

        const label = source === 'ebay' ? 'EBAY' : 'SHOP';
        headerBar(ctx, W, label, `${idx + 1}/${total}`);

        if (!current) return;

        // condition badge
        const cond = current.condition || '';
        if (cond) {
            ctx.font = "bold 16px 'Courier New', monospace";
            ctx.textBaseline = 'top';
            ctx.textAlign = 'right';
            ctx.fillStyle = NEON_DIM;
            ctx.fillText(cond, W - 22, 70);
        }

        // product name (wrapped, 2 lines max)
        ctx.fillStyle = NEON;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.font = "bold 24px 'Courier New', monospace";
        const nameLines = wrapText(ctx, current.name || '', W - 44).slice(0, 2);
        nameLines.forEach((line, i) => {
            ctx.fillText(line, 22, 70 + i * 30);
        });

        const nameBottom = 70 + nameLines.length * 30 + 8;

        // price
        ctx.font = "bold 32px 'Courier New', monospace";
        ctx.textAlign = 'right';
        const priceY = Math.max(nameBottom + 4, 72);
        ctx.fillText(current.price || '', W - 22, priceY);

        const priceBottom = priceY + 40;

        // divider
        ctx.strokeStyle = NEON_DIM;
        ctx.lineWidth = 2;
        const divY = Math.max(priceBottom + 4, 152);
        ctx.beginPath();
        ctx.moveTo(22, divY);
        ctx.lineTo(W - 22, divY);
        ctx.stroke();

        // description — use title again as description (eBay gives no long desc)
        ctx.font = "18px 'Courier New', monospace";
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillStyle = NEON;
        const descLines = wrapText(ctx, (current.description || current.name || ''), W - 44);
        descLines.slice(0, 8).forEach((line, i) => {
            ctx.fillText(line, 22, divY + 14 + i * 24);
        });

        footerBar(ctx, W, H, `◀ PREV`, `SPACE=BUY  NEXT ▶`);
        crt(ctx, W, H);
    }
}
