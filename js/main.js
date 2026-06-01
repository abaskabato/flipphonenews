import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { buildPhone } from './phone.js';
import { drawKeypad, drawExtMessage } from './faces.js';
import { playFlip } from './audio.js';
import { Radio } from './radio.js';
import { Podcasts } from './podcasts.js';

// ---------- renderer / scene ----------
const canvasEl = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const stage = canvasEl.parentElement; // the .hero section
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, stage.clientWidth / stage.clientHeight, 0.1, 100);
camera.position.set(0.1, 0.25, 4.6);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x202028, 0.45));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
keyLight.position.set(2.6, 4.2, 3.4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 1; keyLight.shadow.camera.far = 14;
keyLight.shadow.camera.left = -3; keyLight.shadow.camera.right = 3;
keyLight.shadow.camera.top = 3; keyLight.shadow.camera.bottom = -3;
keyLight.shadow.bias = -0.0004;
scene.add(keyLight);
const rim = new THREE.DirectionalLight(0x88aaff, 0.9);
rim.position.set(-3, 1.5, -2.5);
scene.add(rim);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.32 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.55;
ground.receiveShadow = true;
scene.add(ground);

// ---------- canvases / textures ----------
function makeCanvasTexture(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return { canvas: c, ctx: c.getContext('2d'), tex, W: w, H: h };
}
const screenC = makeCanvasTexture(512, 576);
const keypadC = makeCanvasTexture(540, 760);
const extC = makeCanvasTexture(360, 150);
const sponsorC = makeCanvasTexture(512, 280);

drawKeypad(keypadC.ctx, keypadC.W, keypadC.H);
keypadC.tex.needsUpdate = true;
drawBackPanel(sponsorC.ctx, sponsorC.W, sponsorC.H);
sponsorC.tex.needsUpdate = true;

const phone = buildPhone({
    screenTex: screenC.tex, keypadTex: keypadC.tex,
    extScreenTex: extC.tex, sponsorTex: sponsorC.tex,
});
phone.group.position.y = -0.28; // sit lower so the hero copy band stays clear of the screen
scene.add(phone.group);

// ---------- controls ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.enableZoom = false; // let the page scroll over the canvas
controls.minDistance = 2.6;
controls.maxDistance = 7;
controls.minPolarAngle = 0.55;
controls.maxPolarAngle = Math.PI - 0.7;
controls.target.set(0, -0.05, 0);
controls.addEventListener('start', () => { grabbed = true; });
let grabbed = false;

// ---------- audio + the one app ----------
const audioEl = document.createElement('audio');
audioEl.id = 'radio-audio';
// no crossOrigin: nothing reads the audio buffer (the EQ is synthesized), and
// most podcast CDNs / radio streams don't send CORS headers, so requesting
// them anonymously would block playback.
audioEl.preload = 'none';
document.body.appendChild(audioEl);

// Two "bands" share one screen + one <audio>: live RADIO and on-demand PODCASTS.
const radio = new Radio(screenC.canvas);
const podcasts = new Podcasts(screenC.canvas);
radio.setAudio(audioEl);
podcasts.setAudio(audioEl);
let app = radio;            // the active band
let band = 'radio';
radio.active = true;
podcasts.active = false;

function setBand(name) {
    const next = name === 'podcast' ? podcasts : radio;
    if (next === app) return;
    app.exit();             // stops playback on the band we're leaving
    app.active = false;
    app = next;
    band = name;
    app.active = true;
    app.enter();
    updateBandUI();
    refreshExternal();
}
function updateBandUI() {
    bandRadioBtn?.classList.toggle('on', band === 'radio');
    bandPodsBtn?.classList.toggle('on', band === 'podcast');
    bandRadioBtn?.setAttribute('aria-pressed', String(band === 'radio'));
    bandPodsBtn?.setAttribute('aria-pressed', String(band === 'podcast'));
}

// ---------- external display ----------
function refreshExternal() {
    const playing = app.status === 'live';
    const title = band === 'podcast' ? 'PODCAST' : 'RADIO';
    drawExtMessage(extC.ctx, extC.W, extC.H, title, playing ? '● ON AIR' : app.genre.toUpperCase());
    extC.tex.needsUpdate = true;
}
refreshExternal();
setInterval(refreshExternal, 2000);

// ---------- open / close ----------
let open = 0, openTarget = 0;
phone.setOpenAmount(0);
function setOpenTarget(v) {
    openTarget = v;
    playFlip(v === 1);
}
function toggle() { setOpenTarget(openTarget > 0.5 ? 0 : 1); }
document.getElementById('flipBtn').addEventListener('click', toggle);

// tap the phone: when open, a tap on the keypad presses that key; otherwise flip
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downXY = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downXY = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downXY) return;
    const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]);
    downXY = null;
    if (moved > 6) return; // a drag, not a tap
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(phone.group, true);
    if (!hits.length) return;
    if (open > 0.5) {
        const kp = hits.find((h) => h.object === phone.keypad && h.uv);
        if (kp) { const key = keyAtUV(kp.uv.x, kp.uv.y); if (key) { app.keypadPress(key); return; } }
    }
    toggle();
});

// map a UV hit on the keypad texture to a physical key (mirrors faces.js layout)
function keyAtUV(u, v) {
    const W = 540, H = 760, cx = W / 2;
    const x = u * W, y = (1 - v) * H;
    const dY = 110, dR = 78;
    const dx = x - cx, dy = y - dY, dist = Math.hypot(dx, dy);
    if (dist <= 34) return 'OK';
    if (dist <= dR + 8) return Math.abs(dy) >= Math.abs(dx) ? (dy < 0 ? 'UP' : 'DOWN') : (dx < 0 ? 'LEFT' : 'RIGHT');
    const callY = dY + dR + 28;
    if (y >= callY && y <= callY + 46) {
        if (x >= cx - 150 && x <= cx - 10) return 'SEND';
        if (x >= cx + 10 && x <= cx + 150) return 'END';
    }
    const gridTop = callY + 70, cols = 3, gap = 18, bw = (W - 80 - gap * 2) / cols, bh = 76;
    const labels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
    for (let i = 0; i < 12; i++) {
        const c = i % cols, r = (i / cols) | 0;
        const kx = 40 + c * (bw + gap), ky = gridTop + r * (bh + gap);
        if (x >= kx && x <= kx + bw && y >= ky && y <= ky + bh) return labels[i];
    }
    return null;
}

// ---------- physical keyboard ----------
addEventListener('keydown', (e) => {
    if (e.target.tagName === 'TEXTAREA' || (e.target.tagName === 'INPUT' && e.target !== hiddenInput)) return;
    if (open < 0.5) return; // controls only matter when the phone is open
    if (e.key === 'Tab') { setBand(band === 'radio' ? 'podcast' : 'radio'); e.preventDefault(); return; }
    app.handleKey(e);
});

// ---------- mobile keyboard: hidden input feeding the search box ----------
const hiddenInput = document.createElement('input');
hiddenInput.type = 'text';
hiddenInput.id = 'hidden-input';
hiddenInput.autocomplete = 'off'; hiddenInput.autocorrect = 'off';
hiddenInput.autocapitalize = 'off'; hiddenInput.spellcheck = false;
Object.assign(hiddenInput.style, {
    position: 'fixed', left: '-9999px', top: '-9999px',
    opacity: '0', width: '1px', height: '1px', pointerEvents: 'none',
});
document.body.appendChild(hiddenInput);
hiddenInput.addEventListener('input', () => {
    if (!hiddenInput.value) return;
    app.typeString(hiddenInput.value);
    hiddenInput.value = '';
});
hiddenInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Escape') app.handleKey(e);
});
// when search opens on a touch device, pop the soft keyboard
app.onSearchOpen = () => { if (matchMedia('(pointer: coarse)').matches) hiddenInput.focus(); };
renderer.domElement.addEventListener('pointerdown', () => {
    if (open > 0.5 && app.mode === 'search') hiddenInput.focus();
});

// ---------- on-screen controls ----------
const hud = {
    search: document.getElementById('searchBtn'),
};
const bandRadioBtn = document.getElementById('bandRadio');
const bandPodsBtn = document.getElementById('bandPods');
bandRadioBtn?.addEventListener('click', () => { ensureOpen(); setBand('radio'); });
bandPodsBtn?.addEventListener('click', () => { ensureOpen(); setBand('podcast'); });
function ensureOpen() { if (openTarget < 0.5) setOpenTarget(1); }
hud.search?.addEventListener('click', () => {
    ensureOpen();
    if (app.mode === 'search') app.submitSearch(); else app.openSearch();
    hiddenInput.focus();
});

// ---------- boot ----------
app.enter();

// ---------- render loop ----------
const clock = new THREE.Clock();
let booted = false;
function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    open += (openTarget - open) * Math.min(1, 9 * dt);
    if (Math.abs(openTarget - open) < 0.001) open = openTarget;
    phone.setOpenAmount(open);

    // idle spin only while closed; once open (in use / playing) settle facing
    // front so the screen stays readable and the keypad stays tappable
    if (open < 0.5) {
        if (!grabbed) phone.group.rotation.y += dt * 0.18;
    } else {
        phone.group.rotation.y += (0 - phone.group.rotation.y) * Math.min(1, 5 * dt);
    }

    app.update(dt);
    screenC.tex.needsUpdate = true;

    controls.update();
    renderer.render(scene, camera);

    if (!booted) { booted = true; document.getElementById('loader').classList.add('hidden'); }
}
animate();

function sizeToStage() {
    const w = stage.clientWidth, h = stage.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}
addEventListener('resize', sizeToStage);
new ResizeObserver(sizeToStage).observe(stage);

// ---------- back-of-lid printed panel ----------
function drawBackPanel(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#16161f'); g.addColorStop(1, '#0a0a10');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#39ff14';
    ctx.shadowColor = 'rgba(57,255,20,0.6)'; ctx.shadowBlur = 12;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = "bold 50px 'Courier New', monospace";
    ctx.fillText('WORLD', W / 2, H * 0.34);
    ctx.fillText('RADIO', W / 2, H * 0.56);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = "20px 'Courier New', monospace";
    ctx.fillText('the whole planet, one dial', W / 2, H * 0.82);
}

// debug/test hook
window.DD = {
    get app() { return app; }, radio, podcasts, audio: audioEl, phone,
    setBand, setOpen: (v) => setOpenTarget(v), stopIdle: () => { grabbed = true; },
};
