import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { buildPhone } from './phone.js';
import { drawKeypad, drawExtScreen, drawExtMessage } from './faces.js';
import { loadSponsor, applySponsor, drawPlaceholder } from './sponsor.js';
import { playFlip } from './audio.js';
import { NostrChat } from './nostr-chat.js';
import { NewsTicker, fetchHeadlines } from './news.js';
import { SnakeApp } from './snake.js';
import { TextsApp } from './texts.js';
import { ShopApp } from './shop.js';

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
const chat = new NostrChat(screenC.canvas);
const news = new NewsTicker(screenC.canvas);
const snake = new SnakeApp(screenC.canvas);
const texts = new TextsApp(screenC.canvas);
const shop = new ShopApp(screenC.canvas);

const apps = { news, chat, snake, texts, shop };
let activeName = 'news';
let activeApp = apps.news;

const extLabels = {
    news: { title: 'NEWS', sub: 'HN Top' },
    chat: { title: 'CHAT', sub: '' },
    snake: { title: 'SNAKE', sub: '' },
    texts: { title: 'TEXTS', sub: '' },
    shop: { title: 'SHOP', sub: 'Flip Phones' },
};

function switchApp(name) {
    if (name === activeName) return;
    if (activeApp && activeApp.exit) activeApp.exit();
    activeName = name;
    activeApp = apps[name];
    if (activeApp && activeApp.enter) activeApp.enter();
    extOverride = extLabels[name] || null;
    if (name === 'chat') extOverride.sub = chat.gh ? `#${chat.gh}` : '';
    refreshExternal();
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.app === name));
}

document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => switchApp(t.dataset.app));
});

// fetch HN headlines in background
fetchHeadlines().then(h => { news.setHeadlines(h); }).catch(() => {});

// ---------- external display state ----------
let extOverride = null;
function refreshExternal() {
    if (extOverride) drawExtMessage(extC.ctx, extC.W, extC.H, extOverride.title, extOverride.sub);
    else drawExtScreen(extC.ctx, extC.W, extC.H, new Date().toTimeString().slice(0, 5));
    extC.tex.needsUpdate = true;
}
refreshExternal();
setInterval(refreshExternal, 30 * 1000);

// refresh news headlines every 10 minutes
setInterval(() => {
    fetchHeadlines().then(h => { news.setHeadlines(h); }).catch(() => {});
}, 600000);

// ---------- open / close ----------
let open = 0, openTarget = 0, lastDir = 0;
phone.setOpenAmount(0);
function setOpenTarget(v) {
    const closing = v < 0.5 && openTarget > 0.5;
    openTarget = v; lastDir = v;
    if (closing) {
        if (activeApp === chat && chat.draft) {
            chat.send(chat.draft);
            chat.draft = '';
        }
        hiddenInput.blur();
    }
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

// Focus hidden input on canvas tap for mobile keyboard (only when open)
renderer.domElement.addEventListener('pointerdown', () => {
    if (open > 0.5) hiddenInput.focus();
});

hiddenInput.addEventListener('input', () => {
    if (!hiddenInput.value) return;
    if (activeApp === chat) {
        chat.appendToDraft(hiddenInput.value);
    } else if (activeApp === texts) {
        texts.add(true, hiddenInput.value);
    }
    hiddenInput.value = '';
});
hiddenInput.addEventListener('keydown', (e) => {
    if (activeApp === chat && (e.key === 'Enter' || e.key === 'Backspace')) {
        chat.handleKeyDown(e);
    }
});

function routeKey(e) {
    if (activeApp === chat) {
        chat.handleKeyDown(e);
    } else if (activeApp === snake) {
        snake.onKey(e);
    } else if (activeApp === shop) {
        if (e.key === 'ArrowLeft') { shop.prev(); e.preventDefault(); }
        else if (e.key === 'ArrowRight') { shop.next(); e.preventDefault(); }
        else if (e.key === ' ' || e.key === 'Enter') { shop.buy(); e.preventDefault(); }
    }
}

addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    routeKey(e);
});

// ---------- boot apps ----------
chat.enter(); // connect in background
switchApp('news');

// ---------- data loads ----------
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

    if (activeName !== 'snake' && !grabbed) phone.group.rotation.y += dt * 0.18;

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
    chat,
    setOpen: (v) => setOpenTarget(v),
    stopIdle: () => { grabbed = true; },
};
