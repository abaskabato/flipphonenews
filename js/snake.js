// Snake on the LCD. Food positions come from a seeded PRNG so two players
// fed the same seed face the identical board — a fair head-to-head challenge.
import { NEON, NEON_DIM, lcdBackground, headerBar, footerBar, crt, mulberry32 } from './lcd.js';

const COLS = 15;
const ROWS = 17;
const START_MS = 150;   // tick interval
const MIN_MS = 70;

export class SnakeApp {
    constructor(canvas, { onGameOver } = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.onGameOver = onGameOver || (() => {});
        this.seed = randomSeed();
        this.target = 0;        // score to beat (0 = freeplay)
        this.by = '';           // challenger name
        this.state = 'menu';    // menu | playing | over
        this._acc = 0;
        this._blink = 0;
        this._reset();
    }

    _reset() {
        this.rng = mulberry32(this.seed);
        const cx = (COLS / 2) | 0, cy = (ROWS / 2) | 0;
        this.snake = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
        this.dir = { x: 1, y: 0 };
        this.next = { x: 1, y: 0 };
        this.score = 0;
        this.tickMs = START_MS;
        this._spawnFood();
    }

    // configure a challenge (or freeplay if target=0)
    configure({ seed, target, by } = {}) {
        if (seed != null) this.seed = seed >>> 0;
        this.target = target || 0;
        this.by = by || '';
        this.state = 'menu';
        this._reset();
    }

    start() {
        if (this.state === 'playing') return;
        this._reset();
        this.state = 'playing';
    }

    enter() { /* shown */ }
    get playing() { return this.state === 'playing'; }

    setDir(x, y) {
        // can't reverse directly
        if (x === -this.dir.x && y === -this.dir.y) return;
        this.next = { x, y };
    }
    onKey(e) {
        const k = e.key;
        if (k === 'ArrowUp' || k === 'w') this.setDir(0, -1);
        else if (k === 'ArrowDown' || k === 's') this.setDir(0, 1);
        else if (k === 'ArrowLeft' || k === 'a') this.setDir(-1, 0);
        else if (k === 'ArrowRight' || k === 'd') this.setDir(1, 0);
        else if (k === ' ' || k === 'Enter') { if (this.state !== 'playing') this.start(); else return; }
        else return;
        e.preventDefault();
    }

    _spawnFood() {
        let f, tries = 0;
        do {
            f = { x: (this.rng() * COLS) | 0, y: (this.rng() * ROWS) | 0 };
            tries++;
        } while (tries < 200 && this.snake.some((s) => s.x === f.x && s.y === f.y));
        this.food = f;
    }

    _step() {
        this.dir = this.next;
        const head = { x: this.snake[0].x + this.dir.x, y: this.snake[0].y + this.dir.y };
        // walls + self collision
        if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS ||
            this.snake.some((s) => s.x === head.x && s.y === head.y)) {
            this.state = 'over';
            this.onGameOver(this.score);
            return;
        }
        this.snake.unshift(head);
        if (head.x === this.food.x && head.y === this.food.y) {
            this.score++;
            this.tickMs = Math.max(MIN_MS, START_MS - this.score * 4);
            this._spawnFood();
        } else {
            this.snake.pop();
        }
    }

    update(dt) {
        this._blink += dt;
        if (this.state === 'playing') {
            this._acc += dt * 1000;
            while (this._acc >= this.tickMs) {
                this._acc -= this.tickMs;
                this._step();
                if (this.state !== 'playing') break;
            }
        }
        this.draw();
    }

    draw() {
        const ctx = this.ctx;
        const W = this.canvas.width, H = this.canvas.height;
        lcdBackground(ctx, W, H);

        const right = this.target ? `${this.score}/${this.target}★` : `${this.score}★`;
        const top = headerBar(ctx, W, 'SNAKE', right);

        // playfield
        const padL = 18, padR = 18, padB = 50;
        const areaW = W - padL - padR;
        const areaH = H - top - 14 - padB;
        const cell = Math.floor(Math.min(areaW / COLS, areaH / ROWS));
        const gridW = cell * COLS, gridH = cell * ROWS;
        const ox = (W - gridW) / 2, oy = top + 14 + (areaH - gridH) / 2;

        ctx.strokeStyle = NEON_DIM;
        ctx.lineWidth = 2;
        ctx.strokeRect(ox - 3, oy - 3, gridW + 6, gridH + 6);

        // food (blinking)
        if ((this._blink * 4 | 0) % 2 === 0 || this.state !== 'playing') {
            ctx.fillStyle = NEON;
            const fx = ox + this.food.x * cell, fy = oy + this.food.y * cell;
            ctx.fillRect(fx + 2, fy + 2, cell - 4, cell - 4);
        }

        // snake
        ctx.fillStyle = NEON;
        ctx.shadowColor = 'rgba(57,255,20,0.6)';
        ctx.shadowBlur = 5;
        this.snake.forEach((s, i) => {
            ctx.globalAlpha = i === 0 ? 1 : 0.85;
            ctx.fillRect(ox + s.x * cell + 1, oy + s.y * cell + 1, cell - 2, cell - 2);
        });
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;

        if (this.state !== 'playing') this._overlay(ctx, W, H);
        footerBar(ctx, W, H, this.by ? `VS ${this.by}` : 'Arrows / D-pad', this.state === 'playing' ? 'Playing' : 'Start ›');
        crt(ctx, W, H);
    }

    _overlay(ctx, W, H) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, H * 0.32, W, H * 0.36);
        ctx.fillStyle = NEON;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(57,255,20,0.7)';
        ctx.shadowBlur = 8;
        if (this.state === 'menu') {
            ctx.font = "bold 30px 'Courier New', monospace";
            if (this.target) {
                ctx.fillText(`BEAT ${this.by || 'RIVAL'}`, W / 2, H * 0.44);
                ctx.font = "bold 40px 'Courier New', monospace";
                ctx.fillText(`${this.target} ★`, W / 2, H * 0.54);
            } else {
                ctx.fillText('PRESS START', W / 2, H * 0.5);
            }
        } else {
            ctx.font = "bold 32px 'Courier New', monospace";
            ctx.fillText('GAME OVER', W / 2, H * 0.42);
            ctx.font = "bold 26px 'Courier New', monospace";
            ctx.fillText(`SCORE ${this.score}`, W / 2, H * 0.52);
            if (this.target) {
                ctx.font = "bold 24px 'Courier New', monospace";
                ctx.fillText(this.score > this.target ? '🏆 YOU WIN!' : 'so close…', W / 2, H * 0.6);
            }
        }
        ctx.shadowBlur = 0;
    }
}

export function randomSeed() {
    return (Math.random() * 0xffffffff) >>> 0;
}
