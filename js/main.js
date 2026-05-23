import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { buildPhone } from './phone.js';
import { NewsTicker, fetchHeadlines } from './news.js';
import { drawKeypad, drawExtScreen, drawExtMessage } from './faces.js';
import { loadSponsor, applySponsor, drawPlaceholder } from './sponsor.js';
import { playFlip } from './audio.js';
import { TextsApp } from './texts.js';
import { SnakeApp, randomSeed } from './snake.js';

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
drawPlaceholder(sponsorC.ctx, sponsorC.tex);

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

// ---------- screen apps ----------
const newsTicker = new NewsTicker(screenC.canvas);
const newsApp = { update: (dt) => newsTicker.update(dt) };
const texts = new TextsApp(screenC.canvas);
const snake = new SnakeApp(screenC.canvas, { onGameOver: onSnakeOver });
const apps = { news: newsApp, texts, snake };
let activeName = 'news';
let activeApp = apps.news;

// ---------- external display state ----------
let extOverride = null; // { title, sub } or null = clock
function refreshExternal() {
    if (extOverride) drawExtMessage(extC.ctx, extC.W, extC.H, extOverride.title, extOverride.sub);
    else drawExtScreen(extC.ctx, extC.W, extC.H, new Date().toTimeString().slice(0, 5));
    extC.tex.needsUpdate = true;
}
refreshExternal();
setInterval(refreshExternal, 30 * 1000);

// ---------- open / close ----------
let open = 0, openTarget = 0, lastDir = 0;
phone.setOpenAmount(0);
function setOpenTarget(v) {
    const closing = v < 0.5 && openTarget > 0.5;
    openTarget = v; lastDir = v;
    if (closing && activeName === 'texts' && texts.messages.length) {
        texts.markSent();
        extOverride = { title: 'MESSAGE', sub: 'SENT' };
        refreshExternal();
    }
    playFlip(v === 1);
}
function toggle() { setOpenTarget(openTarget > 0.5 ? 0 : 1); }
document.getElementById('flipBtn').addEventListener('click', toggle);

// tap the phone to flip (not while playing snake)
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downXY = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downXY = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downXY) return;
    const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]);
    downXY = null;
    if (moved > 6 || (activeName === 'snake' && snake.playing)) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.intersectObject(phone.group, true).length) toggle();
});

// ---------- mode switching ----------
function setApp(name) {
    activeName = name;
    activeApp = apps[name];
    activeApp.enter && activeApp.enter();
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.app === name));
    document.getElementById('panel-texts').hidden = name !== 'texts';
    document.getElementById('panel-snake').hidden = name !== 'snake';
    if (name !== 'news') {
        grabbed = true;                     // stop idle spin
        phone.group.rotation.set(0, 0, 0);  // face the screen forward
        setOpenTarget(1);
    }
    if (name === 'snake' && snake.target) {
        extOverride = { title: `BEAT ${snake.by || 'RIVAL'}`, sub: `${snake.target} ★` };
    } else if (name !== 'texts') {
        extOverride = null;
    }
    refreshExternal();
}
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setApp(b.dataset.app)));

// ---------- keyboard ----------
addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (activeName === 'snake') snake.onKey(e);
});

// ---------- TEXTS panel wiring ----------
const $ = (id) => document.getElementById(id);
$('tx-contact').addEventListener('input', (e) => texts.setContact(e.target.value));
document.querySelectorAll('.tx-preset').forEach((b) => b.addEventListener('click', () => {
    texts.setPreset(b.dataset.preset);
    $('tx-contact').value = texts.contact;
}));
$('tx-add-them').addEventListener('click', () => { texts.add(false, $('tx-msg').value); $('tx-msg').value = ''; });
$('tx-add-me').addEventListener('click', () => { texts.add(true, $('tx-msg').value); $('tx-msg').value = ''; });
$('tx-msg').addEventListener('keydown', (e) => { if (e.key === 'Enter') { texts.add(true, e.target.value); e.target.value = ''; } });
$('tx-undo').addEventListener('click', () => texts.pop());
$('tx-clear').addEventListener('click', () => texts.clear());
$('tx-save').addEventListener('click', savePNG);
$('tx-share').addEventListener('click', () => {
    const url = `${location.origin}${location.pathname}?app=texts&t=${texts.encode()}`;
    copy(url, $('tx-sharemsg'));
});

// ---------- SNAKE panel wiring ----------
$('sn-start').addEventListener('click', () => snake.start());
$('sn-up').addEventListener('click', () => dpad(0, -1));
$('sn-down').addEventListener('click', () => dpad(0, 1));
$('sn-left').addEventListener('click', () => dpad(-1, 0));
$('sn-right').addEventListener('click', () => dpad(1, 0));
function dpad(x, y) { if (!snake.playing) snake.start(); snake.setDir(x, y); }
$('sn-challenge').addEventListener('click', () => {
    const name = ($('sn-name').value || '').trim().slice(0, 16);
    const score = snake.score;
    const url = `${location.origin}${location.pathname}?app=snake&seed=${snake.seed}&target=${score}` +
        (name ? `&by=${encodeURIComponent(name)}` : '');
    copy(url, $('sn-share'));
    $('sn-share').textContent = `Sharing a challenge to beat ${score}★ — link copied!`;
});

function onSnakeOver(score) {
    $('sn-status').textContent = snake.target
        ? (score > snake.target ? `🏆 You beat ${snake.by || 'them'} (${score} > ${snake.target})!`
                                 : `Scored ${score}. Need > ${snake.target}. Try again!`)
        : `Game over — ${score}★. Challenge a friend!`;
}

// ---------- exports / clipboard ----------
function savePNG() {
    renderer.render(scene, camera);
    const a = document.createElement('a');
    a.href = renderer.domElement.toDataURL('image/png');
    a.download = 'flipphonenews.png';
    a.click();
}
function copy(text, el) {
    const done = () => { if (el) { el.textContent = 'Link copied to clipboard ✓'; } };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    else fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    ta.remove(); done();
}

// ---------- boot: URL params (shared thread / challenge) ----------
(function bootFromURL() {
    const q = new URLSearchParams(location.search);
    const app = q.get('app');
    if (app === 'texts' && q.get('t')) {
        const d = TextsApp.decode(q.get('t'));
        if (d) { texts.applyDecoded(d); $('tx-contact').value = texts.contact; }
        setApp('texts');
    } else if (app === 'snake') {
        snake.configure({
            seed: Number(q.get('seed')) || randomSeed(),
            target: Number(q.get('target')) || 0,
            by: q.get('by') || '',
        });
        setApp('snake');
    } else {
        setApp('news');
    }
})();

// ---------- data loads ----------
fetchHeadlines(12).then((t) => newsTicker.setHeadlines(t)).catch(() => {})
    .finally(() => setInterval(() => fetchHeadlines(12).then((t) => newsTicker.setHeadlines(t)).catch(() => {}), 6e5));
loadSponsor().then((data) => applySponsor(data, {
    ctx: sponsorC.ctx, tex: sponsorC.tex, mat: phone.sponsorMat,
    loader: new THREE.TextureLoader(), domTag: document.getElementById('sponsorTag'),
}));

// ---------- render loop ----------
const clock = new THREE.Clock();
let booted = false;
function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    open += (openTarget - open) * Math.min(1, 9 * dt);
    if (Math.abs(openTarget - open) < 0.001) open = openTarget;
    phone.setOpenAmount(open);

    if (activeName === 'news' && !grabbed) phone.group.rotation.y += dt * 0.18;
    controls.enableRotate = !(activeName === 'snake' && snake.playing);

    activeApp.update(dt);
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

// debug/test hook
window.FPN = {
    phone, controls, setApp, snake, texts,
    setOpen: (v) => setOpenTarget(v),
    stopIdle: () => { grabbed = true; },
};
