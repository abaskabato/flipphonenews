import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { buildPhone } from './phone.js';
import { drawKeypad, drawExtMessage } from './faces.js';
import { playFlip } from './audio.js';
import { DeadDrop } from './deaddrop.js';

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

// ---------- the one app ----------
const app = new DeadDrop(screenC.canvas);

// ---------- external display ----------
function refreshExternal() {
    drawExtMessage(extC.ctx, extC.W, extC.H, 'DEAD DROP', app.place || '');
    extC.tex.needsUpdate = true;
}
refreshExternal();
setInterval(refreshExternal, 5 * 1000);

// ---------- open / close ----------
let open = 0, openTarget = 0;
phone.setOpenAmount(0);
function setOpenTarget(v) {
    openTarget = v;
    if (v < 0.5) hiddenInput.blur();
    else hiddenInput.focus();
    playFlip(v === 1);
}
function toggle() { setOpenTarget(openTarget > 0.5 ? 0 : 1); }
document.getElementById('flipBtn').addEventListener('click', toggle);

// tap the phone to flip
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downXY = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downXY = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downXY) return;
    const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]);
    downXY = null;
    if (moved > 6) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.intersectObject(phone.group, true).length) toggle();
});

// ---------- mobile keyboard: hidden input that captures keystrokes ----------
const hiddenInput = document.createElement('input');
hiddenInput.type = 'text';
hiddenInput.id = 'hidden-input';
hiddenInput.autocomplete = 'off';
hiddenInput.autocorrect = 'off';
hiddenInput.autocapitalize = 'off';
hiddenInput.spellcheck = false;
Object.assign(hiddenInput.style, {
    position: 'fixed', left: '-9999px', top: '-9999px',
    opacity: '0', width: '1px', height: '1px', pointerEvents: 'none',
});
document.body.appendChild(hiddenInput);

renderer.domElement.addEventListener('pointerdown', () => {
    if (open > 0.5 && app.state === 'compose') hiddenInput.focus();
});
hiddenInput.addEventListener('input', () => {
    if (!hiddenInput.value) return;
    app.appendText(hiddenInput.value);
    hiddenInput.value = '';
});
hiddenInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Backspace') app.handleKey(e);
});

addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (open < 0.5) return; // keys only matter when the phone is open
    app.handleKey(e);
});

// ---------- on-screen controls (mobile-friendly) ----------
const hud = {
    leave: document.getElementById('leaveBtn'),
    up: document.getElementById('upBtn'),
    down: document.getElementById('downBtn'),
    back: document.getElementById('backBtn'),
    ok: document.getElementById('okBtn'),
};
function ensureOpen() { if (openTarget < 0.5) setOpenTarget(1); }
hud.leave?.addEventListener('click', () => { ensureOpen(); app.startCompose(); if (matchMedia('(pointer: coarse)').matches) hiddenInput.focus(); });
hud.up?.addEventListener('click', () => { ensureOpen(); app.nav('up'); });
hud.down?.addEventListener('click', () => { ensureOpen(); app.nav('down'); });
hud.back?.addEventListener('click', () => { ensureOpen(); app.back(); });
hud.ok?.addEventListener('click', () => { ensureOpen(); app.primary(); if (app.state === 'compose' && matchMedia('(pointer: coarse)').matches) hiddenInput.focus(); });

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

    if (!grabbed && open < 0.5) phone.group.rotation.y += dt * 0.18;

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

// ---------- back-of-lid printed panel (replaces sponsor billboard) ----------
function drawBackPanel(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#16161f'); g.addColorStop(1, '#0a0a10');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#39ff14';
    ctx.shadowColor = 'rgba(57,255,20,0.6)'; ctx.shadowBlur = 12;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = "bold 52px 'Courier New', monospace";
    ctx.fillText('DEAD', W / 2, H * 0.34);
    ctx.fillText('DROP', W / 2, H * 0.56);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = "20px 'Courier New', monospace";
    ctx.fillText('leave a message where you stand', W / 2, H * 0.82);
}

// debug/test hook
window.DD = { app, setOpen: (v) => setOpenTarget(v), stopIdle: () => { grabbed = true; } };
